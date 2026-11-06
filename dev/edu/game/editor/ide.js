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
        },
        'editor/docs-content.js': {
            name: 'docs-content.js',
            type: 'javascript',
            content: '// loading...',
            defaultContent: '// loading...',
            baselineContent: '// loading...',
            isSystemFile: true
        },
        'editor/share-ui.js': {
            name: 'share-ui.js',
            type: 'javascript',
            content: '// loading...',
            defaultContent: '// loading...',
            baselineContent: '// loading...',
            isSystemFile: true
        },
        'tests/share-codec.test.js': {
            name: 'share-codec.test.js',
            type: 'javascript',
            content: '// loading...',
            defaultContent: '// loading...',
            baselineContent: '// loading...',
            isSystemFile: true
        },
        'CHANGES_MEMO.md': {
            name: 'CHANGES_MEMO.md',
            type: 'markdown',
            content: '# loading...',
            defaultContent: '# loading...',
            baselineContent: '# loading...',
            isSystemFile: true
        },
        'how-to-play.html': {
            name: 'how-to-play.html',
            type: 'html',
            content: '<!-- loading... -->',
            defaultContent: '<!-- loading... -->',
            baselineContent: '<!-- loading... -->',
            isSystemFile: true
        },
        'share-codec.js': {
            name: 'share-codec.js',
            type: 'javascript',
            content: '// loading...',
            defaultContent: '// loading...',
            baselineContent: '// loading...',
            isSystemFile: true
        },
        'tech-doc.html': {
            name: 'tech-doc.html',
            type: 'html',
            content: '<!-- loading... -->',
            defaultContent: '<!-- loading... -->',
            baselineContent: '<!-- loading... -->',
            isSystemFile: true
        }
    };

    const STORAGE_KEY_PREFIX = 'hako_game_ide_v2_';

    // ── 状態管理 ──
    let currentFile = 'stages.js';
    let openTabs = ['stages.js', 'main.js', 'index.html', 'style.css'];
    let isSplitMode = false; // 初期状態では資料パネルを展開しない
    let currentDocsDock = 'right'; // 4方向ドック位置: 'top' | 'bottom' | 'left' | 'right'
    let currentDocTab = 'dictionary';
    let fileScrollMemory = {};
    let fileHistory = {}; // ファイル別 Undo / Redo 履歴スタック: { [file]: { stack: string[], index: number } }
    let currentDiagnostics = [];
    let allFilesDiagnostics = {};
    let isDiagnosticsPanelOpen = false;
    let errorLineSet = new Set();
    let warningLineSet = new Set();
    let activeHighlightLine = null;
    let highlightClearTimer = null;
    let stickyScrollController = null;
    let minimapRenderQueued = false;
    let minimapScrollRafId = null;
    const MINIMAP_LINE_PITCH = 3.6; // trial-admission と完全一致する高精細ピッチ
    let minimapDragGrabOffsetY = 0;
    let isMinimapDragging = false;
    let minimapCtx = null;

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
    let btnRedo;
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
        initDocsDockDrag();
        initDocsViewer();
        initEditorEvents();
        initHeaderActions();
        initPreviewControls();
        initMinimapInteraction();
        initDiagnosticsEvents();
        initSettingsModal();
        initStageBuilderModal();

        // 共有UI (share-ui.js) からステージ定義を参照するための読み取り専用フック
        window.__editorApi = {
            getStages: () => parseStagesSafely()
        };

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

        btnSaveRun = document.getElementById('btn-save') || document.getElementById('btn-save-run');
        btnReset = document.getElementById('btn-reset');
        btnUndo = document.getElementById('btn-top-undo') || document.getElementById('btn-undo');
        btnRedo = document.getElementById('btn-top-redo') || document.getElementById('btn-redo');
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
                highlightFn: (code, type) => highlightSyntax(code, type || (files[currentFile] ? files[currentFile].type : 'javascript')),
                indentGuideFn: (highlightedLine, rawLine, fullText) => {
                    if (!editorPrefs.indentGuides) return highlightedLine;
                    const indentSize = detectIndentUnit(fullText || rawLine);
                    const match = highlightedLine.match(/^((?:<span[^>]*>)*)([ \t]+)/);
                    if (!match) return highlightedLine;
                    const prefixTag = match[1];
                    const leadingWs = match[2];
                    const rest = highlightedLine.slice(match[0].length);
                    let guideHtml = '';
                    let s = 0;
                    while (s < leadingWs.length) {
                        if (leadingWs[s] === '\t') {
                            guideHtml += '<span class="indent-guide indent-guide-tab">\t</span>';
                            s++;
                        } else {
                            let count = 0;
                            while (s + count < leadingWs.length && leadingWs[s + count] === ' ' && count < indentSize) {
                                count++;
                            }
                            const spacesStr = ' '.repeat(count);
                            if (count === indentSize) {
                                guideHtml += '<span class="indent-guide">' + spacesStr + '</span>';
                            } else {
                                guideHtml += spacesStr;
                            }
                            s += count;
                        }
                    }
                    return prefixTag + guideHtml + rest;
                },
                jumpToLineFn: (lineNumber) => jumpToLine(lineNumber),
                errorLineSet: errorLineSet,
                warningLineSet: warningLineSet,
                getLineHeight: () => 22.4,
                isEnabled: () => Boolean(editorPrefs.stickyScroll)
            });
            window.stickyScrollInstance = stickyScrollController;
        }
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
    function migrateStage12InStagesCode(code) {
        if (!code || typeof code !== 'string') return code;
        // 旧ステージ12の7ブロック定義が残っている場合は6ブロックの新定義へ自動マイグレーション
        return code.replace(
            /(id:\s*12,[\s\S]*?)maxBlocks:\s*7,\s*\n\s*targetBlocks:\s*7,([\s\S]*?solution:\s*\[\s*\n\s*\{\s*col:\s*2,\s*row:\s*1\s*\},\s*\{\s*col:\s*3,\s*row:\s*1\s*\},\s*\n\s*\{\s*col:\s*1,\s*row:\s*2\s*\},\s*\{\s*col:\s*3,\s*row:\s*2\s*\},\s*\n\s*)\{\s*col:\s*1,\s*row:\s*3\s*\},\s*(\{\s*col:\s*2,\s*row:\s*3\s*\},)/,
            '$1maxBlocks: 6,\n        targetBlocks: 6,$2$3'
        );
    }

    function loadSavedFilesFromStorage() {
        Object.keys(files).forEach(key => {
            if (files[key].isSystemFile) return;
            try {
                const saved = localStorage.getItem(STORAGE_KEY_PREFIX + key);
                if (saved) {
                    // 古い main.js キャッシュ（超新星爆発や土管高さ食い込み版、足場両端0.5マス未搭載、ブラックホール演出未搭載、initDir未搭載）は破棄して最新ファイルを読ませる
                    if (key === 'main.js' && (!saved.includes('startSupernova') || !saved.includes('startBlackHole') || !saved.includes('initDir') || saved.includes('(groundY - py) + 4') || !saved.includes('halfW'))) {
                        localStorage.removeItem(STORAGE_KEY_PREFIX + key);
                        return;
                    }
                    // 古い index.html キャッシュ（自作ステージ連携用バナーやボタン未搭載）は破棄して最新ファイルを読ませる
                    if (key === 'index.html' && (!saved.includes('customStagesBanner') || !saved.includes('btnRestoreOfficial') || !saved.includes('gameToEditorBtn'))) {
                        localStorage.removeItem(STORAGE_KEY_PREFIX + key);
                        return;
                    }
                    let clean = files[key].name.endsWith('.html')
                        ? cleanInjectedPlatformScripts(saved)
                        : saved;
                    if (key === 'stages.js') {
                        clean = migrateStage12InStagesCode(clean);
                        localStorage.setItem(STORAGE_KEY_PREFIX + key, clean);
                    }
                    files[key].content = clean;
                    files[key].baselineContent = clean;
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
            'editor/sticky-scroll.css': './sticky-scroll.css',
            'editor/docs-content.js': './docs-content.js',
            'editor/share-ui.js': './share-ui.js',
            'tests/share-codec.test.js': '../tests/share-codec.test.js',
            'CHANGES_MEMO.md': '../CHANGES_MEMO.md',
            'how-to-play.html': '../how-to-play.html',
            'share-codec.js': '../share-codec.js',
            'tech-doc.html': '../tech-doc.html'
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

                    let saved = !files[key].isSystemFile ? localStorage.getItem(STORAGE_KEY_PREFIX + key) : null;
                    if (key === 'main.js' && saved && (!saved.includes('EMERGE_RISE_END') || saved.includes('(groundY - py) + 4') || !saved.includes('halfW'))) {
                        localStorage.removeItem(STORAGE_KEY_PREFIX + key);
                        saved = null;
                    }
                    if (key === 'index.html' && saved && (!saved.includes('customStagesBanner') || !saved.includes('btnRestoreOfficial') || !saved.includes('gameToEditorBtn'))) {
                        localStorage.removeItem(STORAGE_KEY_PREFIX + key);
                        saved = null;
                    }
                    if (saved && !files[key].isSystemFile) {
                        let cleanSaved = key.endsWith('.html') ? cleanInjectedPlatformScripts(saved) : saved;
                        if (key === 'stages.js') {
                            cleanSaved = migrateStage12InStagesCode(cleanSaved);
                            localStorage.setItem(STORAGE_KEY_PREFIX + key, cleanSaved);
                        }
                        files[key].content = cleanSaved;
                        files[key].baselineContent = cleanSaved;
                    } else {
                        files[key].content = rawText;
                        files[key].baselineContent = rawText;
                    }

                    if (key === currentFile) {
                        renderCurrentFile();
                    }
                    if (key === 'stages.js') {
                        populateStageJumpSelectors();
                        const stageIdx = currentFile === 'stages.js' && codeTextarea
                            ? findEditedStageIndex(files['stages.js'].content, codeTextarea.selectionStart)
                            : 0;
                        syncPreviewToStageIndex(stageIdx);
                    }
                }
            } catch (e) {
                console.warn('File fetch skipped:', key, e);
            }
        }
        renderTabs();
        updateSidebarUI();
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

        updateSidebarUI();
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
            updateUndoRedoButtons();
        });
    }

    function getTabIconHtml(fileKey, file) {
        if (fileKey.endsWith('.html')) {
            return '<span class="tab-file-icon icon-html">&lt;/&gt;</span>';
        } else if (fileKey.endsWith('.js')) {
            return '<span class="tab-file-icon icon-js">JS</span>';
        } else if (fileKey.endsWith('.css')) {
            return '<span class="tab-file-icon icon-css">{ }</span>';
        } else if (fileKey.endsWith('.json')) {
            return '<span class="tab-file-icon icon-json">{ }</span>';
        } else if (file && file.isBinary) {
            return '<span class="tab-file-icon icon-img"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm10 9l-3-3-2 2-2-2-2 3h9z"/></svg></span>';
        }
        return '<span class="tab-file-icon">📄</span>';
    }

    function getTabFolderPath(fileKey) {
        if (fileKey.startsWith('editor/') || fileKey === 'share-codec.js') {
            return '.../game/editor';
        } else {
            return '.../game';
        }
    }

    function updateSidebarUI() {
        if (!fileItems) return;
        fileItems.forEach(item => {
            const path = item.getAttribute('data-path');
            const f = files[path];
            if (path === currentFile) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
            const isDirty = f && !f.isSystemFile && (f.content !== f.baselineContent);
            item.classList.toggle('is-dirty', Boolean(isDirty));
        });

        // フォルダごとの未保存チェック (VS Codeのように配下に未保存があればフォルダ右端にドット表示)
        const groups = document.querySelectorAll('.tree-folder-group');
        groups.forEach(group => {
            const hasDirtyChild = Boolean(group.querySelector('.file-item.is-dirty'));
            group.classList.toggle('has-dirty-child', hasDirtyChild);
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
            if (isDirty) tab.classList.add('is-dirty');

            const iconHtml = getTabIconHtml(fileKey, f);
            const folderPathHtml = `<span class="tab-folder-path">${getTabFolderPath(fileKey)}</span>`;
            const dirtyDot = isDirty ? `<span class="tab-dirty-dot" title="未保存の変更があります"></span>` : '';
            const closeBtn = openTabs.length > 1
                ? `<button type="button" class="tab-close-btn" data-close="${fileKey}" title="タブを閉じる">×</button>`
                : '';

            tab.innerHTML = `${iconHtml}<span class="tab-title">${f.name}</span>${folderPathHtml}${dirtyDot}${closeBtn}`;

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

        // 2. シンタックスハイライト & インデントガイド (複数行コメントや文字列を破壊しない完全版)
        const highlighted = highlightSyntax(text, f.type);
        const withGuides = editorPrefs.indentGuides ? renderIndentGuides(highlighted, text) : highlighted;
        codeHighlight.innerHTML = withGuides + '\n';
    }

    // ── trial-admission と完全一致する高精度インデントガイド (空行の前後補間対応) ──
    function detectIndentUnit(text) {
        if (!text) return 4;
        const lines = text.split('\n');
        let has2 = 0;
        let has4 = 0;
        for (let l of lines) {
            const m = l.match(/^( +)[^ ]/);
            if (m) {
                const len = m[1].length;
                if (len % 4 === 0) has4++;
                else if (len % 2 === 0) has2++;
            }
        }
        if (has2 > 0 && has4 === 0) return 2;
        return 4;
    }

    function renderIndentGuides(html, rawText) {
        if (!html || !rawText) return html;
        const indentSize = detectIndentUnit(rawText);
        const rawLines = rawText.split('\n');
        const htmlLines = html.split('\n');

        // 各行のインデント深さ（スペース換算）を計算
        const rawIndents = rawLines.map(line => {
            let spaces = 0;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === ' ') spaces += 1;
                else if (line[i] === '\t') spaces += indentSize;
                else break;
            }
            return {
                isEmpty: line.trim().length === 0,
                spaces: spaces,
                levels: Math.floor(spaces / indentSize)
            };
        });

        // 空行のインデント深さを前後の有効行から補間（ネストブロック内の空行にもガイド線を通す）
        for (let i = 0; i < rawIndents.length; i++) {
            if (rawIndents[i].isEmpty) {
                let prevLevels = 0;
                for (let p = i - 1; p >= 0; p--) {
                    if (!rawIndents[p].isEmpty) {
                        prevLevels = rawIndents[p].levels;
                        break;
                    }
                }
                let nextLevels = 0;
                for (let n = i + 1; n < rawIndents.length; n++) {
                    if (!rawIndents[n].isEmpty) {
                        nextLevels = rawIndents[n].levels;
                        break;
                    }
                }
                rawIndents[i].levels = Math.min(prevLevels, nextLevels);
            }
        }

        const result = htmlLines.map((line, idx) => {
            const info = rawIndents[idx];
            if (!info) return line;

            // 行頭のタグとそれに続く空白（スペース/タブ）にマッチ
            const match = line.match(/^((?:<span[^>]*>)*)([ \t]+)/);
            if (match) {
                const prefixTag = match[1];
                const leadingWs = match[2];
                const rest = line.slice(match[0].length);

                let guideHtml = '';
                let s = 0;
                while (s < leadingWs.length) {
                    if (leadingWs[s] === '\t') {
                        guideHtml += '<span class="indent-guide indent-guide-tab">\t</span>';
                        s++;
                    } else {
                        let count = 0;
                        while (s + count < leadingWs.length && leadingWs[s + count] === ' ' && count < indentSize) {
                            count++;
                        }
                        const spacesStr = ' '.repeat(count);
                        if (count === indentSize) {
                            guideHtml += '<span class="indent-guide">' + spacesStr + '</span>';
                        } else {
                            guideHtml += spacesStr;
                        }
                        s += count;
                    }
                }
                return prefixTag + guideHtml + rest;
            }

            // 空行（ブロック内のガイド線を描画）
            if (info.isEmpty && info.levels > 0) {
                let guideHtml = '';
                for (let l = 0; l < info.levels; l++) {
                    guideHtml += '<span class="indent-guide">' + ' '.repeat(indentSize) + '</span>';
                }
                return guideHtml + line;
            }

            return line;
        });

        return result.join('\n');
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function highlightSyntax(code, type) {
        if (!code) return '';

        if (type === 'javascript' || type === 'json') {
            const KEYWORDS = new Set([
                'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
                'class', 'new', 'true', 'false', 'null', 'undefined', 'this', 'import', 'export',
                'from', 'as', 'default', 'case', 'switch', 'break', 'continue', 'typeof', 'instanceof',
                'void', 'delete', 'throw', 'try', 'catch', 'finally', 'async', 'await', 'yield',
                'get', 'set', 'of', 'in'
            ]);

            const STAGE_KEYWORDS = new Set([
                'STAGES', 'id', 'title', 'subtitle', 'maxBlocks', 'targetBlocks', 'startRow', 'goalRow',
                'hasCeiling', 'forbidden', 'gimmicks', 'solution', 'legends', 'col', 'row', 'type',
                'dir', 'steps', 'purpleBorder', 'icon', 'text'
            ]);

            let result = '';
            const len = code.length;
            let i = 0;
            let lastTokenEnd = 0;
            let prevTokenKind = '';

            function flush(toIdx) {
                if (toIdx > lastTokenEnd) {
                    result += escapeHtml(code.slice(lastTokenEnd, toIdx));
                    lastTokenEnd = toIdx;
                }
            }

            const templateStack = [];

            while (i < len) {
                const ch = code[i];
                const next = code[i + 1] || '';

                // 1. 一行コメント
                if (ch === '/' && next === '/') {
                    flush(i);
                    const start = i;
                    i += 2;
                    while (i < len && code[i] !== '\n') i++;
                    result += '<span class="token-comment">' + escapeHtml(code.slice(start, i)) + '</span>';
                    lastTokenEnd = i;
                    continue;
                }

                // 2. ブロックコメント
                if (ch === '/' && next === '*') {
                    flush(i);
                    const start = i;
                    i += 2;
                    while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
                    if (i < len) i += 2;
                    result += '<span class="token-comment">' + escapeHtml(code.slice(start, i)) + '</span>';
                    lastTokenEnd = i;
                    continue;
                }

                // 3. 通常文字列 ("..." または '...')
                if (ch === '"' || ch === "'") {
                    flush(i);
                    const quote = ch;
                    const start = i;
                    i++;
                    while (i < len) {
                        if (code[i] === '\\') {
                            i += 2;
                        } else if (code[i] === quote) {
                            i++;
                            break;
                        } else if (code[i] === '\n') {
                            break;
                        } else {
                            i++;
                        }
                    }
                    result += '<span class="token-string">' + escapeHtml(code.slice(start, i)) + '</span>';
                    lastTokenEnd = i;
                    prevTokenKind = 'literal';
                    continue;
                }

                // 4. テンプレートリテラル (`...`)
                if (ch === '`') {
                    flush(i);
                    const start = i;
                    i++;
                    while (i < len) {
                        if (code[i] === '\\') {
                            i += 2;
                        } else if (code[i] === '$' && code[i + 1] === '{') {
                            i += 2;
                            templateStack.push(1);
                            break;
                        } else if (code[i] === '`') {
                            i++;
                            break;
                        } else {
                            i++;
                        }
                    }
                    result += '<span class="token-string">' + escapeHtml(code.slice(start, i)) + '</span>';
                    lastTokenEnd = i;
                    prevTokenKind = 'literal';
                    continue;
                }

                // テンプレート式内の波括弧管理 (${...})
                if (templateStack.length > 0) {
                    if (ch === '{') {
                        templateStack[templateStack.length - 1]++;
                    } else if (ch === '}') {
                        templateStack[templateStack.length - 1]--;
                        if (templateStack[templateStack.length - 1] === 0) {
                            templateStack.pop();
                            flush(i);
                            result += escapeHtml('}');
                            lastTokenEnd = i + 1;
                            i++;
                            const start = i;
                            while (i < len) {
                                if (code[i] === '\\') {
                                    i += 2;
                                } else if (code[i] === '$' && code[i + 1] === '{') {
                                    i += 2;
                                    templateStack.push(1);
                                    break;
                                } else if (code[i] === '`') {
                                    i++;
                                    break;
                                } else {
                                    i++;
                                }
                            }
                            if (i > start) {
                                result += '<span class="token-string">' + escapeHtml(code.slice(start, i)) + '</span>';
                                lastTokenEnd = i;
                                prevTokenKind = 'literal';
                            }
                            continue;
                        }
                    }
                }

                // 5. 正規表現リテラル (/.../) の判定
                if (ch === '/') {
                    const isRegex = !prevTokenKind ||
                        ['operator', 'open-paren', 'open-brace', 'open-bracket', 'comma', 'colon', 'semicolon', 'keyword-regex'].includes(prevTokenKind);

                    if (isRegex) {
                        flush(i);
                        const start = i;
                        i++;
                        let inCharClass = false;
                        while (i < len) {
                            if (code[i] === '\\') {
                                i += 2;
                            } else if (code[i] === '[') {
                                inCharClass = true;
                                i++;
                            } else if (code[i] === ']' && inCharClass) {
                                inCharClass = false;
                                i++;
                            } else if (code[i] === '/' && !inCharClass) {
                                i++;
                                while (i < len && /[a-z]/i.test(code[i])) i++;
                                break;
                            } else if (code[i] === '\n') {
                                break;
                            } else {
                                i++;
                            }
                        }
                        result += '<span class="token-string">' + escapeHtml(code.slice(start, i)) + '</span>';
                        lastTokenEnd = i;
                        prevTokenKind = 'literal';
                        continue;
                    }
                }

                // 6. 数値リテラル
                if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(next) && ['operator', 'open-paren', 'comma', 'colon'].includes(prevTokenKind))) {
                    flush(i);
                    const start = i;
                    if (ch === '-') i++;
                    if (code[i] === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
                        i += 2;
                        while (i < len && /[0-9a-fA-F]/.test(code[i])) i++;
                    } else {
                        while (i < len && /[0-9]/.test(code[i])) i++;
                        if (code[i] === '.' && /[0-9]/.test(code[i + 1])) {
                            i++;
                            while (i < len && /[0-9]/.test(code[i])) i++;
                        }
                        if (code[i] === 'e' || code[i] === 'E') {
                            i++;
                            if (code[i] === '+' || code[i] === '-') i++;
                            while (i < len && /[0-9]/.test(code[i])) i++;
                        }
                    }
                    result += '<span class="token-number">' + escapeHtml(code.slice(start, i)) + '</span>';
                    lastTokenEnd = i;
                    prevTokenKind = 'literal';
                    continue;
                }

                // 7. 識別子・キーワード・プロパティ名
                if (/[a-zA-Z_$]/.test(ch)) {
                    flush(i);
                    const start = i;
                    while (i < len && /[a-zA-Z0-9_$]/.test(code[i])) i++;
                    const word = code.slice(start, i);

                    let k = i;
                    while (k < len && (code[k] === ' ' || code[k] === '\t')) k++;
                    const isProperty = (code[k] === ':' && code[k + 1] !== ':');

                    if (isProperty && !KEYWORDS.has(word)) {
                        result += '<span class="token-property">' + escapeHtml(word) + '</span>';
                        prevTokenKind = 'ident';
                    } else if (STAGE_KEYWORDS.has(word)) {
                        result += '<span class="token-property">' + escapeHtml(word) + '</span>';
                        prevTokenKind = 'ident';
                    } else if (KEYWORDS.has(word)) {
                        result += '<span class="token-keyword">' + escapeHtml(word) + '</span>';
                        if (['return', 'case', 'typeof', 'delete', 'void', 'throw', 'yield', 'await', 'in', 'instanceof'].includes(word)) {
                            prevTokenKind = 'keyword-regex';
                        } else {
                            prevTokenKind = 'keyword';
                        }
                    } else {
                        result += escapeHtml(word);
                        prevTokenKind = 'ident';
                    }
                    lastTokenEnd = i;
                    continue;
                }

                // 8. 記号・演算子・空白
                if (ch === '(') prevTokenKind = 'open-paren';
                else if (ch === '{') prevTokenKind = 'open-brace';
                else if (ch === '[') prevTokenKind = 'open-bracket';
                else if (ch === ')') prevTokenKind = 'close-paren';
                else if (ch === '}') prevTokenKind = 'close-brace';
                else if (ch === ']') prevTokenKind = 'close-bracket';
                else if (ch === ',') prevTokenKind = 'comma';
                else if (ch === ':') prevTokenKind = 'colon';
                else if (ch === ';') prevTokenKind = 'semicolon';
                else if ('=+-*%&|^!<>?~'.includes(ch)) prevTokenKind = 'operator';
                else if (!/\s/.test(ch)) prevTokenKind = 'other';

                i++;
            }

            flush(len);
            return result;
        } else if (type === 'css') {
            const regex = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))|(-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b)|([a-zA-Z0-9_-]+(?=\s*:))|([^{}]+(?=\{))/g;
            let result = '';
            let lastIndex = 0;
            let match;
            while ((match = regex.exec(code)) !== null) {
                result += escapeHtml(code.slice(lastIndex, match.index));
                if (match[1]) result += '<span class="token-comment">' + escapeHtml(match[1]) + '</span>';
                else if (match[2]) result += '<span class="token-string">' + escapeHtml(match[2]) + '</span>';
                else if (match[3]) result += '<span class="token-color">' + escapeHtml(match[3]) + '</span>';
                else if (match[4]) result += '<span class="token-number">' + escapeHtml(match[4]) + '</span>';
                else if (match[5]) result += '<span class="token-property">' + escapeHtml(match[5]) + '</span>';
                else if (match[6]) result += '<span class="token-tag">' + escapeHtml(match[6]) + '</span>';
                lastIndex = regex.lastIndex;
            }
            result += escapeHtml(code.slice(lastIndex));
            return result;
        } else if (type === 'html') {
            const regex = /(<!--[\s\S]*?-->)|(<!DOCTYPE(?:\s+[^>]*)?>)|(<\/?[a-zA-Z0-9:-]+)|(\/?>)|([a-zA-Z0-9_:-]+)(?=\s*=|\s|>|\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(&[a-zA-Z0-9#]+;)/gi;
            let result = '';
            let lastIndex = 0;
            let match;
            while ((match = regex.exec(code)) !== null) {
                result += escapeHtml(code.slice(lastIndex, match.index));
                if (match[1]) {
                    result += '<span class="token-comment">' + escapeHtml(match[1]) + '</span>';
                } else if (match[2]) {
                    result += '<span class="token-doctype">' + escapeHtml(match[2]) + '</span>';
                } else if (match[3]) {
                    const tagStr = match[3];
                    const openBracket = tagStr.startsWith('</') ? '</' : '<';
                    const tagName = tagStr.slice(openBracket.length);
                    result += '<span class="token-punctuation">' + escapeHtml(openBracket) + '</span>' +
                        '<span class="token-tag-name">' + escapeHtml(tagName) + '</span>';
                } else if (match[4]) {
                    result += '<span class="token-punctuation">' + escapeHtml(match[4]) + '</span>';
                } else if (match[5]) {
                    result += '<span class="token-attr-name">' + escapeHtml(match[5]) + '</span>';
                } else if (match[6]) {
                    result += '<span class="token-attr-value">' + escapeHtml(match[6]) + '</span>';
                } else if (match[7]) {
                    result += '<span class="token-entity">' + escapeHtml(match[7]) + '</span>';
                }
                lastIndex = regex.lastIndex;
            }
            result += escapeHtml(code.slice(lastIndex));
            return result;
        }

        return escapeHtml(code);
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

        // エディタのスクロールに連動してコードマップ（キャンバス内容）が滑らかに追従して同期
        if (minimapScrollRafId) cancelAnimationFrame(minimapScrollRafId);
        minimapScrollRafId = requestAnimationFrame(() => {
            minimapScrollRafId = null;
            renderMinimap();
        });
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

        // 上下左右の4方向クイックドック切替ボタン
        const dockBtns = document.querySelectorAll('.docs-dock-quick-buttons .dock-btn');
        dockBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetDock = btn.getAttribute('data-dock');
                setDocsDockPosition(targetDock);
                showToast(`資料パネルを${targetDock === 'top' ? '上' : targetDock === 'bottom' ? '下' : targetDock === 'left' ? '左' : '右'}に配置しました`);
            });
        });

        const docJumpItems = document.querySelectorAll('.doc-jump-item');
        docJumpItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.getAttribute('data-tab-target') || 'dictionary';
                openSplitDocs(targetTab);
                docJumpItems.forEach(d => d.classList.toggle('active', d === item));
            });
        });
    }

    function setDocsDockPosition(dock) {
        if (!['top', 'bottom', 'left', 'right'].includes(dock)) dock = 'right';
        currentDocsDock = dock;
        if (editorSplitContainer) {
            editorSplitContainer.setAttribute('data-dock', dock);
        }
        if (editorPanePrimary && editorPaneSecondary) {
            editorPanePrimary.style.flex = '';
            editorPaneSecondary.style.flex = '';
        }
        const dockBtns = document.querySelectorAll('.docs-dock-quick-buttons .dock-btn');
        dockBtns.forEach(btn => {
            btn.classList.toggle('is-active', btn.getAttribute('data-dock') === dock);
        });
        queueMinimapRender();
        if (stickyScrollController && typeof stickyScrollController.updateScroll === 'function') {
            stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
        }
    }

    /**
     * 資料パネルの4方向ドラッグ＆ドロップ制御 (Top / Bottom / Left / Right)
     */
    function initDocsDockDrag() {
        const dragHandle = document.getElementById('tab-secondary-doc') || document.getElementById('editor-tabs-bar-secondary');
        const overlay = document.getElementById('docs-dock-drop-overlay');
        if (!dragHandle || !overlay || !editorSplitContainer) return;

        let isDraggingDock = false;
        let hoveredZone = null;

        dragHandle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isDraggingDock = true;
            hoveredZone = currentDocsDock;
            overlay.classList.add('is-active');
            if (previewIframe) previewIframe.style.pointerEvents = 'none';
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingDock) return;
            const rect = editorSplitContainer.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const relX = (e.clientX - rect.left) / rect.width;
            const relY = (e.clientY - rect.top) / rect.height;

            let targetZone = 'right';
            const distTop = relY;
            const distBottom = 1 - relY;
            const distLeft = relX;
            const distRight = 1 - relX;
            const minDist = Math.min(distTop, distBottom, distLeft, distRight);

            if (minDist === distTop) targetZone = 'top';
            else if (minDist === distBottom) targetZone = 'bottom';
            else if (minDist === distLeft) targetZone = 'left';
            else targetZone = 'right';

            hoveredZone = targetZone;
            const zones = overlay.querySelectorAll('.dock-drop-zone');
            zones.forEach(z => {
                z.classList.toggle('is-hovered', z.getAttribute('data-dock-target') === targetZone);
            });
        });

        window.addEventListener('mouseup', () => {
            if (!isDraggingDock) return;
            isDraggingDock = false;
            overlay.classList.remove('is-active');
            const zones = overlay.querySelectorAll('.dock-drop-zone');
            zones.forEach(z => z.classList.remove('is-hovered'));
            if (previewIframe) previewIframe.style.pointerEvents = '';
            if (hoveredZone && hoveredZone !== currentDocsDock) {
                setDocsDockPosition(hoveredZone);
                showToast(`資料パネルを${hoveredZone === 'top' ? '上' : hoveredZone === 'bottom' ? '下' : hoveredZone === 'left' ? '左' : '右'}に配置しました`);
            }
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
        if (!isSplitMode) {
            document.querySelectorAll('.doc-jump-item').forEach(d => d.classList.remove('active'));
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
            btn.textContent = t.title; // 絵文字を表示しない
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
        const file = files[currentFile];
        if (!file || file.isBinary || document.body.classList.contains('hide-minimap')) {
            minimapWrap.style.display = 'none';
            return;
        }
        minimapWrap.style.display = 'block';

        const rect = minimapWrap.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);

        if (minimapCanvas.width !== targetW || minimapCanvas.height !== targetH) {
            minimapCanvas.width = targetW;
            minimapCanvas.height = targetH;
        }

        if (!minimapCtx) minimapCtx = minimapCanvas.getContext('2d');
        if (!minimapCtx) return;

        minimapCtx.save();
        minimapCtx.scale(dpr, dpr);
        minimapCtx.clearRect(0, 0, rect.width, rect.height);

        const text = codeTextarea.value || file.content || '';
        const lines = text.split('\n');
        const lineCount = lines.length;

        const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 12;
        const maxScroll = Math.max(1, codeTextarea.scrollHeight - codeTextarea.clientHeight);
        const scrollRatio = Math.max(0, Math.min(1, codeTextarea.scrollTop / maxScroll));
        const maxMinimapScroll = Math.max(0, totalMinimapHeight - rect.height);
        const minimapOffsetY = totalMinimapHeight > rect.height ? scrollRatio * maxMinimapScroll : 0;

        // フォント設定（極小等幅フォントで実物スクリーンショット風の精密感を再現）
        minimapCtx.font = '2.5px "SF Mono", "Fira Code", Monaco, Menlo, Consolas, monospace';
        minimapCtx.textBaseline = 'top';

        // 各行を描画
        for (let i = 0; i < lineCount; i++) {
            const lineNum = i + 1;
            const y = (i * MINIMAP_LINE_PITCH) - minimapOffsetY + 6;

            if (y < -MINIMAP_LINE_PITCH || y > rect.height + MINIMAP_LINE_PITCH) {
                continue;
            }

            // エラー・警告行の背景ハイライト
            if (errorLineSet.has(lineNum)) {
                minimapCtx.fillStyle = 'rgba(239, 68, 68, 0.45)';
                minimapCtx.fillRect(0, y - 0.5, rect.width, MINIMAP_LINE_PITCH);
                minimapCtx.fillStyle = '#ef4444';
                minimapCtx.fillRect(rect.width - 4, y - 0.5, 4, MINIMAP_LINE_PITCH);
            } else if (warningLineSet.has(lineNum)) {
                minimapCtx.fillStyle = 'rgba(245, 158, 11, 0.35)';
                minimapCtx.fillRect(0, y - 0.5, rect.width, MINIMAP_LINE_PITCH);
                minimapCtx.fillStyle = '#f59e0b';
                minimapCtx.fillRect(rect.width - 4, y - 0.5, 4, MINIMAP_LINE_PITCH);
            }

            const rawLine = lines[i];
            if (!rawLine.trim()) continue;

            const leadingSpaces = rawLine.match(/^\s*/)[0].replace(/\t/g, '    ').length;
            const startX = 6 + leadingSpaces * 1.0;
            const trimmed = rawLine.trimStart();

            tokenizeAndDrawMinimapLine(trimmed, file.type, startX, y, rect.width - 12);
        }

        minimapCtx.restore();
        updateMinimapGutterMarkers(lineCount, rect.height);
        syncMinimapSlider();
    }

    function tokenizeAndDrawMinimapLine(text, type, startX, y, maxWidth) {
        if (!text) return;
        let tokens = [];

        const isLight = document.body.classList.contains('theme-light') || editorPrefs.theme === 'light';
        const cDefault = isLight ? '#24292e' : '#d4d4d4';
        const cComment = isLight ? '#008000' : '#6a9955';
        const cString = isLight ? '#a31515' : '#ce9178';
        const cKeyword = isLight ? '#af00db' : '#c586c0';
        const cNumber = isLight ? '#098658' : '#b5cea8';
        const cProperty = isLight ? '#001080' : '#9cdcfe';
        const cTag = isLight ? '#800000' : '#569cd6';
        const cPunctuation = '#808080';
        const cColor = isLight ? '#098658' : '#4ec9b0';
        const cSelector = isLight ? '#800000' : '#d7ba7d';

        if (type === 'javascript' || type === 'json') {
            const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\\[\r\n])+\/[a-z]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|true|false|null|undefined|this|import|export|from|STAGES)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z0-9_$]+(?=\s*:))/g;
            let lastIdx = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIdx) {
                    tokens.push({ text: text.slice(lastIdx, match.index), color: cDefault });
                }
                if (match[1]) tokens.push({ text: match[1], color: cComment });
                else if (match[2]) tokens.push({ text: match[2], color: cString });
                else if (match[3]) tokens.push({ text: match[3], color: cKeyword });
                else if (match[4]) tokens.push({ text: match[4], color: cNumber });
                else if (match[5]) tokens.push({ text: match[5], color: cProperty });
                lastIdx = regex.lastIndex;
            }
            if (lastIdx < text.length) {
                tokens.push({ text: text.slice(lastIdx), color: cDefault });
            }
        } else if (type === 'css') {
            const regex = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))|(-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b)|([a-zA-Z0-9_-]+(?=\s*:))|([^{}]+(?=\{))/g;
            let lastIdx = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIdx) tokens.push({ text: text.slice(lastIdx, match.index), color: cDefault });
                if (match[1]) tokens.push({ text: match[1], color: cComment });
                else if (match[2]) tokens.push({ text: match[2], color: cString });
                else if (match[3]) tokens.push({ text: match[3], color: cColor });
                else if (match[4]) tokens.push({ text: match[4], color: cNumber });
                else if (match[5]) tokens.push({ text: match[5], color: cProperty });
                else if (match[6]) tokens.push({ text: match[6], color: cSelector });
                lastIdx = regex.lastIndex;
            }
            if (lastIdx < text.length) tokens.push({ text: text.slice(lastIdx), color: cDefault });
        } else if (type === 'html') {
            const regex = /(<!--[\s\S]*?-->)|(<!DOCTYPE(?:\s+[^>]*)?>)|(<\/?[a-zA-Z0-9:-]+)|(\/?>)|([a-zA-Z0-9_:-]+)(?=\s*=|\s|>|\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi;
            let lastIdx = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIdx) {
                    tokens.push({ text: text.slice(lastIdx, match.index), color: cDefault });
                }
                if (match[1]) {
                    tokens.push({ text: match[1], color: cComment });
                } else if (match[2]) {
                    tokens.push({ text: match[2], color: cTag });
                } else if (match[3]) {
                    const tagStr = match[3];
                    const openBracket = tagStr.startsWith('</') ? '</' : '<';
                    const tagName = tagStr.slice(openBracket.length);
                    tokens.push({ text: openBracket, color: cPunctuation });
                    tokens.push({ text: tagName, color: cTag });
                } else if (match[4]) {
                    tokens.push({ text: match[4], color: cPunctuation });
                } else if (match[5]) {
                    tokens.push({ text: match[5], color: isLight ? '#e50000' : '#9cdcfe' });
                } else if (match[6]) {
                    tokens.push({ text: match[6], color: isLight ? '#0000ff' : '#ce9178' });
                }
                lastIdx = regex.lastIndex;
            }
            if (lastIdx < text.length) {
                tokens.push({ text: text.slice(lastIdx), color: cDefault });
            }
        } else {
            tokens.push({ text: text, color: cDefault });
        }

        let currX = startX;
        for (const token of tokens) {
            if (currX >= maxWidth) break;
            minimapCtx.fillStyle = token.color;
            minimapCtx.fillText(token.text, currX, y + 0.5);
            currX += minimapCtx.measureText(token.text).width;
        }
    }

    function updateMinimapGutterMarkers(lineCount, viewHeight) {
        if (!minimapGutter || lineCount <= 0) return;
        let html = '';
        errorLineSet.forEach(lineNum => {
            const topPct = ((lineNum - 1) / lineCount) * 100;
            html += `<div style="position:absolute;top:${topPct}%;left:0;width:3px;height:3px;background-color:#ef4444;border-radius:1px;box-shadow:0 0 3px #ef4444;"></div>`;
        });
        warningLineSet.forEach(lineNum => {
            const topPct = ((lineNum - 1) / lineCount) * 100;
            html += `<div style="position:absolute;top:${topPct}%;left:0;width:3px;height:3px;background-color:#f59e0b;border-radius:1px;"></div>`;
        });
        minimapGutter.innerHTML = html;
    }

    function syncMinimapSlider() {
        if (!minimapSlider || !minimapWrap || !codeTextarea || !editorPrefs.minimap) return;
        const rect = minimapWrap.getBoundingClientRect();
        if (rect.height === 0) return;

        const text = codeTextarea.value || '';
        const lineCount = Math.max(1, text.split('\n').length);
        const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 12;

        const maxScroll = Math.max(1, codeTextarea.scrollHeight - codeTextarea.clientHeight);
        const scrollRatio = Math.max(0, Math.min(1, codeTextarea.scrollTop / maxScroll));

        const computed = window.getComputedStyle(codeTextarea);
        const lh = parseFloat(computed.lineHeight) || 22;
        const visibleLines = codeTextarea.clientHeight / lh;

        let sliderHeight;
        let sliderTop;

        if (totalMinimapHeight <= rect.height) {
            sliderHeight = Math.max(20, Math.min(rect.height, visibleLines * MINIMAP_LINE_PITCH));
            const trackHeight = Math.max(0, totalMinimapHeight - sliderHeight);
            sliderTop = 6 + (scrollRatio * trackHeight);
        } else {
            sliderHeight = Math.max(24, Math.min(rect.height * 0.8, visibleLines * MINIMAP_LINE_PITCH));
            const trackHeight = Math.max(1, rect.height - sliderHeight);
            sliderTop = scrollRatio * trackHeight;
        }

        sliderTop = Math.max(0, Math.min(rect.height - sliderHeight, sliderTop));
        minimapSlider.style.top = `${sliderTop}px`;
        minimapSlider.style.height = `${sliderHeight}px`;
    }

    function initMinimapInteraction() {
        if (!minimapWrap || !minimapSlider) return;

        minimapWrap.addEventListener('mousedown', (e) => {
            const wrapRect = minimapWrap.getBoundingClientRect();
            const maxScroll = Math.max(0, codeTextarea.scrollHeight - codeTextarea.clientHeight);
            if (maxScroll <= 0) return;

            isMinimapDragging = true;
            document.body.style.userSelect = 'none';
            minimapSlider.classList.add('is-dragging');
            if (previewIframe) previewIframe.style.pointerEvents = 'none';

            const text = codeTextarea.value || '';
            const lineCount = Math.max(1, text.split('\n').length);
            const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 12;
            const sliderHeight = minimapSlider.offsetHeight || 24;

            if (e.target === minimapSlider) {
                const sliderRect = minimapSlider.getBoundingClientRect();
                minimapDragGrabOffsetY = e.clientY - sliderRect.top;
            } else {
                minimapDragGrabOffsetY = sliderHeight / 2;
                const clickY = e.clientY - wrapRect.top;
                let targetScrollTop = 0;
                if (totalMinimapHeight <= wrapRect.height) {
                    const trackHeight = Math.max(1, totalMinimapHeight - sliderHeight);
                    const ratio = Math.max(0, Math.min(1, (clickY - minimapDragGrabOffsetY - 6) / trackHeight));
                    targetScrollTop = ratio * maxScroll;
                } else {
                    const trackHeight = Math.max(1, wrapRect.height - sliderHeight);
                    const ratio = Math.max(0, Math.min(1, (clickY - minimapDragGrabOffsetY) / trackHeight));
                    targetScrollTop = ratio * maxScroll;
                }
                codeTextarea.scrollTop = Math.max(0, Math.min(maxScroll, Math.round(targetScrollTop)));
                syncEditorScroll();
                syncMinimapSlider();
                renderMinimap();
            }

            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMinimapDragging) return;
            const wrapRect = minimapWrap.getBoundingClientRect();
            const maxScroll = Math.max(0, codeTextarea.scrollHeight - codeTextarea.clientHeight);
            if (maxScroll <= 0) return;

            const text = codeTextarea.value || '';
            const lineCount = Math.max(1, text.split('\n').length);
            const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 12;
            const targetSliderTop = e.clientY - wrapRect.top - minimapDragGrabOffsetY;

            let targetScrollTop = 0;
            if (totalMinimapHeight <= wrapRect.height) {
                const sliderHeight = minimapSlider.offsetHeight || 20;
                const trackHeight = Math.max(1, totalMinimapHeight - sliderHeight);
                const ratio = Math.max(0, Math.min(1, (targetSliderTop - 6) / trackHeight));
                targetScrollTop = ratio * maxScroll;
            } else {
                const sliderHeight = minimapSlider.offsetHeight || 24;
                const trackHeight = Math.max(1, wrapRect.height - sliderHeight);
                const ratio = Math.max(0, Math.min(1, targetSliderTop / trackHeight));
                targetScrollTop = ratio * maxScroll;
            }

            codeTextarea.scrollTop = Math.max(0, Math.min(maxScroll, Math.round(targetScrollTop)));
            syncEditorScroll();
            syncMinimapSlider();
            renderMinimap();
        });

        window.addEventListener('mouseup', () => {
            if (isMinimapDragging) {
                isMinimapDragging = false;
                document.body.style.userSelect = '';
                minimapSlider.classList.remove('is-dragging');
                if (previewIframe) previewIframe.style.pointerEvents = '';
            }
        });

        window.addEventListener('resize', () => {
            renderMinimap();
            syncMinimapSlider();
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

        diagnosticsBar.classList.remove('has-errors', 'has-error', 'has-warnings', 'has-warning', 'is-ok');
        diagnosticsStatusDot.className = 'diagnostics-status-dot';

        if (errors.length > 0) {
            diagnosticsBar.classList.add('has-errors');
            diagnosticsStatusDot.classList.add('error');
            const first = errors[0];
            diagnosticsStatusText.textContent = `エラー ${errors.length}件: 行${first.line} — ${first.message}`;
        } else if (warnings.length > 0) {
            diagnosticsBar.classList.add('has-warnings');
            diagnosticsStatusDot.classList.add('warning');
            const first = warnings[0];
            diagnosticsStatusText.textContent = `注意 ${warnings.length}件: 行${first.line} — ${first.message}`;
        } else {
            diagnosticsBar.classList.add('is-ok');
            diagnosticsStatusDot.classList.add('ok');
            diagnosticsStatusText.textContent = '構文エラーはありません';
        }

        renderDiagnosticsList();
        updateUnsavedUI();
    }

    function renderDiagnosticsList() {
        if (!diagnosticsList) return;
        diagnosticsList.innerHTML = '';

        if (currentDiagnostics.length === 0) {
            diagnosticsList.innerHTML = `<div class="diagnostics-empty">現在開いているファイルに構文エラーや警告はありません。</div>`;
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

    let isDraggingDiagnostics = false;
    let startDiagY = 0;
    let startDiagHeight = 140;
    let hasDraggedDistance = false;

    function startDiagnosticsDrag(e) {
        if (e.target.closest('#btn-toggle-diagnostics')) return;
        isDraggingDiagnostics = true;
        hasDraggedDistance = false;
        startDiagY = e.clientY;
        const currentH = (diagnosticsPanel && diagnosticsPanel.offsetHeight > 0)
            ? diagnosticsPanel.offsetHeight
            : (parseInt(localStorage.getItem(STORAGE_KEY_PREFIX + 'diagnostics_height'), 10) || 140);
        startDiagHeight = currentH;
        diagnosticsPanelResizer?.classList.add('is-dragging');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }

    function initDiagnosticsEvents() {
        // パネルの保存された高さを復元
        try {
            const savedDiagHeight = parseInt(localStorage.getItem(STORAGE_KEY_PREFIX + 'diagnostics_height'), 10);
            if (savedDiagHeight >= 60 && savedDiagHeight <= 500 && diagnosticsPanel) {
                diagnosticsPanel.style.height = savedDiagHeight + 'px';
            }
        } catch (e) { }

        // 上端リサイザーまたは診断バー自体のどちらをつかんでもドラッグ可能
        diagnosticsPanelResizer?.addEventListener('mousedown', startDiagnosticsDrag);
        diagnosticsBar?.addEventListener('mousedown', startDiagnosticsDrag);

        // ダブルクリックで開閉トグル
        diagnosticsPanelResizer?.addEventListener('dblclick', () => {
            toggleDiagnosticsPanel();
        });
        diagnosticsBar?.addEventListener('dblclick', () => {
            toggleDiagnosticsPanel();
        });

        btnToggleDiagnostics?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDiagnosticsPanel();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingDiagnostics) return;
            const delta = startDiagY - e.clientY; // 上に動かすと正の値（拡大）

            if (Math.abs(delta) > 3) {
                hasDraggedDistance = true;
            }

            if (!isDiagnosticsPanelOpen && delta > 4) {
                // 閉じた状態から上に引き上げた場合、パネルをオープン
                toggleDiagnosticsPanel(true);
            }

            if (isDiagnosticsPanelOpen) {
                const newHeight = startDiagHeight + delta;
                if (newHeight <= 45) {
                    // 下限まで押し下げたらカーソル操作だけで自動で閉じる！
                    toggleDiagnosticsPanel(false);
                } else {
                    const clampedHeight = Math.min(500, Math.max(60, newHeight));
                    if (diagnosticsPanel) diagnosticsPanel.style.height = clampedHeight + 'px';
                    try { localStorage.setItem(STORAGE_KEY_PREFIX + 'diagnostics_height', String(Math.round(clampedHeight))); } catch (e) { }
                }

                if (typeof renderMinimap === 'function') renderMinimap();
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingDiagnostics) {
                isDraggingDiagnostics = false;
                diagnosticsPanelResizer?.classList.remove('is-dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // 単なるクリック（ドラッグ移動ほぼなし）だった場合は開閉トグル
                if (!hasDraggedDistance) {
                    toggleDiagnosticsPanel();
                } else {
                    if (typeof renderMinimap === 'function') renderMinimap();
                }
            }
        });
    }

    function toggleDiagnosticsPanel(forceState) {
        if (!diagnosticsPanel) return;
        isDiagnosticsPanelOpen = forceState !== undefined ? forceState : !isDiagnosticsPanelOpen;
        diagnosticsPanel.style.display = isDiagnosticsPanelOpen ? 'flex' : 'none';
        if (btnToggleDiagnostics) {
            btnToggleDiagnostics.textContent = isDiagnosticsPanelOpen ? '詳細を閉じる' : '詳細を表示';
        }
        requestAnimationFrame(() => {
            if (typeof renderMinimap === 'function') renderMinimap();
            if (stickyScrollController && typeof stickyScrollController.updateScroll === 'function') {
                stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
            }
        });
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
            editorStageJumpSelect.innerHTML = `<option value="">ステージへ移動...</option>`;
            parsed.forEach((st, idx) => {
                const opt = document.createElement('option');
                opt.value = String(idx);
                opt.textContent = st.title || ('ステージ ' + (st.id != null ? st.id : (idx + 1)));
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
            newOpt.textContent = '＋ 新規ステージ (ステージ 99)';
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
            if (win.__game) {
                win.__game.disableKeyPlacement = true;
            }
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
        const hasId99 = parsed && parsed.some(s => Number(s.id) === 99);
        const maxId = parsed && parsed.length > 0 ? Math.max(...parsed.map(s => Number(s.id) || 0)) : 0;
        const nextId = hasId99 ? Math.max(99, maxId + 1) : 99;

        const templateBlock = `    {
        id: ${nextId},
        title: 'ステージ ${nextId}',
        subtitle: '新規ステージ',
        maxBlocks: 6,
        targetBlocks: 4,
        startRow: 3,
        goalRow: 1,
        hasCeiling: false,
        forbidden: [],
        gimmicks: [],
        solution: [],
        legends: []
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
            recordFileHistory(currentFile, codeTextarea.value, codeTextarea.selectionStart, codeTextarea.selectionEnd);

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
        renderTabs();
        updateSidebarUI();
    }

    function getFileHistory(fileKey) {
        if (!fileHistory[fileKey]) {
            fileHistory[fileKey] = {
                undo: [{ text: (files[fileKey] ? files[fileKey].content : ''), selStart: 0, selEnd: 0 }],
                redo: []
            };
        }
        return fileHistory[fileKey];
    }

    let editHistoryDebounce = null;
    let isPerformingUndoRedo = false;

    function recordFileHistory(fileKey, text, selStart = 0, selEnd = 0, immediate = false) {
        if (isPerformingUndoRedo) return;
        const hist = getFileHistory(fileKey);
        const last = hist.undo[hist.undo.length - 1];
        if (last && last.text === text) return;

        const snap = { text, selStart, selEnd };
        if (immediate) {
            hist.undo.push(snap);
            if (hist.undo.length > 50) hist.undo.shift();
            hist.redo = [];
            updateUndoRedoButtons();
            return;
        }

        clearTimeout(editHistoryDebounce);
        editHistoryDebounce = setTimeout(() => {
            hist.undo.push(snap);
            if (hist.undo.length > 50) hist.undo.shift();
            hist.redo = [];
            updateUndoRedoButtons();
        }, 300);
    }

    function performEditorUndo() {
        if (files[currentFile] && files[currentFile].isSystemFile) return;
        const hist = getFileHistory(currentFile);
        if (hist.undo.length <= 1) return;

        isPerformingUndoRedo = true;
        clearTimeout(editHistoryDebounce);
        const currSnap = hist.undo.pop();
        hist.redo.push(currSnap);

        const prevSnap = hist.undo[hist.undo.length - 1];
        if (prevSnap) {
            codeTextarea.value = prevSnap.text;
            if (files[currentFile]) {
                files[currentFile].content = prevSnap.text;
            }
            codeTextarea.setSelectionRange(prevSnap.selStart || 0, prevSnap.selEnd || 0);
            renderCurrentFile();
            if (stickyScrollController) {
                stickyScrollController.updateFile(currentFile, prevSnap.text, files[currentFile].type);
            }
            runLinter();
        }
        isPerformingUndoRedo = false;
        updateUndoRedoButtons();
        showToast('直前の変更を元に戻しました');
    }

    function performEditorRedo() {
        if (files[currentFile] && files[currentFile].isSystemFile) return;
        const hist = getFileHistory(currentFile);
        if (hist.redo.length === 0) return;

        isPerformingUndoRedo = true;
        clearTimeout(editHistoryDebounce);
        const nextSnap = hist.redo.pop();
        hist.undo.push(nextSnap);

        codeTextarea.value = nextSnap.text;
        if (files[currentFile]) {
            files[currentFile].content = nextSnap.text;
        }
        codeTextarea.setSelectionRange(nextSnap.selStart || 0, nextSnap.selEnd || 0);
        renderCurrentFile();
        if (stickyScrollController) {
            stickyScrollController.updateFile(currentFile, nextSnap.text, files[currentFile].type);
        }
        runLinter();
        isPerformingUndoRedo = false;
        updateUndoRedoButtons();
        showToast('変更をやり直しました');
    }

    function updateUndoRedoButtons() {
        const hist = getFileHistory(currentFile);
        const canUndo = hist.undo.length > 1;
        const canRedo = hist.redo.length > 0;

        if (btnUndo) {
            btnUndo.disabled = !canUndo;
            btnUndo.classList.toggle('is-disabled', !canUndo);
        }
        if (btnRedo) {
            btnRedo.disabled = !canRedo;
            btnRedo.classList.toggle('is-disabled', !canRedo);
        }
    }

    // ── ヘッダーボタン（保存して反映・Undo・Redo・リセット・コピー） ──
    function initHeaderActions() {
        if (btnSaveRun) {
            btnSaveRun.addEventListener('click', () => saveAndRun());
        }
        if (btnUndo) {
            btnUndo.addEventListener('click', () => performEditorUndo());
        }
        if (btnRedo) {
            btnRedo.addEventListener('click', () => performEditorRedo());
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

        // 「ゲームをプレイ」ボタン (自作ステージを持ち込んで本番ゲームを開始)
        const btnPlayGame = document.getElementById('btn-play-game');
        if (btnPlayGame) {
            btnPlayGame.addEventListener('click', () => {
                // 未保存の変更があれば自動保存
                if (hasAnyUnsavedChanges()) {
                    saveAndRun(true);
                }

                // stages.js からステージ配列をパース
                const parsedStages = parseStagesSafely();
                if (!parsedStages || !Array.isArray(parsedStages) || parsedStages.length === 0) {
                    showToast('stages.js の構文エラーを修正してからプレイしてください', 'error');
                    return;
                }

                // メモリ（localStorage）に自作ステージを保存
                try {
                    localStorage.setItem('hako_custom_stages_data', JSON.stringify(parsedStages));
                    localStorage.setItem('hako_custom_mode_active', 'true');
                    localStorage.setItem('hako_custom_stages_timestamp', Date.now().toString());
                } catch (e) {
                    console.warn('Failed to save custom stages to localStorage:', e);
                }

                showToast('ステージを保存しました！ゲームへ移動します...', 'success');
                setTimeout(() => {
                    window.location.href = '../index.html?mode=custom';
                }, 250);
            });
        }

        // 左上「ゲームへ」ボタン (公式ゲームへ移動、自作ステージは持ち込まない)
        const btnBackToGame = document.getElementById('btn-back-to-game');
        if (btnBackToGame) {
            btnBackToGame.addEventListener('click', () => {
                try {
                    localStorage.removeItem('hako_custom_mode_active');
                } catch (e) {}
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
                try {
                    const win = previewIframe.contentWindow;
                    if (win && win.__game) {
                        win.__game.disableKeyPlacement = true;
                    }
                } catch (e) { /* ignore */ }
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

        // 2. 4方向対応 エディタ分割境界リサイザー (上下左右ドッキング連動)
        if (editorSplitDivider && editorSplitContainer && editorPanePrimary && editorPaneSecondary) {
            let isResizingSplit = false;
            editorSplitDivider.addEventListener('mousedown', (e) => {
                if (!isSplitMode) return;
                isResizingSplit = true;
                editorSplitDivider.classList.add('is-dragging');
                if (previewIframe) previewIframe.style.pointerEvents = 'none';
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!isResizingSplit) return;
                const rect = editorSplitContainer.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return;

                if (currentDocsDock === 'top' || currentDocsDock === 'bottom') {
                    // 上下分割のリサイズ
                    const relY = e.clientY - rect.top;
                    const ratio = Math.max(0.18, Math.min(0.82, relY / rect.height));
                    if (currentDocsDock === 'bottom') {
                        editorPanePrimary.style.flex = `0 0 ${ratio * 100}%`;
                        editorPaneSecondary.style.flex = `1 1 ${(1 - ratio) * 100}%`;
                    } else {
                        editorPaneSecondary.style.flex = `0 0 ${ratio * 100}%`;
                        editorPanePrimary.style.flex = `1 1 ${(1 - ratio) * 100}%`;
                    }
                } else {
                    // 左右分割のリサイズ
                    const relX = e.clientX - rect.left;
                    const ratio = Math.max(0.18, Math.min(0.82, relX / rect.width));
                    if (currentDocsDock === 'right') {
                        editorPanePrimary.style.flex = `0 0 ${ratio * 100}%`;
                        editorPaneSecondary.style.flex = `1 1 ${(1 - ratio) * 100}%`;
                    } else {
                        editorPaneSecondary.style.flex = `0 0 ${ratio * 100}%`;
                        editorPanePrimary.style.flex = `1 1 ${(1 - ratio) * 100}%`;
                    }
                }
                queueMinimapRender();
            });
            window.addEventListener('mouseup', () => {
                if (isResizingSplit) {
                    isResizingSplit = false;
                    editorSplitDivider.classList.remove('is-dragging');
                    if (previewIframe) previewIframe.style.pointerEvents = '';
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

        const btnSettingsTop = document.getElementById('btn-open-settings-top');
        if (btnSettingsTop) btnSettingsTop.addEventListener('click', openSettings);
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
            const hasId99 = parsed.some(s => Number(s.id) === 99);
            const maxId = parsed.length > 0 ? Math.max(...parsed.map(s => Number(s.id) || 0)) : 0;
            const nextId = hasId99 ? Math.max(99, maxId + 1) : 99;
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
