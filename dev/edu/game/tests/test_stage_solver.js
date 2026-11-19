// テスト: 5×5 盤面エディタ用 クリア可否テスト & 最小ブロック数解 (solution) 自動計算・流し込み機能の徹底検証
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const Solver = require('../editor/stage-solver.js');
const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');
const stagesJsCode = fs.readFileSync(path.join(__dirname, '../stages.js'), 'utf-8');
const ideJsCode = fs.readFileSync(path.join(__dirname, '../editor/ide.js'), 'utf-8');

function loadOfficialStages() {
    const ctx = vm.createContext({});
    vm.runInContext(stagesJsCode + '; this.STAGES = STAGES;', ctx);
    return ctx.STAGES;
}

function createMainEngineVerifier(stages) {
    const makeClassList = () => {
        const set = new Set();
        return {
            add: (...c) => c.forEach(x => set.add(x)),
            remove: (...c) => c.forEach(x => set.delete(x)),
            contains: (x) => set.has(x)
        };
    };
    const makeEl = (id) => ({
        id,
        style: {},
        disabled: false,
        innerHTML: '',
        textContent: '',
        classList: makeClassList(),
        addEventListener: () => {},
        querySelector: () => ({ textContent: '' }),
        appendChild: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 496, height: 376 })
    });
    const canvasEl = makeEl('gameCanvas');
    canvasEl.getContext = () => ({
        clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {},
        scale: () => {}, rotate: () => {}, beginPath: () => {}, rect: () => {},
        roundRect: () => {}, fillRect: () => {}, strokeRect: () => {},
        moveTo: () => {}, lineTo: () => {}, closePath: () => {},
        fill: () => {}, stroke: () => {}, arc: () => {}, ellipse: () => {},
        quadraticCurveTo: () => {}, clip: () => {}, fillText: () => {}, strokeText: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} })
    });

    const elMap = new Map([['gameCanvas', canvasEl]]);
    ['startBtn', 'resetBtn', 'answerBtn', 'statusBar', 'hintText', 'stageCurrentTitle', 'prevStageBtn', 'nextStageBtn', 'blockCountVal', 'legendWrap', 'redirectBlackoutCurtain']
        .forEach(id => elMap.set(id, makeEl(id)));

    let domLoadedCb = null;
    const winObj = {
        addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') domLoadedCb = fn; },
        removeEventListener: () => {},
        location: { search: '', hash: '', href: '' },
        innerWidth: 1200,
        innerHeight: 800
    };
    winObj.self = winObj;
    winObj.top = winObj;

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
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        document: {
            getElementById: (id) => elMap.get(id) || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => makeEl('dyn'),
            body: { style: {}, dataset: {}, classList: makeClassList(), appendChild: () => {}, removeChild: () => {} },
            documentElement: { style: {}, classList: makeClassList() }
        },
        performance: { now: () => 1000 },
        STAGES: stages,
        console
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(mainJsCode, context);
    if (domLoadedCb) domLoadedCb();

    return {
        verifyCoordsClearOnStage(stageIndex, coords) {
            sandbox.selectStage(stageIndex);
            vm.runInContext('grid = Array.from({ length: 5 }, () => Array(5).fill(false));', context);
            coords.forEach(p => sandbox.placeBlock(p.col, p.row));
            assert.strictEqual(sandbox.areBlocksConnected(), true, 'Placed blocks must be 8-way connected');
            const sim = sandbox.simulateGimmickBlockMoves();
            assert.strictEqual(sim.supernovas.length, 0, 'Must not cause supernova');
            assert.strictEqual(sim.blackHoleLoops.length, 0, 'Must not cause black hole');
            vm.runInContext('grid = ' + JSON.stringify(sim.finalGrid) + ';', context);
            const route = sandbox.solveRoute();
            assert.strictEqual(route[route.length - 1].type, 'done', 'Route must reach goal in main.js');
        },
        verifyCoordsFailOnStage(stageIndex, coords) {
            sandbox.selectStage(stageIndex);
            vm.runInContext('grid = Array.from({ length: 5 }, () => Array(5).fill(false));', context);
            coords.forEach(p => sandbox.placeBlock(p.col, p.row));
            const sim = sandbox.simulateGimmickBlockMoves();
            vm.runInContext('grid = ' + JSON.stringify(sim.finalGrid) + ';', context);
            const route = sandbox.solveRoute();
            assert.notStrictEqual(route[route.length - 1].type, 'done', 'Blocked route must NOT reach goal in main.js');
            assert.strictEqual(route[route.length - 1].type, 'fail', 'Blocked route must fail in main.js');
        }
    };
}

