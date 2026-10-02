/**
 * api.js — 文化祭 人数カウントシステム APIクライアント
 * Cloudflare Worker / Cloudflare D1 連携モジュール
 */

// APIベースURLの判定
// 本番: /document/api または https://rowpilot.jp/document/api
// ローカル開発: localhost:8787 (wrangler dev起動時) または直接本番APIへのフォールバック
const API_BASE = (() => {
  const { hostname, protocol, origin } = window.location;
  if (origin && origin.includes('rowpilot.jp')) {
    return '/document/api/count';
  }
  // ローカル開発サーバーなどの場合、Workerが8787で動いていればそれを使用、
  // なければ本番環境の https://rowpilot.jp/document/api/count を利用可能
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('api') === 'remote') {
    return 'https://rowpilot.jp/document/api/count';
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // ローカルWorkerが動いている場合は 8787、そうでなければ本番へフォールバック
    return 'https://rowpilot.jp/document/api/count';
  }
  return '/document/api/count';
})();

// 端末固有の識別子（UUIDまたは乱数文字列をlocalStorageにキャッシュ）
export const getDeviceId = () => {
  let id = localStorage.getItem('festival_counter_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem('festival_counter_device_id', id);
  }
  return id;
};

/**
 * 共通Fetchリクエスト
 */
async function request(method, path = '', body = null) {
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

  const separator = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${separator}_t=${Date.now()}`;

  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`[API Error] ${method} ${url}:`, err);
    throw err;
  }
}

/**
 * 記録一覧とサマリーの取得
 * @param {number} limit 取得上限数
 */
export async function getRecords(limit = 100) {
  return request('GET', `/records?limit=${limit}`);
}

/**
 * サマリー統計のみ取得（5分ポーリング用）
 */
export async function getSummary() {
  return request('GET', '/summary');
}

/**
 * 新規カウント記録の保存
 * @param {Object} data { people_count, play_count, unit_price, total_amount, note, created_at }
 */
export async function saveRecord(data) {
  const payload = {
    people_count: Number(data.people_count) || 1,
    play_count: Number(data.play_count) || 1,
    unit_price: Number(data.unit_price) || 100,
    total_amount: Number(data.total_amount) || 100,
    note: data.note || '',
    device_id: getDeviceId(),
    game_type: data.game_type || 'コインピッチ',
    created_at: data.created_at || undefined,
  };
  return request('POST', '/records', payload);
}

/**
 * 記録の削除
 * @param {number} id レコードID
 */
export async function deleteRecord(id) {
  return request('DELETE', `/records/${id}`);
}
