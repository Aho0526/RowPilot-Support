/**
 * app.js — メインエントリポイント
 * モード管理・画面初期化・各モジュールの協調処理
 */

import { Editor }    from './editor.js';
import { Checklist } from './checklist.js';
import { Comments }  from './comments.js';
import {
  getEssay,
  getVersions,
  getVersion,
  getReview,
  createReview,
  requestReview,
  updateReview,
  submitReview,
} from './api.js';
import {
  diffLines,
  alignDiffLines,
  renderUnifiedHtml,
  renderSplitHtml,
} from './diff.js';
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
const ESSAY_ID = 1;
const MODE_KEY = 'doc_mode';  // localStorage キー

// ================================================================
// 状態
// ================================================================
const state = {
  mode: localStorage.getItem(MODE_KEY) ?? 'student',  // 'student' | 'teacher'
  essay: null,
  currentVersion: null,
  currentReview: null,   // 編集・表示対象のアクティブなレビュー（先生モード: 自端末のレビュー）
  reviews: [],           // 現在表示中バージョンの全レビュー配列
  selectedReviewIdForStudent: null, // 生徒モードで選択されているレビューID（null=Overview）
};

// 端末識別子（ブラウザ起動時に確定）
const DEVICE_ID = getDeviceId();

// ================================================================
// DOM 要素
// ================================================================
const $ = (sel) => document.querySelector(sel);

