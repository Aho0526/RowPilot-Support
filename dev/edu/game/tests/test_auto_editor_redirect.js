// テスト: ブラックホール2体以上 & 自作クリア不可能ステージのシームレスエディタ遷移・盤面エディタ自動オープン・メッセージ表示検証
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');
const stagesJsCode = fs.readFileSync(path.join(__dirname, '../stages.js'), 'utf-8');
const ideJsCode = fs.readFileSync(path.join(__dirname, '../editor/ide.js'), 'utf-8');

function loadOfficialStages() {
    const ctx = vm.createContext({});
    vm.runInContext(stagesJsCode + '; this.STAGES = STAGES;', ctx);
    return ctx.STAGES;
}

function createGameSandbox(stagesOverride, opts = {}) {
    const mockEls = new Map();
    const makeClassList = () => {
        const set = new Set();
        return {
            add: (...cls) => cls.forEach(c => set.add(c)),
            remove: (...cls) => cls.forEach(c => set.delete(c)),
            contains: (c) => set.has(c)
        };
    };
    const makeEl = (id, initialText = '') => {
        const labelEl = { textContent: initialText };
        const el = {
            id,
            style: {},
            disabled: false,
            title: '',
            innerHTML: '',
            textContent: initialText,
            className: '',
            classList: makeClassList(),
            _listeners: {},
            addEventListener: (ev, fn) => {
                el._listeners[ev] = el._listeners[ev] || [];
                el._listeners[ev].push(fn);
            },
            querySelector: (sel) => (sel === '.btn-main-label' ? labelEl : null),
            appendChild: () => {},
            getBoundingClientRect: () => ({ left: 10, top: 10, width: 400, height: 300 })
        };
        mockEls.set(id, el);
        return el;
    };

    const canvasEl = makeEl('gameCanvas');
    canvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 496, height: 376 });
    const curtainEl = makeEl('redirectBlackoutCurtain');
    curtainEl.style.display = 'none';
    curtainEl.style.opacity = '0';

    const mockCtx = {
        clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {},
        scale: () => {}, rotate: () => {}, beginPath: () => {}, rect: () => {},
        roundRect: () => {}, fillRect: () => {}, strokeRect: () => {},
        moveTo: () => {}, lineTo: () => {}, closePath: () => {},
        fill: () => {}, stroke: () => {}, arc: () => {}, ellipse: () => {},
        quadraticCurveTo: () => {}, clip: () => {},
        fillText: () => {}, strokeText: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} })
    };
    canvasEl.getContext = () => mockCtx;

    ['startBtn', 'resetBtn', 'answerBtn', 'statusBar', 'hintText', 'stageCurrentTitle', 'prevStageBtn', 'nextStageBtn', 'blockCountVal', 'legendWrap']
        .forEach(id => makeEl(id));

    const selMap = {
        '.cloud': [makeEl('cloud1')],
        '#gameBackToHomeBtn': [makeEl('gameBackToHomeBtn')],
        '#gameToSelectBtn': [makeEl('gameToSelectBtn')],
        '#gameToEditorBtn': [makeEl('gameToEditorBtn')],
        '.stage-nav-pill': [makeEl('stageNavPill')],
        '#helpBtn': [makeEl('helpBtn')],
        '#answerBtn': [mockEls.get('answerBtn')],
        '.status-wrap': [makeEl('statusWrap')],
        '#statusBar': [mockEls.get('statusBar')],
        '#blockBadge': [makeEl('blockBadge')],
        '#startBtn': [mockEls.get('startBtn')],
        '#resetBtn': [mockEls.get('resetBtn')],
        '#legendWrap': [mockEls.get('legendWrap')]
    };

    let nowMs = 1000;
    let domLoadedCb = null;
    const sessionStore = new Map();
    let redirectedPayload = null;

    const topWinObj = {};
    const winObj = {
        addEventListener: (ev, fn) => {
            if (ev === 'DOMContentLoaded') domLoadedCb = fn;
        },
        removeEventListener: () => {},
        location: { search: opts.search || '', hash: '', href: '' },
        innerWidth: 1200,
        innerHeight: 800,
        __redirectToEditorHook: (p) => {
            redirectedPayload = p;
        }
    };
    winObj.self = winObj;
    winObj.top = opts.inIframe ? topWinObj : winObj;
    winObj.frameElement = opts.inIframe ? {} : null;

    const sandbox = {
        window: winObj,
        URLSearchParams,
        setTimeout: () => 1,
        clearTimeout: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        sessionStorage: {
            getItem: (k) => sessionStore.has(k) ? sessionStore.get(k) : null,
            setItem: (k, v) => sessionStore.set(k, String(v)),
            removeItem: (k) => sessionStore.delete(k)
        },
        document: {
            getElementById: (id) => mockEls.get(id) || null,
            querySelector: () => null,
            querySelectorAll: (sel) => selMap[sel] || [],
            createElement: (tag) => makeEl(tag + '_dyn'),
            body: { style: {}, dataset: {}, classList: makeClassList(), appendChild: () => {}, removeChild: () => {} },
            documentElement: { style: {}, classList: makeClassList() }
        },
        performance: { now: () => nowMs },
        STAGES: stagesOverride,
        console
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(mainJsCode, context);
    if (domLoadedCb) domLoadedCb();
    vm.runInContext('ctx = document.getElementById("gameCanvas").getContext("2d");', context);

    return {
        sandbox,
        context,
        curtainEl,
        getRedirectedPayload: () => redirectedPayload,
        resetRedirectedPayload: () => { redirectedPayload = null; },
        setNow: (t) => { nowMs = t; }
    };
}

