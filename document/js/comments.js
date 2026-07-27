/**
 * comments.js — コメントパネルモジュール
 * - 生徒モード: 全先生のコメントを一覧で表示
 * - 先生モード: 自端末のドラフト/提出済み表示、他先生のレビューは別セクションで一覧表示
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

const parseUtcDate = (dateStr) => {
  if (!dateStr) return null;
  let str = String(dateStr).trim();
  if (!str.endsWith('Z') && !str.includes('+')) {
    str = str.replace(' ', 'T') + 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const formatDateJST = (dateStr) => {
  const d = parseUtcDate(dateStr);
  if (!d) return '';
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const AUTOSAVE_DELAY_MS = 1500;

export class Comments {
  constructor(container, { onReviewSelect, onAddReview, onSaveReview, onDraftRestore } = {}) {
    this.container = container;
    this.onReviewSelect = onReviewSelect ?? (() => {});
    this.onAddReview = onAddReview ?? (() => {});
    this.onSaveReview = onSaveReview ?? (() => {});
    this.onDraftRestore = onDraftRestore ?? (() => {});

    this._timer = null;
    this._lastSavedComment = '';
    this._lastSavedName = '';
    this._editable = false;
    this._reviews = [];
    this._activeReviewId = null;
    this._pendingDraft = null; // 旧バージョンの未提出ドラフト引き継ぎ用

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

  /**
   * 引き継ぎ用ドラフトをセット（生徒の次回依頼で旧バージョンの未提出があった場合）
   * @param {{ teacherName: string, comment: string, savedAt: number } | null} draft
   */
  setPendingDraft(draft) {
    this._pendingDraft = draft;
    if (this._editable) {
      this._render();
    }
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

  /** 先生モード用表示 */
  _renderTeacherView() {
    const myReview = this._reviews.find(r => r.is_mine) || null;
    const otherReviews = this._reviews.filter(r => !r.is_mine && r.submitted_at);

    // レビュー依頼なし
    if (this._reviews.length === 0 && !myReview) {
      this._contentEl.innerHTML = `
        <div class="cm-notice cm-notice--warning" style="margin: 16px;">
          ⚠️ 生徒が「レビュー依頼」を送信すると、添削を開始できます。
        </div>
      `;
      return;
    }

    // マイレビューがまだなく、依頼は存在する（他端末の先生は入ったが自分はまだ）
    if (!myReview) {
      this._contentEl.innerHTML = `
        <div class="cm-notice cm-notice--info" style="margin: 16px; padding: 16px; border-radius: 8px; background: var(--color-surface); border: 1px solid var(--color-border);">
          <p style="margin: 0 0 12px 0; font-size: 13px;">このバージョンへの添削をまだ始めていません。</p>
          <button class="cm-btn-start-review" style="padding: 8px 16px; background: var(--color-accent); color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
            ✏️ 添削を始める
          </button>
        </div>
        ${this._renderOtherReviewsSection(otherReviews)}
      `;
      this._contentEl.querySelector('.cm-btn-start-review')?.addEventListener('click', () => {
        this.onAddReview();
      });
      return;
    }

    // マイレビューが存在する
    this._activeReviewId = myReview.id;
    this._lastSavedComment = myReview.markdown_comment || '';
    this._lastSavedName = myReview.teacher_name || '';

    const isSubmitted = !!myReview.submitted_at;

    // 旧バージョンから引き継ぎ可能なドラフトがある場合のバナー
    const draftBanner = this._pendingDraft && !isSubmitted ? `
      <div class="cm-draft-restore-banner" style="
        margin: 8px 12px;
        padding: 10px 14px;
        background: rgba(var(--color-accent-rgb, 99, 102, 241), 0.1);
        border: 1px solid var(--color-accent);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      ">
        <span style="font-size: 12px; color: var(--color-text-primary); flex: 1;">
          📋 前回の依頼への未提出コメントがあります。引き継ぎますか？
        </span>
        <div style="display: flex; gap: 6px; flex-shrink: 0;">
          <button class="cm-btn-restore-draft" style="padding: 5px 10px; background: var(--color-accent); color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer;">引き継ぐ</button>
          <button class="cm-btn-dismiss-draft" style="padding: 5px 10px; background: transparent; color: var(--color-text-muted); border: 1px solid var(--color-border); border-radius: 5px; font-size: 12px; cursor: pointer;">破棄</button>
        </div>
      </div>
    ` : '';

    this._contentEl.innerHTML = `
      <div class="cm-header" style="padding: 12px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--color-border-light);">
        <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
          <label style="font-size: 12px; font-weight: 600; min-width: 60px;">先生の名前:</label>
          <input type="text" class="cm-teacher-name-input" value="${escapeHtml(myReview.teacher_name || '')}" placeholder="先生の名前を入力（空欄OK）" style="flex: 1; padding: 6px 10px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg);" ${isSubmitted ? 'readonly' : ''}>
        </div>
        <span class="cm-status" aria-live="polite" style="font-size: 11px; color: var(--color-text-muted);"></span>
      </div>
      ${draftBanner}
      <div class="cm-body" style="flex: 1; display: flex; flex-direction: column; padding: 12px;">
        <textarea
          class="cm-textarea"
          placeholder="先生のコメントをこちらに入力してください...（自動保存されます）"
          spellcheck="false"
          aria-label="レビューコメント"
          style="flex: 1; width: 100%; min-height: 200px; padding: 12px; font-family: var(--font-sans); font-size: 13.5px; line-height: 1.6; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); resize: none; color: var(--color-text-primary);"
          ${isSubmitted ? 'readonly' : ''}
        >${escapeHtml(myReview.markdown_comment || '')}</textarea>
      </div>
      ${isSubmitted ? `<div class="cm-notice cm-notice--default" style="margin: 0 12px 12px 12px; font-size:12px;">この添削は提出済みです（編集不可）</div>` : ''}
      ${this._renderOtherReviewsSection(otherReviews)}
    `;

    // ドラフト引き継ぎバナーのイベント
    if (this._pendingDraft && !isSubmitted) {
      this._contentEl.querySelector('.cm-btn-restore-draft')?.addEventListener('click', () => {
        const draft = this._pendingDraft;
        this._pendingDraft = null;
        const nameInput = this._contentEl.querySelector('.cm-teacher-name-input');
        const textarea = this._contentEl.querySelector('.cm-textarea');
        if (nameInput && draft.teacherName) nameInput.value = draft.teacherName;
        if (textarea && draft.comment) textarea.value = draft.comment;
        this._scheduleAutoSave();
        this.onDraftRestore(draft);
        // バナーを消す
        this._contentEl.querySelector('.cm-draft-restore-banner')?.remove();
      });
      this._contentEl.querySelector('.cm-btn-dismiss-draft')?.addEventListener('click', () => {
        this._pendingDraft = null;
        this._contentEl.querySelector('.cm-draft-restore-banner')?.remove();
      });
    }

    // イベントバインド
    const nameInput = this._contentEl.querySelector('.cm-teacher-name-input');
    nameInput?.addEventListener('input', () => {
      this._setStatus('editing');
      this._scheduleAutoSave();
    });

    const textarea = this._contentEl.querySelector('.cm-textarea');
    textarea?.addEventListener('input', () => {
      this._setStatus('editing');
      this._scheduleAutoSave();
    });

    this._statusEl = this._contentEl.querySelector('.cm-status');
  }

  /** 他の先生のレビューセクションをレンダリング */
  _renderOtherReviewsSection(otherReviews) {
    if (otherReviews.length === 0) return '';

    const cards = otherReviews.map((r, index) => {
      const name = r.teacher_name ? `${r.teacher_name}先生` : `先生 ${index + 1}`;
      const commentHtml = renderMarkdown(r.markdown_comment);
      const timeStr = formatDateJST(r.submitted_at);
      return `
        <div style="background: var(--color-surface); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); padding: 12px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600; font-size: 12px; color: var(--color-text-muted);">${escapeHtml(name)}（提出済み）</span>
            <span style="font-size: 11px; color: var(--color-text-muted);">${timeStr}</span>
          </div>
          <div style="font-size: 13px; line-height: 1.6; color: var(--color-text-primary);">${commentHtml}</div>
        </div>
      `;
    }).join('');

    return `
      <div style="margin: 0 12px 12px 12px; padding-top: 12px; border-top: 1px solid var(--color-border-light);">
        <p style="font-size: 11px; font-weight: 600; color: var(--color-text-muted); margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">他の先生のレビュー</p>
        ${cards}
      </div>
    `;
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
      const timeStr = formatDateJST(r.submitted_at);

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
