/**
 * app.js — 志願理由書添削 メインエントリポイント
 * チェックリストなし・2パネル構成（志願理由書 / 先生コメント）
 */

import { Editor }   from './editor.js?v=1.7_indent_fix';
import { Comments } from './comments.js?v=1.7_indent_fix';
import { PaperManager } from './paper.js?v=1.7_indent_fix';
import {
  getEssay,
  getReview,
  createReview,
  requestReview,
  updateReview,
  submitReview,
} from './api.js';
import {
  getDeviceId,
  saveDraftLocally,
  loadDraftLocally,
  clearDraftLocally,
  cleanupOldDrafts,
} from './device.js';

// ================================================================
// 定数
// ================================================================
const ESSAY_ID = 2;  // 志願理由書は id=2
const MODE_KEY = 'sop_mode';  // localStorage キー（課題論文と分離）

// ================================================================
// 状態
// ================================================================
const state = {
  mode: localStorage.getItem(MODE_KEY) ?? 'student',
  essay: null,
  currentVersion: null,
  currentReview: null,
  reviews: [],
};

const DEVICE_ID = getDeviceId();

// ================================================================
// DOM 要素
// ================================================================
const $ = (sel) => document.querySelector(sel);

// ================================================================
// アプリケーション初期化
// ================================================================
async function init() {
  setupModeToggle();
  await loadEssay();
  applyMode(state.mode, { initial: true });
  setupToolbar();
  initResizablePanels();
  startLiveSync();
}

// ================================================================
// モード切替
// ================================================================
function setupModeToggle() {
  const btnStudent = $('#btn-mode-student');
  const btnTeacher = $('#btn-mode-teacher');

  btnStudent.addEventListener('click', () => switchMode('student'));
  btnTeacher.addEventListener('click', () => switchMode('teacher'));
}

function switchMode(mode) {
  state.mode = mode;
  localStorage.setItem(MODE_KEY, mode);
  applyMode(mode);
}

function applyMode(mode, { initial = false } = {}) {
  const isTeacher = mode === 'teacher';

  // ボタンの active 状態
  $('#btn-mode-student').classList.toggle('mode-btn--active', !isTeacher);
  $('#btn-mode-teacher').classList.toggle('mode-btn--active', isTeacher);

  // ロールバッジ
  const badge = $('#role-badge');
  badge.textContent = isTeacher ? '先生モード' : '生徒モード';
  badge.className = `role-badge role-badge--${mode}`;

  // エディタ（文字のみ）
  if (window._editor) {
    const displayContent = isTeacher
      ? (state.currentVersion?.content ?? state.essay?.current_content ?? '')
      : (state.essay?.current_content ?? '');
    window._editor.setContent(displayContent);
    window._editor.setReadOnly(isTeacher);
  }

  // 清書用紙マネージャー
  if (window._paper) {
    window._paper.setReadOnly(isTeacher);
    window._paper.syncMasterToPaper();
    window._paper.updateTotalCharCount();
  }

  // コメント
  if (window._comments) {
    window._comments.setEditable(isTeacher);
    refreshComments();
  }

  // ツールバーボタン表示切替
  updateToolbarVisibility(isTeacher);
}

function refreshComments() {
  const isTeacher = state.mode === 'teacher';
  if (window._comments) {
    if (isTeacher) {
      window._comments.setContent(state.reviews, state.currentReview?.id, !!state.currentVersion?.id);
    } else {
      window._comments.setContent(state.reviews, null);
    }
  }
}

// ================================================================
// データ読み込み
// ================================================================
async function loadEssay() {
  showLoading(true);
  try {
    const data = await getEssay(ESSAY_ID);
    state.essay = data.essay;
    state.currentVersion = data.latestVersion;

    if (state.currentVersion?.review_id) {
      await loadReview(state.currentVersion.id);
    }

    initModules();

    const displayContent = (state.mode === 'teacher')
      ? (state.currentVersion?.content ?? state.essay?.current_content ?? '')
      : (state.essay?.current_content ?? '');
    window._editor.setContent(displayContent);

    // 用紙ビューに初期テキストをパースして流し込む
    if (window._paper) {
      window._paper.syncMasterToPaper();
      window._paper.updateTotalCharCount();
    }

    refreshComments();

    refreshComments();

    // タイトル表示
    const titleEl = $('#sop-title');
    if (titleEl && state.essay?.title) titleEl.textContent = state.essay.title;

    updateLastRequestTime();
    showLoading(false);
  } catch (e) {
    console.error('Failed to load essay:', e);
    showError('データの読み込みに失敗しました。\nページを再読み込みしてください。');
  }
}

