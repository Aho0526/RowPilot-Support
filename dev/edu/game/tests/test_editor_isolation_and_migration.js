const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const gameDir = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(gameDir, 'main.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(gameDir, 'style.css'), 'utf8');
const editorHtml = fs.readFileSync(path.join(gameDir, 'editor', 'index.html'), 'utf8');
const ideJs = fs.readFileSync(path.join(gameDir, 'editor', 'ide.js'), 'utf8');
const officialStagesJs = fs.readFileSync(path.join(gameDir, 'stages.js'), 'utf8');

// 1. editor/index.html の /editor フォルダに stage-solver.js が含まれていること
console.log('Test 1: editor/index.html の editor フォルダ内 stage-solver.js 登録検証');
assert(
    editorHtml.includes('data-path="editor/stage-solver.js"'),
    'editor/index.html のファイルツリーに editor/stage-solver.js が存在すること'
);

// 2. style.css に in-editor-preview の無効化ルールがあること
console.log('Test 2: style.css / main.js でのエディタ内プレビュー時ナビゲーションボタン無効化検証');
[
    'body.in-editor-preview #gameToEditorBtn',
    'body.in-editor-preview #homeHelpBtn',
    'body.in-editor-preview #homeTechBtn',
    'body.in-editor-preview #homeEduPortalBtn'
].forEach(sel => {
    assert(styleCss.includes(sel), `style.css に ${sel} の無効化スタイルがあること`);
});

// main.js を inEditorPreview 状態で起動して対象ボタンが無効化されるか確認
function testMainJsPreviewLock() {
    const elements = new Map();
    function createEl(id, tagName = 'BUTTON') {
        const attrs = {};
        const listeners = { click: [] };
        const el = {
            id,
            tagName,
            disabled: false,
            style: {},
            classList: {
                _set: new Set(),
                add(c) { this._set.add(c); },
                remove(c) { this._set.delete(c); },
                toggle(c, f) { if (f === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (f) this._set.add(c); else this._set.delete(c); },
                contains(c) { return this._set.has(c); }
            },
            dataset: {},
            setAttribute(k, v) { attrs[k] = String(v); },
            getAttribute(k) { return attrs[k] ?? null; },
            addEventListener(ev, fn) {
                if (!listeners[ev]) listeners[ev] = [];
                listeners[ev].push(fn);
            },
            click() {
                let prevented = false;
                const event = {
                    preventDefault() { prevented = true; },
                    stopPropagation() {}
                };
                (listeners.click || []).forEach(fn => fn(event));
                return { prevented };
            },
            querySelectorAll() { return []; },
            querySelector() { return null; },
            appendChild() {},
            getContext() {
                return new Proxy({}, {
                    get: (_t, prop) => {
                        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
                            return () => ({ addColorStop: () => {} });
                        }
                        if (prop === 'measureText') {
                            return () => ({ width: 10 });
                        }
                        return () => {};
                    }
                });
            }
        };
        return el;
    }

    const trackedIds = ['gameToEditorBtn', 'homeHelpBtn', 'homeTechBtn', 'homeEduPortalBtn', 'helpModalOverlay'];
    trackedIds.forEach(id => elements.set(id, createEl(id, id === 'homeHelpBtn' ? 'BUTTON' : 'A')));
    const customEditBtn = createEl('customEditBtn', 'A');

    const domReadyListeners = [];
    const bodyEl = createEl('body', 'BODY');
    const documentMock = {
        body: bodyEl,
        documentElement: { style: {} },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createEl(id));
            return elements.get(id);
        },
        querySelectorAll(sel) {
            if (sel === '#gameToEditorBtn') return [elements.get('gameToEditorBtn')];
            if (sel === '#homeHelpBtn') return [elements.get('homeHelpBtn')];
            if (sel === '#homeTechBtn') return [elements.get('homeTechBtn')];
            if (sel === '#homeEduPortalBtn') return [elements.get('homeEduPortalBtn')];
            if (sel === '.custom-banner-btn.edit-btn') return [customEditBtn];
            return [];
        },
        querySelector() { return null; },
        createElement(tag) { return createEl('created', tag.toUpperCase()); },
        addEventListener(ev, fn) {
            if (ev === 'DOMContentLoaded') domReadyListeners.push(fn);
        }
    };

    const sandbox = {
        console,
        Math,
        JSON,
        Date,
        Set,
        Map,
        Array,
        Object,
        Number,
        String,
        Boolean,
        RegExp,
        Error,
        setTimeout: () => 0,
        clearTimeout: () => {},
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {},
        performance: { now: () => 0 },
        innerWidth: 800,
        innerHeight: 600,
        document: documentMock,
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        location: { search: '', pathname: '/edu/game/', hash: '' },
        history: { replaceState: () => {} },
        navigator: {},
        addEventListener(ev, fn) {
            if (ev === 'DOMContentLoaded') domReadyListeners.push(fn);
        }
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.top = {}; // self !== top => isInsideEditorPreview() === true
    sandbox.frameElement = {};

    vm.runInNewContext(officialStagesJs + '\n' + mainJs, sandbox);
    domReadyListeners.forEach(fn => fn());

    assert(bodyEl.classList.contains('in-editor-preview'), 'body に in-editor-preview クラスが付与されること');
    ['gameToEditorBtn', 'homeHelpBtn', 'homeTechBtn', 'homeEduPortalBtn'].forEach(id => {
        const el = elements.get(id);
        assert.strictEqual(el.getAttribute('aria-disabled'), 'true', `${id} が aria-disabled="true" であること`);
        assert.strictEqual(el.getAttribute('tabindex'), '-1', `${id} が tabindex="-1" であること`);
        const res = el.click();
        assert.strictEqual(res.prevented, true, `${id} のクリックが preventDefault されること`);
    });
    assert.strictEqual(elements.get('homeHelpBtn').disabled, true, 'homeHelpBtn.disabled が true であること');
    assert.strictEqual(customEditBtn.getAttribute('aria-disabled'), 'true', 'customEditBtn が無効化されること');
}
testMainJsPreviewLock();
console.log(' -> OK: エディタ内プレビュー時の対象ボタン全無効化を確認しました。');

