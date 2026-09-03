/**
 * paper.js — 志願理由書用紙（清書ビュー）管理モジュール
 * 広島工業大学 志望理由書 PDF の完全フォーマット対応
 * 用紙入力欄とマスターテキストの双方向同期・パースを担当
 */

export class PaperManager {
  /**
   * @param {object} elements
   * @param {HTMLTextAreaElement} elements.masterTextarea マスター用テキストエリア
   * @param {function} elements.onContentChange コンテンツ変更時のコールバック
   * @param {function} elements.onCountUpdate 文字数更新時のコールバック
   */
  constructor({ masterTextarea, onContentChange, onCountUpdate } = {}) {
    this.masterTextarea = masterTextarea;
    this.onContentChange = onContentChange || (() => {});
    this.onCountUpdate = onCountUpdate || (() => {});

    this.currentMode = 'paper'; // 'paper' | 'text'
    this.isReadOnly = false;
    this._isSyncing = false;

    // 各セクションのコメント（// ...）を保持
    this.sectionComments = {
      sec1: [],
      sec2: [],
      sec3: [],
      sec4: [],
    };

    // デフォルトのガイド文言
    this.defaultHints = {
      sec1: '上記の学部・学科を志望する理由について記入してください。',
      sec2: 'これまでに積極的に取り組んだ勉学や活動の内容について記入してください。',
      sec3: '本学に入学して取り組みたいことを記入してください。',
      sec4: '大学卒業後を見据えた目標を記入してください。',
    };

    this._cacheDom();
    this._bindEvents();
  }

  _cacheDom() {
    this.viewPaperContainer = document.getElementById('view-paper-container');
    this.viewTextContainer = document.getElementById('view-text-container');
    this.btnViewPaper = document.getElementById('btn-view-paper');
    this.btnViewText = document.getElementById('btn-view-text');
    this.btnPrint = document.getElementById('btn-print-sop');

    // 用紙入力欄
    this.inputs = {
      receipt: document.getElementById('sop-input-receipt'),
      furigana: document.getElementById('sop-input-furigana'),
      name: document.getElementById('sop-input-name'),
      school: document.getElementById('sop-input-school'),
      highschoolDept: document.getElementById('sop-input-highschool-dept'),
      examType: document.getElementById('sop-input-exam-type'),
      faculty: document.getElementById('sop-input-faculty'),
      dept: document.getElementById('sop-input-dept'),
      course: document.getElementById('sop-input-course'),
      sec1: document.getElementById('sop-section-1'),
      sec2: document.getElementById('sop-section-2'),
      sec3: document.getElementById('sop-section-3'),
      sec4: document.getElementById('sop-section-4'),
    };

    // コメント・ヒント用うっすら表示ガイド要素
    this.guides = {
      sec1: document.getElementById('sop-guide-1'),
      sec2: document.getElementById('sop-guide-2'),
      sec3: document.getElementById('sop-guide-3'),
      sec4: document.getElementById('sop-guide-4'),
    };
  }

  _bindEvents() {
    // タブ切り替え
    this.btnViewPaper?.addEventListener('click', () => this.switchView('paper'));
    this.btnViewText?.addEventListener('click', () => this.switchView('text'));

    // 印刷ボタン
    this.btnPrint?.addEventListener('click', () => {
      window.print();
    });

    // 清書ビュー入力時：その場で即座に文字のみエディタへ同期 ＆ ガイド表示制御
    const onPaperInput = () => {
      if (this._isSyncing) return;
      this.syncPaperToMaster();
      this.updateTotalCharCount();
    };

    Object.values(this.inputs).forEach((el) => {
      if (!el) return;
      el.addEventListener('input', onPaperInput);
      el.addEventListener('change', onPaperInput);
    });

    // 設問入力欄：文字入力時はガイドを即座に非表示、空なら再表示
    ['sec1', 'sec2', 'sec3', 'sec4'].forEach((key) => {
      const inputEl = this.inputs[key];
      const guideEl = this.guides[key];
      if (!inputEl || !guideEl) return;

      const updateGuide = () => {
        const hasText = inputEl.value.trim().length > 0;
        guideEl.classList.toggle('is-hidden', hasText);
      };

      inputEl.addEventListener('input', updateGuide);
      inputEl.addEventListener('focus', updateGuide);
      inputEl.addEventListener('blur', updateGuide);
    });

    // 文字のみエディタ入力時：その場で即座に清書ビューへ同期
    this.masterTextarea?.addEventListener('input', () => {
      if (this._isSyncing) return;
      this.syncMasterToPaper();
      this.updateTotalCharCount();
    });
  }

