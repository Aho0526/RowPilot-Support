// テスト: 複数箇所で独立した周回ループが発生する場合のブラックホール検出検証
const fs = require('fs');
const path = require('path');

const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');

function runTestWithLoops(loopsConfig, expectedCount) {
    const COLS = 5;
    const ROWS = 5;
    const CELL = 60;
    const GX = 80;
    const GY = 50;

    const mockGimmicks = [];
    const blockPositions = [];

    loopsConfig.forEach((lp, idx) => {
        // 2x2 loop: (c, r) -> (c+1, r) -> (c+1, r+1) -> (c, r+1) -> (c, r)
        mockGimmicks.push(
            { col: lp.c, row: lp.r, type: 'step', dir: 'right', steps: 1 },
            { col: lp.c + 1, row: lp.r, type: 'step', dir: 'down', steps: 1 },
            { col: lp.c + 1, row: lp.r + 1, type: 'step', dir: 'left', steps: 1 },
            { col: lp.c, row: lp.r + 1, type: 'step', dir: 'up', steps: 1 }
        );
        blockPositions.push({ c: lp.c, r: lp.r });
    });

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
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        performance: { now: () => 0 },
        STAGES: [{ id: 99, startRow: 2, goalRow: 2, cols: COLS, rows: ROWS, gimmicks: mockGimmicks }],
        currentStageIndex: 0,
        COLS,
        ROWS,
        CELL,
        GX,
        GY,
        console
    };

    const vm = require('vm');
    const context = vm.createContext(sandbox);

    try {
        vm.runInContext(mainJsCode, context);
    } catch (e) {
        // DOMContentLoaded 内のコードエラーは無視
    }

    vm.runInContext(`
        grid = Array.from({ length: 5 }, () => Array(5).fill(false));
        ${blockPositions.map(p => `grid[${p.r}][${p.c}] = true;`).join('\n')}
    `, context);

    const result = sandbox.simulateGimmickBlockMoves();
    const count = result.blackHoleLoops ? result.blackHoleLoops.length : 0;
    if (count !== expectedCount) {
        throw new Error(`Expected ${expectedCount} black holes, but got ${count}`);
    }
    return result.blackHoleLoops;
}

console.log('Test 1: 2箇所の独立ループ検証');
const loops2 = runTestWithLoops([{ c: 0, r: 0 }, { c: 3, r: 3 }], 2);
console.log(' -> OK: 2箇所のブラックホールが検出されました。');
loops2.forEach((lp, i) => console.log(`    BH ${i+1}: center=(${lp.centerCol}, ${lp.centerRow})`));

console.log('Test 2: 3箇所の独立ループ検証');
const loops3 = runTestWithLoops([{ c: 0, r: 0 }, { c: 3, r: 0 }, { c: 0, r: 3 }], 3);
console.log(' -> OK: 3箇所のブラックホールが検出されました。');
loops3.forEach((lp, i) => console.log(`    BH ${i+1}: center=(${lp.centerCol}, ${lp.centerRow})`));

console.log('ALL MULTI-BLACKHOLE TESTS PASSED!');
