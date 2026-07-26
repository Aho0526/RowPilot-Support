/**
 * comments.js — コメントパネルモジュール
 * - 生徒モード: 全先生のコメントを一覧で表示
 * - 先生モード: 添削者切り替え・新規添削追加・コメント自動保存・添削者名自動保存
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

const AUTOSAVE_DELAY_MS = 1500;

export class Comments {
  constructor(container, { onReviewSelect, onAddReview, onSaveReview } = {}) {
    this.container = container;
    this.onReviewSelect = onReviewSelect ?? (() => {});
    this.onAddReview = onAddReview ?? (() => {});
    this.onSaveReview = onSaveReview ?? (() => {});

    this._timer = null;
    this._lastSavedComment = '';
    this._lastSavedName = '';
    this._editable = false;
    this._reviews = [];
    this._activeReviewId = null;

    this._build();
  }

  /**
   * レビューデータをセット
   * @param {Array} reviews
   * @param {number|null} activeReviewId
   */
  setContent(reviews, activeReviewId) {
    const prevActiveId = this._activeReviewId;
    this._reviews = reviews || [];
    this._activeReviewId = activeReviewId;

    // 先生モードで入力中（フォーカスあり）かつアクティブIDも変わっていない場合はレンダーしない
    if (this._editable && prevActiveId === activeReviewId) {
      const focused = document.activeElement;
      const isEditingComment = focused && this.container.contains(focused) &&
        (focused.matches('.cm-textarea') || focused.matches('.cm-teacher-name-input'));
      if (isEditingComment) return;
    }

    this._render();
  }

  /** 編集可否（先生モードかどうか）をセット */
  setEditable(enabled) {
    if (this._editable === enabled) return; // 変化なければスキップ
    this._editable = enabled;
    this._render();
  }

  /** 現在の編集中のコメント内容を取得 */
  getContent() {
    const textarea = this.container.querySelector('.cm-textarea');
    return textarea ? textarea.value : '';
  }

  /** 手動保存 */
  async forceSave() {
    clearTimeout(this._timer);
    await this._save();
  }

  _build() {
    this.container.innerHTML = `<div class="cm-dynamic-content" style="display: flex; flex-direction: column; height: 100%;"></div>`;
    this._contentEl = this.container.querySelector('.cm-dynamic-content');
  }

  _render() {
    if (this._editable) {
      this._renderTeacherView();
    } else {
      this._renderStudentView();
    }
  }

  /** 先生モード用表示: 添削切り替え・編集UI */
  _renderTeacherView() {
    const activeReview = this._reviews.find(r => r.id === this._activeReviewId)
      || this._reviews[0];

    if (!activeReview) {
      this._contentEl.innerHTML = `
        <div class="cm-notice cm-notice--warning" style="margin: 16px;">
          ⚠️ 生徒が「レビュー依頼」を送信すると、添削を開始できます。
        </div>
      `;
      return;
    }

    this._activeReviewId = activeReview.id;
    this._lastSavedComment = activeReview.markdown_comment || '';
    this._lastSavedName = activeReview.teacher_name || '';

    // セレクトボックスのオプション生成
    const selectOptions = this._reviews.map((r, index) => {
      const name = r.teacher_name ? `${r.teacher_name}先生` : `添削者 ${index + 1} (名前未設定)`;
      const status = r.submitted_at ? ' [提出済]' : ' [下書き]';
      return `<option value="${r.id}" ${r.id === activeReview.id ? 'selected' : ''}>${name}${status}</option>`;
    }).join('');

    const isSubmitted = !!activeReview.submitted_at;

    this._contentEl.innerHTML = `
      <div class="cm-header" style="padding: 12px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--color-border-light);">
        <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
          <label style="font-size: 12px; font-weight: 600; min-width: 60px;">添削の選択:</label>
          <select class="cm-teacher-select banner-select" style="flex: 1; padding: 4px; font-size: 12px;">
            ${selectOptions}
          </select>
          <button class="cm-add-teacher-btn btn-sm">＋ 追加</button>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
          <label style="font-size: 12px; font-weight: 600; min-width: 60px;">先生の名前:</label>
          <input type="text" class="cm-teacher-name-input" value="${escapeHtml(activeReview.teacher_name || '')}" placeholder="先生の名前を入力（空欄OK）" style="flex: 1; padding: 6px 10px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg);" ${isSubmitted ? 'readonly' : ''}>
        </div>
        <span class="cm-status" aria-live="polite" style="font-size: 11px; color: var(--color-text-muted);"></span>
      </div>
      <div class="cm-body" style="flex: 1; display: flex; flex-direction: column; padding: 12px;">
        <textarea
          class="cm-textarea"
          placeholder="先生のコメントをこちらに入力してください...（自動保存されます）"
          spellcheck="false"
          aria-label="レビューコメント"
          style="flex: 1; width: 100%; min-height: 200px; padding: 12px; font-family: var(--font-sans); font-size: 13.5px; line-height: 1.6; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); resize: none; color: var(--color-text-primary);"
          ${isSubmitted ? 'readonly' : ''}
        >${escapeHtml(activeReview.markdown_comment || '')}</textarea>
      </div>
      ${isSubmitted ? `<div class="cm-notice cm-notice--default" style="margin: 0 12px 12px 12px; font-size:12px;">この添削は提出済みです（編集不可）</div>` : ''}
    `;

    // イベントバインド
    const select = this._contentEl.querySelector('.cm-teacher-select');
    select.addEventListener('change', (e) => {
      this.onReviewSelect(parseInt(e.target.value));
    });

    const addBtn = this._contentEl.querySelector('.cm-add-teacher-btn');
    addBtn.addEventListener('click', () => {
      this.onAddReview();
    });

    const nameInput = this._contentEl.querySelector('.cm-teacher-name-input');
    nameInput.addEventListener('input', () => {
      this._setStatus('editing');
      this._scheduleAutoSave();
    });

    const textarea = this._contentEl.querySelector('.cm-textarea');
    textarea.addEventListener('input', () => {
      this._setStatus('editing');
      this._scheduleAutoSave();
    });

    this._statusEl = this._contentEl.querySelector('.cm-status');
  }

  /** 生徒モード用表示: 提出された全先生のコメントをカード形式で縦並び表示 */
  _renderStudentView() {
    // 提出済みのレビューのみをフィルタ
    const submittedReviews = this._reviews.filter(r => !!r.submitted_at);

    if (submittedReviews.length === 0) {
      this._contentEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--color-text-muted);">
          <p class="cm-empty">先生からのコメントはまだありません。</p>
        </div>
      `;
      return;
    }

    const cards = submittedReviews.map((r, index) => {
      const name = r.teacher_name ? `${r.teacher_name}先生` : `先生 ${index + 1}`;
      const commentHtml = renderMarkdown(r.markdown_comment);
      const timeStr = r.submitted_at ? new Date(r.submitted_at.replace(' ', 'T')).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';

      return `
        <div class="cm-card" style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px; margin: 12px; box-shadow: var(--shadow-sm);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border-light); padding-bottom: 8px; margin-bottom: 12px;">
            <span style="font-weight: 600; font-size: 14px; color: var(--color-accent);">${escapeHtml(name)}からのアドバイス</span>
            <span style="font-size: 11px; color: var(--color-text-muted);">${timeStr}</span>
          </div>
          <div class="cm-card-body" style="font-size: 13.5px; line-height: 1.6; color: var(--color-text-primary); white-space: pre-wrap;">
            ${commentHtml}
          </div>
        </div>
      `;
    }).join('');

    this._contentEl.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; overflow-y: auto;">
        ${cards}
      </div>
    `;
  }

  _scheduleAutoSave() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._save(), AUTOSAVE_DELAY_MS);
  }

  async _save() {
    if (!this._editable || !this._activeReviewId) return;

    const nameInput = this._contentEl.querySelector('.cm-teacher-name-input');
    const textarea = this._contentEl.querySelector('.cm-textarea');
    if (!nameInput || !textarea) return;

    const teacherName = nameInput.value;
    const comment = textarea.value;

    if (teacherName === this._lastSavedName && comment === this._lastSavedComment) {
      this._setStatus('saved');
      return;
    }

    this._setStatus('saving');
    try {
      await updateReview(this._activeReviewId, {
        teacher_name: teacherName,
        markdown_comment: comment
      });
      this._lastSavedName = teacherName;
      this._lastSavedComment = comment;
      this._setStatus('saved');

      // 親コンポーネント(app.js)にセーブ完了を通知して状態を同期させる
      this.onSaveReview(this._activeReviewId, teacherName, comment);
    } catch (e) {
      console.error('Auto save failed:', e);
      this._setStatus('error');
    }
  }

  _setStatus(state) {
    if (!this._statusEl) return;
    const labels = {
      editing: '入力中...',
      saving:  '保存中...',
      saved:   '自動保存済み',
      error:   '保存失敗',
    };
    this._statusEl.textContent = labels[state] ?? '';
    this._statusEl.className = `cm-status cm-status--${state}`;
  }
}