// 3. ide.js の migrateOfficialStagesInCode 検証
console.log('Test 3: 最新ステージ26取り込み＆既存カスタムステージID繰り下げマイグレーション検証');

// ide.js から関連関数を抽出してサンドボックスでテスト
function extractMigrationHelpers() {
    const startIdx = ideJs.indexOf('const STORAGE_KEY_OFFICIAL_SYNC_MAX_ID');
    const endIdx = ideJs.indexOf('function loadSavedFilesFromStorage');
    assert(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx, 'migrateOfficialStagesInCode が ide.js に存在すること');
    const migrationCode = ideJs.slice(startIdx, endIdx);

    const parseStart = ideJs.indexOf('function parseStagesSafely(code)');
    const parseEnd = ideJs.indexOf('// 最後に変更を保存したステージを永続化・復元');
    const parseCode = ideJs.slice(parseStart, parseEnd);

    const rangeStart = ideJs.indexOf('function findStageObjectRangeInCode(code, targetStageIdx)');
    const rangeEnd = ideJs.indexOf('// ── ブラックホール・クリア不能ステージからの自動盤面エディタ誘導演出');
    const rangeCode = ideJs.slice(rangeStart, rangeEnd);

    const storageMap = new Map();
    const sandbox = {
        console,
        JSON,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Math,
        Set,
        Map,
        RegExp,
        localStorage: {
            getItem: k => storageMap.get(k) ?? null,
            setItem: (k, v) => storageMap.set(k, String(v)),
            removeItem: k => storageMap.delete(k)
        }
    };
    const script = `
        const files = {};
        ${parseCode}
        ${rangeCode}
        ${migrationCode}
        this.migrateOfficialStagesInCode = migrateOfficialStagesInCode;
        this.parseStagesSafely = parseStagesSafely;
        this.storageMap = storageMap;
    `.replace('this.storageMap = storageMap;', '');
    vm.runInNewContext(script, sandbox);
    return {
        migrate: sandbox.migrateOfficialStagesInCode,
        parse: sandbox.parseStagesSafely,
        storageMap
    };
}

const { migrate, parse, storageMap } = extractMigrationHelpers();
const officialParsed = parse(officialStagesJs);
assert.strictEqual(officialParsed.length, 26, '公式ステージが26個あること');

