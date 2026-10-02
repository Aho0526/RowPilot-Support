/**
 * app.js — 文化祭 人数カウントシステム (Clean & Minimal)
 * 2ゲーム対応（コインピッチ・タブトス）
 */

import { getRecords, saveRecord, deleteRecord } from './api.js';

// アプリケーション状態
const state = {
  currentGame: 'コインピッチ', // 'コインピッチ' | 'タブトス'
  currentPeople: 1,
  currentPlays: 1,
  unitPrice: 100,
  records: [],
  summary: {
    total_records: 0,
    total_people: 0,
    total_plays: 0,
    total_revenue: 0,
  },
  gamesSummary: {
    'コインピッチ': { records: 0, people: 0, plays: 0, revenue: 0 },
    'タブトス': { records: 0, people: 0, plays: 0, revenue: 0 },
  },
  syncIntervalSeconds: 300, // 5分 = 300秒
  remainingSeconds: 300,
  isSyncing: false,
};

// DOM要素
const elements = {
  // ゲーム選択
  gameBtns: document.querySelectorAll('.game-btn'),

  // カウンター
  displayPeople: document.getElementById('displayPeople'),
  btnPeopleMinus: document.getElementById('btnPeopleMinus'),
  btnPeoplePlus: document.getElementById('btnPeoplePlus'),

  displayPlays: document.getElementById('displayPlays'),
  btnPlaysMinus: document.getElementById('btnPlaysMinus'),
  btnPlaysPlus: document.getElementById('btnPlaysPlus'),

  previewTotalAmount: document.getElementById('previewTotalAmount'),
  priceFormula: document.getElementById('priceFormula'),
  inputNote: document.getElementById('inputNote'),

  btnResetCurrent: document.getElementById('btnResetCurrent'),
  btnSaveAndComplete: document.getElementById('btnSaveAndComplete'),
  btnSaveText: document.getElementById('btnSaveText'),

  // 同期
  syncDot: document.getElementById('syncDot'),
  syncText: document.getElementById('syncText'),
  syncTimer: document.getElementById('syncTimer'),
  btnSyncNow: document.getElementById('btnSyncNow'),

  // 累計・履歴シート
  btnOpenReport: document.getElementById('btnOpenReport'),
  btnCloseReport: document.getElementById('btnCloseReport'),
  sheetBackdrop: document.getElementById('sheetBackdrop'),

  statTotalPeople: document.getElementById('statTotalPeople'),
  statTotalPlays: document.getElementById('statTotalPlays'),
  statTotalRevenue: document.getElementById('statTotalRevenue'),

  statCoinRevenue: document.getElementById('statCoinRevenue'),
  statCoinPeople: document.getElementById('statCoinPeople'),
  statCoinPlays: document.getElementById('statCoinPlays'),

  statTabtosRevenue: document.getElementById('statTabtosRevenue'),
  statTabtosPeople: document.getElementById('statTabtosPeople'),
  statTabtosPlays: document.getElementById('statTabtosPlays'),

  historyCount: document.getElementById('historyCount'),
  historyList: document.getElementById('historyList'),
  btnExportCsv: document.getElementById('btnExportCsv'),

  toastContainer: document.getElementById('toastContainer'),
};

/**
 * 現在の小計金額を計算
 */
function calculateTotal() {
  return state.currentPeople * state.currentPlays * state.unitPrice;
}

/**
 * カウンター表示の更新
 */
