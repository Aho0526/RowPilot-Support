/**
 * Document Correction Support — Cloudflare Worker
 * Hono フレームワークを使用した REST API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// ── CORS ──────────────────────────────────────────────────────
app.use('/document/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Cache-Control', 'Pragma'],
  maxAge: 86400,
}));

app.use('/sop/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Cache-Control', 'Pragma'],
  maxAge: 86400,
}));

// ── Cache-Control (キャッシュ無効化) ───────────────────────────
app.use('/document/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

app.use('/sop/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

// ── Database Migration (起動時自動マイグレーション) ──────────────
const runMigration = async (db) => {
  if (!db) return;
  try {
    const check = await db.prepare("PRAGMA table_info(reviews)").all();
    const cols = check.results.map(col => col.name);

    const stmts = [];
    if (!cols.includes('teacher_name')) {
      stmts.push(db.prepare("ALTER TABLE reviews ADD COLUMN teacher_name TEXT DEFAULT ''"));
      console.log("Migration: adding teacher_name column");
    }
    if (!cols.includes('device_id')) {
      stmts.push(db.prepare("ALTER TABLE reviews ADD COLUMN device_id TEXT NOT NULL DEFAULT ''"));
      console.log("Migration: adding device_id column");
    }
    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    // 文化祭 人数カウントシステム用テーブル作成
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS count_records (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        people_count INTEGER NOT NULL DEFAULT 1,
        play_count   INTEGER NOT NULL DEFAULT 1,
        unit_price   INTEGER NOT NULL DEFAULT 100,
        total_amount INTEGER NOT NULL DEFAULT 100,
        note         TEXT    NOT NULL DEFAULT '',
        device_id    TEXT    NOT NULL DEFAULT '',
        game_type    TEXT    NOT NULL DEFAULT 'コインピッチ',
        created_at   TEXT    NOT NULL DEFAULT (datetime('now', '+9 hours'))
      )
    `).run();

    const countCols = (await db.prepare("PRAGMA table_info(count_records)").all()).results.map(c => c.name);
    if (!countCols.includes('game_type')) {
      await db.prepare("ALTER TABLE count_records ADD COLUMN game_type TEXT NOT NULL DEFAULT 'コインピッチ'").run();
    }

    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_count_records_created_at ON count_records(created_at)
    `).run();
  } catch (e) {
    console.warn("Migration check skipped or failed:", e);
  }
};

app.use('/document/api/*', async (c, next) => {
  await runMigration(c.env.DB);
  await next();
});

app.use('/sop/api/*', async (c, next) => {
  await runMigration(c.env.DB);
  await next();
});

// ── Utility: JSON エラーレスポンス ────────────────────────────
const err = (c, status, message) => c.json({ error: message }, status);

// ================================================================
// エッセイ
// ================================================================

/**
 * GET /document/api/essays/:id
 * エッセイ取得（最新の draft content + 最新バージョン情報）
 */
app.get('/document/api/essays/:id', async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  let essay = await db.prepare('SELECT * FROM essays WHERE id = ?').bind(id).first();

  if (!essay) {
    // 初回アクセス時にデフォルトエッセイを生成
    await db.prepare(
      `INSERT INTO essays (id, title, current_content, updated_at)
       VALUES (?, '課題論文', '', datetime('now'))`
    ).bind(id).run();
    essay = { id, title: '課題論文', current_content: '', updated_at: new Date().toISOString() };
  }

  // 最新のバージョン（レビュー依頼済みスナップショット）を取得
  const latestVersion = await db.prepare(
    `SELECT ev.*
     FROM essay_versions ev
     WHERE ev.essay_id = ?
     ORDER BY ev.created_at DESC
     LIMIT 1`
  ).bind(id).first();

  // そのバージョンに紐づく最初のレビューIDを取得（後方互換用）
  let latestVersionWithReview = null;
  if (latestVersion) {
    const firstReview = await db.prepare(
      `SELECT id FROM reviews WHERE version_id = ? ORDER BY created_at ASC LIMIT 1`
    ).bind(latestVersion.id).first();
    latestVersionWithReview = {
      ...latestVersion,
      review_id: firstReview?.id ?? null,
    };
  }

  return c.json({ essay, latestVersion: latestVersionWithReview ?? null });
});