async function loadReview(versionId) {
  try {
    const reviews = await getReview(versionId, DEVICE_ID);
    state.reviews = reviews || [];

    if (state.mode === 'teacher') {
      state.currentReview = state.reviews.find(r => r.is_mine) || null;
    } else {
      state.currentReview = null;
    }
  } catch (e) {
    console.error('Failed to load reviews:', e);
  }
}

// ================================================================
// リアルタイム自動同期
// ================================================================
let isSyncing = false;

function startLiveSync() {
  setInterval(syncLatestData, 5000);  // 5秒ごとの同期（課題論文の1.5秒より余裕を持たせる）
  window.addEventListener('focus', syncLatestData);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncLatestData();
  });
}

async function syncLatestData() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const data = await getEssay(ESSAY_ID);
    const serverEssay = data.essay;
    const serverLatestVersion = data.latestVersion;

    const versionIdChanged = serverLatestVersion?.id !== state.currentVersion?.id;

    const textarea = $('#sop-textarea');
    const isEditingTextarea = document.activeElement === textarea;
    const isEditingPaper = window._paper?.currentMode === 'paper' && !!document.activeElement?.closest?.('#view-paper-container');
    const isCurrentlyEditing = isEditingTextarea || isEditingPaper;

    if (state.mode === 'student') {
      if (serverEssay && serverEssay.current_content !== state.essay?.current_content) {
        state.essay = serverEssay;
        if (!isCurrentlyEditing && window._editor) {
          window._editor.setContent(serverEssay.current_content);
          if (window._paper && window._paper.currentMode === 'paper') {
            window._paper.syncMasterToPaper();
            window._paper.updateTotalCharCount();
          }
        }
      }
    } else {
      state.essay = serverEssay;
      if (versionIdChanged && window._editor) {
        const teacherDisplay = serverLatestVersion?.content ?? serverEssay?.current_content ?? '';
        window._editor.setContent(teacherDisplay);
        if (window._paper) {
          window._paper.syncMasterToPaper();
          window._paper.updateTotalCharCount();
        }
      }
    }

    const prevVersionId = state.currentVersion?.id;
    state.currentVersion = serverLatestVersion;

    if (versionIdChanged && prevVersionId && state.mode === 'teacher') {
      const nameInput = document.querySelector('.cm-teacher-name-input');
      const ta = document.querySelector('.cm-textarea');
      const draftName = nameInput ? nameInput.value : (state.currentReview?.teacher_name || '');
      const draftComment = ta ? ta.value : (state.currentReview?.markdown_comment || '');
      if (draftName || draftComment) {
        saveDraftLocally(prevVersionId, { teacherName: draftName, comment: draftComment });
      }
    }

    if (serverLatestVersion) {
      const serverReviews = await getReview(serverLatestVersion.id, DEVICE_ID);

      const commentTextarea = document.querySelector('.cm-textarea');
      const isEditingComment = document.activeElement === commentTextarea;

      const reviewsChanged =
        versionIdChanged ||
        state.reviews?.length !== serverReviews?.length ||
        JSON.stringify(state.reviews) !== JSON.stringify(serverReviews);

      if (reviewsChanged) {
        state.reviews = serverReviews || [];

        if (state.mode === 'teacher') {
          const myReview = serverReviews.find(r => r.is_mine) || null;
          state.currentReview = myReview;

          if (versionIdChanged && prevVersionId) {
            const oldDraft = loadDraftLocally(prevVersionId);
            if (oldDraft && window._comments && !myReview?.submitted_at) {
              window._comments.setPendingDraft(oldDraft);
            }
            cleanupOldDrafts(prevVersionId);
          }
        } else {
          state.currentReview = null;
        }

        refreshComments();
        updateToolbarVisibility(state.mode === 'teacher');
        updateLastRequestTime();
      }
    } else if (state.reviews && state.reviews.length > 0) {
      state.reviews = [];
      state.currentReview = null;
      refreshComments();
      updateToolbarVisibility(state.mode === 'teacher');
      updateLastRequestTime();
    }
  } catch (e) {
    console.debug('Live sync debug:', e);
  } finally {
    isSyncing = false;
  }
}

