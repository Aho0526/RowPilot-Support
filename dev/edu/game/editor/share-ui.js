// ==========================================
// ステージ共有UI。ide.js が公開する window.__editorApi からステージを読み、
// ShareCodec で共有URLを生成する。
// ==========================================
(function () {
    'use strict';

    const MAX = 3;

    window.addEventListener('DOMContentLoaded', () => {
        const overlay = document.getElementById('share-overlay');
        const openBtn = document.getElementById('btn-open-share');
        if (!overlay || !openBtn || !window.ShareCodec) return;

        const listEl = document.getElementById('share-list');
        const countEl = document.getElementById('share-count');
        const errorEl = document.getElementById('share-error');
        const resultEl = document.getElementById('share-result');
        const urlEl = document.getElementById('share-url');
        const metaEl = document.getElementById('share-meta');
        const titlesEl = document.getElementById('share-include-titles');
        const copyBtn = document.getElementById('btn-share-copy');
        const openUrlBtn = document.getElementById('btn-share-open');
        const genBtn = document.getElementById('btn-share-generate');

        // 選択順を保持する (stageのインデックス配列)
        let selected = [];
        let stages = [];

        function setError(msg) {
            errorEl.textContent = msg || '';
        }

        function resetResult() {
            resultEl.hidden = true;
            urlEl.value = '';
            copyBtn.disabled = true;
            openUrlBtn.disabled = true;
        }

        function stageProblem(st, idx) {
            const r = window.ShareCodec.encode([st]);
            return r.ok ? '' : r.error;
        }

        function isCustomStage(st) {
            const idNum = Number(st && st.id);
            return !isNaN(idNum) && idNum >= 21;
        }

        function createStageRow(st, idx) {
            const problem = stageProblem(st, idx);
            const order = selected.indexOf(idx);
            const checked = order !== -1;
            const full = selected.length >= MAX && !checked;

            const row = document.createElement('label');
            row.className = 'share-row' + (problem ? ' is-invalid' : '') + (checked ? ' is-selected' : '') + (full ? ' is-disabled' : '');

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = checked;
            cb.disabled = !!problem || full;
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    if (selected.length < MAX) selected.push(idx);
                } else {
                    selected = selected.filter(i => i !== idx);
                }
                setError('');
                resetResult();
                render();
            });

            const badge = document.createElement('span');
            badge.className = 'share-order';
            badge.textContent = checked ? String(order + 1) : '';

            const name = document.createElement('span');
            name.className = 'share-name';
            name.textContent = st.title || ('ステージ ' + (st.id != null ? st.id : idx + 1));

            row.append(cb, badge, name);
            if (problem) {
                const warn = document.createElement('span');
                warn.className = 'share-warn';
                warn.textContent = problem;
                row.appendChild(warn);
            }
            return row;
        }

        function render() {
            listEl.textContent = '';

            const customItems = [];
            const defaultItems = [];

            stages.forEach((st, idx) => {
                if (isCustomStage(st)) {
                    customItems.push({ stage: st, index: idx });
                } else {
                    defaultItems.push({ stage: st, index: idx });
                }
            });

            // 1. 作成したステージ（ID 21 / 99以降）を最優先で描画
            customItems.forEach(item => {
                listEl.appendChild(createStageRow(item.stage, item.index));
            });

            // 2. 作成したステージがある場合は1ステージ分の空白＋セパレーターを挟む
            if (customItems.length > 0 && defaultItems.length > 0) {
                const sep = document.createElement('div');
                sep.className = 'share-list-separator';
                sep.innerHTML = '<span class="separator-line"></span><span class="separator-text">デフォルトのステージ</span><span class="separator-line"></span>';
                listEl.appendChild(sep);
            }

            // 3. デフォルトのステージを描画
            defaultItems.forEach(item => {
                listEl.appendChild(createStageRow(item.stage, item.index));
            });

            countEl.textContent = '選択中 ' + selected.length + ' / ' + MAX;
        }

        function open() {
            const api = window.__editorApi;
            stages = (api && api.getStages && api.getStages()) || [];
            selected = selected.filter(i => i < stages.length);
            setError(stages.length === 0 ? 'stages.js を解析できませんでした。構文エラーがないか確認してください。' : '');
            resetResult();
            render();
            overlay.classList.add('is-open');
            overlay.setAttribute('aria-hidden', 'false');
        }

        function close() {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
        }

        function currentUrl() {
            return urlEl.value;
        }

        function generate() {
            setError('');
            if (selected.length === 0) {
                setError('共有するステージを1つ以上選んでください。');
                return;
            }
            const picked = selected.map(i => stages[i]);
            const r = window.ShareCodec.encode(picked, { includeTitles: titlesEl.checked });
            if (!r.ok) {
                resetResult();
                setError(r.error);
                return;
            }
            const base = new URL('../index.html', window.location.href).href;
            const url = window.ShareCodec.buildUrl(r.token, base);
            urlEl.value = url;
            metaEl.textContent = picked.length + ' ステージ / ' + url.length + ' 文字';
            resultEl.hidden = false;
            copyBtn.disabled = false;
            openUrlBtn.disabled = false;
            urlEl.focus();
            urlEl.select();
        }

        async function copy() {
            const url = currentUrl();
            if (!url) return;
            try {
                await navigator.clipboard.writeText(url);
                copyBtn.textContent = 'コピーしました';
            } catch (e) {
                urlEl.select();
                document.execCommand && document.execCommand('copy');
                copyBtn.textContent = 'コピーしました';
            }
            setTimeout(() => { copyBtn.textContent = 'URLをコピー'; }, 1800);
        }

        openBtn.addEventListener('click', open);
        document.getElementById('btn-share-close').addEventListener('click', close);
        document.getElementById('btn-share-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
        });
        titlesEl.addEventListener('change', resetResult);
        genBtn.addEventListener('click', generate);
        copyBtn.addEventListener('click', copy);
        openUrlBtn.addEventListener('click', () => {
            const url = currentUrl();
            if (url) window.open(url, '_blank', 'noopener');
        });
    });
})();