function renderCounter() {
  const { currentGame, currentPeople, currentPlays, unitPrice } = state;
  const total = calculateTotal();

  // ゲーム選択ボタンのアクティブ更新
  elements.gameBtns.forEach((btn) => {
    const isSelected = btn.dataset.game === currentGame;
    btn.classList.toggle('active', isSelected);
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  elements.displayPeople.textContent = currentPeople;
  elements.displayPlays.textContent = currentPlays;
  elements.previewTotalAmount.textContent = total.toLocaleString();

  const totalPlays = currentPeople * currentPlays;
  if (currentPeople === 1) {
    elements.priceFormula.textContent = `${currentGame}: 1人 × ${currentPlays}回 (1回${unitPrice}円)`;
  } else {
    elements.priceFormula.textContent = `${currentGame}: ${currentPeople}人 × ${currentPlays}回 = 計${totalPlays}回 (1回${unitPrice}円)`;
  }

  elements.btnSaveText.textContent = `保存して完了 (${currentGame} ¥${total.toLocaleString()})`;

  elements.btnPeopleMinus.disabled = currentPeople <= 1;
  elements.btnPlaysMinus.disabled = currentPlays <= 1;
}

/**
 * 累計・履歴シートの描画
 */
function renderReport() {
  const { summary, gamesSummary, records } = state;

  // 全体
  elements.statTotalPeople.textContent = (summary.total_people || 0).toLocaleString();
  elements.statTotalPlays.textContent = (summary.total_plays || 0).toLocaleString();
  elements.statTotalRevenue.textContent = (summary.total_revenue || 0).toLocaleString();

  // コインピッチ
  const coin = gamesSummary['コインピッチ'] || { people: 0, plays: 0, revenue: 0 };
  elements.statCoinRevenue.textContent = (coin.revenue || 0).toLocaleString();
  elements.statCoinPeople.textContent = (coin.people || 0).toLocaleString();
  elements.statCoinPlays.textContent = (coin.plays || 0).toLocaleString();

  // タブトス
  const tabtos = gamesSummary['タブトス'] || { people: 0, plays: 0, revenue: 0 };
  elements.statTabtosRevenue.textContent = (tabtos.revenue || 0).toLocaleString();
  elements.statTabtosPeople.textContent = (tabtos.people || 0).toLocaleString();
  elements.statTabtosPlays.textContent = (tabtos.plays || 0).toLocaleString();

  elements.historyCount.textContent = `${records.length}件`;

  if (!records || records.length === 0) {
    elements.historyList.innerHTML = `
      <div class="history-empty">まだ記録がありません</div>
    `;
    return;
  }

  const html = records.map((rec) => {
    const dateStr = rec.created_at || '';
    const shortTime = dateStr.length >= 16 ? dateStr.substring(5, 16) : dateStr;
    const noteText = rec.note ? `<div class="history-note">${escapeHtml(rec.note)}</div>` : '';
    const gameName = rec.game_type || 'コインピッチ';
    const tagClass = gameName === 'タブトス' ? 'tag-tabtos' : 'tag-coin';

    return `
      <div class="history-item">
        <div class="history-left">
          <div class="history-meta">
            <span class="history-game-tag ${tagClass}">${escapeHtml(gameName)}</span>
            <span>${rec.people_count}人</span>
            <span>/</span>
            <span>${rec.play_count}回</span>
            <span class="history-time">${escapeHtml(shortTime)}</span>
          </div>
          ${noteText}
        </div>
        <div class="history-right">
          <span class="history-amount">¥${(rec.total_amount || 0).toLocaleString()}</span>
          <button class="btn-del" data-delete-id="${rec.id}" title="削除">✕</button>
        </div>
      </div>
    `;
  }).join('');

  elements.historyList.innerHTML = html;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * トースト通知
 */
function showToast(message, undoId = null) {
  const toast = document.createElement('div');
  toast.className = 'toast';

  let content = `<span>${message}</span>`;
  if (undoId) {
    content += `<button class="toast-btn-undo" id="undo_${undoId}">取消</button>`;
  }
  toast.innerHTML = content;
  elements.toastContainer.appendChild(toast);

  if (undoId) {
    const btn = toast.querySelector(`#undo_${undoId}`);
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          await deleteRecord(undoId);
          toast.remove();
          showToast('取り消しました');
          await syncData();
        } catch (e) {
          showToast('取消に失敗しました');
        }
      });
    }
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, 4500);
}

/**
 * D1 との同期
 */
async function syncData() {
  if (state.isSyncing) return;
  state.isSyncing = true;

  elements.syncDot.style.backgroundColor = '#f59e0b';
  elements.syncText.textContent = '同期中...';

  try {
    const data = await getRecords(150);
    state.records = data.records || [];
    state.summary = data.summary || state.summary;
    state.gamesSummary = data.gamesSummary || state.gamesSummary;

    renderReport();

    elements.syncDot.style.backgroundColor = '#16a34a';
    elements.syncText.textContent = '同期済';
    state.remainingSeconds = state.syncIntervalSeconds;
  } catch (err) {
    console.error('Sync failed:', err);
    elements.syncDot.style.backgroundColor = '#ef4444';
    elements.syncText.textContent = '同期失敗';
  } finally {
    state.isSyncing = false;
  }
}

/**
 * 保存処理（客が帰ったとき）
 */
