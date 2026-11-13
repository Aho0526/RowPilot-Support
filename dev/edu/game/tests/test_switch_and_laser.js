// テスト: スイッチブロック & レーザー & エディタ Linter の検証
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');
const linterJsCode = fs.readFileSync(path.join(__dirname, '../editor/linter.js'), 'utf-8');

function createSandbox(stagesOverride) {
    const COLS = 5;
    const ROWS = 5;
    const CELL = 56;
    const GX = 108;
    const GY = 88;

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
        canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 496, height: 376 }), style: {} },
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

    vm.createContext(sandbox);
    vm.runInContext(mainJsCode, sandbox);
    return sandbox;
}

function setGrid(sb, coords) {
    vm.runInContext(`
        grid = Array.from({ length: 5 }, () => Array(5).fill(false));
        ${coords.map(([c, r]) => `grid[${r}][${c}] = true;`).join('\n        ')}
    `, sb);
}

// ==========================================
// 1. スイッチブロック: 2方向時計回り切替
// ==========================================
{
    const sb = createSandbox([{
        id: 101,
        title: 'Switch 2dir',
        subtitle: '',
        maxBlocks: 5,
        startRow: 4,
        goalRow: 4,
        forbidden: [],
        gimmicks: [
            { col: 1, row: 2, type: 'switch', dir: 'right', switchCount: 2, moveType: 'step' },
            { col: 0, row: 2, type: 'step', dir: 'right', steps: 1 }
        ],
        solution: [],
        legends: []
    }]);
    sb.resetSwitchStates();
    // ブロック1は(1,2)から'right'で(2,2)へ。その後スイッチは'down'になる。
    // ブロック2は(0,2)から'right'で(1,2)へ進み、'down'を受け取って(1,3)へ。スイッチは'right'に戻る。
    setGrid(sb, [[1, 2], [0, 2]]);
    const res = sb.simulateGimmickBlockMoves();
    assert.strictEqual(res.finalGrid[2][2], true, '1つ目のブロックがrightで(2,2)に移動すること');
    assert.strictEqual(res.finalGrid[3][1], true, '2つ目のブロックが切り替わったdownで(1,3)に移動すること');
    assert.strictEqual(res.finalSwitchDirs.get('1,2'), 'right', '2回通過後に2方向スイッチが初期向きrightに戻ること');

    // リセット時は初期向きに戻ること
    sb.resetSwitchStates();
    assert.strictEqual(sb.getEffectiveGimmickDir({ col: 1, row: 2, type: 'switch', dir: 'right', switchCount: 2 }), 'right');
}

// ==========================================
// 2. スイッチブロック: 3方向・4方向時計回り順序
// ==========================================
{
    const sb = createSandbox([{
        id: 102,
        title: 'Switch 3dir & 4dir',
        subtitle: '',
        maxBlocks: 5,
        startRow: 4,
        goalRow: 4,
        forbidden: [],
        gimmicks: [
            { col: 2, row: 2, type: 'switch', dir: 'up', switchCount: 3, moveType: 'step' },
            { col: 4, row: 4, type: 'switch', dir: 'left', switchCount: 4, moveType: 'dash' }
        ],
        solution: [],
        legends: []
    }]);
    const seq3 = Array.from(sb.getSwitchDirSequence({ type: 'switch', dir: 'up', switchCount: 3 }));
    assert.deepStrictEqual(seq3, ['up', 'right', 'down'], '3方向は時計回り固定(up->right->down)');
    const seq4 = Array.from(sb.getSwitchDirSequence({ type: 'switch', dir: 'left', switchCount: 4 }));
    assert.deepStrictEqual(seq4, ['left', 'up', 'right', 'down'], '4方向は時計回り固定(left->up->right->down)');

    // 任意の方向配列 dirs (例: right->left, up->left->down)
    const seqCustom2 = Array.from(sb.getSwitchDirSequence({ type: 'switch', dirs: ['right', 'left'] }));
    assert.deepStrictEqual(seqCustom2, ['right', 'left'], 'カスタム2方向(right->left)がそのまま使われること');
    const seqCustom3 = Array.from(sb.getSwitchDirSequence({ type: 'switch', dirs: ['up', 'left', 'down'] }));
    assert.deepStrictEqual(seqCustom3, ['up', 'left', 'down'], 'カスタム3方向(up->left->down)がそのまま使われること');

    // 初期配置ブロックが壁に阻まれて動けない場合はスイッチが切り替わらないこと
    setGrid(sb, [[2, 2], [2, 1]]); // (2,1)が塞いでいるので(2,2)のブロックはupに移動できない
    const resBlocked = sb.simulateGimmickBlockMoves();
    assert.strictEqual(resBlocked.finalGrid[2][2], true);
    assert.strictEqual(resBlocked.finalSwitchDirs.get('2,2'), 'up', '移動失敗時はスイッチが切り替わらないこと');
}

