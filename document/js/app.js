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

// ================================================================
// ツールバー
// ================================================================
function setupToolbar() {
  // レビュー依頼ボタン（生徒）
  $('#btn-request-review')?.addEventListener('click', handleRequestReview);

  // レビュー提出ボタン（先生）
  $('#btn-submit-review')?.addEventListener('click', handleSubmitReview);

  // 履歴ボタン
  $('#btn-history')?.addEventListener('click', openHistory);

  // 履歴モーダルを閉じる
  $('#history-close')?.addEventListener('click', closeHistory);
  $('#history-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeHistory();
  });
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

  try {
    const result = await requestReview(ESSAY_ID);
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

  try {
    // コメントを先に保存
    await window._comments?.forceSave();

    await submitReview(state.currentReview.id);
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
// 履歴
// ================================================================
async function openHistory() {
  const overlay = $('#history-overlay');
  const list = $('#history-list');
  if (!overlay || !list) return;

  list.innerHTML = '<li class="history-loading">読み込み中...</li>';
  overlay.classList.add('visible');

  try {
    const versions = await getVersions(ESSAY_ID);
    if (versions.length === 0) {
      list.innerHTML = '<li class="history-empty">まだレビュー依頼はありません</li>';
      return;
    }

    list.innerHTML = '';
    versions.forEach((v, i) => {
      const li = document.createElement('li');
      li.className = 'history-item';

      const num = versions.length - i;
      const date = new Date(v.created_at).toLocaleString('ja-JP');
      const status = v.submitted_at
        ? `<span class="history-badge history-badge--done">添削済み</span>`
        : `<span class="history-badge history-badge--pending">添削待ち</span>`;

      li.innerHTML = `
        <div class="history-item-header">
          <span class="history-num">バージョン ${num}</span>
          ${status}
        </div>
        <div class="history-date">${date}</div>
        ${v.markdown_comment ? `<div class="history-comment">${escapeHtml(v.markdown_comment.slice(0, 80))}…</div>` : ''}
      `;

      li.addEventListener('click', () => loadHistoryVersion(v));
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = `<li class="history-error">読み込みに失敗しました: ${e.message}</li>`;
  }
}

function closeHistory() {
  $('#history-overlay')?.classList.remove('visible');
  // 履歴表示を解除して現在の下書きに戻る
  if (window._historyMode) {
    window._historyMode = false;
    window._editor.setContent(state.essay.current_content);
    window._editor.setReadOnly(state.mode === 'teacher');
    $('#history-banner')?.remove();

    // エディタとDiff表示をリセット
    const textarea = $('#essay-textarea');
    const diffDiv = $('#essay-diff');
    if (textarea) textarea.style.display = '';
    if (diffDiv) diffDiv.style.display = 'none';
  }
}

// LCS差分アルゴリズム
function diffTexts(oldText, newText) {
  const s1 = oldText || '';
  const s2 = newText || '';
  const memo = Array.from({ length: s1.length + 1 }, () => Array(s2.length + 1).fill(0));

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        memo[i][j] = memo[i - 1][j - 1] + 1;
      } else {
        memo[i][j] = Math.max(memo[i - 1][j], memo[i][j - 1]);
      }
    }
  }

  let i = s1.length;
  let j = s2.length;
  const result = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && s1[i - 1] === s2[j - 1]) {
      result.push({ type: 'equal', text: s1[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || memo[i][j - 1] >= memo[i - 1][j])) {
      result.push({ type: 'insert', text: s2[j - 1] });
      j--;
    } else {
      result.push({ type: 'delete', text: s1[i - 1] });
      i--;
    }
  }

  result.reverse();

  const merged = [];
  for (const item of result) {
    const last = merged[merged.length - 1];
    if (last && last.type === item.type) {
      last.text += item.text;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

window._app_toggleDiffMode = (showDiff) => {
  const textarea = $('#essay-textarea');
  const diffDiv = $('#essay-diff');
  const btnRaw = $('#btn-raw-mode');
  const btnDiff = $('#btn-diff-mode');
  if (!textarea || !diffDiv) return;

  if (showDiff) {
    textarea.style.display = 'none';
    diffDiv.style.display = 'block';
    btnRaw?.classList.remove('active');
    btnDiff?.classList.add('active');

    const diff = diffTexts(window._historyContent, window._currentDraftContent);
    diffDiv.innerHTML = diff.map(item => {
      if (item.type === 'insert') {
        return `<ins class="diff-ins">${escapeHtml(item.text)}</ins>`;
      } else if (item.type === 'delete') {
        return `<del class="diff-del">${escapeHtml(item.text)}</del>`;
      } else {
        return escapeHtml(item.text);
      }
    }).join('');
  } else {
    textarea.style.display = 'block';
    diffDiv.style.display = 'none';
    btnRaw?.classList.add('active');
    btnDiff?.classList.remove('active');
  }
};

async function loadHistoryVersion(version) {
  closeHistory();
  try {
    const v = await getVersion(ESSAY_ID, version.id);
    window._historyContent = v.content;
    window._currentDraftContent = state.essay.current_content;
    window._historyMode = true;

    // エディタに過去の内容を設定（原文表示用）
    window._editor.setContent(v.content);
    window._editor.setReadOnly(true);

    // 履歴表示中のバナー
    let banner = $('#history-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'history-banner';
      banner.className = 'history-banner';
      document.querySelector('.app-header')?.after(banner);
    }
    const date = new Date(version.created_at).toLocaleString('ja-JP');
    banner.innerHTML = `
      <span>過去バージョンを表示中（${date}）</span>
      <div style="display:inline-flex; gap:6px;">
        <button id="btn-raw-mode" class="active" onclick="window._app_toggleDiffMode(false)">原文</button>
        <button id="btn-diff-mode" onclick="window._app_toggleDiffMode(true)">現在との差分</button>
      </div>
      <button onclick="window._app_closeHistory()">現在の下書きに戻る</button>
    `;

    // デフォルトで差分モードを表示
    window._app_toggleDiffMode(true);

    // チェックリスト・コメントも反映
    if (version.review_id) {
      const review = await getReview(version.id);
      if (review) {
        window._checklist.setItemMap(review.itemMap ?? {});
        window._comments.setContent(review.markdown_comment, review.submitted_at);
        window._checklist.setInteractive(false);
        window._comments.setEditable(false);
      }
    }
  } catch (e) {
    alert(`バージョンの読み込みに失敗しました: ${e.message}`);
  }
}

// グローバルにバインド
window._app_closeHistory = closeHistory;

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
