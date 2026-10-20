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

    // ─────────────────────────────────────────────
    // 実ファイルの自動フェッチ
    // ─────────────────────────────────────────────
    async function loadRealFiles() {
        for (let key in files) {
            try {
                const resp = await fetch(files[key].path + '?t=' + Date.now());
                if (resp.ok) {
                    files[key].content = await resp.text();
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
    // エディタ描画 & 行番号完全ピクセル同期
    // ─────────────────────────────────────────────
    function renderEditor() {
        const file = files[currentFileKey];
        if (!file) return;

        codeTextarea.value = file.content;
        codeTextarea.readOnly = !file.editable;
        updateCodeHighlight();
        updateTabsUI();
        updateSidebarUI();
        syncScroll();
    }

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
            lineHtml += '<div class="line-num">' + i + '</div>';
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
            updateCodeHighlight();
            updateTabsUI();
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
        document.querySelectorAll('.file-item').forEach(item => {
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
        renderEditor();
    }

    document.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.getAttribute('data-path');
            if (path && files[path]) switchToFile(path);
        });
    });

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
    function showToast(msg) {
        toastMsg.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
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

        // style.css の差し替え
        if (html.includes('<link rel="stylesheet" href="style.css">')) {
            html = html.replace('<link rel="stylesheet" href="style.css">', `<style>${css}</style>`);
        } else {
            html = html.replace('</head>', `<style>${css}</style></head>`);
        }

        // config.js と core.js の差し替え
        if (html.includes('<script src="config.js"></script>')) {
            html = html.replace('<script src="config.js"></script>', `<script>${config}<\/script>`);
        }
        if (html.includes('<script src="core.js"></script>')) {
            html = html.replace('<script src="core.js"></script>', `<script>${core}<\/script>`);
        }

        return html;
    }

    function updatePreview() {
        const fullHtml = buildCompositeHtml();
        previewIframe.srcdoc = fullHtml;
    }

    function saveAndApplyChanges() {
        // config.js のみの変更なら即時リロードを試みる
        const onlyConfigDirty = files['config.js'].isDirty && !files['style.css'].isDirty && !files['core.js'].isDirty && !files['index.html'].isDirty;

        for (let k in files) {
            files[k].isDirty = false;
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
            } catch(e) {}
        }

        updatePreview();
        showToast('保存しました（プレビュー更新）');
    }

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