  /** 表示ビューの切り替え */
  switchView(mode) {
    if (this.currentMode === mode) return;

    // ビュー切り替え時にも最新データを確実にその場で相互反映
    if (mode === 'paper') {
      this.syncMasterToPaper();
    } else {
      this.syncPaperToMaster();
    }

    this.currentMode = mode;

    if (this.viewPaperContainer && this.viewTextContainer) {
      this.viewPaperContainer.style.display = mode === 'paper' ? 'flex' : 'none';
      this.viewTextContainer.style.display = mode === 'text' ? 'flex' : 'none';
    }

    this.btnViewPaper?.classList.toggle('panel-tab--active', mode === 'paper');
    this.btnViewPaper?.setAttribute('aria-selected', mode === 'paper' ? 'true' : 'false');
    this.btnViewText?.classList.toggle('panel-tab--active', mode === 'text');
    this.btnViewText?.setAttribute('aria-selected', mode === 'text' ? 'true' : 'false');

    this.updateTotalCharCount();
  }

  /** 読み取り専用（先生モード）の切り替え */
  setReadOnly(isReadOnly) {
    this.isReadOnly = isReadOnly;
    Object.values(this.inputs).forEach((el) => {
      if (!el) return;
      el.readOnly = isReadOnly;
    });
  }

  /** マスターテキストの内容を用紙の各入力欄にパースして即座に反映 */
  syncMasterToPaper() {
    this._isSyncing = true;
    try {
      const raw = this.masterTextarea ? this.masterTextarea.value : '';
      const parsed = this.parseTextToData(raw);

      if (this.inputs.receipt && this.inputs.receipt.value !== parsed.receipt) this.inputs.receipt.value = parsed.receipt || '';
      if (this.inputs.furigana && this.inputs.furigana.value !== parsed.furigana) this.inputs.furigana.value = parsed.furigana || '';
      if (this.inputs.name && this.inputs.name.value !== parsed.name) this.inputs.name.value = parsed.name || '';
      if (this.inputs.school && this.inputs.school.value !== parsed.school) this.inputs.school.value = parsed.school || '';
      if (this.inputs.highschoolDept && this.inputs.highschoolDept.value !== parsed.highschoolDept) this.inputs.highschoolDept.value = parsed.highschoolDept || '';
      if (this.inputs.examType && this.inputs.examType.value !== parsed.examType) this.inputs.examType.value = parsed.examType || '';
      if (this.inputs.faculty && this.inputs.faculty.value !== parsed.faculty) this.inputs.faculty.value = parsed.faculty || '';
      if (this.inputs.dept && this.inputs.dept.value !== parsed.dept) this.inputs.dept.value = parsed.dept || '';
      if (this.inputs.course && this.inputs.course.value !== parsed.course) this.inputs.course.value = parsed.course || '';

      // 設問①〜④：本文をセットし、コメント（// ...）はガイド（うっすら表示）に反映
      ['sec1', 'sec2', 'sec3', 'sec4'].forEach((key) => {
        const inputEl = this.inputs[key];
        const guideEl = this.guides[key];
        const bodyVal = parsed[key] || '';
        const commentText = parsed[`${key}CommentText`] || '';
        const defaultHint = this.defaultHints[key] || '';

        this.sectionComments[key] = parsed[`${key}Comments`] || [];

        if (inputEl && inputEl.value !== bodyVal) {
          inputEl.value = bodyVal;
        }

        if (guideEl) {
          // コメントがあればそのコメントを、なければデフォルトヒントをうっすら表示
          guideEl.textContent = commentText || defaultHint;
          const hasContent = bodyVal.trim().length > 0;
          guideEl.classList.toggle('is-hidden', hasContent);
        }
      });
    } finally {
      this._isSyncing = false;
    }
  }