// ================================================================
// モジュール初期化（DOM要素とバインド）
// ================================================================
function initModules() {
  // エディタ（文字のみ）
  window._editor = new Editor(
    $('#sop-textarea'),
    $('#save-status'),
    $('#char-count'),
    { essayId: ESSAY_ID }
  );

  // 清書用紙マネージャー
  window._paper = new PaperManager({
    masterTextarea: $('#sop-textarea'),
    onContentChange: () => {
      // 用紙側で入力があったら自動保存タイマーをトリガー
      window._editor?._scheduleAutoSave();
    },
    onCountUpdate: (count) => {
      const countEl = $('#char-count');
      if (countEl) {
        countEl.textContent = `${count.toLocaleString()} 字`;
        countEl.classList.remove('count--over');
      }
    }
  });

  // コメント
  window._comments = new Comments($('#comments-container'), {
    onReviewSelect: (reviewId) => {
      const rev = state.reviews.find(r => r.id === reviewId);
      if (rev) {
        state.currentReview = rev;
        refreshComments();
        updateToolbarVisibility(state.mode === 'teacher');
      }
    },
    onAddReview: async () => {
      if (!state.currentVersion?.id) return;
      try {
        showLoading(true);
        const newRev = await createReview(state.currentVersion.id, '', DEVICE_ID);
        const revWithMine = { ...newRev, is_mine: true };
        if (!state.reviews.find(r => r.id === revWithMine.id)) {
          state.reviews.push(revWithMine);
        } else {
          const idx = state.reviews.findIndex(r => r.id === revWithMine.id);
          if (idx !== -1) state.reviews[idx] = revWithMine;
        }
        state.currentReview = revWithMine;
        refreshComments();
        updateToolbarVisibility(state.mode === 'teacher');
        showLoading(false);
      } catch (e) {
        console.error('Failed to create new review:', e);
        showLoading(false);
      }
    },
    onSaveReview: (reviewId, name, comment) => {
      const rev = state.reviews.find(r => r.id === reviewId);
      if (rev) {
        rev.teacher_name = name;
        rev.markdown_comment = comment;
      }
      if (state.currentReview && state.currentReview.id === reviewId) {
        state.currentReview.teacher_name = name;
        state.currentReview.markdown_comment = comment;
      }
    },
    onDraftRestore: (draft) => {
      const prevVersionId = state.currentVersion ? state.currentVersion.id - 1 : null;
      if (prevVersionId) clearDraftLocally(prevVersionId);
    }
  });
}