async function handleSave() {
  const game = state.currentGame;
  const people = state.currentPeople;
  const plays = state.currentPlays;
  const total = calculateTotal();
  const note = elements.inputNote.value.trim();

  elements.btnSaveAndComplete.disabled = true;
  elements.btnSaveText.textContent = '保存中...';

  try {
    const res = await saveRecord({
      game_type: game,
      people_count: people,
      play_count: plays,
      unit_price: state.unitPrice,
      total_amount: total,
      note,
    });

    if (res.success) {
      showToast(`${game}: ¥${total.toLocaleString()} を保存しました`, res.record?.id);

      // カウンターのみリセット（選択ゲームは維持）
      state.currentPeople = 1;
      state.currentPlays = 1;
      elements.inputNote.value = '';
      renderCounter();

      await syncData();
    } else {
      showToast('保存に失敗しました');
    }
  } catch (err) {
    console.error('Save failed:', err);
    showToast('通信エラー');
  } finally {
    elements.btnSaveAndComplete.disabled = false;
    renderCounter();
  }
}

/**
 * シートの開閉
 */
function openReport() {
  renderReport();
  elements.sheetBackdrop.classList.add('open');
  elements.sheetBackdrop.setAttribute('aria-hidden', 'false');
}

function closeReport() {
  elements.sheetBackdrop.classList.remove('open');
  elements.sheetBackdrop.setAttribute('aria-hidden', 'true');
}

/**
 * CSV出力
 */
function exportCsv() {
  if (!state.records || state.records.length === 0) {
    alert('データがありません');
    return;
  }

  let csv = '\uFEFF日時,ゲーム,人数,プレイ回数,単価,売上金額,メモ\n';
  state.records.forEach((r) => {
    csv += `"${r.created_at || ''}","${(r.game_type || 'コインピッチ').replace(/"/g, '""')}",${r.people_count},${r.play_count},${r.unit_price},${r.total_amount},"${(r.note || '').replace(/"/g, '""')}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `文化祭集計_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * イベントリスナー設定
 */
function setupEvents() {
  // ゲーム切り替え
  elements.gameBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.game;
      if (g) {
        state.currentGame = g;
        renderCounter();
      }
    });
  });

  // 人数
  elements.btnPeoplePlus.addEventListener('click', () => {
    state.currentPeople++;
    renderCounter();
  });
  elements.btnPeopleMinus.addEventListener('click', () => {
    if (state.currentPeople > 1) {
      state.currentPeople--;
      renderCounter();
    }
  });

  // 回数
  elements.btnPlaysPlus.addEventListener('click', () => {
    state.currentPlays++;
    renderCounter();
  });
  elements.btnPlaysMinus.addEventListener('click', () => {
    if (state.currentPlays > 1) {
      state.currentPlays--;
      renderCounter();
    }
  });

  // クリア
  elements.btnResetCurrent.addEventListener('click', () => {
    state.currentPeople = 1;
    state.currentPlays = 1;
    elements.inputNote.value = '';
    renderCounter();
  });

  // 保存
  elements.btnSaveAndComplete.addEventListener('click', handleSave);

  // シート開閉
  elements.btnOpenReport.addEventListener('click', openReport);
  elements.btnCloseReport.addEventListener('click', closeReport);
  elements.sheetBackdrop.addEventListener('click', (e) => {
    if (e.target === elements.sheetBackdrop) closeReport();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.sheetBackdrop.classList.contains('open')) {
      closeReport();
    }
  });

  // 履歴削除
  elements.historyList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-id]');
    if (btn) {
      const id = parseInt(btn.dataset.deleteId, 10);
      if (confirm('この記録を削除しますか？')) {
        try {
          await deleteRecord(id);
          showToast('削除しました');
          await syncData();
        } catch (err) {
          showToast('削除に失敗しました');
        }
      }
    }
  });

  // CSV
  elements.btnExportCsv.addEventListener('click', exportCsv);

  // 手動更新
  elements.btnSyncNow.addEventListener('click', () => syncData());

  // 5分タイマーカウントダウン
  setInterval(() => {
    if (state.remainingSeconds > 0) {
      state.remainingSeconds--;
    } else {
      syncData();
    }
    const m = Math.floor(state.remainingSeconds / 60);
    const s = state.remainingSeconds % 60;
    elements.syncTimer.textContent = `(次回 ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')})`;
  }, 1000);

  // タブ復帰時
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncData();
  });
}

// 初期化
renderCounter();
setupEvents();
syncData();