/**
 * PATCH /document/api/essays/:id
 * 自動保存（下書き content を上書き）
 */
app.patch('/document/api/essays/:id', async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, 'Invalid JSON');
  }

  if (typeof body.content !== 'string') return err(c, 400, 'content is required');

  const result = await db.prepare(
    `UPDATE essays SET current_content = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.content, id).run();

  if (result.meta.changes === 0) return err(c, 404, 'Essay not found');

  return c.json({ success: true, updatedAt: new Date().toISOString() });
});

// ================================================================
// バージョン（レビュー依頼）
// ================================================================

/**
 * POST /document/api/essays/:id/versions
 * レビュー依頼 — 現在の下書きをスナップショットとして保存
 * 注意: 個別レビューはフロントエンドが device_id を持って POST /reviews で作成する。
 *       バージョン作成時にデフォルトレビューは生成しない（複数先生対応のため）。
 */
app.post('/document/api/essays/:id/versions', async (c) => {
  const db = c.env.DB;
  const essayId = parseInt(c.req.param('id'));

  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const essay = await db.prepare('SELECT * FROM essays WHERE id = ?').bind(essayId).first();
  if (!essay) return err(c, 404, 'Essay not found');

  if (!essay.current_content.trim()) {
    return err(c, 400, 'Essay content is empty');
  }

  const result = await db.prepare(
    `INSERT INTO essay_versions (essay_id, content, created_at)
     VALUES (?, ?, datetime('now'))`
  ).bind(essayId, essay.current_content).run();

  const versionId = result.meta.last_row_id;

  return c.json({ versionId }, 201);
});

/**
 * GET /document/api/essays/:id/versions
 * バージョン一覧（降順）
 */
app.get('/document/api/essays/:id/versions', async (c) => {
  const db = c.env.DB;
  const essayId = parseInt(c.req.param('id'));

  const versions = await db.prepare(
    `SELECT
       ev.id,
       ev.essay_id,
       ev.created_at,
       (SELECT id FROM reviews WHERE version_id = ev.id ORDER BY created_at ASC LIMIT 1) AS review_id,
       (SELECT submitted_at FROM reviews WHERE version_id = ev.id ORDER BY created_at ASC LIMIT 1) AS submitted_at,
       (SELECT markdown_comment FROM reviews WHERE version_id = ev.id ORDER BY created_at ASC LIMIT 1) AS markdown_comment
     FROM essay_versions ev
     WHERE ev.essay_id = ?
     ORDER BY ev.created_at DESC`
  ).bind(essayId).all();

  return c.json(versions.results);
});

/**
 * GET /document/api/essays/:id/versions/:vid
 * 特定バージョンのエッセイ内容を取得（履歴表示用）
 */
app.get('/document/api/essays/:id/versions/:vid', async (c) => {
  const db = c.env.DB;
  const versionId = parseInt(c.req.param('vid'));

  const version = await db.prepare(
    'SELECT * FROM essay_versions WHERE id = ?'
  ).bind(versionId).first();

  if (!version) return err(c, 404, 'Version not found');

  return c.json(version);
});

// ================================================================
// レビュー
// ================================================================

/**
 * GET /document/api/reviews?version_id=:id[&device_id=:did]
 * 指定バージョンの全レビュー取得（チェック項目含む）
 * device_id を渡すと、該当端末のレビューを my_review フラグ付きで返す
 */
app.get('/document/api/reviews', async (c) => {
  const db = c.env.DB;
  const versionId = c.req.query('version_id');
  const deviceId = c.req.query('device_id') || '';
  if (!versionId) return err(c, 400, 'version_id is required');

  const reviews = await db.prepare(
    `SELECT * FROM reviews WHERE version_id = ? ORDER BY created_at ASC`
  ).bind(versionId).all();

  const results = [];
  for (const review of reviews.results) {
    const items = await db.prepare(
      `SELECT checklist_key, checked FROM review_items WHERE review_id = ?`
    ).bind(review.id).all();

    const itemMap = {};
    for (const row of items.results) {
      itemMap[row.checklist_key] = row.checked === 1;
    }
    results.push({
      ...review,
      itemMap,
      is_mine: deviceId !== '' && review.device_id === deviceId,
    });
  }

  return c.json(results);
});

/**
 * POST /document/api/reviews
 * 新しいレビュー（添削者）の追加
 * device_id ごとに1バージョンにつき1つのみ作成可能
 */
app.post('/document/api/reviews', async (c) => {
  const db = c.env.DB;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, 'Invalid JSON');
  }

  const { version_id, teacher_name, device_id } = body;
  if (!version_id) return err(c, 400, 'version_id is required');

  // device_id が指定されている場合、同一バージョンへの重複作成をチェック
  if (device_id) {
    const existing = await db.prepare(
      `SELECT id FROM reviews WHERE version_id = ? AND device_id = ?`
    ).bind(version_id, device_id).first();
    if (existing) {
      // 既存のレビューをそのまま返す（チェック項目含む）
      const items = await db.prepare(
        `SELECT checklist_key, checked FROM review_items WHERE review_id = ?`
      ).bind(existing.id).all();
      const itemMap = {};
      for (const row of items.results) {
        itemMap[row.checklist_key] = row.checked === 1;
      }
      const rev = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(existing.id).first();
      return c.json({ ...rev, itemMap, is_mine: true }, 200);
    }
  }

  const result = await db.prepare(
    `INSERT INTO reviews (version_id, teacher_name, device_id, markdown_comment, created_at)
     VALUES (?, ?, ?, '', datetime('now'))`
  ).bind(version_id, teacher_name || '', device_id || '').run();

  return c.json({
    id: result.meta.last_row_id,
    version_id,
    teacher_name: teacher_name || '',
    device_id: device_id || '',
    markdown_comment: '',
    submitted_at: null,
    itemMap: {},
    is_mine: true,
  }, 201);
});

/**
 * PATCH /document/api/reviews/:id
 * レビュー更新（添削者名 + コメント + チェック項目）
 * 提出済みの場合は 403 を返す
 */
app.patch('/document/api/reviews/:id', async (c) => {
  const db = c.env.DB;
  const reviewId = parseInt(c.req.param('id'));

  // 提出済みチェック
  const review = await db.prepare('SELECT submitted_at FROM reviews WHERE id = ?').bind(reviewId).first();
  if (!review) return err(c, 404, 'Review not found');
  if (review.submitted_at) return err(c, 403, 'Review already submitted');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, 'Invalid JSON');
  }

  const stmts = [];

  // 添削者名更新
  if (typeof body.teacher_name === 'string') {
    stmts.push(
      db.prepare(`UPDATE reviews SET teacher_name = ? WHERE id = ?`)
        .bind(body.teacher_name, reviewId)
    );
  }

  // コメント更新
  if (typeof body.markdown_comment === 'string') {
    stmts.push(
      db.prepare(`UPDATE reviews SET markdown_comment = ? WHERE id = ?`)
        .bind(body.markdown_comment, reviewId)
    );
  }

  // チェック項目更新（upsert）
  if (body.items && Array.isArray(body.items)) {
    for (const item of body.items) {
      stmts.push(
        db.prepare(
          `INSERT INTO review_items (review_id, checklist_key, checked)
           VALUES (?, ?, ?)
           ON CONFLICT(review_id, checklist_key) DO UPDATE SET checked = excluded.checked`
        ).bind(reviewId, item.key, item.checked ? 1 : 0)
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return c.json({ success: true });
});

/**
 * POST /document/api/reviews/:id/submit
 * レビュー提出確定（submitted_at をセット）
 */
app.post('/document/api/reviews/:id/submit', async (c) => {
  const db = c.env.DB;
  const reviewId = parseInt(c.req.param('id'));

  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const review = await db.prepare('SELECT submitted_at FROM reviews WHERE id = ?').bind(reviewId).first();
  if (!review) return err(c, 404, 'Review not found');
  if (review.submitted_at) return err(c, 400, 'Already submitted');

  await db.prepare(
    `UPDATE reviews SET submitted_at = datetime('now') WHERE id = ?`
  ).bind(reviewId).run();

  return c.json({ success: true });
});

// ================================================================
// 志願理由書 (SOP) API — /sop/api/* ルート
// 同じ D1 データベース (essays, essay_versions, reviews) を使用
// essay_id = 2 が志願理由書用エントリ
// ================================================================

/** GET /sop/api/essays/:id */
app.get('/sop/api/essays/:id', async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  let essay = await db.prepare('SELECT * FROM essays WHERE id = ?').bind(id).first();

  if (!essay) {
    await db.prepare(
      `INSERT INTO essays (id, title, current_content, updated_at)
       VALUES (?, '志願理由書', '', datetime('now'))`
    ).bind(id).run();
    essay = { id, title: '志願理由書', current_content: '', updated_at: new Date().toISOString() };
  }

  const latestVersion = await db.prepare(
    `SELECT ev.*
     FROM essay_versions ev
     WHERE ev.essay_id = ?
     ORDER BY ev.created_at DESC
     LIMIT 1`
  ).bind(id).first();

  let latestVersionWithReview = null;
  if (latestVersion) {
    const firstReview = await db.prepare(
      `SELECT id FROM reviews WHERE version_id = ? ORDER BY created_at ASC LIMIT 1`
    ).bind(latestVersion.id).first();
    latestVersionWithReview = {
      ...latestVersion,
      review_id: firstReview?.id ?? null,
    };
  }

  return c.json({ essay, latestVersion: latestVersionWithReview ?? null });
});

/** PATCH /sop/api/essays/:id */
app.patch('/sop/api/essays/:id', async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, 'Invalid JSON');
  }

  if (typeof body.content !== 'string') return err(c, 400, 'content is required');

  const result = await db.prepare(
    `UPDATE essays SET current_content = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.content, id).run();

  if (result.meta.changes === 0) return err(c, 404, 'Essay not found');

  return c.json({ success: true, updatedAt: new Date().toISOString() });
});

