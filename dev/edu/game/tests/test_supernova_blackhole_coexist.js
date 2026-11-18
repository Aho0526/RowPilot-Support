// テスト: 爆発とブラックホールの共存・複数ブラックホール同時演出・ステージ21(旧22)間接関与ブロックの検証
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');
const stagesJsCode = fs.readFileSync(path.join(__dirname, '../stages.js'), 'utf-8');

function createSandbox(stagesOverride) {
    const COLS = 5;
    const ROWS = 5;
    const CELL = 60;
    const GX = 80;
    const GY = 50;

    const sandbox = {
        window: {
            addEventListener: () => {},
            removeEventListener: () => {}
        },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ style: {} }),
            body: { appendChild: () => {}, removeChild: () => {} },
            documentElement: { classList: { add: () => {} } }
        },
        canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }), style: {} },
        ctx: {},
        startBtn: { disabled: false },
        statusBar: { innerHTML: '' },
        hintText: { textContent: '' },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        performance: { now: () => 0 },
        STAGES: stagesOverride,
        currentStageIndex: 0,
        COLS,
        ROWS,
        CELL,
        GX,
        GY,
        console
    };

    const context = vm.createContext(sandbox);
    try {
        vm.runInContext(mainJsCode, context);
    } catch (e) {
        // DOMContentLoaded 内のエラーは無視
    }
    return { sandbox, context };
}

function assert(cond, msg) {
    if (!cond) throw new Error('Assertion failed: ' + msg);
}

// ------------------------------------------------------------------
// Test 1: ステージ21(旧22)の配置（(1,0), (2,0), (3,1) + 無関係ブロック (4,4)）
// ------------------------------------------------------------------
console.log('Test 1: ステージ21(旧22)の貫通防止（間接関与ブロックの追従移動）検証');
{
    const stagesCtx = vm.createContext({});
    vm.runInContext(stagesJsCode + '; this.STAGES = STAGES;', stagesCtx);
    const stage21 = stagesCtx.STAGES.find(s => s.id === 21);
    assert(stage21, 'Stage 21 not found');

    const { sandbox, context } = createSandbox([stage21]);
    vm.runInContext(`
        grid = Array.from({ length: 5 }, () => Array(5).fill(false));
        grid[0][1] = true; // (1,0): 道を空けるブロック
        grid[0][2] = true; // (2,0): 爆発するブロック1
        grid[1][3] = true; // (3,1): 爆発するブロック2
        grid[4][4] = true; // (4,4): 無関係な静止ブロック
    `, context);

    const res = sandbox.simulateGimmickBlockMoves();
    assert(res.supernovas && res.supernovas.length === 1, `Expected 1 supernova, got ${res.supernovas ? res.supernovas.length : 0}`);
    assert(res.supernovas[0].col === 1 && res.supernovas[0].row === 2, 'Supernova should occur at (1, 2)');

    const moves = res.rounds[0] || [];
    const movedOrigins = moves.map(m => `${m.fromCol},${m.fromRow}`);
    assert(movedOrigins.includes('1,0'), 'Block (1,0) that cleared the path must also move');
    assert(movedOrigins.includes('2,0'), 'Collider (2,0) must move');
    assert(movedOrigins.includes('3,1'), 'Collider (3,1) must move');
    assert(!movedOrigins.includes('4,4'), 'Unrelated block (4,4) must stay still');
    const moveA = moves.find(m => m.fromCol === 1 && m.fromRow === 0);
    assert(moveA.toCol === 2 && moveA.toRow === 2, `Block (1,0) should evacuate explosion cell (1,2) to (2,2), got (${moveA.toCol},${moveA.toRow})`);
    assert(res.finalGrid[2][1] === false, 'Explosion cell (1,2) must be empty before supernova animation');
    console.log(' -> OK: 道を空けた (1,0) も移動対象になり、爆発地点(1,2)から退避し、無関係な (4,4) は停止しました。');
}

