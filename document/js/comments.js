/**
 * comments.js — コメントパネルモジュール（修正版）
 * - 生徒モード: コメントを読み取り専用で表示
 * - 先生モード: Markdown 編集・プレビュー切替・自動保存
 */

import { updateReview } from './api.js';

const renderMarkdown = (text) => {
  if (typeof window.marked !== 'undefined') {
    return window.marked.parse(text || '');
  }
  return `<pre style="white-space:pre-wrap">${escapeHtml(text || '')}</pre>`;
};

const escapeHtml = (str) =>
  String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const AUTOSAVE_DELAY_MS = 2000;

// ================================================================
// Comments クラス
// ================================================================
export class Comments {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   * @param {function(): object|null} options.getReviewMeta  { reviewId, submittedAt } を返す
   */
  constructor(container, { getReviewMeta } = {}) {
    this.container = container;
    this.getReviewMeta = getReviewMeta ?? (() => null);

    this._timer      = null;
    this._lastSaved  = '';
    this._editable   = false;
    this._submitted  = false;

    this._build();
  }

  // ── 公開API ─────────────────────────────────────────────────

  /** コメント内容をセット（サーバーから取得したデータを渡す） */
  setContent(markdown, submittedAt) {
    this._textarea.value = markdown ?? '';
    this._lastSaved      = this._textarea.value;
    this._submitted      = !!submittedAt;
    this._renderPreview();
    this._updateState();
  }

  /**
   * 編集可否をセット
   * true  = 先生モード（入力可）
   * false = 生徒モード（読み取り専用）
   */
  setEditable(enabled) {
    this._editable = enabled;
    this._updateState();
  }

  /** 現在のコメント内容を取得 */
  getContent() {
    return this._textarea.value;
  }

  /** 手動保存（await 可能） */
  async forceSave() {
    clearTimeout(this._timer);
    await this._save();
  }

  // ── プライベート ────────────────────────────────────────────

  _build() {
    this.container.innerHTML = `
      <div class="cm-header">
        <div class="cm-tabs" role="tablist">
          <button class="cm-tab cm-tab--active" data-tab="edit" role="tab" aria-selected="true">編集</button>
          <button class="cm-tab" data-tab="preview" role="tab" aria-selected="false">プレビュー</button>
        </div>
        <span class="cm-status" aria-live="polite"></span>
      </div>
      <div class="cm-body">
        <textarea
          class="cm-textarea"
          placeholder="先生モードでコメントを入力できます（Markdown 対応）&#10;&#10;例:&#10;## ② 現状分析について&#10;参考文献の選定理由をもう少し詳しく書くとよいです。"
          spellcheck="false"
          aria-label="レビューコメント"
        ></textarea>
        <div class="cm-preview" aria-live="polite"></div>
      </div>
      <div class="cm-notice"></div>
    `;

    this._textarea  = this.container.querySelector('.cm-textarea');
    this._preview   = this.container.querySelector('.cm-preview');
    this._statusEl  = this.container.querySelector('.cm-status');
    this._noticeEl  = this.container.querySelector('.cm-notice');

    // タブ切替
    this.container.querySelectorAll('.cm-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (!this._editable && !this._submitted) return;
        this._switchTab(tab.dataset.tab);
      });
    });

    // 入力時の自動保存
    this._textarea.addEventListener('input', () => {
      if (this._editable && !this._submitted) {
        this._setStatus('editing');
        this._scheduleAutoSave();
      }
    });

    // 初期状態は編集タブ表示
    this._currentTab = 'edit';
  }

  /** モード・提出状態に応じて UI を更新 */
  _updateState() {
    const submitted = this._submitted;
    const editable  = this._editable;

    if (submitted) {
      // 提出済み: 常にプレビュー表示・編集不可
      this._textarea.readOnly = true;
      this._switchTab('preview');
      this._setNotice('添削が提出されました。');
    } else if (editable) {
      // 先生モード: 編集可能
      this._textarea.readOnly = false;
      this._switchTab('edit');
      this._clearNotice();
      const meta = this.getReviewMeta();
      if (!meta?.reviewId) {
        this._setNotice('⚠️ 生徒が「レビュー依頼」を送ると、コメントが保存されます。', 'warning');
      }
    } else {
      // 生徒モード: 読み取り専用
      this._textarea.readOnly = true;
      // コメントがあればプレビュー、なければ edit タブ（空欄を表示）
      if (this._textarea.value.trim()) {
        this._renderPreview();
        this._switchTab('preview');
      } else {
        this._switchTab('edit');
      }
      this._setNotice('先生モードでコメントを入力できます。', 'info');
    }
  }

  _switchTab(tab) {
    this._currentTab = tab;
    const tabs = this.container.querySelectorAll('.cm-tab');
    tabs.forEach((t) => {
      const active = t.dataset.tab === tab;
      t.classList.toggle('cm-tab--active', active);
      t.setAttribute('aria-selected', String(active));
    });

    if (tab === 'preview') {
      this._renderPreview();
      this._textarea.style.display = 'none';
      this._preview.style.display  = '';
    } else {
      this._textarea.style.display = '';
      this._preview.style.display  = 'none';
    }
  }

  _renderPreview() {
    const html = renderMarkdown(this._textarea.value);
    this._preview.innerHTML = html
      || '<p class="cm-empty">コメントはまだありません</p>';
  }

  _scheduleAutoSave() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._save(), AUTOSAVE_DELAY_MS);
  }

  async _save() {
    if (!this._editable || this._submitted) return;
    const meta = this.getReviewMeta();
    if (!meta?.reviewId) return;  // レビューがまだ作成されていない

    const content = this._textarea.value;
    if (content === this._lastSaved) {
      this._setStatus('saved');
      return;
    }

    this._setStatus('saving');
    try {
      await updateReview(meta.reviewId, { markdown_comment: content });
      this._lastSaved = content;
      this._setStatus('saved');
    } catch (e) {
      console.error('Comment save failed:', e);
      this._setStatus('error');
    }
  }

  _setStatus(state) {
    if (!this._statusEl) return;
    const labels = {
      editing: '編集中...',
      saving:  '保存中...',
      saved:   '保存済み',
      error:   '保存失敗',
    };
    this._statusEl.textContent = labels[state] ?? '';
    this._statusEl.className = `cm-status cm-status--${state}`;
  }

  _setNotice(text, type = 'default') {
    if (!this._noticeEl) return;
    this._noticeEl.textContent = text;
    this._noticeEl.className = `cm-notice cm-notice--${type}`;
    this._noticeEl.hidden = false;
  }

  _clearNotice() {
    if (!this._noticeEl) return;
    this._noticeEl.textContent = '';
    this._noticeEl.hidden = true;
  }
}