// ================================================================
// アプリケーション初期化
// ================================================================
async function init() {
  // モード切替ボタンの設定
  setupModeToggle();

  // データ取得
  await loadEssay();

  // 左パネルタブ（編集 / 履歴・差分）初期化
  initLeftPanelTabs();

  // 差分コントロールのイベント設定
  setupDiffControls();

  // モードに応じた初期化
  applyMode(state.mode, { initial: true });

  // ツールバーボタン
  setupToolbar();

  // パネルリサイズ
  initResizablePanels();

  // リアルタイム自動同期 (3秒ごとの定期同期＆タブ・フォーカス復帰時同期)
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

  // 先生モード: 「編集」タブを「原文」に変更して表示、「履歴・差分」タブも表示
  // 生徒モード: 「編集」タブを表示、「履歴・差分」タブは非表示
  const btnPanelEdit = $('#btn-panel-edit');
  const btnPanelDiff = $('#btn-panel-diff');
  if (btnPanelEdit) {
    btnPanelEdit.textContent = isTeacher ? '原文' : '編集';
    btnPanelEdit.style.display = '';
  }
  if (btnPanelDiff) {
    btnPanelDiff.style.display = isTeacher ? '' : 'none';
  }

  // 共通ヘルパー: editorWrapper を確実に取得（_setupHighlighter実行後に生成される）
  const getEditorWrapper = () =>
    document.querySelector('.editor-wrapper') || $('#essay-textarea');

  if (isTeacher) {
    // 先生モード初期状態: 「原文」タブをアクティブにし、原文を表示。
    btnPanelEdit?.classList.add('panel-tab--active');
    btnPanelDiff?.classList.remove('panel-tab--active');
    const editorWrapper = getEditorWrapper();
    const diffDiv = $('#essay-diff');
    const controlsBar = $('#diff-controls-bar');
    const metaInfo = $('#essay-meta-info');
    if (editorWrapper) editorWrapper.style.display = 'flex';
    if (diffDiv) diffDiv.style.display = 'none';
    if (controlsBar) controlsBar.style.display = 'none';
    if (metaInfo) metaInfo.style.display = '';
    window._historyMode = false;
  } else {
    // 生徒モードに切り替えたとき: 編集タブに強制リセット
    btnPanelEdit?.classList.add('panel-tab--active');
    btnPanelDiff?.classList.remove('panel-tab--active');
    const editorWrapper = getEditorWrapper();
    const diffDiv = $('#essay-diff');
    const controlsBar = $('#diff-controls-bar');
    const metaInfo = $('#essay-meta-info');
    if (editorWrapper) editorWrapper.style.display = 'flex';
    if (diffDiv) diffDiv.style.display = 'none';
    if (controlsBar) controlsBar.style.display = 'none';
    if (metaInfo) metaInfo.style.display = '';
    window._historyMode = false;
  }

  // エディタ（先生モードでは readOnly・提出バージョンを表示、生徒は最新下書き）
  if (window._editor && !window._historyMode) {
    const displayContent = isTeacher
      ? (state.currentVersion?.content ?? state.essay?.current_content ?? '')
      : (state.essay?.current_content ?? '');
    window._editor.setContent(displayContent);
    window._editor.setReadOnly(isTeacher);
    // editorWrapper が非表示になっていたら flex に戻す（先生モード切替直後の表示保証）
    if (!window._historyMode) {
      const ew = getEditorWrapper();
      if (ew && ew.style.display === 'none') ew.style.display = 'flex';
    }
  }

  // 先生モードの場合は自端末のレビュー(is_mine)を基準にする
  const myReview = isTeacher ? (state.reviews.find(r => r.is_mine) || state.currentReview) : state.currentReview;
  const submitted = myReview?.submitted_at;
  const hasReview = !!myReview?.id;
  // レビュー依頼がある（他先生でもいい）
  const hasAnyRequest = state.reviews.length > 0 || (state.currentVersion?.id != null);

  // チェックリスト
  if (window._checklist) {
    window._checklist.setInteractive(isTeacher && hasReview && !submitted);
  }

  // チェックリストのヒント表示
  const hintEl = $('#checklist-mode-hint');
  if (hintEl) {
    if (isTeacher) {
      if (!hasAnyRequest) {
        hintEl.innerHTML = '<span class="hint-text text-warning" style="color:var(--color-warning);font-weight:600">⚠️ レビュー依頼がありません</span>';
      } else if (!hasReview) {
        hintEl.innerHTML = '<span class="hint-text text-warning" style="color:var(--color-warning);font-weight:600">✏️ 添削を始めるにはコメント欄から「添削を始める」をクリック</span>';
      } else if (submitted) {
        hintEl.innerHTML = '<span class="hint-text">提出済み（閲覧のみ）</span>';
      } else {
        hintEl.innerHTML = '<span class="hint-text text-success" style="color:var(--color-success);font-weight:600">添削可能</span>';
      }
    } else {
      hintEl.innerHTML = '<span class="hint-text">閲覧のみ</span>';
    }
  }

  // コメント
  if (window._comments) {
    window._comments.setEditable(isTeacher);
  }

  // 評価データ・コメントの再描画
  refreshChecklistAndComments();

  // ツールバーボタン表示切替
  updateToolbarVisibility(isTeacher);
}

/**
 * チェックリストとコメントを現在の選択に合わせて再描画するヘルパー
 */
function refreshChecklistAndComments() {
  const isTeacher = state.mode === 'teacher';

  if (window._checklist) {
    if (isTeacher) {
      // 先生モードのチェックリストは自分のレビュー(is_mine)のみを対象にする
      const myReviewId = state.reviews.find(r => r.is_mine)?.id ?? state.currentReview?.id;
      window._checklist.setReviews(state.reviews, myReviewId, true);
    } else {
      window._checklist.setReviews(state.reviews, state.selectedReviewIdForStudent, false);
    }
  }

  if (window._comments) {
    if (isTeacher) {
      // 先生モードは全レビューを渡し、is_mine フラグで自分のものを識別させる
      // 第3引数: バージョン（レビュー依頼）が存在するかを渡す
      window._comments.setContent(state.reviews, state.currentReview?.id, !!state.currentVersion?.id);
    } else {
      window._comments.setContent(state.reviews, null);
    }
  }
}

/**
 * チェックリストのヒント（添削可能/提出済み等）と setInteractive だけ更新する軽量ヘルパー。
 * syncLatestData から呼ぶ用（applyMode 全体を呼ぶより軽量）
 */