async function runAllTests() {
    // ==========================================================
    // Test 1: 全26公式ステージの solution 白紙状態からの最小解再発見 & 実機照合
    // ==========================================================
    console.log('Test 1: 全26公式ステージ（ブラインド状態）での最小ブロック解自動計算と main.js 完全一致検証');
    {
        const officialStages = loadOfficialStages();
        const verifier = createMainEngineVerifier(officialStages);

        officialStages.forEach((st, idx) => {
            const blind = JSON.parse(JSON.stringify(st));
            blind.solution = [];
            const res = Solver.findMinimumSolutionSync(blind);
            assert.strictEqual(res.found, true, `Stage ${st.id} must find a minimum solution`);
            assert.ok(res.blockCount <= st.solution.length, `Stage ${st.id} computed min (${res.blockCount}) must be <= official (${st.solution.length})`);
            assert.ok(Array.isArray(res.solutions) && res.solutions.length >= 1, `Stage ${st.id} must return solutions array`);
            res.solutions.forEach(entry => {
                verifier.verifyCoordsClearOnStage(idx, entry.solution);
            });
        });

        // ステージ9回帰テスト: (1,1)->(4,0) がゴール手前の頭上を塞ぐ配置は main.js / stage-solver.js の両方でクリア不可になること
        const stage9Idx = officialStages.findIndex(s => s.id === 9);
        const stage9BlockedCoords = [
            { col: 1, row: 1 }, { col: 0, row: 2 }, { col: 4, row: 2 },
            { col: 1, row: 3 }, { col: 3, row: 3 }, { col: 2, row: 4 }
        ];
        const stage9Diag = Solver.validateSolution(officialStages[stage9Idx], stage9BlockedCoords);
        assert.strictEqual(stage9Diag.ok, false, 'Stage 9 goal-blocked layout must fail in stage-solver.js');
        assert.strictEqual(stage9Diag.reasonCode, 'goal_blocked', 'Stage 9 goal-blocked layout must report goal_blocked');
        verifier.verifyCoordsFailOnStage(stage9Idx, stage9BlockedCoords);

        console.log(' -> OK: 全26ステージの全最小ブロック解が main.js 実機シミュレーションでゴール到達し、ステージ9の頭上封鎖ケースが確実に失敗することを確認しました。');
    }

    // ==========================================================
    // Test 2: validateSolution の各種失敗原因診断の正確性検証
    // ==========================================================
    console.log('Test 2: validateSolution の各種クリア不可理由診断検証');
    {
        const baseStage = {
            id: 501, title: 'Diag', startRow: 2, goalRow: 2, maxBlocks: 5, hasCeiling: true,
            forbidden: [{ col: 0, row: 0 }],
            gimmicks: [
                { col: 1, row: 1, type: 'step', dir: 'right', steps: 1, purpleBorder: true },
                { col: 3, row: 1, type: 'step', dir: 'left', steps: 1 },
                { col: 0, row: 4, type: 'step', dir: 'right', steps: 1 },
                { col: 1, row: 4, type: 'dash', dir: 'left' }
            ],
            lasers: [{ col: 2, row: 0, side: 'top' }],
            solution: []
        };

        assert.strictEqual(Solver.validateSolution(baseStage, []).reasonCode, 'empty_solution');
        assert.strictEqual(Solver.validateSolution(baseStage, [{ col: 0, row: 0 }]).reasonCode, 'on_forbidden');
        assert.strictEqual(Solver.validateSolution(baseStage, [{ col: 1, row: 2 }]).reasonCode, 'missing_purple');
        assert.strictEqual(Solver.validateSolution(baseStage, [{ col: 1, row: 1 }, { col: 4, row: 4 }]).reasonCode, 'disconnected');

        // 超新星衝突: (1,1)->R と (3,1)->L を (2,2) で連結させて同時進入
        assert.strictEqual(
            Solver.validateSolution(baseStage, [{ col: 1, row: 1 }, { col: 2, row: 2 }, { col: 3, row: 1 }]).reasonCode,
            'supernova'
        );

        // ブラックホール: (1,1) から連結で (0,4) を踏ませる
        const bhStage = {
            id: 502, title: 'BH Diag', startRow: 2, goalRow: 2, maxBlocks: 5,
            forbidden: [],
            gimmicks: [
                { col: 0, row: 3, type: 'step', dir: 'right', steps: 1 },
                { col: 1, row: 3, type: 'dash', dir: 'left' }
            ],
            lasers: [],
            solution: []
        };
        assert.strictEqual(Solver.validateSolution(bhStage, [{ col: 0, row: 3 }]).reasonCode, 'blackhole');

        // レーザー切断: 素通し縦レーザーの上を歩く配置
        const laserStage = {
            id: 503, title: 'Laser Diag', startRow: 3, goalRow: 3, maxBlocks: 6,
            forbidden: [], gimmicks: [], lasers: [{ col: 2, row: 0, side: 'top' }], solution: []
        };
        assert.strictEqual(
            Solver.validateSolution(laserStage, [0, 1, 2, 3, 4].map(c => ({ col: c, row: 4 }))).reasonCode,
            'laser'
        );
        console.log(' -> OK: 禁止マス・必須紫枠欠落・非連結・超新星・ブラックホール・レーザー切断の全診断を確認しました。');
    }

    // ==========================================================
    // Test 3: maxBlocks 不足時の上限引き上げ提案 & 非同期探索・中断検証
    // ==========================================================
    console.log('Test 3: maxBlocks 引き上げ自動検出 & 非同期探索検証');
    {
        // 最小5個必要なのに maxBlocks: 3 になっているステージ
        const underMaxStage = {
            id: 504, title: 'UnderMax', startRow: 2, goalRow: 2, maxBlocks: 3,
            forbidden: [], gimmicks: [], lasers: [], solution: []
        };
        const resSync = Solver.findMinimumSolutionSync(underMaxStage, { allowExceedMaxBlocks: true });
        assert.strictEqual(resSync.found, true);
        assert.strictEqual(resSync.blockCount, 5);
        assert.strictEqual(resSync.exceededOriginalMaxBlocks, true);
        assert.strictEqual(resSync.recommendedMaxBlocks, 5);

        // 非同期探索
        const resAsync = await Solver.findMinimumSolutionAsync(underMaxStage, { allowExceedMaxBlocks: true });
        assert.strictEqual(resAsync.found, true);
        assert.strictEqual(resAsync.blockCount, 5);

        // 完全クリア不可能ステージ
        const impossibleStage = {
            id: 505, title: 'Impossible', startRow: 2, goalRow: 2, maxBlocks: 10,
            forbidden: [0, 1, 2, 3, 4].map(r => ({ col: 2, row: r })),
            gimmicks: [], lasers: [], solution: []
        };
        const impRes = await Solver.findMinimumSolutionAsync(impossibleStage);
        assert.strictEqual(impRes.found, false);
        console.log(' -> OK: maxBlocks 不足時の推奨引き上げ計算・非同期探索・不可能判定を確認しました。');
    }

    // ==========================================================
    // Test 4: 盤面エディタ (ide.js) でのテスト実行・最小解自動流し込み・Undo 復元検証
    // ==========================================================
    console.log('Test 4: 盤面エディタ UI 連携（テスト・最小解流し込み・コード生成・Undo復元）検証');
    {
        const makeClassList = () => {
            const set = new Set();
            return {
                add: (...cls) => cls.forEach(c => set.add(c)),
                remove: (...cls) => cls.forEach(c => set.delete(c)),
                toggle: (c, force) => {
                    if (force === undefined) { if (set.has(c)) set.delete(c); else set.add(c); }
                    else if (force) set.add(c); else set.delete(c);
                },
                contains: (c) => set.has(c)
            };
        };
        const elMap = new Map();
        const attrs = new WeakMap();
        const listeners = new WeakMap();
        const makeEl = (id) => {
            const el = {
                id, style: {}, value: '', innerHTML: '', textContent: '', disabled: false,
                children: [], className: '', classList: makeClassList(), offsetWidth: 100,
                setAttribute: (k, v) => { const a = attrs.get(el) || {}; a[k] = String(v); attrs.set(el, a); },
                getAttribute: (k) => (attrs.get(el) || {})[k] || null,
                addEventListener: (ev, fn) => {
                    const map = listeners.get(el) || {};
                    map[ev] = map[ev] || [];
                    map[ev].push(fn);
                    listeners.set(el, map);
                },
                click: () => {
                    const map = listeners.get(el) || {};
                    (map.click || []).forEach(fn => fn());
                },
                querySelector: () => null,
                querySelectorAll: () => [],
                appendChild: (ch) => el.children.push(ch),
                focus: () => {},
                setSelectionRange: () => {}
            };
            elMap.set(id, el);
            return el;
        };

        const editorHtmlCode = fs.readFileSync(path.join(__dirname, '../editor/index.html'), 'utf8');
        const editorCssCode = fs.readFileSync(path.join(__dirname, '../editor/ide.css'), 'utf8');
        assert.strictEqual(editorHtmlCode.includes('id="btn-builder-test-solution"'), false, 'Old test-only button must be removed from editor/index.html');
        assert.ok(editorHtmlCode.includes('id="btn-builder-auto-solve"'), 'btn-builder-auto-solve must exist');
        assert.ok(editorHtmlCode.includes('>クリア可否をテスト</button>'), 'btn-builder-auto-solve label must be クリア可否をテスト');
        assert.ok(editorHtmlCode.includes('id="btn-builder-view-solutions"'), 'btn-builder-view-solutions must exist');
        assert.ok(editorHtmlCode.includes('>配置例を確認する</button>'), 'btn-builder-view-solutions label must be 配置例を確認する');
        assert.ok(editorCssCode.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'Solutions grid must be 2 columns per row');
        assert.ok(editorCssCode.includes('overflow-y: auto'), 'Solutions body must be vertically scrollable');

        [
            'editor-tabs', 'editor-pane', 'line-numbers', 'line-numbers-inner', 'code-textarea', 'code-highlight',
            'pane-resizer', 'preview-pane', 'ide-toast', 'ide-toast-msg',
            'stage-builder-overlay', 'builder-stage-select', 'builder-grid-5x5', 'builder-start-col', 'builder-goal-col',
            'builder-board-stats', 'builder-code-preview', 'builder-ceiling-status', 'builder-ceiling-bar',
            'builder-input-id', 'builder-input-maxblocks', 'builder-input-targetblocks', 'builder-input-title', 'builder-input-subtitle',
            'btn-builder-undo', 'btn-builder-redo', 'btn-builder-auto-solve', 'btn-builder-view-solutions', 'builder-solver-status',
            'builder-solutions-overlay', 'builder-solutions-dialog', 'builder-solutions-grid', 'builder-solutions-summary', 'builder-solutions-body',
            'btn-close-builder-solutions', 'btn-builder-solutions-done',
            'auto-builder-blackout-curtain', 'auto-builder-marquee-banner', 'auto-builder-marquee-text'
        ].forEach(id => makeEl(id));

        const stageCode = `const STAGES = [
    {
        id: 77,
        title: 'ステージ 77',
        subtitle: 'エディタ自動計算テスト',
        maxBlocks: 4,
        targetBlocks: 4,
        startRow: 2,
        goalRow: 2,
        forbidden: [{ col: 2, row: 3 }],
        gimmicks: [
            { col: 2, row: 1, type: 'step', dir: 'down', steps: 1 }
        ],
        lasers: [{ col: 2, row: 0, side: 'top' }],
        solution: []
    }
];`;

        let domLoadedCb = null;
        const storage = new Map([['hako_game_ide_v2_stages.js', stageCode]]);
        const ideSandbox = {
            window: {
                HakoStageSolver: Solver,
                addEventListener: () => {},
                location: { search: '', pathname: '/dev/edu/game/editor/index.html', hash: '' },
                innerWidth: 1280,
                innerHeight: 800
            },
            document: {
                addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') domLoadedCb = fn; },
                getElementById: (id) => elMap.get(id) || null,
                querySelector: () => null,
                querySelectorAll: () => [],
                createElement: (tag) => makeEl('dyn_' + tag + '_' + Math.random()),
                body: { classList: makeClassList(), style: {} },
                documentElement: { classList: makeClassList(), style: {} }
            },
            URLSearchParams,
            localStorage: {
                getItem: (k) => storage.has(k) ? storage.get(k) : null,
                setItem: (k, v) => storage.set(k, String(v)),
                removeItem: (k) => storage.delete(k)
            },
            sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            fetch: () => Promise.resolve({ ok: false }),
            setTimeout: (fn) => { fn(); return 1; },
            clearTimeout: () => {},
            requestAnimationFrame: () => 1,
            performance: { now: () => 1000 },
            console
        };

        const ideCtx = vm.createContext(ideSandbox);
        vm.runInContext(ideJsCode, ideCtx);
        domLoadedCb();

        // ステージ77を盤面エディタにロード
        const api = ideSandbox.window.__editorApi;
        api.openStageBuilderModal(0);

        // 初期状態では「配置例を確認する」ボタンは非表示
        assert.strictEqual(elMap.get('btn-builder-view-solutions').style.display, 'none', 'View solutions button must be hidden initially');

        // 1. 「クリア可否をテスト」実行 -> 最小解を自動計算して盤面に配置し、maxBlocks/targetBlocks も 5 に引き上げられること
        const solveRes = api.autoSolveBuilderStageSync();
        assert.strictEqual(solveRes.found, true);
        assert.strictEqual(solveRes.blockCount, 5);
        assert.ok(Array.isArray(solveRes.solutions) && solveRes.solutions.length >= 1, 'All min solutions must be collected');
        assert.strictEqual(elMap.get('builder-solver-status').getAttribute('data-state'), 'warn');

        const bState = api.getBuilderState();
        assert.strictEqual(bState.maxBlocks, 5, 'maxBlocks should be updated to 5');
        assert.strictEqual(bState.targetBlocks, 5, 'targetBlocks should be updated to 5');
        const previewCode = elMap.get('builder-code-preview').textContent;
        assert.ok(previewCode.includes('maxBlocks: 5'), 'Generated code preview must include updated maxBlocks: 5');

        // 正答存在時は右横に「配置例を確認する」ボタンが表示されること
        assert.strictEqual(elMap.get('btn-builder-view-solutions').style.display, 'inline-flex', 'View solutions button must be visible when solutions exist');
        assert.strictEqual(elMap.get('btn-builder-view-solutions').disabled, false);

        // 2. 「配置例を確認する」押下で配置例モーダルが開き、すべての通りがカード描画されること
        elMap.get('builder-solutions-grid').children = [];
        elMap.get('btn-builder-view-solutions').click();
        assert.ok(elMap.get('builder-solutions-overlay').classList.contains('is-open'), 'Solutions modal must open');
        const cards = elMap.get('builder-solutions-grid').children;
        assert.strictEqual(cards.length, solveRes.solutions.length, 'All solution cards must be rendered');
        if (cards.length >= 2) {
            cards[1].click();
            assert.strictEqual(elMap.get('builder-solutions-overlay').classList.contains('is-open'), false, 'Clicking a card must apply and close solutions modal');
            assert.strictEqual(api.buildStageObjectFromBuilder(false).solution.length, 5, 'Applied solution must have 5 blocks');
            elMap.get('btn-builder-undo').click();
        }

        // 3. Undo ボタンで元の未配置＆maxBlocks=4 に戻せること
        elMap.get('btn-builder-undo').click();
        assert.strictEqual(api.getBuilderState().maxBlocks, 4, 'Undo must restore original maxBlocks=4');
        const afterUndoCount = api.buildStageObjectFromBuilder(false).solution.length;
        assert.strictEqual(afterUndoCount, 0, 'Undo must restore empty solution');
        assert.strictEqual(elMap.get('btn-builder-view-solutions').style.display, 'none', 'View solutions button must hide again when board maxBlocks changes via undo');
        console.log(' -> OK: 盤面エディタの統一クリア可否テスト・全正答配置例モーダル・クリック適用・Undo復元を確認しました。');
    }

    console.log('ALL STAGE SOLVER TESTS PASSED!');
}

runAllTests().catch(err => {
    console.error(err);
    process.exit(1);
});