  /** 用紙の各入力欄をマスターテキストに変換して即座に反映 */
  syncPaperToMaster() {
    this._isSyncing = true;
    try {
      const data = {
        receipt: this.inputs.receipt?.value || '',
        furigana: this.inputs.furigana?.value || '',
        name: this.inputs.name?.value || '',
        school: this.inputs.school?.value || '',
        highschoolDept: this.inputs.highschoolDept?.value || '',
        examType: this.inputs.examType?.value || '',
        faculty: this.inputs.faculty?.value || '',
        dept: this.inputs.dept?.value || '',
        course: this.inputs.course?.value || '',
        sec1: this.inputs.sec1?.value || '',
        sec2: this.inputs.sec2?.value || '',
        sec3: this.inputs.sec3?.value || '',
        sec4: this.inputs.sec4?.value || '',
      };

      const formatted = this.formatDataToText(data);
      if (this.masterTextarea && this.masterTextarea.value !== formatted) {
        this.masterTextarea.value = formatted;
        // 文字のみエディタのシンタックスハイライトも即座に更新
        if (window._editor && typeof window._editor._renderHighlight === 'function') {
          window._editor._renderHighlight();
        }
        // バックグラウンド自動保存キューへ
        this.onContentChange(formatted);
      }
    } finally {
      this._isSyncing = false;
    }
  }

  /**
   * テキストをデータオブジェクトにパース
   */
  parseTextToData(text) {
    const data = {
      receipt: '',
      furigana: '',
      name: '',
      school: '',
      highschoolDept: '',
      examType: '',
      faculty: '',
      dept: '',
      course: '',
      sec1: '',
      sec2: '',
      sec3: '',
      sec4: '',
    };

    if (!text || !text.trim()) return data;

    // 行ごとに走査してヘッダー単位で分割
    const lines = text.split(/\r?\n/);
    const sections = {};
    let currentKey = null;
    const currentLines = [];

    const flush = () => {
      if (currentKey !== null) {
        sections[currentKey] = currentLines.join('\n').trim();
        currentLines.length = 0;
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const bracketMatch = trimmed.match(/^【([^】]+)】$/);
      if (bracketMatch) {
        flush();
        const header = bracketMatch[1].trim();
        if (header.includes('基本情報')) currentKey = 'meta';
        else if (header.startsWith('①')) currentKey = 'sec1';
        else if (header.startsWith('②')) currentKey = 'sec2';
        else if (header.startsWith('③')) currentKey = 'sec3';
        else if (header.startsWith('④')) currentKey = 'sec4';
        else currentKey = header;
      } else if (trimmed.match(/^①[^\n]*$/)) {
        flush();
        currentKey = 'sec1';
      } else if (trimmed.match(/^②[^\n]*$/)) {
        flush();
        currentKey = 'sec2';
      } else if (trimmed.match(/^③[^\n]*$/)) {
        flush();
        currentKey = 'sec3';
      } else if (trimmed.match(/^④[^\n]*$/)) {
        flush();
        currentKey = 'sec4';
      } else {
        if (currentKey) {
          currentLines.push(line);
        } else {
          // ヘッダーが出現する前のプレーンテキスト
          currentLines.push(line);
        }
      }
    }
    flush();

    // 基本情報のパース
    if (sections.meta) {
      const metaLines = sections.meta.split('\n');
      metaLines.forEach((line) => {
        const [k, ...v] = line.split(':');
        if (!k || v.length === 0) return;
        const key = k.trim();
        const val = v.join(':').trim();
        if (key === '氏名') data.name = val;
        else if (key === 'フリガナ') data.furigana = val;
        else if (key === '学校名') data.school = val;
        else if (key === '高校学科') data.highschoolDept = val;
        else if (key === '選抜名') data.examType = val;
        else if (key === '学部') data.faculty = val;
        else if (key === '学科') data.dept = val;
        else if (key === 'コース') data.course = val;
        else if (key === '受付番号') data.receipt = val;
      });
    }

    // 学科名が未設定の場合のフォールバック（未入力で印刷時に消えるのを確実に防ぐ）
    if (!data.dept) {
      data.dept = '情報システム';
    }

    // セクション本文とコメント（// ...）の分離関数
    const extractBodyAndComments = (rawSecText) => {
      if (!rawSecText) return { body: '', commentText: '', rawComments: [] };
      const secLines = rawSecText.split(/\r?\n/);
      const bodyLines = [];
      const commentLines = [];

      for (const line of secLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) {
          commentLines.push(trimmed.replace(/^\/\/\s*/, ''));
        } else if (line.includes('//')) {
          const idx = line.indexOf('//');
          const bodyPart = line.slice(0, idx).trimEnd();
          const commentPart = line.slice(idx + 2).trim();
          if (bodyPart) bodyLines.push(bodyPart);
          if (commentPart) commentLines.push(commentPart);
        } else {
          bodyLines.push(line);
        }
      }

      return {
        body: bodyLines.join('\n').trim(),
        commentText: commentLines.join('\n'),
        rawComments: commentLines,
      };
    };

    const parsed1 = extractBodyAndComments(sections.sec1 || '');
    data.sec1 = parsed1.body;
    data.sec1CommentText = parsed1.commentText;
    data.sec1Comments = parsed1.rawComments;

    const parsed2 = extractBodyAndComments(sections.sec2 || '');
    data.sec2 = parsed2.body;
    data.sec2CommentText = parsed2.commentText;
    data.sec2Comments = parsed2.rawComments;

    const parsed3 = extractBodyAndComments(sections.sec3 || '');
    data.sec3 = parsed3.body;
    data.sec3CommentText = parsed3.commentText;
    data.sec3Comments = parsed3.rawComments;

    const parsed4 = extractBodyAndComments(sections.sec4 || '');
    data.sec4 = parsed4.body;
    data.sec4CommentText = parsed4.commentText;
    data.sec4Comments = parsed4.rawComments;

    // セクション記号が全くない場合は全体を①に
    if (!sections.meta && !data.sec1 && !data.sec2 && !data.sec3 && !data.sec4) {
      const fallback = extractBodyAndComments(text.trim());
      data.sec1 = fallback.body;
      data.sec1CommentText = fallback.commentText;
      data.sec1Comments = fallback.rawComments;
    }

    return data;
  }