// ==========================================================
// Test 1: 本番画面でブラックホール2体以上出現時、暗転完了後にDROPせずエディタ遷移すること
// ==========================================================
console.log('Test 1: ブラックホール2体以上（12体・2体）の暗転直結エディタ遷移検証');
{
    const photoGimmicks = [
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 0, type: 'dash', dir: 'down' })),
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 1, type: 'step', dir: 'up', steps: 1 })),
        { col: 0, row: 2, type: 'dash', dir: 'right' },
        { col: 1, row: 2, type: 'step', dir: 'left', steps: 1 },
        { col: 3, row: 2, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 2, type: 'dash', dir: 'left' },
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 3, type: 'step', dir: 'down', steps: 1 })),
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 4, type: 'dash', dir: 'up' }))
    ];
    const st101 = { id: 101, title: 'ステージ 101', startRow: 2, goalRow: 2, maxBlocks: 20, forbidden: [], gimmicks: photoGimmicks, solution: [] };
    const sb = createGameSandbox([st101]);

    // 12個BHループとなる12ブロック配置
    [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]].forEach(([c, r]) => sb.sandbox.placeBlock(c, r));
    const sim = sb.sandbox.simulateGimmickBlockMoves();
    assert.strictEqual(sim.blackHoleLoops.length, 12);

    sb.setNow(1000);
    sb.sandbox.startBlackHole(sim.blackHoleLoops);
    const tl = vm.runInContext('blackHoleState.timeline', sb.context);

    // BH_COLLAPSE_END 直前まではまだリダイレクトしない
    sb.sandbox.animateBlackHole(1000 + tl.BH_COLLAPSE_END - 50);
    assert.strictEqual(sb.getRedirectedPayload(), null, 'Must not redirect before BH collapse finishes');

    // BH_COLLAPSE_END + 250ms 時点で暗転カーテンが張られ、DROPへ進まず即リダイレクト発動
    sb.sandbox.animateBlackHole(1000 + tl.BH_COLLAPSE_END + 260);
    const payload = sb.getRedirectedPayload();
    assert.ok(payload, 'Must redirect to editor after multi-BH blackout');
    assert.strictEqual(payload.stageId, 101);
    assert.strictEqual(payload.message, 'ゴールできるステージを作れ^^');
    assert.strictEqual(payload.reason, 'multi_blackhole');
    assert.strictEqual(sb.curtainEl.style.opacity, '1', 'Redirect curtain must stay opaque dark (#060814)');
    assert.strictEqual(sb.curtainEl.style.display, 'block');

    // DualEvent（爆発 + 2体BH）でも同じ遷移が発動すること
    const dualGimmicks = [
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 0, type: 'dash', dir: 'left' },
        { col: 0, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 4, type: 'dash', dir: 'left' },
        { col: 1, row: 2, type: 'step', dir: 'right', steps: 1 },
        { col: 3, row: 2, type: 'step', dir: 'left', steps: 1 }
    ];
    const stDual = { id: 102, title: 'Dual 2BH', startRow: 2, goalRow: 2, maxBlocks: 10, forbidden: [], gimmicks: dualGimmicks, solution: [] };
    const sbDual = createGameSandbox([stDual]);
    [[0, 0], [0, 4], [1, 2], [3, 2]].forEach(([c, r]) => sbDual.sandbox.placeBlock(c, r));
    const simDual = sbDual.sandbox.simulateGimmickBlockMoves();
    assert.strictEqual(simDual.blackHoleLoops.length, 2);
    assert.strictEqual(simDual.supernovas.length, 1);

    sbDual.setNow(2000);
    sbDual.sandbox.startDualSupernovaBlackHole(simDual.supernovas, simDual.blackHoleLoops);
    const dtl = vm.runInContext('dualEventState.timeline', sbDual.context);
    sbDual.sandbox.animateDualEvent(2000 + dtl.BH_COLLAPSE_END + 260);
    const dualPayload = sbDual.getRedirectedPayload();
    assert.ok(dualPayload && dualPayload.stageId === 102, 'Dual event with >=2 BHs must also redirect');
    console.log(' -> OK: BH 2体以上の全吸収暗転直後にDROPせず滑らかにエディタ遷移することを確認しました。');
}