/** POST /sop/api/essays/:id/versions */
app.post('/sop/api/essays/:id/versions', async (c) => {
  const db = c.env.DB;
  const essayId = parseInt(c.req.param('id'));

  const essay = await db.prepare('SELECT * FROM essays WHERE id = ?').bind(essayId).first();
  if (!essay) return err(c, 404, 'Essay not found');

  if (!essay.current_content.trim()) {
    return err(c, 400, 'Essay content is empty');
  }

  const result = await db.prepare(
    `INSERT INTO essay_versions (essay_id, content, created_at)
     VALUES (?, ?, datetime('now'))`
  ).bind(essayId, essay.current_content).run();

  const versionId = result.meta.last_row_id;
  return c.json({ versionId }, 201);
});

/** GET /sop/api/reviews?version_id=:id[&device_id=:did] */
app.get('/sop/api/reviews', async (c) => {
  const db = c.env.DB;
  const versionId = c.req.query('version_id');
  const deviceId = c.req.query('device_id') || '';
  if (!versionId) return err(c, 400, 'version_id is required');

  const reviews = await db.prepare(
    `SELECT * FROM reviews WHERE version_id = ? ORDER BY created_at ASC`
  ).bind(versionId).all();

  const results = reviews.results.map(review => ({
    ...review,
    itemMap: {},
    is_mine: deviceId !== '' && review.device_id === deviceId,
  }));

  return c.json(results);
});

