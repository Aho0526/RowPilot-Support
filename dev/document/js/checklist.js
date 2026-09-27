/**
 * checklist.js — チェックリストモジュール
 * 課題論文の審査要件を表示・チェック管理する
 */

// ── チェックリスト定義（正式な課題論文要件） ────────────────────
export const CHECKLIST = [
  {
    id: 'section1',
    title: '① 出来事と関心のきっかけ',
    description: 'いつ・どこで・どのように起きたか、なぜその技術に関心を持ったか',
    items: [
      { key: '1_when',  label: 'いつ起きたかを具体的に述べているか' },
      { key: '1_where', label: 'どこで起きたかを具体的に述べているか' },
      { key: '1_how',   label: 'どのように起きたかを具体的に述べているか' },
      { key: '1_why',   label: 'なぜその技術に関心を持ったかを説明しているか' },
    ],
  },
  {
    id: 'section2',
    title: '② 技術の現状分析',
    description: '手法・活用例・課題を各種資料を参照しながら分析',
    items: [
      { key: '2_methods',      label: '手法・メソッドを分析しているか' },
      { key: '2_applications', label: '活用例・応用を分析しているか' },
      { key: '2_challenges',   label: '課題を分析しているか' },
      { key: '2_references',   label: '各種資料を参照・記載しているか（資料*）' },
      { key: '2_ref_reason',   label: '参照資料を選んだ理由を述べているか' },
    ],
  },
  {
    id: 'section3',
    title: '③ 将来の発展（10〜20年）',
    description: '①②を踏まえ、理由を添えて論じているか',
    items: [
      { key: '3_prediction', label: '10～20年後の発展を予測しているか' },
      { key: '3_reasoning',  label: '①②を踏まえた根拠・理由を添えているか' },
    ],
  },
  {
    id: 'section4',
    title: '④ 将来の研究・開発構想',
    description: '研究者・開発者として何をどのように研究・開発したいか',
    items: [
      { key: '4_what', label: '何を研究・開発したいかを述べているか' },
      { key: '4_how',  label: 'どのように研究・開発するかを述べているか' },
    ],
  },
  {
    id: 'section5',
    title: '⑤ 全体像の図（手書きスキャン）',
    description: '④の研究・開発構想を表した図（紙に手書きしたスキャンデータ）',
    optional: true, // 現在は評価対象外（提出省略可）
    items: [
      { key: '5_figure',         label: '手書きの図が提出されているか' },
      { key: '5_figure_quality', label: '④の構想の全体像を適切に表しているか' },
    ],
  },
  {
    id: 'section_wc',
    title: '文字数確認',
    description: '①〜④ の合計 1,200字以内',
    items: [
      { key: 'wc_within_limit', label: '①〜④の合計文字数が 1,200字以内か' },
    ],
  },
];

export const ALL_KEYS = CHECKLIST.filter(s => !s.optional).flatMap((s) => s.items.map((i) => i.key));