// ------------------------------------------------------------------
// Test 2: ブラックホールと爆発の共存（tick 1 で爆発が起きる場合）
// ------------------------------------------------------------------
console.log('Test 2: ブラックホールと爆発（tick 1）の共存検出検証');
{
    const mockGimmicks = [
        // 左上 2x2 ループ
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 0, type: 'step', dir: 'down', steps: 1 },
        { col: 1, row: 1, type: 'step', dir: 'left', steps: 1 },
        { col: 0, row: 1, type: 'step', dir: 'up', steps: 1 },
        // 右下で tick 1 に衝突する2ブロック: (2,4)->(3,4) と (4,4)->(3,4)
        { col: 2, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 4, type: 'step', dir: 'left', steps: 1 },
        // 無関係な移動ギミック
        { col: 4, row: 0, type: 'step', dir: 'down', steps: 1 }
    ];
    const stage = { id: 98, startRow: 2, goalRow: 2, cols: 5, rows: 5, gimmicks: mockGimmicks, forbidden: [] };
    const { sandbox, context } = createSandbox([stage]);
    vm.runInContext(`
        grid = Array.from({ length: 5 }, () => Array(5).fill(false));
        grid[0][0] = true; // BH
        grid[4][2] = true; // SN collider 1
        grid[4][4] = true; // SN collider 2
        grid[0][4] = true; // 無関係ブロック
    `, context);

    const res = sandbox.simulateGimmickBlockMoves();
    assert(res.supernovas && res.supernovas.length === 1, 'Expected 1 supernova');
    assert(res.blackHoleLoops && res.blackHoleLoops.length === 1, 'Expected 1 blackHoleLoop even when explosion occurs at tick 1');
    assert(res.finalGrid[0][4] === true, 'Unrelated block (4,0) should remain at initial position');
    console.log(' -> OK: 爆発(tick 1)とブラックホールの両方が検出されました。');
}

// ------------------------------------------------------------------
// Test 3: 複数ブラックホール(2箇所) + 爆発の同時検出 & startDualSupernovaBlackHole 実行検証
// ------------------------------------------------------------------
console.log('Test 3: 複数ブラックホール(2箇所) + 爆発の同時検出＆演出初期化検証');
{
    const mockGimmicks = [
        // BH 1: (0,0)-(1,1)
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 0, type: 'step', dir: 'down', steps: 1 },
        { col: 1, row: 1, type: 'step', dir: 'left', steps: 1 },
        { col: 0, row: 1, type: 'step', dir: 'up', steps: 1 },
        // BH 2: (3,0)-(4,1)
        { col: 3, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 0, type: 'step', dir: 'down', steps: 1 },
        { col: 4, row: 1, type: 'step', dir: 'left', steps: 1 },
        { col: 3, row: 1, type: 'step', dir: 'up', steps: 1 },
        // SN: (1,4)->(2,4) vs (3,4)->(2,4)
        { col: 1, row: 4, type: 'step', dir: 'right', steps: 1 },
        { col: 3, row: 4, type: 'step', dir: 'left', steps: 1 }
    ];
    const stage = { id: 97, startRow: 2, goalRow: 2, cols: 5, rows: 5, gimmicks: mockGimmicks, forbidden: [] };
    const { sandbox, context } = createSandbox([stage]);
    vm.runInContext(`
        startBtn = { disabled: false };
        statusBar = { innerHTML: '' };
        hintText = { textContent: '' };
        grid = Array.from({ length: 5 }, () => Array(5).fill(false));
        grid[0][0] = true; // BH 1
        grid[0][3] = true; // BH 2
        grid[4][1] = true; // SN 1
        grid[4][3] = true; // SN 2
    `, context);

    const res = sandbox.simulateGimmickBlockMoves();
    assert(res.supernovas && res.supernovas.length === 1, 'Expected 1 supernova');
    assert(res.blackHoleLoops && res.blackHoleLoops.length === 2, `Expected 2 blackHoleLoops, got ${res.blackHoleLoops ? res.blackHoleLoops.length : 0}`);

    sandbox.startDualSupernovaBlackHole(res.supernovas, res.blackHoleLoops);
    const deState = vm.runInContext('dualEventState', context);
    assert(deState !== null, 'dualEventState should be initialized');
    assert(deState.isMultiBH === true, 'dualEventState.isMultiBH should be true');
    assert(deState.holes.length === 2, 'dualEventState.holes should have 2 holes');
    const loopBlocks = deState.placedBlocks.filter(b => b.isLoopBlock);
    assert(loopBlocks.length === 2, `Expected 2 loopBlocks, got ${loopBlocks.length}`);
    assert(loopBlocks.some(b => b.loopIndex === 0) && loopBlocks.some(b => b.loopIndex === 1), 'Both loopIndex 0 and 1 should be assigned');
    console.log(' -> OK: 2箇所のブラックホール＋爆発の同時検出と startDualSupernovaBlackHole の初期化が成功しました。');
}

