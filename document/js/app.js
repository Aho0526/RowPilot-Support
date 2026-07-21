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
  currentReview: null,   // { id, submitted_at, markdown_comment, itemMap }
};

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

  // メール通知設定
  setupEmailSetting();

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

  // メールラベル・プレースホルダーの更新
  if (window._app_updateEmailLabel) {
    window._app_updateEmailLabel(isTeacher);
  }

  // ボタンの active 状態
  $('#btn-mode-student').classList.toggle('mode-btn--active', !isTeacher);
  $('#btn-mode-teacher').classList.toggle('mode-btn--active', isTeacher);

  // ロールバッジ
  const badge = $('#role-badge');
  badge.textContent = isTeacher ? '先生モード' : '生徒モード';
  badge.className = `role-badge role-badge--${mode}`;

  // 履歴・差分タブは先生モードのみ表示
  const btnPanelDiff = $('#btn-panel-diff');
  if (btnPanelDiff) {
    btnPanelDiff.style.display = isTeacher ? '' : 'none';
  }

  // 生徒モードに切り替えたとき、差分タブが開いていたら編集タブに強制リセット
  if (!isTeacher) {
    const btnPanelEdit = $('#btn-panel-edit');
    const textarea = $('#essay-textarea');
    const diffDiv = $('#essay-diff');
    const controlsBar = $('#diff-controls-bar');
    const metaInfo = $('#essay-meta-info');
    btnPanelEdit?.classList.add('panel-tab--active');
    btnPanelDiff?.classList.remove('panel-tab--active');
    if (textarea) textarea.style.display = '';
    if (diffDiv) diffDiv.style.display = 'none';
    if (controlsBar) controlsBar.style.display = 'none';
    if (metaInfo) metaInfo.style.display = '';
    window._historyMode = false;
  }

  // エディタ
  if (window._editor && !window._historyMode) {
    const displayContent = isTeacher
      ? (state.currentVersion?.content ?? state.essay?.current_content ?? '')
      : (state.essay?.current_content ?? '');
    window._editor.setContent(displayContent);
    window._editor.setReadOnly(isTeacher);
  }

  const submitted = state.currentReview?.submitted_at;
  const hasReview = !!state.currentReview?.id;

  // チェックリスト
  if (window._checklist) {
    window._checklist.setInteractive(isTeacher && hasReview && !submitted);
    window._checklist.setMode(isTeacher);
  }

  // チェックリストのヒント表示
  const hintEl = $('#checklist-mode-hint');
  if (hintEl) {
    if (isTeacher) {
      if (!hasReview) {
        hintEl.innerHTML = '<span class="hint-text text-warning" style="color:var(--color-warning);font-weight:600">⚠️ レビュー依頼がありません</span>';
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

  // ツールバーボタン表示切替
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

    if (state.currentReview) {
      window._checklist.setItemMap(state.currentReview.itemMap ?? {});
      window._comments.setContent(
        state.currentReview.markdown_comment,
        state.currentReview.submitted_at
      );
    }

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
    const review = await getReview(versionId);
    state.currentReview = review;
  } catch (e) {
    console.error('Failed to load review:', e);
  }
}

// ================================================================
// リアルタイム自動同期（他端末・他タブとのライブ同期）
// ================================================================
let isSyncing = false;

function startLiveSync() {
  // 3秒ごとのバックグラウンド同期
  setInterval(syncLatestData, 3000);

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

    // 2. バージョン＆レビュー状態の同期
    const versionIdChanged = serverLatestVersion?.id !== state.currentVersion?.id;
    state.currentVersion = serverLatestVersion;

    if (serverLatestVersion?.review_id) {
      const serverReview = await getReview(serverLatestVersion.id);

      const commentTextarea = document.querySelector('.cm-textarea');
      const isEditingComment = document.activeElement === commentTextarea;

      const reviewStateChanged =
        versionIdChanged ||
        serverReview?.submitted_at !== state.currentReview?.submitted_at ||
        JSON.stringify(serverReview?.itemMap) !== JSON.stringify(state.currentReview?.itemMap) ||
        (!isEditingComment && serverReview?.markdown_comment !== state.currentReview?.markdown_comment);

      if (reviewStateChanged) {
        state.currentReview = serverReview;

        if (window._checklist) {
          window._checklist.setItemMap(serverReview?.itemMap ?? {});
        }

        if (window._comments && !isEditingComment) {
          window._comments.setContent(
            serverReview?.markdown_comment,
            serverReview?.submitted_at
          );
        }

        applyMode(state.mode);
        updateLastRequestTime();
      }
    } else if (state.currentReview !== null) {
      state.currentReview = null;
      window._checklist?.setItemMap({});
      window._comments?.setContent('', null);
      applyMode(state.mode);
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
      } catch (e) {
        console.error('Checklist update failed:', e);
      }
    },
  });

  // コメント
  window._comments = new Comments($('#comments-container'), {
    getReviewMeta: () => state.currentReview
      ? { reviewId: state.currentReview.id, submittedAt: state.currentReview.submitted_at }
      : null,
  });
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
    if (state.currentReview?.submitted_at) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = '提出済み';
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
    alert('エッセイを入力してからレビューを依頼してください。');
    return;
  }

  // 前回提出時のバージョン内容と比較し、変更があるかチェック
  const latestContent = state.currentVersion?.content ?? '';
  if (content.trim() === latestContent.trim()) {
    alert('前回提出した内容から変更がありません。1文字以上変更してから依頼してください。');
    return;
  }

  if (!confirm('現在の内容でレビューを依頼しますか？\nこの操作で新しいバージョンが作成されます。')) return;

  btn.disabled = true;
  btn.textContent = '依頼中...';

  // 生徒が設定した「先生のメールアドレス」を取得して通知用に渡す
  const teacherEmail = window._app_getNotificationEmail ? window._app_getNotificationEmail() : '';

  try {
    const result = await requestReview(ESSAY_ID, teacherEmail);
    const nowIso = new Date().toISOString();
    state.currentReview = {
      id: result.reviewId,
      submitted_at: null,
      markdown_comment: '',
      itemMap: {},
    };
    state.currentVersion = {
      id: result.versionId,
      review_id: result.reviewId,
      content: content,
      created_at: nowIso
    };

    window._checklist.setItemMap({});
    window._comments.setContent('', null);

    applyMode(state.mode);
    updateLastRequestTime();
    alert('レビューを依頼しました！先生の添削をお待ちください。');
  } catch (e) {
    console.error('Review request failed:', e);
    alert(`レビュー依頼に失敗しました: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'レビュー依頼';
  }
}

// ================================================================
// レビュー提出
// ================================================================
async function handleSubmitReview() {
  const btn = $('#btn-submit-review');
  if (!btn || !state.currentReview?.id) return;

  if (state.currentReview.submitted_at) {
    alert('このレビューは既に提出済みです。');
    return;
  }

  if (!confirm('レビューを提出しますか？\n提出後は編集できなくなります。')) return;

  btn.disabled = true;
  btn.textContent = '提出中...';

  // 先生が設定した「生徒のメールアドレス」を取得して通知用に渡す
  const studentEmail = window._app_getNotificationEmail ? window._app_getNotificationEmail() : '';

  try {
    // コメントを先に保存
    await window._comments?.forceSave();

    await submitReview(state.currentReview.id, studentEmail);
    state.currentReview.submitted_at = new Date().toISOString();

    window._checklist.setInteractive(false);
    window._comments.setEditable(false);

    btn.textContent = '提出済み';
    alert('レビューを提出しました！');
  } catch (e) {
    console.error('Submit failed:', e);
    alert(`提出に失敗しました: ${e.message}`);
    btn.disabled = false;
    btn.textContent = 'レビュー提出';
  }
}

// ================================================================
// 通知メール設定（LocalStorage 保存）
// ================================================================
function setupEmailSetting() {
  const input = $('#email-setting-input');
  const label = $('#email-setting-label');
  if (!input) return;

  // モード別のLocalStorageキー
  const getKey = (isTeacher) => isTeacher ? 'notification_email_teacher' : 'notification_email_student';

  // ロールに応じてラベル・値・プレースホルダーをすべて切り替える
  const updateEmailLabel = (isTeacher) => {
    if (label) label.textContent = isTeacher ? '生徒のメアド:' : '先生のメアド:';
    if (input) {
      input.placeholder = isTeacher ? '生徒のメールアドレス' : '先生のメールアドレス';
      // 切り替え後のモードに対応した保存値を読み込む
      input.value = localStorage.getItem(getKey(isTeacher)) ?? '';
    }
  };

  updateEmailLabel(state.mode === 'teacher');

  // 入力されたら現在のモードのキーで即保存
  input.addEventListener('input', (e) => {
    const isTeacher = state.mode === 'teacher';
    localStorage.setItem(getKey(isTeacher), e.target.value.trim());
  });

  // グローバルに切り替えメソッドを登録（applyModeから更新するため）
  window._app_updateEmailLabel = updateEmailLabel;
  // 送信時に現在モードのメールアドレスを取得するヘルパーも登録
  window._app_getNotificationEmail = () => {
    const isTeacher = state.mode === 'teacher';
    return localStorage.getItem(getKey(isTeacher)) ?? '';
  };
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
    if (textarea) textarea.style.display = '';
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
    if (state.currentReview) {
      window._checklist.setItemMap(state.currentReview.itemMap ?? {});
      window._checklist.setInteractive(state.mode === 'teacher' && !state.currentReview.submitted_at);
      window._comments.setContent(state.currentReview.markdown_comment, state.currentReview.submitted_at);
      window._comments.setEditable(state.mode === 'teacher');
    } else {
      window._checklist.setItemMap({});
      window._checklist.setInteractive(false);
      window._comments.setContent('', null);
      window._comments.setEditable(false);
    }
  });

  // 【履歴・差分タブ】クリック時
  btnDiff.addEventListener('click', async () => {
    btnEdit.classList.remove('panel-tab--active');
    btnDiff.classList.add('panel-tab--active');
    if (textarea) textarea.style.display = 'none';
    if (diffDiv) diffDiv.style.display = 'block';
    if (controlsBar) controlsBar.style.display = 'flex';
    if (metaInfo) metaInfo.style.display = 'none';

    window._historyMode = true;
    window._editor.setReadOnly(true);

    // バージョン選択プルダウンの読み込み・更新
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
      const date = (d && !isNaN(d.getTime())) ? d.toLocaleDateString('ja-JP', {
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
        const review = await getReview(version.id);
        if (review) {
          window._checklist.setItemMap(review.itemMap ?? {});
          window._comments.setContent(review.markdown_comment, review.submitted_at);
        } else {
          window._checklist.setItemMap({});
          window._comments.setContent('', null);
        }
      } else {
        window._checklist.setItemMap({});
        window._comments.setContent('', null);
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

  // 原文/差分トグルのイベント
  const btnRaw = $('#btn-view-raw');
  const btnDiff = $('#btn-view-diff');
  if (btnRaw && btnDiff) {
    btnRaw.addEventListener('click', () => window._app_setViewMode('raw'));
    btnDiff.addEventListener('click', () => window._app_setViewMode('diff'));
  }

  // Split/Unifiedトグルのイベント
  const btnSplit = $('#btn-diff-split');
  const btnUnified = $('#btn-diff-unified');
  if (btnSplit && btnUnified) {
    btnSplit.addEventListener('click', () => window._app_setViewType('split'));
    btnUnified.addEventListener('click', () => window._app_setViewType('unified'));
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
  const textarea      = $('#essay-textarea');
  const diffDiv       = $('#essay-diff');
  const btnRaw        = $('#btn-view-raw');
  const btnDiff       = $('#btn-view-diff');

  if (mode === 'raw') {
    if (textarea) textarea.style.display = 'block';
    if (diffDiv)  diffDiv.style.display  = 'none';
    btnRaw?.classList.add('active');
    btnDiff?.classList.remove('active');
  } else {
    if (textarea) textarea.style.display = 'none';
    if (diffDiv)  diffDiv.style.display  = 'block';
    btnRaw?.classList.remove('active');
    btnDiff?.classList.add('active');
    window._app_renderDiff();
  }
};

window._app_setCompareType = (type) => {
  window._diffCompareType = type;
  window._app_renderDiff();
};

window._app_setViewType = (type) => {
  window._diffViewType = type;
  $('#btn-diff-split')?.classList.toggle('active', type === 'split');
  $('#btn-diff-unified')?.classList.toggle('active', type === 'unified');
  window._app_renderDiff();
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
  const str = String(dateStr).trim();
  const isoStr = str.replace(' ', 'T') + (str.includes('T') || str.endsWith('Z') ? '' : 'Z');
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? new Date(str) : d;
}

function updateLastRequestTime() {
  const el = $('#last-request-time');
  if (!el) return;

  if (state.currentVersion?.created_at) {
    const d = parseDate(state.currentVersion.created_at);
    if (d && !isNaN(d.getTime())) {
      const date = d.toLocaleString('ja-JP', {
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
