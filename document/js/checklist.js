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
      { key: '3_prediction', label: '10〜20年後の発展を予測しているか' },
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

// 全チェック項目の key 一覧
export const ALL_KEYS = CHECKLIST.flatMap((s) => s.items.map((i) => i.key));

// ================================================================
// Checklist クラス
// ================================================================
export class Checklist {
  /**
   * @param {HTMLElement} container  チェックリストを描画するコンテナ
   * @param {object} options
   * @param {function(string, boolean): void} options.onToggle  チェック変化時のコールバック
   */
  constructor(container, { onToggle } = {}) {
    this.container = container;
    this.onToggle = onToggle ?? (() => {});
    this._itemMap = {};  // key → checked (boolean)
    this._interactive = false;  // 先生モード時のみ true
    this._render();
  }

  // ── 公開API ─────────────────────────────────────────────────

  /** チェック状態を一括反映（サーバーから取得したデータを渡す） */
  setItemMap(itemMap) {
    this._itemMap = { ...itemMap };
    this._updateCheckboxes();
    this._updateProgress();
  }

  /** インタラクティブモードの切替 */
  setInteractive(enabled) {
    this._interactive = enabled;
    this.container.querySelectorAll('.cl-checkbox').forEach((cb) => {
      cb.disabled = !enabled;
    });
    this.container.classList.toggle('cl--interactive', enabled);
  }

  /** 現在のチェック状態を取得（items 配列形式） */
  getItems() {
    return ALL_KEYS.map((key) => ({ key, checked: this._itemMap[key] ?? false }));
  }

  /** 進捗率を 0〜1 で返す */
  getProgress() {
    const total = ALL_KEYS.length;
    const checked = ALL_KEYS.filter((k) => this._itemMap[k]).length;
    return total > 0 ? checked / total : 0;
  }

  // ── プライベート ────────────────────────────────────────────

  _render() {
    this.container.innerHTML = '';

    // 全体進捗バー
    const progressWrap = document.createElement('div');
    progressWrap.className = 'cl-progress-wrap';
    progressWrap.innerHTML = `
      <div class="cl-progress-label">
        <span>進捗</span>
        <span class="cl-progress-count"></span>
      </div>
      <div class="cl-progress-bar"><div class="cl-progress-fill"></div></div>
    `;
    this.container.appendChild(progressWrap);

    // セクションを描画
    CHECKLIST.forEach((section) => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'cl-section';
      sectionEl.dataset.sectionId = section.id;

      const header = document.createElement('div');
      header.className = 'cl-section-header';
      header.innerHTML = `
        <span class="cl-section-title">${section.title}</span>
        <span class="cl-section-badge" data-section="${section.id}">0/${section.items.length}</span>
      `;
      sectionEl.appendChild(header);

      const desc = document.createElement('p');
      desc.className = 'cl-section-desc';
      desc.textContent = section.description;
      sectionEl.appendChild(desc);

      const items = document.createElement('ul');
      items.className = 'cl-items';

      section.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'cl-item';

        const label = document.createElement('label');
        label.className = 'cl-label';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'cl-checkbox';
        cb.id = `cl-${item.key}`;
        cb.disabled = true;  // 初期はすべて無効（先生モードで有効化）
        cb.dataset.key = item.key;

        cb.addEventListener('change', () => {
          this._itemMap[item.key] = cb.checked;
          this._updateProgress();
          this._updateSectionBadge(section);
          this.onToggle(item.key, cb.checked);
        });

        const span = document.createElement('span');
        span.textContent = item.label;

        label.appendChild(cb);
        label.appendChild(span);
        li.appendChild(label);
        items.appendChild(li);
      });

      sectionEl.appendChild(items);
      this.container.appendChild(sectionEl);
    });
  }

  _updateCheckboxes() {
    this.container.querySelectorAll('.cl-checkbox').forEach((cb) => {
      const key = cb.dataset.key;
      cb.checked = this._itemMap[key] ?? false;
    });
    CHECKLIST.forEach((s) => this._updateSectionBadge(s));
  }

  _updateProgress() {
    const total = ALL_KEYS.length;
    const checked = ALL_KEYS.filter((k) => this._itemMap[k]).length;
    const pct = total > 0 ? (checked / total) * 100 : 0;

    const fill = this.container.querySelector('.cl-progress-fill');
    const count = this.container.querySelector('.cl-progress-count');
    if (fill) fill.style.width = `${pct}%`;
    if (count) count.textContent = `${checked}/${total}`;
  }

  _updateSectionBadge(section) {
    const badge = this.container.querySelector(`[data-section="${section.id}"]`);
    if (!badge) return;
    const checked = section.items.filter((i) => this._itemMap[i.key]).length;
    badge.textContent = `${checked}/${section.items.length}`;
    badge.classList.toggle('cl-section-badge--done', checked === section.items.length);
  }
}