// ------------------------------------------------------------------
// Test 4: 時間差（tick 1 & tick 3）の2点爆発 + 爆発時のハコ細分化吹っ飛び検証
// ------------------------------------------------------------------
console.log('Test 4: 時間差2点爆発の検出と爆発時ブロック細分化生成検証');
{
    const mockGimmicks = [
        // 爆発1 (tick 1): (0,1)->(1,1) vs (2,1)->(1,1)
        { col: 0, row: 1, type: 'step', dir: 'right', steps: 1 },
        { col: 2, row: 1, type: 'step', dir: 'left', steps: 1 },
        // 爆発2 (tick 3): (0,3) dash right -> (3,3) vs (4,2) step down -> (4,3) ... 調整して (3,3) で tick 3 に衝突
        // (0,3) dash right: t1=(1,3), t2=(2,3), t3=(3,3)
        // (3,0) dash down:  t1=(3,1), t2=(3,2), t3=(3,3)
        { col: 0, row: 3, type: 'dash', dir: 'right' },
        { col: 3, row: 0, type: 'dash', dir: 'down' }
    ];
    const stage = { id: 96, startRow: 4, goalRow: 4, cols: 5, rows: 5, gimmicks: mockGimmicks, forbidden: [] };
    const { sandbox, context } = createSandbox([stage]);
    vm.runInContext(`
        startBtn = { disabled: false };
        statusBar = { innerHTML: '' };
        hintText = { textContent: '' };
        ctx = {
            clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {},
            scale: () => {}, rotate: () => {}, beginPath: () => {}, rect: () => {},
            fillRect: () => {}, strokeRect: () => {}, moveTo: () => {}, lineTo: () => {},
            closePath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {},
            clip: () => {}, fillText: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} })
        };
        grid = Array.from({ length: 5 }, () => Array(5).fill(false));
        grid[1][0] = true; // SN1-a (tick 1)
        grid[1][2] = true; // SN1-b (tick 1)
        grid[3][0] = true; // SN2-a (tick 3)
        grid[0][3] = true; // SN2-b (tick 3)
        grid[4][4] = true; // 無関係ブロック（爆発で細分化されて吹っ飛ぶ対象）
    `, context);

    const res = sandbox.simulateGimmickBlockMoves();
    assert(res.supernovas && res.supernovas.length === 2, `Expected 2 supernovas at different ticks, got ${res.supernovas ? res.supernovas.length : 0}`);
    assert(res.supernovas.some(s => s.col === 1 && s.row === 1 && s.tick === 1), 'Spot 1 should be at (1,1) tick 1');
    assert(res.supernovas.some(s => s.col === 3 && s.row === 3 && s.tick === 3), 'Spot 2 should be at (3,3) tick 3');

    // 先行移動後の盤面を再現して爆発演出を実行
    const moves = res.rounds[0] || [];
    moves.forEach(m => {
        vm.runInContext(`grid[${m.fromRow}][${m.fromCol}] = false;`, context);
    });
    moves.forEach(m => {
        vm.runInContext(`grid[${m.toRow}][${m.toCol}] = true;`, context);
    });

    sandbox.startSupernova(res.supernovas);
    const snState = vm.runInContext('supernovaState', context);
    assert(snState && snState.spots.length === 2, 'supernovaState.spots should contain both spots');

    // 爆発時刻到達時にブロックが細分化されて shatteredPieces が生成されること
    const fusionEnd = snState.timeline.FUSION_END;
    vm.runInContext(`animateSupernova(supernovaState.startTime + ${fusionEnd + 10});`, context);
    assert(snState.exploded === true, 'Supernova should be exploded');
    assert(snState.shatteredPieces.length > 16, `Expected shatteredPieces for non-collider and collider blocks, got ${snState.shatteredPieces.length}`);
    console.log(` -> OK: tick 1 と tick 3 の2点爆発と、ハコ細分化破片 (${snState.shatteredPieces.length}個) 生成を確認しました。`);
}