/** POST /sop/api/reviews */
app.post('/sop/api/reviews', async (c) => {
  const db = c.env.DB;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, 'Invalid JSON');
  }

  const { version_id, teacher_name, device_id } = body;
  if (!version_id) return err(c, 400, 'version_id is required');

  if (device_id) {
    const existing = await db.prepare(
      `SELECT id FROM reviews WHERE version_id = ? AND device_id = ?`
    ).bind(version_id, device_id).first();
    if (existing) {
      const rev = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(existing.id).first();
      return c.json({ ...rev, itemMap: {}, is_mine: true }, 200);
    }
  }

  const result = await db.prepare(
    `INSERT INTO reviews (version_id, teacher_name, device_id, markdown_comment, created_at)
     VALUES (?, ?, ?, '', datetime('now'))`
  ).bind(version_id, teacher_name || '', device_id || '').run();

  return c.json({
    id: result.meta.last_row_id,
    version_id,
    teacher_name: teacher_name || '',
    device_id: device_id || '',
    markdown_comment: '',
    submitted_at: null,
    itemMap: {},
    is_mine: true,
  }, 201);
});

/** PATCH /sop/api/reviews/:id */
app.patch('/sop/api/reviews/:id', async (c) => {
  const db = c.env.DB;
  const reviewId = parseInt(c.req.param('id'));

  const review = await db.prepare('SELECT submitted_at FROM reviews WHERE id = ?').bind(reviewId).first();
  if (!review) return err(c, 404, 'Review not found');
  if (review.submitted_at) return err(c, 403, 'Review already submitted');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, 'Invalid JSON');
  }

  const stmts = [];

  if (typeof body.teacher_name === 'string') {
    stmts.push(
      db.prepare(`UPDATE reviews SET teacher_name = ? WHERE id = ?`)
        .bind(body.teacher_name, reviewId)
    );
  }

  if (typeof body.markdown_comment === 'string') {
    stmts.push(
      db.prepare(`UPDATE reviews SET markdown_comment = ? WHERE id = ?`)
        .bind(body.markdown_comment, reviewId)
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return c.json({ success: true });
});

