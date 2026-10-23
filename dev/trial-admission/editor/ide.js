// ===============================================================
// Space Invaders Studio Controller (ide.js)
// ===============================================================

(function() {
    'use strict';

    // 仮想ファイルシステム (全ファイル編集可能)
    const files = {
        'config.js': {
            name: 'config.js',
            path: '../config.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            content: `// ゲーム設定ファイル (config.js)\nconst GameConfig = {};`
        },
        'style.css': {
            name: 'style.css',
            path: '../style.css',
            type: 'css',
            editable: true,
            isDirty: false,
            content: `/* スタイル設定 (style.css) */`
        },
        'core.js': {
            name: 'core.js',
            path: '../core.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            content: `// ゲームエンジン (core.js)`
        },
        'index.html': {
            name: 'index.html',
            path: '../index.html',
            type: 'html',
            editable: true,
            isDirty: false,
            content: `<!-- ゲームHTML -->`
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
    } catch (e) {}

    // DOM要素
    const tabContainer = document.getElementById('editor-tabs');
    const lineNumbersInner = document.getElementById('line-numbers-inner');
    const codeTextarea = document.getElementById('code-textarea');
    const codeHighlight = document.getElementById('code-highlight');
    const previewIframe = document.getElementById('preview-iframe');
    const previewPane = document.getElementById('preview-pane');
    const paneResizer = document.getElementById('pane-resizer');
    const toast = document.getElementById('ide-toast');
    const toastMsg = document.getElementById('ide-toast-msg');

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
    } catch (e) {}

    // ─────────────────────────────────────────────
    // 実ファイルの自動フェッチ
    // ─────────────────────────────────────────────
    async function loadRealFiles() {
        for (let key in files) {
            try {
                const resp = await fetch(files[key].path + '?t=' + Date.now());
                if (resp.ok) {
                    files[key].content = await resp.text();
                    files[key].baselineContent = files[key].content;
                    files[key].isDirty = false;
                }
            } catch(e) {
                console.warn('ファイルの読み込みに失敗しました:', key, e);
            }
        }
        renderEditor();
        updatePreview();
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
            const regex = /(\/\*[\s\S]*?\*\/)|(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))|([a-zA-Z0-9_-]+(?=\s*:))|([^{}]+(?=\{))/g;
            let result = '';
            let lastIndex = 0;
            let match;
            while ((match = regex.exec(code)) !== null) {
                result += escapeHtml(code.slice(lastIndex, match.index));
                if (match[1]) result += '<span class="token-comment">' + escapeHtml(match[1]) + '</span>';
                else if (match[2]) result += '<span class="token-string">' + escapeHtml(match[2]) + '</span>';
                else if (match[3]) result += '<span class="token-property">' + escapeHtml(match[3]) + '</span>';
                else if (match[4]) result += '<span class="token-tag">' + escapeHtml(match[4]) + '</span>';
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
            const icon = isErr ? '⚠️' : '💡';
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
        try { localStorage.setItem('invader_editor_diagnostics_height', '140'); } catch(e) {}
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizingDiag || !diagnosticsPanel) return;
        // 上にドラッグすると高さが増加（clientYが小さくなる）
        const delta = startDiagY - e.clientY;
        const newHeight = Math.max(60, Math.min(500, startDiagHeight + delta));
        diagnosticsPanel.style.height = newHeight + 'px';
        try { localStorage.setItem('invader_editor_diagnostics_height', String(Math.round(newHeight))); } catch(e) {}
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
    }

    function syncScroll() {
        const scrollTop = codeTextarea.scrollTop;
        const scrollLeft = codeTextarea.scrollLeft;
        codeHighlight.scrollTop = scrollTop;
        codeHighlight.scrollLeft = scrollLeft;
        // translateY方式により、スクロール天井制限に関わらず1ピクセルも狂わずに完全同期
        lineNumbersInner.style.transform = `translateY(-${scrollTop}px)`;
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
                } catch(err) {}
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
                } catch(err) {}
            }
        }
    });

    // ─────────────────────────────────────────────
    // タブ & サイドバー UI
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

            tab.addEventListener('click', () => switchToFile(key));
            tabContainer.appendChild(tab);
        });
    }

    function updateSidebarUI() {
        document.querySelectorAll('.file-item[data-path]').forEach(item => {
            const path = item.getAttribute('data-path');
            if (path === currentFileKey) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }

            // 未復元箇所 (TODO) の残数をバッジ表示
            const file = files[path];
            const count = file ? (file.content.match(/TODO/g) || []).length : 0;
            let badge = item.querySelector('.todo-count');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'todo-count';
                    item.appendChild(badge);
                }
                badge.textContent = count;
                badge.title = `未復元の箇所 (TODO) が ${count} 件あります`;
            } else if (badge) {
                badge.remove();
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
        renderEditor();
    }

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
        if (editorPane) editorPane.style.display = 'flex';
        if (spritePane) spritePane.style.display = 'none';
        if (btnOpenSpriteEditor) btnOpenSpriteEditor.classList.remove('active');
        updateSidebarUI();
    }

    function showSpriteEditorPane() {
        if (editorPane) editorPane.style.display = 'none';
        if (spritePane) spritePane.style.display = 'flex';
        document.querySelectorAll('.file-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.editor-tab').forEach(tab => tab.classList.remove('active'));
        if (btnOpenSpriteEditor) btnOpenSpriteEditor.classList.add('active');
        loadSpriteFromConfig();
        renderSpriteGrid();
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
        } catch(e) {}
        showToast(isMuted ? '音声をミュートしました' : '音声をONにしました');
    }

    btnSoundToggle?.addEventListener('click', toggleSound);

    // ─────────────────────────────────────────────
    // 表示倍率 & ドラッグリサイズ
    // ─────────────────────────────────────────────
    function applyScale() {
        const scale = SCALE_PRESETS[currentScaleIndex];
        try { localStorage.setItem('invader_editor_scale', String(currentScaleIndex)); } catch (e) {}
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
        try { localStorage.setItem('invader_editor_pane_width', String(Math.round(clampedWidth))); } catch (e) {}
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
                        showToast(`⚠️ 構文エラーが ${errors.length} 件あるため保存できません`, true);
                        toggleDiagnosticsPanel(true);
                        jumpToLine(errors[0].line, errors[0].col);
                        return;
                    }
                }
            }
        }

        // config.js のみの変更なら即時リロードを試みる
        const onlyConfigDirty = files['config.js'].isDirty && !files['style.css'].isDirty && !files['core.js'].isDirty && !files['index.html'].isDirty;

        for (let k in files) {
            files[k].isDirty = false;
        }
        runDiagnostics(currentFileKey);
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
            } catch(e) {
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
        if (!lines) {
            lines = DEFAULT_SPRITES[currentSpriteKey] || DEFAULT_SPRITES.player;
        }
        spriteGridData = stringsToGrid(lines);
        spriteUndoStack = [];
        spriteRedoStack = [];
        updateHistoryButtons();
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

        const rows = spriteGridData.length;
        const cols = spriteGridData[0].length;
        const color = getSpriteColor(currentSpriteKey);

        spriteGrid.innerHTML = '';
        spriteGrid.style.gridTemplateColumns = `repeat(${cols}, 26px)`;
        spriteGrid.style.gridTemplateRows = `repeat(${rows}, 26px)`;

        if (spriteSizeInfo) {
            spriteSizeInfo.textContent = `${cols} x ${rows} ドット`;
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
                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    isDrawingPixel = true;
                    drawMode = spriteGridData[r][c] === 1 ? 0 : 1;
                    pushHistory();
                    applyPixel(r, c, drawMode);
                });
                cell.addEventListener('mouseenter', () => {
                    if (isDrawingPixel) applyPixel(r, c, drawMode);
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
        isDrawingPixel = false;
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

    btnSpriteClear?.addEventListener('click', () => {
        pushHistory();
        spriteGridData = spriteGridData.map(row => row.map(() => 0));
        renderSpriteGrid();
    });

    btnSpriteReset?.addEventListener('click', () => {
        pushHistory();
        spriteGridData = stringsToGrid(DEFAULT_SPRITES[currentSpriteKey] || DEFAULT_SPRITES.player);
        renderSpriteGrid();
    });

    btnSpriteUndo?.addEventListener('click', undoSprite);
    btnSpriteRedo?.addEventListener('click', redoSprite);

    window.addEventListener('keydown', (e) => {
        if (!spritePane || spritePane.style.display === 'none') return;
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
        e.preventDefault();
        if (e.shiftKey) redoSprite();
        else undoSprite();
    });

    btnSpriteApply?.addEventListener('click', () => {
        if (spriteGridData.length === 0) return;

        const rowsText = gridToStrings(spriteGridData).map(row => `            "${row}"`).join(',\n');
        const formattedCode = '[\n' + rowsText + '\n        ]';

        const configCode = files['config.js'].content;
        const regex = new RegExp(`(\\b${currentSpriteKey}:\\s*)\\[[\\s\\S]*?\\]`);

        if (!regex.test(configCode)) {
            showToast(`config.js に ${currentSpriteKey} の定義が見つかりません`);
            return;
        }
        files['config.js'].content = configCode.replace(regex, (m, head) => head + formattedCode);
        files['config.js'].isDirty = true;
        if (currentFileKey === 'config.js') {
            codeTextarea.value = files['config.js'].content;
            updateCodeHighlight();
        }
        saveAndApplyChanges();
        showToast('config.js に反映しました');
    });

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
    } catch (e) {}
    updateSoundUI();
    renderEditor();
    loadRealFiles();

    previewIframe.addEventListener('load', () => {
        applyScale();
        try {
            previewIframe.contentWindow.postMessage({
                type: 'SET_SOUND',
                enabled: !isMuted
            }, '*');
        } catch(e) {}
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

    document.getElementById('btn-back-to-game')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.body.classList.add('transitioning-to-game');
        setTimeout(() => {
            window.location.href = '../';
        }, 400);
    });

})();