// ------------------------------------------------------------------
// Test 5: 時間差2点爆発 + 複数ブラックホール(2箇所) 共存検証
// ------------------------------------------------------------------
console.log('Test 5: 時間差2点爆発 + 複数ブラックホール共存検証');
{
    const mockGimmicks = [
        // BH 1: (0,0)-(1,1)
        { col: 0, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 1, row: 0, type: 'step', dir: 'down', steps: 1 },
        { col: 1, row: 1, type: 'step', dir: 'left', steps: 1 },
        { col: 0, row: 1, type: 'step', dir: 'up', steps: 1 },
        // BH 2: (3,0)-(4,1)
        { col: 3, row: 0, type: 'step', dir: 'right', steps: 1 },
        { col: 4, row: 0, type: 'step', dir: 'down', steps: 1 },
        { col: 4, row: 1, type: 'step', dir: 'left', steps: 1 },
        { col: 3, row: 1, type: 'step', dir: 'up', steps: 1 },
        // SN 1 (tick 1): (0,3)->(1,3) vs (2,3)->(1,3)
        { col: 0, row: 3, type: 'step', dir: 'right', steps: 1 },
        { col: 2, row: 3, type: 'step', dir: 'left', steps: 1 },
        // SN 2 (tick 2): (0,4) dash right -> (2,4) vs (4,4) dash left -> (2,4)
        { col: 0, row: 4, type: 'dash', dir: 'right' },
        { col: 4, row: 4, type: 'dash', dir: 'left' }
    ];
    const stage = { id: 95, startRow: 2, goalRow: 2, cols: 5, rows: 5, gimmicks: mockGimmicks, forbidden: [] };
    const { sandbox, context } = createSandbox([stage]);
    vm.runInContext(`
        startBtn = { disabled: false };
        statusBar = { innerHTML: '' };
        hintText = { textContent: '' };
        grid = Array.from({ length: 5 }, () => Array(5).fill(false));
        grid[0][0] = true; // BH 1
        grid[0][3] = true; // BH 2
        grid[3][0] = true; // SN1-a (tick 1)
        grid[3][2] = true; // SN1-b (tick 1)
        grid[4][0] = true; // SN2-a (tick 2)
        grid[4][4] = true; // SN2-b (tick 2)
    `, context);

    const res = sandbox.simulateGimmickBlockMoves();
    assert(res.supernovas && res.supernovas.length === 2, `Expected 2 supernovas, got ${res.supernovas ? res.supernovas.length : 0}`);
    assert(res.blackHoleLoops && res.blackHoleLoops.length === 2, `Expected 2 blackHoleLoops, got ${res.blackHoleLoops ? res.blackHoleLoops.length : 0}`);

    sandbox.startDualSupernovaBlackHole(res.supernovas, res.blackHoleLoops);
    const deState = vm.runInContext('dualEventState', context);
    assert(deState && deState.spots.length === 2, 'dualEventState.spots should have 2 spots');
    const lastScheduleEnd = deState.schedule[deState.schedule.length - 1].end;
    assert(1850 + deState.extraTime >= lastScheduleEnd, 'PULL_START must not precede schedule end');
    console.log(' -> OK: 時間差2点爆発 + 複数ブラックホールの共存・スケジュール整合性を確認しました。');
}

