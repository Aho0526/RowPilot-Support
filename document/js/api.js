/**
 * api.js — API 通信モジュール
 * バックエンド (Cloudflare Workers) との全通信を集約
 */

// 開発時は localhost:8787、本番は同じドメインの /document/api を使用
const API_BASE = (() => {
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname || protocol === 'file:') {
    return 'http://localhost:8787/document/api';
  }
  return '/document/api';
})();

/**
 * 汎用 fetch ラッパー
 */
async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Essays ───────────────────────────────────────────────────────

/** エッセイ取得（最新バージョン含む） */
export const getEssay = (essayId) =>
  request('GET', `/essays/${essayId}`);

/** 自動保存（下書き content を上書き） */
export const saveEssay = (essayId, content) =>
  request('PATCH', `/essays/${essayId}`, { content });

/** レビュー依頼（バージョン作成） */
export const requestReview = (essayId, teacherEmail) =>
  request('POST', `/essays/${essayId}/versions`, { teacherEmail });

/** バージョン一覧取得 */
export const getVersions = (essayId) =>
  request('GET', `/essays/${essayId}/versions`);

/** 特定バージョンの内容取得 */
export const getVersion = (essayId, versionId) =>
  request('GET', `/essays/${essayId}/versions/${versionId}`);

// ── Reviews ──────────────────────────────────────────────────────

/** バージョンに紐づくレビュー取得 */
export const getReview = (versionId) =>
  request('GET', `/reviews?version_id=${versionId}`);

/** レビュー更新（コメント + チェック項目） */
export const updateReview = (reviewId, { markdown_comment, items }) =>
  request('PATCH', `/reviews/${reviewId}`, { markdown_comment, items });

/** レビュー提出確定 */
export const submitReview = (reviewId, studentEmail) =>
  request('POST', `/reviews/${reviewId}/submit`, { studentEmail });
