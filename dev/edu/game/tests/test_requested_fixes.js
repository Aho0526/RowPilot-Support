// テスト: 今回修正の全6項目（爆発+BH*4全吸収・ステージ21削除・BH無制限12個・キャンセル復元・レーザー半分判定＆お前はもう死んでいる演出・ステージ先→UI後）の検証
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');
const stagesJsCode = fs.readFileSync(path.join(__dirname, '../stages.js'), 'utf-8');

function loadStages() {
    const ctx = vm.createContext({});
    vm.runInContext(stagesJsCode + '; this.STAGES = STAGES;', ctx);
    return ctx.STAGES;
}

function createFullSandbox(stagesOverride) {
    const mockEls = new Map();
    const textCalls = [];

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
            classList: makeClassList(),
            _listeners: {},
            addEventListener: (ev, fn) => {
                el._listeners[ev] = el._listeners[ev] || [];
                el._listeners[ev].push(fn);
            },
            click: () => {
                (el._listeners['click'] || []).forEach(fn => fn({ stopPropagation: () => {} }));
            },
            querySelector: (sel) => (sel === '.btn-main-label' ? labelEl : null),
            appendChild: () => {},
            getBoundingClientRect: () => ({ left: 10, top: 10, width: 60, height: 30 })
        };
        mockEls.set(id, el);
        return el;
    };

    const canvasEl = makeEl('gameCanvas');
    canvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 496, height: 376 });
    const startBtnEl = makeEl('startBtn', 'スタート');
    const resetBtnEl = makeEl('resetBtn', 'リセット');
    const answerBtnEl = makeEl('answerBtn', '');
    const statusBarEl = makeEl('statusBar', '');
    const hintTextEl = makeEl('hintText', '');
    const stageTitleEl = makeEl('stageCurrentTitle', '');
    const prevBtnEl = makeEl('prevStageBtn', '');
    const nextBtnEl = makeEl('nextStageBtn', '');
    const blockCountEl = makeEl('blockCountVal', '0 / 5');
    const legendEl = makeEl('legendWrap', '');
    const homeBtnEl = makeEl('gameBackToHomeBtn', '');
    const selectBtnEl = makeEl('gameToSelectBtn', '');
    const helpBtnEl = makeEl('helpBtn', '');
    const statusWrapEl = makeEl('statusWrap', '');
    const blockBadgeEl = makeEl('blockBadge', '');
    const cloudEl = makeEl('cloud1', '');

    const selMap = {
        '.cloud': [cloudEl],
        '#gameBackToHomeBtn': [homeBtnEl],
        '#gameToSelectBtn': [selectBtnEl],
        '#gameToEditorBtn': [],
        '.stage-nav-pill': [makeEl('stageNavPill')],
        '#helpBtn': [helpBtnEl],
        '#answerBtn': [answerBtnEl],
        '.status-wrap': [statusWrapEl],
        '#statusBar': [statusBarEl],
        '#blockBadge': [blockBadgeEl],
        '#startBtn': [startBtnEl],
        '#resetBtn': [resetBtnEl],
        '#legendWrap': [legendEl]
    };

    const mockCtx = {
        clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {},
        scale: () => {}, rotate: () => {}, beginPath: () => {}, rect: () => {},
        roundRect: () => {}, fillRect: () => {}, strokeRect: () => {},
        moveTo: () => {}, lineTo: () => {}, closePath: () => {},
        fill: () => {}, stroke: () => {}, arc: () => {}, ellipse: () => {},
        quadraticCurveTo: () => {}, clip: () => {},
        fillText: (txt, x, y) => textCalls.push({ op: 'fill', txt, x, y }),
        strokeText: (txt, x, y) => textCalls.push({ op: 'stroke', txt, x, y }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} })
    };
    canvasEl.getContext = () => mockCtx;

    let nowMs = 1000;
    const windowListeners = {};
    let domLoadedCb = null;

    const sandbox = {
        window: {
            addEventListener: (ev, fn) => {
                if (ev === 'DOMContentLoaded') domLoadedCb = fn;
                else {
                    windowListeners[ev] = windowListeners[ev] || [];
                    windowListeners[ev].push(fn);
                }
            },
            removeEventListener: () => {},
            location: { search: '', hash: '' },
            innerWidth: 1200,
            innerHeight: 800
        },
        URLSearchParams,
        setTimeout: () => 1,
        clearTimeout: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
        document: {
            getElementById: (id) => mockEls.get(id) || null,
            querySelector: () => null,
            querySelectorAll: (sel) => selMap[sel] || [],
            createElement: () => ({ style: {}, className: '', innerHTML: '', appendChild: () => {}, addEventListener: () => {} }),
            body: { style: {}, dataset: {}, classList: makeClassList(), appendChild: () => {}, removeChild: () => {} },
            documentElement: { classList: makeClassList() }
        },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        performance: { now: () => nowMs },
        STAGES: stagesOverride,
        console,
        setNow: (t) => { nowMs = t; }
    };
    sandbox.window.self = sandbox.window;
    sandbox.window.top = sandbox.window;

    const context = vm.createContext(sandbox);
    vm.runInContext(mainJsCode, context);
    if (domLoadedCb) domLoadedCb();
    vm.runInContext('ctx = document.getElementById("gameCanvas").getContext("2d");', context);

    return {
        sandbox,
        context,
        els: { startBtnEl, resetBtnEl, statusBarEl, cloudEl, homeBtnEl, statusWrapEl },
        textCalls,
        windowListeners,
        setNow: (t) => { nowMs = t; }
    };
}