// ==========================================
// 3. レーザー: 4辺ビーム到達・ブロック遮断・キャラ被弾
// ==========================================
{
    const sb = createSandbox([{
        id: 103,
        title: 'Laser Test',
        subtitle: '',
        maxBlocks: 5,
        startRow: 4,
        goalRow: 4,
        forbidden: [],
        gimmicks: [],
        lasers: [
            { col: 3, row: 1, side: 'top' },    // 下向き -> (3,1)..(3,4)
            { col: 4, row: 2, side: 'right' },  // 左向き -> (4,2)..(0,2)
            { col: 0, row: 0, side: 'left' },   // 右向き -> (0,0)..(4,0)
            { col: 2, row: 4, side: 'bottom' }  // 上向き -> (2,4)..(2,0)
        ],
        solution: [],
        legends: []
    }]);

    // ブロックなし: 各レーザーはグリッド端まで届く
    setGrid(sb, []);
    let beams = sb.computeLaserBeams(vm.runInContext('grid', sb));
    assert.strictEqual(beams.length, 4);
    assert.strictEqual(beams[0].blocked, false);
    assert.strictEqual(beams[0].endY, sb.GY + 5 * sb.CELL, 'topレーザーは下端まで伸びること');
    assert.strictEqual(beams[1].endX, sb.GX, 'rightレーザーは左端まで伸びること');
    assert.strictEqual(beams[2].endX, sb.GX + 5 * sb.CELL, 'leftレーザーは右端まで伸びること');
    assert.strictEqual(beams[3].endY, sb.GY, 'bottomレーザーは上端まで伸びること');

    // (1,2)にブロックを置くと、rightレーザー(4,2)は(1,2)の右面で止まる
    setGrid(sb, [[1, 2]]);
    beams = sb.computeLaserBeams(vm.runInContext('grid', sb));
    assert.strictEqual(beams[1].blocked, true);
    assert.strictEqual(beams[1].endX, sb.GX + 2 * sb.CELL, 'ブロック(1,2)の右面(col=2の左端)で停止すること');
}

// ==========================================
// 4. レーザー: キャラクター被弾で死亡 / ブロック遮断で生存ゴール
// ==========================================
{
    const sb = createSandbox([{
        id: 104,
        title: 'Laser Hit & Shield',
        subtitle: '',
        maxBlocks: 6,
        startRow: 3,
        goalRow: 3,
        forbidden: [],
        gimmicks: [],
        lasers: [
            { col: 2, row: 0, side: 'top' } // col=2 を上から下まで貫くレーザー
        ],
        solution: [],
        legends: []
    }]);

    // 足場として row=4 に一列ブロックを敷く -> col=2 で縦レーザーに当たって fail するはず
    setGrid(sb, [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]);
    let route = sb.solveRoute();
    assert.strictEqual(route[route.length - 1].type, 'fail', 'レーザーに当たった場合はfailになること');
    assert.ok(route[route.length - 1].x < 2.5, 'レーザー位置(col=2付近)で停止すること');

    // (2, 1) に盾ブロックを追加してレーザーを遮断（キャラは row=3 を歩くので安全にゴールできる）
    setGrid(sb, [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [2, 1]]);
    route = sb.solveRoute();
    assert.strictEqual(route[route.length - 1].type, 'done', 'ブロックでレーザーを遮断すればゴールできること');
}

// ==========================================
// 5. Linter 検証: switch と lasers の許可・不正検知
// ==========================================
{
    const Linter = require('../editor/linter.js');

    const validStageCode = `const STAGES = [{
        id: 1,
        title: 'テスト',
        maxBlocks: 4,
        startRow: 3,
        goalRow: 3,
        forbidden: [],
        gimmicks: [
            { col: 1, row: 2, type: 'switch', dirs: ['right', 'left'], moveType: 'step' }
        ],
        lasers: [
            { col: 3, row: 1, side: 'top' }
        ],
        solution: []
    }];`;
    const validIssues = Linter.lint('stages.js', validStageCode);
    assert.strictEqual(validIssues.length, 0, '正しい switch と lasers 定義でエラーが出ないこと: ' + JSON.stringify(validIssues));

    const invalidStageCode = `const STAGES = [{
        id: 1,
        title: '不正テスト',
        maxBlocks: 4,
        startRow: 3,
        goalRow: 3,
        forbidden: [],
        gimmicks: [
            { col: 1, row: 2, type: 'switch', dir: 'right', switchCount: 5, moveType: 'jump' }
        ],
        lasers: [
            { col: 3, row: 1, side: 'center' }
        ],
        solution: []
    }];`;
    const invalidIssues = Linter.lint('stages.js', invalidStageCode);
    assert.ok(invalidIssues.length >= 3, 'switchCount:5, moveType:jump, side:center がエラーとして検知されること');
}

console.log('ALL SWITCH & LASER TESTS PASSED');