function updateChecklistHint() {
  const isTeacher = state.mode === 'teacher';
  const myReview = isTeacher ? (state.reviews.find(r => r.is_mine) || state.currentReview) : state.currentReview;
  const submitted = myReview?.submitted_at;
  const hasReview = !!myReview?.id;
  const hasAnyRequest = state.reviews.length > 0 || (state.currentVersion?.id != null);

  if (window._checklist) {
    window._checklist.setInteractive(isTeacher && hasReview && !submitted);
  }

  const hintEl = $('#checklist-mode-hint');
  if (hintEl) {
    if (isTeacher) {
      if (!hasAnyRequest) {
        hintEl.innerHTML = '<span class="hint-text text-warning" style="color:var(--color-warning);font-weight:600">⚠️ レビュー依頼がありません</span>';
      } else if (!hasReview) {
        hintEl.innerHTML = '<span class="hint-text text-warning" style="color:var(--color-warning);font-weight:600">✏️ 添削を始めるにはコメント欄から「添削を始める」をクリック</span>';
      } else if (submitted) {
        hintEl.innerHTML = '<span class="hint-text">提出済み（閲覧のみ）</span>';
      } else {
        hintEl.innerHTML = '<span class="hint-text text-success" style="color:var(--color-success);font-weight:600">添削可能</span>';
      }
    } else {
      hintEl.innerHTML = '<span class="hint-text">閲覧のみ</span>';
    }
  }

  updateToolbarVisibility(isTeacher);
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

    // レビュー取得（最新バージョンが存在する場合）
    if (state.currentVersion?.review_id) {
      await loadReview(state.currentVersion.id);
    }

    // モジュール初期化（初回のみ）
    initModules();

    // コンテンツ反映 (先生モードは依頼バージョン、生徒モードは最新下書き)
    const displayContent = (state.mode === 'teacher')
      ? (state.currentVersion?.content ?? state.essay?.current_content ?? '')
      : (state.essay?.current_content ?? '');
    window._editor.setContent(displayContent);

    // チェックリストとコメントを描画
    refreshChecklistAndComments();

    // タイトル表示
    const titleEl = $('#essay-title');
    if (titleEl) titleEl.textContent = state.essay.title;

    // 最終提出時間の表示更新
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
      // 自端末のレビューを currentReview に設定（is_mine フラグで特定）
      state.currentReview = state.reviews.find(r => r.is_mine) || null;
    } else {
      state.currentReview = null;
      state.selectedReviewIdForStudent = null; // デフォルトはOverview
    }
  } catch (e) {
    console.error('Failed to load reviews:', e);
  }
}

// ================================================================
// リアルタイム自動同期（他端末・他タブとのライブ同期）
// ================================================================
let isSyncing = false;

function startLiveSync() {
  // 1.5秒ごとの高速リアルタイム同期（Google Docs風）
  setInterval(syncLatestData, 1500);

  // タブ復帰・ウィンドウフォーカス時にも即時同期
  window.addEventListener('focus', syncLatestData);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncLatestData();
    }
  });
}

