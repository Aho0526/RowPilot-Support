/**
 * device.js — 端末識別とローカルドラフトキャッシュ管理
 *
 * - デバイスIDの発行・取得（localStorage に永続化）
 * - バージョン変更時のコメント/名前ドラフトの退避・復元
 */

const DEVICE_ID_KEY = 'rowpilot_device_id';
const DRAFT_PREFIX  = 'rowpilot_draft_v'; // + versionId

/**
 * この端末固有のデバイスIDを取得（なければ生成して保存）
 * @returns {string} UUID v4 文字列
 */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * 指定バージョンの先生ドラフト（名前・コメント）をローカルに保存する
 * @param {number|string} versionId
 * @param {{ teacherName: string, comment: string }} draft
 */
export function saveDraftLocally(versionId, { teacherName, comment }) {
  const key = `${DRAFT_PREFIX}${versionId}`;
  localStorage.setItem(key, JSON.stringify({ teacherName, comment, savedAt: Date.now() }));
}

/**
 * 指定バージョンのローカルドラフトを取得する
 * @param {number|string} versionId
 * @returns {{ teacherName: string, comment: string, savedAt: number } | null}
 */
export function loadDraftLocally(versionId) {
  const key = `${DRAFT_PREFIX}${versionId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 指定バージョンのローカルドラフトを削除する（提出後など）
 * @param {number|string} versionId
 */
export function clearDraftLocally(versionId) {
  localStorage.removeItem(`${DRAFT_PREFIX}${versionId}`);
}

/**
 * 古いバージョンのドラフト（指定ID以外）を全て削除するクリーンアップ
 * @param {number|string} keepVersionId 保持するバージョンID
 */
export function cleanupOldDrafts(keepVersionId) {
  const keepKey = `${DRAFT_PREFIX}${keepVersionId}`;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(DRAFT_PREFIX) && k !== keepKey) {
      toRemove.push(k);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

// ─── Private ────────────────────────────────────────────────────

function generateUUID() {
  // crypto.randomUUID() が使えれば使う（ほぼ全モダンブラウザ対応）
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // フォールバック: Math.random ベース
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
