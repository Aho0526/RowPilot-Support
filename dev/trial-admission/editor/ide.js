/**
 * ide.js - Webエディタ メインコントローラー
 * 仮想ファイルシステムの管理、タブ切り替え、コード編集やドット絵エディタの操作、
 * およびゲーム画面へのリアルタイム保存・反映処理などエディタ全体の機能を統括します。
 */

(function () {
    'use strict';

    // 仮想ファイルシステム (教材・ゲーム関連全ファイル管理)
    // 順序: index.html -> js群 -> style.css -> package.json -> LICENSE -> assets -> editor
    const files = {
        'index.html': {
            name: 'index.html',
            path: '../index.html',
            type: 'html',
            editable: true,
            isDirty: false,
            desc: '画面構造・HTMLマークアップ',
            content: `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>スペースインベーダー</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css?v=3.2">
</head>
<body>
    <!-- 上部バー（エディタへ移動ボタン） -->
    <header class="game-top-bar" id="game-top-bar">
        <div class="top-bar-left">
            <span class="game-brand-title">Space Invaders</span>
        </div>
        <div class="top-bar-right">
            <a href="editor/" id="btn-goto-editor" class="goto-editor-btn" title="コードエディタを開く">
                <svg class="editor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <span>エディタへ移動</span>
                <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </a>
        </div>
    </header>

    <!-- メインゲーム画面 -->
    <div id="game-container">
        <div class="canvas-wrapper">
            <canvas id="gameCanvas" width="480" height="560" tabindex="0"></canvas>
            
            <!-- ホーム画面 (本格アーケード・タイトルスクリーン) -->
            <div id="start-overlay" class="game-overlay">
                <div class="arcade-home-container">
                    <!-- タイトルヘッダー -->
                    <div class="arcade-title-box">
                        <div class="arcade-coin-tag">PUSH START</div>
                        <h1 class="arcade-main-title">SPACE INVADERS</h1>
                        <div class="arcade-hiscore">HI-SCORE <span id="home-hiscore">00000</span></div>
                    </div>

                    <!-- スコアアドバンステーブル -->
                    <div class="arcade-score-table">
                        <div class="score-table-header">*SCORE ADVANCE TABLE*</div>
                        <div class="score-row">
                            <canvas class="sprite-preview-cell" id="preview-ufo" width="32" height="14"></canvas>
                            <span class="score-desc text-ufo">= ?? PT</span>
                        </div>
                        <div class="score-row">
                            <canvas class="sprite-preview-cell" id="preview-squid" width="20" height="18"></canvas>
                            <span class="score-desc text-squid">= 30 PT</span>
                        </div>
                        <div class="score-row">
                            <canvas class="sprite-preview-cell" id="preview-crab" width="24" height="18"></canvas>
                            <span class="score-desc text-crab">= 20 PT</span>
                        </div>
                        <div class="score-row">
                            <canvas class="sprite-preview-cell" id="preview-octopus" width="26" height="18"></canvas>
                            <span class="score-desc text-octopus">= 10 PT</span>
                        </div>
                    </div>

                    <!-- セレクターパネル (難易度・クリア条件) -->
                    <div class="arcade-options-panel">
                        <div class="option-row">
                            <span class="option-caption">DIFFICULTY:</span>
                            <div class="option-pill-group" id="diff-options">
                                <button type="button" class="arcade-pill" data-diff="easy">
                                    <span class="pill-name">EASY</span>
                                </button>
                                <button type="button" class="arcade-pill active" data-diff="normal">
                                    <span class="pill-name">NORMAL</span>
                                </button>
                                <button type="button" class="arcade-pill" data-diff="hard">
                                    <span class="pill-name">HARD</span>
                                </button>
                            </div>
                        </div>

                        <div class="option-row">
                            <span class="option-caption">CLEAR GOAL:</span>
                            <div class="option-pill-group" id="wave-options">
                                <button type="button" class="arcade-pill active" data-waves="3">
                                    <span class="pill-name">3 WAVES</span>
                                </button>
                                <button type="button" class="arcade-pill" data-waves="5">
                                    <span class="pill-name">5 WAVES</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- アーケード特大スタートボタン (dev/game風の押し込みボタン) -->
                    <div class="arcade-action-wrap">
                        <button type="button" id="btn-game-start" class="arcade-play-btn">
                            <div class="btn-player-icon-box">
                                <canvas id="preview-player" width="26" height="16"></canvas>
                            </div>
                            <div class="btn-label-group">
                                <span class="btn-label-main">ゲーム開始</span>
                                <span class="btn-label-sub">1 PLAYER START</span>
                            </div>
                            <span class="btn-blink-arrow">▶</span>
                        </button>
                        <div class="arcade-start-hint">[SPACE] KEY TO START</div>
                    </div>
                </div>
            </div>

            <!-- クイックポーズボタン (ゲームプレイ中に右上表示) -->
            <button type="button" id="btn-quick-pause" class="quick-pause-btn" title="ゲームを一時停止 (Esc)" style="display: none;">
                ⏸ PAUSE
            </button>

            <!-- 一時停止・中止メニュー (Escキーまたはポーズボタンで表示) -->
            <div id="pause-overlay" class="game-overlay pause-overlay" style="display: none;">
                <!-- 1. メインの中止選択メニュー -->
                <div class="pause-menu-box" id="pause-menu-box">
                    <div class="pause-title">GAME PAUSED</div>
                    <div class="pause-subtitle">ゲームを一時中断しています</div>
                    <div class="pause-actions">
                        <button type="button" class="pause-btn btn-edit-code" id="btn-pause-edit">
                            <span class="pause-btn-main">コードを編集する</span>
                            <span class="pause-btn-sub">一時停止のまま敵や自機の変更を確認</span>
                        </button>
                        <button type="button" class="pause-btn btn-quit-game" id="btn-pause-quit">
                            <span class="pause-btn-main">ゲームを終了する</span>
                            <span class="pause-btn-sub">ホーム画面に戻る</span>
                        </button>
                    </div>
                    <div class="pause-footer-hint">[Esc] ゲーム再開　/　[Space] 決定</div>
                </div>

                <!-- 2. コード編集中の控えめなHUD（敵や自機が見える） -->
                <div class="pause-hud-box" id="pause-hud-box" style="display: none;">
                    <div class="pause-hud-badge">一時停止中</div>
                    <div class="pause-hud-desc">エディタでコードやドット絵を変更すると即座に反映されます</div>
                    <div class="pause-hud-actions">
                        <button type="button" class="pause-hud-btn btn-resume" id="btn-hud-resume">
                            ▶ ゲームを再開する [Space]
                        </button>
                        <button type="button" class="pause-hud-btn btn-quit" id="btn-hud-quit">
                            ✕ ゲームを終了
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="controls-hint">
            <span class="key-tag">←</span> <span class="key-tag">→</span> 移動　/　<span class="key-tag">Space</span> 攻撃　/　<span class="key-tag">Esc</span> 一時停止・中止
        </div>
    </div>

    <!-- 設定ファイル -->
    <script src="config.js"></script>
    
    <!-- コアエンジン -->
    <script src="core.js"></script>
</body>
</html>`
        },
        'config.js': {
            name: 'config.js',
            path: '../config.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            desc: 'ゲームパラメータ設定',
            content: `// ゲーム設定ファイル (config.js)\nconst GameConfig = {};`
        },
        'core.js': {
            name: 'core.js',
            path: '../core.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            desc: 'ゲームコアエンジン',
            content: `// ゲームエンジン (core.js)`
        },
        'style.css': {
            name: 'style.css',
            path: '../style.css',
            type: 'css',
            editable: true,
            isDirty: false,
            desc: '画面スタイル・デザイン',
            content: `/* スタイル設定 (style.css) */`
        },
        'package.json': {
            name: 'package.json',
            path: '../package.json',
            type: 'json',
            editable: false,
            isDirty: false,
            desc: 'プロジェクトパッケージ設定',
            content: `{\n  "name": "space-invaders-studio",\n  "version": "1.0.0",\n  "description": "Space Invaders Game & Interactive Code Studio for Trial Admission",\n  "main": "index.html",\n  "scripts": {\n    "start": "python3 -m http.server 8088",\n    "test": "node editor/linter.js || node dev/trial-admission/editor/linter.js"\n  },\n  "keywords": [\n    "game",\n    "space-invaders",\n    "canvas",\n    "education",\n    "trial-admission"\n  ],\n  "author": "Kaito Nakahira",\n  "license": "MIT"\n}\n`
        },
        'LICENSE': {
            name: 'LICENSE',
            path: '../LICENSE',
            type: 'text',
            editable: false,
            isDirty: false,
            desc: 'MITライセンス文書'
        },
        'assets/space-bg.jpg': {
            name: 'space-bg.jpg',
            path: '../assets/space-bg.jpg',
            type: 'image',
            editable: false,
            isDirty: false,
            isBinary: true,
            folder: 'assets',
            bgKey: 'space-bg',
            desc: '宇宙・星空背景画像'
        },
        'assets/space-nebula.jpg': {
            name: 'space-nebula.jpg',
            path: '../assets/space-nebula.jpg',
            type: 'image',
            editable: false,
            isDirty: false,
            isBinary: true,
            folder: 'assets',
            bgKey: 'space-nebula',
            desc: '星雲・ネビュラ背景画像'
        },
        'assets/octopus.png': {
            name: 'octopus.png',
            path: '../assets/octopus.png',
            type: 'image',
            editable: false,
            isDirty: false,
            isBinary: true,
            folder: 'assets',
            desc: 'タコ型インベーダー アイコン画像'
        },
        'assets/squid.png': {
            name: 'squid.png',
            path: '../assets/squid.png',
            type: 'image',
            editable: false,
            isDirty: false,
            isBinary: true,
            folder: 'assets',
            desc: 'イカ型インベーダー アイコン画像'
        },
        'assets/crab.png': {
            name: 'crab.png',
            path: '../assets/crab.png',
            type: 'image',
            editable: false,
            isDirty: false,
            isBinary: true,
            folder: 'assets',
            desc: 'カニ型インベーダー アイコン画像'
        },
        'assets/player.png': {
            name: 'player.png',
            path: '../assets/player.png',
            type: 'image',
            editable: false,
            isDirty: false,
            isBinary: true,
            folder: 'assets',
            desc: '自機砲台 アイコン画像'
        },
        'assets/ufo.png': {
            name: 'ufo.png',
            path: '../assets/ufo.png',
            type: 'image',
            editable: false,
            isDirty: false,
            isBinary: true,
            folder: 'assets',
            desc: 'UFOボーナス敵 アイコン画像'
        },
        'editor/index.html': {
            name: 'index.html',
            path: './index.html',
            type: 'html',
            editable: false,
            isDirty: false,
            desc: 'エディタ画面構造'
        },
        'editor/ide.js': {
            name: 'ide.js',
            path: './ide.js',
            type: 'javascript',
            editable: false,
            isDirty: false,
            desc: 'エディタ本体スクリプト'
        },
        'editor/linter.js': {
            name: 'linter.js',
            path: './linter.js',
            type: 'javascript',
            editable: false,
            isDirty: false,
            desc: '構文診断エンジン'
        },
        'editor/ide.css': {
            name: 'ide.css',
            path: './ide.css',
            type: 'css',
            editable: false,
            isDirty: false,
            desc: 'エディタUIスタイル'
        },
        'editor/sticky-scroll.css': {
            name: 'sticky-scroll.css',
            path: './sticky-scroll.css',
            type: 'css',
            editable: false,
            isDirty: false,
            desc: 'スティッキースクロールスタイル'
        },
        'editor/sticky-scroll.js': {
            name: 'sticky-scroll.js',
            path: './sticky-scroll.js',
            type: 'javascript',
            editable: false,
            isDirty: false,
            desc: 'スティッキースクロールエンジン'
        }
    };

    let openTabs = ['index.html', 'config.js', 'style.css'];
    let currentFileKey = 'index.html';

    // 状態管理
    let isMuted = true;
    const SCALE_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.3, 1.5];
    let currentScaleIndex = 2; // 1.0 (100%)
    try {
        const savedScale = parseInt(localStorage.getItem('invader_editor_scale'), 10);
        if (savedScale >= 0 && savedScale < SCALE_PRESETS.length) currentScaleIndex = savedScale;
    } catch (e) { }

    // DOM要素
    const btnSave = document.getElementById('btn-save');
    const btnReset = document.getElementById('btn-reset');
    const tabContainer = document.getElementById('editor-tabs');
    const lineNumbersInner = document.getElementById('line-numbers-inner');
    const codeTextarea = document.getElementById('code-textarea');
    const codeHighlight = document.getElementById('code-highlight');
    const previewIframe = document.getElementById('preview-iframe');
    const previewPane = document.getElementById('preview-pane');
    const paneResizer = document.getElementById('pane-resizer');
    const toast = document.getElementById('ide-toast');
    const toastMsg = document.getElementById('ide-toast-msg');

    // エディタコンテナ & 画像ビューア DOM要素
    const editorBodyContainer = document.getElementById('editor-body-container');
    const imageViewerPane = document.getElementById('image-viewer-pane');
    const imageViewerPath = document.getElementById('image-viewer-path');
    const imageViewerDims = document.getElementById('image-viewer-dims');
    const imageViewerImg = document.getElementById('image-viewer-img');
    const imageViewerGuide = document.getElementById('image-viewer-guide');
    const btnCopyImagePath = document.getElementById('btn-copy-image-path');

    // フォルダ開閉DOM要素
    const folderToggleAssets = document.getElementById('folder-toggle-assets');
    const folderGroupAssets = document.getElementById('folder-group-assets');

    // ミニマップ (コードマップ) DOM要素
    const editorMinimapWrap = document.getElementById('editor-minimap-wrap');
    const editorMinimapCanvas = document.getElementById('editor-minimap-canvas');
    const editorMinimapSlider = document.getElementById('editor-minimap-slider');
    const editorMinimapGutter = document.getElementById('editor-minimap-gutter');
    const MINIMAP_LINE_PITCH = 3.6; // 1行あたりのピクセル高さ
    const EDITOR_LINE_HEIGHT = 22; // エディタの1行のピクセル高さ
    let minimapCtx = null;
    let isMinimapDragging = false;
    let minimapDragGrabOffsetY = 0;

    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    const soundText = document.getElementById('sound-text');
    const btnScaleDown = document.getElementById('btn-scale-down');
    const btnScaleUp = document.getElementById('btn-scale-up');
    const scaleIndicator = document.getElementById('scale-indicator');

    // 構文チェック・診断関連 DOM要素
    const diagnosticsBar = document.getElementById('editor-diagnostics-bar');
    const diagnosticsStatusDot = document.getElementById('diagnostics-status-dot');
    const diagnosticsStatusText = document.getElementById('diagnostics-status-text');
    const btnToggleDiagnostics = document.getElementById('btn-toggle-diagnostics');
    const diagnosticsPanel = document.getElementById('editor-diagnostics-panel');
    const diagnosticsList = document.getElementById('diagnostics-list');
    const diagnosticsSummary = document.getElementById('diagnostics-summary');
    const diagnosticsPanelResizer = document.getElementById('diagnostics-panel-resizer');

    // 診断状態
    let currentFileIssues = [];
    let errorLineSet = new Set();
    let warningLineSet = new Set();
    let diagnosticsPanelOpen = false;
    let diagnosticsDebounceTimer = null;

    // パネルの保存された高さを復元
    try {
        const savedDiagHeight = parseInt(localStorage.getItem('invader_editor_diagnostics_height'), 10);
        if (savedDiagHeight >= 60 && savedDiagHeight <= 500 && diagnosticsPanel) {
            diagnosticsPanel.style.height = savedDiagHeight + 'px';
        }
    } catch (e) { }

    // スティッキースクロール コントローラ
    let stickyScrollController = null;
    let initialFilesLoaded = false;

    // ─────────────────────────────────────────────
    // CDN や Cloudflare 等の自動注入スクリプトを除去して純粋なコードを保持（※HTMLファイルのみ対象）
    function cleanInjectedPlatformScripts(text) {
        if (typeof text !== 'string') return text;
        return text
            // 外部読み込みの /cdn-cgi/ スクリプト
            .replace(/<script\b[^>]*src=["'][^"']*\/cdn-cgi\/[^"']*["'][^>]*>\s*<\/script>\s*/gi, '')
            // インラインで注入された Cloudflare challenge-platform 等のスクリプト (単一タグ内で完結するもの)
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>\s*/gi, function (match, body) {
                if (/\/cdn-cgi\/|__CF\$cv\$params|cloudflare-static/i.test(body)) {
                    return '';
                }
                return match;
            })
            // Cloudflare Web Analytics などのコメント
            .replace(/<!--\s*Cloudflare.*?\s*-->\s*/gi, '')
            .trimEnd() + '\n';
    }

    // 実ファイルの自動フェッチ (並列取得で高速化＆未取得時の誤検知防止)
    // ─────────────────────────────────────────────
    async function loadRealFiles() {
        const cacheBust = '?t=' + Date.now();
        const keys = Object.keys(files);

        await Promise.all(keys.map(async (key) => {
            if (files[key].isBinary) {
                // 画像ファイルなどバイナリはテキストfetchしない
                files[key].isLoaded = true;
                return;
            }
            try {
                const resp = await fetch(files[key].path + cacheBust);
                if (resp.ok) {
                    const rawText = await resp.text();
                    const isHtml = files[key].type === 'html' || key.endsWith('.html');
                    files[key].content = isHtml ? cleanInjectedPlatformScripts(rawText) : rawText;
                    files[key].baselineContent = files[key].content;
                    if (!files[key].productionContent) {
                        files[key].productionContent = files[key].content;
                    }
                    files[key].isDirty = false;
                    files[key].isLoaded = true;
                }
            } catch (e) {
                console.warn('ファイルの読み込みに失敗しました:', key, e);
            }
        }));

        initialFilesLoaded = true;

        if (files[currentFileKey] && files[currentFileKey].isBinary) {
            renderImageViewer(currentFileKey);
        } else {
            renderEditor();
        }
        updatePreview();
        updateAllFilesDiagnostics();
        updateSettingsModeDisplay();
        if (spritePane && spritePane.style.display !== 'none') {
            loadSpriteFromConfig();
            renderSpriteGrid();
        }

        // URLパラメータ ?mode=trial がある場合は初期状態で体験入学モードを適用
        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('mode') === 'trial' && !isTrialAdmissionBroken()) {
                applyTrialAdmissionBreak();
            }
        } catch (e) {
            console.warn('URLパラメータの解析に失敗しました:', e);
        }
    }

    // ─────────────────────────────────────────────
    // シンタックスハイライター
    // ─────────────────────────────────────────────
    function escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
            // HTMLパーサー (VS Code Dark+スタイル: タグ・属性・属性値・括弧・コメントを完全再現)
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

    /**
     * ファイルのインデント単位 (2スペース または 4スペース) を自動検出
     */
    function detectIndentUnit(text) {
        if (!text) return 4;
        const lines = text.split('\n');
        let has2 = 0;
        let has4 = 0;
        for (let i = 0; i < Math.min(lines.length, 120); i++) {
            const m = lines[i].match(/^( +)\S/);
            if (m) {
                const len = m[1].length;
                if (len % 4 === 0) has4++;
                else if (len % 2 === 0) has2++;
            }
        }
        if (has2 > 0 && has4 === 0) return 2;
        return 4;
    }

    /**
     * エディタ行のネストを示すインデントガイド (Indent Guides) を描画
     * 行頭のインデントスペースを解析し、VS Code公式同様に薄い縦線ガイドを配置
     */
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

    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
    // エディタ描画 & 行番号完全ピクセル同期
    // ─────────────────────────────────────────────
    function renderEditor() {
        const file = files[currentFileKey];
        if (!file) return;

        const isEditable = !!file.editable;
        codeTextarea.value = file.content;
        codeTextarea.readOnly = !isEditable;
        codeTextarea.classList.toggle('is-readonly', !isEditable);

        if (btnSave) {
            btnSave.style.opacity = isEditable ? '' : '0.4';
            btnSave.style.pointerEvents = isEditable ? '' : 'none';
            btnSave.title = isEditable ? 'コードを保存してゲームに反映 (⌘S / Ctrl+S)' : 'このファイルは閲覧専用のため保存できません';
        }
        if (btnReset) {
            btnReset.style.opacity = isEditable ? '' : '0.4';
            btnReset.style.pointerEvents = isEditable ? '' : 'none';
        }

        runDiagnostics(currentFileKey, true);
        updateCodeHighlight();
        updateTabsUI();
        updateSidebarUI();

        // スティッキースクロールのファイル更新 & 再描画
        if (stickyScrollController) {
            stickyScrollController.updateFile(currentFileKey, file.content, file.type);
        }

        syncScroll();

        // Undo / Redo 初期スナップショット登録
        recordHistorySnapshot(currentFileKey, file.content, 0, 0, true);
        updateUndoRedoButtons();
    }

    // ─────────────────────────────────────────────
    // 構文診断 (Linter) 連携 & 初心者向けエラー表示
    // ─────────────────────────────────────────────
    // 全ファイルのエラー・警告状態マップ (ファイルパス -> エラー/警告件数 / 全issue配列)
    const fileErrorCountMap = {};
    const fileWarningCountMap = {};
    const fileIssuesMap = {};

    function runDiagnostics(fileKey, skipHighlightUpdate) {
        const file = files[fileKey];
        if (!file || !window.Linter || file.editable === false || file.isBinary || file.type === 'xml' || file.type === 'text' || typeof file.content !== 'string' || (!initialFilesLoaded && !file.isLoaded)) {
            currentFileIssues = [];
            errorLineSet.clear();
            warningLineSet.clear();
            updateAllFilesDiagnostics();
            updateDiagnosticsUI(fileKey);
            return;
        }

        // ベースラインとの差分行を計算（あなたが編集した箇所を推測）
        const changedLines = window.Linter.computeChangedLines(file.baselineContent || '', file.content);

        // 差分だけでなくファイル全体＋他ファイルとの横断整合性 (allFiles) をセーブ前に即時チェック
        currentFileIssues = window.Linter.lint(fileKey, file.content, {
            baselineCode: file.baselineContent,
            changedLines: changedLines,
            allFiles: initialFilesLoaded ? files : null
        });

        // 各issueにファイル名を明示
        currentFileIssues.forEach(item => {
            item.filename = fileKey;
        });

        errorLineSet.clear();
        warningLineSet.clear();

        currentFileIssues.forEach(item => {
            if (item.severity === 'error') {
                errorLineSet.add(item.line);
            } else if (item.severity === 'warning') {
                warningLineSet.add(item.line);
            }
        });

        // 見ているファイルに関係なく、全ファイルのエラー＆ファイル横断整合性をディレクトリツリーと診断パネルに即時反映
        updateAllFilesDiagnostics();
        updateDiagnosticsUI(fileKey);

        if (!skipHighlightUpdate) {
            updateLineNumberIndicators();
        }
    }

    function updateAllFilesDiagnostics() {
        if (!window.Linter) return;

        // 初回fetch完了前は未取得ファイルを誤って空ファイルエラーと判定しないよう待機
        if (!initialFilesLoaded) {
            updateFileTreeErrorIndicators();
            return;
        }

        for (let k in files) {
            const f = files[k];
            if (!f || f.editable === false || f.isBinary || f.type === 'xml' || f.type === 'text' || typeof f.content !== 'string') {
                fileErrorCountMap[k] = 0;
                fileWarningCountMap[k] = 0;
                fileIssuesMap[k] = [];
                continue;
            }
            try {
                const changedLines = window.Linter.computeChangedLines(f.baselineContent || '', f.content);
                const issues = window.Linter.lint(k, f.content, {
                    baselineCode: f.baselineContent,
                    changedLines: changedLines,
                    allFiles: files
                }) || [];
                issues.forEach(iss => { iss.filename = k; });
                fileIssuesMap[k] = issues;
                const errCount = issues.filter(i => i.severity === 'error').length;
                const warnCount = issues.filter(i => i.severity === 'warning').length;
                fileErrorCountMap[k] = errCount;
                fileWarningCountMap[k] = warnCount;
            } catch (e) {
                console.warn('Linter check failed for', k, e);
            }
        }

        updateFileTreeErrorIndicators();
        updateSaveButtonState();
    }

    // 警告用の高品質SVGアイコン (黄色の三角形 + !)
    const WARNING_TRIANGLE_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M12 2.5L1.5 21h21L12 2.5z" fill="#f59e0b" stroke="#d97706" stroke-width="1.5" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="14" stroke="#1c1917" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.2" fill="#1c1917"/></svg>`;

    function updateFileTreeErrorIndicators() {
        const fileItems = document.querySelectorAll('.tree-item-row.file-item');
        const folderGroups = document.querySelectorAll('.tree-folder-group');

        // 各ファイルの赤字(エラー)・黄字(警告) & バッジの反映
        fileItems.forEach(el => {
            const path = el.getAttribute('data-path');
            const errCount = fileErrorCountMap[path] || 0;
            const warnCount = fileWarningCountMap[path] || 0;
            const existingErrorBadge = el.querySelector('.tree-error-badge');
            const existingWarningBadge = el.querySelector('.tree-warning-badge');

            if (errCount > 0) {
                el.classList.add('has-error');
                el.classList.remove('has-warning');
                if (existingWarningBadge) existingWarningBadge.remove();

                if (!existingErrorBadge) {
                    const badge = document.createElement('span');
                    badge.className = 'tree-error-badge';
                    badge.textContent = '!';
                    badge.title = `構文エラーが ${errCount} 件あります`;
                    el.appendChild(badge);
                } else {
                    existingErrorBadge.title = `構文エラーが ${errCount} 件あります`;
                }
            } else if (warnCount > 0) {
                el.classList.remove('has-error');
                el.classList.add('has-warning');
                if (existingErrorBadge) existingErrorBadge.remove();

                if (!existingWarningBadge) {
                    const badge = document.createElement('span');
                    badge.className = 'tree-warning-badge';
                    badge.title = `警告・確認箇所が ${warnCount} 件あります`;
                    badge.innerHTML = WARNING_TRIANGLE_SVG;
                    el.appendChild(badge);
                } else {
                    existingWarningBadge.title = `警告・確認箇所が ${warnCount} 件あります`;
                }
            } else {
                el.classList.remove('has-error');
                el.classList.remove('has-warning');
                if (existingErrorBadge) existingErrorBadge.remove();
                if (existingWarningBadge) existingWarningBadge.remove();
            }
        });

        // 親フォルダグループのドット反映（内部にエラー/警告ファイルがあるか）
        folderGroups.forEach(fg => {
            const toggleBtn = fg.querySelector(':scope > .tree-item-row[data-folder]');
            if (!toggleBtn) return;

            const childErrors = fg.querySelectorAll('.tree-item-row.file-item.has-error');
            const childWarnings = fg.querySelectorAll('.tree-item-row.file-item.has-warning');
            const existingDot = toggleBtn.querySelector('.folder-status-dot');

            if (childErrors.length > 0) {
                toggleBtn.classList.add('has-error-child');
                toggleBtn.classList.remove('has-warning-child');
                if (!existingDot) {
                    const dot = document.createElement('span');
                    dot.className = 'folder-status-dot folder-error-dot';
                    dot.title = `フォルダ内のファイルにエラーがあります`;
                    toggleBtn.appendChild(dot);
                } else {
                    existingDot.className = 'folder-status-dot folder-error-dot';
                    existingDot.title = `フォルダ内のファイルにエラーがあります`;
                }
            } else if (childWarnings.length > 0) {
                toggleBtn.classList.remove('has-error-child');
                toggleBtn.classList.add('has-warning-child');
                if (!existingDot) {
                    const dot = document.createElement('span');
                    dot.className = 'folder-status-dot folder-warning-dot';
                    dot.title = `フォルダ内のファイルに警告があります`;
                    toggleBtn.appendChild(dot);
                } else {
                    existingDot.className = 'folder-status-dot folder-warning-dot';
                    existingDot.title = `フォルダ内のファイルに警告があります`;
                }
            } else {
                toggleBtn.classList.remove('has-error-child');
                toggleBtn.classList.remove('has-warning-child');
                if (existingDot) {
                    existingDot.remove();
                }
            }
        });
    }

    function updateLineNumberIndicators() {
        const lineNums = lineNumbersInner.querySelectorAll('.line-num');
        lineNums.forEach(el => {
            const line = parseInt(el.getAttribute('data-line'), 10);
            el.className = 'line-num';
            if (errorLineSet.has(line)) {
                el.classList.add('has-error');
            } else if (warningLineSet.has(line)) {
                el.classList.add('has-warning');
            }
        });
        if (stickyScrollController) {
            stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
        }
        renderMinimap();
    }

    function getOtherFilesIssues(excludeFileKey) {
        const others = [];
        for (const k in fileIssuesMap) {
            if (k === excludeFileKey) continue;
            const list = fileIssuesMap[k] || [];
            for (const item of list) {
                others.push(item);
            }
        }
        return others;
    }

    function updateDiagnosticsUI(fileKey) {
        if (!diagnosticsBar || !diagnosticsStatusText || !diagnosticsStatusDot) return;
        fileKey = fileKey || currentFileKey;

        const errorCount = currentFileIssues.filter(i => i.severity === 'error').length;
        const warningCount = currentFileIssues.filter(i => i.severity === 'warning').length;

        const otherIssues = getOtherFilesIssues(fileKey);
        const otherErrorCount = otherIssues.filter(i => i.severity === 'error').length;
        const otherWarningCount = otherIssues.filter(i => i.severity === 'warning').length;

        diagnosticsBar.className = 'editor-diagnostics-bar';
        if (diagnosticsPanelResizer) {
            diagnosticsPanelResizer.className = 'diagnostics-panel-resizer';
        }

        const warningDotSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" style="vertical-align: -2px; margin-right: 2px;"><path d="M12 2.5L1.5 21h21L12 2.5z" fill="#f97316" stroke="#ea580c" stroke-width="1.5" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="14" stroke="#1c1917" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.2" fill="#1c1917"/></svg>`;

        if (errorCount > 0) {
            // 開いているファイル自体にエラーがある場合 -> 赤色
            diagnosticsBar.classList.add('has-errors');
            diagnosticsPanelResizer?.classList.add('has-errors');
            diagnosticsStatusDot.className = 'diagnostics-status-dot error';
            diagnosticsStatusDot.textContent = '●';
            const otherSuffix = otherErrorCount > 0 ? `（他ファイルにエラー ${otherErrorCount} 件）` : '';
            diagnosticsStatusText.textContent = `[${fileKey}] エラーが ${errorCount} 件あります${otherSuffix}`;
        } else if (warningCount > 0) {
            // 開いているファイルに警告がある場合 -> オレンジ色
            diagnosticsBar.classList.add('has-warnings');
            diagnosticsPanelResizer?.classList.add('has-warnings');
            diagnosticsStatusDot.className = 'diagnostics-status-dot warning';
            diagnosticsStatusDot.innerHTML = warningDotSvg;

            const otherErrSuffix = otherErrorCount > 0 ? ` ／ 他ファイルにエラーが ${otherErrorCount} 件あります` : '';
            const otherWarnSuffix = (otherErrorCount === 0 && otherWarningCount > 0) ? `（他ファイルに警告 ${otherWarningCount} 件）` : '';
            diagnosticsStatusText.textContent = `[${fileKey}] 警告が ${warningCount} 件あります${otherErrSuffix}${otherWarnSuffix}`;
        } else if (otherErrorCount > 0) {
            // 開いているファイルは正常だが他ファイルにエラーがある場合 -> 赤色
            diagnosticsBar.classList.add('has-errors');
            diagnosticsPanelResizer?.classList.add('has-errors');
            diagnosticsStatusDot.className = 'diagnostics-status-dot error';
            diagnosticsStatusDot.textContent = '●';
            diagnosticsStatusText.textContent = `[${fileKey}] エラーなし ／ 他ファイルにエラーが ${otherErrorCount} 件あります`;
        } else if (otherWarningCount > 0) {
            // 開いているファイルは正常だが他ファイルに警告がある場合 -> オレンジ色
            diagnosticsBar.classList.add('has-warnings');
            diagnosticsPanelResizer?.classList.add('has-warnings');
            diagnosticsStatusDot.className = 'diagnostics-status-dot warning';
            diagnosticsStatusDot.innerHTML = warningDotSvg;
            diagnosticsStatusText.textContent = `[${fileKey}] 正常 ／ 他ファイルに警告が ${otherWarningCount} 件あります`;
        } else {
            diagnosticsStatusDot.className = 'diagnostics-status-dot ok';
            diagnosticsStatusDot.textContent = '●';
            diagnosticsStatusText.textContent = `[${fileKey}] 構文エラーはありません`;
        }

        renderDiagnosticsList(fileKey);
    }

    function renderDiagnosticItemHtml(item, defaultFileKey) {
        const isErr = item.severity === 'error';
        const itemClass = isErr ? 'severity-error' : 'severity-warning';
        const iconHtml = isErr 
            ? `<span class="diag-badge-icon error" title="エラー">!</span>` 
            : `<span class="diag-badge-icon warning" title="警告">${WARNING_TRIANGLE_SVG}</span>`;
        const targetFile = item.filename || defaultFileKey;
        const fileBadge = `<span class="diagnostic-file-badge">${escapeHtml(targetFile)}</span>`;
        const lineBadge = `<span class="diagnostic-line-badge">行 ${item.line}</span>`;
        const editedBadge = item.isChangedByUser ? `<span class="diagnostic-edited-badge" title="あなたが編集した行です">編集箇所</span>` : '';
        const previewHtml = item.lineText ? `<div class="diagnostic-code-preview">&gt; ${escapeHtml(item.lineText.trim())}</div>` : '';

        return `
            <div class="diagnostic-item ${itemClass} ${item.isChangedByUser ? 'is-edited' : ''}" 
                 data-file="${escapeHtml(targetFile)}" 
                 data-line="${item.line}" 
                 data-col="${item.col}" 
                 title="クリックして [${escapeHtml(targetFile)}] の 行 ${item.line} へ移動">
                <div class="diagnostic-badges">
                    ${fileBadge}
                    ${lineBadge}
                    ${editedBadge}
                </div>
                <div class="diagnostic-content">
                    <div class="diagnostic-message">${iconHtml}<span>${escapeHtml(item.message)}</span></div>
                    <div class="diagnostic-hint">${escapeHtml(item.hint)}</div>
                    ${previewHtml}
                </div>
            </div>
        `;
    }

    function renderDiagnosticsList(fileKey) {
        if (!diagnosticsList) return;
        fileKey = fileKey || currentFileKey;

        const otherIssues = getOtherFilesIssues(fileKey);

        if (currentFileIssues.length === 0 && otherIssues.length === 0) {
            diagnosticsList.innerHTML = `
                <div style="padding: 16px 12px; text-align: center; color: #64748b; font-size: 11.5px;">
                    [${escapeHtml(fileKey)}] 構文エラーやファイル横断の不整合はありません。すべてのコードは正常です。
                </div>
            `;
            return;
        }

        let html = '';
        currentFileIssues.forEach(item => {
            html += renderDiagnosticItemHtml(item, fileKey);
        });

        if (otherIssues.length > 0) {
            html += `
                <div style="padding: 6px 12px; background: rgba(30, 41, 59, 0.7); color: #94a3b8; font-size: 11px; font-weight: 600; border-top: 1px solid #334155; border-bottom: 1px solid #334155;">
                    他ファイルのエラー・警告（クリックで該当ファイルへ移動）
                </div>
            `;
            otherIssues.forEach(item => {
                html += renderDiagnosticItemHtml(item, item.filename);
            });
        }

        diagnosticsList.innerHTML = html;

        // アイテムクリックで行ジャンプ（別ファイルならファイル切り替えも行う）
        diagnosticsList.querySelectorAll('.diagnostic-item').forEach(el => {
            el.addEventListener('click', () => {
                const targetFile = el.getAttribute('data-file');
                const line = parseInt(el.getAttribute('data-line'), 10);
                const col = parseInt(el.getAttribute('data-col'), 10) || 1;

                if (targetFile && targetFile !== currentFileKey && files[targetFile]) {
                    switchToFile(targetFile);
                    setTimeout(() => jumpToLine(line, col), 50);
                } else {
                    jumpToLine(line, col);
                }
            });
        });
    }

    function toggleDiagnosticsPanel(forceState) {
        if (!diagnosticsPanel) return;
        diagnosticsPanelOpen = forceState !== undefined ? forceState : !diagnosticsPanelOpen;
        diagnosticsPanel.style.display = diagnosticsPanelOpen ? 'flex' : 'none';
        if (btnToggleDiagnostics) {
            btnToggleDiagnostics.textContent = diagnosticsPanelOpen ? '詳細を閉じる' : '詳細を表示';
        }
    }

    // ─────────────────────────────────────────────
    // 診断バー＆パネルの直接ドラッグ式引き出し機能
    // （エラーバーをそのままマウスで上に引き出せる）
    // ─────────────────────────────────────────────
    // 診断バー＆パネルの直接ドラッグ式引き出し機能
    // （赤いエラーライン／バーをそのままマウスで上に引き出せる）
    // ─────────────────────────────────────────────
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
            : (parseInt(localStorage.getItem('invader_editor_diagnostics_height'), 10) || 140);
        startDiagHeight = currentH;
        diagnosticsPanelResizer?.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }

    // 上端の赤いライン、またはエラー通知バー自体のどちらをつかんでもドラッグ可能！
    diagnosticsPanelResizer?.addEventListener('mousedown', startDiagnosticsDrag);
    diagnosticsBar?.addEventListener('mousedown', startDiagnosticsDrag);

    // ダブルクリックで開閉またはデフォルト高さにリセット
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

        if (!diagnosticsPanelOpen && delta > 4) {
            // 閉じた状態から上に引き上げた場合、パネルをオープン！
            toggleDiagnosticsPanel(true);
        }

        if (diagnosticsPanelOpen) {
            const newHeight = startDiagHeight + delta;
            if (newHeight <= 40) {
                // 下限まで押し下げたら自動で閉じる
                toggleDiagnosticsPanel(false);
            } else {
                const clampedHeight = Math.min(500, Math.max(60, newHeight));
                if (diagnosticsPanel) diagnosticsPanel.style.height = clampedHeight + 'px';
                try { localStorage.setItem('invader_editor_diagnostics_height', String(Math.round(clampedHeight))); } catch (e) { }
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingDiagnostics) {
            isDraggingDiagnostics = false;
            diagnosticsPanelResizer?.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // 単なるクリック（ドラッグ移動ほぼなし）だった場合は開閉トグル
            if (!hasDraggedDistance) {
                toggleDiagnosticsPanel();
            }
        }
    });

    /**
     * 指定行へスクロール＆キャレット移動
     */
    function jumpToLine(line, col) {
        if (!codeTextarea) return;
        const text = codeTextarea.value;
        const lines = text.split('\n');
        line = Math.max(1, Math.min(line, lines.length));

        // 行の文字インデックスを計算
        let charIndex = 0;
        for (let i = 0; i < line - 1; i++) {
            charIndex += lines[i].length + 1; // +1 for '\n'
        }
        if (col && col > 1) {
            charIndex += Math.min(col - 1, lines[line - 1].length);
        }

        codeTextarea.focus();
        codeTextarea.setSelectionRange(charIndex, charIndex);

        // スクロール位置計算 (22px line-height, 見えやすい位置へスクロール)
        const lineHeight = 22;
        const editorHeight = codeTextarea.clientHeight || 400;
        const targetScrollTop = Math.max(0, (line - 1) * lineHeight - (editorHeight / 3));

        codeTextarea.scrollTop = targetScrollTop;
        syncScroll();
    }

    // スティッキースクロールからの行ジャンプ (親スティッキー行の直下へ正確に位置合わせ＆キャレット移動)
    function jumpToStickyLine(line, stickyIndex = 0) {
        if (!codeTextarea) return;
        const text = codeTextarea.value;
        const lines = text.split('\n');
        line = Math.max(1, Math.min(line, lines.length));

        let charIndex = 0;
        for (let i = 0; i < line - 1; i++) {
            charIndex += lines[i].length + 1;
        }
        const firstNonWs = lines[line - 1].search(/\S/);
        if (firstNonWs > 0) {
            charIndex += firstNonWs;
        }

        const lineHeight = 22;
        const topPadding = 12;
        const parentRows = Math.max(0, stickyIndex || 0);
        const targetScrollTop = (line <= 1)
            ? 0
            : Math.max(0, topPadding + (line - 1 - parentRows) * lineHeight);

        codeTextarea.focus();
        codeTextarea.setSelectionRange(charIndex, charIndex);
        codeTextarea.scrollTop = targetScrollTop;
        syncScroll();
    }

    lineNumbersInner?.addEventListener('click', (e) => {
        const item = e.target.closest('.line-num');
        if (item) {
            const line = parseInt(item.getAttribute('data-line'), 10);
            if (line) jumpToLine(line, 1);
        }
    });

    function updateCodeHighlight() {
        const file = files[currentFileKey];
        if (!file) return;

        const text = codeTextarea.value;
        file.content = text;

        // 行番号の生成 (各行を固定高divで生成し、行番号のズレを完全に排除)
        const lines = text.split('\n');
        const lineCount = lines.length;
        let lineHtml = '';
        for (let i = 1; i <= lineCount; i++) {
            let cls = 'line-num';
            if (errorLineSet.has(i)) {
                cls += ' has-error';
            } else if (warningLineSet.has(i)) {
                cls += ' has-warning';
            }
            lineHtml += `<div class="${cls}" data-line="${i}">${i}</div>`;
        }
        lineNumbersInner.innerHTML = lineHtml;

        // シンタックスハイライト & インデントガイド (ネストを示す縦線)
        codeHighlight.innerHTML = renderIndentGuides(highlightSyntax(text, file.type), text) + '\n';

        // ミニマップ描画
        renderMinimap();
    }

    let minimapScrollRafId = null;
    function syncScroll() {
        const scrollTop = codeTextarea.scrollTop;
        const scrollLeft = codeTextarea.scrollLeft;
        codeHighlight.scrollTop = scrollTop;
        codeHighlight.scrollLeft = scrollLeft;
        // translateY方式により、スクロール天井制限に関わらず1ピクセルも狂わずに完全同期
        lineNumbersInner.style.transform = `translateY(-${scrollTop}px)`;

        // スティッキースクロールのリアルタイム更新
        if (stickyScrollController) {
            stickyScrollController.updateScroll(scrollTop, scrollLeft);
        }

        // ミニマップスライダーの即時追随
        syncMinimapSlider();

        // エディタのスクロールに同期してコードマップ（キャンバス内容）が滑らかに追従してゆっくり動く！
        if (minimapScrollRafId) cancelAnimationFrame(minimapScrollRafId);
        minimapScrollRafId = requestAnimationFrame(() => {
            minimapScrollRafId = null;
            renderMinimap();
        });
    }

    // ─────────────────────────────────────────────
    // エディタ用 Undo / Redo (元に戻す / やり直す)
    // ─────────────────────────────────────────────
    const fileEditHistory = {};
    const MAX_EDIT_HISTORY = 50;
    let isPerformingUndoRedo = false;
    let editHistoryDebounce = null;

    function getFileHistory(key) {
        if (!fileEditHistory[key]) {
            fileEditHistory[key] = { undo: [], redo: [] };
        }
        return fileEditHistory[key];
    }

    function recordHistorySnapshot(key, text, selStart, selEnd, forceImmediate = false) {
        if (isPerformingUndoRedo || !key) return;
        const hist = getFileHistory(key);
        const last = hist.undo[hist.undo.length - 1];
        if (last && last.text === text) return;

        const record = () => {
            const currentLast = hist.undo[hist.undo.length - 1];
            if (currentLast && currentLast.text === text) return;
            hist.undo.push({
                text: text,
                selStart: selStart !== undefined ? selStart : text.length,
                selEnd: selEnd !== undefined ? selEnd : text.length
            });
            if (hist.undo.length > MAX_EDIT_HISTORY) {
                hist.undo.shift();
            }
            hist.redo = [];
            updateUndoRedoButtons();
        };

        if (forceImmediate) {
            clearTimeout(editHistoryDebounce);
            record();
        } else {
            clearTimeout(editHistoryDebounce);
            editHistoryDebounce = setTimeout(record, 300);
        }
    }

    function performEditorUndo() {
        if (spritePane && spritePane.style.display !== 'none') {
            undoSprite();
            updateFitGuide();
            return;
        }
        const hist = getFileHistory(currentFileKey);
        if (hist.undo.length <= 1) return;
        isPerformingUndoRedo = true;
        clearTimeout(editHistoryDebounce);

        const currentSnap = {
            text: codeTextarea.value,
            selStart: codeTextarea.selectionStart,
            selEnd: codeTextarea.selectionEnd
        };
        hist.redo.push(currentSnap);

        hist.undo.pop();
        const prevSnap = hist.undo[hist.undo.length - 1];
        if (prevSnap) {
            codeTextarea.value = prevSnap.text;
            if (files[currentFileKey]) {
                files[currentFileKey].content = prevSnap.text;
                files[currentFileKey].isDirty = (files[currentFileKey].content !== files[currentFileKey].baselineContent);
            }
            codeTextarea.setSelectionRange(prevSnap.selStart, prevSnap.selEnd);
            updateCodeHighlight();
            if (stickyScrollController) {
                stickyScrollController.updateFile(currentFileKey, prevSnap.text, files[currentFileKey].type);
            }
            syncScroll();
            renderMinimap();
            updateTabsUI();
            updateSidebarUI();
            runDiagnostics(currentFileKey);
        }
        isPerformingUndoRedo = false;
        updateUndoRedoButtons();
    }

    function performEditorRedo() {
        if (spritePane && spritePane.style.display !== 'none') {
            redoSprite();
            updateFitGuide();
            return;
        }
        const hist = getFileHistory(currentFileKey);
        if (hist.redo.length === 0) return;
        isPerformingUndoRedo = true;
        clearTimeout(editHistoryDebounce);

        const nextSnap = hist.redo.pop();
        hist.undo.push(nextSnap);

        codeTextarea.value = nextSnap.text;
        if (files[currentFileKey]) {
            files[currentFileKey].content = nextSnap.text;
            files[currentFileKey].isDirty = (files[currentFileKey].content !== files[currentFileKey].baselineContent);
        }
        codeTextarea.setSelectionRange(nextSnap.selStart, nextSnap.selEnd);
        updateCodeHighlight();
        if (stickyScrollController) {
            stickyScrollController.updateFile(currentFileKey, nextSnap.text, files[currentFileKey].type);
        }
        syncScroll();
        renderMinimap();
        updateTabsUI();
        updateSidebarUI();
        runDiagnostics(currentFileKey);
        isPerformingUndoRedo = false;
        updateUndoRedoButtons();
    }

    const btnEditorUndo = document.getElementById('btn-editor-undo');
    const btnEditorRedo = document.getElementById('btn-editor-redo');
    const btnTopUndo = document.getElementById('btn-top-undo');
    const btnTopRedo = document.getElementById('btn-top-redo');

    function updateUndoRedoButtons() {
        const hist = getFileHistory(currentFileKey);
        const canUndo = hist.undo.length > 1;
        const canRedo = hist.redo.length > 0;

        if (btnEditorUndo) {
            btnEditorUndo.disabled = !canUndo;
            btnEditorUndo.style.opacity = canUndo ? '1' : '0.45';
            btnEditorUndo.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        }
        if (btnEditorRedo) {
            btnEditorRedo.disabled = !canRedo;
            btnEditorRedo.style.opacity = canRedo ? '1' : '0.45';
            btnEditorRedo.style.cursor = canRedo ? 'pointer' : 'not-allowed';
        }

        // 画面上部左上の戻る・進むボタン
        if (btnTopUndo) {
            btnTopUndo.disabled = !canUndo;
            btnTopUndo.classList.toggle('is-disabled', !canUndo);
        }
        if (btnTopRedo) {
            btnTopRedo.disabled = !canRedo;
            btnTopRedo.classList.toggle('is-disabled', !canRedo);
        }
    }

    btnEditorUndo?.addEventListener('click', performEditorUndo);
    btnEditorRedo?.addEventListener('click', performEditorRedo);
    btnTopUndo?.addEventListener('click', performEditorUndo);
    btnTopRedo?.addEventListener('click', performEditorRedo);

    codeTextarea.addEventListener('scroll', syncScroll);

    codeTextarea.addEventListener('input', () => {
        const file = files[currentFileKey];
        if (file && file.editable) {
            file.content = codeTextarea.value;
            file.isDirty = (file.content !== file.baselineContent);
            updateCodeHighlight();
            if (stickyScrollController) {
                stickyScrollController.updateFile(currentFileKey, codeTextarea.value, file.type);
                stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
            }
            updateTabsUI();
            updateSidebarUI();
            updateUnsavedChangesUI();

            // Undo履歴スナップショット記録
            recordHistorySnapshot(currentFileKey, codeTextarea.value, codeTextarea.selectionStart, codeTextarea.selectionEnd);

            // リアルタイム診断 (200ms デバウンス)
            clearTimeout(diagnosticsDebounceTimer);
            diagnosticsDebounceTimer = setTimeout(() => {
                runDiagnostics(currentFileKey);
            }, 200);
        }
    });

    // タブキー対応 (4スペースインデント)
    codeTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeTextarea.selectionStart;
            const end = codeTextarea.selectionEnd;
            const val = codeTextarea.value;
            codeTextarea.value = val.substring(0, start) + '    ' + val.substring(end);
            codeTextarea.selectionStart = codeTextarea.selectionEnd = start + 4;
            codeTextarea.dispatchEvent(new Event('input'));
        } else if (e.key === 'Escape') {
            codeTextarea.blur();
        }
    });

    // ─────────────────────────────────────────────
    // キーボード操作の中継 (エディタ外の操作キーをゲームに転送)
    // ─────────────────────────────────────────────
    const GAME_KEYS = ["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyZ", "Escape"];

    window.addEventListener('keydown', (e) => {
        // 保存 (Ctrl+S / ⌘S)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveAndApplyChanges();
            return;
        }

        // 元に戻す (Ctrl+Z / ⌘Z) & やり直す (Ctrl+Y / ⌘Shift+Z)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                performEditorRedo();
            } else {
                performEditorUndo();
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            performEditorRedo();
            return;
        }

        if (document.activeElement !== codeTextarea) {
            if (GAME_KEYS.includes(e.code)) {
                e.preventDefault();
                try {
                    previewIframe.contentWindow.postMessage({
                        type: 'KEY_EVENT',
                        action: 'down',
                        code: e.code
                    }, '*');
                } catch (err) { }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (document.activeElement !== codeTextarea) {
            if (GAME_KEYS.includes(e.code)) {
                e.preventDefault();
                try {
                    previewIframe.contentWindow.postMessage({
                        type: 'KEY_EVENT',
                        action: 'up',
                        code: e.code
                    }, '*');
                } catch (err) { }
            }
        }
    });

    // ─────────────────────────────────────────────
    // タブ & サイドバー UI & ファイル展開ビュー
    // ─────────────────────────────────────────────
    function getTabIconHtml(key, file) {
        if (key.endsWith('.html')) {
            return '<span class="tab-file-icon icon-html">&lt;/&gt;</span>';
        } else if (key.endsWith('.js')) {
            return '<span class="tab-file-icon icon-js">JS</span>';
        } else if (key.endsWith('.css')) {
            return '<span class="tab-file-icon icon-css">{ }</span>';
        } else if (key.endsWith('.json')) {
            return '<span class="tab-file-icon icon-json">{ }</span>';
        } else if (file && file.isBinary) {
            return '<span class="tab-file-icon icon-img"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm10 9l-3-3-2 2-2-2-2 3h9z"/></svg></span>';
        }
        return '<span class="tab-file-icon">📄</span>';
    }

    function getTabFolderPath(key) {
        if (key.startsWith('editor/')) {
            return '.../trial-admission/editor';
        } else if (key.startsWith('assets/')) {
            return '.../trial-admission/assets';
        } else {
            return '.../trial-admission';
        }
    }

    function updateTabsUI() {
        tabContainer.innerHTML = '';
        openTabs.forEach(key => {
            const file = files[key];
            if (!file) return;

            const hasDiff = !!(file && file.editable && file.content !== file.baselineContent);
            const tab = document.createElement('div');
            tab.className = 'editor-tab' + (key === currentFileKey ? ' active' : '') + (hasDiff ? ' is-dirty' : '');

            // 1. ファイルタイプアイコン (HTML, JS, CSS 等)
            const iconSpan = document.createElement('span');
            iconSpan.innerHTML = getTabIconHtml(key, file);
            tab.appendChild(iconSpan.firstElementChild || iconSpan);

            // 2. ファイル名
            const name = document.createElement('span');
            name.className = 'tab-title';
            name.textContent = file.name;
            tab.appendChild(name);

            // 3. フォルダパス表示 (主張しすぎない控えめなグレー表示)
            const folderPath = document.createElement('span');
            folderPath.className = 'tab-folder-path';
            folderPath.textContent = getTabFolderPath(key);
            tab.appendChild(folderPath);

            // 4. 変更マーク (M)
            const dirtyM = document.createElement('span');
            dirtyM.className = 'tab-dirty-m';
            dirtyM.textContent = 'M';
            dirtyM.title = '未保存の変更があります';
            tab.appendChild(dirtyM);

            // 5. 閉じるボタン (タブが2つ以上の時に表示)
            if (openTabs.length > 1) {
                const closeBtn = document.createElement('span');
                closeBtn.className = 'tab-close-btn';
                closeBtn.innerHTML = '&times;';
                closeBtn.title = 'タブを閉じる';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab(key);
                });
                tab.appendChild(closeBtn);
            }

            tab.addEventListener('click', () => switchToFile(key));
            tabContainer.appendChild(tab);
        });

        updateUnsavedChangesUI();
    }

    function hasAnyUnsavedChanges() {
        for (const k in files) {
            const f = files[k];
            if (f && f.editable && f.content !== f.baselineContent) return true;
        }
        return false;
    }

    function updateUnsavedChangesUI() {
        const isUnsaved = hasAnyUnsavedChanges();
        const currentFile = files[currentFileKey];
        const canSaveCurrent = !!(currentFile && currentFile.editable);
        const unsavedPill = document.getElementById('unsaved-status-pill');
        const btnSave = document.getElementById('btn-save');

        // 保存できない場合（現在開いているファイルが閲覧専用など）は「保存して反映」を色付きにしない
        const shouldHighlightSave = isUnsaved && canSaveCurrent;

        if (unsavedPill) {
            // 保存可能な未保存ファイルを開いている時のみ表示
            unsavedPill.style.display = shouldHighlightSave ? 'inline-flex' : 'none';
        }
        if (btnSave) {
            btnSave.classList.toggle('has-unsaved', shouldHighlightSave);
        }
        updateSaveButtonState();
    }

    function updateSaveButtonState() {
        const btnSave = document.getElementById('btn-save');
        if (!btnSave) return;
        const btnSaveText = document.getElementById('btn-save-text');

        let hasError = false;
        if (typeof fileErrorCountMap === 'object' && Object.keys(fileErrorCountMap).length > 0) {
            hasError = Object.values(fileErrorCountMap).some(count => count > 0);
        } else if (window.Linter && files) {
            for (const k in files) {
                const f = files[k];
                if (!f || f.editable === false || f.isBinary || f.type === 'xml' || f.type === 'text') continue;
                const changedLines = window.Linter.computeChangedLines(f.baselineContent || '', f.content);
                const issues = window.Linter.lint(k, f.content, {
                    baselineCode: f.baselineContent,
                    changedLines: changedLines,
                    allFiles: files
                });
                if ((issues || []).some(i => i.severity === 'error')) {
                    hasError = true;
                    break;
                }
            }
        }

        if (hasError) {
            btnSave.classList.add('has-error');
            if (btnSaveText) btnSaveText.textContent = '無理やり保存して反映';
            btnSave.title = '構文エラーがありますが、無理やり保存してゲームに反映します (⌘S)';
        } else {
            btnSave.classList.remove('has-error');
            if (btnSaveText) btnSaveText.textContent = '保存して反映';
            btnSave.title = 'コードを保存してゲームに反映 (⌘S / Ctrl+S)';
        }
    }



    function closeTab(key) {
        const idx = openTabs.indexOf(key);
        if (idx === -1) return;
        openTabs.splice(idx, 1);
        if (currentFileKey === key) {
            const nextKey = openTabs[Math.max(0, idx - 1)] || openTabs[0];
            if (nextKey) switchToFile(nextKey);
        } else {
            updateTabsUI();
        }
    }

    function updateSidebarUI() {
        document.querySelectorAll('.file-item[data-path]').forEach(item => {
            const path = item.getAttribute('data-path');
            const file = files[path];
            if (path === currentFileKey) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
            // 実際の差分があるファイルのみハイライト
            const hasDiff = !!(file && file.editable && file.content !== file.baselineContent);
            item.classList.toggle('is-dirty', hasDiff);
        });
    }

    function switchToFile(key) {
        if (!files[key]) return;
        currentFileKey = key;
        if (!openTabs.includes(key)) {
            openTabs.push(key);
        }
        showCodeEditorPane();

        // システムファイル警告バナーの制御 (editor/ 配下の内部ファイルを開いた時のみ表示)
        const systemFileBannerContainer = document.getElementById('system-file-banner-container');
        const systemBannerText = document.getElementById('system-banner-text');
        if (systemFileBannerContainer) {
            const isEditorFile = key.startsWith('editor/');
            systemFileBannerContainer.style.display = isEditorFile ? 'block' : 'none';
            if (isEditorFile && systemBannerText) {
                if (key === 'editor/index.html') {
                    systemBannerText.innerHTML = 'エディタ本体の内部設定ファイルです。ゲーム画面の変更は <button type="button" class="banner-link-btn" id="banner-btn-goto-game-html">こっちの index.html</button> を編集してください。';
                } else {
                    systemBannerText.textContent = 'エディタ本体の内部設定ファイルです。変更はできません。';
                }
            }
        }

        const file = files[key];
        if (file.isBinary || file.type === 'image') {
            renderImageViewer(key);
        } else {
            hideImageViewer();
            renderEditor();
        }
    }

    // 画像ビューアの展開描画
    function renderImageViewer(key) {
        const file = files[key];
        if (!file) return;

        if (editorBodyContainer) editorBodyContainer.style.display = 'none';
        if (diagnosticsBar) diagnosticsBar.style.display = 'none';
        if (diagnosticsPanel) diagnosticsPanel.style.display = 'none';
        if (imageViewerPane) imageViewerPane.style.display = 'flex';

        if (imageViewerPath) imageViewerPath.textContent = key;
        if (imageViewerDims) imageViewerDims.textContent = '読み込み中...';
        if (imageViewerImg) {
            imageViewerImg.src = file.path + '?t=' + Date.now();
            imageViewerImg.onload = function () {
                if (imageViewerDims) {
                    imageViewerDims.textContent = `${this.naturalWidth} × ${this.naturalHeight} px`;
                }
            };
        }

        if (imageViewerGuide) {
            const bgKey = file.bgKey || 'space-bg';
            imageViewerGuide.innerHTML = `<code>config.js</code> の <code>display.background</code> に <code>"${bgKey}"</code> と記述することで、ゲーム画面の宇宙背景を差し替えることができます。`;
        }

        if (btnSave) btnSave.style.display = 'none';

        updateTabsUI();
        updateSidebarUI();
    }

    function hideImageViewer() {
        if (imageViewerPane) imageViewerPane.style.display = 'none';
        if (editorBodyContainer) editorBodyContainer.style.display = 'flex';
        if (diagnosticsBar) diagnosticsBar.style.display = 'flex';
        if (btnSave) btnSave.style.display = '';
    }

    // 画像ビューアのアクションイベント
    btnCopyImagePath?.addEventListener('click', () => {
        const path = currentFileKey || 'assets/space-bg.jpg';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(path).then(() => {
                showToast(`パスをコピーしました: ${path}`);
            }).catch(() => {
                showToast(`パス: ${path}`);
            });
        } else {
            showToast(`パス: ${path}`);
        }
    });

    // フォルダ開閉トグル（VS Codeツリーシェブロン回転連動）
    document.querySelectorAll('.tree-folder-group > .tree-item-row').forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            const group = header.parentElement;
            if (group && group.classList.contains('tree-folder-group')) {
                const isOpen = group.classList.toggle('is-open');
                header.classList.toggle('is-open', isOpen);
                header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                const chevron = header.querySelector('.tree-chevron');
                if (chevron) {
                    chevron.classList.toggle('closed', !isOpen);
                }
            }
        });
    });

    // サイドバーのファイルクリック
    document.querySelectorAll('.file-item[data-path]').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.getAttribute('data-path');
            if (path && files[path]) switchToFile(path);
        });
    });

    // ─────────────────────────────────────────────
    // ペイン表示切り替え (コードエディタ ⇔ ドット絵エディタ)
    // ─────────────────────────────────────────────
    const editorPane = document.getElementById('editor-pane');
    const spritePane = document.getElementById('sprite-pane');
    const btnOpenSpriteEditor = document.getElementById('btn-open-sprite-editor');
    const btnTreeOpenSprite = document.getElementById('btn-tree-open-sprite');

    function showCodeEditorPane() {
        document.body.classList.remove('is-sprite-editor');
        if (editorPane) editorPane.style.display = 'flex';
        if (spritePane) spritePane.style.display = 'none';
        if (btnOpenSpriteEditor) btnOpenSpriteEditor.classList.remove('active');
        if (btnTreeOpenSprite) btnTreeOpenSprite.classList.remove('active');
        if (files[currentFileKey]?.isBinary) {
            renderImageViewer(currentFileKey);
        } else {
            hideImageViewer();
            if (btnSave) btnSave.style.display = '';
        }
        updateSidebarUI();
    }

    function showSpriteEditorPane() {
        document.body.classList.add('is-sprite-editor');
        if (editorPane) editorPane.style.display = 'none';
        if (spritePane) spritePane.style.display = 'flex';
        document.querySelectorAll('.file-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.editor-tab').forEach(tab => tab.classList.remove('active'));
        if (btnOpenSpriteEditor) btnOpenSpriteEditor.classList.add('active');
        if (btnTreeOpenSprite) btnTreeOpenSprite.classList.add('active');
        if (btnSave) btnSave.style.display = 'none';
        loadSpriteFromConfig();
        renderSpriteGrid();
    }

    btnOpenSpriteEditor?.addEventListener('click', showSpriteEditorPane);
    btnTreeOpenSprite?.addEventListener('click', showSpriteEditorPane);

    // ─────────────────────────────────────────────
    // サウンド切り替え
    // ─────────────────────────────────────────────
    function updateSoundUI() {
        if (isMuted) {
            btnSoundToggle.className = 'action-btn sound-toggle-btn muted';
            soundText.textContent = '消音中';
        } else {
            btnSoundToggle.className = 'action-btn sound-toggle-btn active';
            soundText.textContent = '音声ON';
        }
    }

    function toggleSound() {
        isMuted = !isMuted;
        updateSoundUI();
        try {
            previewIframe.contentWindow.postMessage({
                type: 'SET_SOUND',
                enabled: !isMuted
            }, '*');
        } catch (e) { }
        showToast(isMuted ? '音声をミュートしました' : '音声をONにしました');
    }

    btnSoundToggle?.addEventListener('click', toggleSound);

    // ─────────────────────────────────────────────
    // 表示倍率 & ドラッグリサイズ
    // ─────────────────────────────────────────────
    function applyScale() {
        const scale = SCALE_PRESETS[currentScaleIndex];
        try { localStorage.setItem('invader_editor_scale', String(currentScaleIndex)); } catch (e) { }
        scaleIndicator.textContent = Math.round(scale * 100) + '%';
        previewIframe.style.transform = `scale(${scale})`;
        previewIframe.style.transformOrigin = 'center center';
    }

    btnScaleDown?.addEventListener('click', () => {
        if (currentScaleIndex > 0) {
            currentScaleIndex--;
            applyScale();
        }
    });

    btnScaleUp?.addEventListener('click', () => {
        if (currentScaleIndex < SCALE_PRESETS.length - 1) {
            currentScaleIndex++;
            applyScale();
        }
    });

    // ドラッグ式リサイザー
    let isDragging = false;
    paneResizer?.addEventListener('mousedown', (e) => {
        isDragging = true;
        paneResizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        previewIframe.style.pointerEvents = 'none';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const containerRect = document.querySelector('.studio-workspace').getBoundingClientRect();
        const newPreviewWidth = containerRect.right - e.clientX;
        // コードエリアを常に広々（最低450px以上）確保
        const maxAllowedPreview = Math.max(280, containerRect.width - 450);
        const clampedWidth = Math.max(270, Math.min(maxAllowedPreview, newPreviewWidth));
        previewPane.style.width = clampedWidth + 'px';
        try { localStorage.setItem('invader_editor_pane_width', String(Math.round(clampedWidth))); } catch (e) { }
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            paneResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            previewIframe.style.pointerEvents = 'auto';
        }
    });

    // ─────────────────────────────────────────────
    // プレビュー合成 & 保存
    // ─────────────────────────────────────────────
    let toastTimeout = null;
    function showToast(msg, isError) {
        if (!toast || !toastMsg) return;
        clearTimeout(toastTimeout);
        const actions = document.getElementById('ide-toast-actions');
        if (actions) {
            actions.style.display = 'none';
            actions.innerHTML = '';
        }
        toast.classList.remove('has-actions');
        toastMsg.textContent = msg;
        if (isError) {
            toast.classList.add('toast-error');
        } else {
            toast.classList.remove('toast-error');
        }
        toast.classList.add('show');
        toastTimeout = setTimeout(() => toast.classList.remove('show'), isError ? 3500 : 2500);
    }

    function showToastConfirm(question, onConfirm, actionLabel = '壊す', isBreak = true) {
        if (!toast || !toastMsg) return;
        clearTimeout(toastTimeout);
        toastMsg.textContent = question;
        toast.classList.remove('toast-error');
        toast.classList.add('has-actions');

        let actions = document.getElementById('ide-toast-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.id = 'ide-toast-actions';
            actions.className = 'toast-actions';
            toast.appendChild(actions);
        }
        const btnClass = isBreak ? 'toast-btn-break' : 'toast-btn-restore';
        actions.innerHTML = `
            <button type="button" class="toast-btn ${btnClass}" id="toast-btn-confirm">${actionLabel}</button>
            <button type="button" class="toast-btn toast-btn-cancel" id="toast-btn-cancel">キャンセル</button>
        `;
        actions.style.display = 'inline-flex';

        const btnConfirm = actions.querySelector('#toast-btn-confirm');
        const btnCancel = actions.querySelector('#toast-btn-cancel');

        function cleanup() {
            actions.style.display = 'none';
            actions.innerHTML = '';
            toast.classList.remove('has-actions');
        }

        btnConfirm.onclick = (e) => {
            e.stopPropagation();
            cleanup();
            toast.classList.remove('show');
            onConfirm();
        };

        btnCancel.onclick = (e) => {
            e.stopPropagation();
            cleanup();
            toast.classList.remove('show');
        };

        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            cleanup();
            toast.classList.remove('show');
        }, 8000);
    }

    function buildCompositeHtml() {
        let html = files['index.html'].content || '';
        const css = files['style.css'].content || '';
        const config = files['config.js'].content || '';
        const core = files['core.js'].content || '';

        // 相対パスのベースを上位階層に設定（assetsなどを正しく読み込む）
        if (!html.includes('<base')) {
            html = html.replace('<head>', '<head><base href="../">');
        }

        // style.css の差し替え (?v=... クエリパラメータ付きにも対応)
        const cssLinkRegex = /<link\s+[^>]*href=["']style\.css(?:\?[^"']*)?["'][^>]*>/i;
        if (cssLinkRegex.test(html)) {
            html = html.replace(cssLinkRegex, () => `<style>${css}</style>`);
        } else {
            html = html.replace('</head>', () => `<style>${css}</style></head>`);
        }

        // config.js と core.js の差し替え ($記号の特殊展開を防ぐため関数で返す)
        const configScriptRegex = /<script\s+[^>]*src=["']config\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/i;
        if (configScriptRegex.test(html)) {
            html = html.replace(configScriptRegex, () => `<script>${config}<\/script>`);
        }
        const coreScriptRegex = /<script\s+[^>]*src=["']core\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/i;
        if (coreScriptRegex.test(html)) {
            html = html.replace(coreScriptRegex, () => `<script>${core}<\/script>`);
        }

        return html;
    }

    // ─────────────────────────────────────────────
    // 親タブのタイトル＆ファビコンを index.html に自動同期
    // ─────────────────────────────────────────────
    function syncParentTabMetaFromIndexHtml() {
        if (!files['index.html']) return;
        const html = files['index.html'].content || '';

        // 1. タブタイトルの自動同期 (例: KAITOのインベーダー)
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            const rawTitle = titleMatch[1].trim();
            if (rawTitle) {
                document.title = rawTitle;
            }
        }

        // 2. タブファビコンの自動同期 (例: assets/squid.png -> ../assets/squid.png)
        const iconMatch = html.match(/<link\s+[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["'][^>]*>/i);
        if (iconMatch && iconMatch[1]) {
            let iconPath = iconMatch[1].trim();
            if (!iconPath.startsWith('http') && !iconPath.startsWith('/') && !iconPath.startsWith('../')) {
                iconPath = '../' + iconPath;
            }
            let link = document.querySelector("link[rel*='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                link.type = 'image/png';
                document.head.appendChild(link);
            }
            link.href = iconPath;
        }
    }

    function updatePreview() {
        const fullHtml = buildCompositeHtml();
        previewIframe.srcdoc = fullHtml;
        syncParentTabMetaFromIndexHtml();
    }

    function saveAndApplyChanges() {
        if (!files[currentFileKey]?.editable && currentFileKey.startsWith('editor/')) {
            showToast('このファイルは閲覧専用のため変更できません', true);
            return;
        }
        // editor/linter.js が編集されていた場合は動的に再評価
        if (files['editor/linter.js'] && files['editor/linter.js'].isDirty) {
            try {
                new Function(files['editor/linter.js'].content)();
            } catch (e) {
                console.warn('Linterの再評価に失敗:', e);
            }
        }

        // 全ファイルの構文エラー数を集計（エラーがあってもブロックせず無理やり保存・反映する）
        let totalErrors = 0;
        if (window.Linter) {
            for (const k in files) {
                const f = files[k];
                if (!f || f.editable === false || f.isBinary || f.type === 'xml' || f.type === 'text') continue;
                const changedLines = window.Linter.computeChangedLines(f.baselineContent || '', f.content);
                const issues = window.Linter.lint(k, f.content, {
                    baselineCode: f.baselineContent,
                    changedLines: changedLines,
                    allFiles: files
                });
                const errCount = (issues || []).filter(i => i.severity === 'error').length;
                totalErrors += errCount;
            }
        }

        // config.js のみの変更なら即時リロードを試みる
        const otherCodeDirty = ['style.css', 'core.js', 'index.html', 'editor/linter.js'].some(k => files[k] && files[k].isDirty);
        const onlyConfigDirty = files['config.js'] && files['config.js'].isDirty && !otherCodeDirty;

        for (let k in files) {
            if (files[k] && !files[k].isBinary) {
                files[k].baselineContent = files[k].content;
            }
            files[k].isDirty = false;
        }
        if (!files[currentFileKey]?.isBinary) {
            runDiagnostics(currentFileKey);
        }
        updateTabsUI();
        updateAllFilesDiagnostics();

        if (onlyConfigDirty && totalErrors === 0) {
            try {
                const win = previewIframe.contentWindow;
                if (win && typeof win.reloadGameWithNewConfig === 'function') {
                    const configCode = files['config.js'].content;
                    const fn = new Function(configCode + '; return typeof GameConfig !== "undefined" ? GameConfig : window.GameConfig;');
                    const newConfig = fn();
                    if (newConfig && newConfig.display) {
                        newConfig.display.sound = !isMuted;
                    }
                    if (newConfig) {
                        win.reloadGameWithNewConfig(newConfig);
                        showToast('保存しました（ゲームに即時反映）');
                        return;
                    }
                }
            } catch (e) {
                console.warn('即時リロードに失敗したためプレビュー全体を更新します:', e);
            }
        }

        updatePreview();
        if (totalErrors > 0) {
            showToast('無理やり保存して反映しました');
        } else {
            showToast('保存しました（プレビュー更新）');
        }
    }

    // ─────────────────────────────────────────────
    // ドット絵エディタ
    // ─────────────────────────────────────────────
    const DEFAULT_SPRITES = {
        player: [
            "0000001000000",
            "0000011100000",
            "0000011100000",
            "0111111111110",
            "1111111111111",
            "1111111111111",
            "1111111111111",
            "1111111111111"
        ],
        squid: [
            "00011000",
            "00111100",
            "01111110",
            "11011011",
            "11111111",
            "00100100",
            "01011010",
            "10100101"
        ],
        crab: [
            "00100000100",
            "00010001000",
            "00111111100",
            "01101110110",
            "11111111111",
            "10111111101",
            "10100000101",
            "00011011000"
        ],
        octopus: [
            "000011110000",
            "011111111110",
            "111111111111",
            "111001100111",
            "111111111111",
            "000110011000",
            "001101101100",
            "110000000011"
        ],
        ufo: [
            "0000011111100000",
            "0001111111111000",
            "0011111111111100",
            "0110110110110110",
            "1111111111111111",
            "0001110001110000",
            "0000100000100000"
        ]
    };

    const WALKING_SPRITES = ['squid', 'crab', 'octopus'];
    const HISTORY_LIMIT = 30;

    let currentSpriteKey = 'player';
    let spriteGridData = [];     // [行][列] 0 or 1
    let spriteUndoStack = [];
    let spriteRedoStack = [];
    let isDrawingPixel = false;
    let drawMode = 1;            // 1: 塗る, 0: 消す
    let previewFrame = 0;
    let playerMuzzle = { col: 6, row: 0 }; // 弾の発射口位置 (1x1マス)
    let isDraggingMuzzle = false;         // 発射口ドラッグ中フラグ

    const spriteSelect = document.getElementById('sprite-select');
    const spriteGrid = document.getElementById('sprite-grid');
    const spriteSymmetry = document.getElementById('sprite-symmetry');
    const spriteMiniCanvas = document.getElementById('sprite-mini-canvas');
    const spriteSizeInfo = document.getElementById('sprite-size-info');
    const btnSpriteClear = document.getElementById('btn-sprite-clear');
    const btnSpriteReset = document.getElementById('btn-sprite-reset');
    const btnSpriteApply = document.getElementById('btn-sprite-apply');
    const btnSpriteUndo = document.getElementById('btn-sprite-undo');
    const btnSpriteRedo = document.getElementById('btn-sprite-redo');
    const btnSideApply = document.getElementById('btn-side-apply');
    const spriteFitBadge = document.getElementById('sprite-fit-badge');

    // サイズ自由変更コントロール DOM要素
    const colCountDisp = document.getElementById('col-count-disp');
    const rowCountDisp = document.getElementById('row-count-disp');
    const btnColDec = document.getElementById('btn-col-dec');
    const btnColInc = document.getElementById('btn-col-inc');
    const btnRowDec = document.getElementById('btn-row-dec');
    const btnRowInc = document.getElementById('btn-row-inc');
    const spriteFitHint = document.getElementById('sprite-fit-hint');

    const MIN_COLS = 6;
    const MAX_COLS = 24;
    const MIN_ROWS = 4;
    const MAX_ROWS = 20;

    // ドット絵キャンバスのスマートリサイズ (絵の幾何中心を新枠の中心へ自動吸着させてズレを完全解消)
    function resizeSpriteGrid(newCols, newRows) {
        newCols = Math.max(MIN_COLS, Math.min(MAX_COLS, newCols));
        newRows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, newRows));

        const oldRows = spriteGridData.length;
        const oldCols = spriteGridData[0] ? spriteGridData[0].length : 0;
        if (oldRows === newRows && oldCols === newCols) return;

        pushHistory();

        // 描画されているドットたちのバウンディングボックスを検出
        let minC = Infinity, maxC = -Infinity;
        let minR = Infinity, maxR = -Infinity;
        let hasPixel = false;
        for (let r = 0; r < oldRows; r++) {
            for (let c = 0; c < oldCols; c++) {
                if (spriteGridData[r][c] === 1) {
                    hasPixel = true;
                    if (c < minC) minC = c;
                    if (c > maxC) maxC = c;
                    if (r < minR) minR = r;
                    if (r > maxR) maxR = r;
                }
            }
        }

        let shiftC = 0;
        let shiftR = 0;

        if (hasPixel) {
            // 水平方向：絵の中心列を新グリッドの中心列にピタリと合わせる！
            const contentCenterC = (minC + maxC) / 2;
            const newGridCenterC = (newCols - 1) / 2;
            shiftC = Math.round(newGridCenterC - contentCenterC);

            // はみ出し防止のクランプ
            if (minC + shiftC < 0) shiftC = -minC;
            if (maxC + shiftC >= newCols) shiftC = (newCols - 1) - maxC;

            // 垂直方向：自機(player)は地面への接地（下部揃え）を保つ。敵などは上下中央
            if (currentSpriteKey === 'player') {
                const bottomPad = Math.max(0, (oldRows - 1) - maxR);
                shiftR = (newRows - 1) - maxR - Math.min(bottomPad, Math.max(0, newRows - (maxR - minR + 1)));
            } else {
                const contentCenterR = (minR + maxR) / 2;
                const newGridCenterR = (newRows - 1) / 2;
                shiftR = Math.round(newGridCenterR - contentCenterR);
            }
            if (minR + shiftR < 0) shiftR = -minR;
            if (maxR + shiftR >= newRows) shiftR = (newRows - 1) - maxR;
        } else {
            shiftC = Math.floor((newCols - oldCols) / 2);
            shiftR = Math.floor((newRows - oldRows) / 2);
        }

        const newGrid = [];
        for (let r = 0; r < newRows; r++) {
            const row = [];
            for (let c = 0; c < newCols; c++) {
                const origR = r - shiftR;
                const origC = c - shiftC;
                if (origR >= 0 && origR < oldRows && origC >= 0 && origC < oldCols) {
                    row.push(spriteGridData[origR][origC]);
                } else {
                    row.push(0);
                }
            }
            newGrid.push(row);
        }

        spriteGridData = newGrid;

        // 自機の弾発射口(muzzle)も絵の移動に合わせて追従！
        if (playerMuzzle && currentSpriteKey === 'player') {
            playerMuzzle.col = Math.max(0, Math.min(newCols - 1, playerMuzzle.col + shiftC));
            playerMuzzle.row = Math.max(0, Math.min(newRows - 1, playerMuzzle.row + shiftR));
        }

        renderSpriteGrid();
    }

    // ── 絵の手動中央揃え (センター) ──
    function centerContent() {
        const rows = spriteGridData.length;
        const cols = spriteGridData[0] ? spriteGridData[0].length : 0;
        if (rows === 0 || cols === 0) return;

        let minC = Infinity, maxC = -Infinity;
        let hasPixel = false;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (spriteGridData[r][c] === 1) {
                    hasPixel = true;
                    if (c < minC) minC = c;
                    if (c > maxC) maxC = c;
                }
            }
        }
        if (!hasPixel) {
            showToast('絵が描かれていません');
            return;
        }

        const contentCenterC = (minC + maxC) / 2;
        const gridCenterC = (cols - 1) / 2;
        const shiftC = Math.round(gridCenterC - contentCenterC);

        if (shiftC !== 0) {
            shiftSprite(shiftC, 0);
            showToast('中央に整列しました');
        } else {
            showToast('既に中央に整列されています');
        }
    }

    // ── 絵全体のシフト移動 (◀ ▲ ▼ ▶) ──
    function shiftSprite(dc, dr) {
        const rows = spriteGridData.length;
        const cols = spriteGridData[0] ? spriteGridData[0].length : 0;
        if (rows === 0 || cols === 0) return;

        pushHistory();
        const next = Array.from({ length: rows }, () => Array(cols).fill(0));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const tr = r + dr;
                const tc = c + dc;
                if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) {
                    next[tr][tc] = spriteGridData[r][c];
                }
            }
        }
        spriteGridData = next;

        // 自機なら発射口も連動移動
        if (playerMuzzle && currentSpriteKey === 'player') {
            playerMuzzle.col = Math.max(0, Math.min(cols - 1, playerMuzzle.col + dc));
            playerMuzzle.row = Math.max(0, Math.min(rows - 1, playerMuzzle.row + dr));
        }

        renderSpriteGrid();
    }

    // サイズコントロールの初期化・DOMバインド
    function ensureSpriteSizeControls() {
        // イベントバインドの再接続
        const cDec = document.getElementById('btn-col-dec');
        const cInc = document.getElementById('btn-col-inc');
        const rDec = document.getElementById('btn-row-dec');
        const rInc = document.getElementById('btn-row-inc');

        if (cDec && !cDec._bound) {
            cDec._bound = true;
            cDec.addEventListener('click', () => {
                if (spriteGridData.length === 0) return;
                resizeSpriteGrid(spriteGridData[0].length - 1, spriteGridData.length);
            });
        }
        if (cInc && !cInc._bound) {
            cInc._bound = true;
            cInc.addEventListener('click', () => {
                if (spriteGridData.length === 0) return;
                resizeSpriteGrid(spriteGridData[0].length + 1, spriteGridData.length);
            });
        }
        if (rDec && !rDec._bound) {
            rDec._bound = true;
            rDec.addEventListener('click', () => {
                if (spriteGridData.length === 0) return;
                resizeSpriteGrid(spriteGridData[0].length, spriteGridData.length - 1);
            });
        }
        if (rInc && !rInc._bound) {
            rInc._bound = true;
            rInc.addEventListener('click', () => {
                if (spriteGridData.length === 0) return;
                resizeSpriteGrid(spriteGridData[0].length, spriteGridData.length + 1);
            });
        }

        document.querySelectorAll('.preset-chip').forEach(chip => {
            if (!chip._bound) {
                chip._bound = true;
                chip.addEventListener('click', () => {
                    const c = parseInt(chip.getAttribute('data-cols'), 10);
                    const r = parseInt(chip.getAttribute('data-rows'), 10);
                    if (!isNaN(c) && !isNaN(r)) {
                        resizeSpriteGrid(c, r);
                    }
                });
            }
        });
    }

    // スプライトのバリデーションチェック
    // 1. 全体で10ブロック以上使用すること
    // 2. 自機の場合、発射口の下は必ず1マス配置すること
    function validateCurrentSprite() {
        if (!spriteGridData || spriteGridData.length === 0) {
            return { ok: false, reason: 'スプライトデータがありません', blockCount: 0 };
        }
        const rows = spriteGridData.length;
        const cols = spriteGridData[0].length;
        let blockCount = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (spriteGridData[r][c] === 1) blockCount++;
            }
        }

        // 条件1: 全体で10ブロック以上
        if (blockCount < 10) {
            return {
                ok: false,
                reason: `10ブロック以上必要です (現在: ${blockCount}マス)`,
                blockCount
            };
        }

        // 条件2: 自機の場合、発射口のあるX軸(列)またはY軸(行)のどちらかに1マス以上のブロックがあること
        if (currentSpriteKey === 'player') {
            const mCol = playerMuzzle ? playerMuzzle.col : Math.floor((cols - 1) / 2);
            const mRow = playerMuzzle ? playerMuzzle.row : 0;

            // X軸上 (同じ列) にブロックが1つ以上あるか
            let hasBlockOnX = false;
            for (let r = 0; r < rows; r++) {
                if (spriteGridData[r][mCol] === 1) {
                    hasBlockOnX = true;
                    break;
                }
            }

            // Y軸上 (同じ行) にブロックが1つ以上あるか
            let hasBlockOnY = false;
            for (let c = 0; c < cols; c++) {
                if (spriteGridData[mRow][c] === 1) {
                    hasBlockOnY = true;
                    break;
                }
            }

            if (!hasBlockOnX && !hasBlockOnY) {
                return {
                    ok: false,
                    reason: '発射口の縦軸・横軸のいずれかにブロックを配置してください',
                    blockCount
                };
            }
        }

        return {
            ok: true,
            reason: '配置OK',
            blockCount
        };
    }

    function updateFitGuide(cols, rows) {
        if (!cols || !rows) {
            rows = spriteGridData.length;
            cols = spriteGridData[0] ? spriteGridData[0].length : 0;
        }

        const val = validateCurrentSprite();

        if (spriteFitBadge) {
            if (val.ok) {
                spriteFitBadge.className = 'fit-status-badge';
                spriteFitBadge.textContent = '配置OK';
            } else {
                spriteFitBadge.className = 'fit-status-badge error';
                spriteFitBadge.textContent = '配置NG';
            }
        }

        if (spriteFitHint) {
            if (val.ok) {
                spriteFitHint.className = 'fit-hint-text';
                const charName = currentSpriteKey === 'player' ? '自機' : (currentSpriteKey === 'ufo' ? 'UFO' : '敵');
                spriteFitHint.textContent = `${charName}: ${cols}×${rows} (${val.blockCount}マス)`;
            } else {
                spriteFitHint.className = 'fit-hint-text error';
                spriteFitHint.textContent = val.reason;
            }
        }

        if (btnSideApply) {
            btnSideApply.disabled = !val.ok;
            btnSideApply.title = val.ok ? 'config.jsとゲームに反映します' : val.reason;
        }

        if (btnSpriteApply) {
            btnSpriteApply.disabled = !val.ok;
        }

        document.querySelectorAll('.preset-chip').forEach(chip => {
            const c = parseInt(chip.getAttribute('data-cols'), 10);
            const r = parseInt(chip.getAttribute('data-rows'), 10);
            chip.classList.toggle('active', c === cols && r === rows);
        });

        return val;
    }

    // config.js のテキストから設定オブジェクトを取り出す (失敗時は null)
    function readConfigObject() {
        try {
            const code = files['config.js'].content;
            return new Function(code + '; return GameConfig;')();
        } catch (e) {
            return null;
        }
    }

    // キャラクターごとの表示色を config.js から取得
    function getSpriteColor(key) {
        const cfg = readConfigObject();
        if (!cfg) return '#00FF66';
        const enemyColors = (cfg.enemy && cfg.enemy.colors) || [];
        switch (key) {
            case 'player': return (cfg.player && cfg.player.color) || '#00FF66';
            case 'squid': return enemyColors[0] || '#FFFF00';
            case 'crab': return enemyColors[1] || '#00FFFF';
            case 'octopus': return enemyColors[3] || enemyColors[enemyColors.length - 1] || '#FF3399';
            case 'ufo': return (cfg.ufo && cfg.ufo.color) || '#FF0033';
            default: return '#00FF66';
        }
    }

    function gridToStrings(grid) {
        return grid.map(row => row.join(''));
    }

    function stringsToGrid(lines) {
        return lines.map(row => row.split('').map(ch => ch === '1' ? 1 : 0));
    }

    function cloneGrid(grid) {
        return grid.map(row => row.slice());
    }

    function loadSpriteFromConfig() {
        const cfg = readConfigObject();
        let lines = null;
        const custom = cfg && cfg.sprites ? cfg.sprites[currentSpriteKey] : null;
        if (Array.isArray(custom) && custom.length > 0) {
            lines = Array.isArray(custom[0]) ? custom[0] : custom;
        }
        // 空、またはブロック数が10マス未満の場合は初期配置(DEFAULT_SPRITES)を使用
        const totalPixels = lines ? lines.reduce((acc, row) => acc + (row.match(/1/g) || []).length, 0) : 0;
        if (!lines || totalPixels < 10) {
            lines = DEFAULT_SPRITES[currentSpriteKey] || DEFAULT_SPRITES.player;
        }
        spriteGridData = stringsToGrid(lines);

        // 自機ならマズル座標も config から読み込み
        if (currentSpriteKey === 'player') {
            const cols = spriteGridData[0] ? spriteGridData[0].length : 13;
            const rows = spriteGridData.length;
            if (cfg && cfg.player && cfg.player.muzzle && typeof cfg.player.muzzle.col === 'number') {
                playerMuzzle = {
                    col: Math.max(0, Math.min(cols - 1, cfg.player.muzzle.col)),
                    row: Math.max(0, Math.min(rows - 1, cfg.player.muzzle.row))
                };
            } else {
                playerMuzzle = { col: Math.floor((cols - 1) / 2), row: 0 };
            }
        }

        spriteUndoStack = [];
        spriteRedoStack = [];
        updateHistoryButtons();
    }

    // ── リアルタイム・スプライト配信（編集中の勝手な即時反映を防止） ──
    function broadcastLiveSprite(key = currentSpriteKey, grid = spriteGridData) {
        // ドット絵編集中の未確定スプライトはゲーム画面へ送信しない（「反映する」ボタン押下時に保存・反映される）
        return;
    }

    function syncSpriteToConfigFile(key = currentSpriteKey, grid = spriteGridData) {
        if (!grid || grid.length === 0 || !files['config.js']) return;

        const rowsText = gridToStrings(grid).map(row => `            "${row}"`).join(',\n');
        const formattedCode = '[\n' + rowsText + '\n        ]';
        const configCode = files['config.js'].content;
        const regex = new RegExp(`(\\b${key}:\\s*)\\[[\\s\\S]*?\\]`);

        if (regex.test(configCode)) {
            files['config.js'].content = configCode.replace(regex, (m, head) => head + formattedCode);
            files['config.js'].isDirty = true;
            if (currentFileKey === 'config.js' && !isDrawingPixel) {
                codeTextarea.value = files['config.js'].content;
                updateCodeHighlight();
                if (stickyScrollController) {
                    stickyScrollController.updateFile('config.js', files['config.js'].content, 'js');
                    stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
                }
            }
        }
    }

    // 弾の発射口(1x1マス)を config.js に同期
    function syncMuzzleToConfigFile() {
        if (!files['config.js'] || !playerMuzzle) return;
        let cfgCode = files['config.js'].content;
        const muzzleStr = `muzzle: { col: ${playerMuzzle.col}, row: ${playerMuzzle.row} }`;
        const muzzleRegex = /muzzle:\s*\{[^\}]*\}/;
        if (muzzleRegex.test(cfgCode)) {
            cfgCode = cfgCode.replace(muzzleRegex, muzzleStr);
        } else {
            const playerBlockRegex = /(\bplayer:\s*\{[\s\S]*?)(fireInterval:[^\n,]+)(,?)/;
            if (playerBlockRegex.test(cfgCode)) {
                cfgCode = cfgCode.replace(playerBlockRegex, `$1$2,\n        ${muzzleStr}`);
            }
        }
        files['config.js'].content = cfgCode;
        files['config.js'].isDirty = true;
        if (currentFileKey === 'config.js' && !isDrawingPixel) {
            codeTextarea.value = files['config.js'].content;
            updateCodeHighlight();
            if (stickyScrollController) {
                stickyScrollController.updateFile('config.js', files['config.js'].content, 'js');
                stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
            }
        }
    }

    // ── 履歴 (元に戻す / やり直す) ──
    function pushHistory() {
        spriteUndoStack.push(cloneGrid(spriteGridData));
        if (spriteUndoStack.length > HISTORY_LIMIT) spriteUndoStack.shift();
        spriteRedoStack = [];
        updateHistoryButtons();
    }

    function undoSprite() {
        if (spriteUndoStack.length === 0) return;
        spriteRedoStack.push(cloneGrid(spriteGridData));
        spriteGridData = spriteUndoStack.pop();
        renderSpriteGrid();
        updateHistoryButtons();
    }

    function redoSprite() {
        if (spriteRedoStack.length === 0) return;
        spriteUndoStack.push(cloneGrid(spriteGridData));
        spriteGridData = spriteRedoStack.pop();
        renderSpriteGrid();
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        if (btnSpriteUndo) btnSpriteUndo.disabled = spriteUndoStack.length === 0;
        if (btnSpriteRedo) btnSpriteRedo.disabled = spriteRedoStack.length === 0;
    }

    // ── グリッド描画 ──
    function renderSpriteGrid() {
        if (!spriteGrid || spriteGridData.length === 0) return;
        ensureSpriteSizeControls();

        const rows = spriteGridData.length;
        const cols = spriteGridData[0].length;
        const color = getSpriteColor(currentSpriteKey);
        const isPlayer = (currentSpriteKey === 'player');

        // ステッパーの数値表示を最新の列数・行数に更新
        const cDisp = document.getElementById("col-count-disp");
        const rDisp = document.getElementById("row-count-disp");
        if (cDisp) cDisp.textContent = cols;
        if (rDisp) rDisp.textContent = rows;
        if (spriteSizeInfo) spriteSizeInfo.textContent = `${cols} × ${rows}`;
        updateFitGuide(cols, rows);

        spriteGrid.innerHTML = '';
        spriteGrid.style.gridTemplateColumns = `repeat(${cols}, 26px)`;
        spriteGrid.style.gridTemplateRows = `repeat(${rows}, 26px)`;

        // 右クリックで説明トーストを表示
        if (!spriteGrid._contextMenuBound) {
            spriteGrid._contextMenuBound = true;
            spriteGrid.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (currentSpriteKey === 'player') {
                    showToast('赤いマスをドラッグして発射位置を移動できます');
                }
            });
        }

        const showSymLine = !!(spriteSymmetry && spriteSymmetry.checked);
        const symCol = Math.floor((cols - 1) / 2);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'sprite-cell';
                if (showSymLine && c === symCol) {
                    cell.classList.add('symmetry-line');
                }
                if (spriteGridData[r][c] === 1) {
                    cell.classList.add('active');
                    cell.style.backgroundColor = color;
                }

                // 弾の発射位置 (赤マス & 上向き矢印 ↑)
                if (isPlayer && playerMuzzle && r === playerMuzzle.row && c === playerMuzzle.col) {
                    cell.classList.add('cell-muzzle-point');
                }

                cell.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return; // 左クリックのみ
                    e.preventDefault();

                    // 発射口(赤マス)を握った場合: ドラッグ移動を開始
                    if (isPlayer && playerMuzzle && r === playerMuzzle.row && c === playerMuzzle.col) {
                        isDraggingMuzzle = true;
                        spriteGrid.classList.add('muzzle-dragging');
                        showToast('赤いマスをドラッグして発射位置を移動できます');
                        return;
                    }

                    // 通常のピクセル描画
                    isDrawingPixel = true;
                    drawMode = spriteGridData[r][c] === 1 ? 0 : 1;
                    pushHistory();
                    applyPixel(r, c, drawMode);
                });

                cell.addEventListener('mouseenter', () => {
                    // 発射口を握りながら移動中
                    if (isDraggingMuzzle) {
                        playerMuzzle = { col: c, row: r };
                        renderSpriteGrid();
                        return;
                    }
                    if (isDrawingPixel) {
                        applyPixel(r, c, drawMode);
                    }
                });

                spriteGrid.appendChild(cell);
            }
        }

        drawMiniPreview();
    }

    function applyPixel(r, c, val) {
        const cols = spriteGridData[0].length;
        setPixel(r, c, val);
        if (spriteSymmetry && spriteSymmetry.checked) {
            const mirrorC = cols - 1 - c;
            if (mirrorC !== c) setPixel(r, mirrorC, val);
        }
        drawMiniPreview();
        updateFitGuide();
    }

    function setPixel(r, c, val) {
        if (!spriteGridData[r] || spriteGridData[r][c] === undefined) return;
        spriteGridData[r][c] = val;
        const cols = spriteGridData[0].length;
        const cell = spriteGrid.children[r * cols + c];
        if (!cell) return;
        if (val === 1) {
            cell.classList.add('active');
            cell.style.backgroundColor = getSpriteColor(currentSpriteKey);
        } else {
            cell.classList.remove('active');
            cell.style.backgroundColor = '';
        }
    }

    window.addEventListener('mouseup', () => {
        if (isDraggingMuzzle) {
            isDraggingMuzzle = false;
            if (spriteGrid) spriteGrid.classList.remove('muzzle-dragging');
            renderSpriteGrid();
            updateFitGuide();
        }
        if (isDrawingPixel) {
            isDrawingPixel = false;
            updateFitGuide();
        }
    });

    // ── プレビュー (敵キャラは足踏みの2コマを交互に表示) ──
    function makeWalkFrame(lines) {
        const legStart = Math.max(0, lines.length - 3);
        return lines.map((row, i) => i < legStart ? row : '0' + row.slice(0, row.length - 1));
    }

    function drawMiniPreview() {
        if (!spriteMiniCanvas || spriteGridData.length === 0) return;
        const ctx = spriteMiniCanvas.getContext('2d');
        let lines = gridToStrings(spriteGridData);
        if (WALKING_SPRITES.includes(currentSpriteKey) && previewFrame === 1) {
            lines = makeWalkFrame(lines);
        }

        const rows = lines.length;
        const cols = lines[0].length;
        ctx.clearRect(0, 0, spriteMiniCanvas.width, spriteMiniCanvas.height);

        const pixelSize = Math.max(2, Math.floor(Math.min(spriteMiniCanvas.width / cols, spriteMiniCanvas.height / rows)));
        const startX = Math.floor((spriteMiniCanvas.width - cols * pixelSize) / 2);
        const startY = Math.floor((spriteMiniCanvas.height - rows * pixelSize) / 2);

        ctx.fillStyle = getSpriteColor(currentSpriteKey);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (lines[r][c] === '1') {
                    ctx.fillRect(startX + c * pixelSize, startY + r * pixelSize, pixelSize, pixelSize);
                }
            }
        }
    }

    setInterval(() => {
        previewFrame = 1 - previewFrame;
        if (spritePane && spritePane.style.display !== 'none') drawMiniPreview();
    }, 480);

    // ── 操作ボタン ──
    spriteSelect?.addEventListener('change', () => {
        currentSpriteKey = spriteSelect.value;
        loadSpriteFromConfig();
        renderSpriteGrid();
    });

    spriteSymmetry?.addEventListener('change', () => {
        renderSpriteGrid();
    });

    // 幅・高さ変更ステッパーのイベントリスナー
    btnColDec?.addEventListener('click', () => {
        if (spriteGridData.length === 0) return;
        resizeSpriteGrid(spriteGridData[0].length - 1, spriteGridData.length);
    });
    btnColInc?.addEventListener('click', () => {
        if (spriteGridData.length === 0) return;
        resizeSpriteGrid(spriteGridData[0].length + 1, spriteGridData.length);
    });
    btnRowDec?.addEventListener('click', () => {
        if (spriteGridData.length === 0) return;
        resizeSpriteGrid(spriteGridData[0].length, spriteGridData.length - 1);
    });
    btnRowInc?.addEventListener('click', () => {
        if (spriteGridData.length === 0) return;
        resizeSpriteGrid(spriteGridData[0].length, spriteGridData.length + 1);
    });

    // プリセットチップのイベントリスナー
    document.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const c = parseInt(chip.getAttribute('data-cols'), 10);
            const r = parseInt(chip.getAttribute('data-rows'), 10);
            if (!isNaN(c) && !isNaN(r)) {
                resizeSpriteGrid(c, r);
            }
        });
    });

    btnSpriteClear?.addEventListener('click', () => {
        pushHistory();
        spriteGridData = spriteGridData.map(row => row.map(() => 0));
        renderSpriteGrid();
        updateFitGuide();
    });

    btnSpriteReset?.addEventListener('click', () => {
        pushHistory();
        spriteGridData = stringsToGrid(DEFAULT_SPRITES[currentSpriteKey] || DEFAULT_SPRITES.player);
        if (currentSpriteKey === 'player') {
            playerMuzzle = { col: 6, row: 0 };
        }
        renderSpriteGrid();
        updateFitGuide();
    });

    btnSpriteUndo?.addEventListener('click', () => {
        undoSprite();
        updateFitGuide();
    });
    btnSpriteRedo?.addEventListener('click', () => {
        redoSprite();
        updateFitGuide();
    });

    window.addEventListener('keydown', (e) => {
        if (!spritePane || spritePane.style.display === 'none') return;
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
        e.preventDefault();
        if (e.shiftKey) {
            redoSprite();
            updateFitGuide();
        } else {
            undoSprite();
            updateFitGuide();
        }
    });

    function applyCurrentSpriteToConfig() {
        const val = validateCurrentSprite();
        if (!val.ok) {
            showToast(val.reason, true);
            return;
        }

        if (spriteGridData.length === 0) return;

        const rowsText = gridToStrings(spriteGridData).map(row => `            "${row}"`).join(',\n');
        const formattedCode = '[\n' + rowsText + '\n        ]';

        const configCode = files['config.js'].content;
        const regex = new RegExp(`(\\b${currentSpriteKey}:\\s*)\\[[\\s\\S]*?\\]`);

        if (!regex.test(configCode)) {
            showToast(`config.js に ${currentSpriteKey} の定義が見つかりません`, true);
            return;
        }
        files['config.js'].content = configCode.replace(regex, (m, head) => head + formattedCode);
        if (currentSpriteKey === 'player') {
            syncMuzzleToConfigFile();
        }
        files['config.js'].isDirty = (files['config.js'].content !== files['config.js'].baselineContent);
        if (currentFileKey === 'config.js') {
            codeTextarea.value = files['config.js'].content;
            updateCodeHighlight();
            if (stickyScrollController) {
                stickyScrollController.updateFile('config.js', files['config.js'].content, 'js');
                stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
            }
        }
        updateTabsUI();
        updateSidebarUI();
        saveAndApplyChanges();
        showToast('反映しました');
    }

    btnSideApply?.addEventListener('click', applyCurrentSpriteToConfig);
    btnSpriteApply?.addEventListener('click', applyCurrentSpriteToConfig);

    document.getElementById('tab-sprite-editor')?.addEventListener('click', showSpriteEditorPane);

    // ─────────────────────────────────────────────
    // アクションボタン
    // ─────────────────────────────────────────────
    document.getElementById('btn-save')?.addEventListener('click', saveAndApplyChanges);

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
        const currentFile = files[currentFileKey];
        if (!currentFile) return;
        navigator.clipboard.writeText(currentFile.content).then(() => {
            showToast(`${currentFile.name} をコピーしました`);
        });
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
        if (confirm('すべてのファイルを初期状態に戻しますか？')) {
            loadRealFiles();
            showToast('初期設定に戻しました');
        }
    });

    // ─────────────────────────────────────────────
    // 設定モーダル内の動作モード表示更新 (Trial-admission / Production)
    // ─────────────────────────────────────────────
    function updateSettingsModeDisplay() {
        const badge = document.getElementById('settings-current-mode-val');
        if (!badge) return;
        const isBroken = isTrialAdmissionBroken();
        if (isBroken) {
            badge.textContent = 'Trial-admission';
            badge.className = 'settings-meta-val settings-mode-badge is-trial';
            badge.title = '体験入学モード（課題・穴埋め状態）';
        } else {
            badge.textContent = 'Production';
            badge.className = 'settings-meta-val settings-mode-badge is-production';
            badge.title = '通常・本番モード（完成版状態）';
        }
    }

    // ─────────────────────────────────────────────
    // 体験入学用コード破壊・復元イースターエッグ (trial-admission / editor 5連打)
    // ─────────────────────────────────────────────
    let easterEggClickCount = 0;
    let easterEggClickTimer = null;

    function handleEasterEggClick(e) {
        easterEggClickCount++;
        clearTimeout(easterEggClickTimer);
        easterEggClickTimer = setTimeout(() => {
            easterEggClickCount = 0;
        }, 2500);

        if (easterEggClickCount >= 5) {
            easterEggClickCount = 0;
            triggerModeToggleConfirm();
        }
    }

    function triggerModeToggleConfirm() {
        const isBroken = isTrialAdmissionBroken();
        if (!isBroken) {
            showToastConfirm('体験入学モードに切り替えますか？（課題用にコードを穴埋め状態にします）', () => {
                if (typeof closeSettingsModal === 'function') closeSettingsModal();
                applyTrialAdmissionBreak();
            }, '切り替え', true);
        } else {
            showToastConfirm('完成版コード（Production）に復元しますか？', () => {
                if (typeof closeSettingsModal === 'function') closeSettingsModal();
                restoreTrialAdmission();
            }, '復元', false);
        }
    }

    function isTrialAdmissionBroken() {
        if (!files['index.html']) return false;
        const html = files['index.html'].content || '';
        const cfg = files['config.js']?.content || '';
        const hasCoreScript = /<script\s+[^>]*src=["']core\.js["'][^>]*>/i.test(html);
        const hasStepComment = html.includes('【STEP') || cfg.includes('【STEP');
        const hasZeroSpeed = /(?:player|bullet):\s*\{[\s\S]*?speed:\s*0\b/i.test(cfg);
        return !hasCoreScript || hasZeroSpeed || hasStepComment;
    }

    function applyTrialAdmissionBreak() {
        // 1. 本番完成版コード（Production）が未退避であれば確実に退避
        for (let k in files) {
            if (files[k] && !files[k].isBinary && typeof files[k].content === 'string') {
                if (!files[k].productionContent) {
                    files[k].productionContent = files[k].content;
                }
            }
        }

        // 2. index.html に体験入学用 STEP コメント（1-1, 1-2, 1-3）を挿入し、core.js 読み込みを外す
        if (files['index.html']) {
            let html = files['index.html'].productionContent || files['index.html'].content;
            // STEP 1-1
            if (!html.includes('【STEP 1-1】')) {
                html = html.replace(/(<title>)/i, '    <!-- 【STEP 1-1】ブラウザのタブの名前を自分のゲーム名にしよう！ -->\n$1');
            }
            // STEP 1-2
            if (!html.includes('【STEP 1-2】')) {
                html = html.replace(/(<link\s+[^>]*rel=["']icon["'][^>]*>)/i, '    <!-- 【STEP 1-2】タブのアイコンをお気に入りのキャラにしよう！ -->\n    <!-- assetsフォルダの中から好きな画像を選んで書いてみよう -->\n$1');
            }
            // STEP 1-3 & core.js タグの穴埋め化
            html = html.replace(/<script\s+[^>]*src=["']core\.js["'][^>]*>\s*<\/script>\s*/gi, '');
            if (!html.includes('【STEP 1-3】')) {
                html = html.replace(
                    /(<script\s+[^>]*src=["']config\.js["'][^>]*>\s*<\/script>)/i,
                    '$1\n\n    <!-- 【STEP 1-3】ゲームの心臓 (core.js) を読み込もう！ -->\n    <!-- ▼ ここに「<script src="core.js"></script>」と書いてゲームを起動させよう -->\n'
                );
            }
            files['index.html'].content = html;
        }

        // 3. config.js に STEP コメント（3-1, 3-2）を挿入し、スピードを 0 に設定
        if (files['config.js']) {
            let cfg = files['config.js'].productionContent || files['config.js'].content;
            // STEP 3-1: player speed: 0
            cfg = cfg.replace(/\s*\/\/\s*【STEP 3-1】[^\n]*\n?/gi, '');
            cfg = cfg.replace(
                /(player:\s*\{[\s\S]*?)(speed:\s*)[0-9.]+/i,
                '$1// 【STEP 3-1】自機の移動スピードを決めよう！ (推奨: 5)\n        $20'
            );
            // STEP 3-2: bullet speed: 0
            cfg = cfg.replace(/\s*\/\/\s*【STEP 3-2】[^\n]*\n?/gi, '');
            cfg = cfg.replace(
                /(bullet:\s*\{[\s\S]*?)(speed:\s*)-?[0-9.]+/i,
                '$1// 【STEP 3-2】弾のスピードを決めよう！ (上向きに飛ばすのでマイナス -8 を指定)\n        $20'
            );
            files['config.js'].content = cfg;
        }

        // 4. style.css に STEP 2 コメントを挿入
        if (files['style.css']) {
            let css = files['style.css'].productionContent || files['style.css'].content;
            if (!css.includes('【STEP 2】')) {
                css = css.replace(
                    /(\.arcade-play-btn\s*\{)/i,
                    '/* 【STEP 2】特大スタートボタンを自分の好きな色に光らせよう！ */\n/* （お手本: #00ffff 水色, #ff007f ピンク, #ffcc00 黄色） */\n$1'
                );
                files['style.css'].content = css;
            }
        }

        // 5. 体験入学モード切り替え直後は、この穴埋め版をベースラインとする（生徒の編集差分判定用）
        for (let k in files) {
            if (files[k] && !files[k].isBinary) {
                files[k].baselineContent = files[k].content;
                files[k].isDirty = false;
            }
        }

        // 6. ★即座に index.html を開き、診断を実行してバグ箇所を即座に特定表示
        switchToFile('index.html');
        runDiagnostics('index.html');

        updateTabsUI();
        updateSidebarUI();
        updatePreview();
        updateAllFilesDiagnostics();
        updateSaveButtonState();
        updateSettingsModeDisplay();

        // エラー詳細パネルを自動展開してバグ原因と修正方法を明示
        toggleDiagnosticsPanel(true);

        // 7. index.html 内のバグ箇所（STEP 1-3 の空行）へ自動スクロール＆キャレット移動
        setTimeout(() => {
            if (files['index.html']) {
                const lines = (codeTextarea ? codeTextarea.value : files['index.html'].content).split('\n');
                let targetLine = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('STEP 1-3') || lines[i].includes('ゲームの心臓')) {
                        targetLine = Math.min(lines.length, i + 2); // 案内コメントの次行（記述行）
                        break;
                    }
                }
                if (targetLine > 0) {
                    jumpToLine(targetLine, 1);
                }
            }
        }, 100);

        showToast('体験入学モード（Trial-admission）に切り替えました！', false);
    }

    function restoreTrialAdmission() {
        // 1. 完成版コード（Production）へ復元：体験入学用コメントを完全消去し、完成した本番コードへ戻す
        if (files['index.html']) {
            let restored = files['index.html'].productionContent || files['index.html'].content;
            // STEP 1-1, 1-2, 1-3 関連コメントを綺麗に除去
            restored = restored.replace(/\s*<!--\s*【STEP 1-1】[^\n]*-->\s*\n?/gi, '\n');
            restored = restored.replace(/\s*<!--\s*【STEP 1-2】[^\n]*-->\s*\n?/gi, '\n');
            restored = restored.replace(/\s*<!--\s*assetsフォルダの中から[^\n]*-->\s*\n?/gi, '\n');
            restored = restored.replace(/\s*<!--\s*【STEP 1-3】[^\n]*-->\s*\n?/gi, '\n');
            restored = restored.replace(/\s*<!--\s*▼ ここに「.*?」と書いてゲームを起動させよう\s*-->\s*\n?/gi, '\n');

            // core.js タグがなければ config.js の直後に確実に再配置
            if (!/<script\s+[^>]*src=["']core\.js["'][^>]*>/i.test(restored)) {
                if (/<script\s+[^>]*src=["']config\.js["'][^>]*>/i.test(restored)) {
                    restored = restored.replace(
                        /(<script\s+[^>]*src=["']config\.js["'][^>]*>\s*<\/script>)/i,
                        '$1\n    <script src="core.js"><\/script>'
                    );
                } else if (restored.includes('</body>')) {
                    restored = restored.replace('</body>', '    <script src="core.js"></script>\n</body>');
                } else {
                    restored += '\n    <script src="core.js"></script>';
                }
            }
            files['index.html'].content = restored;
            files['index.html'].productionContent = restored;
        }

        if (files['config.js']) {
            let restored = files['config.js'].productionContent || files['config.js'].content;
            // STEP 3-1, STEP 3-2 コメントを除去
            restored = restored.replace(/\s*\/\/\s*【STEP 3-1】[^\n]*\n?/gi, '');
            restored = restored.replace(/\s*\/\/\s*【STEP 3-2】[^\n]*\n?/gi, '');
            // 速度パラメータを完成値に戻す
            restored = restored.replace(/(player:\s*\{[\s\S]*?speed:\s*)0\b/i, '$15');
            restored = restored.replace(/(bullet:\s*\{[\s\S]*?speed:\s*)0\b/i, '$1-8');
            files['config.js'].content = restored;
            files['config.js'].productionContent = restored;
        }

        if (files['style.css']) {
            let restored = files['style.css'].productionContent || files['style.css'].content;
            // STEP 2 コメントを除去
            restored = restored.replace(/\s*\/\*\s*【STEP 2】[\s\S]*?\*\/\s*\n?/gi, '\n');
            restored = restored.replace(/\s*\/\*\s*（お手本:[^\n]*\*\/\s*\n?/gi, '\n');
            files['style.css'].content = restored;
            files['style.css'].productionContent = restored;
        }

        // 2. 完全版復元直後もクリーンな保存済み状態にする
        for (let k in files) {
            if (files[k] && !files[k].isBinary) {
                if (files[k].productionContent) {
                    files[k].content = files[k].productionContent;
                }
                files[k].baselineContent = files[k].content;
                files[k].isDirty = false;
            }
        }

        // 3. エディタ全体を完全再描画（現在のファイルの内容・ハイライト・診断・スティッキースクロール）
        renderEditor();
        runDiagnostics(currentFileKey);

        updateTabsUI();
        updateSidebarUI();
        updatePreview();
        updateAllFilesDiagnostics();
        updateSaveButtonState();
        updateSettingsModeDisplay();

        // エラー解消に伴い診断詳細パネルを閉じる
        toggleDiagnosticsPanel(false);

        showToast('完成版コード（Production）に復元しました！', false);
    }

    // イベントリスナーの登録 (trial-admission / editor フォルダ行 & ヘッダーのエディタ文字)
    const folderToggleRoot = document.getElementById('folder-toggle-root');
    if (folderToggleRoot) {
        folderToggleRoot.addEventListener('click', handleEasterEggClick);
    }
    const folderToggleEditor = document.getElementById('folder-toggle-editor');
    if (folderToggleEditor) {
        folderToggleEditor.addEventListener('click', handleEasterEggClick);
    }
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) {
        brandSub.style.cursor = 'pointer';
        brandSub.addEventListener('click', handleEasterEggClick);
    }



    // 初期化 (どんなPC端末・画面比率でも画像2の黄金比で美しく起動)
    try {
        const savedWidth = parseInt(localStorage.getItem('invader_editor_pane_width'), 10);
        const winWidth = window.innerWidth;
        // 過去の古い値（画面を圧迫する巨大幅）を補正し、画面幅の25〜30%（320〜380px）を標準にする
        if (savedWidth >= 270 && savedWidth <= Math.max(360, winWidth * 0.32)) {
            previewPane.style.width = savedWidth + 'px';
        } else {
            const idealWidth = Math.min(380, Math.max(300, Math.round(winWidth * 0.27)));
            previewPane.style.width = idealWidth + 'px';
        }
    } catch (e) { }
    updateSoundUI();
    renderEditor();
    loadRealFiles();
    loadSpriteFromConfig();

    previewIframe.addEventListener('load', () => {
        applyScale();
        try {
            previewIframe.contentWindow.postMessage({
                type: 'SET_SOUND',
                enabled: !isMuted
            }, '*');
        } catch (e) { }
    });

    // ─────────────────────────────────────────────
    // シームレス画面遷移 (ゲーム画面との相互連携)
    // ─────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('from') === 'game') {
        document.body.classList.add('animate-from-game');
        setTimeout(() => {
            document.body.classList.remove('animate-from-game');
        }, 600);
    }

    if (urlParams.get('tab') === 'sprite') {
        setTimeout(() => {
            showSpriteEditorPane();
        }, 120);
    }

    document.getElementById('btn-back-to-game')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.body.classList.add('transitioning-to-game');
        setTimeout(() => {
            window.location.href = '../';
        }, 400);
    });

    // ─────────────────────────────────────────────
    // ミニマップ (コードマップ) レンダリング & インタラクション
    // ─────────────────────────────────────────────
    function renderMinimap() {
        if (!editorMinimapCanvas || !editorMinimapWrap) return;
        const file = files[currentFileKey];
        if (!file || file.isBinary || file.type === 'image' || document.body.classList.contains('hide-minimap')) {
            editorMinimapWrap.style.display = 'none';
            return;
        }
        editorMinimapWrap.style.display = 'block';

        const rect = editorMinimapWrap.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);

        if (editorMinimapCanvas.width !== targetW || editorMinimapCanvas.height !== targetH) {
            editorMinimapCanvas.width = targetW;
            editorMinimapCanvas.height = targetH;
        }

        if (!minimapCtx) minimapCtx = editorMinimapCanvas.getContext('2d');
        if (!minimapCtx) return;

        minimapCtx.save();
        minimapCtx.scale(dpr, dpr);
        minimapCtx.clearRect(0, 0, rect.width, rect.height);

        const text = codeTextarea.value || '';
        const lines = text.split('\n');
        const lineCount = lines.length;

        const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 20;
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

            // 画面外をカリング
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

            // インデントの計算
            const leadingSpaces = rawLine.match(/^\s*/)[0].replace(/\t/g, '    ').length;
            let startX = 6 + leadingSpaces * 1.0;
            const trimmed = rawLine.trimStart();

            // トークン化して色付きで精密描画
            tokenizeAndDrawMinimapLine(trimmed, file.type, startX, y, rect.width - 12);
        }

        minimapCtx.restore();

        // 右端エラーマーカー（画面外も含めた全エラーの俯瞰マーカー）の描画
        updateMinimapGutterMarkers(lineCount, rect.height);

        // スライダー同期
        syncMinimapSlider();
    }

    function tokenizeAndDrawMinimapLine(text, type, startX, y, maxWidth) {
        if (!text) return;
        let tokens = [];

        const isLight = document.body.classList.contains('theme-light');
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
            const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\\[\r\n])+\/[a-z]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|true|false|null|undefined|this|import|export|from)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z0-9_$]+(?=\s*:))/g;
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
            // HTML用の精密ミニマップトークナイザー (テーマ対応)
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
        if (!editorMinimapGutter || lineCount <= 0) return;
        let html = '';
        errorLineSet.forEach(lineNum => {
            const topPct = ((lineNum - 1) / lineCount) * 100;
            html += `<div style="position:absolute;top:${topPct}%;left:0;width:3px;height:3px;background-color:#ef4444;border-radius:1px;box-shadow:0 0 3px #ef4444;"></div>`;
        });
        warningLineSet.forEach(lineNum => {
            const topPct = ((lineNum - 1) / lineCount) * 100;
            html += `<div style="position:absolute;top:${topPct}%;left:0;width:3px;height:3px;background-color:#f59e0b;border-radius:1px;"></div>`;
        });
        editorMinimapGutter.innerHTML = html;
    }

    function syncMinimapSlider() {
        if (!editorMinimapSlider || !editorMinimapWrap || !codeTextarea) return;
        const rect = editorMinimapWrap.getBoundingClientRect();
        if (rect.height === 0) return;

        const text = codeTextarea.value || '';
        const lineCount = Math.max(1, text.split('\n').length);
        const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 20;

        const maxScroll = Math.max(1, codeTextarea.scrollHeight - codeTextarea.clientHeight);
        const scrollRatio = Math.max(0, Math.min(1, codeTextarea.scrollTop / maxScroll));
        const maxMinimapScroll = Math.max(0, totalMinimapHeight - rect.height);
        const minimapOffsetY = totalMinimapHeight > rect.height ? scrollRatio * maxMinimapScroll : 0;

        const topLine = codeTextarea.scrollTop / EDITOR_LINE_HEIGHT;
        const visibleLines = codeTextarea.clientHeight / EDITOR_LINE_HEIGHT;

        // エディタで見えている行範囲を正確に反映する白枠の高さ
        const sliderHeight = Math.max(20, Math.min(rect.height, visibleLines * MINIMAP_LINE_PITCH));
        // ミニマップ上の実際の描画行位置と完全一致するTop位置
        const sliderTop = Math.max(0, (topLine * MINIMAP_LINE_PITCH) - minimapOffsetY + 6);

        editorMinimapSlider.style.top = `${sliderTop}px`;
        editorMinimapSlider.style.height = `${sliderHeight}px`;
    }

    // ミニマップ上のクリック＆ドラッグスクロール (ダイレクト高速スクロール対応)
    function initMinimapInteraction() {
        if (!editorMinimapWrap || !editorMinimapSlider) return;

        editorMinimapWrap.addEventListener('mousedown', (e) => {
            const wrapRect = editorMinimapWrap.getBoundingClientRect();
            const maxScroll = Math.max(0, codeTextarea.scrollHeight - codeTextarea.clientHeight);
            if (maxScroll <= 0) return;

            isMinimapDragging = true;
            document.body.style.userSelect = 'none';
            editorMinimapSlider.classList.add('is-dragging');

            const text = codeTextarea.value || '';
            const lineCount = Math.max(1, text.split('\n').length);
            const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 20;

            const sliderHeight = editorMinimapSlider.offsetHeight || 20;

            if (e.target === editorMinimapSlider) {
                const sliderRect = editorMinimapSlider.getBoundingClientRect();
                minimapDragGrabOffsetY = e.clientY - sliderRect.top;
            } else {
                // スライダー外をクリックした場合は、クリック位置に白枠の中心をジャンプさせてドラッグ開始
                minimapDragGrabOffsetY = sliderHeight / 2;
                const clickY = e.clientY - wrapRect.top;

                let targetScrollTop = 0;
                if (totalMinimapHeight <= wrapRect.height) {
                    const targetLine = (clickY - 6) / MINIMAP_LINE_PITCH;
                    targetScrollTop = (targetLine * EDITOR_LINE_HEIGHT) - (codeTextarea.clientHeight / 2);
                } else {
                    const trackHeight = Math.max(1, wrapRect.height - sliderHeight);
                    const ratio = Math.max(0, Math.min(1, (clickY - minimapDragGrabOffsetY) / trackHeight));
                    targetScrollTop = ratio * maxScroll;
                }
                codeTextarea.scrollTop = Math.max(0, Math.min(maxScroll, Math.round(targetScrollTop)));
                syncScroll();
                syncMinimapSlider();
                renderMinimap();
            }

            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMinimapDragging) return;
            const wrapRect = editorMinimapWrap.getBoundingClientRect();
            const maxScroll = Math.max(0, codeTextarea.scrollHeight - codeTextarea.clientHeight);
            if (maxScroll <= 0) return;

            const text = codeTextarea.value || '';
            const lineCount = Math.max(1, text.split('\n').length);
            const totalMinimapHeight = lineCount * MINIMAP_LINE_PITCH + 20;

            const targetSliderTop = e.clientY - wrapRect.top - minimapDragGrabOffsetY;

            let targetScrollTop = 0;
            if (totalMinimapHeight <= wrapRect.height) {
                const targetLine = (targetSliderTop - 6) / MINIMAP_LINE_PITCH;
                targetScrollTop = targetLine * EDITOR_LINE_HEIGHT;
            } else {
                const sliderHeight = editorMinimapSlider.offsetHeight || 20;
                const trackHeight = Math.max(1, wrapRect.height - sliderHeight);
                const ratio = Math.max(0, Math.min(1, targetSliderTop / trackHeight));
                targetScrollTop = ratio * maxScroll;
            }

            codeTextarea.scrollTop = Math.max(0, Math.min(maxScroll, Math.round(targetScrollTop)));
            syncScroll();
            syncMinimapSlider();
            renderMinimap();
        });

        window.addEventListener('mouseup', () => {
            if (isMinimapDragging) {
                isMinimapDragging = false;
                document.body.style.userSelect = '';
                editorMinimapSlider.classList.remove('is-dragging');
            }
        });

        window.addEventListener('resize', () => {
            renderMinimap();
        });
    }

    initMinimapInteraction();

    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
    // エディタ環境設定システム (Settings Manager)
    // ─────────────────────────────────────────────
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const themeBtnText = document.getElementById('theme-btn-text');
    const themeIconSun = document.querySelector('.theme-icon-sun');
    const themeIconMoon = document.querySelector('.theme-icon-moon');

    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const settingsModalOverlay = document.getElementById('settings-modal-overlay');

    const themeChoiceDark = document.getElementById('theme-choice-dark');
    const themeChoiceLight = document.getElementById('theme-choice-light');
    const settingToggleMinimap = document.getElementById('setting-toggle-minimap');
    const settingToggleIndentGuides = document.getElementById('setting-toggle-indent-guides');
    const settingToggleDiagnostics = document.getElementById('setting-toggle-diagnostics');

    // デフォルト設定定義
    const DEFAULT_SETTINGS = {
        theme: 'dark',
        minimap: true,
        indentGuides: true,
        diagnostics: true
    };

    let editorSettings = Object.assign({}, DEFAULT_SETTINGS);

    // localStorage から設定を安全に復元
    function loadEditorSettings() {
        try {
            const raw = localStorage.getItem('rowpilot_editor_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    editorSettings = Object.assign({}, DEFAULT_SETTINGS, parsed);
                }
            } else {
                // 旧キー rowpilot_editor_theme からのマイグレーション
                const legacyTheme = localStorage.getItem('rowpilot_editor_theme');
                if (legacyTheme === 'light' || legacyTheme === 'dark') {
                    editorSettings.theme = legacyTheme;
                }
            }
        } catch (e) {
            console.warn('[Settings] Failed to load settings from localStorage', e);
        }
    }

    // 設定を localStorage に永続化
    function saveEditorSettings() {
        try {
            localStorage.setItem('rowpilot_editor_settings', JSON.stringify(editorSettings));
            localStorage.setItem('rowpilot_editor_theme', editorSettings.theme);
        } catch (e) { }
    }

    // テーマ適用
    function applyTheme(themeName) {
        editorSettings.theme = themeName === 'light' ? 'light' : 'dark';
        const isLight = editorSettings.theme === 'light';

        document.body.classList.toggle('theme-light', isLight);

        if (themeBtnText) {
            themeBtnText.textContent = isLight ? 'ダーク' : 'ライト';
        }
        if (themeIconSun && themeIconMoon) {
            themeIconSun.style.display = isLight ? 'none' : 'inline-block';
            themeIconMoon.style.display = isLight ? 'inline-block' : 'none';
        }

        // モーダル内のテーマ選択セグメントのアクティブ状態
        if (themeChoiceDark && themeChoiceLight) {
            themeChoiceDark.classList.toggle('is-active', !isLight);
            themeChoiceLight.classList.toggle('is-active', isLight);
        }

        saveEditorSettings();

        // ミニマップ再描画 (非表示設定でない場合)
        if (!document.body.classList.contains('hide-minimap')) {
            renderMinimap();
        }
    }

    // 全設定項目のDOM適用
    function applyAllSettings() {
        // 1. テーマ
        applyTheme(editorSettings.theme);

        // 2. ミニマップ
        document.body.classList.toggle('hide-minimap', !editorSettings.minimap);
        if (settingToggleMinimap) settingToggleMinimap.checked = !!editorSettings.minimap;
        if (editorSettings.minimap) {
            renderMinimap();
        }

        // 3. インデントライン
        document.body.classList.toggle('hide-indent-guides', !editorSettings.indentGuides);
        if (settingToggleIndentGuides) settingToggleIndentGuides.checked = !!editorSettings.indentGuides;

        // 4. 画面下部エラー表示
        document.body.classList.toggle('hide-diagnostics', !editorSettings.diagnostics);
        if (settingToggleDiagnostics) settingToggleDiagnostics.checked = !!editorSettings.diagnostics;
    }

    // モーダルを開く
    function openSettingsModal() {
        if (!settingsModalOverlay) return;
        // モーダル内トグルの状態を最新化
        if (settingToggleMinimap) settingToggleMinimap.checked = !!editorSettings.minimap;
        if (settingToggleIndentGuides) settingToggleIndentGuides.checked = !!editorSettings.indentGuides;
        if (settingToggleDiagnostics) settingToggleDiagnostics.checked = !!editorSettings.diagnostics;
        if (themeChoiceDark && themeChoiceLight) {
            themeChoiceDark.classList.toggle('is-active', editorSettings.theme !== 'light');
            themeChoiceLight.classList.toggle('is-active', editorSettings.theme === 'light');
        }
        updateSettingsModeDisplay();

        settingsModalOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
            settingsModalOverlay.classList.add('is-open');
            settingsModalOverlay.setAttribute('aria-hidden', 'false');
        });
    }

    // モーダルを閉じる
    function closeSettingsModal() {
        if (!settingsModalOverlay) return;
        settingsModalOverlay.classList.remove('is-open');
        settingsModalOverlay.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            if (!settingsModalOverlay.classList.contains('is-open')) {
                settingsModalOverlay.style.display = 'none';
            }
        }, 220);
    }

    // 初期化ロードと適用
    loadEditorSettings();
    applyAllSettings();

    // イベントバインド: ヘッダーの既存テーマボタン
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const nextTheme = editorSettings.theme === 'light' ? 'dark' : 'light';
            applyTheme(nextTheme);
        });
    }

    // イベントバインド: モーダル開閉
    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', () => {
            openSettingsModal();
        });
    }

    if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', () => {
            closeSettingsModal();
        });
    }

    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            closeSettingsModal();
        });
    }

    if (settingsModalOverlay) {
        settingsModalOverlay.addEventListener('click', (e) => {
            if (e.target === settingsModalOverlay) {
                closeSettingsModal();
            }
        });
    }

    // キーボードショートカット: Escape でモーダル閉じる / ⌘, で開閉
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsModalOverlay && settingsModalOverlay.classList.contains('is-open')) {
            closeSettingsModal();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === ',') {
            e.preventDefault();
            if (settingsModalOverlay && settingsModalOverlay.classList.contains('is-open')) {
                closeSettingsModal();
            } else {
                openSettingsModal();
            }
        }
    });

    // モーダル内イベントバインド: テーマ切り替え
    if (themeChoiceDark) {
        themeChoiceDark.addEventListener('click', () => {
            applyTheme('dark');
        });
    }
    if (themeChoiceLight) {
        themeChoiceLight.addEventListener('click', () => {
            applyTheme('light');
        });
    }

    // モーダル内イベントバインド: 各トグルスイッチ
    if (settingToggleMinimap) {
        settingToggleMinimap.addEventListener('change', (e) => {
            editorSettings.minimap = e.target.checked;
            document.body.classList.toggle('hide-minimap', !editorSettings.minimap);
            saveEditorSettings();
            if (editorSettings.minimap) {
                renderMinimap();
            }
        });
    }

    if (settingToggleIndentGuides) {
        settingToggleIndentGuides.addEventListener('change', (e) => {
            editorSettings.indentGuides = e.target.checked;
            document.body.classList.toggle('hide-indent-guides', !editorSettings.indentGuides);
            saveEditorSettings();
        });
    }

    if (settingToggleDiagnostics) {
        settingToggleDiagnostics.addEventListener('change', (e) => {
            editorSettings.diagnostics = e.target.checked;
            document.body.classList.toggle('hide-diagnostics', !editorSettings.diagnostics);
            saveEditorSettings();
        });
    }

    // システムファイル注意バナー内の「上の index.html」ジャンプボタン（文言動的更新にも対応するイベント委譲）
    document.addEventListener('click', (e) => {
        if (e.target && e.target.closest('#banner-btn-goto-game-html')) {
            switchToFile('index.html');
        }
    });

    // システムファイル注意バナーの最小化＆展開（シューンと "i" に縮小 / 再度展開）
    const bannerContainer = document.getElementById('system-file-banner-container');
    const bannerBtnMinimize = document.getElementById('banner-btn-minimize');
    const bannerBtnExpand = document.getElementById('system-banner-minimized-icon');

    bannerBtnMinimize?.addEventListener('click', () => {
        bannerContainer?.classList.add('is-minimized');
        try { localStorage.setItem('rowpilot_system_banner_minimized', '1'); } catch (e) { }
    });

    bannerBtnExpand?.addEventListener('click', () => {
        bannerContainer?.classList.remove('is-minimized');
        try { localStorage.setItem('rowpilot_system_banner_minimized', '0'); } catch (e) { }
    });

    try {
        if (localStorage.getItem('rowpilot_system_banner_minimized') === '1') {
            bannerContainer?.classList.add('is-minimized');
        }
    } catch (e) { }

    // スティッキースクロールの初期化
    if (window.StickyScrollController) {
        stickyScrollController = new window.StickyScrollController();
        stickyScrollController.init({
            highlightFn: (code, type) => highlightSyntax(code, type),
            indentGuideFn: (highlightedLine, rawLine, fullText) => {
                // ファイル全体のインデント幅 (2 or 4) に合わせてスティッキー行にも縦線ガイドを描画
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
            jumpToLineFn: (line, stickyIndex) => jumpToStickyLine(line, stickyIndex),
            errorLineSet: errorLineSet,
            warningLineSet: warningLineSet
        });
        const currentFile = files[currentFileKey];
        if (currentFile && !currentFile.isBinary) {
            stickyScrollController.updateFile(currentFileKey, currentFile.content, currentFile.type);
            stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
        }
        window.__applyTrialAdmissionBreak = applyTrialAdmissionBreak;
        window.__restoreTrialAdmission = restoreTrialAdmission;
    }

})();

