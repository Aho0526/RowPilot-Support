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
    `SELECT ev.*, r.id AS review_id, r.submitted_at, r.markdown_comment
     FROM essay_versions ev
     LEFT JOIN reviews r ON r.version_id = ev.id
     WHERE ev.essay_id = ?
     ORDER BY ev.created_at DESC
     LIMIT 1`
  ).bind(id).first();

  return c.json({ essay, latestVersion: latestVersion ?? null });
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

  // 空のレビュードラフトをあわせて作成（先生がすぐ編集できるよう）
  const reviewResult = await db.prepare(
    `INSERT INTO reviews (version_id, markdown_comment, created_at)
     VALUES (?, '', datetime('now'))`
  ).bind(versionId).run();

  // メール通知送信処理 (バックグラウンド実行)
  const teacherEmail = body.teacherEmail;
  if (teacherEmail && teacherEmail.trim()) {
    const subject = '【要添削】生徒から新しいレビュー依頼が届きました';
    const bodyText = `生徒から課題論文のレビュー依頼（バージョン作成）が届きました。

内容を確認し、チェックリストとコメントを入力して添削を提出してください。`;
    c.executionCtx.waitUntil(sendNotificationEmail(c.env, teacherEmail, subject, bodyText));
  }

  return c.json({
    versionId,
    reviewId: reviewResult.meta.last_row_id,
  }, 201);
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
       r.id          AS review_id,
       r.submitted_at,
       r.markdown_comment
     FROM essay_versions ev
     LEFT JOIN reviews r ON r.version_id = ev.id
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
 * GET /document/api/reviews?version_id=:id
 * 指定バージョンのレビュー取得（チェック項目含む）
 */
app.get('/document/api/reviews', async (c) => {
  const db = c.env.DB;
  const versionId = c.req.query('version_id');
  if (!versionId) return err(c, 400, 'version_id is required');

  const review = await db.prepare(
    `SELECT * FROM reviews WHERE version_id = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(versionId).first();

  if (!review) return c.json(null);

  const items = await db.prepare(
    `SELECT checklist_key, checked FROM review_items WHERE review_id = ?`
  ).bind(review.id).all();

  // checked を Boolean に変換
  const itemMap = {};
  for (const row of items.results) {
    itemMap[row.checklist_key] = row.checked === 1;
  }

  return c.json({ ...review, itemMap });
});

/**
 * PATCH /document/api/reviews/:id
 * レビュー更新（コメント + チェック項目）
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
