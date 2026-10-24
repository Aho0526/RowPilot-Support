/**
 * monaca-bridge.js - Monaca Cloud IDE 連携エンジン
 */

(function () {
    'use strict';

    // ゲーム画面上のエラーHUD要素
    let errorHudElem = null;

    function getOrCreateErrorHud() {
        if (!errorHudElem) {
            errorHudElem = document.getElementById('monaca-error-hud');
            if (!errorHudElem) {
                errorHudElem = document.createElement('div');
                errorHudElem.id = 'monaca-error-hud';
                errorHudElem.className = 'monaca-error-hud';
                errorHudElem.style.display = 'none';
                document.body.appendChild(errorHudElem);
            }
        }
        return errorHudElem;
    }

    function showInGameErrorHud(errors) {
        const hud = getOrCreateErrorHud();
        if (!errors || errors.length === 0) {
            hud.style.display = 'none';
            return;
        }

        const first = errors[0];
        const lineNum = first.line || '?';
        const title = first.title || '設定エラー';
        const msg = first.message || '';
        const hint = first.hint || '';

        hud.innerHTML = `
            <div class="monaca-hud-badge">
                <span class="hud-badge-dot">●</span>
                <span class="hud-badge-title">⚠️ config.js のミスを検知</span>
                <span class="hud-badge-line">${lineNum} 行目</span>
            </div>
            <div class="monaca-hud-body">
                <div class="monaca-hud-title">${escapeHtml(title)}</div>
                <div class="monaca-hud-msg">${escapeHtml(msg)}</div>
                ${hint ? `<div class="monaca-hud-hint">💡 <strong>ヒント:</strong> ${escapeHtml(hint)}</div>` : ''}
            </div>
            <div class="monaca-hud-footer">
                左側のエディタで修正して保存 (Ctrl+S) すると自動で再開します
            </div>
        `;
        hud.style.display = 'flex';
    }

    function hideInGameErrorHud() {
        const hud = getOrCreateErrorHud();
        hud.style.display = 'none';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─────────────────────────────────────────────
    // 単体ブラウザ表示時のローカル config.js 診断
    // ─────────────────────────────────────────────
    function runLocalValidation() {
        try {
            if (!window.Linter || typeof window.Linter.lint !== 'function') return;
            fetch('config.js?t=' + Date.now())
                .then(resp => resp.ok ? resp.text() : '')
                .then(code => {
                    if (!code) return;
                    const errors = window.Linter.lint('config.js', code).filter(e => e.severity === 'error');
                    showInGameErrorHud(errors);
                })
                .catch(() => { });
        } catch (e) { }
    }

    // ─────────────────────────────────────────────
    // Monaca IDE 親ウィンドウ連携
    // ─────────────────────────────────────────────
    function initBridge() {
        // 通常の単体ブラウザ表示時のフォールバック診断
        runLocalValidation();

        try {
            if (!window.parent || window.parent === window) return;
            const parentMonaco = window.parent.monaco;
            if (!parentMonaco || !parentMonaco.editor) {
                setTimeout(initBridge, 600);
                return;
            }

            console.log('[MonacaBridge] Monaca Cloud IDE 連携が有効化されました。');

            // Monaca エディタ用のスタイルを親ページに注入（見やすいエラーマーカー）
            try {
                const parentDoc = window.parent.document;
                if (parentDoc && !parentDoc.getElementById('monaca-trial-admission-custom-css')) {
                    const style = parentDoc.createElement('style');
                    style.id = 'monaca-trial-admission-custom-css';
                    style.textContent = `
                        /* 日本語エラーマーカーのツールチップを読みやすく強調 */
                        .monaco-editor .marker.trial-admission-error {
                            background-color: rgba(255, 51, 68, 0.25) !important;
                        }
                    `;
                    parentDoc.head.appendChild(style);
                }
            } catch (e) { }

            function findConfigModel() {
                try {
                    const models = parentMonaco.editor.getModels();
                    for (const m of models) {
                        const path = (m.uri && m.uri.path) ? m.uri.path : (m.uri ? m.uri.toString() : '');
                        if (path.endsWith('config.js') || path.includes('config.js')) {
                            return m;
                        }
                    }
                } catch (e) { }
                return null;
            }

            function attachModel(model) {
                if (model._monacaBridgeAttached) return;
                model._monacaBridgeAttached = true;

                function check() {
                    try {
                        const code = model.getValue();
                        let errors = [];
                        if (window.Linter && typeof window.Linter.lint === 'function') {
                            errors = window.Linter.lint('config.js', code);
                        }

                        // Monaca 既存の JSHint / TypeScript の難解な英語エラーを消去
                        try {
                            parentMonaco.editor.setModelMarkers(model, 'jshint', []);
                            parentMonaco.editor.setModelMarkers(model, 'javascript', []);
                            parentMonaco.editor.setModelMarkers(model, 'typescript', []);
                        } catch (e) { }

                        // 親切な日本語マーカーを設定
                        const markers = errors.map(err => {
                            let sev = parentMonaco.MarkerSeverity.Error;
                            if (err.severity === 'warning') sev = parentMonaco.MarkerSeverity.Warning;
                            if (err.severity === 'info') sev = parentMonaco.MarkerSeverity.Info;
                            const col = err.col || err.column || 1;

                            return {
                                startLineNumber: err.line || 1,
                                startColumn: col,
                                endLineNumber: err.line || 1,
                                endColumn: col + Math.max(1, err.length || 1),
                                message: `【${err.title || err.message || '設定ミス'}】${err.message}${err.hint ? '\n💡 ヒント: ' + err.hint : ''}`,
                                severity: sev,
                                source: '体験入学サポーター'
                            };
                        });

                        parentMonaco.editor.setModelMarkers(model, 'trial-admission-linter', markers);
                        showInGameErrorHud(errors.filter(e => e.severity === 'error'));
                    } catch (err) {
                        console.warn('[MonacaBridge] Validation error:', err);
                    }
                }

                model.onDidChangeContent(() => {
                    check();
                });

                check();
            }

            // config.js が開かれたら即フック
            setInterval(() => {
                const model = findConfigModel();
                if (model) attachModel(model);
            }, 800);

            // ドット絵エディタから Monaca エディタの config.js を直接更新
            window.applySpriteToMonacaEditor = function (spriteKey, gridStrings) {
                const model = findConfigModel();
                if (!model) return false;

                try {
                    const code = model.getValue();
                    const rowsText = gridStrings.map(row => `            "${row}"`).join(',\n');
                    const formattedCode = '[\n' + rowsText + '\n        ]';
                    const regex = new RegExp(`(\\b${spriteKey}:\\s*)\\[[\\s\\S]*?\\]`);

                    if (regex.test(code)) {
                        const newCode = code.replace(regex, (m, head) => head + formattedCode);
                        model.setValue(newCode);
                        return true;
                    }
                } catch (e) {
                    console.error('[MonacaBridge] Failed to apply sprite to Monaca editor:', e);
                }
                return false;
            };

        } catch (e) {
            console.warn('[MonacaBridge] Init failed:', e);
        }
    }

    // ─────────────────────────────────────────────
    // ゲーム内ドット絵モーダル (Monaca / 単体実行用)
    // ─────────────────────────────────────────────
    const DEFAULT_SPRITE_TEMPLATES = {
        player: [
            "0000001000000",
            "0000011100000",
            "0000011100000",
            "0111111111110",
            "1111111111111",
            "1111111111111",
            "1111110111111",
            "1100000000011"
        ],
        squid: [
            "0000110000",
            "0001111000",
            "0011111100",
            "0110110110",
            "1111111111",
            "0001001000",
            "0010110100",
            "0101001010"
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
            "0011100110011100",
            "0001000000001000"
        ]
    };

    let modalGridData = [];
    let modalHistory = [];
    let modalRedoHistory = [];
    let modalCurrentKey = 'player';
    let modalIsDrawing = false;
    let modalDrawMode = 1;

    function initDotModal() {
        const btnOpen = document.getElementById('btn-open-dot-modal');
        const overlay = document.getElementById('dot-modal-overlay');
        const btnClose = document.getElementById('btn-close-dot-modal');
        const select = document.getElementById('modal-sprite-select');
        const chkSym = document.getElementById('modal-sprite-symmetry');
        const btnClear = document.getElementById('btn-modal-clear');
        const btnReset = document.getElementById('btn-modal-reset');
        const btnUndo = document.getElementById('btn-modal-undo');
        const btnRedo = document.getElementById('btn-modal-redo');
        const btnApply = document.getElementById('btn-modal-apply');
        const btnCopy = document.getElementById('btn-modal-copy');

        if (!overlay) return;

        function loadModalSprite(key) {
            modalCurrentKey = key;
            let lines = null;
            if (window.GameConfig && window.GameConfig.sprites && window.GameConfig.sprites[key]) {
                const s = window.GameConfig.sprites[key];
                lines = Array.isArray(s[0]) ? s[0] : s;
            }
            if (!lines) lines = DEFAULT_SPRITE_TEMPLATES[key] || DEFAULT_SPRITE_TEMPLATES.player;
            modalGridData = lines.map(row => row.split('').map(c => c === '1' ? 1 : 0));
            modalHistory = [];
            modalRedoHistory = [];
            renderModalGrid();
        }

        function renderModalGrid() {
            const grid = document.getElementById('modal-sprite-grid');
            const sizeInfo = document.getElementById('modal-size-info');
            if (!grid || modalGridData.length === 0) return;

            const rows = modalGridData.length;
            const cols = modalGridData[0].length;
            if (sizeInfo) sizeInfo.textContent = `${cols} x ${rows}`;

            grid.innerHTML = '';
            grid.style.gridTemplateColumns = `repeat(${cols}, 20px)`;
            grid.style.gridTemplateRows = `repeat(${rows}, 20px)`;

            const isSym = chkSym && chkSym.checked;
            const symCol = Math.floor((cols - 1) / 2);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'modal-sprite-cell';
                    if (isSym && c === symCol) cell.style.borderRight = '1px solid #38bdf8';
                    if (modalGridData[r][c] === 1) cell.classList.add('active');

                    cell.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        modalIsDrawing = true;
                        modalDrawMode = modalGridData[r][c] === 1 ? 0 : 1;
                        pushModalHistory();
                        applyModalPixel(r, c, modalDrawMode);
                    });
                    cell.addEventListener('mouseenter', () => {
                        if (modalIsDrawing) applyModalPixel(r, c, modalDrawMode);
                    });
                    grid.appendChild(cell);
                }
            }

            drawModalMiniPreview();
            broadcastModalSprite();
        }

        function applyModalPixel(r, c, val) {
            const cols = modalGridData[0].length;
            setModalCell(r, c, val);
            if (chkSym && chkSym.checked) {
                const mirror = cols - 1 - c;
                if (mirror !== c) setModalCell(r, mirror, val);
            }
            drawModalMiniPreview();
            broadcastModalSprite();
        }

        function setModalCell(r, c, val) {
            if (!modalGridData[r] || modalGridData[r][c] === undefined) return;
            modalGridData[r][c] = val;
            const grid = document.getElementById('modal-sprite-grid');
            if (grid) {
                const cell = grid.children[r * modalGridData[0].length + c];
                if (cell) {
                    if (val === 1) cell.classList.add('active');
                    else cell.classList.remove('active');
                }
            }
        }

        function pushModalHistory() {
            modalHistory.push(modalGridData.map(row => row.slice()));
            if (modalHistory.length > 20) modalHistory.shift();
            modalRedoHistory = [];
        }

        function drawModalMiniPreview() {
            const cvs = document.getElementById('modal-mini-canvas');
            if (!cvs || modalGridData.length === 0) return;
            const ctx = cvs.getContext('2d');
            ctx.clearRect(0, 0, cvs.width, cvs.height);

            const rows = modalGridData.length;
            const cols = modalGridData[0].length;
            const pxSize = Math.max(1, Math.min(Math.floor(cvs.width / cols), Math.floor(cvs.height / rows)));
            const startX = Math.floor((cvs.width - cols * pxSize) / 2);
            const startY = Math.floor((cvs.height - rows * pxSize) / 2);

            ctx.fillStyle = "#00FF66";
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (modalGridData[r][c] === 1) {
                        ctx.fillRect(startX + c * pxSize, startY + r * pxSize, pxSize, pxSize);
                    }
                }
            }
        }

        function broadcastModalSprite() {
            if (typeof window.updateLiveSpritePreview === 'function') {
                const lines = modalGridData.map(r => r.join(''));
                window.updateLiveSpritePreview(modalCurrentKey, lines);
            }
        }

        window.addEventListener('mouseup', () => { modalIsDrawing = false; });

        btnOpen?.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.style.display = 'flex';
            loadModalSprite(select ? select.value : 'player');
        });

        btnClose?.addEventListener('click', () => {
            overlay.style.display = 'none';
        });

        select?.addEventListener('change', () => {
            loadModalSprite(select.value);
        });

        btnClear?.addEventListener('click', () => {
            pushModalHistory();
            modalGridData = modalGridData.map(row => row.map(() => 0));
            renderModalGrid();
        });

        btnReset?.addEventListener('click', () => {
            pushModalHistory();
            const tmpl = DEFAULT_SPRITE_TEMPLATES[modalCurrentKey] || DEFAULT_SPRITE_TEMPLATES.player;
            modalGridData = tmpl.map(row => row.split('').map(c => c === '1' ? 1 : 0));
            renderModalGrid();
        });

        btnUndo?.addEventListener('click', () => {
            if (modalHistory.length === 0) return;
            modalRedoHistory.push(modalGridData.map(row => row.slice()));
            modalGridData = modalHistory.pop();
            renderModalGrid();
        });

        btnRedo?.addEventListener('click', () => {
            if (modalRedoHistory.length === 0) return;
            modalHistory.push(modalGridData.map(row => row.slice()));
            modalGridData = modalRedoHistory.pop();
            renderModalGrid();
        });

        btnApply?.addEventListener('click', () => {
            const lines = modalGridData.map(r => r.join(''));
            let applied = false;
            if (typeof window.applySpriteToMonacaEditor === 'function') {
                applied = window.applySpriteToMonacaEditor(modalCurrentKey, lines);
            }
            if (applied) {
                alert('✨ Monaca の config.js に直接反映しました！\n左側のエディタを確認してください。');
            } else {
                const code = '[\n' + lines.map(l => `            "${l}"`).join(',\n') + '\n        ]';
                navigator.clipboard.writeText(code).then(() => {
                    alert('📋 ドット絵コードをコピーしました！\nconfig.js の ' + modalCurrentKey + ' 部分に貼り付けてください。');
                });
            }
        });

        btnCopy?.addEventListener('click', () => {
            const lines = modalGridData.map(r => r.join(''));
            const code = '[\n' + lines.map(l => `            "${l}"`).join(',\n') + '\n        ]';
            navigator.clipboard.writeText(code).then(() => {
                alert('📋 ドット絵コードをクリップボードにコピーしました！');
            });
        });
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            initBridge();
            initDotModal();
        });
    } else {
        initBridge();
        initDotModal();
    }
})();