// ==========================================================
// Test 2: エディタ内プレビュー (iframe内) では遷移しないこと
// ==========================================================
console.log('Test 2: エディタ内プレビュー (inEditorPreview) 非発動確認');
{
    const g2 = [
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 0, type: 'dash', dir: 'left' },
        { col: 0, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 4, type: 'dash', dir: 'left' }
    ];
    const stPreview = { id: 103, title: 'Preview BH', startRow: 2, goalRow: 2, maxBlocks: 10, forbidden: [], gimmicks: g2, solution: [] };
    const sbPrev = createGameSandbox([stPreview], { inIframe: true });
    [[0, 0], [0, 4]].forEach(([c, r]) => sbPrev.sandbox.placeBlock(c, r));
    const simPrev = sbPrev.sandbox.simulateGimmickBlockMoves();
    sbPrev.setNow(1000);
    sbPrev.sandbox.startBlackHole(simPrev.blackHoleLoops);
    const tl = vm.runInContext('blackHoleState.timeline', sbPrev.context);
    sbPrev.sandbox.animateBlackHole(1000 + tl.BH_COLLAPSE_END + 300);
    assert.strictEqual(sbPrev.getRedirectedPayload(), null, 'Preview iframe must NOT redirect to editor');
    console.log(' -> OK: エディタ内プレビューでは通常演出が維持され、リダイレクトしないことを確認しました。');
}

// ==========================================================
// Test 3: クリア不可能判定 (isStageSolvable) & ?mode=custom 失敗後お任せ暗転遷移検証
// ==========================================================
console.log('Test 3: isStageSolvable 厳密判定＆?mode=custom 時のクリア不能演出検証');
{
    const officialStages = loadOfficialStages();
    const impForbiddenCol = {
        id: 301, title: 'クリア不能テスト', startRow: 2, goalRow: 2, maxBlocks: 6,
        forbidden: [0, 1, 2, 3, 4].map(r => ({ col: 2, row: r })),
        gimmicks: [], lasers: [{ col: 2, row: 0, side: 'top' }], solution: []
    };
    const solvableCustom = {
        id: 302, title: 'クリア可能テスト', startRow: 2, goalRow: 2, maxBlocks: 6,
        forbidden: [], gimmicks: [], solution: []
    };
    const sb = createGameSandbox([...officialStages, impForbiddenCol, solvableCustom], { search: '?mode=custom' });
    const game = sb.sandbox.window.__game;

    // 公式26ステージは全てクリア可能判定
    officialStages.forEach(st => {
        assert.strictEqual(game.isStageSolvable(st), true, `Official stage ${st.id} must be solvable`);
    });
    assert.strictEqual(game.isStageSolvable(solvableCustom), true, 'Solvable custom stage must be true');
    assert.strictEqual(game.isStageSolvable(impForbiddenCol), false, 'Impossible laser/forbidden stage must be false');

    // 公式モード(customMode=false)では失敗完了しても遷移しない
    const impIdx = officialStages.length; // impForbiddenCol
    game.selectStage(impIdx);
    game.setCustomMode(false);
    sb.sandbox.completeRespawn();
    assert.strictEqual(game.getPhase(), 'place', 'Non-custom mode must return to place phase normally');
    assert.strictEqual(sb.getRedirectedPayload(), null);

    // ?mode=custom (customMode=true) の時はミス完了後に impossible_blackout お任せ演出が発動し暗転遷移する
    game.setCustomMode(true);
    sb.setNow(5000);
    sb.sandbox.completeRespawn();
    assert.strictEqual(game.getPhase(), 'impossible_blackout', 'Custom impossible stage must trigger blackout sequence');
    const ibState = game.getImpossibleBlackoutState();
    assert.ok(ibState, 'impossibleBlackoutState must be initialized');

    sb.sandbox.animateImpossibleBlackout(5000 + ibState.scanDuration + 200);
    assert.strictEqual(sb.getRedirectedPayload(), null, 'Should animate warning/suck before final redirect');

    sb.sandbox.animateImpossibleBlackout(5000 + ibState.redirectAt + 20);
    const impPayload = sb.getRedirectedPayload();
    assert.ok(impPayload, 'Must redirect after impossible blackout finishes');
    assert.strictEqual(impPayload.stageId, 301);
    assert.strictEqual(impPayload.reason, 'unsolvable');
    assert.strictEqual(impPayload.message, 'ゴールできるステージを作れ^^');
    console.log(' -> OK: クリア不能判定と ?mode=custom 時の暗転お任せ演出＆遷移を確認しました。');
}

