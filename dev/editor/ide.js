// ===============================================================
// Web Studio - Generic Code Editor & IDE Controller (ide.js)
// ===============================================================

(function (global) {
    'use strict';

    // ─────────────────────────────────────────────
    // 初期テンプレートプロジェクト
    // ─────────────────────────────────────────────
    const DEFAULT_PROJECT_FILES = {
        'index.html': {
            name: 'index.html',
            path: 'index.html',
            type: 'html',
            content: `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>マイプロジェクト</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <main class="card">
        <div class="badge">Web Editor</div>
        <h1>Hello, World!</h1>
        <p>Web Editor へようこそ。<br>HTML、CSS、JavaScript を自由に編集してみましょう！</p>
        
        <div class="interactive-area">
            <button id="counter-btn" class="btn">クリックしてね: <span id="count">0</span></button>
            <button id="color-btn" class="btn secondary">背景色を変える</button>
        </div>

        <div class="tip-box">
            <span class="tip-icon">💡</span>
            <span class="tip-text">下の「コンソール」ボタンを押すと、<code>console.log()</code> の出力が見えます。</span>
        </div>
    </main>

    <script src="script.js"></script>
</body>
</html>
`,
            isDirty: false
        },
        'style.css': {
            name: 'style.css',
            path: 'style.css',
            type: 'css',
            content: `/* ===================================================
   スタイルシート (style.css)
   =================================================== */

:root {
    --primary: #4f46e5;
    --primary-hover: #4338ca;
    --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    --card-bg: rgba(255, 255, 255, 0.08);
    --card-border: rgba(255, 255, 255, 0.15);
    --text: #f8fafc;
    --text-muted: #94a3b8;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-gradient);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 20px;
    transition: background 0.4s ease;
}

.card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    padding: 36px 32px;
    max-width: 440px;
    width: 100%;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}

.badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.25);
    color: #a5b4fc;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
}

h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 12px;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

p {
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 24px;
}

.interactive-area {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 24px;
}

.btn {
    padding: 10px 18px;
    border-radius: 8px;
    border: none;
    background: var(--primary);
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn:hover {
    background: var(--primary-hover);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
}

.btn:active {
    transform: translateY(0);
}

.btn.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
    border: 1px solid rgba(255, 255, 255, 0.15);
}

.btn.secondary:hover {
    background: rgba(255, 255, 255, 0.18);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.tip-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 12px;
    color: var(--text-muted);
    text-align: left;
}

.tip-box code {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 5px;
    border-radius: 4px;
    color: #a5b4fc;
    font-family: monospace;
}
`,
            isDirty: false
        },
        'script.js': {
            name: 'script.js',
            path: 'script.js',
            type: 'javascript',
            content: `// ===================================================
// JavaScript ロジック (script.js)
// ===================================================

console.log("🚀 Web Editor へようこそ！スクリプトが読み込まれました。");

let count = 0;
const countDisplay = document.getElementById('count');
const counterBtn = document.getElementById('counter-btn');
const colorBtn = document.getElementById('color-btn');

// カウンターボタンの処理
counterBtn.addEventListener('click', () => {
    count++;
    countDisplay.textContent = count;
    console.log(\`クリック回数: \${count}\`);
});

// 背景色のランダム変更
const colors = [
    'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
    'linear-gradient(135deg, #1e3a8a 0%, #065f46 100%)',
    'linear-gradient(135deg, #831843 0%, #312e81 100%)',
    'linear-gradient(135deg, #7c2d12 0%, #1e293b 100%)',
    'linear-gradient(135deg, #0f766e 0%, #1e1b4b 100%)'
];
let colorIndex = 0;

colorBtn.addEventListener('click', () => {
    colorIndex = (colorIndex + 1) % colors.length;
    document.body.style.background = colors[colorIndex];
    console.log(\`背景色を変更しました: テーマ #\${colorIndex + 1}\`);
});
`,
            isDirty: false
        },
        'README.md': {
            name: 'README.md',
            path: 'README.md',
            type: 'markdown',
            content: `# Web Editor - コードエディタ

ブラウザ上で動作する本格的なWeb開発環境です。

## 主な機能
- **リアルタイム構文チェック**: 全角スペースや全角記号、タグ閉じ忘れを即時に日本語で警告
- **ライブプレビュー**: 保存（⌘S / Ctrl+S）ですぐに右側に反映
- **内蔵コンソール**: \`console.log()\` やエラーを画面右下で直接確認
- **ZIP書き出し**: 「ZIP書き出し」ボタンで作成したWebサイト一式をダウンロード
- **フォルダを開く**: PC上のフォルダを直接開いてブラウザで編集・保存（Chrome / Edge対応）
- **ZIPドラッグ＆ドロップ**: ZIPファイルを画面に放り込むだけでプロジェクトを展開

## ショートカットキー
- **⌘S / Ctrl+S**: 保存してプレビューに反映
- **⌘Z / Ctrl+Z**: 元に戻す (Undo)
- **⌘Shift+Z / Ctrl+Y**: やり直す (Redo)
- **Tab**: 2文字分のインデント挿入
- **Shift+Tab**: インデント解除
`,
            isDirty: false
        }
    };

    // ─────────────────────────────────────────────
    // 状態管理
    // ─────────────────────────────────────────────
    const STORAGE_KEY = 'web_editor_v1_files';
    const THEME_STORAGE_KEY = 'web_editor_theme';

    let files = {};
    let openTabs = [];
    let currentFileKey = 'index.html';
    let localDirHandle = null; // File System Access API のディレクトリハンドル
    let fileHandlesMap = {}; // 相対パス -> FileSystemFileHandle

    // Undo / Redo スタック
    const undoStacks = {};
    const redoStacks = {};
    const MAX_HISTORY = 80;

    // 診断状態
    let currentFileIssues = [];
    let errorLineSet = new Set();
    let warningLineSet = new Set();
    let diagnosticsPanelOpen = false;
    let diagnosticsDebounceTimer = null;

    // コンソールログ
    let consoleLogs = [];
    let consoleErrorCount = 0;
    let isConsoleOpen = true;

    // スティッキースクロール
    let stickyScrollController = null;

    // ─────────────────────────────────────────────
    // DOM要素キャッシュ
    // ─────────────────────────────────────────────
    const btnSave = document.getElementById('btn-save');
    const btnCopyCode = document.getElementById('btn-copy-code');
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const themeBtnText = document.getElementById('theme-btn-text');
    const btnExportZip = document.getElementById('btn-export-zip');
    const btnOpenFolder = document.getElementById('btn-open-folder');

    const btnTopUndo = document.getElementById('btn-top-undo');
    const btnTopRedo = document.getElementById('btn-top-redo');

    const fileListNav = document.getElementById('file-list');
    const btnTreeNewFile = document.getElementById('btn-tree-new-file');
    const btnTreeNewFolder = document.getElementById('btn-tree-new-folder');
    const btnTreeRefresh = document.getElementById('btn-tree-refresh');

    const tabContainer = document.getElementById('editor-tabs');
    const unsavedStatusPill = document.getElementById('unsaved-status-pill');

    const editorBodyContainer = document.getElementById('editor-body-container');
    const lineNumbersInner = document.getElementById('line-numbers-inner');
    const codeTextarea = document.getElementById('code-textarea');
    const codeHighlight = document.getElementById('code-highlight');

    const editorMinimapWrap = document.getElementById('editor-minimap-wrap');
    const editorMinimapCanvas = document.getElementById('editor-minimap-canvas');
    const editorMinimapSlider = document.getElementById('editor-minimap-slider');
    const editorMinimapGutter = document.getElementById('editor-minimap-gutter');
    const MINIMAP_LINE_PITCH = 3.6;
    const EDITOR_LINE_HEIGHT = 22;
    let minimapCtx = null;
    let isMinimapDragging = false;
    let minimapDragGrabOffsetY = 0;

    const imageViewerPane = document.getElementById('image-viewer-pane');
    const imageViewerPath = document.getElementById('image-viewer-path');
    const imageViewerDims = document.getElementById('image-viewer-dims');
    const imageViewerType = document.getElementById('image-viewer-type');
    const imageViewerImg = document.getElementById('image-viewer-img');
    const btnCopyImagePath = document.getElementById('btn-copy-image-path');

    const diagnosticsBar = document.getElementById('editor-diagnostics-bar');
    const diagnosticsStatusDot = document.getElementById('diagnostics-status-dot');
    const diagnosticsStatusText = document.getElementById('diagnostics-status-text');
    const btnToggleDiagnostics = document.getElementById('btn-toggle-diagnostics');
    const diagnosticsPanel = document.getElementById('editor-diagnostics-panel');
    const diagnosticsList = document.getElementById('diagnostics-list');
    const diagnosticsPanelResizer = document.getElementById('diagnostics-panel-resizer');

    const paneResizer = document.getElementById('pane-resizer');
    const previewPane = document.getElementById('preview-pane');
    const previewIframe = document.getElementById('preview-iframe');
    const btnPreviewRefresh = document.getElementById('btn-preview-refresh');
    const btnOpenExternal = document.getElementById('btn-open-external');
    const previewUrlText = document.getElementById('preview-url-text');
    const btnToggleConsole = document.getElementById('btn-toggle-console');
    const consoleErrorBadge = document.getElementById('console-error-badge');

    const studioConsolePane = document.getElementById('studio-console-pane');
    const consoleResizer = document.getElementById('console-resizer');
    const consoleBody = document.getElementById('console-body');
    const btnClearConsole = document.getElementById('btn-clear-console');

    const ideModalBackdrop = document.getElementById('ide-modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const modalInputLabel = document.getElementById('modal-input-label');
    const modalInput = document.getElementById('modal-input');
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    const btnModalConfirm = document.getElementById('btn-modal-confirm');

    const dragDropOverlay = document.getElementById('drag-drop-overlay');
    const toast = document.getElementById('ide-toast');
    const toastMsg = document.getElementById('ide-toast-msg');

    // ─────────────────────────────────────────────
    // 初期化
    // ─────────────────────────────────────────────
    function init() {
        initTheme();
        loadFilesFromStorage();
        initMinimap();
        initStickyScroll();
        initEvents();
        initConsole();
        initDragAndDrop();

        renderFileTree();
        openFile(currentFileKey);
        updatePreview();
    }

    // ─────────────────────────────────────────────
    // ストレージ読み書き
    // ─────────────────────────────────────────────
    function loadFilesFromStorage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    files = parsed;
                    if (!files[currentFileKey]) {
                        currentFileKey = Object.keys(files)[0];
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn('Storage load error:', e);
        }
        // デフォルトをコピー
        files = JSON.parse(JSON.stringify(DEFAULT_PROJECT_FILES));
        currentFileKey = 'index.html';
    }

    function saveFilesToStorage() {
        try {
            // バイナリ以外のテキストファイルのみ保存
            const toSave = {};
            for (const k in files) {
                if (!files[k].isBinary) {
                    toSave[k] = files[k];
                }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('Storage save error:', e);
        }
    }

    // ─────────────────────────────────────────────
    // テーマ切り替え (Dark / Light)
    // ─────────────────────────────────────────────
    function initTheme() {
        const saved = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
        applyTheme(saved);
    }

    function applyTheme(theme) {
        const sun = document.querySelector('.theme-icon-sun');
        const moon = document.querySelector('.theme-icon-moon');
        if (theme === 'light') {
            document.body.classList.add('theme-light');
            if (themeBtnText) themeBtnText.textContent = 'ダーク';
            if (sun) sun.style.display = 'none';
            if (moon) moon.style.display = 'block';
        } else {
            document.body.classList.remove('theme-light');
            if (themeBtnText) themeBtnText.textContent = 'ライト';
            if (sun) sun.style.display = 'block';
            if (moon) moon.style.display = 'none';
        }
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    function toggleTheme() {
        const isLight = document.body.classList.contains('theme-light');
        applyTheme(isLight ? 'dark' : 'light');
    }

    // ─────────────────────────────────────────────
    // ファイルタイプ判定 & アイコン取得
    // ─────────────────────────────────────────────
    function detectFileType(path) {
        const ext = path.split('.').pop().toLowerCase();
        switch (ext) {
            case 'html': case 'htm': return 'html';
            case 'css': return 'css';
            case 'js': case 'mjs': return 'javascript';
            case 'json': return 'json';
            case 'md': case 'markdown': return 'markdown';
            case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': return 'image';
            default: return 'text';
        }
    }

    function getFileIconHtml(type, ext) {
        switch (type) {
            case 'html':
                return '<span class="tree-icon icon-html-sym">&lt;/&gt;</span>';
            case 'css':
                return '<span class="tree-icon icon-css-sym"><svg viewBox="0 0 16 16"><text x="8" y="11.5" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="10.5" font-weight="700" fill="currentColor">{ }</text></svg></span>';
            case 'javascript':
                return '<span class="tree-icon icon-js-sym">JS</span>';
            case 'json':
                return '<span class="tree-icon icon-json-svg"><svg viewBox="0 0 16 16"><path d="M8 1.5l6 3.5v6l-6 3.5-6-3.5V5z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg></span>';
            case 'image':
                return '<span class="tree-icon icon-img-svg"><svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="5.5" cy="5.5" r="1.2" fill="currentColor"/><path d="M3 12l3.5-3.5 2 2 3-3 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></span>';
            default:
                return '<span class="tree-icon icon-file-sym">📄</span>';
        }
    }

    // ─────────────────────────────────────────────
    // ファイルツリー描画
    // ─────────────────────────────────────────────
    function renderFileTree() {
        if (!fileListNav) return;

        // パス群からツリー構造を生成
        const rootTree = { isDir: true, children: {}, name: 'project' };

        const sortedKeys = Object.keys(files).sort((a, b) => {
            // index.html は最上部、その他アルファベット順
            if (a === 'index.html') return -1;
            if (b === 'index.html') return 1;
            return a.localeCompare(b);
        });

        sortedKeys.forEach(path => {
            const parts = path.split('/');
            let curr = rootTree;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = (i === parts.length - 1);
                if (isLast) {
                    curr.children[part] = { isDir: false, path: path, name: part, file: files[path] };
                } else {
                    if (!curr.children[part]) {
                        curr.children[part] = { isDir: true, name: part, children: {} };
                    }
                    curr = curr.children[part];
                }
            }
        });

        // HTML生成 (ルートフォルダ表示)
        let html = `
        <div class="tree-folder-group is-open" id="folder-group-root">
            <button type="button" class="tree-item-row tree-item-root is-open" data-folder="root">
                <span class="tree-chevron"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></span>
                <span class="tree-icon icon-folder-svg"><svg viewBox="0 0 16 16"><path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v7A1.5 1.5 0 0 0 1.5 13h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H7.414l-1.707-1.707A1 1 0 0 0 5 2.5H1.5A1.5 1.5 0 0 0 0 4v.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></span>
                <span class="tree-label">${localDirHandle ? localDirHandle.name : 'my-project'}</span>
            </button>
            <div class="tree-folder-children">
                ${renderTreeChildren(rootTree.children, 1)}
            </div>
        </div>
        `;

        fileListNav.innerHTML = html;
        bindTreeEvents();
    }

    function renderTreeChildren(childrenObj, depth) {
        let html = '';
        const keys = Object.keys(childrenObj).sort((a, b) => {
            const itemA = childrenObj[a];
            const itemB = childrenObj[b];
            // フォルダを上に
            if (itemA.isDir && !itemB.isDir) return -1;
            if (!itemA.isDir && itemB.isDir) return 1;
            return a.localeCompare(b);
        });

        const indentHtml = '<span class="tree-indent-guide"></span>'.repeat(depth);

        keys.forEach(key => {
            const item = childrenObj[key];
            if (item.isDir) {
                html += `
                <div class="tree-folder-group is-open">
                    <button type="button" class="tree-item-row folder-item" data-folder="${key}">
                        ${indentHtml}
                        <span class="tree-chevron"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></span>
                        <span class="tree-icon icon-folder-svg"><svg viewBox="0 0 16 16"><path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v7A1.5 1.5 0 0 0 1.5 13h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H7.414l-1.707-1.707A1 1 0 0 0 5 2.5H1.5A1.5 1.5 0 0 0 0 4v.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></span>
                        <span class="tree-label">${escapeHtml(item.name)}</span>
                    </button>
                    <div class="tree-folder-children">
                        ${renderTreeChildren(item.children, depth + 1)}
                    </div>
                </div>
                `;
            } else {
                const isActive = (item.path === currentFileKey) ? 'active' : '';
                const type = item.file.type || detectFileType(item.path);
                const icon = getFileIconHtml(type, item.name.split('.').pop());

                html += `
                <button type="button" class="tree-item-row file-item ${isActive}" data-path="${escapeHtml(item.path)}">
                    ${indentHtml}
                    <span class="tree-chevron-spacer"></span>
                    ${icon}
                    <span class="tree-label">${escapeHtml(item.name)}</span>
                    <span class="tree-item-hover-actions">
                        <span class="tree-action-tiny-btn rename-btn" data-action="rename" data-path="${escapeHtml(item.path)}" title="名前を変更">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </span>
                        <span class="tree-action-tiny-btn delete-btn" data-action="delete" data-path="${escapeHtml(item.path)}" title="削除">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </span>
                    </span>
                </button>
                `;
            }
        });

        return html;
    }

    function bindTreeEvents() {
        // ファイルクリック
        fileListNav.querySelectorAll('.tree-item-row.file-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('.tree-action-tiny-btn');
                if (actionBtn) {
                    e.stopPropagation();
                    const action = actionBtn.dataset.action;
                    const path = actionBtn.dataset.path;
                    if (action === 'rename') promptRenameFile(path);
                    else if (action === 'delete') promptDeleteFile(path);
                    return;
                }
                const path = el.dataset.path;
                if (path) openFile(path);
            });
        });

        // フォルダ開閉トグル
        fileListNav.querySelectorAll('.tree-item-row.folder-item, .tree-item-row.tree-item-root').forEach(el => {
            el.addEventListener('click', () => {
                const group = el.closest('.tree-folder-group');
                if (group) {
                    const isOpen = group.classList.toggle('is-open');
                    const chevron = el.querySelector('.tree-chevron');
                    if (chevron) chevron.classList.toggle('closed', !isOpen);
                }
            });
        });
    }

    // ─────────────────────────────────────────────
    // タブ管理 & ファイル切り替え
    // ─────────────────────────────────────────────
    function openFile(path) {
        if (!files[path]) return;
        currentFileKey = path;

        if (!openTabs.includes(path)) {
            openTabs.push(path);
        }

        renderTabs();
        updateTreeActiveStatus();

        const file = files[path];
        if (file.isBinary || file.type === 'image') {
            showImageViewer(file);
        } else {
            showCodeEditor(file);
        }
    }

    function closeTab(path, e) {
        if (e) e.stopPropagation();
        const idx = openTabs.indexOf(path);
        if (idx !== -1) {
            openTabs.splice(idx, 1);
            if (currentFileKey === path) {
                if (openTabs.length > 0) {
                    const nextIdx = Math.max(0, idx - 1);
                    openFile(openTabs[nextIdx]);
                } else {
                    currentFileKey = Object.keys(files)[0] || '';
                    if (currentFileKey) openFile(currentFileKey);
                }
            } else {
                renderTabs();
            }
        }
    }

    function renderTabs() {
        if (!tabContainer) return;
        let html = '';
        openTabs.forEach(path => {
            const file = files[path];
            if (!file) return;
            const isActive = (path === currentFileKey) ? 'active' : '';
            const isDirty = file.isDirty ? 'is-dirty' : '';
            const type = file.type || detectFileType(path);
            const icon = getFileIconHtml(type, path.split('.').pop());

            html += `
            <div class="editor-tab ${isActive} ${isDirty}" data-path="${escapeHtml(path)}">
                ${icon}
                <span class="tab-title">${escapeHtml(file.name || path)}</span>
                <span class="tab-dirty-dot"></span>
                <button type="button" class="tab-close-btn" data-action="close" data-path="${escapeHtml(path)}" title="タブを閉じる">
                    <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4"/></svg>
                </button>
            </div>
            `;
        });
        tabContainer.innerHTML = html;

        tabContainer.querySelectorAll('.editor-tab').forEach(el => {
            el.addEventListener('click', (e) => {
                const closeBtn = e.target.closest('.tab-close-btn');
                if (closeBtn) {
                    closeTab(closeBtn.dataset.path, e);
                    return;
                }
                const path = el.dataset.path;
                if (path) openFile(path);
            });
        });

        updateUnsavedPill();
    }

    function updateTreeActiveStatus() {
        if (!fileListNav) return;
        fileListNav.querySelectorAll('.tree-item-row.file-item').forEach(el => {
            el.classList.toggle('active', el.dataset.path === currentFileKey);
        });
    }

    function updateUnsavedPill() {
        if (!unsavedStatusPill) return;
        const hasDirty = Object.values(files).some(f => f.isDirty);
        unsavedStatusPill.style.display = hasDirty ? 'inline-flex' : 'none';
    }

    // ─────────────────────────────────────────────
    // エディタ表示 & シンタックスハイライト
    // ─────────────────────────────────────────────
    function showCodeEditor(file) {
        if (imageViewerPane) imageViewerPane.style.display = 'none';
        if (editorBodyContainer) editorBodyContainer.style.display = 'flex';
        if (diagnosticsBar) diagnosticsBar.style.display = 'flex';

        codeTextarea.value = file.content || '';
        updateCodeHighlight();
        runDiagnostics();

        if (stickyScrollController) {
            stickyScrollController.updateFile(currentFileKey, file.content || '', file.type || 'text');
            stickyScrollController.updateScroll(codeTextarea.scrollTop, codeTextarea.scrollLeft);
        }
    }

    function showImageViewer(file) {
        if (editorBodyContainer) editorBodyContainer.style.display = 'none';
        if (diagnosticsBar) diagnosticsBar.style.display = 'none';
        if (diagnosticsPanel) diagnosticsPanel.style.display = 'none';
        if (imageViewerPane) imageViewerPane.style.display = 'flex';

        if (imageViewerPath) imageViewerPath.textContent = file.path;
        if (imageViewerType) imageViewerType.textContent = (file.path.split('.').pop() || 'IMAGE').toUpperCase();

        if (imageViewerImg) {
            imageViewerImg.src = file.content || ''; // dataURL
            imageViewerImg.onload = () => {
                if (imageViewerDims) {
                    imageViewerDims.textContent = `${imageViewerImg.naturalWidth} × ${imageViewerImg.naturalHeight} px`;
                }
            };
        }
    }

    function updateCodeHighlight() {
        const file = files[currentFileKey];
        if (!file || file.isBinary) return;

        const text = codeTextarea.value;
        file.content = text;

        // 行番号
        const lines = text.split('\n');
        const lineCount = lines.length;
        let lineHtml = '';
        for (let i = 1; i <= lineCount; i++) {
            let cls = 'line-num';
            if (errorLineSet.has(i)) cls += ' has-error';
            else if (warningLineSet.has(i)) cls += ' has-warning';
            lineHtml += `<div class="${cls}" data-line="${i}">${i}</div>`;
        }
        lineNumbersInner.innerHTML = lineHtml;

        // ハイライト & インデントガイド
        codeHighlight.innerHTML = renderIndentGuides(highlightSyntax(text, file.type), text) + '\n';

        renderMinimap();
    }

    function syncScroll() {
        const scrollTop = codeTextarea.scrollTop;
        const scrollLeft = codeTextarea.scrollLeft;
        codeHighlight.scrollTop = scrollTop;
        codeHighlight.scrollLeft = scrollLeft;
        lineNumbersInner.style.transform = `translateY(-${scrollTop}px)`;

        if (stickyScrollController) {
            stickyScrollController.updateScroll(scrollTop, scrollLeft);
        }
        syncMinimapSlider();
        renderMinimap();
    }

    // ─────────────────────────────────────────────
    // シンタックスハイライター (VS Code Dark+再現)
    // ─────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function highlightSyntax(code, type) {
        if (!code) return '';

        if (type === 'javascript' || type === 'json') {
            const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|true|false|null|undefined|this|import|export|from|async|await|try|catch|finally|switch|case|break|default)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z0-9_$]+(?=\s*:))/g;
            let result = '';
            let lastIndex = 0;
            let match;
            while ((match = regex.exec(code)) !== null) {
                result += escapeHtml(code.slice(lastIndex, match.index));
                if (match[1]) result += '<span class="token-comment">' + escapeHtml(match[1]) + '</span>';
                else if (match[2]) result += '<span class="token-string">' + escapeHtml(match[2]) + '</span>';
                else if (match[3]) result += '<span class="token-keyword">' + escapeHtml(match[3]) + '</span>';
                else if (match[4]) result += '<span class="token-number">' + escapeHtml(match[4]) + '</span>';
                else if (match[5]) result += '<span class="token-property">' + escapeHtml(match[5]) + '</span>';
                lastIndex = regex.lastIndex;
            }
            result += escapeHtml(code.slice(lastIndex));
            return result;
        } else if (type === 'css') {
            const regex = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))|(-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b)|([a-zA-Z0-9_-]+(?=\s*:))|([^{}]+(?=\{))/g;
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
                if (match[1]) result += '<span class="token-comment">' + escapeHtml(match[1]) + '</span>';
                else if (match[2]) result += '<span class="token-doctype">' + escapeHtml(match[2]) + '</span>';
                else if (match[3]) {
                    const tagStr = match[3];
                    const open = tagStr.startsWith('</') ? '</' : '<';
                    const name = tagStr.slice(open.length);
                    result += '<span class="token-punctuation">' + escapeHtml(open) + '</span><span class="token-tag-name">' + escapeHtml(name) + '</span>';
                }
                else if (match[4]) result += '<span class="token-punctuation">' + escapeHtml(match[4]) + '</span>';
                else if (match[5]) result += '<span class="token-attr-name">' + escapeHtml(match[5]) + '</span>';
                else if (match[6]) result += '<span class="token-attr-value">' + escapeHtml(match[6]) + '</span>';
                else if (match[7]) result += '<span class="token-entity">' + escapeHtml(match[7]) + '</span>';
                lastIndex = regex.lastIndex;
            }
            result += escapeHtml(code.slice(lastIndex));
            return result;
        } else if (type === 'markdown') {
            const lines = code.split('\n');
            return lines.map(line => {
                if (/^#{1,6}\s/.test(line)) return '<span class="token-keyword">' + escapeHtml(line) + '</span>';
                if (/^[-*+]\s/.test(line)) return '<span class="token-property">' + escapeHtml(line) + '</span>';
                if (/^>\s/.test(line)) return '<span class="token-comment">' + escapeHtml(line) + '</span>';
                if (/^```/.test(line)) return '<span class="token-string">' + escapeHtml(line) + '</span>';
                return escapeHtml(line);
            }).join('\n');
        }

        return escapeHtml(code);
    }

    function renderIndentGuides(highlightedHtml, rawText) {
        const rawLines = rawText.split('\n');
        const hLines = highlightedHtml.split('\n');
        const result = [];

        for (let i = 0; i < hLines.length; i++) {
            const raw = rawLines[i] || '';
            const h = hLines[i];
            const match = raw.match(/^( +)/);
            if (!match) {
                result.push(h);
                continue;
            }
            const spaces = match[1].length;
            const guideCount = Math.floor(spaces / 2);
            let guideSpans = '';
            for (let g = 0; g < guideCount; g++) {
                guideSpans += `<span class="indent-guide" style="left: calc(14px + ${g * 2 * 7.8}px);"></span>`;
            }
            result.push(guideSpans + h);
        }
        return result.join('\n');
    }

    // ─────────────────────────────────────────────
    // ミニマップ (コードマップ)
    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
    // ミニマップ (コードマップ) レンダリング & インタラクション (超精密スクリーンショット風)
    // ─────────────────────────────────────────────
    function initMinimap() {
        initMinimapInteraction();
    }

    function renderMinimap() {
        if (!editorMinimapCanvas || !editorMinimapWrap) return;
        const file = files[currentFileKey];
        if (!file || file.isBinary || file.type === 'image') {
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

        // 右端エラーマーカーの描画
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
            const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|true|false|null|undefined|this|import|export|from)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z0-9_$]+(?=\s*:))/g;
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

    // ─────────────────────────────────────────────
    // スティッキースクロール初期化
    // ─────────────────────────────────────────────
    function initStickyScroll() {
        const container = document.getElementById('editor-sticky-scroll-container');
        const linesEl = document.getElementById('sticky-scroll-lines');
        if (!container || !linesEl || !window.StickyScrollController) return;

        stickyScrollController = new window.StickyScrollController({
            container: container,
            linesWrapper: linesEl,
            codeTextarea: codeTextarea,
            highlightFn: (code, type) => highlightSyntax(code, type),
            indentGuideFn: (highlighted, text) => renderIndentGuides(highlighted, text),
            jumpToLineFn: (targetLine, idx) => {
                jumpToLine(targetLine);
            },
            errorLineSet: errorLineSet,
            warningLineSet: warningLineSet
        });
    }

    function jumpToLine(line) {
        if (!codeTextarea) return;
        const text = codeTextarea.value;
        const lines = text.split('\n');
        line = Math.max(1, Math.min(line, lines.length));

        let charIdx = 0;
        for (let i = 0; i < line - 1; i++) {
            charIdx += lines[i].length + 1;
        }

        codeTextarea.focus();
        codeTextarea.setSelectionRange(charIdx, charIdx);
        codeTextarea.scrollTop = Math.max(0, (line - 3) * EDITOR_LINE_HEIGHT);
        syncScroll();
    }

    // ─────────────────────────────────────────────
    // 構文チェック & 診断エンジン (Linter)
    // ─────────────────────────────────────────────
    function runDiagnostics() {
        if (!window.Linter) return;
        clearTimeout(diagnosticsDebounceTimer);
        diagnosticsDebounceTimer = setTimeout(() => {
            const file = files[currentFileKey];
            if (!file || file.isBinary) return;

            const result = window.Linter.lint(currentFileKey, file.content, files);
            currentFileIssues = (result && result.issues) ? result.issues : [];

            errorLineSet.clear();
            warningLineSet.clear();

            currentFileIssues.forEach(iss => {
                if (iss.severity === 'error') errorLineSet.add(iss.line);
                else warningLineSet.add(iss.line);
            });

            updateDiagnosticsBar();
            renderDiagnosticsList();
            updateCodeHighlightMarkers();
        }, 300);
    }

    function updateDiagnosticsBar() {
        if (!diagnosticsBar) return;
        const errCount = errorLineSet.size;
        const warnCount = warningLineSet.size;

        if (errCount > 0) {
            diagnosticsStatusDot.className = 'diagnostics-status-dot error';
            diagnosticsStatusText.textContent = `エラー: ${errCount} 件 (クリックして確認)`;
        } else if (warnCount > 0) {
            diagnosticsStatusDot.className = 'diagnostics-status-dot warning';
            diagnosticsStatusText.textContent = `警告: ${warnCount} 件`;
        } else {
            diagnosticsStatusDot.className = 'diagnostics-status-dot ok';
            diagnosticsStatusText.textContent = 'エラーはありません';
        }
    }

    function renderDiagnosticsList() {
        if (!diagnosticsList) return;
        if (currentFileIssues.length === 0) {
            diagnosticsList.innerHTML = '<div class="diagnostics-empty-msg">エラーや警告は見つかりませんでした。コードは正常です！</div>';
            return;
        }

        let html = '';
        currentFileIssues.forEach(iss => {
            const isErr = (iss.severity === 'error');
            const icon = isErr ? '❌' : '⚠️';
            html += `
            <div class="diagnostic-entry ${iss.severity}" data-line="${iss.line}">
                <span class="diagnostic-badge">${icon} 行 ${iss.line}</span>
                <span class="diagnostic-msg">${escapeHtml(iss.message)}</span>
                ${iss.hint ? `<span class="diagnostic-hint">💡 ${escapeHtml(iss.hint)}</span>` : ''}
            </div>
            `;
        });
        diagnosticsList.innerHTML = html;

        diagnosticsList.querySelectorAll('.diagnostic-entry').forEach(el => {
            el.addEventListener('click', () => {
                const line = parseInt(el.dataset.line, 10);
                if (line) jumpToLine(line);
            });
        });
    }

    function updateCodeHighlightMarkers() {
        const lineNums = lineNumbersInner.querySelectorAll('.line-num');
        lineNums.forEach(el => {
            const line = parseInt(el.dataset.line, 10);
            el.classList.toggle('has-error', errorLineSet.has(line));
            el.classList.toggle('has-warning', warningLineSet.has(line));
        });
    }

    // ─────────────────────────────────────────────
    // プレビュー生成 & コンソール連携
    // ─────────────────────────────────────────────
    function updatePreview() {
        if (!previewIframe) return;

        const htmlFile = files['index.html'];
        if (!htmlFile) {
            previewIframe.srcdoc = '<h1>index.html が見つかりません</h1>';
            return;
        }

        let html = htmlFile.content || '';

        // コンソールキャプチャ用ブリッジスクリプト
        const bridgeScript = `
        <script>
        (function() {
            const send = (type, args) => {
                try {
                    window.parent.postMessage({
                        source: 'studio-preview-console',
                        type: type,
                        args: Array.from(args).map(a => {
                            if (typeof a === 'object') {
                                try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
                            }
                            return String(a);
                        }),
                        time: new Date().toLocaleTimeString()
                    }, '*');
                } catch(e){}
            };
            ['log', 'warn', 'error', 'info'].forEach(m => {
                const orig = console[m];
                console[m] = function(...args) {
                    orig && orig.apply(console, args);
                    send(m, args);
                };
            });
            window.addEventListener('error', e => {
                send('error', [\`エラー: \${e.message} (\${e.filename ? e.filename.split('/').pop() : 'index'}:\${e.lineno})\`]);
            });
            window.addEventListener('unhandledrejection', e => {
                send('error', [\`未処理のPromise拒否: \${e.reason}\`]);
            });
        })();
        <\/script>
        `;

        // <head> 内の先頭にブリッジスクリプトを注入
        if (html.includes('<head>')) {
            html = html.replace('<head>', '<head>' + bridgeScript);
        } else {
            html = bridgeScript + html;
        }

        // 相対リンクのCSSを仮想ファイルからインライン注入
        html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
            const cleanHref = href.split('?')[0].replace(/^\.\//, '');
            if (files[cleanHref] && files[cleanHref].type === 'css') {
                return `<style data-source="${cleanHref}">\n${files[cleanHref].content}\n</style>`;
            }
            return match;
        });

        // 相対リンクのJSを仮想ファイルからインライン注入
        html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
            const cleanSrc = src.split('?')[0].replace(/^\.\//, '');
            if (files[cleanSrc] && files[cleanSrc].type === 'javascript') {
                return `<script data-source="${cleanSrc}">\n${files[cleanSrc].content}\n<\/script>`;
            }
            return match;
        });

        // 画像などの相対パスを dataURL に差し替え（画像が保存されている場合）
        for (const k in files) {
            if (files[k].isBinary && files[k].content) {
                const regex = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                html = html.replace(regex, files[k].content);
            }
        }

        previewIframe.srcdoc = html;
        if (previewUrlText) previewUrlText.textContent = 'http://localhost:8080/index.html';
    }

    // ─────────────────────────────────────────────
    // 内蔵コンソール (Console) 実装
    // ─────────────────────────────────────────────
    function initConsole() {
        window.addEventListener('message', (e) => {
            if (!e.data || e.data.source !== 'studio-preview-console') return;
            addConsoleLog(e.data.type, e.data.args, e.data.time);
        });

        if (btnClearConsole) {
            btnClearConsole.addEventListener('click', () => {
                consoleLogs = [];
                consoleErrorCount = 0;
                renderConsole();
            });
        }

        if (btnToggleConsole) {
            btnToggleConsole.addEventListener('click', () => {
                isConsoleOpen = !isConsoleOpen;
                studioConsolePane.style.display = isConsoleOpen ? 'flex' : 'none';
                btnToggleConsole.classList.toggle('active', isConsoleOpen);
            });
        }
    }

    function addConsoleLog(type, args, time) {
        consoleLogs.push({ type, args, time });
        if (type === 'error') {
            consoleErrorCount++;
        }
        renderConsole();
    }

    function renderConsole() {
        if (!consoleBody) return;

        if (consoleErrorBadge) {
            consoleErrorBadge.textContent = consoleErrorCount;
            consoleErrorBadge.classList.toggle('has-error', consoleErrorCount > 0);
        }

        if (consoleLogs.length === 0) {
            consoleBody.innerHTML = '<div class="console-empty-notice">console.log() やエラーがここに出力されます</div>';
            return;
        }

        let html = '';
        consoleLogs.forEach(log => {
            let icon = 'ℹ️';
            if (log.type === 'error') icon = '❌';
            else if (log.type === 'warn') icon = '⚠️';
            else if (log.type === 'log') icon = '›';

            const content = log.args.map(a => escapeHtml(a)).join(' ');
            html += `
            <div class="console-entry ${log.type}">
                <span class="console-entry-icon">${icon}</span>
                <span class="console-entry-content">${content}</span>
                <span class="console-entry-time">${log.time || ''}</span>
            </div>
            `;
        });
        consoleBody.innerHTML = html;
        consoleBody.scrollTop = consoleBody.scrollHeight;
    }

    // ─────────────────────────────────────────────
    // 保存 & 外部連携
    // ─────────────────────────────────────────────
    async function saveProject() {
        const file = files[currentFileKey];
        if (file && !file.isBinary) {
            file.content = codeTextarea.value;
            file.isDirty = false;
        }

        // 全ファイルの isDirty をリセット
        for (const k in files) {
            files[k].isDirty = false;
        }

        saveFilesToStorage();
        renderTabs();
        updatePreview();

        // もしローカルフォルダが開かれている場合は、ディスクにも直接書き込む
        if (localDirHandle && file && fileHandlesMap[file.path]) {
            try {
                const fh = fileHandlesMap[file.path];
                const writable = await fh.createWritable();
                await writable.write(file.content);
                await writable.close();
                showToast(`ローカルファイル ${file.name} を保存しました`);
                return;
            } catch (err) {
                console.error('File write error:', err);
            }
        }

        showToast('保存してプレビューに反映しました');
    }

    // ─────────────────────────────────────────────
    // File System Access API (ローカルフォルダを直接開く)
    // ─────────────────────────────────────────────
    async function openLocalFolder() {
        if (!window.showDirectoryPicker) {
            alert('お使いのブラウザはローカルフォルダ直接操作に対応していません。(Chrome / Edge推奨)');
            return;
        }

        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            localDirHandle = dirHandle;
            fileHandlesMap = {};
            files = {};

            await scanDirectory(dirHandle, '');
            currentFileKey = files['index.html'] ? 'index.html' : Object.keys(files)[0];
            openTabs = [currentFileKey];

            saveFilesToStorage();
            renderFileTree();
            openFile(currentFileKey);
            updatePreview();
            showToast(`フォルダ「${dirHandle.name}」を開きました`);
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('Directory picker error:', e);
                alert('フォルダの読み込みに失敗しました: ' + e.message);
            }
        }
    }

    async function scanDirectory(dirHandle, currentPath) {
        for await (const entry of dirHandle.values()) {
            const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
                if (entry.name.startsWith('.')) continue; // .DS_Store などスキップ
                const fileObj = await entry.getFile();
                fileHandlesMap[relPath] = entry;

                const ext = entry.name.split('.').pop().toLowerCase();
                const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);

                if (isImg) {
                    const reader = new FileReader();
                    const dataUrl = await new Promise((res) => {
                        reader.onload = () => res(reader.result);
                        reader.readAsDataURL(fileObj);
                    });
                    files[relPath] = {
                        name: entry.name,
                        path: relPath,
                        type: 'image',
                        isBinary: true,
                        content: dataUrl,
                        isDirty: false
                    };
                } else {
                    const text = await fileObj.text();
                    files[relPath] = {
                        name: entry.name,
                        path: relPath,
                        type: detectFileType(entry.name),
                        content: text,
                        isDirty: false
                    };
                }
            } else if (entry.kind === 'directory') {
                if (['.git', 'node_modules', '.vscode'].includes(entry.name)) continue;
                await scanDirectory(entry, relPath);
            }
        }
    }

    // ─────────────────────────────────────────────
    // JSZip: ZIP書き出し & ドラッグ＆ドロップ展開
    // ─────────────────────────────────────────────
    async function exportZip() {
        if (!window.JSZip) {
            showToast('ZIPライブラリを読み込み中です...');
            return;
        }

        const zip = new window.JSZip();
        for (const path in files) {
            const file = files[path];
            if (file.isBinary && file.content.startsWith('data:')) {
                // dataURL から base64 を取り出してバイナリ保存
                const base64Data = file.content.split(',')[1];
                zip.file(path, base64Data, { base64: true });
            } else {
                zip.file(path, file.content || '');
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${localDirHandle ? localDirHandle.name : 'web-project'}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        showToast('プロジェクトをZIPで書き出しました！');
    }

    function initDragAndDrop() {
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (dragDropOverlay) dragDropOverlay.classList.add('is-active');
        });

        window.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null && dragDropOverlay) {
                dragDropOverlay.classList.remove('is-active');
            }
        });

        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            if (dragDropOverlay) dragDropOverlay.classList.remove('is-active');

            const dt = e.dataTransfer;
            if (!dt || !dt.files || dt.files.length === 0) return;

            const file = dt.files[0];
            if (file.name.endsWith('.zip')) {
                await loadZipFile(file);
            } else {
                // 単一ファイルのドロップ読み込み
                const text = await file.text();
                files[file.name] = {
                    name: file.name,
                    path: file.name,
                    type: detectFileType(file.name),
                    content: text,
                    isDirty: false
                };
                renderFileTree();
                openFile(file.name);
                showToast(`ファイル ${file.name} を追加しました`);
            }
        });
    }

    async function loadZipFile(file) {
        if (!window.JSZip) return;
        try {
            const zip = await window.JSZip.loadAsync(file);
            files = {};
            const promises = [];

            zip.forEach((relPath, zipEntry) => {
                if (zipEntry.dir || relPath.startsWith('__MACOSX/') || relPath.includes('/.')) return;

                const p = (async () => {
                    const ext = relPath.split('.').pop().toLowerCase();
                    const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);

                    if (isImg) {
                        const base64 = await zipEntry.async('base64');
                        files[relPath] = {
                            name: relPath.split('/').pop(),
                            path: relPath,
                            type: 'image',
                            isBinary: true,
                            content: `data:image/${ext};base64,${base64}`,
                            isDirty: false
                        };
                    } else {
                        const text = await zipEntry.async('text');
                        files[relPath] = {
                            name: relPath.split('/').pop(),
                            path: relPath,
                            type: detectFileType(relPath),
                            content: text,
                            isDirty: false
                        };
                    }
                })();
                promises.push(p);
            });

            await Promise.all(promises);
            currentFileKey = files['index.html'] ? 'index.html' : Object.keys(files)[0];
            openTabs = [currentFileKey];

            saveFilesToStorage();
            renderFileTree();
            openFile(currentFileKey);
            updatePreview();
            showToast(`ZIP「${file.name}」を展開しました！`);
        } catch (e) {
            console.error('ZIP load error:', e);
            alert('ZIPの展開に失敗しました: ' + e.message);
        }
    }

    // ─────────────────────────────────────────────
    // 新規ファイル / リネーム / 削除 モーダル
    // ─────────────────────────────────────────────
    let modalActionCallback = null;

    function openModal(title, label, defaultValue, confirmText, callback) {
        if (!ideModalBackdrop) return;
        modalTitle.textContent = title;
        modalInputLabel.textContent = label;
        modalInput.value = defaultValue || '';
        btnModalConfirm.textContent = confirmText || 'OK';
        modalActionCallback = callback;

        ideModalBackdrop.classList.add('is-open');
        modalInput.focus();
        modalInput.select();
    }

    function closeModal() {
        if (ideModalBackdrop) ideModalBackdrop.classList.remove('is-open');
        modalActionCallback = null;
    }

    function promptNewFile() {
        openModal('新規ファイルの作成', 'ファイル名 (パス指定可能):', 'newfile.js', '作成', (val) => {
            const path = val.trim().replace(/^\//, '');
            if (!path) return;
            if (files[path]) {
                alert('既に同名のファイルが存在します');
                return;
            }
            files[path] = {
                name: path.split('/').pop(),
                path: path,
                type: detectFileType(path),
                content: '',
                isDirty: true
            };
            saveFilesToStorage();
            renderFileTree();
            openFile(path);
            showToast(`ファイル ${path} を作成しました`);
        });
    }

    function promptNewFolder() {
        openModal('新規フォルダの作成', 'フォルダ名:', 'components', '作成', (val) => {
            const folder = val.trim().replace(/^\/|\/$/g, '');
            if (!folder) return;
            // フォルダをツリーに表示させるため、ダミーまたはindexファイルを作成
            const dummyPath = `${folder}/.gitkeep`;
            files[dummyPath] = {
                name: '.gitkeep',
                path: dummyPath,
                type: 'text',
                content: '',
                isDirty: false
            };
            saveFilesToStorage();
            renderFileTree();
            showToast(`フォルダ ${folder} を作成しました`);
        });
    }

    function promptRenameFile(oldPath) {
        openModal('名前の変更', '新しいファイル名:', oldPath, '変更', (newPath) => {
            newPath = newPath.trim().replace(/^\//, '');
            if (!newPath || newPath === oldPath) return;
            if (files[newPath]) {
                alert('既に同名のファイルが存在します');
                return;
            }
            files[newPath] = { ...files[oldPath], name: newPath.split('/').pop(), path: newPath, type: detectFileType(newPath) };
            delete files[oldPath];

            const tabIdx = openTabs.indexOf(oldPath);
            if (tabIdx !== -1) openTabs[tabIdx] = newPath;
            if (currentFileKey === oldPath) currentFileKey = newPath;

            saveFilesToStorage();
            renderFileTree();
            openFile(currentFileKey);
            showToast(`名前を ${newPath} に変更しました`);
        });
    }

    function promptDeleteFile(path) {
        if (confirm(`本当に ${path} を削除しますか？`)) {
            delete files[path];
            closeTab(path);
            saveFilesToStorage();
            renderFileTree();
            showToast(`ファイル ${path} を削除しました`);
        }
    }

    // ─────────────────────────────────────────────
    // イベントバインド (キーボード・エディタ操作)
    // ─────────────────────────────────────────────
    function initEvents() {
        // 入力イベント
        codeTextarea.addEventListener('input', () => {
            const file = files[currentFileKey];
            if (!file) return;

            file.isDirty = true;
            updateCodeHighlight();
            runDiagnostics();
            renderTabs();

            if (stickyScrollController) {
                stickyScrollController.updateFile(currentFileKey, codeTextarea.value, file.type || 'text');
            }
        });

        codeTextarea.addEventListener('scroll', syncScroll);

        // タブキー・インデント・括弧補完
        codeTextarea.addEventListener('keydown', (e) => {
            // Tab キー
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = codeTextarea.selectionStart;
                const end = codeTextarea.selectionEnd;
                const val = codeTextarea.value;

                if (e.shiftKey) {
                    // 逆インデント
                    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                    if (val.substr(lineStart, 2) === '  ') {
                        codeTextarea.value = val.substring(0, lineStart) + val.substring(lineStart + 2);
                        codeTextarea.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
                    }
                } else {
                    // 2スペース挿入
                    codeTextarea.value = val.substring(0, start) + '  ' + val.substring(end);
                    codeTextarea.setSelectionRange(start + 2, start + 2);
                }
                codeTextarea.dispatchEvent(new Event('input'));
            }

            // 保存ショートカット (⌘S / Ctrl+S)
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveProject();
            }
        });

        // ボタンクリックイベント
        if (btnSave) btnSave.addEventListener('click', saveProject);
        if (btnExportZip) btnExportZip.addEventListener('click', exportZip);
        if (btnOpenFolder) btnOpenFolder.addEventListener('click', openLocalFolder);
        if (btnThemeToggle) btnThemeToggle.addEventListener('click', toggleTheme);

        if (btnCopyCode) {
            btnCopyCode.addEventListener('click', () => {
                const text = codeTextarea.value;
                navigator.clipboard.writeText(text).then(() => {
                    showToast('コードをクリップボードにコピーしました');
                });
            });
        }

        if (btnCopyImagePath && imageViewerPath) {
            btnCopyImagePath.addEventListener('click', () => {
                navigator.clipboard.writeText(imageViewerPath.textContent).then(() => {
                    showToast('画像パスをコピーしました');
                });
            });
        }

        if (btnTreeNewFile) btnTreeNewFile.addEventListener('click', promptNewFile);
        if (btnTreeNewFolder) btnTreeNewFolder.addEventListener('click', promptNewFolder);
        if (btnTreeRefresh) btnTreeRefresh.addEventListener('click', () => {
            renderFileTree();
            showToast('エクスプローラーを更新しました');
        });

        // プレビュー操作
        if (btnPreviewRefresh) {
            btnPreviewRefresh.addEventListener('click', () => {
                updatePreview();
                showToast('プレビューを再読み込みしました');
            });
        }

        if (btnOpenExternal) {
            btnOpenExternal.addEventListener('click', () => {
                const htmlFile = files['index.html'];
                if (!htmlFile) return;
                const blob = new Blob([htmlFile.content], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            });
        }

        // 診断パネル開閉
        if (btnToggleDiagnostics) {
            btnToggleDiagnostics.addEventListener('click', () => {
                diagnosticsPanelOpen = !diagnosticsPanelOpen;
                diagnosticsPanel.style.display = diagnosticsPanelOpen ? 'flex' : 'none';
                btnToggleDiagnostics.textContent = diagnosticsPanelOpen ? '閉じる' : '詳細を表示';
            });
        }

        // モーダルイベント
        if (btnModalCancel) btnModalCancel.addEventListener('click', closeModal);
        if (btnModalConfirm) {
            btnModalConfirm.addEventListener('click', () => {
                if (modalActionCallback) {
                    modalActionCallback(modalInput.value);
                }
                closeModal();
            });
        }
        modalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (modalActionCallback) modalActionCallback(modalInput.value);
                closeModal();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });

        // リサイザー (エディタ vs プレビュー)
        initPaneResizer();
    }

    function initPaneResizer() {
        if (!paneResizer || !previewPane) return;
        let isResizing = false;

        paneResizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const containerWidth = document.querySelector('.studio-workspace').clientWidth;
            const newPreviewWidth = containerWidth - e.clientX;
            if (newPreviewWidth > 200 && newPreviewWidth < containerWidth - 250) {
                previewPane.style.width = `${newPreviewWidth}px`;
            }
        });

        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    // ─────────────────────────────────────────────
    // トースト通知
    // ─────────────────────────────────────────────
    let toastTimer = null;
    function showToast(msg) {
        if (!toast || !toastMsg) return;
        toastMsg.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    // 起動
    window.addEventListener('DOMContentLoaded', init);

})(window);
