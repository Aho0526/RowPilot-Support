// テスト: 爆発とブラックホールの共存・複数ブラックホール同時演出・ステージ22間接関与ブロックの検証
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
// Test 1: ステージ22の配置（(1,0), (2,0), (3,1) + 無関係ブロック (4,4)）
// ------------------------------------------------------------------
console.log('Test 1: ステージ22の貫通防止（間接関与ブロックの追従移動）検証');
{
    const stagesCtx = vm.createContext({});
    vm.runInContext(stagesJsCode + '; this.STAGES = STAGES;', stagesCtx);
    const stage22 = stagesCtx.STAGES.find(s => s.id === 22);
    assert(stage22, 'Stage 22 not found');

    const { sandbox, context } = createSandbox([stage22]);
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
    console.log(' -> OK: 道を空けた (1,0) も移動対象になり、無関係な (4,4) は停止しました。');
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

console.log('ALL SUPERNOVA + BLACKHOLE COEXIST TESTS PASSED!');