// ==========================================================
// Test 4: エディタ側 (ide.js) で暗転から盤面エディタ->当該ステージ自動オープン＆メッセージ流出検証
// ==========================================================
console.log('Test 4: エディタ側シームレス解除・盤面エディタ自動オープン・メッセージ流出検証');
{
    const makeClassList = (initial = []) => {
        const set = new Set(initial);
        return {
            add: (...cls) => cls.forEach(c => set.add(c)),
            remove: (...cls) => cls.forEach(c => set.delete(c)),
            toggle: (c, force) => {
                if (force === undefined) {
                    if (set.has(c)) set.delete(c); else set.add(c);
                } else if (force) set.add(c);
                else set.delete(c);
            },
            contains: (c) => set.has(c)
        };
    };

    const elMap = new Map();
    const attrs = new WeakMap();
    const makeEl = (id) => {
        const el = {
            id,
            style: {},
            value: '',
            innerHTML: '',
            textContent: '',
            children: [],
            className: '',
            classList: makeClassList(),
            offsetWidth: 100,
            setAttribute: (k, v) => {
                const a = attrs.get(el) || {};
                a[k] = String(v);
                attrs.set(el, a);
            },
            getAttribute: (k) => (attrs.get(el) || {})[k] || null,
            addEventListener: () => {},
            querySelector: () => null,
            querySelectorAll: () => [],
            appendChild: (ch) => el.children.push(ch),
            focus: () => {},
            setSelectionRange: () => {}
        };
        elMap.set(id, el);
        return el;
    };

    const essentialIds = [
        'editor-tabs', 'editor-pane', 'line-numbers', 'line-numbers-inner', 'code-textarea', 'code-highlight',
        'pane-resizer', 'preview-pane', 'ide-toast', 'ide-toast-msg',
        'stage-builder-overlay', 'builder-stage-select', 'builder-grid-5x5', 'builder-start-col', 'builder-goal-col',
        'builder-board-stats', 'builder-code-preview', 'builder-ceiling-status', 'builder-ceiling-bar',
        'builder-input-id', 'builder-input-maxblocks', 'builder-input-targetblocks', 'builder-input-title', 'builder-input-subtitle',
        'auto-builder-blackout-curtain', 'auto-builder-marquee-banner', 'auto-builder-marquee-text'
    ];
    essentialIds.forEach(id => makeEl(id));

    const timerQueue = [];
    let domLoadedCb = null;
    const customStagesCode = `const STAGES = [
    {
        id: 1,
        title: 'ステージ 1',
        subtitle: '基本',
        maxBlocks: 5,
        targetBlocks: 4,
        startRow: 2,
        goalRow: 2,
        forbidden: [],
        gimmicks: [],
        solution: []
    },
    {
        id: 101,
        title: 'ステージ 101',
        subtitle: 'BHだらけ自作',
        maxBlocks: 20,
        targetBlocks: 10,
        startRow: 2,
        goalRow: 2,
        forbidden: [],
        gimmicks: [
            { col: 0, row: 0, type: 'dash', dir: 'down' }
        ],
        solution: []
    }
];`;

    const storageMap = new Map();
    storageMap.set('hako_game_ide_v2_stages.js', customStagesCode);

    const sessionMap = new Map();
    sessionMap.set('hako_editor_redirect_payload', JSON.stringify({
        stageId: 101,
        stageIndex: 1,
        stageTitle: 'ステージ 101',
        reason: 'multi_blackhole',
        message: 'ゴールできるステージを作れ^^',
        isCustomMode: true,
        ts: Date.now()
    }));

    const docEl = { classList: makeClassList(['auto-builder-blackout']), style: { backgroundColor: '#060814' } };
    let replacedUrl = null;

    const ideSandbox = {
        window: {
            addEventListener: () => {},
            location: { search: '?autoBuilder=1&stageId=101&stageIndex=1', pathname: '/dev/edu/game/editor/index.html', hash: '' },
            innerWidth: 1280,
            innerHeight: 800
        },
        history: {
            replaceState: (_, __, url) => { replacedUrl = url; }
        },
        document: {
            addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') domLoadedCb = fn; },
            getElementById: (id) => elMap.get(id) || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => makeEl('dyn_' + tag + '_' + Math.random()),
            body: { classList: makeClassList(), style: {} },
            documentElement: docEl
        },
        URLSearchParams,
        localStorage: {
            getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
            setItem: (k, v) => storageMap.set(k, String(v)),
            removeItem: (k) => storageMap.delete(k)
        },
        sessionStorage: {
            getItem: (k) => sessionMap.has(k) ? sessionMap.get(k) : null,
            setItem: (k, v) => sessionMap.set(k, String(v)),
            removeItem: (k) => sessionMap.delete(k)
        },
        fetch: () => Promise.resolve({ ok: false }),
        setTimeout: (fn, delay) => {
            timerQueue.push({ fn, delay });
            return timerQueue.length;
        },
        clearTimeout: () => {},
        requestAnimationFrame: (fn) => 1,
        performance: { now: () => 1000 },
        console
    };
    ideSandbox.window.history = ideSandbox.history;

    const ideCtx = vm.createContext(ideSandbox);
    vm.runInContext(ideJsCode, ideCtx);
    assert.ok(domLoadedCb, 'ide.js DOMContentLoaded handler must register');
    domLoadedCb();

    const api = ideSandbox.window.__editorApi;
    assert.ok(api && typeof api.checkAutoBuilderRedirect === 'function', '__editorApi.checkAutoBuilderRedirect must exist');

    // 自動リダイレクトチェックを実行
    const started = api.checkAutoBuilderRedirect();
    assert.strictEqual(started, true, 'checkAutoBuilderRedirect must detect payload/query and start sequence');
    assert.strictEqual(sessionMap.has('hako_editor_redirect_payload'), false, 'Payload must be consumed from sessionStorage');
    assert.strictEqual(replacedUrl, '/dev/edu/game/editor/index.html', 'URL autoBuilder params must be cleaned up');

    const curtain = elMap.get('auto-builder-blackout-curtain');
    assert.strictEqual(curtain.classList.contains('is-peeking'), true, 'Curtain should peek before modal opens');

    // スケジュールされた短時間ステップ (100ms, 220ms, 290ms, 600ms) を順番に実行
    timerQueue.filter(t => t.delay <= 600).sort((a, b) => a.delay - b.delay).forEach(t => t.fn());

    const overlay = elMap.get('stage-builder-overlay');
    assert.strictEqual(overlay.classList.contains('is-open'), true, '盤面エディタモーダルが自動的に開いていること');
    const bState = api.getBuilderState();
    assert.strictEqual(bState.id, 101, '盤面エディタが当該ステージ(id:101)を読み込んでいること');
    assert.strictEqual(bState.stageIndex, 1);
    assert.strictEqual(bState.cells[0][0].dashDir, 'down', '当該ステージのギミックが盤面に復元されていること');

    assert.strictEqual(docEl.classList.contains('auto-builder-blackout'), false, '暗転クラスが解除されていること');
    const marqueeBanner = elMap.get('auto-builder-marquee-banner');
    const marqueeText = elMap.get('auto-builder-marquee-text');
    assert.strictEqual(marqueeBanner.classList.contains('is-active'), true, 'メッセージバナーがアクティブになること');
    assert.strictEqual(marqueeText.textContent, 'ゴールできるステージを作れ^^', '指定メッセージが正確に表示されること');

    console.log(' -> OK: エディタ遷移時の暗転保持→盤面エディタで当該ステージ自動オープン→暗転解除→メッセージ流出の全シーケンスを確認しました。');
}

console.log('ALL AUTO EDITOR REDIRECT TESTS PASSED!');

