/**
 * api.js — SOP API 通信モジュール
 * バックエンド (Cloudflare Workers /sop/api) との全通信を集約
 */

// 開発時は localhost:8787、本番は同じドメインの /sop/api を使用
const API_BASE = (() => {
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname || protocol === 'file:') {
    return 'http://localhost:8787/sop/api';
  }
  return '/sop/api';
})();

/**
 * 汎用 fetch ラッパー
 */
async function request(method, path, body = null) {
  const opts = {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const separator = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${separator}_t=${Date.now()}`;

  const res = await fetch(url, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Essays ────────────────────────────────────────────────────────

/** 志願理由書取得（最新バージョン含む） */
export const getEssay = (essayId) =>
  request('GET', `/essays/${essayId}`);

/** 自動保存（下書き content を上書き） */
export const saveEssay = (essayId, content) =>
  request('PATCH', `/essays/${essayId}`, { content });

/** レビュー依頼（バージョン作成） */
export const requestReview = (essayId) =>
  request('POST', `/essays/${essayId}/versions`, {});

// ── Reviews ──────────────────────────────────────────────────────

/**
 * バージョンに紐づくレビュー取得
 * @param {number} versionId
 * @param {string} [deviceId] 指定すると is_mine フラグが付与される
 */
export const getReview = (versionId, deviceId = '') => {
  const q = deviceId ? `version_id=${versionId}&device_id=${encodeURIComponent(deviceId)}` : `version_id=${versionId}`;
  return request('GET', `/reviews?${q}`);
};

/**
 * レビュー新規作成（端末識別付き）
 */
export const createReview = (versionId, teacherName = '', deviceId = '') =>
  request('POST', '/reviews', { version_id: versionId, teacher_name: teacherName, device_id: deviceId });

/** レビュー更新（添削者名 + コメント） */
export const updateReview = (reviewId, { teacher_name, markdown_comment }) =>
  request('PATCH', `/reviews/${reviewId}`, { teacher_name, markdown_comment });

/** レビュー提出確定 */
export const submitReview = (reviewId) =>
  request('POST', `/reviews/${reviewId}/submit`, {});