  /**
   * データオブジェクトをテキスト形式にフォーマット
   */
  formatDataToText(d) {
    const parts = [];

    // 基本情報が存在する場合のみ出力
    const hasMeta = d.name || d.furigana || d.school || d.highschoolDept || d.examType || d.faculty || d.dept || d.course || d.receipt;
    if (hasMeta) {
      const metaLines = ['【基本情報】'];
      if (d.name) metaLines.push(`氏名: ${d.name}`);
      if (d.furigana) metaLines.push(`フリガナ: ${d.furigana}`);
      if (d.school) metaLines.push(`学校名: ${d.school}`);
      if (d.highschoolDept) metaLines.push(`高校学科: ${d.highschoolDept}`);
      if (d.examType) metaLines.push(`選抜名: ${d.examType}`);
      if (d.faculty) metaLines.push(`学部: ${d.faculty}`);
      if (d.dept) metaLines.push(`学科: ${d.dept}`);
      if (d.course) metaLines.push(`コース: ${d.course}`);
      if (d.receipt) metaLines.push(`受付番号: ${d.receipt}`);
      parts.push(metaLines.join('\n'));
    }

    // コメント行（// ...）を保持しつつ本文を出力
    const formatSection = (secNum, title, body, comments) => {
      const secLines = [`【${secNum} ${title}】`];
      if (comments && comments.length > 0) {
        for (const c of comments) {
          secLines.push(`// ${c}`);
        }
      }
      if (body) {
        secLines.push(body);
      }
      return secLines.join('\n');
    };

    parts.push(formatSection('①', '志望理由', d.sec1, this.sectionComments.sec1));
    parts.push(formatSection('②', '勉学や活動', d.sec2, this.sectionComments.sec2));
    parts.push(formatSection('③', '本学に入学して取り組みたいこと', d.sec3, this.sectionComments.sec3));
    parts.push(formatSection('④', '大学卒業後を見据えた目標', d.sec4, this.sectionComments.sec4));

    return parts.join('\n\n');
  }

  /**
   * 志望理由書本文（①〜④）の合計文字数を計算して更新
   */
  updateTotalCharCount() {
    let text = '';
    if (this.currentMode === 'paper') {
      text = [
        this.inputs.sec1?.value || '',
        this.inputs.sec2?.value || '',
        this.inputs.sec3?.value || '',
        this.inputs.sec4?.value || '',
      ].join('');
    } else {
      // 文字のみモード: 見出し等を除去した本文文字数を計算
      const raw = this.masterTextarea ? this.masterTextarea.value : '';
      const parsed = this.parseTextToData(raw);
      text = [parsed.sec1, parsed.sec2, parsed.sec3, parsed.sec4].join('');
      if (!text && raw) {
        // 見出しがないプレーンテキストの場合
        text = raw.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\s/g, '');
      }
    }

    const cleanLen = text.replace(/\s/g, '').length;
    this.onCountUpdate(cleanLen);
  }
}