async function syncLatestData() {
  // すでに同期中、または履歴・差分閲覧モード中の場合は同期をスキップ
  if (isSyncing || window._historyMode) return;
  isSyncing = true;

  try {
    const data = await getEssay(ESSAY_ID);
    const serverEssay = data.essay;
    const serverLatestVersion = data.latestVersion;

    const versionIdChanged = serverLatestVersion?.id !== state.currentVersion?.id;

    // 1. エディタ本文の同期
    const textarea = $('#essay-textarea');
    const isEditingTextarea = document.activeElement === textarea;

    if (state.mode === 'student') {
      if (serverEssay && serverEssay.current_content !== state.essay?.current_content) {
        state.essay = serverEssay;
        if (!isEditingTextarea && window._editor && !window._historyMode) {
          window._editor.setContent(serverEssay.current_content);
        }
      }
    } else {
      // 先生モード: 生徒が提出済みの固定スナップショットを表示
      state.essay = serverEssay;
      if (versionIdChanged && window._editor && !window._historyMode) {
        const teacherDisplay = serverLatestVersion?.content ?? serverEssay?.current_content ?? '';
        window._editor.setContent(teacherDisplay);
      }
    }

    // 2. バージョン＆複数レビュー状態の同期
    const prevVersionId = state.currentVersion?.id;
    state.currentVersion = serverLatestVersion;

    // バージョンが新しくなった場合（生徒が次のレビュー依頼を送った）
    if (versionIdChanged && prevVersionId && state.mode === 'teacher') {
      // 旧バージョンで入力中だったコメントをローカルに退避
      const nameInput = document.querySelector('.cm-teacher-name-input');
      const textarea = document.querySelector('.cm-textarea');
      const draftName = nameInput ? nameInput.value : (state.currentReview?.teacher_name || '');
      const draftComment = textarea ? textarea.value : (state.currentReview?.markdown_comment || '');

      if (draftName || draftComment) {
        saveDraftLocally(prevVersionId, { teacherName: draftName, comment: draftComment });
      }
    }

    if (serverLatestVersion) {
      // サーバーからそのバージョンの全レビューを取得（device_id 付き）
      const serverReviews = await getReview(serverLatestVersion.id, DEVICE_ID);

      const commentTextarea = document.querySelector('.cm-textarea');
      const isEditingComment = document.activeElement === commentTextarea;

      // 編集中のレビュー内容が変わったか、あるいは全体のレビュー数が変わったかを検知
      const reviewsChanged =
        versionIdChanged ||
        state.reviews?.length !== serverReviews?.length ||
        JSON.stringify(state.reviews) !== JSON.stringify(serverReviews);

      if (reviewsChanged) {
        state.reviews = serverReviews || [];

        // 状態を同期
        if (state.mode === 'teacher') {
          // 自端末のレビューを is_mine フラグで特定
          const myReview = serverReviews.find(r => r.is_mine) || null;
          state.currentReview = myReview;

          // バージョンが変わった場合は旧バージョンのドラフトを引き継ぎ確認
          if (versionIdChanged && prevVersionId) {
            const oldDraft = loadDraftLocally(prevVersionId);
            if (oldDraft && window._comments && !myReview?.submitted_at) {
              window._comments.setPendingDraft(oldDraft);
            }
            // 1世代前以外の古いドラフトをクリーンアップ
            cleanupOldDrafts(prevVersionId);
          }
        } else {
          // 生徒モード：選択されていた先生IDがあれば保持、無ければ null (Overview)
          const prevSelectedId = state.selectedReviewIdForStudent;
          state.selectedReviewIdForStudent = serverReviews.some(r => r.id === prevSelectedId) ? prevSelectedId : null;
          state.currentReview = null;
        }

        refreshChecklistAndComments();
        updateChecklistHint();
        updateLastRequestTime();
      }
    } else if (state.reviews && state.reviews.length > 0) {
      state.reviews = [];
      state.currentReview = null;
      state.selectedReviewIdForStudent = null;
      refreshChecklistAndComments();
      updateChecklistHint();
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
  // エディタ
  window._editor = new Editor(
    $('#essay-textarea'),
    $('#save-status'),
    $('#char-count'),
    { essayId: ESSAY_ID }
  );

  // チェックリスト
  window._checklist = new Checklist($('#checklist-container'), {
    onToggle: async (key, checked) => {
      if (!state.currentReview?.id) return;
      try {
        await updateReview(state.currentReview.id, {
          items: [{ key, checked }],
        });
        // ローカルステートも同期
        if (state.currentReview.itemMap) {
          state.currentReview.itemMap[key] = checked;
        }
      } catch (e) {
        console.error('Checklist update failed:', e);
      }
    },
    onReviewSelect: (reviewId) => {
      // 生徒モードでの個別レビュー選択（またはOverview=null選択）
      state.selectedReviewIdForStudent = reviewId;
      refreshChecklistAndComments();
    }
  });

  // コメント
  window._comments = new Comments($('#comments-container'), {
    onReviewSelect: (reviewId) => {
      // 先生モードでの編集対象レビューの切り替え
      const rev = state.reviews.find(r => r.id === reviewId);
      if (rev) {
        state.currentReview = rev;
        refreshChecklistAndComments();
        // ツールバーのボタン表示状態も再評価
        updateToolbarVisibility(state.mode === 'teacher');
      }
    },
    onAddReview: async () => {
      // 自端末のレビューを作成（device_id で紐づけ）
      if (!state.currentVersion?.id) return;
      try {
        showLoading(true);
        const newRev = await createReview(state.currentVersion.id, '', DEVICE_ID);
        // is_mine を付与して登録
        const revWithMine = { ...newRev, is_mine: true };
        // 既存の同IDがなければ追加
        if (!state.reviews.find(r => r.id === revWithMine.id)) {
          state.reviews.push(revWithMine);
        } else {
          // 既存エントリを更新
          const idx = state.reviews.findIndex(r => r.id === revWithMine.id);
          if (idx !== -1) state.reviews[idx] = revWithMine;
        }
        state.currentReview = revWithMine;
        refreshChecklistAndComments();
        updateToolbarVisibility(state.mode === 'teacher');
        showLoading(false);
      } catch (e) {
        console.error('Failed to create new review:', e);
        showLoading(false);
      }
    },
    onSaveReview: (reviewId, name, comment) => {
      // 自動保存されたテキストを state に即時同期
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
      // 旧バージョンのドラフトを引き継いだ後にローカルキャッシュをクリア
      const prevVersionId = state.currentVersion ? state.currentVersion.id - 1 : null;
      if (prevVersionId) clearDraftLocally(prevVersionId);
    }
  });
}

// ================================================================
// UIユーティリティ: トースト通知 & 確認モーダル
// ================================================================

/** トースト通知を画面下部に一時表示 */
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

/**
 * ページ内確認モーダルを表示。OKなら onConfirm を呼ぶ。
 * native confirm の代替（ポップアップブロッカー回避）
 */
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

  // オーバーレイクリックでキャンセル
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function setupToolbar() {
  // レビュー依頼ボタン（生徒）
  $('#btn-request-review')?.addEventListener('click', handleRequestReview);

  // レビュー提出ボタン（先生）
  $('#btn-submit-review')?.addEventListener('click', handleSubmitReview);
}

function updateToolbarVisibility(isTeacher) {
  const btnRequest = $('#btn-request-review');
  const btnSubmit  = $('#btn-submit-review');

  if (btnRequest) btnRequest.style.display = isTeacher ? 'none' : '';
  if (btnSubmit)  btnSubmit.style.display  = isTeacher ? '' : 'none';

  if (btnSubmit) {
    // 先生モードの提出ボタンは自端末のレビューがある場合のみ有効
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

  // 保存を先に実行
  await window._editor?.forceSave();

  const content = window._editor?.getContent() ?? '';
  if (!content.trim()) {
    showToast('エッセイを入力してからレビューを依頼してください。', 'warning', 4000);
    return;
  }

  // 前回提出時のバージョン内容と比較し、変更があるかチェック
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

        // バージョン作成のみ（レビューは先生が端末ごとに POST /reviews で作成）
        state.reviews = [];
        state.currentReview = null;
        state.selectedReviewIdForStudent = null;

        state.currentVersion = {
          id: result.versionId,
          content: content,
          created_at: nowIso
        };

        refreshChecklistAndComments();
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
  // is_mine のレビューを優先して参照
  const myRev = state.reviews.find(r => r.is_mine) || state.currentReview;
  if (!btn || !myRev?.id) return;

  if (myRev.submitted_at) {
    showToast('このレビューは既に提出済みです。', 'warning', 3000);
    return;
  }

  // state.currentReview を確実に myRev に同期させる
  state.currentReview = myRev;

  showConfirmModal(
    'レビューを提出しますか？\n提出後は編集できなくなります。',
    async () => {
      btn.disabled = true;
      btn.textContent = '提出中...';

      try {
        // コメントを先に保存
        await window._comments?.forceSave();

        await submitReview(state.currentReview.id);
        state.currentReview.submitted_at = new Date().toISOString();

        // 提出完了後はこのバージョンのローカルドラフトをクリア
        if (state.currentVersion?.id) {
          clearDraftLocally(state.currentVersion.id);
        }

        refreshChecklistAndComments();
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
// 左パネルタブ切替 (編集 / 履歴・差分)
// ================================================================
function initLeftPanelTabs() {
  const btnEdit = $('#btn-panel-edit');
  const btnDiff = $('#btn-panel-diff');
  const textarea = $('#essay-textarea');
  const diffDiv = $('#essay-diff');
  const controlsBar = $('#diff-controls-bar');
  const metaInfo = $('#essay-meta-info');

  if (!btnEdit || !btnDiff) return;

  // 【編集タブ】クリック時
  btnEdit.addEventListener('click', () => {
    btnEdit.classList.add('panel-tab--active');
    btnDiff.classList.remove('panel-tab--active');
    const editorWrapperEdit = document.querySelector('.editor-wrapper') || textarea;
    if (editorWrapperEdit) editorWrapperEdit.style.display = 'flex';
    if (diffDiv) diffDiv.style.display = 'none';
    if (controlsBar) controlsBar.style.display = 'none';
    if (metaInfo) metaInfo.style.display = '';

    // 履歴表示モード解除、通常エディタに戻る
    window._historyMode = false;
    const displayContent = (state.mode === 'teacher')
      ? (state.currentVersion?.content ?? state.essay?.current_content ?? '')
      : (state.essay?.current_content ?? '');
    window._editor.setContent(displayContent);
    window._editor.setReadOnly(state.mode === 'teacher');

    // 直近のチェックリスト・コメント状態に戻す
    if (state.mode === 'teacher') {
      const prevActiveId = state.currentReview?.id;
      state.currentReview = state.reviews.find(r => r.id === prevActiveId) || state.reviews[0] || null;
    } else {
      state.selectedReviewIdForStudent = null;
      state.currentReview = null;
    }

    window._checklist.setInteractive(state.mode === 'teacher' && state.currentReview && !state.currentReview.submitted_at);
    window._comments.setEditable(state.mode === 'teacher');
    
    refreshChecklistAndComments();
  });

  // 【履歴・差分タブ】クリック時
  btnDiff.addEventListener('click', async () => {
    btnEdit.classList.remove('panel-tab--active');
    btnDiff.classList.add('panel-tab--active');
    // editorWrapper を必ず非表示にする（原文と差分が同時表示されるバグを防ぐ）
    const editorWrapperDiff = document.querySelector('.editor-wrapper') || textarea;
    if (editorWrapperDiff) editorWrapperDiff.style.display = 'none';
    if (diffDiv) diffDiv.style.display = 'none'; // _app_setViewModeで制御する
    if (controlsBar) controlsBar.style.display = 'flex';
    if (metaInfo) metaInfo.style.display = 'none';

    window._historyMode = true;
    window._editor.setReadOnly(true);
    // viewMode を 'diff' に必ず初期化（初回クリック時に原文が見えてしまう問題を防ぐ）
    window._viewMode = 'diff';

    // バージョン選択プルダウンの読み込み・差分レンダリング
    await refreshDiffVersionSelect();
  });
}

// ================================================================
// バージョン選択プルダウン制御
// ================================================================
async function refreshDiffVersionSelect() {
  const select = $('#diff-version-select');
  const diffDiv = $('#essay-diff');
  if (!select || !diffDiv) return;

  try {
    const versions = await getVersions(ESSAY_ID);
    state.versions = versions;

    if (versions.length === 0) {
      select.innerHTML = '<option value="">履歴なし</option>';
      diffDiv.innerHTML = '<p class="cm-empty" style="padding: 24px;">まだ履歴（レビュー依頼）はありません。</p>';
      return;
    }

    select.innerHTML = '';
    versions.forEach((v, i) => {
      const num = versions.length - i;
      const d = parseDate(v.created_at);
      const date = (d && !isNaN(d.getTime())) ? d.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = `v${num} (${date})`;
      select.appendChild(option);
    });

    // 初期状態で一番最新のバージョンを選択して表示
    const firstId = select.value;
    if (firstId) await selectDiffVersion(firstId);
    // 差分表示エリアを必ず block にする（viewMode が 'diff' の場合のみ）
    if (window._viewMode !== 'raw') {
      window._app_setViewMode('diff');
    }
  } catch (e) {
    console.error('Failed to load version select:', e);
    diffDiv.innerHTML = '<p class="cm-empty" style="padding: 24px; color: var(--color-danger)">履歴の読み込みに失敗しました。</p>';
  }
}

async function selectDiffVersion(versionId) {
  // versionId は文字列または数値どちらでも対応
  const vid = String(versionId);
  if (!vid || vid === 'NaN' || vid === '') return;

  try {
    const v = await getVersion(ESSAY_ID, vid);
    window._historyContent = v.content;
    window._currentDraftContent = state.essay?.current_content ?? '';

    // 原文モード選択中であればエディタ内容をそのバージョンのテキストに更新
    if (window._viewMode === 'raw' && window._editor) {
      window._editor.setContent(v.content);
    }

    // 前のバージョンを検索して比較元（Base）にする
    let prevContent = '';
    if (state.versions) {
      const idx = state.versions.findIndex(ver => String(ver.id) === vid);
      if (idx !== -1 && idx + 1 < state.versions.length) {
        const prevVer = state.versions[idx + 1];
        const prevV = await getVersion(ESSAY_ID, prevVer.id);
        prevContent = prevV.content;
      }
    }
    window._historyPrevContent = prevContent;

    // 差分の描画
    window._app_renderDiff();

    // 選択されたバージョン当時のチェックリストと先生コメントも同期反映
    const idx = state.versions ? state.versions.findIndex(ver => String(ver.id) === vid) : -1;
    if (idx !== -1) {
      const version = state.versions[idx];
      if (version.review_id) {
        const reviews = await getReview(version.id);
        state.reviews = reviews || [];
        state.currentReview = null;
        state.selectedReviewIdForStudent = null; // デフォルトOverview
        refreshChecklistAndComments();
      } else {
        state.reviews = [];
        state.currentReview = null;
        state.selectedReviewIdForStudent = null;
        refreshChecklistAndComments();
      }
    }
    // 過去履歴の表示中は常に閲覧専用にする
    window._checklist.setInteractive(false);
    window._comments.setEditable(false);

  } catch (e) {
    console.error('Failed to select version:', e);
    const diffDiv = $('#essay-diff');
    if (diffDiv) diffDiv.innerHTML = `<p class="cm-empty" style="padding: 24px; color: var(--color-danger)">バージョン読み込みエラー: ${e.message}</p>`;
  }
}

// ── 差分オプションコントロール初期化 ──────────────────────────
function setupDiffControls() {
  const select = $('#diff-version-select');
  if (select) {
    select.addEventListener('change', (e) => {
      selectDiffVersion(e.target.value);
    });
  }

  const compareSelect = $('#diff-compare-select');
  if (compareSelect) {
    compareSelect.addEventListener('change', (e) => {
      window._app_setCompareType(e.target.value);
    });
  }

  // 分割表示/統合表示/原文トグルのイベント
  const btnSplit = $('#btn-diff-split');
  const btnUnified = $('#btn-diff-unified');
  const btnOriginal = $('#btn-diff-original');
  if (btnSplit && btnUnified && btnOriginal) {
    btnSplit.addEventListener('click', () => window._app_setViewType('split'));
    btnUnified.addEventListener('click', () => window._app_setViewType('unified'));
    btnOriginal.addEventListener('click', () => window._app_setViewType('original'));
  }
}


// ================================================================
// 差分表示制御（GitHub PR 風）
// ================================================================

// デフォルト設定
window._diffCompareType = 'prev';  // 'prev' | 'current'
window._diffViewType    = 'split'; // 'split' | 'unified'
window._viewMode        = 'diff';  // 'diff'  | 'raw'

window._app_renderDiff = () => {
  const diffDiv = $('#essay-diff');
  if (!diffDiv) return;

  const baseContent = window._diffCompareType === 'prev'
    ? (window._historyPrevContent || '')
    : (window._currentDraftContent || '');
  const targetContent = window._historyContent || '';

  const diffResults  = diffLines(baseContent, targetContent);
  const alignedRows  = alignDiffLines(diffResults);

  diffDiv.innerHTML = window._diffViewType === 'split'
    ? renderSplitHtml(alignedRows)
    : renderUnifiedHtml(alignedRows);
};

window._app_setViewMode = (mode) => {
  window._viewMode = mode;
  const editorWrapper = document.querySelector('.editor-wrapper') || $('#essay-textarea');
  const diffDiv       = $('#essay-diff');

  if (mode === 'raw') {
    if (editorWrapper) editorWrapper.style.display = 'flex';
    if (diffDiv)       diffDiv.style.display       = 'none';
    // 原文表示時は選択されているバージョンのテキストをエディタにセット
    if (window._historyContent && window._editor) {
      window._editor.setContent(window._historyContent);
    }
  } else {
    if (editorWrapper) editorWrapper.style.display = 'none';
    if (diffDiv)       diffDiv.style.display       = 'block';
    window._app_renderDiff();
  }
};

window._app_setCompareType = (type) => {
  window._diffCompareType = type;
  window._app_renderDiff();
};

window._app_setViewType = (type) => {
  if (type === 'original') {
    window._app_setViewMode('raw');
  } else {
    window._diffViewType = type;
    window._app_setViewMode('diff');
  }
  $('#btn-diff-split')?.classList.toggle('active', type === 'split');
  $('#btn-diff-unified')?.classList.toggle('active', type === 'unified');
  $('#btn-diff-original')?.classList.toggle('active', type === 'original');
};

// ================================================================
// パネルリサイズ

// ================================================================
function initResizablePanels() {
  const main = document.querySelector('.app-main');
  if (!main) return;

  const dividers = main.querySelectorAll('.panel-divider[data-divider]');

  // 初期カラム幅（%）
  let cols = [40, 30, 30];

  function applyGridCols() {
    main.style.gridTemplateColumns =
      `${cols[0]}fr 4px ${cols[1]}fr 4px ${cols[2]}fr`;
  }

  dividers.forEach((divider) => {
    const divIdx = parseInt(divider.dataset.divider, 10); // 0 or 1

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX     = e.clientX;
      const mainW      = main.getBoundingClientRect().width;
      const startCols  = [...cols];

      divider.classList.add('panel-divider--dragging');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMove(e) {
        const dx    = e.clientX - startX;
        const dxPct = (dx / mainW) * 100;

        const left  = divIdx;       // 左側パネルのインデックス
        const right = divIdx + 1;   // 右側パネルのインデックス

        const newLeft  = startCols[left]  + dxPct;
        const newRight = startCols[right] - dxPct;

        if (newLeft >= 15 && newRight >= 15) {
          cols[left]  = newLeft;
          cols[right] = newRight;
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
      cols = [40, 30, 30];
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ================================================================
// 起動
// ================================================================
document.addEventListener('DOMContentLoaded', init);
