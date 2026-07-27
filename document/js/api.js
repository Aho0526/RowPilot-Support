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
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  // タイムスタンプパラメータを付与してブラウザ/CDNキャッシュを完全バイパス
  const separator = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${separator}_t=${Date.now()}`;

  const res = await fetch(url, opts);
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
 * @param {number} versionId
 * @param {string} [teacherName]
 * @param {string} [deviceId]
 */
export const createReview = (versionId, teacherName = '', deviceId = '') =>
  request('POST', '/reviews', { version_id: versionId, teacher_name: teacherName, device_id: deviceId });

/** レビュー更新（添削者名 + コメント + チェック項目） */
export const updateReview = (reviewId, { teacher_name, markdown_comment, items }) =>
  request('PATCH', `/reviews/${reviewId}`, { teacher_name, markdown_comment, items });

/** レビュー提出確定 */
export const submitReview = (reviewId, studentEmail) =>
  request('POST', `/reviews/${reviewId}/submit`, { studentEmail });