// ==========================================================
// Test 1: ステージ21削除・22〜27繰り上げ・全26ステージクリア検証
// ==========================================================
console.log('Test 1: ステージ21削除と21〜26繰り上げ・全26ステージ検証');
{
    const stages = loadStages();
    assert.strictEqual(stages.length, 26, `Expected 26 stages, got ${stages.length}`);
    assert.ok(!stages.some(s => s.subtitle === '多重流路の交差点'), '旧ステージ21は削除されていること');
    stages.forEach((st, idx) => {
        assert.strictEqual(st.id, idx + 1, `Stage index ${idx} should have id ${idx + 1}, got ${st.id}`);
        assert.strictEqual(st.title, `ステージ ${idx + 1}`, `Stage index ${idx} title mismatch`);
    });
    assert.strictEqual(stages[20].subtitle, '一直線の架け橋', '旧22が新21に繰り上がっていること');
    assert.strictEqual(stages[25].subtitle, '高台からの落下と跳躍', '旧27が新26に繰り上がっていること');

    // 全26ステージの solution でクリア可能か確認
    const { sandbox, context } = createFullSandbox(stages);
    stages.forEach((st, idx) => {
        assert.ok(Array.isArray(st.solution) && st.solution.length > 0, `Stage ${st.id} must have solution`);
        sandbox.selectStage(idx);
        vm.runInContext('grid = Array.from({ length: 5 }, () => Array(5).fill(false));', context);
        st.solution.forEach(p => {
            vm.runInContext(`grid[${p.row}][${p.col}] = true;`, context);
        });
        const sim = sandbox.simulateGimmickBlockMoves();
        assert.strictEqual(sim.supernovas.length, 0, `Stage ${st.id} solution should not cause supernova`);
        assert.strictEqual(sim.blackHoleLoops.length, 0, `Stage ${st.id} solution should not cause blackhole`);
        vm.runInContext('grid = ' + JSON.stringify(sim.finalGrid) + ';', context);
        if (sim.finalSwitchDirs) {
            sandbox.applyFinalSwitchStates && null;
        }
        const route = sandbox.solveRoute();
        assert.strictEqual(route[route.length - 1].type, 'done', `Stage ${st.id} solution must reach goal`);
    });
    console.log(' -> OK: 全26ステージが連番(1〜26)で、全ての正解配置がゴール到達することを確認。');
}