// ケースA: 公式1〜19のあとに、自作ステージ id: 26 と id: 27 がある場合
{
    storageMap.clear();
    const first19End = officialStagesJs.indexOf('// ステージ 20');
    const prefix19 = officialStagesJs.slice(0, first19End).trimEnd();
    const oldSaved = `${prefix19}
    {
        id: 26,
        title: 'ステージ 26',
        subtitle: '自作テストステージA',
        maxBlocks: 5,
        targetBlocks: 3,
        startRow: 2,
        goalRow: 2,
        forbidden: [],
        gimmicks: [],
        solution: [],
        legends: []
    },
    {
        id: 27,
        title: '自作ステージB',
        subtitle: '自作テストステージB',
        maxBlocks: 4,
        targetBlocks: 2,
        startRow: 1,
        goalRow: 3,
        forbidden: [],
        gimmicks: [],
        solution: [],
        legends: []
    }
];`;
    const migrated = migrate(oldSaved, officialStagesJs);
    const resultStages = parse(migrated);
    assert(Array.isArray(resultStages), 'マイグレーション後のコードが正常にパースできること');
    assert.strictEqual(resultStages.length, 28, '公式26 + 自作2 = 28ステージになること');
    for (let i = 1; i <= 26; i++) {
        const off = officialParsed.find(s => s.id === i);
        const cur = resultStages.find(s => s.id === i);
        assert(cur, `公式ステージ id:${i} が存在すること`);
        assert.strictEqual(cur.subtitle, off.subtitle, `ステージ id:${i} が公式ステージであること`);
    }
    const customA = resultStages.find(s => s.subtitle === '自作テストステージA');
    const customB = resultStages.find(s => s.subtitle === '自作テストステージB');
    assert.strictEqual(customA.id, 27, '元 id:26 の自作ステージが id:27 に繰り下がること');
    assert.strictEqual(customA.title, 'ステージ 26', 'title など id 以外は変更されないこと');
    assert.strictEqual(customB.id, 28, '元 id:27 の自作ステージが id:28 に繰り下がること');
}

// ケースB: 公式1〜25のあとに、自作ステージ id: 26 がある場合
{
    storageMap.clear();
    const stage26CommentIdx = officialStagesJs.indexOf('// ステージ 26');
    const prefix25 = officialStagesJs.slice(0, stage26CommentIdx).trimEnd();
    const oldSaved = `${prefix25}
    {
        id: 26,
        title: 'マイステージ26',
        subtitle: 'ユーザー作成26',
        maxBlocks: 6,
        targetBlocks: 4,
        startRow: 0,
        goalRow: 4,
        forbidden: [],
        gimmicks: [],
        solution: [],
        legends: []
    }
];`;
    const migrated = migrate(oldSaved, officialStagesJs);
    const resultStages = parse(migrated);
    assert.strictEqual(resultStages.length, 27, '公式26 + 自作1 = 27ステージになること');
    const official26 = resultStages.find(s => s.id === 26);
    const custom26 = resultStages.find(s => s.subtitle === 'ユーザー作成26');
    assert.strictEqual(official26.subtitle, '高台からの落下と跳躍', 'id:26 が公式ステージ26になること');
    assert.strictEqual(custom26.id, 27, '既存の自作 id:26 が id:27 に繰り下がること');
    assert.strictEqual(custom26.title, 'マイステージ26', 'title は変更されないこと');
}

// ケースC: 公式1〜19のあとに、新規ボタンで作成した id: 99 がある場合
{
    storageMap.clear();
    const first19End = officialStagesJs.indexOf('// ステージ 20');
    const prefix19 = officialStagesJs.slice(0, first19End).trimEnd();
    const oldSaved = `${prefix19}
    {
        id: 99,
        title: 'ステージ 99',
        subtitle: '新規ステージ',
        maxBlocks: 6,
        targetBlocks: 4,
        startRow: 3,
        goalRow: 1,
        forbidden: [],
        gimmicks: [],
        solution: [],
        legends: []
    }
];`;
    const migrated = migrate(oldSaved, officialStagesJs);
    const resultStages = parse(migrated);
    assert.strictEqual(resultStages.length, 27, '公式26 + 自作99 = 27ステージになること');
    const custom99 = resultStages.find(s => s.id === 99);
    assert(custom99 && custom99.subtitle === '新規ステージ', 'id:99 は繰り下げられず維持されること');
}

// ケースD: 既に最新26まで揃っている場合は何もしないこと
{
    storageMap.clear();
    const migrated = migrate(officialStagesJs, officialStagesJs);
    assert.strictEqual(migrated, officialStagesJs, '既に26まで揃っている場合はコードを変更しないこと');
}

console.log(' -> OK: 全マイグレーションパターンを確認しました。');
console.log('ALL EDITOR ISOLATION AND MIGRATION TESTS PASSED!');
