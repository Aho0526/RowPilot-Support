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

  // モードに応じた初期化
  applyMode(state.mode, { initial: true });

  // ツールバーボタン
  setupToolbar();

  // パネルリサイズ
  initResizablePanels();
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

  // エディタ
  if (window._editor) {
    window._editor.setReadOnly(isTeacher);
  }

  const submitted = state.currentReview?.submitted_at;
  const hasReview = !!state.currentReview?.id;

  // チェックリスト
  if (window._checklist) {
    window._checklist.setInteractive(isTeacher && hasReview && !submitted);
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

    // コンテンツ反映
    window._editor.setContent(state.essay.current_content);

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

  if (!confirm('現在の内容でレビューを依頼しますか？\nこの操作で新しいバージョンが作成されます。')) return;

  btn.disabled = true;
  btn.textContent = '依頼中...';

  // 生徒が設定した「先生のメールアドレス」を取得して通知用に渡す
  const teacherEmail = localStorage.getItem('notification_email') ?? '';

  try {
    const result = await requestReview(ESSAY_ID, teacherEmail);
    state.currentReview = {
      id: result.reviewId,
      submitted_at: null,
      markdown_comment: '',
      itemMap: {},
    };
    state.currentVersion = { id: result.versionId, review_id: result.reviewId };

    window._checklist.setItemMap({});
    window._comments.setContent('', null);

    applyMode(state.mode);
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
  const studentEmail = localStorage.getItem('notification_email') ?? '';

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

  // 保存済みの通知先メールアドレスをロード
  const savedEmail = localStorage.getItem('notification_email') ?? '';
  input.value = savedEmail;

  // ロールに応じたラベルとプレースホルダーの設定
  const updateEmailLabel = (isTeacher) => {
    if (label) label.textContent = isTeacher ? '生徒のメアド:' : '先生のメアド:';
    if (input) input.placeholder = isTeacher ? '生徒のメールアドレス' : '先生のメールアドレス';
  };

  updateEmailLabel(state.mode === 'teacher');

  // 入力されたら即保存
  input.addEventListener('input', (e) => {
    localStorage.setItem('notification_email', e.target.value.trim());
  });

  // グローバルに切り替えメソッドを登録（applyModeから更新するため）
  window._app_updateEmailLabel = updateEmailLabel;
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
    window._editor.setContent(state.essay.current_content);
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
      const date = new Date(v.created_at).toLocaleDateString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = `v${num} (${date})`;
      select.appendChild(option);
    });

    // 初期状態で一番最新のバージョンを選択して表示
    await selectDiffVersion(parseInt(select.value, 10));
  } catch (e) {
    console.error('Failed to load version select:', e);
    diffDiv.innerHTML = '<p class="cm-empty" style="padding: 24px; color: var(--color-danger)">履歴の読み込みに失敗しました。</p>';
  }
}

async function selectDiffVersion(versionId) {
  if (!versionId) return;

  try {
    const v = await getVersion(ESSAY_ID, versionId);
    window._historyContent = v.content;
    window._currentDraftContent = state.essay.current_content;

    // 前のバージョンを検索して比較元（Base）にする
    let prevContent = '';
    if (state.versions) {
      const idx = state.versions.findIndex(ver => ver.id === versionId);
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
    const idx = state.versions.findIndex(ver => ver.id === versionId);
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
  }
}

// ── 差分オプションコントロール初期化 ──────────────────────────
function setupDiffControls() {
  const select = $('#diff-version-select');
  if (select) {
    select.addEventListener('change', (e) => {
      selectDiffVersion(parseInt(e.target.value, 10));
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
