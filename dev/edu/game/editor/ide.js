/**
 * ide.js
 * ハコゲーム 本格Webエディタ & Monaca風スプリットドキュメント & ビジュアル5×5ステージ作成システム
 */

(function () {
    'use strict';

    // ── 初期フォールバックコード ──
    const INITIAL_INDEX_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>ハコゲーム - BLOCK PLACEMENT PUZZLE</title>
    <link rel="stylesheet" href="style.css">
    <script src="stages.js" defer></script>
    <script src="main.js" defer></script>
</head>
<body>
    <div class="screen-view active" id="homeScreen"></div>
    <div class="screen-view" id="selectScreen"></div>
    <div class="screen-view" id="gameScreen">
        <canvas id="gameCanvas"></canvas>
        <div id="statusBar"></div>
        <span id="blockCountVal"></span>
        <button id="startBtn"></button>
        <button id="resetBtn"></button>
    </div>
</body>
</html>`;

    const INITIAL_STAGES_JS = `// ハコゲーム ステージ定義データ (stages.js)
const STAGES = [
    {
        id: 1,
        title: 'ステージ 1',
        subtitle: 'ブロックを配置してゴールを目指そう！',
        maxBlocks: 7,
        targetBlocks: 6,
        startRow: 3,
        goalRow: 1,
        forbidden: [
            { col: 3, row: 0 },
            { col: 1, row: 3 }
        ],
        gimmicks: [
            { col: 3, row: 1, type: 'dash', dir: 'left' }
        ],
        solution: [
            { col: 3, row: 1 }, { col: 0, row: 2 },
            { col: 1, row: 2 }, { col: 2, row: 2 },
            { col: 4, row: 2 }, { col: 0, row: 3 }
        ],
        legends: [
            { icon: '▨', type: 'forbidden', text: '赤の斜線：ブロックを置けません' },
            { icon: '←', type: 'dash', text: '水色矢印：左の端まで移動' }
        ]
    }
];`;

    const INITIAL_MAIN_JS = `// main.js (ゲームエンジン本体)\nconsole.log("Hako Game Engine Loaded");`;
    const INITIAL_STYLE_CSS = `/* style.css */\nbody { margin: 0; }`;

    // ── ファイル管理マップ ──
    const files = {
        'stages.js': {
            name: 'stages.js',
            type: 'javascript',
            content: INITIAL_STAGES_JS,
            defaultContent: INITIAL_STAGES_JS,
            baselineContent: INITIAL_STAGES_JS,
            isSystemFile: false
        },
        'main.js': {
            name: 'main.js',
            type: 'javascript',
            content: INITIAL_MAIN_JS,
            defaultContent: INITIAL_MAIN_JS,
            baselineContent: INITIAL_MAIN_JS,
            isSystemFile: false
        },
        'index.html': {
            name: 'index.html',
            type: 'html',
            content: INITIAL_INDEX_HTML,
            defaultContent: INITIAL_INDEX_HTML,
            baselineContent: INITIAL_INDEX_HTML,
            isSystemFile: false
        },
        'style.css': {
            name: 'style.css',
            type: 'css',
            content: INITIAL_STYLE_CSS,
            defaultContent: INITIAL_STYLE_CSS,
            baselineContent: INITIAL_STYLE_CSS,
            isSystemFile: false
        },
        'editor/index.html': {
            name: 'index.html',
            type: 'html',
            content: '<!-- loading... -->',
            defaultContent: '<!-- loading... -->',
            baselineContent: '<!-- loading... -->',
            isSystemFile: true
        },
        'editor/ide.js': {
            name: 'ide.js',
            type: 'javascript',
            content: '// loading...',
            defaultContent: '// loading...',
            baselineContent: '// loading...',
            isSystemFile: true
        },
        'editor/linter.js': {
            name: 'linter.js',
            type: 'javascript',
            content: '// loading...',
            defaultContent: '// loading...',
            baselineContent: '// loading...',
            isSystemFile: true
        },
        'editor/sticky-scroll.js': {
            name: 'sticky-scroll.js',
            type: 'javascript',
            content: '// loading...',
            defaultContent: '// loading...',
            baselineContent: '// loading...',
            isSystemFile: true
        },
        'editor/ide.css': {
            name: 'ide.css',
            type: 'css',
            content: '/* loading... */',
            defaultContent: '/* loading... */',
            baselineContent: '/* loading... */',
            isSystemFile: true
        },
        'editor/docs.css': {
            name: 'docs.css',
            type: 'css',
            content: '/* loading... */',
            defaultContent: '/* loading... */',
            baselineContent: '/* loading... */',
            isSystemFile: true
        },
        'editor/sticky-scroll.css': {
            name: 'sticky-scroll.css',
            type: 'css',
            content: '/* loading... */',
            defaultContent: '/* loading... */',
            baselineContent: '/* loading... */',
            isSystemFile: true
        }
    };

    const STORAGE_KEY_PREFIX = 'hako_game_ide_v2_';

    // ── 状態管理 ──
    let currentFile = 'stages.js';
    let openTabs = ['stages.js', 'main.js', 'index.html', 'style.css'];
    let isSplitMode = true;
    let currentDocTab = 'dictionary';
    let fileScrollMemory = {};
    let currentDiagnostics = [];
    let allFilesDiagnostics = {};
    let isDiagnosticsPanelOpen = false;
    let errorLineSet = new Set();
    let warningLineSet = new Set();
    let activeHighlightLine = null;
    let highlightClearTimer = null;
    let stickyScrollController = null;
    let minimapRenderQueued = false;

    const editorPrefs = {
        theme: 'dark',
        minimap: true,
        stickyScroll: true,
        indentGuides: true,
        diagnosticsBar: true
    };

    // ── DOM要素参照 ──
    let fileItems;
    let tabContainer;
    let editorContainer;
    let lineNumbers;
    let lineNumbersInner;
    let codeTextarea;
    let codeHighlight;
    let previewIframe;
    let paneResizer;
    let previewPane;
    let toast;
    let toastMsg;
    let btnSaveRun;
    let btnReset;
    let btnUndo;
    let btnCopyCode;
    let diagnosticsBar;
    let diagnosticsPanel;
    let diagnosticsList;
    let diagnosticsStatusDot;
    let diagnosticsStatusText;
    let btnToggleDiagnostics;
    let diagnosticsPanelResizer;
    let minimapWrap;
    let minimapCanvas;
    let minimapSlider;
    let minimapGutter;
    let editorSplitContainer;
    let editorPanePrimary;
    let editorPaneSecondary;
    let editorSplitDivider;
    let btnToggleSplit;
    let btnHeaderSplitToggle;
    let btnCloseSecondary;
    let secondaryDocsPane;
    let docsCategoryTabs;
    let docsBodyScroll;
    let systemBannerContainer;
    let systemBanner;
    let bannerBtnMinimize;
    let bannerMinimizedIcon;
    let bannerBtnGotoGame;
    let unsavedStatusPill;
    let stageQuickToolbar;
    let editorStageJumpSelect;
    let btnOpenStageBuilder;
    let btnAddStageTemplate;

    /**
     * Live Server や Cloudflare 等が HTML に自動注入するスクリプトを除去する
     */
    function cleanInjectedPlatformScripts(text) {
        if (!text || typeof text !== 'string') return text;
        let cleaned = text.replace(/\s*<!--\s*Code injected by live-server\s*-->\s*<script[\s\S]*?<\/script>/gi, '');
        cleaned = cleaned.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?(?:\/cdn-cgi\/|__CF\$cv\$params|Live-Reloading|IsThisFirstTime_Log_From_LiveServer)(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '');
        return cleaned;
    }

    // ── 初期化 ──
    document.addEventListener('DOMContentLoaded', () => {
        initDOMReferences();
        loadPreferences();
        initStickyScroll();
        loadSavedFilesFromStorage();
        loadRealFiles();
        initSidebarFolders();
        initResizers();
        initSplitViewControls();
        initDocsViewer();
        initEditorEvents();
        initHeaderActions();
        initPreviewControls();
        initMinimapInteraction();
        initDiagnosticsEvents();
        initSettingsModal();
        initStageBuilderModal();

        renderTabs();
        switchFile('stages.js');
        if (isSplitMode) {
            openSplitDocs('dictionary');
        }
    });

    function initDOMReferences() {
        fileItems = document.querySelectorAll('.file-item');
        tabContainer = document.getElementById('editor-tabs');
        editorContainer = document.getElementById('editor-pane');
        lineNumbers = document.getElementById('line-numbers');
        lineNumbersInner = document.getElementById('line-numbers-inner');
        codeTextarea = document.getElementById('code-textarea');
        codeHighlight = document.getElementById('code-highlight');
        previewIframe = document.getElementById('preview-iframe');
        paneResizer = document.getElementById('pane-resizer');
        previewPane = document.getElementById('preview-pane');
        toast = document.getElementById('ide-toast');
        toastMsg = document.getElementById('ide-toast-msg');

        btnSaveRun = document.getElementById('btn-save-run');
        btnReset = document.getElementById('btn-reset');
        btnUndo = document.getElementById('btn-undo');
        btnCopyCode = document.getElementById('btn-copy-code');

        diagnosticsBar = document.getElementById('editor-diagnostics-bar');
        diagnosticsPanel = document.getElementById('editor-diagnostics-panel');
        diagnosticsList = document.getElementById('diagnostics-list');
        diagnosticsStatusDot = document.getElementById('diagnostics-status-dot');
        diagnosticsStatusText = document.getElementById('diagnostics-status-text');
        btnToggleDiagnostics = document.getElementById('btn-toggle-diagnostics');
        diagnosticsPanelResizer = document.getElementById('diagnostics-panel-resizer');

        minimapWrap = document.getElementById('editor-minimap-wrap');
        minimapCanvas = document.getElementById('editor-minimap-canvas');
        minimapSlider = document.getElementById('editor-minimap-slider');
        minimapGutter = document.getElementById('editor-minimap-gutter');

        editorSplitContainer = document.getElementById('editor-split-container');
        editorPanePrimary = document.getElementById('editor-pane-primary');
        editorPaneSecondary = document.getElementById('editor-pane-secondary');
        editorSplitDivider = document.getElementById('editor-split-divider');
        btnToggleSplit = document.getElementById('btn-toggle-split');
        btnHeaderSplitToggle = document.getElementById('btn-header-split-toggle');
        btnCloseSecondary = document.getElementById('btn-close-secondary');

        secondaryDocsPane = document.getElementById('secondary-docs-pane');
        docsCategoryTabs = document.getElementById('docs-category-tabs');
        docsBodyScroll = document.getElementById('docs-body-scroll');

        systemBannerContainer = document.getElementById('system-file-banner-container');
        systemBanner = document.getElementById('system-file-banner');
        bannerBtnMinimize = document.getElementById('banner-btn-minimize');
        bannerMinimizedIcon = document.getElementById('system-banner-minimized-icon');
        bannerBtnGotoGame = document.getElementById('banner-btn-goto-game-stages');
        unsavedStatusPill = document.getElementById('unsaved-status-pill');

        stageQuickToolbar = document.getElementById('stage-quick-toolbar');
        editorStageJumpSelect = document.getElementById('editor-stage-jump-select');
        btnOpenStageBuilder = document.getElementById('btn-open-stage-builder');
        btnAddStageTemplate = document.getElementById('btn-add-stage-template');
    }

    function initStickyScroll() {
        const stickyContainer = document.getElementById('editor-sticky-scroll-container');
        const stickyLinesEl = document.getElementById('sticky-scroll-lines');
        if (typeof window.StickyScrollController === 'function' && stickyContainer && stickyLinesEl) {
            stickyScrollController = new window.StickyScrollController();
            stickyScrollController.init({
                container: stickyContainer,
                linesContainer: stickyLinesEl,
                highlightSyntax: (lineText, langType) => highlightSyntax(lineText, langType),
                renderIndentGuides: (lineText) => renderIndentGuidesForSticky(lineText),
                jumpToStickyLine: (lineNumber) => jumpToLine(lineNumber),
                errorLineSet: errorLineSet,
                warningLineSet: warningLineSet,
                getLineHeight: () => 22.4,
                isEnabled: () => Boolean(editorPrefs.stickyScroll)
            });
            window.stickyScrollInstance = stickyScrollController;
        }
    }

    function renderIndentGuidesForSticky(lineText) {
        if (!editorPrefs.indentGuides || !lineText) return '';
        let spaceCount = 0;
        for (let i = 0; i < lineText.length; i++) {
            if (lineText[i] === ' ') spaceCount++;
            else if (lineText[i] === '\t') spaceCount += 4;
            else break;
        }
        const guideCount = Math.floor(spaceCount / 4);
        let html = '';
        for (let g = 0; g < guideCount; g++) {
            const leftCh = g * 4;
            html += `<span class="indent-guide" style="left: calc(20px + ${leftCh}ch);"></span>`;
        }
        return html;
    }

    // ── 環境設定のロード・保存 ──
    function loadPreferences() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'prefs');
            if (saved) {
                Object.assign(editorPrefs, JSON.parse(saved));
            }
        } catch (e) { /* ignore */ }
        applyPreferences();
    }

    function savePreferences() {
        try {
            localStorage.setItem(STORAGE_KEY_PREFIX + 'prefs', JSON.stringify(editorPrefs));
        } catch (e) { /* ignore */ }
        applyPreferences();
    }

    function applyPreferences() {
        document.body.classList.toggle('theme-light', editorPrefs.theme === 'light');
        if (minimapWrap) {
            minimapWrap.style.display = editorPrefs.minimap ? 'block' : 'none';
        }
        if (diagnosticsBar) {
            diagnosticsBar.style.display = editorPrefs.diagnosticsBar ? 'flex' : 'none';
        }
        if (stickyScrollController) {
            stickyScrollController.setEnabled(Boolean(editorPrefs.stickyScroll));
        } else {
            const stickyEl = document.getElementById('editor-sticky-scroll-container');
            if (stickyEl && !editorPrefs.stickyScroll) {
                stickyEl.style.display = 'none';
            }
        }
        const darkBtn = document.getElementById('theme-choice-dark');
        const lightBtn = document.getElementById('theme-choice-light');
        if (darkBtn && lightBtn) {
            darkBtn.classList.toggle('is-active', editorPrefs.theme === 'dark');
            lightBtn.classList.toggle('is-active', editorPrefs.theme === 'light');
        }
        const minimapToggle = document.getElementById('setting-toggle-minimap');
        if (minimapToggle) minimapToggle.checked = Boolean(editorPrefs.minimap);
        const stickyToggle = document.getElementById('setting-toggle-sticky');
        if (stickyToggle) stickyToggle.checked = Boolean(editorPrefs.stickyScroll);
        const indentToggle = document.getElementById('setting-indent-guides');
        if (indentToggle) indentToggle.checked = Boolean(editorPrefs.indentGuides);
        const diagToggle = document.getElementById('setting-diagnostics-bar');
        if (diagToggle) diagToggle.checked = Boolean(editorPrefs.diagnosticsBar);
    }

    // ── ローカルストレージと実ファイルのロード ──
    function loadSavedFilesFromStorage() {
        Object.keys(files).forEach(key => {
            if (files[key].isSystemFile) return;
            try {
                const saved = localStorage.getItem(STORAGE_KEY_PREFIX + key);
                if (saved) {
                    files[key].content = files[key]. name.endsWith('.html')
                        ? cleanInjectedPlatformScripts(saved)
                        : saved;
                }
            } catch (e) { /* ignore */ }
        });
    }

    async function loadRealFiles() {
        const fetchMap = {
            'stages.js': '../stages.js',
            'main.js': '../main.js',
            'index.html': '../index.html',
            'style.css': '../style.css',
            'editor/index.html': './index.html',
            'editor/ide.js': './ide.js',
            'editor/linter.js': './linter.js',
            'editor/sticky-scroll.js': './sticky-scroll.js',
            'editor/ide.css': './ide.css',
            'editor/docs.css': './docs.css',
            'editor/sticky-scroll.css': './sticky-scroll.css'
        };

        for (const [key, relUrl] of Object.entries(fetchMap)) {
            try {
                const res = await fetch(relUrl + '?t=' + Date.now(), { cache: 'no-store' });
                if (res.ok) {
                    let rawText = await res.text();
                    if (key.endsWith('.html')) {
                        rawText = cleanInjectedPlatformScripts(rawText);
                    }
                    files[key].defaultContent = rawText;
                    files[key].baselineContent = rawText;

                    const saved = !files[key].isSystemFile ? localStorage.getItem(STORAGE_KEY_PREFIX + key) : null;
                    if (!saved || files[key].isSystemFile) {
                        files[key].content = rawText;
                    } else if (key.endsWith('.html')) {
                        const cleanSaved = cleanInjectedPlatformScripts(saved);
                        files[key].content = cleanSaved;
                    }

                    if (key === currentFile) {
                        renderCurrentFile();
                    }
                    if (key === 'stages.js') {
                        populateStageJumpSelectors();
                    }
                }
            } catch (e) {
                console.warn('File fetch skipped:', key, e);
            }
        }
        updateAllFilesDiagnostics();
        updateUnsavedUI();
    }

    // ── サイドバーのフォルダ開閉とアイテム選択 ──
    function initSidebarFolders() {
        const folderButtons = document.querySelectorAll('.tree-folder-group > .tree-item-row[data-folder]');
        folderButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.closest('.tree-folder-group');
                if (!group) return;
                const isOpen = group.classList.toggle('is-open');
                btn.classList.toggle('is-open', isOpen);
                btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                const chevron = btn.querySelector('.tree-chevron');
                if (chevron) chevron.classList.toggle('closed', !isOpen);
            });
        });

        fileItems.forEach(item => {
            item.addEventListener('click', () => {
                const path = item.getAttribute('data-path');
                if (path && files[path]) {
                    switchFile(path);
                }
            });
        });

        const btnSidebarVisualBuilder = document.getElementById('btn-sidebar-visual-builder');
        if (btnSidebarVisualBuilder) {
            btnSidebarVisualBuilder.addEventListener('click', () => {
                openStageBuilderModal();
            });
        }

        const btnSidebarAddStage = document.getElementById('btn-sidebar-add-stage');
        if (btnSidebarAddStage) {
            btnSidebarAddStage.addEventListener('click', () => {
                insertNewStageTemplate();
            });
        }
    }

    // ── ファイル・タブ切り替え ──
    function switchFile(fileKey) {
        if (!files[fileKey]) return;

        if (currentFile && codeTextarea) {
            fileScrollMemory[currentFile] = {
                top: codeTextarea.scrollTop,
                left: codeTextarea.scrollLeft
            };
        }

        currentFile = fileKey;
        if (!openTabs.includes(fileKey)) {
            openTabs.push(fileKey);
        }

        fileItems.forEach(item => {
            const path = item.getAttribute('data-path');
            item.classList.toggle('active', path === fileKey);
        });

        renderTabs();
        renderCurrentFile();

        const isSys = Boolean(files[fileKey].isSystemFile);
        if (systemBannerContainer) {
            systemBannerContainer.style.display = isSys ? 'block' : 'none';
        }
        if (codeTextarea) {
            codeTextarea.readOnly = isSys;
        }
        if (stageQuickToolbar) {
            stageQuickToolbar.style.display = fileKey === 'stages.js' ? 'flex' : 'none';
        }

        const mem = fileScrollMemory[fileKey] || { top: 0, left: 0 };
        requestAnimationFrame(() => {
            if (codeTextarea) {
                codeTextarea.scrollTop = mem.top;
                codeTextarea.scrollLeft = mem.left;
                syncEditorScroll();
            }
        });
    }

    function renderTabs() {
        if (!tabContainer) return;
        tabContainer.innerHTML = '';

        openTabs.forEach(fileKey => {
            const f = files[fileKey];
            if (!f) return;
            const tab = document.createElement('div');
            tab.className = 'editor-tab' + (fileKey === currentFile ? ' active' : '');
            tab.setAttribute('data-file', fileKey);

            const isDirty = !f.isSystemFile && f.content !== f.baselineContent;
            const fileIssues = allFilesDiagnostics[fileKey] || [];
            const hasErr = fileIssues.some(i => i.severity === 'error');
            const hasWarn = !hasErr && fileIssues.some(i => i.severity === 'warning');
            if (hasErr) tab.classList.add('has-error');
            else if (hasWarn) tab.classList.add('has-warning');

            let iconHtml = '';
            if (fileKey.endsWith('.js')) {
                iconHtml = `<span class="tab-icon js-icon">JS</span>`;
            } else if (fileKey.endsWith('.html')) {
                iconHtml = `<span class="tab-icon html-icon">&lt;/&gt;</span>`;
            } else if (fileKey.endsWith('.css')) {
                iconHtml = `<span class="tab-icon css-icon">{ }</span>`;
            }

            const dirtyDot = isDirty ? `<span class="tab-dirty-dot" title="未保存の変更があります">●</span>` : '';
            const closeBtn = openTabs.length > 1
                ? `<button type="button" class="tab-close-btn" data-close="${fileKey}" title="タブを閉じる">×</button>`
                : '';

            tab.innerHTML = `${iconHtml}<span class="tab-label">${f.name}</span>${dirtyDot}${closeBtn}`;

            tab.addEventListener('click', (e) => {
                const closeTarget = e.target.closest('.tab-close-btn');
                if (closeTarget) {
                    e.stopPropagation();
                    closeTab(fileKey);
                    return;
                }
                switchFile(fileKey);
            });

            tabContainer.appendChild(tab);
        });
    }

    function closeTab(fileKey) {
        if (openTabs.length <= 1) return;
        const idx = openTabs.indexOf(fileKey);
        if (idx === -1) return;
        openTabs.splice(idx, 1);
        if (currentFile === fileKey) {
            const nextKey = openTabs[Math.max(0, idx - 1)];
            switchFile(nextKey);
        } else {
            renderTabs();
        }
    }

    // ── コード描画・シンタックスハイライト・行番号・インデントガイド ──
    function renderCurrentFile() {
        const f = files[currentFile];
        if (!f || !codeTextarea || !codeHighlight) return;

        if (codeTextarea.value !== f.content) {
            codeTextarea.value = f.content;
        }

        runLinter();
        updateHighlightAndLines();
        updateUnsavedUI();

        if (stickyScrollController) {
            stickyScrollController.updateFile(currentFile, f.content, f.type);
            stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
        }
        queueMinimapRender();
    }

    function updateHighlightAndLines() {
        const f = files[currentFile];
        if (!f || !codeHighlight || !lineNumbersInner) return;

        const text = f.content || '';
        const lines = text.split('\n');
        const lineCount = lines.length;

        // 1. 行番号生成（.line-num + エラー/警告クラス + アクティブ行）
        let lineNumsHtml = '';
        for (let i = 1; i <= lineCount; i++) {
            let cls = 'line-num';
            if (errorLineSet.has(i)) cls += ' has-error';
            else if (warningLineSet.has(i)) cls += ' has-warning';
            if (activeHighlightLine === i) cls += ' is-active-line';
            lineNumsHtml += `<div class="${cls}" data-line="${i}">${i}</div>`;
        }
        lineNumbersInner.innerHTML = lineNumsHtml;

        // 2. シンタックスハイライト + 行ごとのエラー背景・インデントガイド生成
        const highlightedFull = highlightSyntax(text, f.type);
        const highlightedLines = highlightedFull.split('\n');

        let codeHtml = '';
        for (let i = 0; i < lineCount; i++) {
            const lineNo = i + 1;
            const rawLine = lines[i] || '';
            const hlLine = highlightedLines[i] !== undefined ? highlightedLines[i] : '';
            let rowCls = 'code-line-row';
            if (errorLineSet.has(lineNo)) rowCls += ' line-error-bg';
            else if (warningLineSet.has(lineNo)) rowCls += ' line-warning-bg';
            if (activeHighlightLine === lineNo) rowCls += ' line-jump-flash';

            const guidesHtml = editorPrefs.indentGuides ? buildLineIndentGuides(rawLine) : '';
            codeHtml += `<div class="${rowCls}" data-line="${lineNo}">${guidesHtml}${hlLine || ' '}</div>`;
        }
        codeHighlight.innerHTML = codeHtml;
    }

    function buildLineIndentGuides(rawLine) {
        if (!rawLine) return '';
        let spaces = 0;
        for (let i = 0; i < rawLine.length; i++) {
            if (rawLine[i] === ' ') spaces++;
            else if (rawLine[i] === '\t') spaces += 4;
            else break;
        }
        const count = Math.floor(spaces / 4);
        if (count <= 0) return '';
        let guides = '';
        for (let g = 0; g < count; g++) {
            guides += `<span class="indent-guide" style="left: ${g * 4}ch;"></span>`;
        }
        return guides;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function highlightSyntax(code, type) {
        if (!code) return '';
        if (type === 'html') return highlightHTML(code);
        if (type === 'css') return highlightCSS(code);
        return highlightJS(code);
    }

    function highlightJS(code) {
        const tokenRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|try|catch|finally|throw|typeof|instanceof|in|of|class|extends|super|import|export|from|default|async|await|void|delete)\b|\b(true|false|null|undefined|NaN|Infinity)\b|\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b|\b(id|title|subtitle|maxBlocks|targetBlocks|startRow|goalRow|hasCeiling|forbidden|gimmicks|solution|legends|col|row|type|dir|steps|purpleBorder|icon|text|STAGES|window|document|Math|console|Array|Object|Set|Map|JSON|localStorage)\b|([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g;

        let result = '';
        let lastIndex = 0;
        let match;

        while ((match = tokenRegex.exec(code)) !== null) {
            if (match.index > lastIndex) {
                result += escapeHtml(code.slice(lastIndex, match.index));
            }
            const [full, comment, str, kw, bool, num, keyProp, fnCall] = match;
            if (comment) {
                if (comment.includes('\n')) {
                    result += comment.split('\n').map(l => `<span class="tok-comment">${escapeHtml(l)}</span>`).join('\n');
                } else {
                    result += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
                }
            } else if (str) {
                if (str.includes('\n')) {
                    result += str.split('\n').map(l => `<span class="tok-string">${escapeHtml(l)}</span>`).join('\n');
                } else {
                    result += `<span class="tok-string">${escapeHtml(str)}</span>`;
                }
            } else if (kw) {
                result += `<span class="tok-keyword">${escapeHtml(kw)}</span>`;
            } else if (bool) {
                result += `<span class="tok-boolean">${escapeHtml(bool)}</span>`;
            } else if (num) {
                result += `<span class="tok-number">${escapeHtml(num)}</span>`;
            } else if (keyProp) {
                result += `<span class="tok-property">${escapeHtml(keyProp)}</span>`;
            } else if (fnCall) {
                result += `<span class="tok-function">${escapeHtml(fnCall)}</span>`;
            } else {
                result += escapeHtml(full);
            }
            lastIndex = tokenRegex.lastIndex;
        }
        if (lastIndex < code.length) {
            result += escapeHtml(code.slice(lastIndex));
        }
        return result;
    }

    function highlightCSS(code) {
        const tokenRegex = /(\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(#[0-9a-fA-F]{3,8}\b)|\b(\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms|deg|fr)?)\b|([a-zA-Z-]+)(?=\s*:)/g;
        let result = '';
        let lastIndex = 0;
        let match;
        while ((match = tokenRegex.exec(code)) !== null) {
            if (match.index > lastIndex) {
                result += escapeHtml(code.slice(lastIndex, match.index));
            }
            const [full, comment, str, hex, num, prop] = match;
            if (comment) {
                result += comment.split('\n').map(l => `<span class="tok-comment">${escapeHtml(l)}</span>`).join('\n');
            } else if (str) {
                result += `<span class="tok-string">${escapeHtml(str)}</span>`;
            } else if (hex) {
                result += `<span class="tok-number">${escapeHtml(hex)}</span>`;
            } else if (num) {
                result += `<span class="tok-number">${escapeHtml(num)}</span>`;
            } else if (prop) {
                result += `<span class="tok-property">${escapeHtml(prop)}</span>`;
            } else {
                result += escapeHtml(full);
            }
            lastIndex = tokenRegex.lastIndex;
        }
        if (lastIndex < code.length) {
            result += escapeHtml(code.slice(lastIndex));
        }
        return result;
    }

    function highlightHTML(code) {
        const tokenRegex = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9-]+)|(\b[a-zA-Z_:][a-zA-Z0-9_:-]*(?=\s*=))|("[^"]*"|'[^']*')/g;
        let result = '';
        let lastIndex = 0;
        let match;
        while ((match = tokenRegex.exec(code)) !== null) {
            if (match.index > lastIndex) {
                result += escapeHtml(code.slice(lastIndex, match.index));
            }
            const [full, comment, tag, attr, str] = match;
            if (comment) {
                result += comment.split('\n').map(l => `<span class="tok-comment">${escapeHtml(l)}</span>`).join('\n');
            } else if (tag) {
                result += `<span class="tok-keyword">${escapeHtml(tag)}</span>`;
            } else if (attr) {
                result += `<span class="tok-property">${escapeHtml(attr)}</span>`;
            } else if (str) {
                result += `<span class="tok-string">${escapeHtml(str)}</span>`;
            } else {
                result += escapeHtml(full);
            }
            lastIndex = tokenRegex.lastIndex;
        }
        if (lastIndex < code.length) {
            result += escapeHtml(code.slice(lastIndex));
        }
        return result;
    }

    // ── スクロール同期（クリッピングしない scrollTop / scrollLeft 方式） ──
    function syncEditorScroll() {
        if (!codeTextarea || !codeHighlight || !lineNumbersInner) return;
        const scrollTop = codeTextarea.scrollTop;
        const scrollLeft = codeTextarea.scrollLeft;

        codeHighlight.scrollTop = scrollTop;
        codeHighlight.scrollLeft = scrollLeft;
        lineNumbersInner.style.transform = `translateY(-${scrollTop}px)`;

        if (stickyScrollController) {
            stickyScrollController.updateScroll(scrollTop, scrollLeft);
        }
        syncMinimapSlider();
    }

    // ── Monaca風 2分割スプリットビュー & 技術資料・辞書ビュー ──
    function initSplitViewControls() {
        if (btnToggleSplit) {
            btnToggleSplit.addEventListener('click', () => toggleSplitView());
        }
        if (btnHeaderSplitToggle) {
            btnHeaderSplitToggle.addEventListener('click', () => toggleSplitView());
        }
        if (btnCloseSecondary) {
            btnCloseSecondary.addEventListener('click', () => setSplitView(false));
        }

        const docJumpItems = document.querySelectorAll('.doc-jump-item');
        docJumpItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.getAttribute('data-tab-target') || 'dictionary';
                openSplitDocs(targetTab);
                docJumpItems.forEach(d => d.classList.toggle('active', d === item));
            });
        });
    }

    function toggleSplitView() {
        setSplitView(!isSplitMode);
    }

    function setSplitView(enable) {
        isSplitMode = Boolean(enable);
        if (editorSplitContainer) {
            editorSplitContainer.classList.toggle('is-split', isSplitMode);
        }
        if (btnToggleSplit) {
            btnToggleSplit.classList.toggle('active', isSplitMode);
        }
        if (btnHeaderSplitToggle) {
            btnHeaderSplitToggle.classList.toggle('active', isSplitMode);
        }
        if (!isSplitMode && editorPanePrimary && editorPaneSecondary) {
            editorPanePrimary.style.flex = '';
            editorPaneSecondary.style.flex = '';
        }
        queueMinimapRender();
    }

    function openSplitDocs(tabId) {
        setSplitView(true);
        if (tabId) {
            switchDocTab(tabId);
        }
    }

    function initDocsViewer() {
        if (!window.DOCS_DATA || !docsCategoryTabs || !docsBodyScroll) return;

        docsCategoryTabs.innerHTML = '';
        window.DOCS_DATA.tabs.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'docs-cat-tab-btn' + (t.id === currentDocTab ? ' active' : '');
            btn.setAttribute('data-doc-tab', t.id);
            btn.innerHTML = `${t.icon} ${t.title}`;
            btn.addEventListener('click', () => switchDocTab(t.id));
            docsCategoryTabs.appendChild(btn);
        });

        switchDocTab(currentDocTab);
    }

    function switchDocTab(tabId) {
        if (!window.DOCS_DATA || !window.DOCS_DATA.content[tabId]) return;
        currentDocTab = tabId;

        if (docsCategoryTabs) {
            const btns = docsCategoryTabs.querySelectorAll('.docs-cat-tab-btn');
            btns.forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-doc-tab') === tabId);
            });
        }

        const docJumpItems = document.querySelectorAll('.doc-jump-item');
        docJumpItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-tab-target') === tabId);
        });

        if (docsBodyScroll) {
            docsBodyScroll.innerHTML = window.DOCS_DATA.content[tabId];
            docsBodyScroll.scrollTop = 0;

            const innerTabs = docsBodyScroll.querySelectorAll('.tab-content');
            innerTabs.forEach(el => el.classList.add('active'));

            // 辞書内のミニ5×5グリッド図解を描画
            renderMiniGrids(docsBodyScroll);

            // ページ内アンカーリンク (#dict-read 等) のスムーズスクロール対応
            const anchorLinks = docsBodyScroll.querySelectorAll('a[href^="#"]');
            anchorLinks.forEach(a => {
                a.addEventListener('click', (e) => {
                    const targetId = a.getAttribute('href').slice(1);
                    const safeId = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(targetId) : targetId;
                    const targetEl = docsBodyScroll.querySelector('#' + safeId);
                    if (targetEl) {
                        e.preventDefault();
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            });

            // コードスニペットへのワンクリックコピーボタン付与
            const preBlocks = docsBodyScroll.querySelectorAll('pre');
            preBlocks.forEach(pre => {
                if (pre.closest('.code-container')) return; // 既にヘッダーCOPYボタンがある場合は除外
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(pre);

                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'code-copy-floating-btn';
                copyBtn.textContent = 'コピー';
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(pre.innerText).then(() => {
                        copyBtn.textContent = '✓ コピー済';
                        showToast('コードスニペットをコピーしました');
                        setTimeout(() => { copyBtn.textContent = 'コピー'; }, 1500);
                    });
                });
                wrapper.appendChild(copyBtn);
            });
        }
    }

    /**
     * 技術資料・辞書内の <div class="mini-grid" ...> を描画する
     */
    function renderMiniGrids(rootEl) {
        const container = rootEl || document;
        const arrowChar = { up: '↑', down: '↓', left: '←', right: '→' };
        container.querySelectorAll('.mini-grid').forEach(el => {
            const mark = (el.dataset.mark || '').split(';').filter(Boolean);
            const forb = (el.dataset.forbidden || '').split(';').filter(Boolean);
            const purple = (el.dataset.purple || '').split(';').filter(Boolean);
            const dash = (el.dataset.dash || '').split(';').filter(Boolean);
            const step = (el.dataset.step || '').split(';').filter(Boolean);
            el.innerHTML = '';
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 5; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'mini-cell';
                    const key = `${c},${r}`;
                    cell.textContent = key;
                    if (mark.includes(key)) cell.classList.add('mark');
                    if (forb.includes(key)) { cell.classList.add('forb'); cell.textContent = ''; }
                    if (purple.includes(key)) { cell.classList.add('purple'); cell.textContent = ''; }
                    dash.forEach(d => {
                        const [dc, dr, dir] = d.split(',');
                        if (+dc === c && +dr === r) {
                            cell.classList.add('dash');
                            cell.textContent = arrowChar[dir] || '→';
                        }
                    });
                    step.forEach(s => {
                        const [sc, sr, dir] = s.split(',');
                        if (+sc === c && +sr === r) {
                            cell.classList.add('step');
                            cell.textContent = arrowChar[dir] || '↑';
                        }
                    });
                    el.appendChild(cell);
                }
            }
        });
    }

    // ── ドキュメント内のボタンから呼ばれるグローバル関数群 ──
    window.switchTab = function (tabId) {
        openSplitDocs(tabId);
    };

    window.jumpToCode = function (targetFile, lineOrPattern) {
        const fileKey = files[targetFile] ? targetFile : 'stages.js';
        switchFile(fileKey);

        let targetLine = 1;
        const text = files[fileKey].content || '';
        const lines = text.split('\n');

        if (typeof lineOrPattern === 'number') {
            targetLine = Math.max(1, Math.min(lineOrPattern, lines.length));
        } else if (typeof lineOrPattern === 'string' && lineOrPattern.trim()) {
            const idx = lines.findIndex(l => l.includes(lineOrPattern));
            if (idx !== -1) {
                targetLine = idx + 1;
            }
        }

        setTimeout(() => {
            jumpToLine(targetLine, 1);
            showToast(`「${fileKey}」の ${targetLine} 行目へ移動しました`);
        }, 60);
    };

    window.openPlaygroundWithTemplate = function () {
        insertNewStageTemplate();
    };

    window.copyCode = function (btnEl) {
        const container = btnEl && btnEl.closest('.code-container');
        const codeEl = container ? container.querySelector('pre code, pre') : null;
        if (!codeEl) return;
        navigator.clipboard.writeText(codeEl.innerText).then(() => {
            const orig = btnEl.textContent;
            btnEl.textContent = 'COPIED!';
            showToast('テンプレートをクリップボードにコピーしました');
            setTimeout(() => { btnEl.textContent = orig; }, 1500);
        });
    };

    // ── 高精細シンタックスカラー対応ミニマップ (Code Map) ──
    function queueMinimapRender() {
        if (minimapRenderQueued) return;
        minimapRenderQueued = true;
        requestAnimationFrame(() => {
            minimapRenderQueued = false;
            renderMinimap();
        });
    }

    function renderMinimap() {
        if (!minimapCanvas || !minimapWrap || !codeTextarea || !editorPrefs.minimap) return;
        const f = files[currentFile];
        if (!f) return;

        const rect = minimapWrap.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = Math.floor(rect.width);
        const cssH = Math.floor(rect.height);

        if (minimapCanvas.width !== cssW * dpr || minimapCanvas.height !== cssH * dpr) {
            minimapCanvas.width = cssW * dpr;
            minimapCanvas.height = cssH * dpr;
        }

        const ctx = minimapCanvas.getContext('2d');
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cssW, cssH);

        const lines = (f.content || '').split('\n');
        const totalLines = lines.length;
        const lineStep = 3; // 1行あたりの高さ(px)
        const barH = 1.8;
        const maxVisibleLines = Math.floor(cssH / lineStep);
        const scaleY = totalLines > maxVisibleLines ? (cssH / (totalLines * lineStep)) : 1;

        const isLight = editorPrefs.theme === 'light';
        const palette = isLight ? {
            comment: 'rgba(100, 116, 139, 0.55)',
            keyword: 'rgba(217, 70, 239, 0.75)',
            string: 'rgba(22, 163, 74, 0.7)',
            number: 'rgba(37, 99, 235, 0.75)',
            default: 'rgba(51, 65, 85, 0.55)',
            errorBand: 'rgba(239, 68, 68, 0.28)',
            warnBand: 'rgba(245, 158, 11, 0.25)'
        } : {
            comment: 'rgba(139, 148, 158, 0.5)',
            keyword: 'rgba(255, 123, 114, 0.8)',
            string: 'rgba(165, 214, 255, 0.75)',
            number: 'rgba(121, 192, 255, 0.8)',
            default: 'rgba(201, 209, 217, 0.55)',
            errorBand: 'rgba(248, 81, 73, 0.32)',
            warnBand: 'rgba(210, 153, 34, 0.28)'
        };

        for (let i = 0; i < totalLines; i++) {
            const lineNo = i + 1;
            const y = i * lineStep * scaleY;
            if (y > cssH) break;

            if (errorLineSet.has(lineNo)) {
                ctx.fillStyle = palette.errorBand;
                ctx.fillRect(0, y, cssW, Math.max(2, lineStep * scaleY));
            } else if (warningLineSet.has(lineNo)) {
                ctx.fillStyle = palette.warnBand;
                ctx.fillRect(0, y, cssW, Math.max(2, lineStep * scaleY));
            }

            const raw = lines[i];
            if (!raw || !raw.trim()) continue;

            const trimmed = raw.trimStart();
            const indent = raw.length - trimmed.length;
            let x = 4 + Math.min(indent, 28) * 1.1;

            if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) {
                ctx.fillStyle = palette.comment;
                ctx.fillRect(x, y, Math.min(cssW - x - 4, trimmed.length * 1.1), Math.max(1, barH * scaleY));
                continue;
            }

            const segments = trimmed.split(/(\s+|[{}()[\].,:;])/);
            for (let s = 0; s < segments.length; s++) {
                const seg = segments[s];
                if (!seg) continue;
                if (/^\s+$/.test(seg)) {
                    x += seg.length * 1.0;
                    continue;
                }
                const w = Math.max(1.5, seg.length * 1.15);
                if (x + w > cssW - 3) break;

                if (/^(const|let|var|function|return|if|else|for|while|switch|case|break|new|try|catch)$/.test(seg)) {
                    ctx.fillStyle = palette.keyword;
                } else if (/^['"\x60]/.test(seg)) {
                    ctx.fillStyle = palette.string;
                } else if (/^\d/.test(seg) || /^(true|false|null)$/.test(seg)) {
                    ctx.fillStyle = palette.number;
                } else {
                    ctx.fillStyle = palette.default;
                }
                ctx.fillRect(x, y, w, Math.max(1, barH * scaleY));
                x += w + 0.8;
            }
        }

        ctx.restore();
        updateMinimapGutterMarkers(totalLines, cssH, lineStep, scaleY);
        syncMinimapSlider();
    }

    function updateMinimapGutterMarkers(totalLines, cssH, lineStep, scaleY) {
        if (!minimapGutter) return;
        minimapGutter.innerHTML = '';
        if (totalLines <= 0) return;

        errorLineSet.forEach(lineNo => {
            const y = (lineNo - 1) * lineStep * scaleY;
            const marker = document.createElement('div');
            marker.className = 'minimap-gutter-marker error';
            marker.style.top = `${Math.min(cssH - 3, Math.max(0, y))}px`;
            minimapGutter.appendChild(marker);
        });
        warningLineSet.forEach(lineNo => {
            if (errorLineSet.has(lineNo)) return;
            const y = (lineNo - 1) * lineStep * scaleY;
            const marker = document.createElement('div');
            marker.className = 'minimap-gutter-marker warning';
            marker.style.top = `${Math.min(cssH - 3, Math.max(0, y))}px`;
            minimapGutter.appendChild(marker);
        });
    }

    function syncMinimapSlider() {
        if (!minimapSlider || !minimapWrap || !codeTextarea || !editorPrefs.minimap) return;
        const wrapH = minimapWrap.clientHeight;
        if (wrapH <= 0) return;

        const scrollHeight = Math.max(1, codeTextarea.scrollHeight);
        const clientHeight = codeTextarea.clientHeight;
        const scrollTop = codeTextarea.scrollTop;

        const lines = (files[currentFile]?.content || '').split('\n');
        const contentMinimapH = Math.min(wrapH, lines.length * 3);

        const visibleRatio = Math.min(1, clientHeight / scrollHeight);
        const sliderH = Math.max(24, Math.round(contentMinimapH * visibleRatio));
        const maxScrollTop = Math.max(1, scrollHeight - clientHeight);
        const scrollRatio = Math.min(1, Math.max(0, scrollTop / maxScrollTop));
        const maxSliderTop = Math.max(0, contentMinimapH - sliderH);

        minimapSlider.style.height = `${sliderH}px`;
        minimapSlider.style.top = `${Math.round(scrollRatio * maxSliderTop)}px`;
    }

    function initMinimapInteraction() {
        if (!minimapWrap || !codeTextarea) return;

        let isDragging = false;

        function scrollFromMinimapClientY(clientY) {
            const rect = minimapWrap.getBoundingClientRect();
            const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));
            const lines = (files[currentFile]?.content || '').split('\n');
            const effectiveH = Math.max(40, Math.min(rect.height, lines.length * 3));
            const ratio = Math.max(0, Math.min(1, relY / effectiveH));
            const maxScroll = Math.max(0, codeTextarea.scrollHeight - codeTextarea.clientHeight);
            codeTextarea.scrollTop = ratio * maxScroll;
            syncEditorScroll();
        }

        minimapWrap.addEventListener('mousedown', (e) => {
            isDragging = true;
            minimapWrap.classList.add('is-dragging');
            scrollFromMinimapClientY(e.clientY);
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            scrollFromMinimapClientY(e.clientY);
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                minimapWrap.classList.remove('is-dragging');
            }
        });

        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => queueMinimapRender());
            ro.observe(minimapWrap);
        }
    }

    // ── Linter 構文・横断チェック & 診断パネル ──
    function runLinter() {
        if (typeof window.Linter === 'undefined') return;
        const f = files[currentFile];
        if (!f) return;

        currentDiagnostics = f.isSystemFile
            ? []
            : window.Linter.lint(currentFile, f.content, {
                baselineCode: f.baselineContent,
                allFiles: files
            });

        allFilesDiagnostics[currentFile] = currentDiagnostics;

        errorLineSet.clear();
        warningLineSet.clear();
        currentDiagnostics.forEach(iss => {
            if (iss.severity === 'error') errorLineSet.add(iss.line);
            else warningLineSet.add(iss.line);
        });

        updateDiagnosticsUI();
        updateFileTreeErrorIndicators();
        renderTabs();
    }

    function updateAllFilesDiagnostics() {
        if (typeof window.Linter === 'undefined') return;
        Object.keys(files).forEach(key => {
            if (files[key].isSystemFile) {
                allFilesDiagnostics[key] = [];
                return;
            }
            allFilesDiagnostics[key] = window.Linter.lint(key, files[key].content, {
                baselineCode: files[key].baselineContent,
                allFiles: files
            });
        });
        runLinter();
    }

    function updateFileTreeErrorIndicators() {
        let rootHasError = false;
        let rootHasWarning = false;

        fileItems.forEach(item => {
            const path = item.getAttribute('data-path');
            const issues = allFilesDiagnostics[path] || [];
            const errCount = issues.filter(i => i.severity === 'error').length;
            const warnCount = issues.filter(i => i.severity === 'warning').length;

            item.classList.toggle('has-error', errCount > 0);
            item.classList.toggle('has-warning', errCount === 0 && warnCount > 0);

            if (!files[path]?.isSystemFile) {
                if (errCount > 0) rootHasError = true;
                else if (warnCount > 0) rootHasWarning = true;
            }

            let badge = item.querySelector('.tree-error-badge');
            if (errCount > 0 || warnCount > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    item.appendChild(badge);
                }
                badge.className = 'tree-error-badge ' + (errCount > 0 ? 'error-badge' : 'warning-badge');
                badge.textContent = errCount > 0 ? String(errCount) : String(warnCount);
            } else if (badge) {
                badge.remove();
            }
        });

        const rootToggle = document.getElementById('folder-toggle-root');
        if (rootToggle) {
            let dot = rootToggle.querySelector('.folder-status-dot');
            if (rootHasError || rootHasWarning) {
                if (!dot) {
                    dot = document.createElement('span');
                    rootToggle.appendChild(dot);
                }
                dot.className = 'folder-status-dot ' + (rootHasError ? 'error' : 'warning');
            } else if (dot) {
                dot.remove();
            }
        }
    }

    function updateDiagnosticsUI() {
        if (!diagnosticsBar || !diagnosticsStatusDot || !diagnosticsStatusText) return;

        const errors = currentDiagnostics.filter(d => d.severity === 'error');
        const warnings = currentDiagnostics.filter(d => d.severity === 'warning');

        diagnosticsBar.classList.remove('has-error', 'has-warning');
        diagnosticsStatusDot.className = 'diagnostics-status-dot';

        if (errors.length > 0) {
            diagnosticsBar.classList.add('has-error');
            diagnosticsStatusDot.classList.add('error');
            const first = errors[0];
            diagnosticsStatusText.textContent = `エラー ${errors.length}件: 行${first.line} — ${first.message}`;
        } else if (warnings.length > 0) {
            diagnosticsBar.classList.add('has-warning');
            diagnosticsStatusDot.classList.add('warning');
            const first = warnings[0];
            diagnosticsStatusText.textContent = `注意 ${warnings.length}件: 行${first.line} — ${first.message}`;
        } else {
            diagnosticsStatusDot.classList.add('ok');
            diagnosticsStatusText.textContent = '構文エラーはありません（正常に動作します）';
        }

        renderDiagnosticsList();
        updateUnsavedUI();
    }

    function renderDiagnosticsList() {
        if (!diagnosticsList) return;
        diagnosticsList.innerHTML = '';

        if (currentDiagnostics.length === 0) {
            diagnosticsList.innerHTML = `<div class="diagnostics-empty">✨ 現在開いているファイルに構文エラーや警告はありません。</div>`;
            return;
        }

        currentDiagnostics.forEach(iss => {
            const item = document.createElement('div');
            item.className = `diagnostic-item ${iss.severity === 'error' ? 'error' : 'warning'}${iss.isChangedByUser ? ' is-user-edited' : ''}`;

            const editedBadge = iss.isChangedByUser
                ? `<span class="diagnostic-edited-badge">✎ 編集中</span>`
                : '';

            const hintHtml = iss.hint
                ? `<div class="diagnostic-hint">💡 直し方: ${escapeHtml(iss.hint)}</div>`
                : '';

            const codePreviewHtml = iss.lineText
                ? `<div class="diagnostic-code-preview">${escapeHtml(iss.lineText.trim())}</div>`
                : '';

            item.innerHTML = `
                <div class="diagnostic-badges">
                    <span class="diagnostic-file-badge">${escapeHtml(iss.filename || currentFile)}</span>
                    <span class="diagnostic-line-badge">行 ${iss.line}</span>
                    ${editedBadge}
                </div>
                <div class="diagnostic-content">
                    <div class="diagnostic-message">${escapeHtml(iss.message)}</div>
                    ${hintHtml}
                    ${codePreviewHtml}
                </div>
            `;

            item.addEventListener('click', () => {
                if (iss.filename && iss.filename !== currentFile && files[iss.filename]) {
                    switchFile(iss.filename);
                }
                jumpToLine(iss.line, iss.col || 1);
            });

            diagnosticsList.appendChild(item);
        });
    }

    function initDiagnosticsEvents() {
        if (btnToggleDiagnostics) {
            btnToggleDiagnostics.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDiagnosticsPanel();
            });
        }
        if (diagnosticsBar) {
            diagnosticsBar.addEventListener('click', () => {
                toggleDiagnosticsPanel();
            });
        }
    }

    function toggleDiagnosticsPanel(forceState) {
        isDiagnosticsPanelOpen = forceState !== undefined ? forceState : !isDiagnosticsPanelOpen;
        if (diagnosticsPanel) {
            diagnosticsPanel.style.display = isDiagnosticsPanelOpen ? 'flex' : 'none';
        }
        if (btnToggleDiagnostics) {
            btnToggleDiagnostics.textContent = isDiagnosticsPanelOpen ? '詳細を閉じる' : '詳細を表示';
        }
    }

    // ── 指定行へのスムーズジャンプ＆ハイライト ──
    function jumpToLine(lineNumber, colNumber = 1) {
        if (!codeTextarea) return;
        const lines = codeTextarea.value.split('\n');
        const targetLine = Math.max(1, Math.min(lineNumber, lines.length));

        let charOffset = 0;
        for (let i = 0; i < targetLine - 1; i++) {
            charOffset += lines[i].length + 1;
        }
        const colOffset = Math.max(0, Math.min((colNumber || 1) - 1, (lines[targetLine - 1] || '').length));
        const finalPos = charOffset + colOffset;

        codeTextarea.focus();
        codeTextarea.setSelectionRange(finalPos, finalPos + (lines[targetLine - 1] || '').length);

        const lineHeight = 22.4;
        const targetScrollTop = Math.max(0, (targetLine - 1) * lineHeight - codeTextarea.clientHeight * 0.35);
        codeTextarea.scrollTop = targetScrollTop;

        activeHighlightLine = targetLine;
        updateHighlightAndLines();
        syncEditorScroll();

        if (highlightClearTimer) clearTimeout(highlightClearTimer);
        highlightClearTimer = setTimeout(() => {
            activeHighlightLine = null;
            updateHighlightAndLines();
        }, 2200);
    }

    // ── カーソル位置から編集中のステージインデックスを特定する ──
    function findEditedStageIndex(code, cursorOffset) {
        if (!code) return 0;
        const safeOffset = Math.max(0, Math.min(cursorOffset || 0, code.length));
        const textBeforeCursor = code.slice(0, safeOffset);
        const matches = textBeforeCursor.match(/\bid\s*:\s*\d+/g);
        if (!matches || matches.length === 0) return 0;
        return Math.max(0, matches.length - 1);
    }

    // ── ステージ一覧のパースとクイックジャンププルダウン更新 ──
    function parseStagesSafely(code) {
        const src = code || files['stages.js']?.content || '';
        try {
            const runner = new Function(src + '\n; return (typeof STAGES !== "undefined" ? STAGES : null);');
            const parsed = runner();
            if (Array.isArray(parsed)) return parsed;
        } catch (e) { /* ignore syntax errors during typing */ }
        return null;
    }

    function populateStageJumpSelectors() {
        const parsed = parseStagesSafely();
        if (!parsed || parsed.length === 0) return;

        if (editorStageJumpSelect) {
            const currentVal = editorStageJumpSelect.value;
            editorStageJumpSelect.innerHTML = `<option value="">📍 ステージへ移動 (${parsed.length}面)...</option>`;
            parsed.forEach((st, idx) => {
                const opt = document.createElement('option');
                opt.value = String(idx);
                const sub = st.subtitle ? ` — ${st.subtitle.slice(0, 14)}` : '';
                opt.textContent = `${st.title || ('ステージ ' + (idx + 1))}${sub}`;
                editorStageJumpSelect.appendChild(opt);
            });
            if (currentVal !== '') editorStageJumpSelect.value = currentVal;
        }

        const builderSelect = document.getElementById('builder-stage-select');
        if (builderSelect) {
            const prevVal = builderSelect.value;
            builderSelect.innerHTML = '';
            parsed.forEach((st, idx) => {
                const opt = document.createElement('option');
                opt.value = String(idx);
                opt.textContent = `${st.title || ('ステージ ' + (idx + 1))} (id: ${st.id || idx + 1})`;
                builderSelect.appendChild(opt);
            });
            const newOpt = document.createElement('option');
            newOpt.value = 'new';
            newOpt.textContent = `＋ 新規ステージ (ステージ ${parsed.length + 1})`;
            builderSelect.appendChild(newOpt);
            if (prevVal && (prevVal === 'new' || Number(prevVal) < parsed.length)) {
                builderSelect.value = prevVal;
            }
        }
    }

    function jumpToStageInEditorAndPreview(stageIndex) {
        if (currentFile !== 'stages.js') {
            switchFile('stages.js');
        }
        const code = files['stages.js'].content || '';
        const lines = code.split('\n');
        let count = -1;
        let targetLine = 1;
        for (let i = 0; i < lines.length; i++) {
            if (/\bid\s*:\s*\d+/.test(lines[i])) {
                count++;
                if (count === stageIndex) {
                    targetLine = Math.max(1, i);
                    break;
                }
            }
        }
        jumpToLine(targetLine, 1);
        syncPreviewToStageIndex(stageIndex);
    }

    function syncPreviewToStageIndex(stageIndex) {
        if (!previewIframe || !previewIframe.contentWindow) return;
        const win = previewIframe.contentWindow;
        const stagesCode = files['stages.js'].content;
        try {
            if (typeof win.reloadStagesFromCode === 'function') {
                win.reloadStagesFromCode(stagesCode, stageIndex);
            } else if (win.__game && typeof win.__game.selectStage === 'function') {
                win.__game.switchView('game');
                win.__game.selectStage(stageIndex);
            }
        } catch (e) { /* ignore cross-origin or loading state */ }
    }

    // ── 新規ステージ雛形の安全な自動挿入 ──
    function insertNewStageTemplate() {
        if (currentFile !== 'stages.js') {
            switchFile('stages.js');
        }

        let code = files['stages.js'].content || '';
        const parsed = parseStagesSafely(code);
        const nextId = parsed && parsed.length > 0
            ? Math.max(...parsed.map(s => Number(s.id) || 0)) + 1
            : 20;

        const templateBlock = `    {
        id: ${nextId},
        title: 'ステージ ${nextId}',
        subtitle: 'オリジナル改造ステージ',
        maxBlocks: 6,
        targetBlocks: 4,
        startRow: 3,
        goalRow: 1,
        hasCeiling: false,
        forbidden: [
            { col: 2, row: 1 },
            { col: 2, row: 2 }
        ],
        gimmicks: [
            { col: 1, row: 3, type: 'dash', dir: 'right', purpleBorder: true }
        ],
        solution: [
            { col: 0, row: 3 },
            { col: 1, row: 3 },
            { col: 3, row: 2 },
            { col: 4, row: 1 }
        ],
        legends: [
            { icon: '▨', type: 'forbidden', text: '赤の斜線：ブロックを置けません' },
            { icon: '→', type: 'dash', text: '水色矢印：右の端まで移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    }`;

        const lastBracketIdx = code.lastIndexOf('];');
        if (lastBracketIdx !== -1) {
            let beforeBracket = code.slice(0, lastBracketIdx).trimEnd();
            if (beforeBracket.endsWith('}')) {
                beforeBracket += ',';
            }
            const afterBracket = code.slice(lastBracketIdx);
            code = beforeBracket + '\n' + templateBlock + '\n' + afterBracket;
        } else {
            code += '\n' + templateBlock + '\n';
        }

        files['stages.js'].content = code;
        renderCurrentFile();
        populateStageJumpSelectors();

        const lines = code.split('\n');
        const idLineIdx = lines.findIndex(l => new RegExp(`\\bid\\s*:\\s*${nextId}\\b`).test(l));
        const targetLine = idLineIdx !== -1 ? idLineIdx + 1 : Math.max(1, lines.length - 25);

        jumpToLine(targetLine, 1);
        saveAndRun(false, parsed ? parsed.length : 0);
        showToast(`✨ ステージ ${nextId} の雛形を追加してゲームに反映しました！`);
    }

    // ── エディタ入力・キーボードイベント ──
    function initEditorEvents() {
        if (!codeTextarea) return;

        let debounceTimer = null;
        codeTextarea.addEventListener('input', () => {
            if (files[currentFile].isSystemFile) return;
            files[currentFile].content = codeTextarea.value;
            updateHighlightAndLines();
            updateUnsavedUI();

            if (stickyScrollController) {
                stickyScrollController.updateFile(currentFile, files[currentFile].content, files[currentFile].type);
            }

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                runLinter();
                updateHighlightAndLines();
                queueMinimapRender();
                if (currentFile === 'stages.js') {
                    populateStageJumpSelectors();
                }
            }, 160);
        });

        codeTextarea.addEventListener('scroll', () => {
            syncEditorScroll();
        });

        // Tabキーでスペース4つ挿入
        codeTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !files[currentFile].isSystemFile) {
                e.preventDefault();
                const start = codeTextarea.selectionStart;
                const end = codeTextarea.selectionEnd;
                const val = codeTextarea.value;
                codeTextarea.value = val.substring(0, start) + '    ' + val.substring(end);
                codeTextarea.selectionStart = codeTextarea.selectionEnd = start + 4;
                codeTextarea.dispatchEvent(new Event('input'));
            }
        });

        // 行番号クリックでその行にフォーカス
        if (lineNumbers) {
            lineNumbers.addEventListener('click', (e) => {
                const lineEl = e.target.closest('.line-num');
                if (!lineEl) return;
                const ln = parseInt(lineEl.getAttribute('data-line'), 10);
                if (ln) jumpToLine(ln, 1);
            });
        }

        // システムバナーの最小化・展開・stages.js移動
        if (bannerBtnMinimize && systemBanner) {
            bannerBtnMinimize.addEventListener('click', () => {
                systemBanner.classList.add('is-minimized');
            });
        }
        if (bannerMinimizedIcon && systemBanner) {
            bannerMinimizedIcon.addEventListener('click', () => {
                systemBanner.classList.remove('is-minimized');
            });
        }
        if (bannerBtnGotoGame) {
            bannerBtnGotoGame.addEventListener('click', () => {
                switchFile('stages.js');
            });
        }

        // ステージクイックジャンプ & 盤面作成ボタン & 追加ボタン
        if (editorStageJumpSelect) {
            editorStageJumpSelect.addEventListener('change', () => {
                const val = editorStageJumpSelect.value;
                if (val === '') return;
                const stageIdx = parseInt(val, 10);
                if (!isNaN(stageIdx)) {
                    jumpToStageInEditorAndPreview(stageIdx);
                }
            });
        }
        if (btnOpenStageBuilder) {
            btnOpenStageBuilder.addEventListener('click', () => {
                const cursorStageIdx = findEditedStageIndex(files['stages.js'].content, codeTextarea.selectionStart);
                openStageBuilderModal(cursorStageIdx);
            });
        }
        if (btnAddStageTemplate) {
            btnAddStageTemplate.addEventListener('click', () => {
                insertNewStageTemplate();
            });
        }

        // ショートカット (Cmd/Ctrl + S で保存して反映)
        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveAndRun();
            }
        });
    }

    // ── 未保存状態・セーブボタン状態の更新 ──
    function hasAnyUnsavedChanges() {
        return Object.keys(files).some(k => !files[k].isSystemFile && files[k].content !== files[k].baselineContent);
    }

    function updateUnsavedUI() {
        const dirty = hasAnyUnsavedChanges();
        if (unsavedStatusPill) {
            unsavedStatusPill.style.display = dirty ? 'inline-flex' : 'none';
        }
        if (btnSaveRun) {
            const hasErrors = currentDiagnostics.some(d => d.severity === 'error');
            btnSaveRun.classList.toggle('has-unsaved', dirty && !hasErrors);
            btnSaveRun.classList.toggle('has-error', hasErrors);
        }
    }

    // ── ヘッダーボタン（保存して反映・Undo・リセット・コピー） ──
    function initHeaderActions() {
        if (btnSaveRun) {
            btnSaveRun.addEventListener('click', () => saveAndRun());
        }
        if (btnUndo) {
            btnUndo.addEventListener('click', () => {
                if (files[currentFile].isSystemFile) return;
                codeTextarea.focus();
                document.execCommand('undo');
                files[currentFile].content = codeTextarea.value;
                renderCurrentFile();
                showToast('1つ前の状態に戻しました');
            });
        }
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (files[currentFile].isSystemFile) return;
                if (!confirm(`「${currentFile}」を初期状態のコードに戻しますか？`)) return;
                files[currentFile].content = files[currentFile].defaultContent;
                files[currentFile].baselineContent = files[currentFile].defaultContent;
                localStorage.removeItem(STORAGE_KEY_PREFIX + currentFile);
                renderCurrentFile();
                populateStageJumpSelectors();
                saveAndRun(true);
                showToast(`「${currentFile}」を初期設定にリセットしました`);
            });
        }
        if (btnCopyCode) {
            btnCopyCode.addEventListener('click', () => {
                navigator.clipboard.writeText(files[currentFile].content || '').then(() => {
                    showToast(`「${currentFile}」のコード全文をコピーしました`);
                });
            });
        }
    }

    function saveAndRun(silent = false, explicitStageIndex = null) {
        updateAllFilesDiagnostics();
        const errors = currentDiagnostics.filter(d => d.severity === 'error');

        if (errors.length > 0 && !silent) {
            toggleDiagnosticsPanel(true);
            jumpToLine(errors[0].line, errors[0].col || 1);
            showToast(`⚠️ 構文エラーが ${errors.length} 件あります（修正してから保存してください）`);
            return;
        }

        // ローカルストレージへ保存 & baseline 更新
        Object.keys(files).forEach(k => {
            if (files[k].isSystemFile) return;
            files[k].baselineContent = files[k].content;
            try {
                localStorage.setItem(STORAGE_KEY_PREFIX + k, files[k].content);
            } catch (e) { /* ignore */ }
        });

        renderTabs();
        updateUnsavedUI();

        // カーソルがあるステージを特定してホットリロード
        const targetStageIdx = explicitStageIndex !== null
            ? explicitStageIndex
            : (currentFile === 'stages.js' && codeTextarea
                ? findEditedStageIndex(files['stages.js'].content, codeTextarea.selectionStart)
                : 0);

        if (previewIframe && previewIframe.contentWindow) {
            const win = previewIframe.contentWindow;
            const stagesCode = files['stages.js'].content;
            let reloaded = false;
            try {
                if (typeof win.reloadStagesFromCode === 'function') {
                    reloaded = win.reloadStagesFromCode(stagesCode, targetStageIdx);
                }
            } catch (e) {
                reloaded = false;
            }
            if (!reloaded) {
                previewIframe.src = '../index.html?t=' + Date.now();
            }
        }

        if (!silent) {
            showToast(`⚡ 変更を保存し、ステージ ${targetStageIdx + 1} をプレビューに反映しました！`);
        }
    }

    // ── 右ペイン: ゲームプレビュー操作ツールバー ──
    function initPreviewControls() {
        const btnReloadGame = document.getElementById('btn-reload-game');
        const btnCollapse = document.getElementById('btn-toggle-preview-collapse');
        const btnPreviewStart = document.getElementById('btn-preview-start');
        const btnPreviewReset = document.getElementById('btn-preview-reset');
        const btnPreviewSolution = document.getElementById('btn-preview-solution');

        if (btnReloadGame && previewIframe) {
            btnReloadGame.addEventListener('click', () => {
                const stageIdx = currentFile === 'stages.js' && codeTextarea
                    ? findEditedStageIndex(files['stages.js'].content, codeTextarea.selectionStart)
                    : 0;
                previewIframe.onload = () => {
                    syncPreviewToStageIndex(stageIdx);
                };
                previewIframe.src = '../index.html?t=' + Date.now();
                showToast('ゲームプレビューをリロードしました');
            });
        }

        if (previewIframe) {
            previewIframe.addEventListener('load', () => {
                const stageIdx = currentFile === 'stages.js' && codeTextarea
                    ? findEditedStageIndex(files['stages.js'].content, codeTextarea.selectionStart)
                    : 0;
                syncPreviewToStageIndex(stageIdx);
            });
        }

        if (btnCollapse && previewPane) {
            btnCollapse.addEventListener('click', () => {
                previewPane.classList.toggle('is-collapsed');
                queueMinimapRender();
            });
        }

        if (btnPreviewStart) {
            btnPreviewStart.addEventListener('click', () => {
                try {
                    const g = previewIframe?.contentWindow?.__game;
                    if (g && typeof g.triggerStart === 'function') {
                        g.switchView('game');
                        g.triggerStart();
                    }
                } catch (e) { /* ignore */ }
            });
        }

        if (btnPreviewReset) {
            btnPreviewReset.addEventListener('click', () => {
                try {
                    const g = previewIframe?.contentWindow?.__game;
                    if (g && typeof g.triggerReset === 'function') {
                        g.switchView('game');
                        g.triggerReset();
                    }
                } catch (e) { /* ignore */ }
            });
        }

        if (btnPreviewSolution) {
            btnPreviewSolution.addEventListener('click', () => {
                try {
                    const g = previewIframe?.contentWindow?.__game;
                    if (g && typeof g.toggleSolution === 'function') {
                        g.switchView('game');
                        g.toggleSolution(false);
                    }
                } catch (e) { /* ignore */ }
            });
        }
    }

    // ── ペインリサイザー（エディタ分割・プレビュー幅・診断パネル高さ） ──
    function initResizers() {
        // 1. エディタとプレビューの間のリサイザー
        if (paneResizer && previewPane) {
            let isResizingPreview = false;
            paneResizer.addEventListener('mousedown', (e) => {
                isResizingPreview = true;
                paneResizer.classList.add('is-dragging');
                if (previewIframe) previewIframe.style.pointerEvents = 'none';
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!isResizingPreview) return;
                const newW = Math.max(260, Math.min(window.innerWidth * 0.6, window.innerWidth - e.clientX));
                previewPane.classList.remove('is-collapsed');
                previewPane.style.width = `${newW}px`;
                queueMinimapRender();
            });
            window.addEventListener('mouseup', () => {
                if (isResizingPreview) {
                    isResizingPreview = false;
                    paneResizer.classList.remove('is-dragging');
                    if (previewIframe) previewIframe.style.pointerEvents = '';
                }
            });
        }

        // 2. Monaca風 エディタ左右分割リサイザー
        if (editorSplitDivider && editorSplitContainer && editorPanePrimary && editorPaneSecondary) {
            let isResizingSplit = false;
            editorSplitDivider.addEventListener('mousedown', (e) => {
                if (!isSplitMode) return;
                isResizingSplit = true;
                editorSplitDivider.classList.add('is-dragging');
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!isResizingSplit) return;
                const rect = editorSplitContainer.getBoundingClientRect();
                const ratio = Math.max(0.22, Math.min(0.78, (e.clientX - rect.left) / rect.width));
                editorPanePrimary.style.flex = `0 0 ${ratio * 100}%`;
                editorPaneSecondary.style.flex = `1 1 ${(1 - ratio) * 100}%`;
                queueMinimapRender();
            });
            window.addEventListener('mouseup', () => {
                if (isResizingSplit) {
                    isResizingSplit = false;
                    editorSplitDivider.classList.remove('is-dragging');
                }
            });
        }

        // 3. 診断パネルの高さリサイザー
        if (diagnosticsPanelResizer && diagnosticsPanel) {
            let isResizingDiag = false;
            diagnosticsPanelResizer.addEventListener('mousedown', (e) => {
                isResizingDiag = true;
                diagnosticsPanelResizer.classList.add('is-dragging');
                if (!isDiagnosticsPanelOpen) toggleDiagnosticsPanel(true);
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!isResizingDiag || !editorContainer) return;
                const rect = editorContainer.getBoundingClientRect();
                const newH = Math.max(90, Math.min(rect.height * 0.65, rect.bottom - e.clientY));
                diagnosticsPanel.style.height = `${newH}px`;
                diagnosticsPanel.style.maxHeight = `${newH}px`;
            });
            window.addEventListener('mouseup', () => {
                if (isResizingDiag) {
                    isResizingDiag = false;
                    diagnosticsPanelResizer.classList.remove('is-dragging');
                }
            });
        }
    }

    // ── トースト通知 (ide.css の .show クラスに対応) ──
    let toastTimer = null;
    function showToast(message) {
        if (!toast || !toastMsg) return;
        toastMsg.textContent = message;
        toast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2600);
    }

    // ── 環境設定モーダル (ide.css の .is-open クラスに対応) ──
    function initSettingsModal() {
        const overlay = document.getElementById('settings-modal-overlay');
        const btnOpen = document.getElementById('btn-open-settings');
        const btnClose = document.getElementById('btn-close-settings');
        const btnSave = document.getElementById('btn-save-settings');

        function openSettings() {
            if (!overlay) return;
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.add('is-open'));
            overlay.setAttribute('aria-hidden', 'false');
        }

        function closeSettings() {
            if (!overlay) return;
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
            setTimeout(() => {
                if (!overlay.classList.contains('is-open')) {
                    overlay.style.display = 'none';
                }
            }, 180);
        }

        if (btnOpen) btnOpen.addEventListener('click', openSettings);
        if (btnClose) btnClose.addEventListener('click', closeSettings);
        if (btnSave) btnSave.addEventListener('click', closeSettings);
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeSettings();
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
                closeSettings();
            }
        });

        const darkBtn = document.getElementById('theme-choice-dark');
        const lightBtn = document.getElementById('theme-choice-light');
        if (darkBtn) {
            darkBtn.addEventListener('click', () => {
                editorPrefs.theme = 'dark';
                savePreferences();
                queueMinimapRender();
            });
        }
        if (lightBtn) {
            lightBtn.addEventListener('click', () => {
                editorPrefs.theme = 'light';
                savePreferences();
                queueMinimapRender();
            });
        }

        const minimapToggle = document.getElementById('setting-toggle-minimap');
        if (minimapToggle) {
            minimapToggle.addEventListener('change', () => {
                editorPrefs.minimap = minimapToggle.checked;
                savePreferences();
                queueMinimapRender();
            });
        }

        const stickyToggle = document.getElementById('setting-toggle-sticky');
        if (stickyToggle) {
            stickyToggle.addEventListener('change', () => {
                editorPrefs.stickyScroll = stickyToggle.checked;
                savePreferences();
            });
        }

        const indentToggle = document.getElementById('setting-indent-guides');
        if (indentToggle) {
            indentToggle.addEventListener('change', () => {
                editorPrefs.indentGuides = indentToggle.checked;
                savePreferences();
                updateHighlightAndLines();
            });
        }

        const diagToggle = document.getElementById('setting-diagnostics-bar');
        if (diagToggle) {
            diagToggle.addEventListener('change', () => {
                editorPrefs.diagnosticsBar = diagToggle.checked;
                savePreferences();
            });
        }
    }

    // ── 🎨 ビジュアル 5×5 ステージ作成・盤面エディタ ──
    let builderState = {
        stageIndex: 0,
        isNew: false,
        id: 1,
        title: 'ステージ 1',
        subtitle: 'ブロックを配置してゴールを目指そう！',
        maxBlocks: 6,
        targetBlocks: 5,
        startRow: 3,
        goalRow: 1,
        hasCeiling: false,
        activeTool: 'solution',
        cells: [] // 5x5: { forbidden, dashDir, stepDir, purpleBorder, solution }
    };

    function resetBuilderCells() {
        builderState.cells = Array.from({ length: 5 }, () =>
            Array.from({ length: 5 }, () => ({
                forbidden: false,
                dashDir: null,
                stepDir: null,
                purpleBorder: false,
                solution: false
            }))
        );
    }

    function initStageBuilderModal() {
        resetBuilderCells();
        const overlay = document.getElementById('stage-builder-overlay');
        const btnClose = document.getElementById('btn-close-stage-builder');
        const btnCancel = document.getElementById('btn-builder-cancel');
        const btnNewStage = document.getElementById('btn-builder-new-stage');
        const btnClearBoard = document.getElementById('btn-builder-clear-board');
        const btnCopyCode = document.getElementById('btn-builder-copy-code');
        const btnApply = document.getElementById('btn-builder-apply');
        const stageSelect = document.getElementById('builder-stage-select');
        const ceilingBar = document.getElementById('builder-ceiling-bar');
        const paletteGrid = document.getElementById('builder-palette-grid');

        function closeBuilder() {
            if (!overlay) return;
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
        }

        if (btnClose) btnClose.addEventListener('click', closeBuilder);
        if (btnCancel) btnCancel.addEventListener('click', closeBuilder);
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeBuilder();
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
                closeBuilder();
            }
        });

        if (paletteGrid) {
            paletteGrid.querySelectorAll('.palette-tool-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    builderState.activeTool = btn.getAttribute('data-tool') || 'solution';
                    paletteGrid.querySelectorAll('.palette-tool-btn').forEach(b => b.classList.toggle('active', b === btn));
                });
            });
        }

        if (stageSelect) {
            stageSelect.addEventListener('change', () => {
                if (stageSelect.value === 'new') {
                    loadStageIntoBuilder('new');
                } else {
                    loadStageIntoBuilder(parseInt(stageSelect.value, 10) || 0);
                }
            });
        }

        if (btnNewStage) {
            btnNewStage.addEventListener('click', () => {
                if (stageSelect) stageSelect.value = 'new';
                loadStageIntoBuilder('new');
            });
        }

        if (ceilingBar) {
            ceilingBar.addEventListener('click', () => {
                builderState.hasCeiling = !builderState.hasCeiling;
                renderBuilderBoard();
            });
        }

        if (btnClearBoard) {
            btnClearBoard.addEventListener('click', () => {
                resetBuilderCells();
                renderBuilderBoard();
            });
        }

        ['builder-input-id', 'builder-input-maxblocks', 'builder-input-title', 'builder-input-subtitle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    builderState.id = parseInt(document.getElementById('builder-input-id')?.value, 10) || 1;
                    builderState.maxBlocks = parseInt(document.getElementById('builder-input-maxblocks')?.value, 10) || 6;
                    builderState.title = document.getElementById('builder-input-title')?.value || `ステージ ${builderState.id}`;
                    builderState.subtitle = document.getElementById('builder-input-subtitle')?.value || '';
                    updateBuilderCodePreview();
                });
            }
        });

        if (btnCopyCode) {
            btnCopyCode.addEventListener('click', () => {
                const code = generateStageObjectCodeFromBuilder();
                navigator.clipboard.writeText(code).then(() => {
                    showToast('生成されたステージ定義コードをコピーしました');
                });
            });
        }

        if (btnApply) {
            btnApply.addEventListener('click', () => {
                applyBuilderStageToStagesJs();
                closeBuilder();
            });
        }
    }

    function openStageBuilderModal(targetStageIdx = 0) {
        populateStageJumpSelectors();
        const overlay = document.getElementById('stage-builder-overlay');
        if (!overlay) return;
        loadStageIntoBuilder(targetStageIdx);
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function loadStageIntoBuilder(indexOrNew) {
        const parsed = parseStagesSafely() || [];
        resetBuilderCells();

        const stageSelect = document.getElementById('builder-stage-select');
        if (indexOrNew === 'new' || parsed.length === 0) {
            const nextId = parsed.length > 0 ? Math.max(...parsed.map(s => Number(s.id) || 0)) + 1 : 20;
            builderState.stageIndex = parsed.length;
            builderState.isNew = true;
            builderState.id = nextId;
            builderState.title = `ステージ ${nextId}`;
            builderState.subtitle = 'オリジナルステージ';
            builderState.maxBlocks = 6;
            builderState.targetBlocks = 4;
            builderState.startRow = 3;
            builderState.goalRow = 1;
            builderState.hasCeiling = false;
            if (stageSelect) stageSelect.value = 'new';
        } else {
            const safeIdx = Math.max(0, Math.min(indexOrNew, parsed.length - 1));
            const st = parsed[safeIdx];
            builderState.stageIndex = safeIdx;
            builderState.isNew = false;
            builderState.id = st.id || (safeIdx + 1);
            builderState.title = st.title || `ステージ ${safeIdx + 1}`;
            builderState.subtitle = st.subtitle || '';
            builderState.maxBlocks = st.maxBlocks || 6;
            builderState.targetBlocks = st.targetBlocks || st.maxBlocks || 6;
            builderState.startRow = typeof st.startRow === 'number' ? st.startRow : 3;
            builderState.goalRow = typeof st.goalRow === 'number' ? st.goalRow : 1;
            builderState.hasCeiling = Boolean(st.hasCeiling);

            if (Array.isArray(st.forbidden)) {
                st.forbidden.forEach(f => {
                    if (f && f.row >= 0 && f.row < 5 && f.col >= 0 && f.col < 5) {
                        builderState.cells[f.row][f.col].forbidden = true;
                    }
                });
            }
            if (Array.isArray(st.gimmicks)) {
                st.gimmicks.forEach(g => {
                    if (g && g.row >= 0 && g.row < 5 && g.col >= 0 && g.col < 5) {
                        const cell = builderState.cells[g.row][g.col];
                        if (g.type === 'dash') cell.dashDir = g.dir || 'right';
                        else if (g.type === 'step') cell.stepDir = g.dir || 'up';
                        if (g.purpleBorder) cell.purpleBorder = true;
                    }
                });
            }
            if (Array.isArray(st.solution)) {
                st.solution.forEach(s => {
                    if (s && s.row >= 0 && s.row < 5 && s.col >= 0 && s.col < 5) {
                        builderState.cells[s.row][s.col].solution = true;
                    }
                });
            }
            if (stageSelect) stageSelect.value = String(safeIdx);
        }

        const idInput = document.getElementById('builder-input-id');
        const maxInput = document.getElementById('builder-input-maxblocks');
        const titleInput = document.getElementById('builder-input-title');
        const subInput = document.getElementById('builder-input-subtitle');
        if (idInput) idInput.value = String(builderState.id);
        if (maxInput) maxInput.value = String(builderState.maxBlocks);
        if (titleInput) titleInput.value = builderState.title;
        if (subInput) subInput.value = builderState.subtitle;

        renderBuilderBoard();
    }

    function applyToolToBuilderCell(row, col) {
        const cell = builderState.cells[row][col];
        const tool = builderState.activeTool;

        if (tool === 'erase') {
            cell.forbidden = false;
            cell.dashDir = null;
            cell.stepDir = null;
            cell.purpleBorder = false;
            cell.solution = false;
        } else if (tool === 'solution') {
            cell.solution = !cell.solution;
            if (cell.solution) cell.forbidden = false;
        } else if (tool === 'forbidden') {
            cell.forbidden = !cell.forbidden;
            if (cell.forbidden) {
                cell.dashDir = null;
                cell.stepDir = null;
                cell.purpleBorder = false;
                cell.solution = false;
            }
        } else if (tool === 'purple') {
            cell.purpleBorder = !cell.purpleBorder;
            if (cell.purpleBorder) cell.forbidden = false;
        } else if (tool.startsWith('dash-')) {
            const dir = tool.split('-')[1];
            cell.dashDir = (cell.dashDir === dir) ? null : dir;
            cell.stepDir = null;
            cell.forbidden = false;
        } else if (tool.startsWith('step-')) {
            const dir = tool.split('-')[1];
            cell.stepDir = (cell.stepDir === dir) ? null : dir;
            cell.dashDir = null;
            cell.forbidden = false;
        }

        renderBuilderBoard();
    }

    function renderBuilderBoard() {
        const startColEl = document.getElementById('builder-start-col');
        const goalColEl = document.getElementById('builder-goal-col');
        const gridEl = document.getElementById('builder-grid-5x5');
        const ceilingBar = document.getElementById('builder-ceiling-bar');
        const ceilingStatus = document.getElementById('builder-ceiling-status');

        if (ceilingBar && ceilingStatus) {
            ceilingBar.classList.toggle('is-active', builderState.hasCeiling);
            ceilingStatus.textContent = builderState.hasCeiling ? 'ON (天井あり)' : 'OFF (天井なし)';
        }

        if (startColEl) {
            startColEl.innerHTML = '';
            for (let r = 0; r < 5; r++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'builder-row-slot' + (builderState.startRow === r ? ' is-start' : '');
                btn.innerHTML = builderState.startRow === r ? `<span>START</span><span>row:${r}</span>` : `<span>row:${r}</span>`;
                btn.addEventListener('click', () => {
                    builderState.startRow = r;
                    renderBuilderBoard();
                });
                startColEl.appendChild(btn);
            }
        }

        if (goalColEl) {
            goalColEl.innerHTML = '';
            for (let r = 0; r < 5; r++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'builder-row-slot' + (builderState.goalRow === r ? ' is-goal' : '');
                btn.innerHTML = builderState.goalRow === r ? `<span>GOAL</span><span>row:${r}</span>` : `<span>row:${r}</span>`;
                btn.addEventListener('click', () => {
                    builderState.goalRow = r;
                    renderBuilderBoard();
                });
                goalColEl.appendChild(btn);
            }
        }

        const arrowSymbols = { up: '↑', down: '↓', left: '←', right: '→' };
        let solCount = 0;

        if (gridEl) {
            gridEl.innerHTML = '';
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 5; c++) {
                    const cellData = builderState.cells[r][c];
                    if (cellData.solution) solCount++;

                    const cellEl = document.createElement('div');
                    let cls = 'builder-cell';
                    if (cellData.forbidden) cls += ' is-forbidden';
                    if (cellData.dashDir) cls += ' is-dash';
                    if (cellData.stepDir) cls += ' is-step';
                    if (cellData.purpleBorder) cls += ' is-purple';
                    cellEl.className = cls;

                    const arrow = cellData.dashDir
                        ? arrowSymbols[cellData.dashDir]
                        : (cellData.stepDir ? arrowSymbols[cellData.stepDir] : '');

                    cellEl.innerHTML = `
                        <span class="builder-cell-coord">${c},${r}</span>
                        ${arrow ? `<span class="builder-cell-arrow">${arrow}</span>` : ''}
                        ${cellData.solution ? `<span class="builder-cell-sol">💡箱</span>` : ''}
                    `;

                    cellEl.addEventListener('click', () => applyToolToBuilderCell(r, c));
                    gridEl.appendChild(cellEl);
                }
            }
        }

        const statsEl = document.getElementById('builder-board-stats');
        if (statsEl) {
            statsEl.textContent = `正解配置 (solution): ${solCount}個 / 最大ブロック (maxBlocks): ${builderState.maxBlocks}個`;
        }

        updateBuilderCodePreview();
    }

    function generateStageObjectCodeFromBuilder() {
        const forbiddenList = [];
        const gimmicksList = [];
        const solutionList = [];
        const usedLegendTypes = new Set();

        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                const cell = builderState.cells[r][c];
                if (cell.forbidden) {
                    forbiddenList.push(`{ col: ${c}, row: ${r} }`);
                    usedLegendTypes.add('forbidden');
                }
                if (cell.dashDir || cell.stepDir || cell.purpleBorder) {
                    const parts = [`col: ${c}`, `row: ${r}`];
                    if (cell.dashDir) {
                        parts.push(`type: 'dash'`, `dir: '${cell.dashDir}'`);
                        usedLegendTypes.add('dash:' + cell.dashDir);
                    } else if (cell.stepDir) {
                        parts.push(`type: 'step'`, `dir: '${cell.stepDir}'`, `steps: 1`);
                        usedLegendTypes.add('step:' + cell.stepDir);
                    }
                    if (cell.purpleBorder) {
                        parts.push(`purpleBorder: true`);
                        usedLegendTypes.add('purple');
                    }
                    gimmicksList.push(`{ ${parts.join(', ')} }`);
                }
                if (cell.solution) {
                    solutionList.push(`{ col: ${c}, row: ${r} }`);
                }
            }
        }

        const legendsList = [];
        if (usedLegendTypes.has('forbidden')) {
            legendsList.push(`{ icon: '▨', type: 'forbidden', text: '赤の斜線：ブロックを置けません' }`);
        }
        const dirJP = {
            up: { icon: '↑', label: '上' },
            down: { icon: '↓', label: '下' },
            left: { icon: '←', label: '左' },
            right: { icon: '→', label: '右' }
        };
        ['up', 'down', 'left', 'right'].forEach(d => {
            if (usedLegendTypes.has('dash:' + d)) {
                legendsList.push(`{ icon: '${dirJP[d].icon}', type: 'dash', text: '水色矢印：${dirJP[d].label}の端まで移動' }`);
            }
        });
        ['up', 'down', 'left', 'right'].forEach(d => {
            if (usedLegendTypes.has('step:' + d)) {
                legendsList.push(`{ icon: '${dirJP[d].icon}', type: 'step', text: '緑色矢印：${dirJP[d].label}に1マス移動' }`);
            }
        });
        if (usedLegendTypes.has('purple')) {
            legendsList.push(`{ icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }`);
        }

        const safeTitle = String(builderState.title).replace(/\x27/g, "\\\x27");
        const safeSub = String(builderState.subtitle).replace(/\x27/g, "\\\x27");
        const targetBlocks = solutionList.length > 0 ? solutionList.length : builderState.maxBlocks;

        const fmtArray = (items) => items.length === 0
            ? '[]'
            : `[\n            ${items.join(',\n            ')}\n        ]`;

        return `    {
        id: ${builderState.id},
        title: '${safeTitle}',
        subtitle: '${safeSub}',
        maxBlocks: ${builderState.maxBlocks},
        targetBlocks: ${targetBlocks},
        startRow: ${builderState.startRow},
        goalRow: ${builderState.goalRow},${builderState.hasCeiling ? '\n        hasCeiling: true,' : ''}
        forbidden: ${fmtArray(forbiddenList)},
        gimmicks: ${fmtArray(gimmicksList)},
        solution: ${fmtArray(solutionList)},
        legends: ${fmtArray(legendsList)}
    }`;
    }

    function updateBuilderCodePreview() {
        const previewEl = document.getElementById('builder-code-preview');
        if (!previewEl) return;
        previewEl.textContent = generateStageObjectCodeFromBuilder();
    }

    function applyBuilderStageToStagesJs() {
        if (currentFile !== 'stages.js') {
            switchFile('stages.js');
        }

        const newBlock = generateStageObjectCodeFromBuilder();
        let code = files['stages.js'].content || '';

        if (builderState.isNew) {
            const lastBracketIdx = code.lastIndexOf('];');
            if (lastBracketIdx !== -1) {
                let before = code.slice(0, lastBracketIdx).trimEnd();
                if (before.endsWith('}')) before += ',';
                code = before + '\n' + newBlock + '\n' + code.slice(lastBracketIdx);
            } else {
                code += '\n' + newBlock + '\n';
            }
        } else {
            // 既存ステージのオブジェクト範囲 { ... } を特定して置換
            const range = findStageObjectRangeInCode(code, builderState.stageIndex);
            if (range) {
                code = code.slice(0, range.start) + newBlock.trimStart() + code.slice(range.end);
            } else {
                const lastBracketIdx = code.lastIndexOf('];');
                if (lastBracketIdx !== -1) {
                    let before = code.slice(0, lastBracketIdx).trimEnd();
                    if (before.endsWith('}')) before += ',';
                    code = before + '\n' + newBlock + '\n' + code.slice(lastBracketIdx);
                }
            }
        }

        files['stages.js'].content = code;
        renderCurrentFile();
        populateStageJumpSelectors();

        const lines = code.split('\n');
        const idLine = lines.findIndex(l => new RegExp(`\\bid\\s*:\\s*${builderState.id}\\b`).test(l));
        if (idLine !== -1) {
            jumpToLine(idLine + 1, 1);
        }

        saveAndRun(false, builderState.stageIndex);
        showToast(`🎨 ステージ ${builderState.id} の盤面を stages.js に反映しました！`);
    }

    function findStageObjectRangeInCode(code, targetStageIdx) {
        const arrayStart = code.indexOf('STAGES');
        if (arrayStart === -1) return null;
        const openBracket = code.indexOf('[', arrayStart);
        if (openBracket === -1) return null;

        let depth = 0;
        let inStr = null;
        let inLineComment = false;
        let inBlockComment = false;
        let currentStage = -1;
        let stageStartOffset = -1;

        for (let i = openBracket + 1; i < code.length; i++) {
            const ch = code[i];
            const next = code[i + 1];

            if (inLineComment) {
                if (ch === '\n') inLineComment = false;
                continue;
            }
            if (inBlockComment) {
                if (ch === '*' && next === '/') { inBlockComment = false; i++; }
                continue;
            }
            if (inStr) {
                if (ch === '\\') { i++; continue; }
                if (ch === inStr) inStr = null;
                continue;
            }
            if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
            if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
            if (ch === '"' || ch === "'" || ch === '\x60') { inStr = ch; continue; }

            if (ch === '{') {
                if (depth === 0) {
                    currentStage++;
                    if (currentStage === targetStageIdx) {
                        stageStartOffset = i;
                    }
                }
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0 && currentStage === targetStageIdx && stageStartOffset !== -1) {
                    return { start: stageStartOffset, end: i + 1 };
                }
            } else if (ch === ']' && depth === 0) {
                break;
            }
        }
        return null;
    }

})();
