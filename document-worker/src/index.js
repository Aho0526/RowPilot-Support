/**
 * Document Correction Support — Cloudflare Worker
 * Hono フレームワークを使用した REST API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// ── Email Notification Helper ─────────────────────────────────
async function sendNotificationEmail(env, to, subject, bodyText) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Email Notification Skipped (RESEND_API_KEY missing)] To: ${to}\nSubject: ${subject}\nBody: ${bodyText}`);
    return;
  }

  const fromEmail = env.RESEND_FROM_EMAIL || 'RowPilot 添削支援 <onboarding@resend.dev>';
  
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: subject,
        text: bodyText,
        html: `<p>${bodyText.replace(/\n/g, '<br>')}</p><p><a href="https://rowpilot.jp/document/">RowPilot 添削支援を開く</a></p>`
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Failed to send email via Resend API:', errText);
    } else {
      console.log(`Email sent successfully to ${to}`);
    }
  } catch (err) {
    console.error('Error sending email:', err);
  }
}

// ── CORS ──────────────────────────────────────────────────────
app.use('/document/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// ── Cache-Control (キャッシュ無効化) ───────────────────────────
app.use('/document/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

// ── Database Migration (起動時自動マイグレーション) ──────────────
app.use('/document/api/*', async (c, next) => {
  const db = c.env.DB;
  if (db) {
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
    } catch (e) {
      console.warn("Migration check skipped or failed:", e);
    }
  }
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

  // メール通知送信処理 (バックグラウンド実行)
  const teacherEmail = body.teacherEmail;
  if (teacherEmail && teacherEmail.trim()) {
    const subject = '【要添削】生徒から新しいレビュー依頼が届きました';
    const bodyText = `生徒から課題論文のレビュー依頼（バージョン作成）が届きました。

内容を確認し、チェックリストとコメントを入力して添削を提出してください。`;
    c.executionCtx.waitUntil(sendNotificationEmail(c.env, teacherEmail, subject, bodyText));
  }

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

  // メール通知送信処理 (バックグラウンド実行)
  const studentEmail = body.studentEmail;
  if (studentEmail && studentEmail.trim()) {
    const subject = '【添削完了】先生からレビューが届きました';
    const bodyText = `先生による課題論文の添削が提出されました。

RowPilot 添削支援を開いて、先生のコメントとチェック結果を確認してください。`;
    c.executionCtx.waitUntil(sendNotificationEmail(c.env, studentEmail, subject, bodyText));
  }

  return c.json({ success: true });
});

// ── 404 fallback ────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