// ==========================================================
// Test 2: ブラックホール無制限出現（写真の12個）＆ワープ無し・全合体検証
// ==========================================================
console.log('Test 2: 写真の盤面で12個のブラックホールが出現し全員合体すること');
{
    const photoGimmicks = [
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 0, type: 'dash', dir: 'down' })),
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 1, type: 'step', dir: 'up', steps: 1 })),
        { col: 0, row: 2, type: 'dash', dir: 'right' },
        { col: 1, row: 2, type: 'step', dir: 'left', steps: 1 },
        { col: 2, row: 2, type: 'switch', dir: 'up', switchCount: 2, moveType: 'step' },
        { col: 3, row: 2, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 2, type: 'dash', dir: 'left' },
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 3, type: 'step', dir: 'down', steps: 1 })),
        ...[0, 1, 2, 3, 4].map(c => ({ col: c, row: 4, type: 'dash', dir: 'up' }))
    ];
    const photoStage = { id: 901, title: '12BH', startRow: 2, goalRow: 2, maxBlocks: 20, forbidden: [], gimmicks: photoGimmicks, solution: [] };
    const { sandbox, context, els } = createFullSandbox([photoStage]);
    const placed = [
        [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
        [1, 2], [3, 2],
        [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]
    ];
    placed.forEach(([c, r]) => sandbox.placeBlock(c, r));
    const sim = sandbox.simulateGimmickBlockMoves();
    assert.strictEqual(sim.blackHoleLoops.length, 12, `Expected 12 blackHoleLoops, got ${sim.blackHoleLoops.length}`);

    sandbox.startBlackHole(sim.blackHoleLoops);
    const bhState = vm.runInContext('blackHoleState', context);
    assert.strictEqual(bhState.holes.length, 12, 'blackHoleState.holes should have all 12 black holes');
    const tl = bhState.timeline;

    // 成長フェーズ・各合体ラウンドで12個すべてが描画・追跡されているか確認
    const plan = sandbox.getBinaryMergePlan(bhState.holes, tl.T_GENESIS, tl.TM);
    assert.strictEqual(plan.rounds.length, 4, '12 BH should form 4 merge rounds (12->6->3->2->1)');
    const growEval = sandbox.evaluateHierarchicalBinaryBlackHoles(tl.T_GENESIS + 200, bhState.holes, bhState.midCenterX, bhState.midCenterY, tl.T_GENESIS, tl.TM, tl.BH_COLLAPSE_START, tl.BH_COLLAPSE_END);
    assert.strictEqual(growEval.drawOps.length, 12, 'All 12 black holes must render during genesis');

    plan.rounds.forEach((r, idx) => {
        const midT = (r.start + r.end) / 2;
        const evalRes = sandbox.evaluateHierarchicalBinaryBlackHoles(midT, bhState.holes, bhState.midCenterX, bhState.midCenterY, tl.T_GENESIS, tl.TM, tl.BH_COLLAPSE_START, tl.BH_COLLAPSE_END);
        const totalRepresented = evalRes.drawOps.reduce((acc, op) => acc + (op.type === 'binary' ? 2 : 1), 0);
        assert.ok(totalRepresented >= 2, `Round ${idx} must draw active pairs and carry nodes`);
    });

    // 合体完了後は12個すべての座標が全体重心に集まる
    sandbox.renderMultiBlackHoleState(tl.TM + 50);
    bhState.holes.forEach((h, i) => {
        assert.ok(Math.abs(h.curX - bhState.midCenterX) < 1e-6 && Math.abs(h.curY - bhState.midCenterY) < 1e-6, `Hole ${i} must converge to midCenter`);
    });

    // ループブロックがSUCK_BLOCKS_STARTの前後でワープしないこと
    const b0 = bhState.placedBlocks.find(b => b.isLoopBlock);
    const beforePos = sandbox.getMultiHoleLoopBlockPosition(b0, bhState.holes, tl.SUCK_BLOCKS_START - 0.1, tl.T_half, tl.T_GROW_END, tl.TM);
    const atStartPos = sandbox.getMultiHoleLoopBlockPosition(b0, bhState.holes, tl.SUCK_BLOCKS_START, tl.T_half, tl.T_GROW_END, tl.TM, { x: bhState.midCenterX, y: bhState.midCenterY });
    assert.ok(Math.hypot(beforePos.bx - atStartPos.bx, beforePos.by - atStartPos.by) < 3, 'Block position must be continuous across SUCK_BLOCKS_START');

    // Test 6相当: ステージ要素の吸引完了(SUCK_GROUND_END)より前ではUIが吸い込まれず、その後UIが吸い込まれること
    sandbox.renderMultiBlackHoleState(tl.SUCK_GROUND_END - 100);
    assert.strictEqual(els.startBtnEl.style.visibility, '', 'Before SUCK_GROUND_END, UI must NOT be sucked yet');
    assert.strictEqual(els.startBtnEl.style.opacity, '', 'Before SUCK_GROUND_END, UI opacity must remain untouched');

    sandbox.renderMultiBlackHoleState(tl.SUCK_UI_END + 50);
    assert.strictEqual(els.startBtnEl.style.visibility, 'hidden', 'After SUCK_UI_END, UI must be sucked into black hole');
    assert.strictEqual(els.resetBtnEl.style.visibility, 'hidden', 'After SUCK_UI_END, reset/cancel UI must be sucked');

    // 12個のブラックホール全フレームスイープ（例外なし・完了後UI復帰）
    const total12Duration = (tl.DROP_ARROWS_END || tl.DROP_BASE + 4600);
    for (let t = 0; t <= total12Duration + 100; t += 100) {
        sandbox.renderMultiBlackHoleState(t);
    }
    assert.strictEqual(els.startBtnEl.style.visibility, 'visible', 'After 12-BH full sweep, UI must recover');
    console.log(' -> OK: 12個のブラックホール全てが出現・4段階合体し、全フレームスイープでワープなし・ステージ先→UI後の順で吸収されました。');
}

