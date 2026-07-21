/**
 * editor.js — エッセイエディタモジュール
 * 自動保存（デバウンス）・文字数カウント・読み取り専用切替に対応
 */

import { saveEssay } from './api.js';

const AUTOSAVE_DELAY_MS = 2500;  // 入力停止後 2.5秒でセーブ

// ================================================================
// Editor クラス
// ================================================================
export class Editor {
  /**
   * @param {HTMLTextAreaElement} textarea  エディタ textarea 要素
   * @param {HTMLElement} statusEl          保存ステータス表示要素
   * @param {HTMLElement} countEl           文字数カウント表示要素
   * @param {object} options
   * @param {number} options.essayId        エッセイ ID
   */
  constructor(textarea, statusEl, countEl, { essayId } = {}) {
    this.textarea = textarea;
    this.statusEl = statusEl;
    this.countEl = countEl;
    this.essayId = essayId ?? 1;
    this._timer = null;
    this._lastSavedContent = '';
    this._readOnly = false;

    this._setupHighlighter();
    this._bindEvents();
  }

  // ── 公開API ─────────────────────────────────────────────────

  /** 初期コンテンツを設定 */
  setContent(content) {
    this.textarea.value = content ?? '';
    this._lastSavedContent = this.textarea.value;
    this._updateCount();
    this._renderHighlight();
  }

  /** 読み取り専用モード切替 */
  setReadOnly(enabled) {
    this._readOnly = enabled;
    this.textarea.readOnly = enabled;
    this.textarea.classList.toggle('editor--readonly', enabled);
  }

  /** 現在のコンテンツを取得 */
  getContent() {
    return this.textarea.value;
  }

  /** 手動保存（await 可能） */
  async forceSave() {
    clearTimeout(this._timer);
    await this._save();
  }

  // ── プライベート ────────────────────────────────────────────

  _setupHighlighter() {
    if (!this.textarea) return;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'editor-backdrop';

    const parent = this.textarea.parentNode;
    const wrapper = document.createElement('div');
    wrapper.className = 'editor-wrapper';

    parent.insertBefore(wrapper, this.textarea);
    wrapper.appendChild(this.backdrop);
    wrapper.appendChild(this.textarea);

    const syncScroll = () => {
      if (this.backdrop && this.textarea) {
        this.backdrop.scrollTop = this.textarea.scrollTop;
        this.backdrop.scrollLeft = this.textarea.scrollLeft;
      }
    };

    this.textarea.addEventListener('scroll', syncScroll);
    this.textarea.addEventListener('input', () => {
      this._renderHighlight();
      syncScroll();
    });

    this._renderHighlight();
  }

  _renderHighlight() {
    if (!this.backdrop || !this.textarea) return;
    const val = this.textarea.value || '';
    const escaped = escapeHtml(val);
    const highlighted = escaped.replace(/(^|[^:])\/\/(.*)$/gm, '$1<span class="editor-comment">//$2</span>')
      + (val.endsWith('\n') ? '<br>&nbsp;' : '');
    this.backdrop.innerHTML = highlighted;
  }

  _bindEvents() {
    this.textarea.addEventListener('input', () => {
      this._updateCount();
      this._scheduleAutoSave();
    });

    // Ctrl+S / Cmd+S で即時保存
    this.textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.forceSave();
      }
    });
  }

  _scheduleAutoSave() {
    if (this._readOnly) return;
    this._setStatus('editing');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._save(), AUTOSAVE_DELAY_MS);
  }

  async _save() {
    if (this._readOnly) return;
    const content = this.textarea.value;
    if (content === this._lastSavedContent) {
      this._setStatus('saved');
      return;
    }

    this._setStatus('saving');
    try {
      await saveEssay(this.essayId, content);
      this._lastSavedContent = content;
      this._setStatus('saved');
    } catch (e) {
      console.error('Auto-save failed:', e);
      this._setStatus('error');
    }
  }

  _updateCount() {
    if (!this.countEl) return;
    // 1. // 以降のコメント（http:// などのURL中の // は除く）を改行まで除外
    const textWithoutComments = (this.textarea.value || '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // 2. スペース（半角・全角）および改行を除外してカウント
    const textWithoutSpaces = textWithoutComments.replace(/\s/g, '');
    const len = textWithoutSpaces.length;
    this.countEl.textContent = `${len.toLocaleString()} 字`;
    this.countEl.classList.toggle('count--over', len > 1200);
  }

  _setStatus(state) {
    if (!this.statusEl) return;
    const labels = {
      editing: { text: '編集中...', cls: 'status--editing' },
      saving:  { text: '保存中...', cls: 'status--saving' },
      saved:   { text: '保存済み',  cls: 'status--saved' },
      error:   { text: '保存失敗',  cls: 'status--error' },
    };
    const { text, cls } = labels[state] ?? labels.saved;
    this.statusEl.textContent = text;
    this.statusEl.className = `save-status ${cls}`;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