const escapeHtml = (str) =>
  String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class Checklist {
  constructor(container, { onToggle, onReviewSelect } = {}) {
    this.container = container;
    this.onToggle = onToggle ?? (() => {});
    this.onReviewSelect = onReviewSelect ?? (() => {});

    this._reviews = [];
    this._activeReviewId = null; // 先生編集用 or 生徒閲覧用の選択ID（null = Overview）
    this._isTeacher = false;

    this._build();
  }

  /**
   * レビューデータとモードをセットして再描画
   * @param {Array} reviews - レビュー配列
   * @param {number|null} activeReviewId - 選択されているレビューID（null の場合は Overview）
   * @param {boolean} isTeacher - 先生モードかどうか
   */
  setReviews(reviews, activeReviewId, isTeacher) {
    this._reviews = reviews || [];
    this._activeReviewId = activeReviewId;
    this._isTeacher = isTeacher;
    this._render();
  }

  /** インタラクティブモードの切替 */
  setInteractive(enabled) {
    this._interactive = enabled;
    this.container.querySelectorAll('.cl-checkbox').forEach((cb) => {
      cb.disabled = !enabled;
    });
    this.container.classList.toggle('cl--interactive', enabled);
  }

  _build() {
    this.container.innerHTML = `
      <!-- 条件トグラー -->
      <div class="cl-prompt-toggler" style="margin-bottom: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; user-select: none;">
        <span>📝 課題の回答条件を表示</span>
        <span class="cl-prompt-icon">▼</span>
      </div>
      
      <!-- 生徒用設問プロンプト表示エリア（初期は折りたたみ） -->
      <div class="cl-prompt-box" style="display: none; margin-bottom: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px; background: var(--color-surface);">
        <div class="cl-prompt-intro" style="font-size: 13px; line-height: 1.5; color: var(--color-text-primary); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border-light);">
          あなたが日常生活や学校生活の中で実際に体験した、情報技術に関する具体的な出来事を１つ出来事を出来事を挙げ、それをきっかけに関心を持った情報学分野の技術について、以下の①～⑤に回答してください。①～④の文字数は計 1,200 字以内とします。
        </div>
        <div class="cl-prompt-items" style="display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; line-height:1.4;">
          <div style="display: flex; gap: 6px;"><b style="color:var(--color-accent)">①</b> <span>その出来事がいつ・どこで・どのように起きたかを具体的に述べ、なぜその技術に関心を持ったかを説明してください。</span></div>
          <div style="display: flex; gap: 6px;"><b style="color:var(--color-accent)">②</b> <span>その技術の現状（手法・活用例・課題）を各種資料*を参照しながら分析してください。参照した資料を選んだ理由も簡潔に述べてください。</span></div>
          <div style="display: flex; gap: 6px;"><b style="color:var(--color-accent)">③</b> <span>その技術が今後 10～20 年でどう発展するかを、①②を踏まえ理由も添えて論じてください。</span></div>
          <div style="display: flex; gap: 6px;"><b style="color:var(--color-accent)">④</b> <span>あなたが将来研究者・開発者として関わると仮定し、その技術についてどのようなものをどのように研究・開発していきたいと思うかを述べてください。</span></div>
          <div style="display: flex; gap: 6px;"><b style="color:var(--color-accent)">⑤</b> <span>④で構想した研究・開発について、想定するシステムや手法の全体像を 1 枚の図で示してください。ただし、図は紙に手書きで作成し、そのスキャンデータを提出してください。</span></div>
        </div>
      </div>

      <!-- 添削切り替えタブ（生徒用） -->
      <div class="cl-tabs-container" style="display: none; margin-bottom: 16px; border-bottom: 1px solid var(--color-border-light); padding-bottom: 8px;">
        <div class="cl-tabs" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
      </div>

      <!-- 評価進捗バー -->
      <div class="cl-progress-wrap" style="margin-bottom: 16px; background: var(--color-surface); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--color-border);">
        <div class="cl-progress-label" style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 6px;">
          <span class="cl-progress-title-text">評価進捗 (Overview)</span>
          <span class="cl-progress-count">0/16</span>
        </div>
        <div class="cl-progress-bar" style="height: 8px; background: var(--color-border-light); border-radius: 4px; overflow: hidden;">
          <div class="cl-progress-fill" style="width: 0%; height: 100%; background: var(--color-accent); transition: width 0.3s;"></div>
        </div>
      </div>

      <!-- チェックリストコンテンツ -->
      <div class="cl-list-container"></div>
    `;

    // トグラーのイベント登録
    const toggler = this.container.querySelector('.cl-prompt-toggler');
    const promptBox = this.container.querySelector('.cl-prompt-box');
    const promptIcon = this.container.querySelector('.cl-prompt-icon');
    toggler.addEventListener('click', () => {
      const isHidden = promptBox.style.display === 'none';
      promptBox.style.display = isHidden ? 'block' : 'none';
      promptIcon.textContent = isHidden ? '▲' : '▼';
    });

    this._tabsContainer = this.container.querySelector('.cl-tabs-container');
    this._tabsEl = this.container.querySelector('.cl-tabs');
    this._progressTitleText = this.container.querySelector('.cl-progress-title-text');
    this._progressCount = this.container.querySelector('.cl-progress-count');
    this._progressFill = this.container.querySelector('.cl-progress-fill');
    this._listContainer = this.container.querySelector('.cl-list-container');
  }

  _render() {
    const isTeacher = this._isTeacher;
    const submittedReviews = this._reviews.filter(r => !!r.submitted_at);

    // タブは常に非表示（生徒モードでもOverview固定）
    this._tabsContainer.style.display = 'none';

    // 生徒モードでは常にOverview表示（個別タブ切り替えなし）
    const isOverview = !isTeacher;

    // 進捗バータイトル更新
    if (isTeacher) {
      this._progressTitleText.textContent = '添削のチェック進捗';
    } else {
      this._progressTitleText.textContent = '先生の評価 (Overview)';
    }

    // チェックリスト本文の構築
    this._listContainer.innerHTML = '';

    // 先生モードの場合のみ activeReview を使う（Overview時はnull）
    let activeReview = null;
    if (isTeacher) {
      activeReview = this._reviews.find(r => r.id === this._activeReviewId) || this._reviews[0];
    }
    const itemMap = activeReview?.itemMap ?? {};
    const isSubmitted = !!activeReview?.submitted_at;

    // 進捗率の計算
    if (isOverview) {
      // Overviewモード: 各項目のチェック数 / 全員のチェック総数
      const totalItemsCount = ALL_KEYS.length;
      let totalCheckedCount = 0;
      
      ALL_KEYS.forEach(key => {
        const checkedNum = submittedReviews.filter(r => r.itemMap?.[key] === true).length;
        if (submittedReviews.length > 0 && checkedNum === submittedReviews.length) {
          totalCheckedCount++;
        }
      });
      
      const pct = totalItemsCount > 0 ? (totalCheckedCount / totalItemsCount) * 100 : 0;
      this._progressFill.style.width = `${pct}%`;
      this._progressCount.textContent = `全員クリア項目: ${totalCheckedCount}/${totalItemsCount}`;
    } else {
      // 個別モード
      const total = ALL_KEYS.length;
      const checked = ALL_KEYS.filter(k => itemMap[k] === true).length;
      const pct = total > 0 ? (checked / total) * 100 : 0;
      this._progressFill.style.width = `${pct}%`;
      this._progressCount.textContent = `${checked}/${total}`;
    }

    // 各セクションの描画
    CHECKLIST.forEach(section => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'cl-section';
      sectionEl.style.marginBottom = '20px';
      sectionEl.style.padding = '12px';
      sectionEl.style.borderRadius = 'var(--radius-md)';
      sectionEl.style.border = section.optional ? '1px dashed var(--color-border)' : '1px solid var(--color-border-light)';
      sectionEl.style.background = 'var(--color-bg)';
      if (section.optional) {
        sectionEl.style.opacity = '0.7';
      }

      // 進捗カウントの計算
      let sectionChecked = 0;
      if (isOverview) {
        // 全員がチェックしている数をカウント
        section.items.forEach(item => {
          const checkedCount = submittedReviews.filter(r => r.itemMap?.[item.key] === true).length;
          if (submittedReviews.length > 0 && checkedCount === submittedReviews.length) {
            sectionChecked++;
          }
        });
      } else {
        sectionChecked = section.items.filter(item => itemMap[item.key] === true).length;
      }

      const badgeHtml = section.optional
        ? `<span style="font-size: 11px; padding: 2px 8px; border-radius: 10px; background: var(--color-surface-2); color: var(--color-text-muted); font-weight: normal;">現在は省略可</span>`
        : `<span style="font-size: 11px; padding: 2px 6px; border-radius: 10px; background: var(--color-surface-2); color: var(--color-text-secondary); font-weight: bold;">
            ${sectionChecked}/${section.items.length}
          </span>`;

      sectionEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: 600; font-size: 13.5px; color: var(--color-text-primary); ${section.optional ? 'text-decoration: line-through;' : ''}">${section.title}</span>
          ${badgeHtml}
        </div>
        <p style="font-size: 11.5px; color: var(--color-text-muted); margin-bottom: 10px; ${section.optional ? 'text-decoration: line-through;' : ''}">${section.description}</p>
        <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;"></ul>
      `;

      const ul = sectionEl.querySelector('ul');

      section.items.forEach(item => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'flex-start';
        li.style.gap = '8px';
        li.style.fontSize = '12.5px';

        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'flex-start';
        label.style.gap = '8px';
        label.style.cursor = (isTeacher && !isSubmitted) ? 'pointer' : 'default';
        label.style.width = '100%';

        if (isOverview) {
          // Overview表示時：チェックされた人数比率バッジを表示
          const checkedCount = submittedReviews.filter(r => r.itemMap?.[item.key] === true).length;
          const ratio = submittedReviews.length > 0 ? (checkedCount / submittedReviews.length) : 0;
          const percentage = Math.round(ratio * 100);

          let color = 'var(--color-text-muted)';
          let bg = 'var(--color-surface)';
          if (percentage === 100) {
            color = 'var(--color-success)';
            bg = 'var(--color-success-light, #e6f4ea)';
          } else if (percentage > 0) {
            color = 'var(--color-warning)';
            bg = 'var(--color-warning-light, #fef7e0)';
          }

          label.innerHTML = `
            <span style="display: inline-block; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 4px; color: ${color}; background: ${bg}; min-width: 32px; text-align: center; margin-top:2px;">
              ${percentage}%
            </span>
            <span style="flex: 1; color: var(--color-text-primary); line-height: 1.4; ${section.optional ? 'text-decoration: line-through;' : ''}">${item.label} <small style="color: var(--color-text-muted); margin-left:4px;">(${checkedCount}/${submittedReviews.length}人)</small></span>
          `;
        } else {
          // 通常表示時：チェックボックス
          const isChecked = itemMap[item.key] === true;

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = isChecked;
          cb.disabled = !isTeacher || isSubmitted; // 先生モードかつ未提出の場合のみ操作可能
          cb.style.marginTop = '3px';

          cb.addEventListener('change', () => {
            itemMap[item.key] = cb.checked;
            this.onToggle(item.key, cb.checked);
          });

          const span = document.createElement('span');
          span.textContent = item.label;
          span.style.flex = '1';
          span.style.color = isChecked ? 'var(--color-text-primary)' : 'var(--color-text-secondary)';
          span.style.lineHeight = '1.4';
          if (section.optional) {
            span.style.textDecoration = 'line-through';
          }

          label.appendChild(cb);
          label.appendChild(span);
        }

        li.appendChild(label);
        ul.appendChild(li);
      });

      this._listContainer.appendChild(sectionEl);
    });
  }
}