// ==========================================================
// Test 3: 爆発 + ブラックホール*4 で全吸収演出（UI吸収含む）がカットされないこと
// ==========================================================
console.log('Test 3: 爆発+ブラックホール*4の全吸収演出（ステージ先→UI後→落下復元）検証');
{
    const gimmicks = [
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 0, type: 'dash', dir: 'left' },
        { col: 3, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 0, type: 'dash', dir: 'left' },
        { col: 0, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 4, type: 'dash', dir: 'left' },
        { col: 3, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 4, type: 'dash', dir: 'left' },
        { col: 1, row: 2, type: 'step', dir: 'right', steps: 1 },
        { col: 3, row: 2, type: 'step', dir: 'left', steps: 1 }
    ];
    const stage = { id: 902, title: 'SN+4BH', startRow: 2, goalRow: 2, maxBlocks: 10, forbidden: [], gimmicks, solution: [] };
    const { sandbox, context, els } = createFullSandbox([stage]);
    [[0, 0], [3, 0], [0, 4], [3, 4], [1, 2], [3, 2]].forEach(([c, r]) => sandbox.placeBlock(c, r));
    const sim = sandbox.simulateGimmickBlockMoves();
    assert.strictEqual(sim.supernovas.length, 1);
    assert.strictEqual(sim.blackHoleLoops.length, 4);

    sandbox.startDualSupernovaBlackHole(sim.supernovas, sim.blackHoleLoops);
    const deState = vm.runInContext('dualEventState', context);
    assert.strictEqual(deState.isMultiBH, true);
    assert.strictEqual(deState.holes.length, 4);
    const dtl = deState.timeline;

    // ステージ吸引中はUIが残っている
    sandbox.renderDualEventState(dtl.SUCK_GROUND_END - 50);
    assert.strictEqual(els.startBtnEl.style.visibility, '', 'DualEvent: UI must wait until stage elements finish sucking');

    // UI吸引後はUIも隠れて暗黒化される
    sandbox.renderDualEventState(dtl.SUCK_UI_END + 50);
    assert.strictEqual(els.startBtnEl.style.visibility, 'hidden', 'DualEvent: UI must be sucked after stage');
    assert.strictEqual(els.homeBtnEl.style.visibility, 'hidden', 'DualEvent: Header UI must also be sucked');

    // 降下復元後はUIが再び可視になる
    sandbox.renderDualEventState(dtl.DROP_BASE + 4500);
    assert.strictEqual(els.startBtnEl.style.visibility, 'visible', 'DualEvent: UI must drop back after collapse');

    // 2SN+4BH（爆発2箇所＋ブラックホール4個）の全フレームスイープ検証
    const gimmicks2SN = [
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 0, type: 'dash', dir: 'left' },
        { col: 3, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 0, type: 'dash', dir: 'left' },
        { col: 0, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 4, type: 'dash', dir: 'left' },
        { col: 3, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 4, type: 'dash', dir: 'left' },
        { col: 1, row: 1, type: 'step', dir: 'right', steps: 1 },
        { col: 3, row: 1, type: 'step', dir: 'left', steps: 1 },
        { col: 1, row: 3, type: 'step', dir: 'right', steps: 1 },
        { col: 3, row: 3, type: 'step', dir: 'left', steps: 1 }
    ];
    const st2 = { id: 910, title: '2SN+4BH', startRow: 2, goalRow: 2, maxBlocks: 12, forbidden: [], gimmicks: gimmicks2SN, solution: [] };
    const sb2 = createFullSandbox([st2]);
    [[0, 0], [3, 0], [0, 4], [3, 4], [1, 1], [3, 1], [1, 3], [3, 3]].forEach(([c, r]) => sb2.sandbox.placeBlock(c, r));
    const sim2 = sb2.sandbox.simulateGimmickBlockMoves();
    assert.strictEqual(sim2.supernovas.length, 2);
    assert.strictEqual(sim2.blackHoleLoops.length, 4);
    sb2.sandbox.startDualSupernovaBlackHole(sim2.supernovas, sim2.blackHoleLoops);
    const dtl2 = vm.runInContext('dualEventState.timeline', sb2.context);
    for (let t = 0; t <= dtl2.totalDuration + 100; t += 100) {
        sb2.sandbox.renderDualEventState(t);
    }
    assert.strictEqual(sb2.els.startBtnEl.style.visibility, 'visible', '2SN+4BH: UI must recover after full sweep');
    console.log(' -> OK: 爆発+BH*4（1SN/2SN両ケース）でもステージ先→UI全吸収→落下復元までカットされず実行されました。');
}