/** POST /sop/api/reviews/:id/submit */
app.post('/sop/api/reviews/:id/submit', async (c) => {
  const db = c.env.DB;
  const reviewId = parseInt(c.req.param('id'));

  const review = await db.prepare('SELECT submitted_at FROM reviews WHERE id = ?').bind(reviewId).first();
  if (!review) return err(c, 404, 'Review not found');
  if (review.submitted_at) return err(c, 400, 'Already submitted');

  await db.prepare(
    `UPDATE reviews SET submitted_at = datetime('now') WHERE id = ?`
  ).bind(reviewId).run();

  return c.json({ success: true });
});

// ================================================================
// 文化祭 人数カウントシステム API — /document/api/count/*
// ================================================================

/** 日本時間 (JST) ヘルパー */
const getJSTDateStrings = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const Y = jst.getUTCFullYear();
  const M = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const D = String(jst.getUTCDate()).padStart(2, '0');
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const m = String(jst.getUTCMinutes()).padStart(2, '0');
  const s = String(jst.getUTCSeconds()).padStart(2, '0');
  return {
    today: `${Y}-${M}-${D}`,
    full: `${Y}-${M}-${D} ${h}:${m}:${s}`,
  };
};

/** サマリー集計共通処理 */
const fetchCountSummary = async (db) => {
  const { today } = getJSTDateStrings();
  const total = await db.prepare(`
    SELECT
      COUNT(*) AS total_records,
      COALESCE(SUM(people_count), 0) AS total_people,
      COALESCE(SUM(play_count), 0) AS total_plays,
      COALESCE(SUM(total_amount), 0) AS total_revenue
    FROM count_records
  `).first();

  const todayData = await db.prepare(`
    SELECT
      COUNT(*) AS today_records,
      COALESCE(SUM(people_count), 0) AS today_people,
      COALESCE(SUM(play_count), 0) AS today_plays,
      COALESCE(SUM(total_amount), 0) AS today_revenue
    FROM count_records
    WHERE created_at LIKE ?
  `).bind(`${today}%`).first();

  // ゲーム別集計（コインピッチ・タブトス）
  const gamesResult = await db.prepare(`
    SELECT
      COALESCE(game_type, 'コインピッチ') AS game_type,
      COUNT(*) AS records,
      COALESCE(SUM(people_count), 0) AS people,
      COALESCE(SUM(play_count), 0) AS plays,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM count_records
    GROUP BY COALESCE(game_type, 'コインピッチ')
  `).all();

  const games = {
    'コインピッチ': { records: 0, people: 0, plays: 0, revenue: 0 },
    'タブトス': { records: 0, people: 0, plays: 0, revenue: 0 },
  };
  for (const row of gamesResult.results || []) {
    games[row.game_type] = {
      records: row.records,
      people: row.people,
      plays: row.plays,
      revenue: row.revenue,
    };
  }

  return {
    total: {
      total_records: total?.total_records || 0,
      total_people: total?.total_people || 0,
      total_plays: total?.total_plays || 0,
      total_revenue: total?.total_revenue || 0,
    },
    today: {
      today_records: todayData?.today_records || 0,
      today_people: todayData?.today_people || 0,
      today_plays: todayData?.today_plays || 0,
      today_revenue: todayData?.today_revenue || 0,
    },
    games,
    date_jst: today,
  };
};

