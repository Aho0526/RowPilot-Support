// ===============================================================
// ⚙️ Space Invaders Studio Controller (ide.js)
// ===============================================================

(function() {
    'use strict';

    // 仮想ファイルシステム
    const files = {
        'www/config.js': {
            name: 'config.js',
            path: 'www/config.js',
            type: 'javascript',
            editable: true,
            isDirty: false,
            content: `// ゲーム設定ファイル (config.js)\nconst GameConfig = {\n    player: { speed: 5, color: "#00FF66", lives: 3, maxBullets: 2 },\n    bullet: { speed: -8, color: "#FFFF00", width: 3, height: 12 },\n    enemy: { rows: 5, cols: 10, speed: 1.0, dropAmount: 14, shootInterval: 60, bulletSpeed: 3.5 },\n    bunker: { enabled: true, count: 4, color: "#33FF33" },\n    ufo: { enabled: true, speed: 2.2, interval: 18, color: "#FF0033", bonusScore: 300 },\n    display: { background: "space-bg", sound: false }\n};`
        },
        'www/style.css': {
            name: 'style.css',
            path: 'www/style.css',
            type: 'css',
            editable: true,
            isDirty: false,
            content: `/* スタイル設定 (style.css) */`
        },
        'www/core.js': {
            name: 'core.js',
            path: 'www/core.js',
            type: 'javascript',
            editable: false,
            isDirty: false,
            content: `// ゲームエンジン (core.js)`
        },
        'www/index.html': {
            name: 'index.html',
            path: 'www/index.html',
            type: 'html',
            editable: false,
            isDirty: false,
            content: `<!-- ゲームHTML -->`
        }
    };

    let openTabs = ['www/config.js', 'www/style.css'];
    let currentFileKey = 'www/config.js';

    // 状態管理
    let isMuted = true; // デフォルトでミュート
    const SCALE_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.3, 1.5];
    let currentScaleIndex = 2; // 1.0 (100%)

    // DOM要素
    const tabContainer = document.getElementById('editor-tabs');
    const lineNumbers = document.getElementById('line-numbers');
    const codeTextarea = document.getElementById('code-textarea');
    const codeHighlight = document.getElementById('code-highlight');
    const previewIframe = document.getElementById('preview-iframe');
    const previewPane = document.getElementById('preview-pane');
    const paneResizer = document.getElementById('pane-resizer');
    const toast = document.getElementById('ide-toast');
    const toastMsg = document.getElementById('ide-toast-msg');

    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    const soundIcon = document.getElementById('sound-icon');
    const soundText = document.getElementById('sound-text');
    const btnScaleDown = document.getElementById('btn-scale-down');
    const btnScaleUp = document.getElementById('btn-scale-up');
    const scaleIndicator = document.getElementById('scale-indicator');

    // ─────────────────────────────────────────────
    // 🌐 実ファイルの自動フェッチ
    // ─────────────────────────────────────────────
    async function loadRealFiles() {
        const fileMap = {
            'www/config.js': 'monaca-project/www/config.js',
            'www/style.css': 'monaca-project/www/style.css',
            'www/core.js': 'monaca-project/www/core.js',
            'www/index.html': 'monaca-project/www/index.html'
        };

        for (let key in fileMap) {
            try {
                const resp = await fetch(fileMap[key] + '?t=' + Date.now());
                if (resp.ok) {
                    files[key].content = await resp.text();
                }
            } catch(e) {}
        }
        renderEditor();
    }

    // ─────────────────────────────────────────────
    // 🎨 シンタックスハイライター (ワンパストークナイザ)
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
    // 📝 エディタ描画 & 行番号同期
    // ─────────────────────────────────────────────
    function renderEditor() {
        const file = files[currentFileKey];
        if (!file) return;

        codeTextarea.value = file.content;
        codeTextarea.readOnly = !file.editable;
        updateCodeHighlight();
        updateTabsUI();
        updateSidebarUI();
    }

    function updateCodeHighlight() {
        const file = files[currentFileKey];
        if (!file) return;

        const text = codeTextarea.value;
        file.content = text;

        const lines = text.split('\n');
        let lineHtml = '';
        for (let i = 1; i <= lines.length; i++) {
            lineHtml += i + '<br>';
        }
        lineNumbers.innerHTML = lineHtml;

        codeHighlight.innerHTML = highlightSyntax(text, file.type) + '\n';
    }

    // スクロール同期
    codeTextarea.addEventListener('scroll', () => {
        codeHighlight.scrollTop = codeTextarea.scrollTop;
        codeHighlight.scrollLeft = codeTextarea.scrollLeft;
        lineNumbers.scrollTop = codeTextarea.scrollTop;
    });

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
        } else if (e.key === 'Escape') {
            codeTextarea.blur();
        }
    });

    // ─────────────────────────────────────────────
    // ⌨️ キーボード操作の中継 (エディタ外のキーをゲームに転送)
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
    // 📑 タブ & サイドバー UI
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
    // 🔊 サウンド切り替え (デフォでミュート)
    // ─────────────────────────────────────────────
    function updateSoundUI() {
        if (isMuted) {
            btnSoundToggle.className = 'action-btn sound-toggle-btn muted';
            soundIcon.textContent = '🔇';
            soundText.textContent = 'ミュート中';
        } else {
            btnSoundToggle.className = 'action-btn sound-toggle-btn active';
            soundIcon.textContent = '🔊';
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
        showToast(isMuted ? '🔇 音声をミュートしました' : '🔊 音声をONにしました');
    }

    btnSoundToggle?.addEventListener('click', toggleSound);

    // ─────────────────────────────────────────────
    // 📐 画面サイズの自由調整 (ドラッグリサイズ & スケール)
    // ─────────────────────────────────────────────
    // 1. スケールボタン
    function applyScale() {
        const scale = SCALE_PRESETS[currentScaleIndex];
        scaleIndicator.textContent = Math.round(scale * 100) + '%';
        try {
            previewIframe.contentWindow.postMessage({
                type: 'SET_CANVAS_SCALE',
                scale: scale
            }, '*');
        } catch(e) {}
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

    // 2. ドラッグ式スプリッターリサイザー
    let isDragging = false;
    paneResizer?.addEventListener('mousedown', (e) => {
        isDragging = true;
        paneResizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        previewIframe.style.pointerEvents = 'none'; // ドラッグ中にiframeにイベントを吸われないようにする
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
    // 💾 保存 & プレビュー更新
    // ─────────────────────────────────────────────
    function showToast(msg) {
        toastMsg.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function saveAndApplyChanges() {
        for (let k in files) {
            files[k].isDirty = false;
        }
        updateTabsUI();

        try {
            const win = previewIframe.contentWindow;
            if (win && typeof win.reloadGameWithNewConfig === 'function') {
                const configCode = files['www/config.js'].content;
                const fn = new Function(configCode + '; return GameConfig;');
                const newConfig = fn();
                // サウンド状態の同期
                if (newConfig.display) {
                    newConfig.display.sound = !isMuted;
                }
                win.reloadGameWithNewConfig(newConfig);
                applyScale();
                showToast('💾 保存しました（ゲームに即時反映）');
                return;
            }
        } catch(e) {}

        previewIframe.src = 'monaca-project/www/index.html?t=' + Date.now();
        showToast('💾 保存しました（プレビュー再読込）');
    }

    // ─────────────────────────────────────────────
    // 🔌 アクションボタン
    // ─────────────────────────────────────────────
    document.getElementById('btn-save')?.addEventListener('click', saveAndApplyChanges);

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
        const text = files['www/config.js'].content;
        navigator.clipboard.writeText(text).then(() => {
            showToast('📋 config.js をコピーしました');
        });
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
        if (confirm('設定を初期状態に戻しますか？')) {
            loadRealFiles();
            showToast('🔄 初期設定に戻しました');
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

    setTimeout(() => {
        previewIframe.src = 'monaca-project/www/index.html';
    }, 100);

})();