// ==========================================================
// Test 4: 演出中のリセット禁止・キャンセルボタン切替・直前配置復元
// ==========================================================
console.log('Test 4: 演出中のリセット禁止（キャンセルボタン切替＆直前配置の完全復元）検証');
{
    const gimmicks = [
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 2, row: 0, type: 'step', dir: 'left', steps: 1 },
        { col: 0, row: 1, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 1, type: 'dash', dir: 'left' }
    ];
    const stage = { id: 903, title: 'Cancel Test', startRow: 2, goalRow: 2, maxBlocks: 10, forbidden: [], gimmicks, solution: [] };
    const { sandbox, context, els } = createFullSandbox([stage]);

    // 3つを連結して配置（(0,0), (1,1)相当ではなく隣接: (0,0), (2,0), (1,1)で8方向連結！）
    sandbox.placeBlock(0, 0);
    sandbox.placeBlock(2, 0);
    sandbox.placeBlock(1, 1);
    assert.strictEqual(els.resetBtnEl.querySelector('.btn-main-label').textContent, 'リセット');
    assert.strictEqual(els.resetBtnEl.classList.contains('btn-cancel'), false);

    // スタート実行（爆発 + BH が起動する構成）
    sandbox.__game = vm.runInContext('window.__game', context);
    sandbox.__game.triggerStart();
    const ph1 = sandbox.__game.getPhase();
    assert.notStrictEqual(ph1, 'place', 'Start should enter non-place phase');
    assert.strictEqual(els.resetBtnEl.querySelector('.btn-main-label').textContent, 'キャンセル', 'Button label must become キャンセル during execution');
    assert.strictEqual(els.resetBtnEl.classList.contains('btn-cancel'), true);

    // 途中でグリッドが消去される場面（例：supernova爆散後）をシミュレートしても、キャンセルすれば直前配置が復元されること
    vm.runInContext('grid.forEach(r => r.fill(false));', context);
    sandbox.__game.triggerReset(); // キャンセル実行

    assert.strictEqual(sandbox.__game.getPhase(), 'place');
    assert.strictEqual(els.resetBtnEl.querySelector('.btn-main-label').textContent, 'リセット', 'Button label must revert to リセット');
    assert.strictEqual(els.resetBtnEl.classList.contains('btn-cancel'), false);
    const restoredGrid = sandbox.__game.getGrid();
    assert.strictEqual(restoredGrid[0][0], true, '(0,0) must be restored');
    assert.strictEqual(restoredGrid[0][2], true, '(2,0) must be restored');
    assert.strictEqual(restoredGrid[1][1], true, '(1,1) must be restored');

    // place状態でリセットを押した場合は全消去されること
    sandbox.__game.triggerReset();
    const clearedGrid = sandbox.__game.getGrid();
    assert.strictEqual(clearedGrid[0][0], false, 'Reset in place phase must clear grid');
    assert.strictEqual(clearedGrid[0][2], false);
    assert.strictEqual(clearedGrid[1][1], false);

    // 最後まで完了(finishDualEvent / finishSupernova / finishBlackHole)した時は全消去＋ボタン表記がリセットに戻ること
    sandbox.placeBlock(0, 0);
    sandbox.placeBlock(2, 0);
    sandbox.placeBlock(1, 1);
    sandbox.__game.triggerStart();
    assert.strictEqual(els.resetBtnEl.querySelector('.btn-main-label').textContent, 'キャンセル');
    sandbox.finishDualEvent();
    assert.strictEqual(sandbox.__game.getPhase(), 'place');
    assert.strictEqual(els.resetBtnEl.querySelector('.btn-main-label').textContent, 'リセット');
    assert.strictEqual(sandbox.__game.getGrid()[0][0], false, 'Completed dual event should clear grid');
    console.log(' -> OK: 演出中のキャンセルボタン化・直前配置の復元・配置中のみ全消去・完了時全消去を確認しました。');
}