// ================================================================
// UIユーティリティ: トースト通知 & 確認モーダル
// ================================================================
function showToast(message, type = 'info', duration = 3000) {
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();

  const colors = {
    info:    { bg: 'var(--color-accent)',  text: '#fff' },
    success: { bg: 'var(--color-success)', text: '#fff' },
    error:   { bg: 'var(--color-danger)',  text: '#fff' },
    warning: { bg: 'var(--color-warning)', text: '#1a1a2e' },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '64px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: c.bg,
    color: c.text,
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '13.5px',
    fontWeight: '600',
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    maxWidth: '480px',
    textAlign: 'center',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function showConfirmModal(message, onConfirm, { okLabel = 'OK', cancelLabel = 'キャンセル', danger = false } = {}) {
  const overlay = document.createElement('div');
  overlay.id = 'app-confirm-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: '9998',
    backdropFilter: 'blur(4px)',
  });

  const box = document.createElement('div');
  Object.assign(box.style, {
    background: 'var(--color-surface)',
    borderRadius: '12px',
    padding: '28px 32px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  });

  const msg = document.createElement('p');
  msg.textContent = message;
  msg.style.cssText = 'margin: 0; font-size: 14px; line-height: 1.6; color: var(--color-text-primary); white-space: pre-wrap;';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = cancelLabel;
  cancelBtn.style.cssText = 'padding: 8px 20px; border-radius: 6px; border: 1px solid var(--color-border); background: transparent; color: var(--color-text-primary); font-size: 13px; cursor: pointer;';
  cancelBtn.onclick = () => overlay.remove();

  const okBtn = document.createElement('button');
  okBtn.textContent = okLabel;
  okBtn.style.cssText = `padding: 8px 20px; border-radius: 6px; border: none; background: ${danger ? 'var(--color-danger)' : 'var(--color-accent)'}; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;`;
  okBtn.onclick = () => { overlay.remove(); onConfirm(); };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(okBtn);
  box.appendChild(msg);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function setupToolbar() {
  $('#btn-request-review')?.addEventListener('click', handleRequestReview);
  $('#btn-submit-review')?.addEventListener('click', handleSubmitReview);
}

function updateToolbarVisibility(isTeacher) {
  const btnRequest = $('#btn-request-review');
  const btnSubmit  = $('#btn-submit-review');

  if (btnRequest) btnRequest.style.display = isTeacher ? 'none' : '';
  if (btnSubmit)  btnSubmit.style.display  = isTeacher ? '' : 'none';

  if (btnSubmit) {
    const myRev = state.reviews.find(r => r.is_mine) || state.currentReview;
    if (myRev?.submitted_at) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = '提出済み';
    } else if (!myRev?.id) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = '添削未開始';
    } else {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'レビュー提出';
    }
  }
}

// ================================================================
// レビュー依頼
// ================================================================
async function handleRequestReview() {
  const btn = $('#btn-request-review');
  if (!btn) return;

  await window._editor?.forceSave();

  const content = window._editor?.getContent() ?? '';
  if (!content.trim()) {
    showToast('志願理由書を入力してからレビューを依頼してください。', 'warning', 4000);
    return;
  }

  const latestContent = state.currentVersion?.content ?? '';
  if (content.trim() === latestContent.trim()) {
    showToast('前回提出した内容から変更がありません。1文字以上変更してから依頼してください。', 'warning', 4000);
    return;
  }

  showConfirmModal(
    '現在の内容でレビューを依頼しますか？\nこの操作で新しいバージョンが作成されます。',
    async () => {
      btn.disabled = true;
      btn.textContent = '依頼中...';

      try {
        const result = await requestReview(ESSAY_ID);
        const nowIso = new Date().toISOString();

        state.reviews = [];
        state.currentReview = null;
        state.currentVersion = {
          id: result.versionId,
          content: content,
          created_at: nowIso
        };

        refreshComments();
        applyMode(state.mode);
        updateLastRequestTime();
        showToast('レビューを依頼しました！先生の添削をお待ちください。', 'success', 4000);
      } catch (e) {
        console.error('Review request failed:', e);
        showToast(`レビュー依頼に失敗しました: ${e.message}`, 'error', 5000);
      } finally {
        btn.disabled = false;
        btn.textContent = 'レビュー依頼';
      }
    },
    { okLabel: 'レビューを依頼する' }
  );
}

// ================================================================
// レビュー提出
// ================================================================
async function handleSubmitReview() {
  const btn = $('#btn-submit-review');
  const myRev = state.reviews.find(r => r.is_mine) || state.currentReview;
  if (!btn || !myRev?.id) return;

  if (myRev.submitted_at) {
    showToast('このレビューは既に提出済みです。', 'warning', 3000);
    return;
  }

  state.currentReview = myRev;

  showConfirmModal(
    'レビューを提出しますか？\n提出後は編集できなくなります。',
    async () => {
      btn.disabled = true;
      btn.textContent = '提出中...';

      try {
        await window._comments?.forceSave();
        await submitReview(state.currentReview.id);
        state.currentReview.submitted_at = new Date().toISOString();

        if (state.currentVersion?.id) {
          clearDraftLocally(state.currentVersion.id);
        }

        refreshComments();
        applyMode(state.mode);

        btn.disabled = true;
        btn.textContent = '提出済み';
        showToast('レビューを提出しました！', 'success', 4000);
      } catch (e) {
        console.error('Submit failed:', e);
        showToast(`提出に失敗しました: ${e.message}`, 'error', 5000);
        btn.disabled = false;
        btn.textContent = 'レビュー提出';
      }
    },
    { okLabel: '提出する', danger: true }
  );
}

// ================================================================
// パネルリサイズ（2パネル）
// ================================================================
function initResizablePanels() {
  const main = document.querySelector('.app-main');
  if (!main) return;

  const dividers = main.querySelectorAll('.panel-divider[data-divider]');

  // 初期カラム幅 70:30
  let cols = [70, 30];

  function applyGridCols() {
    main.style.gridTemplateColumns = `${cols[0]}fr 4px ${cols[1]}fr`;
  }

  dividers.forEach((divider) => {
    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX    = e.clientX;
      const mainW     = main.getBoundingClientRect().width;
      const startCols = [...cols];

      divider.classList.add('panel-divider--dragging');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMove(e) {
        const dx    = e.clientX - startX;
        const dxPct = (dx / mainW) * 100;

        const newLeft  = startCols[0] + dxPct;
        const newRight = startCols[1] - dxPct;

        if (newLeft >= 20 && newRight >= 15) {
          cols[0] = newLeft;
          cols[1] = newRight;
          applyGridCols();
        }
      }

      function onUp() {
        divider.classList.remove('panel-divider--dragging');
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // ダブルクリックでリセット
    divider.addEventListener('dblclick', () => {
      cols = [70, 30];
      applyGridCols();
    });
  });
}

// ================================================================
// ユーティリティ
// ================================================================
function showLoading(show) {
  const el = $('#loading-overlay');
  if (el) el.hidden = !show;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  let str = String(dateStr).trim();
  if (!str.endsWith('Z') && !str.includes('+')) {
    str = str.replace(' ', 'T') + 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function updateLastRequestTime() {
  const el = $('#last-request-time');
  if (!el) return;

  if (state.currentVersion?.created_at) {
    const d = parseDate(state.currentVersion.created_at);
    if (d && !isNaN(d.getTime())) {
      const date = d.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      el.textContent = `最終提出: ${date}`;
      return;
    }
  }
  el.textContent = '';
}

function showError(message) {
  const el = $('#loading-overlay');
  if (el) {
    el.hidden = false;
    el.innerHTML = `<div class="loading-error"><p>${message.replace(/\n/g, '<br>')}</p><button onclick="location.reload()">再読み込み</button></div>`;
  }
}

// ================================================================
// 起動
// ================================================================
document.addEventListener('DOMContentLoaded', init);