/**
 * GET /document/api/count/records
 * 記録一覧（降順）とサマリー統計を取得
 */
app.get('/document/api/count/records', async (c) => {
  const db = c.env.DB;
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '200', 10), 1), 1000);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);

  const recordsResult = await db.prepare(`
    SELECT * FROM count_records
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  const summary = await fetchCountSummary(db);
  const { full: serverTimeJST } = getJSTDateStrings();

  return c.json({
    success: true,
    records: recordsResult.results || [],
    summary: summary.total,
    todaySummary: summary.today,
    gamesSummary: summary.games,
    serverTimeJST,
  });
});

/**
 * GET /document/api/count/summary
 * サマリー統計のみ取得（5分ポーリング・軽量確認用）
 */
app.get('/document/api/count/summary', async (c) => {
  const db = c.env.DB;
  const summary = await fetchCountSummary(db);
  const { full: serverTimeJST } = getJSTDateStrings();

  return c.json({
    success: true,
    summary: summary.total,
    todaySummary: summary.today,
    gamesSummary: summary.games,
    serverTimeJST,
  });
});

/**
 * POST /document/api/count/records
 * 新規カウント保存
 */
app.post('/document/api/count/records', async (c) => {
  const db = c.env.DB;
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, 'Invalid JSON body');
  }

  const peopleCount = Math.max(parseInt(body.people_count || '1', 10), 1);
  const playCount = Math.max(parseInt(body.play_count || '1', 10), 1);
  const unitPrice = parseInt(body.unit_price !== undefined ? body.unit_price : '100', 10);
  
  // total_amount が明示されていればそれを採用、なければ計算 (デフォルト: 合計プレイ回数 × 単価)
  let totalAmount = parseInt(body.total_amount, 10);
  if (isNaN(totalAmount)) {
    totalAmount = playCount * unitPrice;
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : '';
  const gameType = typeof body.game_type === 'string' && body.game_type.trim() ? body.game_type.trim() : 'コインピッチ';

  // クライアントから渡されたJST日時があればバリデーションして使用、なければサーバーJST現在時刻
  const { full: defaultJST } = getJSTDateStrings();
  let createdAt = defaultJST;
  if (body.created_at && typeof body.created_at === 'string') {
    const trimmed = body.created_at.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      createdAt = trimmed;
    }
  }

  const result = await db.prepare(`
    INSERT INTO count_records (people_count, play_count, unit_price, total_amount, note, device_id, created_at, game_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(peopleCount, playCount, unitPrice, totalAmount, note, deviceId, createdAt, gameType).run();

  const newId = result.meta.last_row_id;
  const newRecord = await db.prepare('SELECT * FROM count_records WHERE id = ?').bind(newId).first();
  const summary = await fetchCountSummary(db);

  return c.json({
    success: true,
    record: newRecord,
    summary: summary.total,
    todaySummary: summary.today,
    gamesSummary: summary.games,
  }, 201);
});

/**
 * DELETE /document/api/count/records/:id
 * レコード削除（誤入力取り消し用）
 */
app.delete('/document/api/count/records/:id', async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return err(c, 400, 'Invalid id');

  const existing = await db.prepare('SELECT id FROM count_records WHERE id = ?').bind(id).first();
  if (!existing) return err(c, 404, 'Record not found');

  await db.prepare('DELETE FROM count_records WHERE id = ?').bind(id).run();
  const summary = await fetchCountSummary(db);

  return c.json({
    success: true,
    deletedId: id,
    summary: summary.total,
    todaySummary: summary.today,
  });
});

// ── 404 fallback ────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
