// ===============================================================
// Space Invaders Studio Controller (ide.js)
// ===============================================================

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
            content: `<!-- ゲームHTML -->`
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
        'linter.js': {
            name: 'linter.js',
            path: '../linter.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            desc: '構文診断・リアルタイムLinter',
            content: `// 構文診断エンジン (linter.js)`
        },
        'monaca-bridge.js': {
            name: 'monaca-bridge.js',
            path: '../monaca-bridge.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            desc: 'Monaca IDE連携同期スクリプト',
            content: `// Monacaクラウド連携ブリッジ`
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
            editable: true,
            isDirty: false,
            desc: 'プロジェクトパッケージ設定'
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
        'editor/index.html': {
            name: 'index.html',
            path: './index.html',
            type: 'html',
            editable: true,
            isDirty: false,
            desc: 'エディタ画面構造'
        },
        'editor/ide.js': {
            name: 'ide.js',
            path: './ide.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            desc: 'エディタ本体スクリプト'
        },
        'editor/linter.js': {
            name: 'linter.js',
            path: './linter.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            desc: '構文診断エンジン'
        },
        'editor/ide.css': {
            name: 'ide.css',
            path: './ide.css',
            type: 'css',
            editable: true,
            isDirty: false,
            desc: 'エディタUIスタイル'
        }
    };

    let openTabs = ['config.js', 'style.css'];
    let currentFileKey = 'config.js';

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

    // ─────────────────────────────────────────────
    // 実ファイルの自動フェッチ
    // ─────────────────────────────────────────────
    async function loadRealFiles() {
        for (let key in files) {
            if (files[key].isBinary) {
                // 画像ファイルなどバイナリはテキストfetchしない
                continue;
            }
            try {
                const resp = await fetch(files[key].path + '?t=' + Date.now());
                if (resp.ok) {
                    files[key].content = await resp.text();
                    files[key].baselineContent = files[key].content;
                    files[key].isDirty = false;
                }
            } catch (e) {
                console.warn('ファイルの読み込みに失敗しました:', key, e);
            }
        }
        if (files[currentFileKey] && files[currentFileKey].isBinary) {
            renderImageViewer(currentFileKey);
        } else {
            renderEditor();
        }
        updatePreview();
        updateAllFilesDiagnostics();
        if (spritePane && spritePane.style.display !== 'none') {
            loadSpriteFromConfig();
            renderSpriteGrid();
            broadcastLiveSprite();
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
            const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|true|false|null|undefined|this|import|export|from)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z0-9_$]+(?=\s*:))/g;
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
            const regex = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9-]+)|([a-zA-Z0-9-]+(?==))|(".*?"|'.*?')/g;
            let result = '';
            let lastIndex = 0;
            let match;
            while ((match = regex.exec(code)) !== null) {
                result += escapeHtml(code.slice(lastIndex, match.index));
                if (match[1]) result += '<span class="token-comment">' + escapeHtml(match[1]) + '</span>';
                else if (match[2]) result += '<span class="token-tag">' + escapeHtml(match[2]) + '</span>';
                else if (match[3]) result += '<span class="token-attr-name">' + escapeHtml(match[3]) + '</span>';
                else if (match[4]) result += '<span class="token-attr-value">' + escapeHtml(match[4]) + '</span>';
                lastIndex = regex.lastIndex;
            }
            result += escapeHtml(code.slice(lastIndex));
            return result;
        }

        return escapeHtml(code);
    }

    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
    // エディタ描画 & 行番号完全ピクセル同期
    // ─────────────────────────────────────────────
    function renderEditor() {
        const file = files[currentFileKey];
        if (!file) return;

        codeTextarea.value = file.content;
        codeTextarea.readOnly = !file.editable;
        runDiagnostics(currentFileKey, true);
        updateCodeHighlight();
        updateTabsUI();
        updateSidebarUI();
        syncScroll();
    }

    // ─────────────────────────────────────────────
    // 構文診断 (Linter) 連携 & 初心者向けエラー表示
    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
    // 構文診断 (Linter) 連携 & 初心者向けエラー表示
    // ─────────────────────────────────────────────
    function runDiagnostics(fileKey, skipHighlightUpdate) {
        const file = files[fileKey];
        if (!file || !window.Linter) {
            currentFileIssues = [];
            errorLineSet.clear();
            warningLineSet.clear();
            updateDiagnosticsUI(fileKey);
            return;
        }

        // ベースラインとの差分行を計算（あなたが編集した箇所を推測）
        const changedLines = window.Linter.computeChangedLines(file.baselineContent || '', file.content);

        currentFileIssues = window.Linter.lint(fileKey, file.content, {
            baselineCode: file.baselineContent,
            changedLines: changedLines
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

        updateDiagnosticsUI(fileKey);

        if (!skipHighlightUpdate) {
            updateLineNumberIndicators();
        }

        // 見ているファイルに関係なく、全ファイルのエラーをディレクトリツリーに反映
        updateAllFilesDiagnostics();
    }

    // 全ファイルのエラー状態マップ (ファイルパス -> エラー件数)
    const fileErrorCountMap = {};

    function updateAllFilesDiagnostics() {
        if (!window.Linter) return;

        for (let k in files) {
            const f = files[k];
            if (!f || f.isBinary || f.type === 'xml' || f.type === 'text') continue;
            try {
                const changedLines = window.Linter.computeChangedLines(f.baselineContent || '', f.content);
                const issues = window.Linter.lint(k, f.content, {
                    baselineCode: f.baselineContent,
                    changedLines: changedLines
                });
                const errCount = (issues || []).filter(i => i.severity === 'error').length;
                fileErrorCountMap[k] = errCount;
            } catch (e) {
                console.warn('Linter check failed for', k, e);
            }
        }

        updateFileTreeErrorIndicators();
    }

    function updateFileTreeErrorIndicators() {
        const fileItems = document.querySelectorAll('.tree-item-row.file-item');
        const folderGroups = document.querySelectorAll('.tree-folder-group');

        // 各ファイルの赤字＆エラーバッジ（!）の反映
        fileItems.forEach(el => {
            const path = el.getAttribute('data-path');
            const errCount = fileErrorCountMap[path] || 0;
            const existingBadge = el.querySelector('.tree-error-badge');

            if (errCount > 0) {
                el.classList.add('has-error');
                if (!existingBadge) {
                    const badge = document.createElement('span');
                    badge.className = 'tree-error-badge';
                    badge.textContent = '!';
                    badge.title = `構文エラーが ${errCount} 件あります`;
                    el.appendChild(badge);
                } else {
                    existingBadge.title = `構文エラーが ${errCount} 件あります`;
                }
            } else {
                el.classList.remove('has-error');
                if (existingBadge) {
                    existingBadge.remove();
                }
            }
        });

        // 親フォルダグループの赤ドット反映（内部にエラーファイルがあるか）
        folderGroups.forEach(fg => {
            const toggleBtn = fg.querySelector(':scope > .tree-item-row[data-folder]');
            if (!toggleBtn) return;

            const childErrors = fg.querySelectorAll('.tree-item-row.file-item.has-error');
            const existingDot = toggleBtn.querySelector('.folder-error-dot');

            if (childErrors.length > 0) {
                toggleBtn.classList.add('has-error-child');
                if (!existingDot) {
                    const dot = document.createElement('span');
                    dot.className = 'folder-error-dot';
                    dot.title = `フォルダ内のファイルにエラーがあります`;
                    toggleBtn.appendChild(dot);
                }
            } else {
                toggleBtn.classList.remove('has-error-child');
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
        renderMinimap();
    }

    function updateDiagnosticsUI(fileKey) {
        if (!diagnosticsBar || !diagnosticsStatusText || !diagnosticsStatusDot) return;
        fileKey = fileKey || currentFileKey;

        const errorCount = currentFileIssues.filter(i => i.severity === 'error').length;
        const warningCount = currentFileIssues.filter(i => i.severity === 'warning').length;

        diagnosticsBar.className = 'editor-diagnostics-bar';

        if (errorCount > 0) {
            diagnosticsBar.classList.add('has-errors');
            diagnosticsStatusDot.className = 'diagnostics-status-dot error';
            diagnosticsStatusDot.textContent = '●';
            diagnosticsStatusText.textContent = `[${fileKey}] エラーが ${errorCount} 件あります（下のヒントを確認して修正してください）`;
        } else if (warningCount > 0) {
            diagnosticsBar.classList.add('has-warnings-only');
            diagnosticsStatusDot.className = 'diagnostics-status-dot warning';
            diagnosticsStatusDot.textContent = '●';
            diagnosticsStatusText.textContent = `[${fileKey}] 注意・未復元箇所が ${warningCount} 件あります`;
        } else {
            diagnosticsStatusDot.className = 'diagnostics-status-dot ok';
            diagnosticsStatusDot.textContent = '●';
            diagnosticsStatusText.textContent = `[${fileKey}] 構文エラーはありません（正常）`;
        }

        renderDiagnosticsList(fileKey);
    }

    function renderDiagnosticsList(fileKey) {
        if (!diagnosticsList) return;
        fileKey = fileKey || currentFileKey;

        if (currentFileIssues.length === 0) {
            diagnosticsList.innerHTML = `
                <div style="padding: 16px 12px; text-align: center; color: #64748b; font-size: 11.5px;">
                    [${escapeHtml(fileKey)}] 構文エラーや未復元箇所はありません。コードは正常です。
                </div>
            `;
            return;
        }

        let html = '';
        currentFileIssues.forEach(item => {
            const isErr = item.severity === 'error';
            const itemClass = isErr ? 'severity-error' : 'severity-warning';
            const icon = isErr ? '!' : 'i';
            const fileBadge = `<span class="diagnostic-file-badge">${escapeHtml(item.filename || fileKey)}</span>`;
            const lineBadge = `<span class="diagnostic-line-badge">行 ${item.line}</span>`;
            const editedBadge = item.isChangedByUser ? `<span class="diagnostic-edited-badge" title="あなたが編集した行です">編集箇所</span>` : '';
            const previewHtml = item.lineText ? `<div class="diagnostic-code-preview">&gt; ${escapeHtml(item.lineText.trim())}</div>` : '';

            html += `
                <div class="diagnostic-item ${itemClass} ${item.isChangedByUser ? 'is-edited' : ''}" 
                     data-file="${escapeHtml(item.filename || fileKey)}" 
                     data-line="${item.line}" 
                     data-col="${item.col}" 
                     title="クリックして [${escapeHtml(item.filename || fileKey)}] の 行 ${item.line} へ移動">
                    <div class="diagnostic-badges">
                        ${fileBadge}
                        ${lineBadge}
                        ${editedBadge}
                    </div>
                    <div class="diagnostic-content">
                        <div class="diagnostic-message">${icon} ${escapeHtml(item.message)}</div>
                        <div class="diagnostic-hint">${escapeHtml(item.hint)}</div>
                        ${previewHtml}
                    </div>
                </div>
            `;
        });

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

    diagnosticsSummary?.addEventListener('click', () => toggleDiagnosticsPanel());
    btnToggleDiagnostics?.addEventListener('click', () => toggleDiagnosticsPanel());

    // ─────────────────────────────────────────────
    // 診断パネルのドラッグ式上下リサイザー
    // ─────────────────────────────────────────────
    let isResizingDiag = false;
    let startDiagY = 0;
    let startDiagHeight = 140;

    diagnosticsPanelResizer?.addEventListener('mousedown', (e) => {
        isResizingDiag = true;
        startDiagY = e.clientY;
        startDiagHeight = diagnosticsPanel.offsetHeight || 140;
        diagnosticsPanelResizer.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    diagnosticsPanelResizer?.addEventListener('dblclick', () => {
        // ダブルクリックで既定値（140px）にリセット
        diagnosticsPanel.style.height = '140px';
        try { localStorage.setItem('invader_editor_diagnostics_height', '140'); } catch (e) { }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizingDiag || !diagnosticsPanel) return;
        // 上にドラッグすると高さが増加（clientYが小さくなる）
        const delta = startDiagY - e.clientY;
        const newHeight = Math.max(60, Math.min(500, startDiagHeight + delta));
        diagnosticsPanel.style.height = newHeight + 'px';
        try { localStorage.setItem('invader_editor_diagnostics_height', String(Math.round(newHeight))); } catch (e) { }
    });

    window.addEventListener('mouseup', () => {
        if (isResizingDiag) {
            isResizingDiag = false;
            diagnosticsPanelResizer?.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
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

        // シンタックスハイライト
        codeHighlight.innerHTML = highlightSyntax(text, file.type) + '\n';

        // ミニマップ描画
        renderMinimap();
    }

    function syncScroll() {
        const scrollTop = codeTextarea.scrollTop;
        const scrollLeft = codeTextarea.scrollLeft;
        codeHighlight.scrollTop = scrollTop;
        codeHighlight.scrollLeft = scrollLeft;
        // translateY方式により、スクロール天井制限に関わらず1ピクセルも狂わずに完全同期
        lineNumbersInner.style.transform = `translateY(-${scrollTop}px)`;

        // ミニマップスライダーのスクロール追随
        syncMinimapSlider();
    }

    codeTextarea.addEventListener('scroll', syncScroll);

    codeTextarea.addEventListener('input', () => {
        const file = files[currentFileKey];
        if (file) {
            file.isDirty = true;
            file.content = codeTextarea.value;
            updateCodeHighlight();
            updateTabsUI();
            updateSidebarUI();

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
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveAndApplyChanges();
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
    function updateTabsUI() {
        tabContainer.innerHTML = '';
        openTabs.forEach(key => {
            const file = files[key];
            if (!file) return;

            const tab = document.createElement('div');
            tab.className = 'editor-tab' + (key === currentFileKey ? ' active' : '') + (file.isDirty ? ' dirty' : '');

            const dot = document.createElement('span');
            dot.className = 'tab-dirty-indicator';

            const name = document.createElement('span');
            name.textContent = file.name;

            tab.appendChild(dot);
            tab.appendChild(name);

            // 閉じるボタン (タブが2つ以上の時に表示)
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
            if (path === currentFileKey) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function switchToFile(key) {
        if (!files[key]) return;
        currentFileKey = key;
        if (!openTabs.includes(key)) {
            openTabs.push(key);
        }
        showCodeEditorPane();

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

    function showCodeEditorPane() {
        document.body.classList.remove('is-sprite-editor');
        if (editorPane) editorPane.style.display = 'flex';
        if (spritePane) spritePane.style.display = 'none';
        if (btnOpenSpriteEditor) btnOpenSpriteEditor.classList.remove('active');
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
        if (btnSave) btnSave.style.display = 'none';
        loadSpriteFromConfig();
        renderSpriteGrid();
        broadcastLiveSprite();
    }

    btnOpenSpriteEditor?.addEventListener('click', showSpriteEditorPane);

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
        const clampedWidth = Math.max(300, Math.min(containerRect.width - 280, newPreviewWidth));
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
    function showToast(msg, isError) {
        toastMsg.textContent = msg;
        if (isError) {
            toast.classList.add('toast-error');
        } else {
            toast.classList.remove('toast-error');
        }
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), isError ? 3500 : 2000);
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

    function updatePreview() {
        const fullHtml = buildCompositeHtml();
        previewIframe.srcdoc = fullHtml;
    }

    function saveAndApplyChanges() {
        // 現在開いているファイル、および変更されている全ファイルの構文チェック
        if (window.Linter) {
            for (let k in files) {
                if (files[k].isBinary) continue;
                if (k === currentFileKey || files[k].isDirty) {
                    const changedLines = window.Linter.computeChangedLines(files[k].baselineContent || '', files[k].content);
                    const issues = window.Linter.lint(k, files[k].content, {
                        baselineCode: files[k].baselineContent,
                        changedLines: changedLines
                    });
                    const errors = issues.filter(i => i.severity === 'error');
                    if (errors.length > 0) {
                        // エラーがある場合は対象ファイルへ切り替えて保存をブロック
                        if (currentFileKey !== k) {
                            switchToFile(k);
                        } else {
                            runDiagnostics(k);
                        }
                        showToast(`構文エラーが ${errors.length} 件あるため保存できません`, true);
                        toggleDiagnosticsPanel(true);
                        jumpToLine(errors[0].line, errors[0].col);
                        return;
                    }
                }
            }
        }

        // linter.js が編集されていた場合は動的に再評価
        if (files['linter.js'] && files['linter.js'].isDirty) {
            try {
                new Function(files['linter.js'].content)();
            } catch (e) {
                console.warn('Linterの再評価に失敗:', e);
            }
        }

        // config.js のみの変更なら即時リロードを試みる
        const otherCodeDirty = ['style.css', 'core.js', 'index.html', 'linter.js', 'monaca-bridge.js'].some(k => files[k] && files[k].isDirty);
        const onlyConfigDirty = files['config.js'].isDirty && !otherCodeDirty;

        for (let k in files) {
            files[k].isDirty = false;
        }
        if (!files[currentFileKey]?.isBinary) {
            runDiagnostics(currentFileKey);
        }
        updateTabsUI();

        if (onlyConfigDirty) {
            try {
                const win = previewIframe.contentWindow;
                if (win && typeof win.reloadGameWithNewConfig === 'function') {
                    const configCode = files['config.js'].content;
                    const fn = new Function(configCode + '; return GameConfig;');
                    const newConfig = fn();
                    if (newConfig.display) {
                        newConfig.display.sound = !isMuted;
                    }
                    win.reloadGameWithNewConfig(newConfig);
                    showToast('保存しました（ゲームに即時反映）');
                    return;
                }
            } catch (e) {
                console.warn('即時リロードに失敗したためプレビュー全体を更新します:', e);
            }
        }

        updatePreview();
        showToast('保存しました（プレビュー更新）');
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
            syncMuzzleToConfigFile();
        }

        renderSpriteGrid();
        broadcastLiveSprite();
        syncSpriteToConfigFile();
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
            syncMuzzleToConfigFile();
        }

        renderSpriteGrid();
        broadcastLiveSprite();
        syncSpriteToConfigFile();
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

    // ── リアルタイム・スプライト配信 ──
    function broadcastLiveSprite(key = currentSpriteKey, grid = spriteGridData) {
        if (!grid || grid.length === 0) return;
        const val = validateCurrentSprite();
        if (!val.ok) return; // バリデーションNGならゲームへ送信しない

        const lines = gridToStrings(grid);

        try {
            if (previewIframe && previewIframe.contentWindow) {
                previewIframe.contentWindow.postMessage({
                    type: 'SPRITE_PREVIEW_UPDATE',
                    key: key,
                    spriteKey: key,
                    pattern: lines,
                    spritePattern: lines,
                    muzzle: (key === 'player') ? playerMuzzle : undefined
                }, '*');

                if (typeof previewIframe.contentWindow.updateLiveSpritePreview === 'function') {
                    previewIframe.contentWindow.updateLiveSpritePreview(key, lines, (key === 'player') ? playerMuzzle : undefined);
                }
            }
        } catch (e) {
            // cross-origin
        }
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
        broadcastLiveSprite();
        syncSpriteToConfigFile();
    }

    function redoSprite() {
        if (spriteRedoStack.length === 0) return;
        spriteUndoStack.push(cloneGrid(spriteGridData));
        spriteGridData = spriteRedoStack.pop();
        renderSpriteGrid();
        updateHistoryButtons();
        broadcastLiveSprite();
        syncSpriteToConfigFile();
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
                        broadcastLiveSprite();
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
        broadcastLiveSprite();
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
            broadcastLiveSprite();
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
        broadcastLiveSprite();
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
        renderSpriteGrid();
        updateFitGuide();
        broadcastLiveSprite();
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
        files['config.js'].isDirty = true;
        if (currentFileKey === 'config.js') {
            codeTextarea.value = files['config.js'].content;
            updateCodeHighlight();
        }
        if (currentSpriteKey === 'player') {
            syncMuzzleToConfigFile();
        }
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

    // 初期化
    try {
        const savedWidth = parseInt(localStorage.getItem('invader_editor_pane_width'), 10);
        if (savedWidth >= 300) previewPane.style.width = savedWidth + 'px';
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

        // 右端エラーマーカー（画面外も含めた全エラーの俯瞰マーカー）の描画
        updateMinimapGutterMarkers(lineCount, rect.height);

        // スライダー同期
        syncMinimapSlider();
    }

    function tokenizeAndDrawMinimapLine(text, type, startX, y, maxWidth) {
        if (!text) return;
        let tokens = [];

        if (type === 'javascript' || type === 'json') {
            const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|true|false|null|undefined|this|import|export|from)\b)|(-?\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z0-9_$]+(?=\s*:))/g;
            let lastIdx = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIdx) {
                    tokens.push({ text: text.slice(lastIdx, match.index), color: '#d4d4d4' });
                }
                if (match[1]) tokens.push({ text: match[1], color: '#6a9955' }); // コメント: 自然なグリーン
                else if (match[2]) tokens.push({ text: match[2], color: '#ce9178' }); // 文字列: ピーチ
                else if (match[3]) tokens.push({ text: match[3], color: '#c586c0' }); // 予約語: パープル
                else if (match[4]) tokens.push({ text: match[4], color: '#b5cea8' }); // 数値: ライトミント
                else if (match[5]) tokens.push({ text: match[5], color: '#9cdcfe' }); // プロパティ: ライトシアン
                lastIdx = regex.lastIndex;
            }
            if (lastIdx < text.length) {
                tokens.push({ text: text.slice(lastIdx), color: '#d4d4d4' });
            }
        } else if (type === 'css') {
            const regex = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))|(-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b)|([a-zA-Z0-9_-]+(?=\s*:))|([^{}]+(?=\{))/g;
            let lastIdx = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIdx) tokens.push({ text: text.slice(lastIdx, match.index), color: '#d4d4d4' });
                if (match[1]) tokens.push({ text: match[1], color: '#6a9955' }); // コメント: グリーン
                else if (match[2]) tokens.push({ text: match[2], color: '#ce9178' }); // 文字列: ピーチ
                else if (match[3]) tokens.push({ text: match[3], color: '#4ec9b0' }); // カラー値: ターコイズ
                else if (match[4]) tokens.push({ text: match[4], color: '#b5cea8' }); // 数値: ライトミント
                else if (match[5]) tokens.push({ text: match[5], color: '#9cdcfe' }); // プロパティ: ライトシアン
                else if (match[6]) tokens.push({ text: match[6], color: '#d7ba7d' }); // セレクタ: ウォームゴールド
                lastIdx = regex.lastIndex;
            }
            if (lastIdx < text.length) tokens.push({ text: text.slice(lastIdx), color: '#d4d4d4' });
        } else {
            tokens.push({ text: text, color: '#d4d4d4' });
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

})();