// ==========================================================
// Test 5: レーザー半分入り判定（縦・横）＆「お前はもう死んでいる」演出検証
// ==========================================================
console.log('Test 5: レーザー半分入り判定＆「お前はもう死んでいる」演出検証');
{
    // 5A. 縦レーザー: 中心(x=2.0, cx=beamX)に入った時に切れる（端では切れない）
    const stageV = {
        id: 904, title: 'Laser V', startRow: 3, goalRow: 3, maxBlocks: 8, forbidden: [], gimmicks: [],
        lasers: [{ col: 2, row: 0, side: 'top' }],
        solution: []
    };
    const sbV = createFullSandbox([stageV]);
    [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]].forEach(([c, r]) => sbV.sandbox.placeBlock(c, r));
    const routeV = sbV.sandbox.solveRoute();
    const lastV = routeV[routeV.length - 1];
    assert.strictEqual(lastV.type, 'fail');
    assert.ok(lastV.laserHit && lastV.laserHit.orientation === 'vertical');
    // x === 2.0 がちょうど col=2 の中心
    assert.ok(Math.abs(lastV.x - 2.0) < 1e-4, `Vertical laser must hit at center x=2.0, got ${lastV.x}`);
    assert.ok(Math.abs(lastV.laserHit.cutX - (108 + 2.5 * 56)) < 1e-4, 'cutX must align with character center');

    // 5B. 横レーザーを上から落下で横切る時、靴先ではなく体の縦半分(centerY === beamY)で切れること
    const stageH = {
        id: 905, title: 'Laser H Drop', startRow: 0, goalRow: 3, maxBlocks: 10, forbidden: [], gimmicks: [],
        lasers: [{ col: 4, row: 2, side: 'right' }], // row=2 の真ん中(GY + 2.5*56 = 228)を横に走るレーザー
        solution: []
    };
    const sbH = createFullSandbox([stageH]);
    // row=0 を歩いて col=2 から落下 -> row=2 のレーザーを通り抜ける
    [[0, 1], [1, 1], [2, 4], [3, 4], [4, 4]].forEach(([c, r]) => sbH.sandbox.placeBlock(c, r));
    const routeH = sbH.sandbox.solveRoute();
    const lastH = routeH[routeH.length - 1];
    assert.strictEqual(lastH.type, 'fail');
    assert.ok(lastH.laserHit && lastH.laserHit.orientation === 'horizontal');
    const hitBot = 88 + (lastH.y + 1) * 56 - 2;
    const hitCenterY = hitBot - 33;
    const beamY = 88 + 2.5 * 56;
    assert.ok(Math.abs(hitCenterY - beamY) < 1e-3, `Horizontal laser drop must hit when centerY == beamY (${beamY}), got ${hitCenterY}`);
    assert.ok(Math.abs(lastH.laserHit.cutY - beamY) < 1e-3, 'cutY must match centerY');

    // 5B-2. 横レーザーに同じ行を歩いて横から入る時、腕先ではなく体の横半分(cx === rawMinX)が入った位置で切れること
    const stageHWalk = {
        id: 909, title: 'Laser H Walk', startRow: 3, goalRow: 3, maxBlocks: 10, forbidden: [], gimmicks: [],
        lasers: [{ col: 2, row: 3, side: 'left' }], // col=2左端(GX+2*56=220)から右へ発射
        solution: []
    };
    const sbHWalk = createFullSandbox([stageHWalk]);
    [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]].forEach(([c, r]) => sbHWalk.sandbox.placeBlock(c, r));
    const routeHWalk = sbHWalk.sandbox.solveRoute();
    const lastHWalk = routeHWalk[routeHWalk.length - 1];
    assert.strictEqual(lastHWalk.type, 'fail');
    const hitWalkCx = 108 + (lastHWalk.x + 0.5) * 56;
    assert.ok(Math.abs(hitWalkCx - (108 + 2 * 56)) < 1e-3, `Horizontal walk laser must hit at cx=beamLeft (220), got ${hitWalkCx}`);

    // 5B-3. ジャンプ上昇中に横レーザーを横切る場合も、頭端や足端ではなく体の縦半分(centerY === beamY)で切れること
    const stageHJump = {
        id: 911, title: 'Laser H Jump Up', startRow: 3, goalRow: 2, maxBlocks: 8, forbidden: [], gimmicks: [],
        lasers: [{ col: 4, row: 2, side: 'right' }],
        solution: []
    };
    const sbHJump = createFullSandbox([stageHJump]);
    [[0, 4], [1, 4], [2, 3], [3, 3], [4, 3]].forEach(([c, r]) => sbHJump.sandbox.placeBlock(c, r));
    const routeHJump = sbHJump.sandbox.solveRoute();
    const lastHJump = routeHJump[routeHJump.length - 1];
    assert.strictEqual(lastHJump.type, 'fail');
    assert.ok(lastHJump.laserHit && lastHJump.laserHit.orientation === 'horizontal');
    const jumpHitBot = 88 + (lastHJump.y + 1) * 56 - 2;
    const jumpHitCenterY = jumpHitBot - 33;
    const jumpBeamY = 88 + 2.5 * 56;
    assert.ok(Math.abs(jumpHitCenterY - jumpBeamY) < 1e-4, `Jump upward into horizontal laser must hit at centerY == beamY (${jumpBeamY}), got ${jumpHitCenterY}`);

    // 5C. 縦レーザーが頭上12pxの帽子だけにかすめる場合は切れないこと
    const stageHat = {
        id: 906, title: 'Laser Hat Safe', startRow: 3, goalRow: 3, maxBlocks: 10, forbidden: [], gimmicks: [],
        lasers: [{ col: 2, row: 0, side: 'top' }],
        solution: []
    };
    const sbHat = createFullSandbox([stageHat]);
    // (2,2)にブロックがあるとビームは row=0..1 のみ（GY..GY+2*CELL=200）。
    // キャラが row=3 を歩くとき、bot=88+4*56-2=310、top=244 > 200。
    // そこで row=2 を歩かせてみる（startRow=2、ビームを row=0 のみ=GY+56=144 に止める）
    const stageHat2 = {
        id: 907, title: 'Laser Hat Safe 2', startRow: 2, goalRow: 2, maxBlocks: 10, forbidden: [], gimmicks: [],
        lasers: [{ col: 2, row: 0, side: 'top' }],
        solution: []
    };
    const sbHat2 = createFullSandbox([stageHat2]);
    // (2,1) にブロック -> ビーム下端=144。キャラは row=2 を歩く(bot=254, top=188, 1マス下ならbot=310, でもrow=2はtop=188>144)。
    // bottomレーザーで (2,1) から上向き、つまり row=0..1 (88..200) で、キャラは row=2 を歩く(top=188..200で12px重なる！)
    const stageHat3 = {
        id: 908, title: 'Laser Hat Clip Safe', startRow: 2, goalRow: 2, maxBlocks: 10, forbidden: [], gimmicks: [],
        lasers: [{ col: 2, row: 1, side: 'bottom' }], // row=1底(200)から上端(88)まで
        solution: []
    };
    const sbHat3 = createFullSandbox([stageHat3]);
    [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]].forEach(([c, r]) => sbHat3.sandbox.placeBlock(c, r));
    const routeHat = sbHat3.sandbox.solveRoute();
    assert.strictEqual(routeHat[routeHat.length - 1].type, 'done', '帽子上端12pxだけにかすめる場合は切られず通過すること');

    // 5D. 「お前はもう死んでいる」演出: 一閃後、切断前に「お前はもう死んでいる」テキストが描かれ、その間は未分割で静止し、cutStart後に分割される
    let clipCount = 0;
    const c2d = vm.runInContext('ctx', sbV.context);
    const origClip = c2d.clip;
    c2d.clip = (...args) => { clipCount++; return origClip(...args); };

    sbV.setNow(1000);
    sbV.sandbox.triggerLaserDeathAnimation(lastV.x, lastV.y, lastV.laserHit);
    const eff = vm.runInContext('laserDeathEffect', sbV.context);
    const omaeStart = eff.zoomDuration + eff.slashDuration;
    const cutStart = omaeStart + eff.omaeDuration;

    clipCount = 0;
    sbV.setNow(1000 + omaeStart + Math.floor(eff.omaeDuration / 2));
    sbV.textCalls.length = 0;
    sbV.sandbox.render();
    assert.ok(sbV.textCalls.some(c => c.txt === 'お前はもう死んでいる'), '「お前はもう死んでいる」テキストが描画されること');
    assert.strictEqual(clipCount, 0, '「お前はもう死んでいる」表示中はまだ分割描画(clip)されないこと');

    clipCount = 0;
    sbV.setNow(1000 + cutStart - 10);
    sbV.sandbox.render();
    assert.strictEqual(clipCount, 0, 'cutStart直前まではまだ体は繋がったままであること');

    clipCount = 0;
    sbV.setNow(1000 + cutStart + 10);
    sbV.sandbox.render();
    assert.ok(clipCount >= 2, 'cutStart経過後に初めて2つに分割描画されること');

    c2d.clip = origClip;
    console.log(' -> OK: 縦・横・ジャンプ上昇とも体半分入り判定＆帽子/腕端の誤切断防止＆「お前はもう死んでいる」後分割演出を確認しました。');
}

console.log('ALL REQUESTED FIXES TESTS PASSED!');