// ------------------------------------------------------------------
// Test 6: 巨大ブラックホール途中キャンセル時のUI復元 & Legend紫枠中身空検証
// ------------------------------------------------------------------
console.log('Test 6: 巨大ブラックホール途中キャンセル時のUI復元 & Legend紫枠検証');
{
    const mockEls = new Map();
    const makeEl = (id) => {
        const el = {
            id,
            style: {},
            classList: { add: () => {}, remove: () => {} },
            innerHTML: '',
            textContent: '',
            appendChild: (c) => { el._children = el._children || []; el._children.push(c); },
            getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 20 })
        };
        mockEls.set(id, el);
        return el;
    };
    const startEl = makeEl('#startBtn');
    const resetEl = makeEl('#resetBtn');
    const legendEl = makeEl('#legendWrap');
    const homeEl = makeEl('#homeScreen');
    const selectEl = makeEl('#selectScreen');
    const gameEl = makeEl('#gameScreen');

    const mapBySel = {
        '#startBtn': [startEl],
        '#resetBtn': [resetEl],
        '#legendWrap': [legendEl]
    };

    const stage = {
        id: 94,
        startRow: 2,
        goalRow: 2,
        gimmicks: [{ col: 1, row: 1, purpleBorder: true }],
        forbidden: [],
        legends: [{ icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }]
    };

    const sandbox = {
        window: { addEventListener: () => {}, removeEventListener: () => {} },
        document: {
            getElementById: (id) => mockEls.get('#' + id) || null,
            querySelector: () => null,
            querySelectorAll: (sel) => mapBySel[sel] || [],
            createElement: () => ({ className: '', innerHTML: '' }),
            body: { style: {}, appendChild: () => {}, removeChild: () => {} },
            documentElement: { classList: { add: () => {} } }
        },
        canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }), style: {} },
        ctx: {
            clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {},
            scale: () => {}, rotate: () => {}, beginPath: () => {}, rect: () => {},
            fillRect: () => {}, strokeRect: () => {}, moveTo: () => {}, lineTo: () => {},
            closePath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {},
            clip: () => {}, fillText: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} })
        },
        startBtn: startEl,
        statusBar: { innerHTML: '' },
        hintText: { textContent: '' },
        legendWrap: legendEl,
        requestAnimationFrame: () => 99,
        cancelAnimationFrame: () => {},
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        performance: { now: () => 0 },
        STAGES: [stage],
        currentStageIndex: 0,
        COLS: 5,
        ROWS: 5,
        CELL: 56,
        GX: 108,
        GY: 0,
        console
    };
    const mockCtx = {
        clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {},
        scale: () => {}, rotate: () => {}, beginPath: () => {}, rect: () => {},
        fillRect: () => {}, strokeRect: () => {}, moveTo: () => {}, lineTo: () => {},
        closePath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {},
        clip: () => {}, fillText: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} })
    };
    sandbox._mockCtx = mockCtx;
    const ctxVm = vm.createContext(sandbox);
    vm.runInContext(mainJsCode, ctxVm);
    vm.runInContext('ctx = _mockCtx; startBtn = document.getElementById("startBtn"); statusBar = { innerHTML: "" }; hintText = { textContent: "" }; legendWrap = document.getElementById("legendWrap");', ctxVm);

    // Legend 紫枠の中身が空であること
    vm.runInContext('updateLegendUI();', ctxVm);
    assert(legendEl._children && legendEl._children.length === 1, 'Legend should have 1 item');
    assert(!legendEl._children[0].innerHTML.includes('▢'), 'Purple legend icon should not contain inner box ▢');

    // UI吸い込み後に selectStage や switchView('select') でスタイルが復元されること
    vm.runInContext(`
        phase = 'blackhole';
        blackHoleState = { isMulti: true };
        updateBlackHoleUiSuck(9999, 300, 200, 1000, 2000);
    `, ctxVm);
    assert(startEl.style.visibility === 'hidden', 'Start button should be hidden after UI suck');

    sandbox.switchView('select');
    assert(startEl.style.visibility === '', 'Start button visibility must be restored after switchView');
    assert(startEl.style.opacity === '', 'Start button opacity must be restored after switchView');
    assert(startEl.style.transform === '', 'Start button transform must be restored after switchView');
    assert(startEl.style.pointerEvents === '', 'Start button pointerEvents must be restored after switchView');

    vm.runInContext(`
        phase = 'blackhole';
        blackHoleState = { isMulti: true };
        updateBlackHoleUiSuck(9999, 300, 200, 1000, 2000);
    `, ctxVm);
    assert(resetEl.style.visibility === 'hidden', 'Reset button should be hidden after UI suck');

    sandbox.selectStage(0);
    assert(resetEl.style.visibility === '', 'Reset button visibility must be restored after selectStage');
    assert(resetEl.style.opacity === '', 'Reset button opacity must be restored after selectStage');
    assert(resetEl.style.pointerEvents === '', 'Reset button pointerEvents must be restored after selectStage');
    console.log(' -> OK: 巨大ブラックホール途中キャンセル時のUI復元およびLegend紫枠の中身空を確認しました。');
}

console.log('ALL SUPERNOVA + BLACKHOLE COEXIST TESTS PASSED!');
