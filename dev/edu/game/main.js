// ==========================================
// ハコゲーム - main.js
// ==========================================

// MARK: - Constants & Grid
const COLS = 5;
const ROWS = 5;
const CELL = 56;

const LEFT_W = 108;
const RIGHT_W = 108;
const TOTAL_W = LEFT_W + COLS * CELL + RIGHT_W;
const GY = 88;
const TOTAL_H = GY + ROWS * CELL + 8;

const GX = LEFT_W;

const WALK_SPEED = 0.015;
const JUMP_SPEED = 0.040;

const KEY_MAP = [
    ['q', 'w', 'e', 'r', 't'],
    ['y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g'],
    ['h', 'j', 'k', 'l', 'z'],
    ['x', 'c', 'v', 'b', 'n']
];

// MARK: - Stage State
let currentStageIndex = 0; // デフォルトはステージ 1 (index 0)
let OFFICIAL_STAGES = null;
if (typeof STAGES !== 'undefined' && Array.isArray(STAGES)) {
    OFFICIAL_STAGES = JSON.parse(JSON.stringify(STAGES));
}

function getStage() {
    return STAGES[currentStageIndex];
}

// MARK: - DOM Elements
let canvas;
let ctx;
let startBtn;
let resetBtn;
let answerBtn;
let statusBar;
let hintText;
let stageCurrentTitle;
let stageCurrentBtn;
let stageMenuPopup;
let stageMenuGrid;
let prevStageBtn;
let nextStageBtn;
let blockCountVal;
let legendWrap;

// Game State
let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
let phase = 'place';
let actionHistory = [];
let showSolution = false;

// 3スター評価 & スコア用
let usedHintInStage = false;
let placedBlocksAtStart = 0;

// ビジュアルエフェクト用 (Juiciness: パーティクル)
const gameParticles = []; // { type: 'dust'|'spark', x, y, vx, vy, ... }
let lastKfIndex = -1;

// Sliding block animations queue & Multi-round gimmick animation state
let slidingBlocks = [];
let blockAnimationRounds = [];
let currentRoundIndex = 0;
let roundStartTime = null;
let pendingSupernova = null;
let supernovaState = null;
let explosionMessageTimer = null;
let pendingBlackHole = null;
let blackHoleState = null;
let blackHoleParticles = [];
let dualEventState = null;

function makeMan() {
    const st = getStage();
    return {
        x: -1.5,
        y: st.startRow,
        state: 'walk',
        walkCycle: 0
    };
}
let man = makeMan();

let animId = null;
let currentRoute = [];
let routeStartTime = null;
let prevTime = null;

// MARK: - Helper Functions
function isForbidden(col, row) {
    const st = getStage();
    return st.forbidden.some(f => f.col === col && f.row === row);
}

function getGimmick(col, row) {
    const st = getStage();
    return st.gimmicks.find(g => g.col === col && g.row === row);
}

// MARK: - Switch Block & Laser Helpers
const CLOCKWISE_DIRS = ['right', 'down', 'left', 'up'];
let switchStates = new Map(); // key: "col,row", value: { seq, index, currentDir }
let pendingSwitchEvents = []; // [{ tick, col, row, dir }]
let pendingFinalSwitchDirs = null; // Map<"col,row", dir>

function getSwitchDirSequence(gimmick) {
    if (gimmick && Array.isArray(gimmick.dirs) && gimmick.dirs.length >= 2) {
        const custom = gimmick.dirs.slice(0, 4).filter(d => CLOCKWISE_DIRS.includes(d));
        if (custom.length >= 2) return custom;
    }
    const startDir = CLOCKWISE_DIRS.includes(gimmick && gimmick.dir) ? gimmick.dir : 'right';
    const rawCount = Number(gimmick && gimmick.switchCount);
    const count = Math.max(2, Math.min(4, Number.isFinite(rawCount) ? Math.round(rawCount) : 2));
    const startIdx = CLOCKWISE_DIRS.indexOf(startDir);
    const seq = [];
    for (let i = 0; i < count; i++) {
        seq.push(CLOCKWISE_DIRS[(startIdx + i) % 4]);
    }
    return seq;
}

function resetSwitchStates() {
    switchStates = new Map();
    pendingSwitchEvents = [];
    pendingFinalSwitchDirs = null;
    const st = getStage();
    if (!st || !Array.isArray(st.gimmicks)) return;
    st.gimmicks.forEach(g => {
        if (g && g.type === 'switch') {
            const seq = getSwitchDirSequence(g);
            switchStates.set(`${g.col},${g.row}`, {
                seq,
                index: 0,
                currentDir: seq[0]
            });
        }
    });
}

function getEffectiveGimmickDir(g) {
    if (!g) return 'right';
    if (g.type === 'switch') {
        const state = switchStates.get(`${g.col},${g.row}`);
        if (state) return state.currentDir;
        return getSwitchDirSequence(g)[0];
    }
    return g.dir || 'right';
}

function getEffectiveGimmickMoveType(g) {
    if (!g) return 'step';
    if (g.type === 'switch') {
        return g.moveType === 'dash' ? 'dash' : 'step';
    }
    return g.type;
}

function computeLaserBeams(targetGrid) {
    const st = getStage();
    if (!st || !Array.isArray(st.lasers) || st.lasers.length === 0) return [];
    const beams = [];
    st.lasers.forEach(laser => {
        if (!laser || typeof laser.col !== 'number' || typeof laser.row !== 'number') return;
        const { col, row, side } = laser;
        let dc = 0, dr = 0;
        let startX = GX + col * CELL;
        let startY = GY + row * CELL;
        if (side === 'top') {
            dc = 0; dr = 1;
            startX = GX + (col + 0.5) * CELL;
            startY = GY + row * CELL;
        } else if (side === 'bottom') {
            dc = 0; dr = -1;
            startX = GX + (col + 0.5) * CELL;
            startY = GY + (row + 1) * CELL;
        } else if (side === 'left') {
            dc = 1; dr = 0;
            startX = GX + col * CELL;
            startY = GY + (row + 0.5) * CELL;
        } else if (side === 'right') {
            dc = -1; dr = 0;
            startX = GX + (col + 1) * CELL;
            startY = GY + (row + 0.5) * CELL;
        } else {
            return;
        }

        let c = col;
        let r = row;
        let blocked = false;
        let endX = startX;
        let endY = startY;
        const cells = [];

        while (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
            if (targetGrid && targetGrid[r] && targetGrid[r][c]) {
                blocked = true;
                if (dc === 1) endX = GX + c * CELL;
                else if (dc === -1) endX = GX + (c + 1) * CELL;
                else if (dr === 1) endY = GY + r * CELL;
                else if (dr === -1) endY = GY + (r + 1) * CELL;
                break;
            }
            cells.push({ col: c, row: r });
            c += dc;
            r += dr;
        }

        if (!blocked) {
            if (dc === 1) endX = GX + COLS * CELL;
            else if (dc === -1) endX = GX;
            else if (dr === 1) endY = GY + ROWS * CELL;
            else if (dr === -1) endY = GY;
        }

        beams.push({
            laser,
            startX,
            startY,
            endX,
            endY,
            blocked,
            cells
        });
    });
    return beams;
}

function getBlock(col, row) {
    const r = Math.floor(row);
    const c = Math.floor(col);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return grid[r][c];
}

function countPlacedBlocks() {
    let count = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) count++;
        }
    }
    return count;
}

// 全てのブロックが8方向（縦・横・斜め）で一続きに連結しているかを判定
function areBlocksConnected() {
    const blocks = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) blocks.push({ r, c });
        }
    }
    // 0個または1個なら常に連結
    if (blocks.length <= 1) return true;

    const visited = new Set();
    const queue = [blocks[0]];
    visited.add(`${blocks[0].r},${blocks[0].c}`);

    // 8方向（上下左右＋斜め4方向）
    const dirs = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    while (queue.length > 0) {
        const cur = queue.shift();
        for (const [dr, dc] of dirs) {
            const nr = cur.r + dr;
            const nc = cur.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc]) {
                const key = `${nr},${nc}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ r: nr, c: nc });
                }
            }
        }
    }

    return visited.size === blocks.length;
}

function updateBlockBadge(preserveStatus = false) {
    if (!blockCountVal) return;
    const placed = countPlacedBlocks();
    const st = getStage();
    const max = st.maxBlocks;

    blockCountVal.textContent = `${placed} / ${max}`;
    if (placed >= max) {
        blockCountVal.classList.add('limit');
    } else {
        blockCountVal.classList.remove('limit');
    }

    if (phase === 'place' && statusBar && !preserveStatus) {
        if (!showSolution) {
            statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
        }
    }
}

// Saved grid before block movement for retry
let originalGrid = null;

// MARK: - Normal Block Placement (Does not move until Start)
function placeBlock(col, row) {
    if (explosionMessageTimer) {
        clearTimeout(explosionMessageTimer);
        explosionMessageTimer = null;
    }
    if (grid[row][col]) {
        grid[row][col] = false;
        actionHistory.push({ row, col, remove: true });
        updateBlockBadge();
        render();
        return;
    }

    if (isForbidden(col, row)) {
        statusBar.innerHTML = '<span class="status-fail">赤の斜線のマスには配置できません！</span>';
        setTimeout(() => {
            if (phase === 'place') {
                updateBlockBadge();
            }
        }, 1200);
        return;
    }

    const max = getStage().maxBlocks;
    if (countPlacedBlocks() >= max) {
        statusBar.innerHTML = `<span class="status-fail">ブロックは最大${max}個までです！</span>`;
        setTimeout(() => {
            if (phase === 'place') {
                updateBlockBadge();
            }
        }, 1200);
        return;
    }

    grid[row][col] = true;
    actionHistory.push({ row, col, remove: false });
    updateBlockBadge();
    render();
}

// MARK: - Gimmick Block Movements at Start (離散時間並行シミュレーション・恒久ギミック評価・玉突き停止・超新星爆発対応)
function simulateGimmickBlockMoves() {
    const st = getStage();
    // シミュレーション作業用の一時グリッド
    const simGrid = grid.map(r => [...r]);

    // スイッチブロックのシミュレーション用状態管理
    const simSwitches = new Map();
    const switchEvents = [];
    if (Array.isArray(st.gimmicks)) {
        st.gimmicks.forEach(g => {
            if (g && g.type === 'switch') {
                const seq = getSwitchDirSequence(g);
                simSwitches.set(`${g.col},${g.row}`, {
                    seq,
                    index: 0,
                    moveType: getEffectiveGimmickMoveType(g),
                    steps: g.steps || 1
                });
            }
        });
    }
    function getSimSwitchKey() {
        if (simSwitches.size === 0) return '';
        const parts = [];
        simSwitches.forEach((sw, key) => parts.push(`${key}:${sw.index}`));
        return parts.join('|');
    }
    function consumeSwitchAt(col, row, tick) {
        const key = `${col},${row}`;
        const sw = simSwitches.get(key);
        if (!sw) return null;
        const activeDir = sw.seq[sw.index];
        sw.index = (sw.index + 1) % sw.seq.length;
        const nextDir = sw.seq[sw.index];
        switchEvents.push({ tick, col, row, dir: nextDir });
        return { dir: activeDir, mode: sw.moveType, steps: sw.steps };
    }

    const blocks = [];
    let idCounter = 1;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (simGrid[r][c]) {
                const g = getGimmick(c, r);
                const hasMove = Boolean(g && (g.type === 'step' || g.type === 'dash' || g.type === 'switch'));
                let initDir = null;
                let initMode = null;
                let initSteps = 0;
                let startedOnSwitch = false;
                if (g && g.type === 'switch') {
                    const sw = simSwitches.get(`${c},${r}`);
                    initDir = sw ? sw.seq[sw.index] : getSwitchDirSequence(g)[0];
                    initMode = sw ? sw.moveType : getEffectiveGimmickMoveType(g);
                    initSteps = (initMode === 'step') ? (g.steps || 1) : Infinity;
                    startedOnSwitch = true;
                } else if (hasMove) {
                    initDir = g.dir;
                    initMode = g.type;
                    initSteps = (g.type === 'step') ? (g.steps || 1) : Infinity;
                }
                blocks.push({
                    id: idCounter++,
                    col: c,
                    row: r,
                    originCol: c,
                    originRow: r,
                    dir: initDir,
                    mode: initMode,
                    remainingSteps: initSteps,
                    isMoving: hasMove,
                    startedOnSwitch,
                    path: [{ col: c, row: r }],
                    history: [{ col: c, row: r, dir: initDir, mode: initMode, remainingSteps: initSteps, switchKey: getSimSwitchKey(), tick: 0, pathIndex: 0 }]
                });
            }
        }
    }

    const maxTicks = 80;
    let tickCount = 0;
    let lastStopTick = 0;
    let supernova = null;
    let supernovas = [];
    let blackHoleLoop = null;
    let blackHoleLoops = [];
    let bhPreMoveEndTick = null;

    while (tickCount < maxTicks) {
        tickCount++;
        const movingBlocks = blocks.filter(b => b.isMoving);
        if (movingBlocks.length === 0) {
            tickCount--;
            break;
        }

        // 次の希望マスを計算
        const intentions = new Map();
        movingBlocks.forEach(b => {
            let nc = b.col;
            let nr = b.row;
            if (b.dir === 'right') nc++;
            else if (b.dir === 'left') nc--;
            else if (b.dir === 'up') nr--;
            else if (b.dir === 'down') nr++;
            intentions.set(b.id, { nc, nr });
        });

        // 1. 盤面外に出ようとするブロックは停止
        movingBlocks.forEach(b => {
            const dest = intentions.get(b.id);
            if (dest.nc < 0 || dest.nc >= COLS || dest.nr < 0 || dest.nr >= ROWS) {
                b.isMoving = false;
                intentions.delete(b.id);
            }
        });

        // 2-A. 静止ブロックとの衝突による玉突き停止を収束させる
        const resolveStoppedQueue = () => {
            let changed = true;
            while (changed) {
                changed = false;
                const stoppedCells = new Set();
                blocks.forEach(b => {
                    if (!b.isMoving) {
                        stoppedCells.add(`${b.col},${b.row}`);
                    }
                });
                supernovas.forEach(s => {
                    stoppedCells.add(`${s.col},${s.row}`);
                });
                movingBlocks.forEach(b => {
                    if (!b.isMoving) return;
                    const dest = intentions.get(b.id);
                    if (!dest) return;
                    if (stoppedCells.has(`${dest.nc},${dest.nr}`)) {
                        b.isMoving = false;
                        intentions.delete(b.id);
                        changed = true;
                    }
                });
            }
        };
        resolveStoppedQueue();

        // 2-B. 正面すれ違い衝突（AがBの位置へ、BがAの位置へ同時に進もうとした場合：マスの境界で衝突するため超新星爆発は起こさず互いに手前マスで停止）
        let swapCollisionOccurred = false;
        movingBlocks.forEach(b => {
            if (!b.isMoving || !intentions.has(b.id)) return;
            const dest = intentions.get(b.id);
            const other = blocks.find(ob => ob.id !== b.id && ob.isMoving && ob.col === dest.nc && ob.row === dest.nr);
            if (other && intentions.has(other.id)) {
                const otherDest = intentions.get(other.id);
                if (otherDest.nc === b.col && otherDest.nr === b.row) {
                    b.isMoving = false;
                    other.isMoving = false;
                    intentions.delete(b.id);
                    intentions.delete(other.id);
                    swapCollisionOccurred = true;
                }
            }
        });

        // 正面すれ違い停止が発生した場合、その後続ブロックも先に玉突き停止させる
        if (swapCollisionOccurred) {
            resolveStoppedQueue();
        }

        // 2-C. 同一マスへの複数進入競合（禁忌：超新星爆発の検知）
        let sameCellCollisionOccurred = false;
        const resolveSameCellCollisions = (onlyUnoccupied) => {
            const occupiedCells = new Set(blocks.map(b => `${b.col},${b.row}`));
            const targetGroups = new Map();
            movingBlocks.forEach(b => {
                if (b.isMoving && intentions.has(b.id)) {
                    const dest = intentions.get(b.id);
                    const k = `${dest.nc},${dest.nr}`;
                    if (onlyUnoccupied && occupiedCells.has(k)) return;
                    if (!targetGroups.has(k)) targetGroups.set(k, []);
                    targetGroups.get(k).push(b);
                }
            });

            let collided = false;
            for (const [destKey, group] of targetGroups.entries()) {
                if (group.length > 1) {
                    const [nc, nr] = destKey.split(',').map(Number);
                    if (!supernovas.some(s => s.col === nc && s.row === nr)) {
                        supernovas.push({
                            col: nc,
                            row: nr,
                            tick: tickCount,
                            colliders: group.map(b => ({
                                id: b.id,
                                originCol: b.originCol,
                                originRow: b.originRow,
                                fromCol: b.col,
                                fromRow: b.row,
                                path: [...b.path]
                            }))
                        });
                    }
                    group.forEach(b => {
                        b.isMoving = false;
                        intentions.delete(b.id);
                    });
                    collided = true;
                    sameCellCollisionOccurred = true;
                }
            }
            if (collided) {
                resolveStoppedQueue();
            }
        };

        // 先に現在空きマスへの同時進入衝突を解決して後続を玉突き停止させ、その後残りの同時進入衝突を解決する
        resolveSameCellCollisions(true);
        resolveSameCellCollisions(false);

        // このティックで実際に移動するブロックが1つもない場合は余分な静止フレームを作らず終了
        if (intentions.size === 0) {
            tickCount--;
            break;
        }

        // スイッチ上の初期ブロックが出発する場合は、到着処理より先にスイッチを切り替える
        blocks.forEach(b => {
            if (b.isMoving && intentions.has(b.id) && b.startedOnSwitch) {
                consumeSwitchAt(b.col, b.row, tickCount);
                b.startedOnSwitch = false;
            }
        });

        // 動けるブロックを1マス進める
        blocks.forEach(b => {
            if (b.isMoving && intentions.has(b.id)) {
                const dest = intentions.get(b.id);
                b.col = dest.nc;
                b.row = dest.nr;
                b.path.push({ col: b.col, row: b.row });

                // 移動先マスのギミック判定（床の矢印ギミックは常に有効）
                const g = getGimmick(b.col, b.row);
                if (g && g.type === 'switch') {
                    const swRes = consumeSwitchAt(b.col, b.row, tickCount);
                    if (swRes) {
                        b.dir = swRes.dir;
                        b.mode = swRes.mode;
                        b.remainingSteps = (swRes.mode === 'step') ? swRes.steps : Infinity;
                    }
                } else if (g && (g.type === 'step' || g.type === 'dash')) {
                    b.dir = g.dir;
                    b.mode = g.type;
                    b.remainingSteps = (g.type === 'step') ? (g.steps || 1) : Infinity;
                } else {
                    if (b.mode === 'step') {
                        b.remainingSteps--;
                        if (b.remainingSteps <= 0) {
                            b.isMoving = false;
                        }
                    }
                }
            } else {
                // 静止中または停止したブロックは現在位置をパスに追加（全ブロックのパス長を同期）
                b.path.push({ col: b.col, row: b.row });
            }
        });

        // いずれかのブロックが停止・衝突したティックを記録（盤面の障害物状態が変化した最終ティック）
        if (movingBlocks.some(b => !b.isMoving) || swapCollisionOccurred || sameCellCollisionOccurred) {
            lastStopTick = tickCount;
        }

        // ループ（周回）の検出（全移動中ブロックが障害物確定後に周期軌道へ入った場合のみブラックホールとする）
        const stillMoving = blocks.filter(b => b.isMoving);
        const loopMatches = new Map();
        const curSwitchKey = getSimSwitchKey();

        for (const b of stillMoving) {
            let matchedPrev = null;
            for (let i = b.history.length - 1; i >= 0; i--) {
                const h = b.history[i];
                if (h.tick < lastStopTick) break;
                if (
                    h.col === b.col &&
                    h.row === b.row &&
                    h.dir === b.dir &&
                    h.mode === b.mode &&
                    h.remainingSteps === b.remainingSteps &&
                    h.switchKey === curSwitchKey &&
                    (b.path.length - 1 - h.pathIndex) >= 2
                ) {
                    matchedPrev = h;
                    break;
                }
            }
            if (matchedPrev) {
                loopMatches.set(b.id, matchedPrev);
            }
            b.history.push({
                col: b.col,
                row: b.row,
                dir: b.dir,
                mode: b.mode,
                remainingSteps: b.remainingSteps,
                switchKey: curSwitchKey,
                tick: tickCount,
                pathIndex: b.path.length - 1
            });
        }

        if (stillMoving.length > 0 && loopMatches.size === stillMoving.length) {
            // 各ループブロックが周期軌道に最初に入ったティック (entryTick) を逆算
            let maxLoopEntryTick = 0;
            stillMoving.forEach(lb => {
                const prev = loopMatches.get(lb.id);
                const period = (lb.path.length - 1) - prev.pathIndex;
                let entryIdx = prev.pathIndex;
                while (entryIdx > 0) {
                    const hBefore = lb.history[entryIdx - 1];
                    const hLater = lb.history[entryIdx - 1 + period];
                    if (
                        hBefore && hLater &&
                        hBefore.col === hLater.col &&
                        hBefore.row === hLater.row &&
                        hBefore.dir === hLater.dir &&
                        hBefore.mode === hLater.mode &&
                        hBefore.remainingSteps === hLater.remainingSteps
                    ) {
                        entryIdx--;
                    } else {
                        break;
                    }
                }
                if (entryIdx > maxLoopEntryTick) {
                    maxLoopEntryTick = entryIdx;
                }
            });

            // ループ以外のブロックが実際に移動した最終ティックを算出
            let maxNonLoopMoveTick = 0;
            blocks.forEach(nb => {
                if (nb.isMoving) return;
                for (let t = nb.path.length - 1; t >= 1; t--) {
                    if (nb.path[t].col !== nb.path[t - 1].col || nb.path[t].row !== nb.path[t - 1].row) {
                        if (t > maxNonLoopMoveTick) {
                            maxNonLoopMoveTick = t;
                        }
                        break;
                    }
                }
            });

            const preMoveEndTick = Math.max(maxLoopEntryTick, maxNonLoopMoveTick);

            // 各移動ブロックの周期長を保存
            const blockPeriods = new Map();
            stillMoving.forEach(lb => {
                const prev = loopMatches.get(lb.id);
                blockPeriods.set(lb.id, (lb.path.length - 1) - prev.pathIndex);
            });

            // 各移動ブロックの周期パスを取得
            const blockLoopPaths = new Map();
            stillMoving.forEach(b => {
                const period = blockPeriods.get(b.id);
                const lp = b.path.slice(preMoveEndTick, preMoveEndTick + period);
                blockLoopPaths.set(b.id, lp);
            });

            // ループのクラスタリング（共通セルを共有するブロック同士を同一グループとする）
            const visited = new Set();
            const loopGroups = [];

            stillMoving.forEach(b => {
                if (visited.has(b.id)) return;
                const groupBlocks = [b];
                visited.add(b.id);
                const bPath = blockLoopPaths.get(b.id);
                const cellSet = new Set(bPath.map(p => `${p.col},${p.row}`));

                let added = true;
                while (added) {
                    added = false;
                    stillMoving.forEach(ob => {
                        if (visited.has(ob.id)) return;
                        const obPath = blockLoopPaths.get(ob.id);
                        const sharesCell = obPath.some(p => cellSet.has(`${p.col},${p.row}`));
                        if (sharesCell) {
                            visited.add(ob.id);
                            groupBlocks.push(ob);
                            obPath.forEach(p => cellSet.add(`${p.col},${p.row}`));
                            added = true;
                        }
                    });
                }
                loopGroups.push(groupBlocks);
            });

            const detectedLoops = loopGroups.map((grp, grpIdx) => {
                const primaryB = grp[0];
                const primaryPeriod = blockPeriods.get(primaryB.id);
                const loopPath = primaryB.path.slice(preMoveEndTick, preMoveEndTick + primaryPeriod);
                const cols = loopPath.map(p => p.col);
                const rows = loopPath.map(p => p.row);
                const minC = Math.min(...cols), maxC = Math.max(...cols);
                const minR = Math.min(...rows), maxR = Math.max(...rows);
                const centerCol = (minC + maxC) / 2;
                const centerRow = (minR + maxR) / 2;

                const loopBlockOffsets = grp.map(lb => {
                    const lbState = lb.history[preMoveEndTick];
                    let offsetIdx = 0;
                    for (let k = 0; k < primaryPeriod; k++) {
                        const pk = primaryB.history[preMoveEndTick + k];
                        if (pk && pk.col === lbState.col && pk.row === lbState.row && pk.dir === lbState.dir) {
                            offsetIdx = k;
                            break;
                        }
                    }
                    return {
                        id: lb.id,
                        col: lbState.col,
                        row: lbState.row,
                        loopOffset: offsetIdx
                    };
                });

                return {
                    id: grpIdx + 1,
                    blockId: primaryB.id,
                    originCol: primaryB.originCol,
                    originRow: primaryB.originRow,
                    loopPath,
                    loopBlockOffsets,
                    centerCol,
                    centerRow,
                    centerX: GX + (centerCol + 0.5) * CELL,
                    centerY: GY + (centerRow + 0.5) * CELL
                };
            }).filter(lp => lp.loopPath.length >= 2);

            if (detectedLoops.length > 0) {
                blackHoleLoops = detectedLoops;
                blackHoleLoop = detectedLoops[0];
                bhPreMoveEndTick = preMoveEndTick;
                tickCount = preMoveEndTick;
                break;
            }
        }
    }

    // 特殊演出（超新星爆発・ブラックホール）が発生している場合のブロック選別と先行移動の調整
    const hasSupernova = supernovas.length > 0;
    const hasBlackHole = blackHoleLoops.length > 0;
    const actualMoves = [];
    const stepDuration = 100;

    if (hasSupernova || hasBlackHole) {
        const activeEndTicks = new Map();
        const snColliderIds = new Set();
        let firstExplosionTick = 0;

        if (hasSupernova) {
            // 最初の爆発 tick 以外の超新星は除外（同時に起きたもののみ残す）
            firstExplosionTick = supernovas[0].tick;
            supernovas = supernovas.filter(s => s.tick === firstExplosionTick);
            const snPreMoveEndTick = firstExplosionTick - 1;

            // 超新星爆発に関係するブロック（2つ以上）のIDを収集
            supernovas.forEach(s => {
                s.colliders.forEach(c => {
                    snColliderIds.add(c.id);
                    const prev = activeEndTicks.get(c.id);
                    if (prev === undefined || snPreMoveEndTick > prev) {
                        activeEndTicks.set(c.id, snPreMoveEndTick);
                    }
                });
            });
        }

        if (hasBlackHole) {
            const bhTick = bhPreMoveEndTick !== null ? bhPreMoveEndTick : 0;
            blackHoleLoops.forEach(lp => {
                if (lp.loopBlockOffsets) {
                    lp.loopBlockOffsets.forEach(o => {
                        const prev = activeEndTicks.get(o.id);
                        if (prev === undefined || bhTick > prev) {
                            activeEndTicks.set(o.id, bhTick);
                        }
                    });
                }
            });
        }

        // 道を空けるなど、特殊演出ブロックの移動に間接的に関与するブロックを連鎖的に収集
        // 超新星爆発時の間接関与ブロックは爆発発生ティックまで進めて爆発地点上から退避させる
        const originMap = new Map();
        const blockById = new Map();
        blocks.forEach(b => {
            originMap.set(`${b.originCol},${b.originRow}`, b);
            blockById.set(b.id, b);
        });

        let changed = true;
        while (changed) {
            changed = false;
            for (const [bId, endTick] of activeEndTicks.entries()) {
                const b = blockById.get(bId);
                if (!b) continue;
                const maxT = Math.min(endTick, b.path.length - 1);
                for (let t = 1; t <= maxT; t++) {
                    const pos = b.path[t];
                    const blocker = originMap.get(`${pos.col},${pos.row}`);
                    if (blocker && blocker.id !== b.id) {
                        let reqTick = endTick;
                        if (hasSupernova && !snColliderIds.has(blocker.id)) {
                            reqTick = Math.max(reqTick, Math.min(firstExplosionTick, blocker.path.length - 1));
                        }
                        const prevTick = activeEndTicks.get(blocker.id);
                        if (prevTick === undefined || reqTick > prevTick) {
                            activeEndTicks.set(blocker.id, reqTick);
                            changed = true;
                        }
                    }
                }
            }
        }

        blocks.forEach(b => {
            if (activeEndTicks.has(b.id)) {
                const endTick = activeEndTicks.get(b.id);
                b.path = b.path.slice(0, endTick + 1);
                const lastPos = b.path[b.path.length - 1];
                b.col = lastPos.col;
                b.row = lastPos.row;
                const hasMoved = b.path.some(p => p.col !== b.originCol || p.row !== b.originRow);
                if (hasMoved) {
                    actualMoves.push({
                        fromCol: b.originCol,
                        fromRow: b.originRow,
                        toCol: b.col,
                        toRow: b.row,
                        path: b.path,
                        duration: Math.max(260, endTick * stepDuration)
                    });
                }
            } else {
                // 爆発やブラックホール等の特殊演出に関与しないブロックは初期位置にとどまり、移動アニメーションを行わない
                b.col = b.originCol;
                b.row = b.originRow;
                b.path = [{ col: b.originCol, row: b.originRow }];
            }
        });
    } else {
        // 通常時（超新星爆発なし）
        const maxSteps = tickCount;
        const totalDuration = Math.max(260, maxSteps * stepDuration);
        blocks.forEach(b => {
            const hasMoved = b.path.some(p => p.col !== b.originCol || p.row !== b.originRow);
            if (hasMoved) {
                actualMoves.push({
                    fromCol: b.originCol,
                    fromRow: b.originRow,
                    toCol: b.col,
                    toRow: b.row,
                    path: b.path,
                    duration: totalDuration
                });
            }
        });
    }

    // 最終盤面の作成
    const finalGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    blocks.forEach(b => {
        finalGrid[b.row][b.col] = true;
    });

    const rounds = actualMoves.length > 0 ? [actualMoves] : [];

    supernova = supernovas.length > 0 ? supernovas[0] : null;

    const finalSwitchDirs = new Map();
    simSwitches.forEach((sw, key) => {
        finalSwitchDirs.set(key, sw.seq[sw.index]);
    });

    return { rounds, finalGrid, supernova, supernovas, blackHoleLoop, blackHoleLoops, switchEvents, finalSwitchDirs };
}

function animateBlockMove(ts) {
    if (phase !== 'block_move') return;

    const currentTime = ts || performance.now();
    const currentMoves = blockAnimationRounds[currentRoundIndex];
    if (!currentMoves || currentMoves.length === 0) {
        finishBlockMove();
        return;
    }

    const maxDuration = Math.max(...currentMoves.map(m => m.duration));
    const elapsed = Math.max(0, currentTime - roundStartTime);
    const roundProgress = Math.min(1, elapsed / maxDuration);

    renderBlockMoveState(currentMoves, roundProgress);

    if (roundProgress >= 1) {
        // このラウンドの移動を実際の grid に反映（退避先と出発地が重なる玉突き事故防止のため2段階で反映）
        currentMoves.forEach(m => {
            grid[m.fromRow][m.fromCol] = false;
        });
        currentMoves.forEach(m => {
            grid[m.toRow][m.toCol] = true;
        });

        currentRoundIndex++;
        if (currentRoundIndex < blockAnimationRounds.length) {
            roundStartTime = performance.now();
            animId = requestAnimationFrame(animateBlockMove);
        } else {
            finishBlockMove();
        }
    } else {
        animId = requestAnimationFrame(animateBlockMove);
    }
}

function applySwitchStatesUpToTick(targetTick) {
    const st = getStage();
    if (!st || !Array.isArray(st.gimmicks)) return;
    st.gimmicks.forEach(g => {
        if (g && g.type === 'switch') {
            const key = `${g.col},${g.row}`;
            const seq = getSwitchDirSequence(g);
            switchStates.set(key, { seq, index: 0, currentDir: seq[0] });
        }
    });
    if (!Array.isArray(pendingSwitchEvents)) return;
    pendingSwitchEvents.forEach(ev => {
        if (ev.tick <= targetTick) {
            const key = `${ev.col},${ev.row}`;
            const cur = switchStates.get(key);
            if (cur) {
                const idx = cur.seq.indexOf(ev.dir);
                cur.index = idx >= 0 ? idx : cur.index;
                cur.currentDir = ev.dir;
            }
        }
    });
}

function applyFinalSwitchStates() {
    if (!pendingFinalSwitchDirs) return;
    pendingFinalSwitchDirs.forEach((dir, key) => {
        const cur = switchStates.get(key);
        if (cur) {
            const idx = cur.seq.indexOf(dir);
            if (idx >= 0) cur.index = idx;
            cur.currentDir = dir;
        }
    });
}

function renderBlockMoveState(activeMoves, progress) {
    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);
    drawBackground();
    drawGround();
    drawGridLines();
    drawCeiling();

    const maxSegs = activeMoves.reduce((mx, m) => Math.max(mx, m.path && m.path.length > 1 ? m.path.length - 1 : 1), 1);
    applySwitchStatesUpToTick(progress * maxSegs);

    const st = getStage();
    st.forbidden.forEach(f => drawForbiddenTile(f.col, f.row));
    st.gimmicks.forEach(g => drawGimmickTile(g));
    drawSolutionOverlay();

    // 静止しているブロック用の仮グリッドと移動中ブロック矩形を構築
    const staticGrid = grid.map(r => [...r]);
    activeMoves.forEach(m => {
        if (m.fromRow >= 0 && m.fromRow < ROWS && m.fromCol >= 0 && m.fromCol < COLS) {
            staticGrid[m.fromRow][m.fromCol] = false;
        }
    });

    // 静止しているブロックを描画
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (staticGrid[r][c]) {
                drawMarioBlock(c, r);
            }
        }
    }

    // 移動中のブロックを描画（path に沿った補間位置）
    const movingRects = [];
    activeMoves.forEach(m => {
        let currentC = m.fromCol;
        let currentR = m.fromRow;
        if (m.path && m.path.length > 1) {
            const totalSegments = m.path.length - 1;
            const segProgress = progress * totalSegments;
            const segIdx = Math.min(Math.floor(segProgress), totalSegments - 1);
            const subT = segProgress - segIdx;
            const p0 = m.path[segIdx];
            const p1 = m.path[segIdx + 1];
            currentC = p0.col + (p1.col - p0.col) * subT;
            currentR = p0.row + (p1.row - p0.row) * subT;
        } else {
            currentC = m.fromCol + (m.toCol - m.fromCol) * progress;
            currentR = m.fromRow + (m.toRow - m.fromRow) * progress;
        }
        movingRects.push({
            x: GX + currentC * CELL,
            y: GY + currentR * CELL,
            w: CELL,
            h: CELL
        });
        drawMarioBlock(currentC, currentR);
    });

    drawLasers(true, staticGrid, movingRects);
    drawPipe();
    drawGoal();
    drawStickman(-1.5, st.startRow);
}

function finishBlockMove() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    blockAnimationRounds = [];
    currentRoundIndex = 0;
    applyFinalSwitchStates();

    // 超新星爆発とブラックホールの同時発生
    if (pendingSupernova && pendingBlackHole) {
        const snList = Array.isArray(pendingSupernova) ? pendingSupernova : [pendingSupernova];
        const bh = pendingBlackHole;
        pendingSupernova = null;
        pendingBlackHole = null;
        startDualSupernovaBlackHole(snList, bh);
        return;
    }

    // 2つのブロックが一点で交わる禁忌（超新星爆発）が発生している場合はキャラ移動直前に発動
    if (pendingSupernova) {
        const sn = pendingSupernova;
        pendingSupernova = null;
        startSupernova(sn);
        return;
    }

    // 無限周回（ブラックホール）が発生している場合
    if (pendingBlackHole) {
        const bh = pendingBlackHole;
        pendingBlackHole = null;
        startBlackHole(bh);
        return;
    }

    statusBar.innerHTML = '<span class="status-run"> GO GO GO!!</span>';
    startRun();
}

// MARK: - Supernova Animation (禁忌：2つのブロックが一点で交わる際の超新星爆発演出)
function getSpotStopRatio(spot) {
    if (!spot.colliders || spot.colliders.length < 2) return 0.45;
    const c0 = spot.colliders[0];
    const c1 = spot.colliders[1];
    const v0x = spot.col - c0.fromCol;
    const v0y = spot.row - c0.fromRow;
    const v1x = spot.col - c1.fromCol;
    const v1y = spot.row - c1.fromRow;
    const dot = v0x * v1x + v0y * v1y;
    if (dot < -0.5) {
        // 正面衝突（180度対向）：0.45 で隙間約10px。全く交わらない
        return 0.45;
    } else if (Math.abs(dot) < 0.5) {
        // 直交衝突（90度対向）：0.35 で交点マスの手前で止まり、角のめり込みを防止
        return 0.35;
    }
    return 0.40;
}

function startSupernova(supernovaData) {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    phase = 'supernova';
    startBtn.disabled = true;

    // 爆発によってステージ上のブロックをすべて消去するため、バックアップも破棄
    originalGrid = null;

    // 単一オブジェクトまたは複数オブジェクトの配列を正規化
    const rawSpots = Array.isArray(supernovaData) ? supernovaData : [supernovaData];
    const spots = rawSpots.map(s => ({
        col: s.col,
        row: s.row,
        tick: s.tick,
        colliders: s.colliders,
        stopRatio: getSpotStopRatio(s),
        focusX: GX + (s.col + 0.5) * CELL,
        focusY: GY + (s.row + 0.5) * CELL
    }));

    // 全地点共通で「時間がゆっくり -> 2つが近づく -> 一瞬止まる -> ブルブル -> ドーン」のタイムラインを流す
    // 2点以上の場合は爆発までの時間を動的に少し伸ばし、地点間のカメラパンをスムーズに行う
    const spotCount = spots.length;
    let APPROACH_MOVE_END = 1000;
    let APPROACH_END = 1200;
    let FUSION_END = 2350;
    let PULL_START = 2050;
    let TOTAL_END = 5050;
    let schedule = null;

    if (spotCount >= 2) {
        // 各スポットの滞在時間 (stay) とパン時間 (pan) を動的に生成
        // 最初の爆発クローズアップから最後の爆発クローズアップまで徐々に見る時間を縮め、迫り来る演出にする
        const stays = [];
        const pans = [];
        const firstStay = 1050;
        const lastStay = spotCount === 2 ? 680 : Math.max(300, 680 - (spotCount - 2) * 110);

        for (let i = 0; i < spotCount; i++) {
            const ratio = spotCount > 1 ? i / (spotCount - 1) : 0;
            stays.push(Math.round(firstStay + (lastStay - firstStay) * Math.pow(ratio, 0.85)));
            if (i < spotCount - 1) {
                const panRatio = spotCount > 2 ? i / (spotCount - 2) : 0;
                pans.push(Math.round(360 - panRatio * 120));
            }
        }

        schedule = [];
        let curTime = 0;
        for (let i = 0; i < spotCount; i++) {
            const stayStart = curTime;
            const stayEnd = curTime + stays[i];
            schedule.push({ type: 'stay', spotIndex: i, start: stayStart, end: stayEnd });
            curTime = stayEnd;
            if (i < spotCount - 1) {
                const panStart = curTime;
                const panEnd = curTime + pans[i];
                schedule.push({ type: 'pan', fromSpot: i, toSpot: i + 1, start: panStart, end: panEnd });
                curTime = panEnd;
            }
        }

        APPROACH_MOVE_END = 900;
        APPROACH_END = 1050;
        PULL_START = curTime;
        const PULL_DURATION = 380;
        FUSION_END = PULL_START + PULL_DURATION;
        TOTAL_END = FUSION_END + 2700;
    }

    supernovaState = {
        spots: spots,
        col: spots[0].col,
        row: spots[0].row,
        colliders: spots[0].colliders,
        timeline: { APPROACH_MOVE_END, APPROACH_END, FUSION_END, PULL_START, TOTAL_END, schedule },
        startTime: performance.now(),
        exploded: false,
        particles: [],
        debris: [],
        landed: false
    };

    if (statusBar) {
        statusBar.innerHTML = '<span class="status-place">•••••</span>';
    }
    if (hintText) {
        hintText.textContent = '';
    }

    animId = requestAnimationFrame(animateSupernova);
}

function spawnSupernovaExplosionParticles(cx, cy, targetState) {
    const stObj = targetState || supernovaState;
    if (!stObj) return;
    const colors = ['#ffffff', '#ffffff', '#67e8f9', '#fde047', '#f0abfc', '#fb923c', '#38bdf8'];
    for (let i = 0; i < 85; i++) {
        const angle = (Math.PI * 2 * i) / 85 + (Math.random() - 0.5) * 0.25;
        const speed = 2.2 + Math.random() * 11.5;
        stObj.particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 2.5 + Math.random() * 6.5,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1.0,
            decay: 0.012 + Math.random() * 0.018
        });
    }
    for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3.0 + Math.random() * 9.0;
        stObj.debris.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5,
            size: 5 + Math.random() * 8,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.35,
            alpha: 1.0
        });
    }
}

function drawSupernovaBlock(col, row, whiteRatio, offsetX, offsetY, scale) {
    const cx = GX + (col + 0.5) * CELL + (offsetX || 0);
    const cy = GY + (row + 0.5) * CELL + (offsetY || 0);
    const sc = scale || 1.0;
    const p = 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);

    if (whiteRatio > 0.05) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 28 * whiteRatio;
    }

    const half = CELL / 2;
    const x = -half;
    const y = -half;

    // 通常のレンガブロック描画
    ctx.fillStyle = '#e8a020';
    ctx.fillRect(x + p, y + p, CELL - p * 2, CELL - p * 2);
    ctx.fillStyle = '#f8c860';
    ctx.fillRect(x + p, y + p, CELL - p * 2, 5);
    ctx.fillRect(x + p, y + p, 5, CELL - p * 2);
    ctx.strokeStyle = '#c06010';
    ctx.lineWidth = p;
    ctx.strokeRect(x + p, y + p, CELL - p * 2, CELL - p * 2);

    ctx.strokeStyle = '#c06010';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + CELL / 2, y + p);
    ctx.lineTo(x + CELL / 2, y + CELL / 2);
    ctx.moveTo(x + p, y + CELL / 2);
    ctx.lineTo(x + CELL - p, y + CELL / 2);
    ctx.stroke();

    // 白熱化オーバーレイ（振動しながら白くなり融合していく演出）
    if (whiteRatio > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, whiteRatio)})`;
        ctx.fillRect(x + p, y + p, CELL - p * 2, CELL - p * 2);
        if (whiteRatio > 0.5) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, (whiteRatio - 0.5) * 2)})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        }
    }

    ctx.restore();
}

function animateSupernova(ts) {
    if (phase !== 'supernova' || !supernovaState) return;

    const now = ts || performance.now();
    const elapsed = Math.max(0, now - supernovaState.startTime);
    const { APPROACH_END, FUSION_END, TOTAL_END } = supernovaState.timeline;

    if (elapsed >= FUSION_END && !supernovaState.exploded) {
        supernovaState.exploded = true;
        // ステージ上のブロックを全て消去
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                grid[r][c] = false;
            }
        }
        updateBlockBadge(true);
        supernovaState.spots.forEach(sp => {
            spawnSupernovaExplosionParticles(sp.focusX, sp.focusY);
        });
    }

    renderSupernovaState(elapsed);

    if (elapsed >= TOTAL_END) {
        finishSupernova();
    } else {
        animId = requestAnimationFrame(animateSupernova);
    }
}

// 土管の奥側に配置し、土管の開口部からニュッとせり上がる演出
function drawSupernovaStickmanBehind(elapsed, APPROACH_END, FUSION_END) {
    const BLOW_START = FUSION_END + 200;    // 爆発0.2秒後に吹っ飛び開始 (2550ms)
    const BLOW_END = BLOW_START + 470;      // 3020ms
    const EMERGE_START = BLOW_END + 1000;   // 吹っ飛んでから1秒後 (4020ms) に復活開始
    const EMERGE_RISE_END = EMERGE_START + 450; // 4470ms: 土管の開口部までせり上がり完了

    if (elapsed >= EMERGE_START && elapsed < EMERGE_RISE_END) {
        const st = getStage();
        const px = GX - 78;
        const pw = 60;
        const pipeTopY = GY + st.startRow * CELL + 2;
        const groundY = GY + (st.startRow + 1) * CELL;
        const pipeCx = GX - 48; // 土管の中心X

        const et = (elapsed - EMERGE_START) / (EMERGE_RISE_END - EMERGE_START);
        // 滑らかなせり上がりイージング
        const ease = et < 0.5 ? 2 * et * et : 1 - Math.pow(-2 * et + 2, 2) / 2;

        // 身長約66px。最初(et=0)は足元が pipeTopY + 66 (頭のてっぺんだけが土管の穴にある)
        // et=1 で足元が pipeTopY + 2 (足が土管の口のすぐ内側) までせり上がる
        const curBot = pipeTopY + 66 - ease * 64;
        const stretchY = 1 + 0.12 * Math.sin(et * Math.PI);
        const stretchX = 1 - 0.08 * Math.sin(et * Math.PI);

        ctx.save();
        // 土管の開口部幅に合わせてクリップし、土管の奥から綺麗にせり出す
        ctx.beginPath();
        ctx.rect(px - 4, 0, pw + 8, groundY);
        ctx.clip();
        ctx.translate(pipeCx, curBot);
        ctx.scale(stretchX, stretchY);
        renderStickmanToContext(ctx, 0, 0, 0, false);
        ctx.restore();
    }
}

// 土管からポンと跳び出して地面へ着地する演出
function drawSupernovaStickmanFront(elapsed, APPROACH_END, FUSION_END) {
    const st = getStage();
    const startCx = GX + (-1.5 + 0.5) * CELL; // 52
    const startBot = GY + (st.startRow + 1) * CELL; // 地面の草の上面
    const pipeTopY = GY + st.startRow * CELL + 2;
    const pipeCx = GX - 48; // 60

    const BLOW_START = FUSION_END + 200;    // 2550ms
    const BLOW_END = BLOW_START + 470;      // 3020ms
    const EMERGE_START = BLOW_END + 1000;   // 4020ms
    const EMERGE_RISE_END = EMERGE_START + 450; // 4470ms
    const FALL_LAND = EMERGE_RISE_END + 350;    // 4820ms: 地面へジャンプ着地
    const SETTLE_END = FALL_LAND + 180;         // 5000ms: 着地後のスクワッシュ屈伸立ち直り

    if (elapsed < BLOW_START) {
        // 爆発前〜爆発直後の0.2秒間：その場で耐える（激しい振動や反動）
        let trembleX = 0;
        let trembleY = 0;
        if (elapsed >= APPROACH_END && elapsed < FUSION_END) {
            const t2 = (elapsed - APPROACH_END) / (FUSION_END - APPROACH_END);
            trembleX = Math.sin(elapsed * 0.09) * t2 * 1.5;
        } else if (elapsed >= FUSION_END && elapsed < BLOW_START) {
            // 爆発後0.2秒間：爆風の衝撃波を受けてガタガタと大きく揺れる
            const wt = (elapsed - FUSION_END) / (BLOW_START - FUSION_END);
            trembleX = Math.sin(elapsed * 0.25) * (1 - wt * 0.2) * 3.5;
            trembleY = Math.cos(elapsed * 0.3) * (1 - wt * 0.2) * 2.0;
        }
        renderStickmanToContext(ctx, startCx + trembleX, startBot + trembleY, 0, false);
    } else if (elapsed < BLOW_END) {
        // 爆発時：衝撃波で左上画面外へ回転しながら吹っ飛ばされる
        const bt = (elapsed - BLOW_START) / (BLOW_END - BLOW_START);
        const startCy = startBot - 33;
        const curCx = startCx - bt * 165;
        const curCy = startCy - bt * 125 + (bt * bt) * 28;
        const rot = -bt * Math.PI * 4.5;

        ctx.save();
        ctx.translate(curCx, curCy);
        ctx.rotate(rot);
        renderStickmanToContext(ctx, 0, 33, 0, true);
        ctx.restore();
    } else if (elapsed < EMERGE_RISE_END) {
        // 土管の奥側でせり上がり中なので手前側は非表示
        return;
    } else if (elapsed < FALL_LAND) {
        // 土管の口からポンッと飛び出し、手前の地面へ放物線を描いて着地！
        const jt = (elapsed - EMERGE_RISE_END) / (FALL_LAND - EMERGE_RISE_END);
        // X座標は土管中心(pipeCx)から定位置(startCx)へ移動
        const curCx = pipeCx + (startCx - pipeCx) * jt;
        // Y座標は土管の口から上へ18pxポンと跳ね上がり、重力加速で地面(startBot)へ落ちる
        const arc = -18 * Math.sin(jt * Math.PI);
        const gravity = jt * jt;
        const curBot = pipeTopY + (startBot - pipeTopY) * gravity + arc;

        // 空中を跳んでいる間はジャンプポーズ
        renderStickmanToContext(ctx, curCx, curBot, 0, true);
    } else {
        // 地面着地：1度だけ土煙パーティクルを発生
        if (supernovaState && !supernovaState.landed) {
            supernovaState.landed = true;
            spawnDust(-1.5, st.startRow);
        }

        // 足裏（startBot）を地面の草の上に完全に接地させたまま、縦のスクワッシュ屈伸で着地衝撃を表現
        let squash = 1;
        if (elapsed < SETTLE_END) {
            const stProgress = (elapsed - FALL_LAND) / (SETTLE_END - FALL_LAND);
            squash = 1 - Math.sin(stProgress * Math.PI) * 0.10;
        }

        ctx.save();
        ctx.translate(startCx, startBot);
        ctx.scale(1 + (1 - squash) * 0.6, squash);
        renderStickmanToContext(ctx, 0, 0, 0, false);
        ctx.restore();
    }
}

function renderSupernovaState(elapsed) {
    if (!supernovaState) return;
    const { APPROACH_MOVE_END, APPROACH_END, FUSION_END, PULL_START, TOTAL_END } = supernovaState.timeline;
    const spotCount = supernovaState.spots.length;

    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);

    const EXPLOSION_FX_DURATION = 1300;

    // カメラズームとフォーカス位置の計算
    let zoom = 1.0;
    let camRatio = 0.0;
    let currentFocusX = TOTAL_W / 2;
    let currentFocusY = TOTAL_H / 2;
    let camShakeX = 0;
    let camShakeY = 0;

    if (spotCount <= 1) {
        const spot = supernovaState.spots[0];
        currentFocusX = spot.focusX;
        currentFocusY = spot.focusY;

        if (elapsed < APPROACH_END) {
            const t1 = elapsed / APPROACH_END;
            const ease1 = t1 < 0.5 ? 4 * t1 * t1 * t1 : 1 - Math.pow(-2 * t1 + 2, 3) / 2;
            zoom = 1.0 + 1.25 * ease1;
            camRatio = ease1;
        } else if (elapsed < PULL_START) {
            const t2 = (elapsed - APPROACH_END) / (PULL_START - APPROACH_END);
            zoom = 2.25 + 0.35 * (t2 * t2);
            camRatio = 1.0;
            camShakeX = Math.sin(elapsed * 0.08) * t2 * 2.5;
            camShakeY = Math.cos(elapsed * 0.095) * t2 * 2.5;
        } else if (elapsed < FUSION_END) {
            // 爆発直前にカメラワークを先行して等倍へ引き戻す
            const pt = (elapsed - PULL_START) / (FUSION_END - PULL_START);
            const easePt = pt * pt;
            zoom = 2.60 - 1.60 * easePt; // 2.60 -> 1.0
            camRatio = 1.0 - easePt;
            camShakeX = Math.sin(elapsed * 0.12) * 3.5;
            camShakeY = Math.cos(elapsed * 0.14) * 3.5;
        } else {
            zoom = 1.0;
            camRatio = 0.0;
            const shakeT = Math.min(1, (elapsed - FUSION_END) / 950);
            const shakeDecay = Math.pow(1 - shakeT, 2);
            camShakeX = Math.sin(elapsed * 0.14) * 14 * shakeDecay;
            camShakeY = Math.cos(elapsed * 0.17) * 14 * shakeDecay;
        }
    } else {
        // 複数地点の場合のシネマティックカメラワーク（見る時間を徐々に縮めて爆発が迫る緊迫感を演出）
        const schedule = supernovaState.timeline.schedule;
        const PULL_DURATION = FUSION_END - PULL_START;
        const currentItem = schedule ? schedule.find(s => elapsed >= s.start && elapsed < s.end) : null;

        if (currentItem) {
            if (currentItem.type === 'stay') {
                const sp = supernovaState.spots[currentItem.spotIndex];
                currentFocusX = sp.focusX;
                currentFocusY = sp.focusY;

                if (currentItem.spotIndex === 0) {
                    // スポット0へのズームイン
                    const zoomInDur = 560;
                    const t1 = Math.min(1, elapsed / zoomInDur);
                    const ease1 = t1 < 0.5 ? 4 * t1 * t1 * t1 : 1 - Math.pow(-2 * t1 + 2, 3) / 2;
                    zoom = 1.0 + 1.30 * ease1;
                    camRatio = ease1;
                } else if (currentItem.spotIndex === spotCount - 1) {
                    // 最後のスポット：激しい白熱と融合のズーム＆振動
                    const t3 = (elapsed - currentItem.start) / (currentItem.end - currentItem.start);
                    zoom = 2.30 + 0.20 * (t3 * t3);
                    camRatio = 1.0;
                    camShakeX = Math.sin(elapsed * 0.08) * t3 * 2.5;
                    camShakeY = Math.cos(elapsed * 0.095) * t3 * 2.5;
                } else {
                    // 中間スポット
                    zoom = 2.30;
                    camRatio = 1.0;
                    camShakeX = Math.sin(elapsed * 0.08) * 1.5;
                    camShakeY = Math.cos(elapsed * 0.095) * 1.5;
                }
            } else if (currentItem.type === 'pan') {
                // スポット間の高速スムーズパン（S字イージング）
                const u = (elapsed - currentItem.start) / (currentItem.end - currentItem.start);
                const easePan = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
                const fromSp = supernovaState.spots[currentItem.fromSpot];
                const toSp = supernovaState.spots[currentItem.toSpot];
                currentFocusX = fromSp.focusX + (toSp.focusX - fromSp.focusX) * easePan;
                currentFocusY = fromSp.focusY + (toSp.focusY - fromSp.focusY) * easePan;
                zoom = 2.30;
                camRatio = 1.0;
            }
        } else if (elapsed < FUSION_END) {
            // 全地点が爆発する直前にカメラを等倍（1.0）へ滑らかに引き戻す
            const lastSpot = supernovaState.spots[spotCount - 1];
            currentFocusX = lastSpot.focusX;
            currentFocusY = lastSpot.focusY;
            const pt = (elapsed - PULL_START) / PULL_DURATION;
            const easePt = pt < 0.5 ? 2 * pt * pt : 1 - Math.pow(-2 * pt + 2, 2) / 2;
            zoom = 2.50 - 1.50 * easePt; // 2.50 -> 1.0
            camRatio = 1.0 - easePt;
            camShakeX = Math.sin(elapsed * 0.12) * 3.5;
            camShakeY = Math.cos(elapsed * 0.14) * 3.5;
        } else {
            // 爆発後は等倍（1.0）で画面中央固定、画面全体に爆風シェイク
            zoom = 1.0;
            camRatio = 0.0;
            const shakeT = Math.min(1, (elapsed - FUSION_END) / 950);
            const shakeDecay = Math.pow(1 - shakeT, 2);
            camShakeX = Math.sin(elapsed * 0.14) * 16 * shakeDecay;
            camShakeY = Math.cos(elapsed * 0.17) * 16 * shakeDecay;
        }
    }

    const baseCenterX = TOTAL_W / 2;
    const baseCenterY = TOTAL_H / 2;
    const camTargetX = baseCenterX + (currentFocusX - baseCenterX) * camRatio;
    const camTargetY = baseCenterY + (currentFocusY - baseCenterY) * camRatio;

    ctx.save();
    ctx.translate(baseCenterX + camShakeX, baseCenterY + camShakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-camTargetX, -camTargetY);

    // 背景・ステージ要素の描画
    drawBackground();
    drawGround();
    drawGridLines();
    drawCeiling();

    const st = getStage();
    st.forbidden.forEach(f => drawForbiddenTile(f.col, f.row));
    st.gimmicks.forEach(g => drawGimmickTile(g));

    if (!supernovaState.exploded) {
        // 交差ブロック以外の盤面ブロックを描画（初期配置セル・衝突直前セル両方を除外して二重描画を防止）
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c]) {
                    const isCollider = supernovaState.spots.some(sp =>
                        sp.colliders.some(colObj =>
                            (colObj.fromCol === c && colObj.fromRow === r) ||
                            (colObj.originCol === c && colObj.originRow === r)
                        )
                    );
                    if (!isCollider) {
                        drawMarioBlock(c, r);
                    }
                }
            }
        }

        // 全地点共通の「近づく -> 一瞬止まる -> ブルブル -> ドーン」の計算
        let whiteRatio = 0;
        let vibAmp = 0;
        let blockScale = 1.0;
        let fusionT = 0;

        if (elapsed < APPROACH_END) {
            // 近づく（0〜1000ms）＆ 一瞬止まる（1000〜1200ms）の間は振動・白熱なし（静寂のタメ）
            whiteRatio = 0;
            vibAmp = 0;
            blockScale = 1.0;
        } else {
            // ブルブルフェーズ（1200〜2350ms）：前と同じ振動式で激しく振動しながら白熱・融合・収縮
            const t2 = (elapsed - APPROACH_END) / (FUSION_END - APPROACH_END);
            fusionT = Math.min(1, t2 / 0.75);
            whiteRatio = Math.min(1, 0.12 + 0.88 * Math.pow(t2, 0.8));
            vibAmp = (0.04 + 0.11 * Math.sin(t2 * Math.PI)) * CELL;
            if (t2 > 0.82) {
                const shrinkT = (t2 - 0.82) / 0.18;
                blockScale = 1.0 - 0.22 * shrinkT;
            }
        }

        // 全地点のブロックと融合オーラを描画
        supernovaState.spots.forEach(spot => {
            const stopRatio = spot.stopRatio || 0.45;
            let moveRatio = 0;

            if (elapsed < APPROACH_MOVE_END) {
                // 時間がゆっくり、2つのブロックが近づく（交わらない手前まで）
                const t1 = elapsed / APPROACH_MOVE_END;
                const ease1 = t1 < 0.5 ? 2 * t1 * t1 : 1 - Math.pow(-2 * t1 + 2, 2) / 2;
                moveRatio = ease1 * stopRatio;
            } else if (elapsed < APPROACH_END) {
                // 一瞬止まる（交わらない位置でピタッと静止）
                moveRatio = stopRatio;
            } else {
                // ブルブル振動しながら交点中心へ一気に融合
                moveRatio = stopRatio + (1.0 - stopRatio) * (fusionT * fusionT);
            }

            // 白熱・融合オーラ
            if (whiteRatio > 0.2) {
                ctx.save();
                const auraRadius = CELL * (0.6 + whiteRatio * 0.9);
                const grad = ctx.createRadialGradient(spot.focusX, spot.focusY, 2, spot.focusX, spot.focusY, auraRadius);
                grad.addColorStop(0, `rgba(255, 255, 255, ${whiteRatio * 0.9})`);
                grad.addColorStop(0.5, `rgba(165, 243, 252, ${whiteRatio * 0.5})`);
                grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(spot.focusX, spot.focusY, auraRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // コライダーブロックの描画（前と同じブルブル振動式）
            spot.colliders.forEach((c, idx) => {
                const curCol = c.fromCol + (spot.col - c.fromCol) * moveRatio;
                const curRow = c.fromRow + (spot.row - c.fromRow) * moveRatio;
                const phaseShift = idx * 2.1;
                const vx = vibAmp > 0 ? Math.sin(elapsed * 0.085 + phaseShift) * vibAmp : 0;
                const vy = vibAmp > 0 ? Math.cos(elapsed * 0.105 + phaseShift) * vibAmp : 0;
                drawSupernovaBlock(curCol, curRow, whiteRatio, vx, vy, blockScale);
            });
        });
    } else {
        // 超新星爆発エフェクト（全地点で同時に炸裂！）
        const t3 = Math.min(1, (elapsed - FUSION_END) / EXPLOSION_FX_DURATION);

        // 1. 各地点の中心コア爆発光球
        if (t3 < 0.75) {
            ctx.save();
            const coreProgress = t3 / 0.75;
            const coreRadius = CELL * (0.8 + coreProgress * 4.8);
            const coreAlpha = Math.max(0, 1 - coreProgress);

            supernovaState.spots.forEach(spot => {
                const coreGrad = ctx.createRadialGradient(spot.focusX, spot.focusY, 0, spot.focusX, spot.focusY, coreRadius);
                coreGrad.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha})`);
                coreGrad.addColorStop(0.35, `rgba(253, 224, 71, ${coreAlpha * 0.85})`);
                coreGrad.addColorStop(0.7, `rgba(56, 189, 248, ${coreAlpha * 0.5})`);
                coreGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
                ctx.fillStyle = coreGrad;
                ctx.beginPath();
                ctx.arc(spot.focusX, spot.focusY, coreRadius, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }

        // 2. 多重衝撃波リング（全地点から同時放射）
        const rings = [
            { delay: 0.0, maxR: 380, width: 14, color: '255, 255, 255' },
            { delay: 0.06, maxR: 310, width: 9, color: '103, 232, 249' },
            { delay: 0.12, maxR: 240, width: 6, color: '240, 171, 252' }
        ];
        rings.forEach(ring => {
            if (t3 > ring.delay) {
                const rt = Math.min(1, (t3 - ring.delay) / (1 - ring.delay));
                const easeR = 1 - Math.pow(1 - rt, 2.5);
                const radius = easeR * ring.maxR;
                const alpha = Math.max(0, 1 - rt);
                ctx.save();
                ctx.strokeStyle = `rgba(${ring.color}, ${alpha})`;
                ctx.lineWidth = Math.max(1.5, ring.width * (1 - rt * 0.7));

                supernovaState.spots.forEach(spot => {
                    ctx.beginPath();
                    ctx.arc(spot.focusX, spot.focusY, radius, 0, Math.PI * 2);
                    ctx.stroke();
                });
                ctx.restore();
            }
        });

        // 3. 吹き飛ぶブロックの破片（デブリ）
        supernovaState.debris.forEach(d => {
            d.x += d.vx;
            d.y += d.vy;
            d.vy += 0.18;
            d.rot += d.vRot;
            d.alpha = Math.max(0, 1 - t3 * 1.15);
            if (d.alpha > 0) {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(d.rot);
                ctx.globalAlpha = d.alpha;
                ctx.fillStyle = '#f8c860';
                ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
                ctx.strokeStyle = '#c06010';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
                ctx.restore();
            }
        });

        // 4. 超新星エネルギー粒子
        supernovaState.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.alpha = Math.max(0, p.alpha - p.decay);
            if (p.alpha > 0) {
                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
    }

    // 1. 土管の奥側にキャラクターを配置（土管の中からニュッと生えてくる）
    drawSupernovaStickmanBehind(elapsed, APPROACH_END, FUSION_END);

    // レーザー描画（起動中）
    drawLasers(true, grid);

    // 2. 土管とゴールの描画（生えてくる途中のキャラの手前に土管が重なる）
    drawPipe();
    drawGoal();

    // 3. 土管の手前側にキャラクターを描画（体が出切った瞬間にクローン生成 → 宙から落下着地）
    drawSupernovaStickmanFront(elapsed, APPROACH_END, FUSION_END);

    // 着地時の土煙などパーティクルの描画
    updateAndDrawParticles(ctx);

    ctx.restore();

    // 爆発瞬間の画面全体ホワイトアウト閃光
    if (supernovaState.exploded) {
        const t3 = Math.min(1, (elapsed - FUSION_END) / EXPLOSION_FX_DURATION);
        if (t3 < 0.45) {
            const flashAlpha = Math.pow(1 - t3 / 0.45, 2) * 0.92;
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);
            ctx.restore();
        }
    }
}

function finishSupernova() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    supernovaState = null;
    pendingSupernova = null;
    slidingBlocks = [];
    blockAnimationRounds = [];
    currentRoundIndex = 0;

    // ステージ上のブロックを全て消去し、リセット状態にして再度ユーザーの配置ターンへ戻す
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    originalGrid = null;
    placedBlocksAtStart = 0;
    gameParticles.length = 0;

    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;
    statusBar.innerHTML = '<span class="status-place">ブロックを配置してください。</span>';
    if (hintText) hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
    updateBlockBadge(true);
    render();
}

// MARK: - Black Hole & Infinite Loop Sequence
function easeOutBounce(x) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) {
        return n1 * x * x;
    } else if (x < 2 / d1) {
        return n1 * (x -= 1.5 / d1) * x + 0.75;
    } else if (x < 2.5 / d1) {
        return n1 * (x -= 2.25 / d1) * x + 0.9375;
    } else {
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }
}

function initBlackHoleParticles(cx, cy) {
    blackHoleParticles = [];
    for (let i = 0; i < 54; i++) {
        blackHoleParticles.push({
            dist: 35 + Math.random() * 190,
            angle: Math.random() * Math.PI * 2,
            speed: 1.2 + Math.random() * 2.8,
            size: 1.5 + Math.random() * 3.2,
            color: (Math.random() < 0.45) ? '#c084fc' : (Math.random() < 0.75 ? '#38bdf8' : '#ffffff'),
            alpha: 0.35 + Math.random() * 0.65
        });
    }
}

function updateAndDrawBlackHoleParticles(ctx, cx, cy, bhRadius, elapsed) {
    if (bhRadius <= 0) return;
    blackHoleParticles.forEach(p => {
        p.dist -= p.speed * (0.85 + 32 / (p.dist + 12));
        p.angle += 0.08 + (3.6 / (p.dist * 0.12 + 1));
        if (p.dist <= bhRadius * 0.25) {
            p.dist = 120 + Math.random() * 90;
            p.angle = Math.random() * Math.PI * 2;
        }
        const px = cx + Math.cos(p.angle) * p.dist;
        const py = cy + Math.sin(p.angle) * p.dist;
        const fade = Math.min(1, p.dist / 30);
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * fade;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

const BLACKHOLE_UI_SELECTORS = [
    '.cloud',
    '#gameBackToHomeBtn',
    '#gameToSelectBtn',
    '#gameToEditorBtn',
    '.stage-nav-pill',
    '#helpBtn',
    '#answerBtn',
    '.status-wrap',
    '#statusBar',
    '#blockBadge',
    '#startBtn',
    '#resetBtn',
    '#legendWrap'
];

function resetBlackHoleUiStyles() {
    BLACKHOLE_UI_SELECTORS.forEach(sel => {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            el.style.transform = '';
            el.style.opacity = '';
            el.style.visibility = '';
            el.style.filter = '';
            el.style.pointerEvents = '';
            delete el._bhOrigCenter;
        });
    });
    if (document.body) {
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = '';
    }
    if (canvas) {
        canvas.style.cursor = '';
    }
}

function updateBlackHoleUiSuck(elapsed, midClientX, midClientY, suckStart = 3300, suckEnd = 4750) {
    if (elapsed < suckStart) return;

    if (document.body) {
        const bgT = Math.min(1, (elapsed - suckStart) / (suckEnd - suckStart));
        const skyA = Math.max(0, 1 - bgT);
        document.body.style.backgroundColor = '#060814';
        document.body.style.backgroundImage = `linear-gradient(180deg, rgba(92,148,252,${skyA}) 0%, rgba(92,148,252,${skyA}) 60%, rgba(139,188,255,${skyA}) 100%)`;
    }

    BLACKHOLE_UI_SELECTORS.forEach((sel, idx) => {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            if (el.style.display === 'none' || (typeof getComputedStyle === 'function' && getComputedStyle(el).display === 'none')) return;

            const itemStart = suckStart + idx * 80;
            const itemEnd = Math.min(suckEnd, itemStart + 650);

            if (elapsed < itemStart) {
                el.style.transform = '';
                el.style.opacity = '';
            } else if (elapsed < itemEnd) {
                const u = (elapsed - itemStart) / (itemEnd - itemStart);
                const ease = Math.pow(u, 2.2);

                if (!el._bhOrigCenter) {
                    const r = el.getBoundingClientRect();
                    el._bhOrigCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }

                const dx = (midClientX - el._bhOrigCenter.x) * ease;
                const dy = (midClientY - el._bhOrigCenter.y) * ease;
                const rot = ease * 380;
                const scale = Math.max(0, 1 - ease);
                const opacity = Math.max(0, 1 - Math.pow(u, 1.8));

                el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${rot}deg)`;
                el.style.opacity = opacity;
                el.style.pointerEvents = 'none';
            } else {
                el.style.transform = 'scale(0)';
                el.style.opacity = '0';
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
            }
        });
    });
}

// 吸収後、クリックを待たずに上空（-window.innerHeight）から重力落下・着地バウンドして定位置に復帰
function updateBlackHoleUiDrop(relDropT) {
    if (document.body) {
        const bgP = Math.min(1, relDropT / 700);
        document.body.style.backgroundColor = '#060814';
        document.body.style.backgroundImage = `linear-gradient(180deg, rgba(92,148,252,${bgP}) 0%, rgba(92,148,252,${bgP}) 60%, rgba(139,188,255,${bgP}) 100%)`;
    }

    const dropItems = [
        // 雲 (0ms 〜 700ms: 上空からふわっと降りてくる)
        { sel: '.cloud', start: 0, end: 700 },

        // ヘッダー群 (800ms 〜 1750ms: 上からドスンと落下着地)
        { sel: '#gameBackToHomeBtn', start: 800, end: 1250 },
        { sel: '#gameToSelectBtn', start: 900, end: 1350 },
        { sel: '#gameToEditorBtn', start: 1000, end: 1450 },
        { sel: '.stage-nav-pill', start: 1100, end: 1550 },
        { sel: '#helpBtn', start: 1200, end: 1650 },
        { sel: '#answerBtn', start: 1300, end: 1750 },

        // 右カラム群 (2400ms 〜 3950ms: 地面・ゴール・土管の着地後、順番にドスンドスンと落下)
        { sel: '.status-wrap', start: 2400, end: 2950 },
        { sel: '#statusBar', start: 2400, end: 2950 },
        { sel: '#blockBadge', start: 2650, end: 3200 },
        { sel: '#startBtn', start: 2900, end: 3450 },
        { sel: '#resetBtn', start: 3150, end: 3700 },
        { sel: '#legendWrap', start: 3400, end: 3950 }
    ];

    dropItems.forEach(item => {
        const els = document.querySelectorAll(item.sel);
        els.forEach(el => {
            const isHidden = el.style.display === 'none' || (typeof getComputedStyle === 'function' && getComputedStyle(el).display === 'none');
            if (item.sel === '#gameToEditorBtn' && isHidden) return;

            if (relDropT < item.start) {
                el.style.opacity = '0';
                el.style.visibility = 'hidden';
                el.style.transform = 'translateY(-120vh)';
            } else if (relDropT < item.end) {
                const u = (relDropT - item.start) / (item.end - item.start);
                const b = easeOutBounce(u);
                const curY = -window.innerHeight * (1 - b);
                const opacity = Math.min(1, u * 3.5);

                el.style.visibility = 'visible';
                el.style.opacity = opacity;
                el.style.transform = `translateY(${curY}px)`;
                el.style.pointerEvents = 'none';
            } else {
                el.style.visibility = 'visible';
                el.style.opacity = '1';
                el.style.transform = '';
                el.style.filter = '';
                el.style.pointerEvents = '';
                delete el._bhOrigCenter;
            }
        });
    });
}

// 連星ブラックホールのインスパイラル（Inspiral）から合体（Merger）を描画（GW190521 数値相対論シミュレーションの再現）
function drawBinaryBlackHoleSystem(ctx, x1, y1, r1, x2, y2, r2, midX, midY, u, elapsed, flash = 0) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    ctx.save();

    // 1. 重力波パルス波紋 (Chirp Wave Ripples: 相対論的インスパイラル重力波)
    if (dist > 8 && u > 0.05 && u < 1.0) {
        const rippleCount = 3;
        const chirpFactor = 1 + Math.pow(u, 2.5) * 3.5;
        for (let i = 0; i < rippleCount; i++) {
            const wavePhase = (elapsed * 0.12 * chirpFactor + i * 55) % 160;
            const waveRadius = Math.max(10, dist * 0.4 + wavePhase);
            const alpha = Math.max(0, (1 - wavePhase / 160) * 0.45 * Math.min(1, u * 2));
            ctx.strokeStyle = `rgba(147, 197, 253, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(midX, midY, waveRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // 2. 重力レンズ光輪 (Einstein Lensing Ring / Accretion Glow)
    const combinedR = (r1 + r2) * 1.25 + dist * 0.35;
    const lensGrad = ctx.createRadialGradient(midX, midY, Math.max(1, dist * 0.25), midX, midY, combinedR);
    lensGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    lensGrad.addColorStop(0.35, 'rgba(88, 28, 135, 0.75)');
    lensGrad.addColorStop(0.65, 'rgba(147, 197, 253, 0.4)');
    lensGrad.addColorStop(0.88, 'rgba(56, 189, 248, 0.18)');
    lensGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

    ctx.fillStyle = lensGrad;
    ctx.beginPath();
    ctx.arc(midX, midY, combinedR, 0, Math.PI * 2);
    ctx.fill();

    // 3. 事象の地平線 (Event Horizons: 接触時はダンベル型メタボール)
    ctx.fillStyle = '#000000';
    const contactThresh = (r1 + r2) * 1.18;

    if (dist < contactThresh && dist > 1) {
        // ダンベル型（ピーナッツ型）結合
        const normX = -Math.sin(angle);
        const normY = Math.cos(angle);
        const contactRatio = 1 - dist / contactThresh;
        const waist = Math.max(2, Math.min(r1, r2) * contactRatio * 0.85);

        ctx.beginPath();
        ctx.arc(x1, y1, r1, angle + Math.PI / 2, angle - Math.PI / 2, false);
        ctx.quadraticCurveTo(midX + normX * waist, midY + normY * waist, x2 + Math.cos(angle - Math.PI / 2) * r2, y2 + Math.sin(angle - Math.PI / 2) * r2);
        ctx.arc(x2, y2, r2, angle - Math.PI / 2, angle + Math.PI / 2, false);
        ctx.quadraticCurveTo(midX - normX * waist, midY - normY * waist, x1 + Math.cos(angle + Math.PI / 2) * r1, y1 + Math.sin(angle + Math.PI / 2) * r1);
        ctx.closePath();
        ctx.fill();

        // 輪郭のフォトンリング (鮮明な青白リング)
        ctx.strokeStyle = 'rgba(191, 219, 254, 0.9)';
        ctx.lineWidth = 2.0;
        ctx.stroke();
    } else {
        // 独立した2つのブラックホール
        ctx.beginPath();
        ctx.arc(x1, y1, r1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(191, 219, 254, 0.9)';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x2, y2, r2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(191, 219, 254, 0.9)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
    }

    // 4. マージフラッシュ（合体閃光）
    if (flash > 0.02) {
        const flashGrad = ctx.createRadialGradient(midX, midY, 0, midX, midY, (r1 + r2) * 2.8);
        flashGrad.addColorStop(0, `rgba(255, 255, 255, ${flash * 0.95})`);
        flashGrad.addColorStop(0.4, `rgba(192, 132, 252, ${flash * 0.8})`);
        flashGrad.addColorStop(0.75, `rgba(56, 189, 248, ${flash * 0.4})`);
        flashGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(midX, midY, (r1 + r2) * 2.8, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawSingleBlackHoleDisc(ctx, cx, cy, bhRadius, elapsed, customColor) {
    if (bhRadius <= 0) return;
    ctx.save();

    const grad = ctx.createRadialGradient(cx, cy, bhRadius * 0.25, cx, cy, bhRadius * 2.3);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.35, customColor || 'rgba(88, 28, 135, 0.92)');
    grad.addColorStop(0.6, 'rgba(147, 51, 234, 0.75)');
    grad.addColorStop(0.85, 'rgba(56, 189, 248, 0.4)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, bhRadius * 2.3, 0, Math.PI * 2);
    ctx.fill();

    const diskAngle = elapsed * 0.005;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(diskAngle);
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.strokeStyle = (i % 2 === 0) ? 'rgba(192, 132, 252, 0.45)' : 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = Math.max(1.5, bhRadius * 0.035);
        ctx.beginPath();
        ctx.ellipse(0, 0, bhRadius * 1.6, bhRadius * 0.75, a, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx, cy, bhRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, bhRadius * 0.033);
    ctx.beginPath();
    ctx.arc(cx, cy, bhRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function getSuckTransform(elapsed, suckStart, suckEnd, origX, origY, bhX, bhY) {
    if (elapsed < suckStart) {
        return { x: origX, y: origY, scale: 1, rotation: 0, alpha: 1, active: true, phase: 'idle' };
    }
    if (elapsed < suckEnd) {
        const u = (elapsed - suckStart) / (suckEnd - suckStart);
        const ease = Math.pow(u, 2.4);
        const curX = origX + (bhX - origX) * ease;
        const curY = origY + (bhY - origY) * ease;
        const rot = ease * Math.PI * 3.5;
        const scale = Math.max(0, 1 - ease);
        const alpha = Math.max(0, 1 - Math.pow(u, 2.2));
        return { x: curX, y: curY, scale, rotation: rot, alpha, active: true, phase: 'suck' };
    }
    return { x: bhX, y: bhY, scale: 0, rotation: 0, alpha: 0, active: false, phase: 'gone' };
}

function getObjectState(elapsed, suckStart, suckEnd, dropStart, dropEnd, origX, origY, bhX, bhY, topOffsetY = -340) {
    if (elapsed < suckStart) {
        return { x: origX, y: origY, scale: 1, rotation: 0, alpha: 1, active: true, phase: 'idle' };
    }
    if (elapsed < suckEnd) {
        return getSuckTransform(elapsed, suckStart, suckEnd, origX, origY, bhX, bhY);
    }
    if (elapsed < dropStart) {
        return { x: bhX, y: bhY, scale: 0, rotation: 0, alpha: 0, active: false, phase: 'gone' };
    }
    if (elapsed < dropEnd) {
        const u = (elapsed - dropStart) / (dropEnd - dropStart);
        const b = easeOutBounce(u);
        const curY = (origY + topOffsetY) + (-topOffsetY) * b;
        return { x: origX, y: curY, scale: 1, rotation: 0, alpha: 1, active: true, phase: 'drop' };
    }
    return { x: origX, y: origY, scale: 1, rotation: 0, alpha: 1, active: true, landed: true, phase: 'landed' };
}

function startBlackHole(loopDataOrList) {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    phase = 'blackhole';
    startBtn.disabled = true;

    // 単一・複数の正規化
    const rawLoops = Array.isArray(loopDataOrList) ? loopDataOrList : [loopDataOrList];
    const isMulti = rawLoops.length >= 2;
    const loopCount = rawLoops.length;

    // 合体中心（重心）
    const midCenterX = rawLoops.reduce((sum, l) => sum + l.centerX, 0) / loopCount;
    const midCenterY = rawLoops.reduce((sum, l) => sum + l.centerY, 0) / loopCount;

    const holes = rawLoops.map((l, idx) => {
        const dx = l.centerX - midCenterX;
        const dy = l.centerY - midCenterY;
        const initRadius = Math.sqrt(dx * dx + dy * dy);
        const initAngle = Math.atan2(dy, dx);
        return {
            id: l.id || (idx + 1),
            loopPath: l.loopPath,
            loopBlockOffsets: l.loopBlockOffsets,
            centerCol: l.centerCol,
            centerRow: l.centerRow,
            centerX: l.centerX,
            centerY: l.centerY,
            dx,
            dy,
            initRadius,
            initAngle,
            curX: l.centerX,
            curY: l.centerY
        };
    });

    const initialPlacedBlocks = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) {
                let foundLoopIdx = -1;
                let foundOffset = 0;
                for (let li = 0; li < holes.length; li++) {
                    const lData = holes[li];
                    const offsetObj = lData.loopBlockOffsets
                        ? lData.loopBlockOffsets.find(o => o.col === c && o.row === r)
                        : null;
                    if (offsetObj) {
                        foundLoopIdx = li;
                        foundOffset = offsetObj.loopOffset;
                        break;
                    }
                    const pathIdx = lData.loopPath ? lData.loopPath.findIndex(p => p.col === c && p.row === r) : -1;
                    if (pathIdx !== -1) {
                        foundLoopIdx = li;
                        foundOffset = pathIdx;
                        break;
                    }
                }
                initialPlacedBlocks.push({
                    col: c,
                    row: r,
                    isLoopBlock: (foundLoopIdx !== -1),
                    loopIndex: foundLoopIdx,
                    loopOffset: foundOffset
                });
            }
        }
    }

    const TM = (loopCount <= 2) ? 4000 : 5800;
    const DROP_BASE = TM + 5700;
    const totalDuration = DROP_BASE + 5300;

    const st = getStage();
    blackHoleState = {
        isMulti,
        holes,
        midCenterX,
        midCenterY,
        loopPath: holes[0].loopPath,
        centerCol: holes[0].centerCol,
        centerRow: holes[0].centerRow,
        centerX: holes[0].centerX,
        centerY: holes[0].centerY,
        startTime: performance.now(),
        placedBlocks: initialPlacedBlocks,
        gimmicks: [...st.gimmicks],
        landedImpacts: new Set(),
        totalDuration
    };

    holes.forEach(h => {
        initBlackHoleParticles(h.centerX, h.centerY);
    });

    if (statusBar) {
        statusBar.innerHTML = '<span class="status-place">•••••</span>';
    }
    if (hintText) {
        hintText.textContent = '';
    }

    animId = requestAnimationFrame(animateBlackHole);
}

function finishBlackHole() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    resetBlackHoleUiStyles();

    blackHoleState = null;
    pendingBlackHole = null;
    slidingBlocks = [];
    blockAnimationRounds = [];
    currentRoundIndex = 0;

    // ステージリセット（ブロックを全消去して再配置へ復帰）
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    originalGrid = null;
    placedBlocksAtStart = 0;
    gameParticles.length = 0;

    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;
    statusBar.innerHTML = '<span class="status-place">ブロックを配置してください。</span>';
    if (hintText) hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
    updateBlockBadge(true);
    render();
}

function animateBlackHole(ts) {
    if (!blackHoleState) return;
    if (phase !== 'blackhole') return;

    const now = ts || performance.now();
    const elapsed = Math.max(0, now - blackHoleState.startTime);

    if (blackHoleState.isMulti) {
        renderMultiBlackHoleState(elapsed);
        if (elapsed >= blackHoleState.totalDuration) {
            finishBlackHole();
            return;
        }
    } else {
        // 単一ブラックホール時（従来のフロー）
        renderBlackHoleState(elapsed);
        if (elapsed >= 7900) {
            finishBlackHole();
            return;
        }
    }

    animId = requestAnimationFrame(animateBlackHole);
}

function drawPostMergedBlackHole(ctx, elapsed, midX, midY, TM, maxMergedRadius, collapseStart, collapseEnd) {
    let r = maxMergedRadius;
    let flash = 0;

    if (elapsed < TM + 180) {
        const t = (elapsed - TM) / 180;
        flash = 1 - t;
        r = 60 + (maxMergedRadius - 60) * t;
    } else if (elapsed < collapseStart) {
        const ringT = (elapsed - (TM + 180)) / 1000;
        const decay = Math.exp(-ringT * 1.5);
        r = maxMergedRadius + Math.sin(elapsed * 0.016) * 3.5 * decay;
    } else if (elapsed < collapseEnd) {
        const t = (elapsed - collapseStart) / (collapseEnd - collapseStart);
        r = Math.max(0, maxMergedRadius * Math.pow(1 - t, 2.5));
    } else {
        r = 0;
    }

    if (r > 0) {
        drawSingleBlackHoleDisc(ctx, midX, midY, r, elapsed, 'rgba(126, 34, 206, 0.95)');
    }

    if (flash > 0.05) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.85})`;
        ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);
        ctx.restore();
    }
}

// 階層的連星ブラックホール（Hierarchical Binary Merger）シミュレーション
function renderHierarchicalBinaryBlackHoles(ctx, elapsed, holes, midX, midY, T_GENESIS, TM, BH_COLLAPSE_START, BH_COLLAPSE_END) {
    const K = holes.length;
    const maxMergedRadius = Math.round(60 * Math.min(2.0, Math.sqrt(K)));

    if (elapsed < T_GENESIS) {
        holes.forEach(h => {
            h.curX = h.centerX;
            h.curY = h.centerY;
            h.curRadius = 0;
        });
        return;
    }

    if (K <= 2) {
        // 2天体: 連星インスパイラル（公転チャープ加速・軌道収縮・ダンベル型接触融合）
        const h0 = holes[0];
        const h1 = holes[1];
        const T_SPIRAL = 1600;

        if (elapsed < T_SPIRAL) {
            const t = (elapsed - T_GENESIS) / (T_SPIRAL - T_GENESIS);
            const r = 45 * Math.pow(t, 1.4);
            h0.curX = h0.centerX; h0.curY = h0.centerY; h0.curRadius = r;
            h1.curX = h1.centerX; h1.curY = h1.centerY; h1.curRadius = r;
            drawSingleBlackHoleDisc(ctx, h0.curX, h0.curY, r, elapsed);
            drawSingleBlackHoleDisc(ctx, h1.curX, h1.curY, r, elapsed);
        } else if (elapsed < TM) {
            const u = (elapsed - T_SPIRAL) / (TM - T_SPIRAL);
            const dTheta = 4.6 * Math.PI * (1 - Math.pow(1 - u, 2.2));
            const rRatio = Math.max(0, Math.pow(1 - u, 0.82));

            const curR0 = h0.initRadius * rRatio;
            const curR1 = h1.initRadius * rRatio;
            const a0 = h0.initAngle + dTheta;
            const a1 = h1.initAngle + dTheta;

            h0.curX = midX + Math.cos(a0) * curR0;
            h0.curY = midY + Math.sin(a0) * curR0;
            h0.curRadius = 45;

            h1.curX = midX + Math.cos(a1) * curR1;
            h1.curY = midY + Math.sin(a1) * curR1;
            h1.curRadius = 45;

            const flash = (u > 0.94) ? (u - 0.94) / 0.06 : 0;
            drawBinaryBlackHoleSystem(ctx, h0.curX, h0.curY, 45, h1.curX, h1.curY, 45, midX, midY, u, elapsed, flash);
        } else {
            h0.curX = midX; h0.curY = midY;
            h1.curX = midX; h1.curY = midY;
            drawPostMergedBlackHole(ctx, elapsed, midX, midY, TM, maxMergedRadius, BH_COLLAPSE_START, BH_COLLAPSE_END);
        }
    } else if (K === 3) {
        // 3天体: 任意の2つ (h0, h1) を第1段階で合体させ、残りの1つ (h2) と第2段階で合体
        const h0 = holes[0];
        const h1 = holes[1];
        const h2 = holes[2];

        const T_S1_START = 1600;
        const T_S1_END = 3600;
        const T_S2_START = 3600;

        const mAx = (h0.centerX + h1.centerX) / 2;
        const mAy = (h0.centerY + h1.centerY) / 2;
        const rA0 = Math.hypot(h0.centerX - mAx, h0.centerY - mAy);
        const angA0 = Math.atan2(h0.centerY - mAy, h0.centerX - mAx);
        const angA1 = Math.atan2(h1.centerY - mAy, h1.centerX - mAx);

        if (elapsed < T_S1_START) {
            const t = (elapsed - T_GENESIS) / (T_S1_START - T_GENESIS);
            const r = 45 * Math.pow(t, 1.4);
            holes.forEach(h => {
                h.curX = h.centerX; h.curY = h.centerY; h.curRadius = r;
                drawSingleBlackHoleDisc(ctx, h.curX, h.curY, r, elapsed);
            });
        } else if (elapsed < T_S1_END) {
            const u1 = (elapsed - T_S1_START) / (T_S1_END - T_S1_START);
            const dTheta = 4.2 * Math.PI * (1 - Math.pow(1 - u1, 2.2));
            const rRatio = Math.max(0, Math.pow(1 - u1, 0.85));

            h0.curX = mAx + Math.cos(angA0 + dTheta) * (rA0 * rRatio);
            h0.curY = mAy + Math.sin(angA0 + dTheta) * (rA0 * rRatio);
            h0.curRadius = 45;

            h1.curX = mAx + Math.cos(angA1 + dTheta) * (rA0 * rRatio);
            h1.curY = mAy + Math.sin(angA1 + dTheta) * (rA0 * rRatio);
            h1.curRadius = 45;

            h2.curX = h2.centerX;
            h2.curY = h2.centerY;
            h2.curRadius = 45;

            const flash1 = (u1 > 0.93) ? (u1 - 0.93) / 0.07 : 0;
            drawBinaryBlackHoleSystem(ctx, h0.curX, h0.curY, 45, h1.curX, h1.curY, 45, mAx, mAy, u1, elapsed, flash1);
            drawSingleBlackHoleDisc(ctx, h2.curX, h2.curY, 45, elapsed);
        } else if (elapsed < TM) {
            const u2 = (elapsed - T_S2_START) / (TM - T_S2_START);
            const dTheta = 4.4 * Math.PI * (1 - Math.pow(1 - u2, 2.2));
            const rRatio = Math.max(0, Math.pow(1 - u2, 0.85));

            const rMid_mA = Math.hypot(mAx - midX, mAy - midY);
            const rMid_h2 = Math.hypot(h2.centerX - midX, h2.centerY - midY);
            const angMid_mA = Math.atan2(mAy - midY, mAx - midX);
            const angMid_h2 = Math.atan2(h2.centerY - midY, h2.centerX - midX);

            const curX_mA = midX + Math.cos(angMid_mA + dTheta) * (rMid_mA * rRatio);
            const curY_mA = midY + Math.sin(angMid_mA + dTheta) * (rMid_mA * rRatio);
            const curX_h2 = midX + Math.cos(angMid_h2 + dTheta) * (rMid_h2 * rRatio);
            const curY_h2 = midY + Math.sin(angMid_h2 + dTheta) * (rMid_h2 * rRatio);

            h0.curX = curX_mA; h0.curY = curY_mA;
            h1.curX = curX_mA; h1.curY = curY_mA;
            h2.curX = curX_h2; h2.curY = curY_h2;

            const flash2 = (u2 > 0.94) ? (u2 - 0.94) / 0.06 : 0;
            drawBinaryBlackHoleSystem(ctx, curX_mA, curY_mA, 64, curX_h2, curY_h2, 45, midX, midY, u2, elapsed, flash2);
        } else {
            holes.forEach(h => { h.curX = midX; h.curY = midY; });
            drawPostMergedBlackHole(ctx, elapsed, midX, midY, TM, maxMergedRadius, BH_COLLAPSE_START, BH_COLLAPSE_END);
        }
    } else {
        // 4天体以上: ペアA (h0, h1) とペアB (h2, h3) が第1段階で並行合体し、第2段階で中間天体同士が合体
        const h0 = holes[0], h1 = holes[1], h2 = holes[2], h3 = holes[3];
        const T_S1_START = 1600;
        const T_S1_END = 3600;
        const T_S2_START = 3600;

        const mAx = (h0.centerX + h1.centerX) / 2, mAy = (h0.centerY + h1.centerY) / 2;
        const mBx = (h2.centerX + h3.centerX) / 2, mBy = (h2.centerY + h3.centerY) / 2;

        const rA0 = Math.hypot(h0.centerX - mAx, h0.centerY - mAy);
        const angA0 = Math.atan2(h0.centerY - mAy, h0.centerX - mAx);
        const angA1 = Math.atan2(h1.centerY - mAy, h1.centerX - mAx);

        const rB0 = Math.hypot(h2.centerX - mBx, h2.centerY - mBy);
        const angB0 = Math.atan2(h2.centerY - mBy, h2.centerX - mBx);
        const angB1 = Math.atan2(h3.centerY - mBy, h3.centerX - mBx);

        if (elapsed < T_S1_START) {
            const t = (elapsed - T_GENESIS) / (T_S1_START - T_GENESIS);
            const r = 45 * Math.pow(t, 1.4);
            holes.forEach(h => {
                h.curX = h.centerX; h.curY = h.centerY; h.curRadius = r;
                drawSingleBlackHoleDisc(ctx, h.curX, h.curY, r, elapsed);
            });
        } else if (elapsed < T_S1_END) {
            const u1 = (elapsed - T_S1_START) / (T_S1_END - T_S1_START);
            const dTheta = 4.2 * Math.PI * (1 - Math.pow(1 - u1, 2.2));
            const rRatio = Math.max(0, Math.pow(1 - u1, 0.85));

            h0.curX = mAx + Math.cos(angA0 + dTheta) * (rA0 * rRatio);
            h0.curY = mAy + Math.sin(angA0 + dTheta) * (rA0 * rRatio);
            h1.curX = mAx + Math.cos(angA1 + dTheta) * (rA0 * rRatio);
            h1.curY = mAy + Math.sin(angA1 + dTheta) * (rA0 * rRatio);

            h2.curX = mBx + Math.cos(angB0 + dTheta) * (rB0 * rRatio);
            h2.curY = mBy + Math.sin(angB0 + dTheta) * (rB0 * rRatio);
            h3.curX = mBx + Math.cos(angB1 + dTheta) * (rB0 * rRatio);
            h3.curY = mBy + Math.sin(angB1 + dTheta) * (rB0 * rRatio);

            const flash1 = (u1 > 0.93) ? (u1 - 0.93) / 0.07 : 0;
            drawBinaryBlackHoleSystem(ctx, h0.curX, h0.curY, 45, h1.curX, h1.curY, 45, mAx, mAy, u1, elapsed, flash1);
            drawBinaryBlackHoleSystem(ctx, h2.curX, h2.curY, 45, h3.curX, h3.curY, 45, mBx, mBy, u1, elapsed, flash1);
        } else if (elapsed < TM) {
            const u2 = (elapsed - T_S2_START) / (TM - T_S2_START);
            const dTheta = 4.4 * Math.PI * (1 - Math.pow(1 - u2, 2.2));
            const rRatio = Math.max(0, Math.pow(1 - u2, 0.85));

            const rMid_mA = Math.hypot(mAx - midX, mAy - midY);
            const rMid_mB = Math.hypot(mBx - midX, mBy - midY);
            const angMid_mA = Math.atan2(mAy - midY, mAx - midX);
            const angMid_mB = Math.atan2(mBy - midY, mBx - midX);

            const curX_mA = midX + Math.cos(angMid_mA + dTheta) * (rMid_mA * rRatio);
            const curY_mA = midY + Math.sin(angMid_mA + dTheta) * (rMid_mA * rRatio);
            const curX_mB = midX + Math.cos(angMid_mB + dTheta) * (rMid_mB * rRatio);
            const curY_mB = midY + Math.sin(angMid_mB + dTheta) * (rMid_mB * rRatio);

            h0.curX = curX_mA; h0.curY = curY_mA;
            h1.curX = curX_mA; h1.curY = curY_mA;
            h2.curX = curX_mB; h2.curY = curY_mB;
            h3.curX = curX_mB; h3.curY = curY_mB;

            const flash2 = (u2 > 0.94) ? (u2 - 0.94) / 0.06 : 0;
            drawBinaryBlackHoleSystem(ctx, curX_mA, curY_mA, 64, curX_mB, curY_mB, 64, midX, midY, u2, elapsed, flash2);
        } else {
            holes.forEach(h => { h.curX = midX; h.curY = midY; });
            drawPostMergedBlackHole(ctx, elapsed, midX, midY, TM, maxMergedRadius, BH_COLLAPSE_START, BH_COLLAPSE_END);
        }
    }
}

function renderMultiBlackHoleState(elapsed) {
    const st = getStage();
    const bhState = blackHoleState;
    if (!bhState) return;

    const midX = bhState.midCenterX;
    const midY = bhState.midCenterY;
    const holes = bhState.holes;
    const K = holes.length;

    // タイムライン定数（ゆっくり丁寧に演出）
    const TM = (K <= 2) ? 4000 : 5800;
    const T_GENESIS = 1000;
    const T_half = 600;

    const SUCK_BLOCKS_START = TM + 700, SUCK_BLOCKS_END = TM + 1400;
    const SUCK_ARROWS_START = TM + 1200, SUCK_ARROWS_END = TM + 1900;
    const SUCK_MAN_START = TM + 1700, SUCK_MAN_END = TM + 2400;
    const SUCK_PIPE_START = TM + 2200, SUCK_PIPE_END = TM + 2900;
    const SUCK_GOAL_START = TM + 2700, SUCK_GOAL_END = TM + 3400;
    const SUCK_GROUND_START = TM + 2300, SUCK_GROUND_END = TM + 3900;
    const SUCK_UI_START = TM + 1200, SUCK_UI_END = TM + 3900;
    const BH_COLLAPSE_START = TM + 3900, BH_COLLAPSE_END = TM + 4700;

    const DROP_BASE = TM + 5700;
    const DROP_GROUND_START = DROP_BASE + 400, DROP_GROUND_END = DROP_BASE + 1100;
    const DROP_GOAL_START = DROP_BASE + 1400, DROP_GOAL_END = DROP_BASE + 2100;
    const DROP_PIPE_START = DROP_BASE + 2000, DROP_PIPE_END = DROP_BASE + 2700;
    const DROP_MAN_START = DROP_BASE + 3200, DROP_MAN_END = DROP_BASE + 4000;
    const DROP_ARROWS_START = DROP_BASE + 3800, DROP_ARROWS_END = DROP_BASE + 4600;

    // カメラの揺れ（Screen Shake）
    let shakeAmp = 0;
    if (elapsed >= 1600 && elapsed < TM) {
        const t = (elapsed - 1600) / (TM - 1600);
        shakeAmp = 1.5 + t * 5.5;
    } else if (elapsed >= TM && elapsed < TM + 250) {
        shakeAmp = 10.0;
    } else if (elapsed >= TM + 250 && elapsed < BH_COLLAPSE_START) {
        shakeAmp = 5.0;
    } else if (elapsed >= BH_COLLAPSE_START && elapsed < BH_COLLAPSE_END) {
        const t = (elapsed - BH_COLLAPSE_START) / (BH_COLLAPSE_END - BH_COLLAPSE_START);
        shakeAmp = 5.0 * (1 - t);
    } else if (elapsed >= DROP_GROUND_END - 60 && elapsed < DROP_GROUND_END + 250) {
        const t = (elapsed - (DROP_GROUND_END - 60)) / 310;
        shakeAmp = 6.0 * (1 - t);
    }

    const shakeX = shakeAmp > 0 ? (Math.sin(elapsed * 0.09) * 0.7 + Math.sin(elapsed * 0.21) * 0.3) * shakeAmp : 0;
    const shakeY = shakeAmp > 0 ? (Math.cos(elapsed * 0.1) * 0.7 + Math.cos(elapsed * 0.18) * 0.3) * shakeAmp : 0;

    // 着地土煙トリガー
    const triggerImpact = (key, callback) => {
        if (!bhState.landedImpacts.has(key)) {
            bhState.landedImpacts.add(key);
            callback();
        }
    };
    if (elapsed >= DROP_GROUND_END) {
        triggerImpact('ground', () => {
            spawnDust(0, st.startRow);
            spawnDust(COLS - 1, st.goalRow);
        });
    }
    if (elapsed >= DROP_GOAL_END) {
        triggerImpact('goal', () => { spawnDust(COLS, st.goalRow); });
    }
    if (elapsed >= DROP_PIPE_END) {
        triggerImpact('pipe', () => { spawnDust(-1.5, st.startRow); });
    }
    if (elapsed >= DROP_MAN_END) {
        triggerImpact('man', () => { spawnDust(-1.5, st.startRow); });
    }

    // UI群の吸引 / 上空からの自動落下更新
    if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const sx = canvasRect.width / TOTAL_W;
        const sy = canvasRect.height / TOTAL_H;
        const midClientX = canvasRect.left + midX * sx;
        const midClientY = canvasRect.top + midY * sy;

        if (elapsed >= DROP_BASE) {
            updateBlackHoleUiDrop(elapsed - DROP_BASE);
        } else {
            updateBlackHoleUiSuck(elapsed, midClientX, midClientY, SUCK_UI_START, SUCK_UI_END);
        }
    }

    // ループ進行計算
    const primaryHole = holes[0];
    const loopPath = primaryHole.loopPath;
    const N = loopPath.length;
    const halfN = N / 2;
    let loopS = 0;

    if (elapsed < T_half) {
        loopS = (halfN / T_half) * elapsed;
    } else {
        const dtSec = (elapsed - T_half) / 1000;
        const v0 = halfN / 0.5;
        const k = 2.2;
        loopS = halfN + (v0 / k) * (Math.exp(k * dtSec) - 1);
    }

    const getHoleLoopCoord = (holeData, sVal) => {
        const lp = holeData.loopPath;
        const lN = lp.length;
        const modS = ((sVal % lN) + lN) % lN;
        const idx = Math.floor(modS);
        const sub = modS - idx;
        const p0 = lp[idx];
        const p1 = lp[(idx + 1) % lN];
        return {
            col: p0.col + (p1.col - p0.col) * sub,
            row: p0.row + (p1.row - p0.row) * sub
        };
    };

    // レンダリング開始
    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);

    let skyAlpha = 1;
    if (elapsed >= BH_COLLAPSE_START && elapsed < DROP_BASE) {
        skyAlpha = Math.max(0, 1 - (elapsed - BH_COLLAPSE_START) / (BH_COLLAPSE_END - BH_COLLAPSE_START));
    } else if (elapsed >= DROP_BASE) {
        skyAlpha = Math.min(1, (elapsed - DROP_BASE) / 700);
    }
    if (skyAlpha < 1) {
        ctx.save();
        ctx.fillStyle = `rgba(6, 8, 20, ${1 - skyAlpha})`;
        ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);
        ctx.restore();
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 1. 地面 (Ground) の描画
    const startGroundY = GY + (st.startRow + 1) * CELL;
    const goalGroundY = GY + (st.goalRow + 1) * CELL;
    const leftGroundOrigX = GX / 2;
    const leftGroundOrigY = (startGroundY + TOTAL_H) / 2;
    const rightGroundOrigX = (GX + COLS * CELL + TOTAL_W) / 2;
    const rightGroundOrigY = (goalGroundY + TOTAL_H) / 2;

    if (elapsed < SUCK_GROUND_START) {
        drawGroundLeft();
        drawGroundRight();
        drawGroundPit();
    } else if (elapsed < SUCK_GROUND_END) {
        drawGroundSuckPieces(elapsed, SUCK_GROUND_START, SUCK_GROUND_END, midX, midY);
    } else if (elapsed >= DROP_GROUND_START) {
        const leftGrState = getObjectState(elapsed, SUCK_GROUND_START, SUCK_GROUND_END, DROP_GROUND_START, DROP_GROUND_END, leftGroundOrigX, leftGroundOrigY, midX, midY);
        const rightGrState = getObjectState(elapsed, SUCK_GROUND_START + 80, SUCK_GROUND_END, DROP_GROUND_START, DROP_GROUND_END, rightGroundOrigX, rightGroundOrigY, midX, midY);

        if (leftGrState.active) {
            ctx.save();
            ctx.translate(leftGrState.x, leftGrState.y);
            if (leftGrState.rotation) ctx.rotate(leftGrState.rotation);
            if (leftGrState.scale !== 1) ctx.scale(leftGrState.scale, leftGrState.scale);
            if (leftGrState.alpha < 1) ctx.globalAlpha *= leftGrState.alpha;
            ctx.translate(-leftGroundOrigX, -leftGroundOrigY);
            drawGroundLeft();
            ctx.restore();
        }

        if (rightGrState.active) {
            ctx.save();
            ctx.translate(rightGrState.x, rightGrState.y);
            if (rightGrState.rotation) ctx.rotate(rightGrState.rotation);
            if (rightGrState.scale !== 1) ctx.scale(rightGrState.scale, rightGrState.scale);
            if (rightGrState.alpha < 1) ctx.globalAlpha *= rightGrState.alpha;
            ctx.translate(-rightGroundOrigX, -rightGroundOrigY);
            drawGroundRight();
            ctx.restore();
        }

        if (leftGrState.active && rightGrState.active && leftGrState.scale === 1 && rightGrState.scale === 1) {
            drawGroundPit();
        }
    }

    // 2. グリッド線・天井
    if (elapsed < SUCK_GROUND_START || elapsed >= DROP_GROUND_END) {
        ctx.save();
        ctx.fillStyle = 'rgba(100,150,255,0.06)';
        ctx.fillRect(GX, GY, COLS * CELL, ROWS * CELL);
        drawGridLines();
        drawCeiling();
        st.forbidden.forEach(f => drawForbiddenTile(f.col, f.row));
        ctx.restore();
    }

    // 3. ゴール (Goal)
    const goalBx = GX + COLS * CELL;
    const goalBy = GY + st.goalRow * CELL;
    const goalOrigX = goalBx + 28;
    const goalOrigY = goalBy + CELL / 2;
    const goalState = getObjectState(elapsed, SUCK_GOAL_START, SUCK_GOAL_END, DROP_GOAL_START, DROP_GOAL_END, goalOrigX, goalOrigY, midX, midY);
    if (goalState.active) {
        ctx.save();
        ctx.translate(goalState.x, goalState.y);
        if (goalState.rotation) ctx.rotate(goalState.rotation);
        if (goalState.scale !== 1) ctx.scale(goalState.scale, goalState.scale);
        if (goalState.alpha < 1) ctx.globalAlpha *= goalState.alpha;
        ctx.translate(-goalOrigX, -goalOrigY);
        drawGoal();
        ctx.restore();
    }

    // 4. 土管 (Pipe)
    const pipeOrigX = GX - 48;
    const pipeOrigY = GY + (st.startRow + 0.5) * CELL;
    const pipeState = getObjectState(elapsed, SUCK_PIPE_START, SUCK_PIPE_END, DROP_PIPE_START, DROP_PIPE_END, pipeOrigX, pipeOrigY, midX, midY);
    if (pipeState.active) {
        ctx.save();
        ctx.translate(pipeState.x, pipeState.y);
        if (pipeState.rotation) ctx.rotate(pipeState.rotation);
        if (pipeState.scale !== 1) ctx.scale(pipeState.scale, pipeState.scale);
        if (pipeState.alpha < 1) ctx.globalAlpha *= pipeState.alpha;
        ctx.translate(-pipeOrigX, -pipeOrigY);
        drawPipe();
        ctx.restore();
    }

    // 5. 矢印ギミック (Gimmicks)
    st.gimmicks.forEach(g => {
        const arrowOrigX = GX + (g.col + 0.5) * CELL;
        const arrowOrigY = GY + (g.row + 0.5) * CELL;
        const arrowState = getObjectState(elapsed, SUCK_ARROWS_START, SUCK_ARROWS_END, DROP_ARROWS_START, DROP_ARROWS_END, arrowOrigX, arrowOrigY, midX, midY);
        if (arrowState.active) {
            ctx.save();
            ctx.translate(arrowState.x, arrowState.y);
            if (arrowState.rotation) ctx.rotate(arrowState.rotation);
            if (arrowState.scale !== 1) ctx.scale(arrowState.scale, arrowState.scale);
            if (arrowState.alpha < 1) ctx.globalAlpha *= arrowState.alpha;
            ctx.translate(-arrowOrigX, -arrowOrigY);
            drawGimmickTile(g);
            ctx.restore();
        }
    });

    // 6. ブロック (Blocks) の描画
    if (elapsed < SUCK_BLOCKS_START) {
        bhState.placedBlocks.forEach(b => {
            if (b.isLoopBlock && b.loopIndex >= 0 && b.loopIndex < holes.length) {
                const targetHole = holes[b.loopIndex];
                const s_b = loopS + b.loopOffset;
                const curCoord = getHoleLoopCoord(targetHole, s_b);

                const offsetX = targetHole.curX - targetHole.centerX;
                const offsetY = targetHole.curY - targetHole.centerY;
                const bX = GX + (curCoord.col + 0.5) * CELL + offsetX;
                const bY = GY + (curCoord.row + 0.5) * CELL + offsetY;

                ctx.save();
                ctx.translate(bX - (GX + (curCoord.col + 0.5) * CELL), bY - (GY + (curCoord.row + 0.5) * CELL));
                drawMarioBlock(curCoord.col, curCoord.row);
                ctx.restore();
            } else {
                drawMarioBlock(b.col, b.row);
            }
        });
    } else if (elapsed < SUCK_BLOCKS_END) {
        bhState.placedBlocks.forEach(b => {
            let bOrigX = GX + (b.col + 0.5) * CELL;
            let bOrigY = GY + (b.row + 0.5) * CELL;
            let curCoordAtSuck = null;

            if (b.isLoopBlock && b.loopIndex >= 0 && b.loopIndex < holes.length) {
                const targetHole = holes[b.loopIndex];
                const dtSecSuck = (SUCK_BLOCKS_START - T_half) / 1000;
                const v0 = halfN / 0.5;
                const k = 2.2;
                const loopSAtSuck = halfN + (v0 / k) * (Math.exp(k * dtSecSuck) - 1);
                const s_b_suck = loopSAtSuck + b.loopOffset;
                curCoordAtSuck = getHoleLoopCoord(targetHole, s_b_suck);
                bOrigX = GX + (curCoordAtSuck.col + 0.5) * CELL;
                bOrigY = GY + (curCoordAtSuck.row + 0.5) * CELL;
            }

            const bState = getSuckTransform(elapsed, SUCK_BLOCKS_START, SUCK_BLOCKS_END, bOrigX, bOrigY, midX, midY);
            if (bState.active) {
                const drawCol = (b.isLoopBlock && curCoordAtSuck) ? curCoordAtSuck.col : b.col;
                const drawRow = (b.isLoopBlock && curCoordAtSuck) ? curCoordAtSuck.row : b.row;
                const targetCx = GX + (drawCol + 0.5) * CELL;
                const targetCy = GY + (drawRow + 0.5) * CELL;

                ctx.save();
                ctx.translate(bState.x, bState.y);
                if (bState.rotation) ctx.rotate(bState.rotation);
                if (bState.scale !== 1) ctx.scale(bState.scale, bState.scale);
                if (bState.alpha < 1) ctx.globalAlpha *= bState.alpha;
                ctx.translate(-targetCx, -targetCy);
                drawMarioBlock(drawCol, drawRow);
                ctx.restore();
            }
        });
    }

    // 7. キャラクター (Stickman)
    const manOrigX = GX + (-1.5 + 0.5) * CELL;
    const manOrigY = GY + (st.startRow + 0.5) * CELL;
    const manState = getObjectState(elapsed, SUCK_MAN_START, SUCK_MAN_END, DROP_MAN_START, DROP_MAN_END, manOrigX, manOrigY, midX, midY);
    if (manState.active) {
        ctx.save();
        ctx.translate(manState.x, manState.y);
        if (manState.rotation) ctx.rotate(manState.rotation);
        if (manState.scale !== 1) ctx.scale(manState.scale, manState.scale);
        if (manState.alpha < 1) ctx.globalAlpha *= manState.alpha;
        ctx.translate(-manOrigX, -manOrigY);

        if (elapsed >= 1600 && elapsed < SUCK_MAN_START) {
            const jitterX = Math.sin(elapsed * 0.15) * 2.0;
            ctx.translate(jitterX, 0);
            drawStickman(-1.5, st.startRow);
        } else {
            drawStickman(-1.5, st.startRow);
        }
        ctx.restore();
    }

    // 8. 階層的連星ブラックホール（Hierarchical Binary Merger）の描画
    renderHierarchicalBinaryBlackHoles(ctx, elapsed, holes, midX, midY, T_GENESIS, TM, BH_COLLAPSE_START, BH_COLLAPSE_END);

    // 9. パーティクル
    updateAndDrawParticles(ctx);

    ctx.restore();
}

function renderBlackHoleState(elapsed) {
    const st = getStage();
    const bhState = blackHoleState;
    if (!bhState) return;

    const cx = bhState.centerX;
    const cy = bhState.centerY;

    // --- タイムライン定義 ---
    // 吸引順: ブロック → 矢印 → キャラクター → 土管 → ゴール → 地面
    // 地面（レンガ・芝片）はプレイヤー吸引（3650ms）〜 ゴール吸引終了+0.3秒後（4650ms）に流れるように吸引
    const SUCK_BLOCKS_START = 2500, SUCK_BLOCKS_END = 2950;
    const SUCK_ARROWS_START = 2850, SUCK_ARROWS_END = 3300;
    const SUCK_MAN_START = 3200, SUCK_MAN_END = 3650;
    const SUCK_PIPE_START = 3550, SUCK_PIPE_END = 4000;
    const SUCK_GOAL_START = 3900, SUCK_GOAL_END = 4350;
    const SUCK_GROUND_START = 3650, SUCK_GROUND_END = 4650;

    // 落下出現順 (反対の順): 地面 → ゴール → 土管 → キャラクター → 矢印（ステージリセットのためブロックは再出現しない）
    const DROP_GROUND_START = 5750, DROP_GROUND_END = 6200;
    const DROP_GOAL_START = 6150, DROP_GOAL_END = 6550;
    const DROP_PIPE_START = 6500, DROP_PIPE_END = 6900;
    const DROP_MAN_START = 6850, DROP_MAN_END = 7350;
    const DROP_ARROWS_START = 7300, DROP_ARROWS_END = 7700;

    // --- カメラ揺れ（Screen Shake）---
    let shakeAmp = 0;
    if (elapsed >= 2200 && elapsed < 4250) {
        shakeAmp = ((elapsed - 2200) / 2050) * 5.0;
    } else if (elapsed >= 4250 && elapsed < 5000) {
        shakeAmp = 5.0 + ((elapsed - 4250) / 750) * 3.8;
    } else if (elapsed >= 5000 && elapsed < 5400) {
        shakeAmp = 8.8 * (1 - (elapsed - 5000) / 400);
    } else if (elapsed >= DROP_GROUND_END - 50 && elapsed < DROP_GROUND_END + 200) {
        const pt = (elapsed - (DROP_GROUND_END - 50)) / 250;
        shakeAmp = 5.5 * (1 - pt);
    }

    let shakeX = 0, shakeY = 0;
    if (shakeAmp > 0) {
        shakeX = (Math.sin(elapsed * 0.08) * 0.7 + Math.sin(elapsed * 0.19) * 0.3) * shakeAmp;
        shakeY = (Math.cos(elapsed * 0.09) * 0.7 + Math.cos(elapsed * 0.17) * 0.3) * shakeAmp;
    }

    // --- 着地衝撃土煙トリガー ---
    const triggerImpact = (key, callback) => {
        if (!bhState.landedImpacts.has(key)) {
            bhState.landedImpacts.add(key);
            callback();
        }
    };
    if (elapsed >= DROP_GROUND_END) {
        triggerImpact('ground', () => {
            spawnDust(0, st.startRow);
            spawnDust(COLS - 1, st.goalRow);
        });
    }
    if (elapsed >= DROP_GOAL_END) {
        triggerImpact('goal', () => { spawnDust(COLS, st.goalRow); });
    }
    if (elapsed >= DROP_PIPE_END) {
        triggerImpact('pipe', () => { spawnDust(-1.5, st.startRow); });
    }
    if (elapsed >= DROP_MAN_END) {
        triggerImpact('man', () => { spawnDust(-1.5, st.startRow); });
    }

    // --- ブラックホールのサイズ ---
    let bhRadius = 0;
    if (elapsed >= 1900 && elapsed < 2700) {
        const t = (elapsed - 1900) / 800;
        bhRadius = 60 * Math.pow(t, 1.8);
    } else if (elapsed >= 2700 && elapsed < 5000) {
        bhRadius = 60 + Math.sin(elapsed * 0.01) * 2.5;
    } else if (elapsed >= 5000 && elapsed < 5400) {
        const t = (elapsed - 5000) / 400;
        bhRadius = Math.max(0, 60 * Math.pow(1 - t, 2));
    }

    // --- ループ回転の進行マス数 (s) の計算 ---
    const loopPath = bhState.loopPath;
    const N = loopPath.length;
    const halfN = N / 2;
    const T_half = 500;
    let loopS = 0;
    let loopSpeed = 1;

    if (elapsed < T_half) {
        loopS = (halfN / T_half) * elapsed;
        loopSpeed = 1;
    } else {
        const dtSec = (elapsed - T_half) / 1000;
        const v0 = halfN / 0.5; // マス/秒
        const k = 2.2;
        loopS = halfN + (v0 / k) * (Math.exp(k * dtSec) - 1);
        loopSpeed = Math.exp(k * dtSec);
    }

    const getLoopCoord = (sVal) => {
        const modS = ((sVal % N) + N) % N;
        const idx = Math.floor(modS);
        const sub = modS - idx;
        const p0 = loopPath[idx];
        const p1 = loopPath[(idx + 1) % N];
        return {
            col: p0.col + (p1.col - p0.col) * sub,
            row: p0.row + (p1.row - p0.row) * sub
        };
    };

    // --- レンダリング開始 ---
    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);
    drawBackground();

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 1. 地面 (Ground) の描画
    const startGroundY = GY + (st.startRow + 1) * CELL;
    const goalGroundY = GY + (st.goalRow + 1) * CELL;
    const leftGroundOrigX = GX / 2;
    const leftGroundOrigY = (startGroundY + TOTAL_H) / 2;
    const rightGroundOrigX = (GX + COLS * CELL + TOTAL_W) / 2;
    const rightGroundOrigY = (goalGroundY + TOTAL_H) / 2;

    if (elapsed < SUCK_GROUND_START) {
        drawGroundLeft();
        drawGroundRight();
        drawGroundPit();
    } else if (elapsed < SUCK_GROUND_END) {
        // レンガ・芝が1個ずつ独立して吸い込まれる
        drawGroundSuckPieces(elapsed, SUCK_GROUND_START, SUCK_GROUND_END, cx, cy);
    } else if (elapsed >= DROP_GROUND_START) {
        // 落下復帰
        const leftGrState = getObjectState(elapsed, SUCK_GROUND_START, SUCK_GROUND_END, DROP_GROUND_START, DROP_GROUND_END, leftGroundOrigX, leftGroundOrigY, cx, cy);
        const rightGrState = getObjectState(elapsed, SUCK_GROUND_START + 80, SUCK_GROUND_END, DROP_GROUND_START, DROP_GROUND_END, rightGroundOrigX, rightGroundOrigY, cx, cy);

        if (leftGrState.active) {
            ctx.save();
            ctx.translate(leftGrState.x, leftGrState.y);
            if (leftGrState.rotation) ctx.rotate(leftGrState.rotation);
            if (leftGrState.scale !== 1) ctx.scale(leftGrState.scale, leftGrState.scale);
            if (leftGrState.alpha < 1) ctx.globalAlpha *= leftGrState.alpha;
            ctx.translate(-leftGroundOrigX, -leftGroundOrigY);
            drawGroundLeft();
            ctx.restore();
        }

        if (rightGrState.active) {
            ctx.save();
            ctx.translate(rightGrState.x, rightGrState.y);
            if (rightGrState.rotation) ctx.rotate(rightGrState.rotation);
            if (rightGrState.scale !== 1) ctx.scale(rightGrState.scale, rightGrState.scale);
            if (rightGrState.alpha < 1) ctx.globalAlpha *= rightGrState.alpha;
            ctx.translate(-rightGroundOrigX, -rightGroundOrigY);
            drawGroundRight();
            ctx.restore();
        }

        if (leftGrState.active && rightGrState.active && leftGrState.scale === 1 && rightGrState.scale === 1) {
            drawGroundPit();
        }
    }

    // 2. グリッド線・天井
    if (elapsed < SUCK_GROUND_START || elapsed >= DROP_GROUND_END) {
        ctx.save();
        ctx.fillStyle = 'rgba(100,150,255,0.06)';
        ctx.fillRect(GX, GY, COLS * CELL, ROWS * CELL);
        drawGridLines();
        drawCeiling();
        ctx.restore();
    }

    // 3. ゴール (Goal) の描画
    const goalBx = GX + COLS * CELL;
    const goalBy = GY + st.goalRow * CELL;
    const goalOrigX = goalBx + 28;
    const goalOrigY = goalBy + CELL / 2;
    const goalState = getObjectState(elapsed, SUCK_GOAL_START, SUCK_GOAL_END, DROP_GOAL_START, DROP_GOAL_END, goalOrigX, goalOrigY, cx, cy);

    if (goalState.active) {
        ctx.save();
        ctx.translate(goalState.x, goalState.y);
        if (goalState.rotation) ctx.rotate(goalState.rotation);
        if (goalState.scale !== 1) ctx.scale(goalState.scale, goalState.scale);
        if (goalState.alpha < 1) ctx.globalAlpha *= goalState.alpha;
        ctx.translate(-goalOrigX, -goalOrigY);
        drawGoal();
        ctx.restore();
    }

    // 4. 土管 (Pipe) の描画
    const px = GX - 78;
    const py = GY + st.startRow * CELL + 2;
    const pw = 60, ph = startGroundY - py;
    const pipeOrigX = px + pw / 2;
    const pipeOrigY = py + ph / 2;
    const pipeState = getObjectState(elapsed, SUCK_PIPE_START, SUCK_PIPE_END, DROP_PIPE_START, DROP_PIPE_END, pipeOrigX, pipeOrigY, cx, cy);

    if (pipeState.active) {
        ctx.save();
        ctx.translate(pipeState.x, pipeState.y);
        if (pipeState.rotation) ctx.rotate(pipeState.rotation);
        if (pipeState.scale !== 1) ctx.scale(pipeState.scale, pipeState.scale);
        if (pipeState.alpha < 1) ctx.globalAlpha *= pipeState.alpha;
        ctx.translate(-pipeOrigX, -pipeOrigY);
        drawPipe();
        ctx.restore();
    }

    // 5. ギミック矢印 (Arrows) の描画
    bhState.gimmicks.forEach(g => {
        const arrowOrigX = GX + (g.col + 0.5) * CELL;
        const arrowOrigY = GY + (g.row + 0.5) * CELL;
        const arrowState = getObjectState(elapsed, SUCK_ARROWS_START, SUCK_ARROWS_END, DROP_ARROWS_START, DROP_ARROWS_END, arrowOrigX, arrowOrigY, cx, cy);

        if (arrowState.active) {
            ctx.save();
            ctx.translate(arrowState.x, arrowState.y);
            if (arrowState.rotation) ctx.rotate(arrowState.rotation);
            if (arrowState.scale !== 1) ctx.scale(arrowState.scale, arrowState.scale);
            if (arrowState.alpha < 1) ctx.globalAlpha *= arrowState.alpha;
            ctx.translate(-arrowOrigX, -arrowOrigY);
            drawGimmickTile(g);
            ctx.restore();
        }
    });

    // 6. ブロック (Blocks) の描画
    if (elapsed < SUCK_BLOCKS_START) {
        // 回転中: 各ループブロックの高速周回＆残像描画
        bhState.placedBlocks.forEach(b => {
            if (b.isLoopBlock) {
                const s_b = loopS + b.loopOffset;
                const curCoord = getLoopCoord(s_b);

                // 加速時の残像 (モーションブラー)
                if (elapsed >= T_half && loopSpeed > 3) {
                    const trailCount = Math.min(5, Math.floor(loopSpeed * 0.35));
                    for (let t = trailCount; t >= 1; t--) {
                        const trailS = s_b - t * Math.min(0.35, 1.2 / trailCount);
                        const tc = getLoopCoord(trailS);
                        ctx.save();
                        ctx.globalAlpha = 0.12 * (1 - t / (trailCount + 1));
                        drawMarioBlock(tc.col, tc.row);
                        ctx.restore();
                    }
                }

                // 現在位置のブロック
                drawMarioBlock(curCoord.col, curCoord.row);
            } else {
                // ループ外の静止ブロック
                drawMarioBlock(b.col, b.row);
            }
        });
    } else {
        // 吸引中: 各ブロックがその瞬間の位置からブラックホール中心へ吸い込まれる
        if (elapsed < SUCK_BLOCKS_END) {
            const dtSecSuck = (SUCK_BLOCKS_START - T_half) / 1000;
            const v0 = halfN / 0.5;
            const k = 2.2;
            const loopSAtSuck = halfN + (v0 / k) * (Math.exp(k * dtSecSuck) - 1);

            bhState.placedBlocks.forEach(b => {
                let bOrigX = GX + (b.col + 0.5) * CELL;
                let bOrigY = GY + (b.row + 0.5) * CELL;
                let curCoordAtSuck = null;

                if (b.isLoopBlock) {
                    const s_b_suck = loopSAtSuck + b.loopOffset;
                    curCoordAtSuck = getLoopCoord(s_b_suck);
                    bOrigX = GX + (curCoordAtSuck.col + 0.5) * CELL;
                    bOrigY = GY + (curCoordAtSuck.row + 0.5) * CELL;
                }

                const bState = getSuckTransform(elapsed, SUCK_BLOCKS_START, SUCK_BLOCKS_END, bOrigX, bOrigY, cx, cy);

                if (bState.active) {
                    const drawCol = b.isLoopBlock ? curCoordAtSuck.col : b.col;
                    const drawRow = b.isLoopBlock ? curCoordAtSuck.row : b.row;
                    const targetCx = GX + (drawCol + 0.5) * CELL;
                    const targetCy = GY + (drawRow + 0.5) * CELL;

                    ctx.save();
                    ctx.translate(bState.x, bState.y);
                    if (bState.rotation) ctx.rotate(bState.rotation);
                    if (bState.scale !== 1) ctx.scale(bState.scale, bState.scale);
                    if (bState.alpha < 1) ctx.globalAlpha *= bState.alpha;
                    ctx.translate(-targetCx, -targetCy);
                    drawMarioBlock(drawCol, drawRow);
                    ctx.restore();
                }
            });
        }
        // ステージリセットが目的のため、吸引完了後はブロックを再出現させない
    }

    // 7. キャラクター (Stickman) の描画
    const manOrigX = GX + (-1.5 + 0.5) * CELL;
    const manOrigY = GY + (st.startRow + 0.5) * CELL;
    const manState = getObjectState(elapsed, SUCK_MAN_START, SUCK_MAN_END, DROP_MAN_START, DROP_MAN_END, manOrigX, manOrigY, cx, cy);

    if (manState.active) {
        ctx.save();
        ctx.translate(manState.x, manState.y);
        if (manState.rotation) ctx.rotate(manState.rotation);
        if (manState.scale !== 1) ctx.scale(manState.scale, manState.scale);
        if (manState.alpha < 1) ctx.globalAlpha *= manState.alpha;
        ctx.translate(-manOrigX, -manOrigY);

        if (manState.phase === 'drop') {
            // 落下中のジャンプポーズ
            const oldState = man.state;
            man.state = 'jump';
            drawStickman(-1.5, st.startRow);
            man.state = oldState;
        } else if (elapsed >= 2200 && elapsed < SUCK_MAN_START) {
            // 揺れにビビる震えモーション
            const jitterX = (Math.sin(elapsed * 0.15) * 1.5);
            ctx.translate(jitterX, 0);
            drawStickman(-1.5, st.startRow);
        } else {
            drawStickman(-1.5, st.startRow);
        }
        ctx.restore();
    }

    // 8. ブラックホール (Black Hole) 本体の描画
    if (bhRadius > 0) {
        // A. 降着円盤 (Accretion Disk) 光輪
        const grad = ctx.createRadialGradient(cx, cy, bhRadius * 0.25, cx, cy, bhRadius * 2.3);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.35, 'rgba(88, 28, 135, 0.92)');
        grad.addColorStop(0.6, 'rgba(147, 51, 234, 0.75)');
        grad.addColorStop(0.85, 'rgba(56, 189, 248, 0.4)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, bhRadius * 2.3, 0, Math.PI * 2);
        ctx.fill();

        // B. 回転する歪みフィラメント
        const diskAngle = elapsed * 0.005;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(diskAngle);
        for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            ctx.strokeStyle = (i % 2 === 0) ? 'rgba(192, 132, 252, 0.45)' : 'rgba(56, 189, 248, 0.35)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, bhRadius * 1.6, bhRadius * 0.75, a, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        // C. スパイラル光粒子
        updateAndDrawBlackHoleParticles(ctx, cx, cy, bhRadius, elapsed);

        // D. 中心の漆黒コア (事象の地平線)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(cx, cy, bhRadius, 0, Math.PI * 2);
        ctx.fill();

        // E. 純白の発光エッジ
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.stroke();
    }

    // 9. パーティクル (土煙など)
    updateAndDrawParticles(ctx);

    ctx.restore();
}

// MARK: - Dual Event: Supernova + Black Hole Simultaneous Sequence
function startDualSupernovaBlackHole(snData, bhData) {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    phase = 'dual_event';
    startBtn.disabled = true;
    originalGrid = null;

    const rawSpots = Array.isArray(snData) ? snData : [snData];
    const spots = rawSpots.map(s => ({
        col: s.col,
        row: s.row,
        tick: s.tick,
        colliders: s.colliders,
        stopRatio: getSpotStopRatio(s),
        focusX: GX + (s.col + 0.5) * CELL,
        focusY: GY + (s.row + 0.5) * CELL,
        exploded: false,
        explodeX: undefined,
        explodeY: undefined,
        particles: [],
        debris: []
    }));

    const spotCount = spots.length;
    let extraTime = 0;
    let schedule = null;

    if (spotCount >= 2) {
        const stays = [];
        const pans = [];
        const firstStay = 1050;
        const lastStay = spotCount === 2 ? 680 : Math.max(300, 680 - (spotCount - 2) * 110);

        for (let i = 0; i < spotCount; i++) {
            const ratio = spotCount > 1 ? i / (spotCount - 1) : 0;
            stays.push(Math.round(firstStay + (lastStay - firstStay) * Math.pow(ratio, 0.85)));
            if (i < spotCount - 1) {
                const panRatio = spotCount > 2 ? i / (spotCount - 2) : 0;
                pans.push(Math.round(360 - panRatio * 120));
            }
        }

        schedule = [];
        let curTime = 0;
        for (let i = 0; i < spotCount; i++) {
            const stayStart = curTime;
            const stayEnd = curTime + stays[i];
            schedule.push({ type: 'stay', spotIndex: i, start: stayStart, end: stayEnd });
            curTime = stayEnd;
            if (i < spotCount - 1) {
                const panStart = curTime;
                const panEnd = curTime + pans[i];
                schedule.push({ type: 'pan', fromSpot: i, toSpot: i + 1, start: panStart, end: panEnd });
                curTime = panEnd;
            }
        }
        extraTime = Math.max(0, curTime - 2220);
    }

    const rawLoops = Array.isArray(bhData) ? bhData : [bhData];
    const isMultiBH = rawLoops.length >= 2;
    const loopCount = rawLoops.length;
    const midCenterX = rawLoops.reduce((sum, l) => sum + l.centerX, 0) / loopCount;
    const midCenterY = rawLoops.reduce((sum, l) => sum + l.centerY, 0) / loopCount;

    const holes = rawLoops.map((l, idx) => {
        const dx = l.centerX - midCenterX;
        const dy = l.centerY - midCenterY;
        const initRadius = Math.sqrt(dx * dx + dy * dy);
        const initAngle = Math.atan2(dy, dx);
        return {
            id: l.id || (idx + 1),
            loopPath: l.loopPath,
            loopBlockOffsets: l.loopBlockOffsets,
            centerCol: l.centerCol,
            centerRow: l.centerRow,
            centerX: l.centerX,
            centerY: l.centerY,
            dx,
            dy,
            initRadius,
            initAngle,
            curX: l.centerX,
            curY: l.centerY,
            curRadius: 0
        };
    });

    const initialPlacedBlocks = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) {
                let foundLoopIdx = -1;
                let foundOffset = 0;
                for (let hi = 0; hi < holes.length; hi++) {
                    const h = holes[hi];
                    const offsetObj = h.loopBlockOffsets
                        ? h.loopBlockOffsets.find(o => o.col === c && o.row === r)
                        : null;
                    if (offsetObj) {
                        foundLoopIdx = hi;
                        foundOffset = offsetObj.loopOffset;
                        break;
                    } else if (!h.loopBlockOffsets) {
                        const pi = h.loopPath.findIndex(p => p.col === c && p.row === r);
                        if (pi !== -1) {
                            foundLoopIdx = hi;
                            foundOffset = pi;
                            break;
                        }
                    }
                }
                const isCollider = spots.some(sp =>
                    sp.colliders.some(colObj =>
                        (colObj.fromCol === c && colObj.fromRow === r) ||
                        (colObj.originCol === c && colObj.originRow === r)
                    )
                );
                initialPlacedBlocks.push({
                    col: c,
                    row: r,
                    isLoopBlock: (foundLoopIdx !== -1),
                    loopIndex: foundLoopIdx,
                    loopOffset: foundOffset,
                    isCollider
                });
            }
        }
    }

    const st = getStage();
    dualEventState = {
        spots: spots,
        sn: spots[0],
        isMultiBH,
        holes,
        midCenterX,
        midCenterY,
        bh: {
            loopPath: holes[0].loopPath,
            centerCol: holes[0].centerCol,
            centerRow: holes[0].centerRow,
            centerX: midCenterX,
            centerY: midCenterY
        },
        extraTime: extraTime,
        schedule: schedule,
        startTime: performance.now(),
        placedBlocks: initialPlacedBlocks,
        gimmicks: [...st.gimmicks],
        landedImpacts: new Set()
    };

    initBlackHoleParticles(midCenterX, midCenterY);

    if (statusBar) {
        statusBar.innerHTML = '<span class="status-place">•••••</span>';
    }
    if (hintText) {
        hintText.textContent = '';
    }

    animId = requestAnimationFrame(animateDualEvent);
}

function finishDualEvent() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    dualEventState = null;
    pendingSupernova = null;
    pendingBlackHole = null;
    slidingBlocks = [];
    blockAnimationRounds = [];
    currentRoundIndex = 0;

    // ステージリセット（ブロックを全消去して更地で再配置へ復帰）
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    originalGrid = null;
    placedBlocksAtStart = 0;
    gameParticles.length = 0;

    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;
    statusBar.innerHTML = '<span class="status-place">ブロックを配置してください。</span>';
    if (hintText) hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
    updateBlockBadge(true);
    render();
}

function animateDualEvent(ts) {
    if (phase !== 'dual_event' || !dualEventState) return;

    const now = ts || performance.now();
    const elapsed = Math.max(0, now - dualEventState.startTime);

    renderDualEventState(elapsed);

    const totalEnd = 8350 + (dualEventState.extraTime || 0);
    if (elapsed >= totalEnd) {
        finishDualEvent();
    } else {
        animId = requestAnimationFrame(animateDualEvent);
    }
}

function renderDualEventState(elapsed) {
    const st = getStage();
    const deState = dualEventState;
    if (!deState) return;

    const spots = deState.spots || [deState.sn];
    const spotCount = spots.length;
    const bh = deState.bh;
    const bhX = bh.centerX;
    const bhY = bh.centerY;
    const extraTime = deState.extraTime || 0;
    const PAN_DURATION = deState.PAN_DURATION || 750;

    // --- タイムライン定義（2点以上の爆発時は動的に時間を伸ばす）---
    const T_HALF = 450;             // 0〜0.45s: ループブロック半周通常回転
    const BH_APPEAR_START = 1750 + extraTime;   // ループブロックが終端速度に到達し、ブラックホール出現開始
    const BH_APPEAR_END = 2350 + extraTime;     // ブラックホール最大半径到達
    const LOOP_FREEZE_TIME = 2150 + extraTime;  // ブラックホールがブロックに重なり、外周回転から吸引フェーズへ移行

    const APPROACH_END = 1350;      // 0〜1.35s: カメラが超新星交点へズーム
    const PULL_START = 1850 + extraTime;        // 爆発の少し前にカメラが等倍へ戻る
    const PULL_END = 2350 + extraTime;
    const SN_SUCK_START = 1900 + extraTime;     // ブラックホール生成後、爆発するブロックが吸われながら融合
    const EXPLODE_TIME = 2450 + extraTime;      // 吸われながら超新星爆発！

    const BLOW_START = 2550 + extraTime;        // 爆風でプレイヤー吹っ飛び開始
    const ESCAPE_POINT = 3100 + extraTime;      // プレイヤーが画面右上端寸前に到達
    const SUCK_MAN_START = 3100 + extraTime;    // 進路を急変させてブラックホールへスパイラル吸引
    const SUCK_MAN_END = 3550 + extraTime;

    // 他のブロック達・ステージ要素の吸引タイムライン
    const SUCK_BLOCKS_START = 3450 + extraTime, SUCK_BLOCKS_END = 3900 + extraTime;
    const SUCK_ARROWS_START = 3800 + extraTime, SUCK_ARROWS_END = 4250 + extraTime;
    const SUCK_GOAL_START = 3550 + extraTime, SUCK_GOAL_END = 4050 + extraTime;
    const SUCK_PIPE_START = 4150 + extraTime, SUCK_PIPE_END = 4600 + extraTime;
    const SUCK_GROUND_START = 3550 + extraTime, SUCK_GROUND_END = 5250 + extraTime;

    // 落下出現タイムライン（反対の順: 地面 → ゴール → 土管 → キャラクター → 矢印）
    const DROP_GROUND_START = 6250 + extraTime, DROP_GROUND_END = 6700 + extraTime;
    const DROP_GOAL_START = 6650 + extraTime, DROP_GOAL_END = 7050 + extraTime;
    const DROP_PIPE_START = 7000 + extraTime, DROP_PIPE_END = 7400 + extraTime;
    const DROP_MAN_START = 7350 + extraTime, DROP_MAN_END = 7850 + extraTime;
    const DROP_ARROWS_START = 7800 + extraTime, DROP_ARROWS_END = 8200 + extraTime;

    // --- ステータスバー文言 ---
    if (statusBar) {
        statusBar.innerHTML = '<span class="status-place">•••••</span>';
    }

    // 爆発するブロックの吸引オフセット計算 & 爆発発火処理
    let snSuckRatio = 0;
    if (elapsed >= SN_SUCK_START) {
        const stNorm = Math.min(1, (elapsed - SN_SUCK_START) / (EXPLODE_TIME - SN_SUCK_START));
        snSuckRatio = Math.pow(stNorm, 1.85) * 0.58;
    }

    spots.forEach(sp => {
        sp.curExplosionX = sp.focusX + (bhX - sp.focusX) * snSuckRatio;
        sp.curExplosionY = sp.focusY + (bhY - sp.focusY) * snSuckRatio;

        if (elapsed >= EXPLODE_TIME && !sp.exploded) {
            sp.exploded = true;
            sp.explodeX = sp.curExplosionX;
            sp.explodeY = sp.curExplosionY;
            spawnSupernovaExplosionParticles(sp.curExplosionX, sp.curExplosionY, sp);
        }
    });

    // --- カメラズーム & オフセット計算 ---
    let zoom = 1.0;
    let camRatio = 0.0;
    let camShakeX = 0;
    let camShakeY = 0;
    let currentFocusX = TOTAL_W / 2;
    let currentFocusY = TOTAL_H / 2;

    if (spotCount <= 1) {
        currentFocusX = spots[0].focusX;
        currentFocusY = spots[0].focusY;

        if (elapsed < APPROACH_END) {
            const t1 = elapsed / APPROACH_END;
            const ease1 = t1 < 0.5 ? 2 * t1 * t1 : 1 - Math.pow(-2 * t1 + 2, 2) / 2;
            zoom = 1.0 + 1.35 * ease1; // 1.0 -> 2.35
            camRatio = ease1;
        } else if (elapsed < PULL_START) {
            zoom = 2.35;
            camRatio = 1.0;
            camShakeX = Math.sin(elapsed * 0.1) * 2.2;
            camShakeY = Math.cos(elapsed * 0.12) * 2.2;
        } else if (elapsed < PULL_END) {
            // 爆発の少し前にカメラが等倍に戻る
            const pt = (elapsed - PULL_START) / (PULL_END - PULL_START);
            const easePt = pt < 0.5 ? 2 * pt * pt : 1 - Math.pow(-2 * pt + 2, 2) / 2;
            zoom = 2.35 - 1.35 * easePt; // 2.35 -> 1.0
            camRatio = 1.0 - easePt;     // 1.0 -> 0.0
            camShakeX = Math.sin(elapsed * 0.15) * 3.2;
            camShakeY = Math.cos(elapsed * 0.18) * 3.2;
        } else {
            zoom = 1.0;
            camRatio = 0.0;
        }
    } else {
        // 複数地点の場合（見る時間を徐々に縮めて爆発が迫る緊迫感を演出）
        const schedule = dualEventState.schedule;
        const currentItem = schedule ? schedule.find(s => elapsed >= s.start && elapsed < s.end) : null;

        if (currentItem) {
            if (currentItem.type === 'stay') {
                const sp = spots[currentItem.spotIndex];
                currentFocusX = sp.focusX;
                currentFocusY = sp.focusY;

                if (currentItem.spotIndex === 0) {
                    const zoomInDur = 560;
                    const t1 = Math.min(1, elapsed / zoomInDur);
                    const ease1 = t1 < 0.5 ? 4 * t1 * t1 * t1 : 1 - Math.pow(-2 * t1 + 2, 3) / 2;
                    zoom = 1.0 + 1.35 * ease1;
                    camRatio = ease1;
                } else {
                    zoom = 2.35;
                    camRatio = 1.0;
                    camShakeX = Math.sin(elapsed * 0.1) * 2.2;
                    camShakeY = Math.cos(elapsed * 0.12) * 2.2;
                }
            } else if (currentItem.type === 'pan') {
                const u = (elapsed - currentItem.start) / (currentItem.end - currentItem.start);
                const easePan = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
                const fromSpot = spots[currentItem.fromSpot];
                const toSpot = spots[currentItem.toSpot];
                currentFocusX = fromSpot.focusX + (toSpot.focusX - fromSpot.focusX) * easePan;
                currentFocusY = fromSpot.focusY + (toSpot.focusY - fromSpot.focusY) * easePan;
                zoom = 2.35;
                camRatio = 1.0;
            }
        } else if (elapsed < PULL_START) {
            const lastSpot = spots[spotCount - 1];
            currentFocusX = lastSpot.focusX;
            currentFocusY = lastSpot.focusY;
            zoom = 2.35;
            camRatio = 1.0;
            camShakeX = Math.sin(elapsed * 0.1) * 2.2;
            camShakeY = Math.cos(elapsed * 0.12) * 2.2;
        } else if (elapsed < PULL_END) {
            // 爆発の少し前にカメラが等倍に戻る
            const lastSpot = spots[spotCount - 1];
            currentFocusX = lastSpot.focusX;
            currentFocusY = lastSpot.focusY;
            const pt = (elapsed - PULL_START) / (PULL_END - PULL_START);
            const easePt = pt < 0.5 ? 2 * pt * pt : 1 - Math.pow(-2 * pt + 2, 2) / 2;
            zoom = 2.35 - 1.35 * easePt;
            camRatio = 1.0 - easePt;
            camShakeX = Math.sin(elapsed * 0.15) * 3.2;
            camShakeY = Math.cos(elapsed * 0.18) * 3.2;
        } else {
            zoom = 1.0;
            camRatio = 0.0;
        }
    }

    // 画面全体の揺れ（爆風 & ブラックホール重力波）
    if (elapsed >= PULL_END) {
        let shakeAmp = 0;
        if (elapsed < EXPLODE_TIME) {
            shakeAmp = 3.5;
        } else if (elapsed < 3250 + extraTime) {
            shakeAmp = 12 * (1 - (elapsed - EXPLODE_TIME) / 800);
        } else if (elapsed < 4850 + extraTime) {
            shakeAmp = ((elapsed - (3250 + extraTime)) / 1600) * 6.5;
        } else if (elapsed < 5550 + extraTime) {
            shakeAmp = 6.5 + ((elapsed - (4850 + extraTime)) / 700) * 3.0;
        } else if (elapsed < 5950 + extraTime) {
            shakeAmp = 9.5 * (1 - (elapsed - (5550 + extraTime)) / 400);
        } else if (elapsed >= DROP_GROUND_END - 50 && elapsed < DROP_GROUND_END + 200) {
            const pt = (elapsed - (DROP_GROUND_END - 50)) / 250;
            shakeAmp = 5.5 * (1 - pt);
        }

        if (shakeAmp > 0) {
            camShakeX = (Math.sin(elapsed * 0.11) * 0.7 + Math.sin(elapsed * 0.23) * 0.3) * shakeAmp;
            camShakeY = (Math.cos(elapsed * 0.13) * 0.7 + Math.cos(elapsed * 0.19) * 0.3) * shakeAmp;
        }
    }

    const baseCenterX = TOTAL_W / 2;
    const baseCenterY = TOTAL_H / 2;
    const camTargetX = baseCenterX + (currentFocusX - baseCenterX) * camRatio;
    const camTargetY = baseCenterY + (currentFocusY - baseCenterY) * camRatio;

    // --- 着地衝撃土煙トリガー ---
    const triggerImpact = (key, callback) => {
        if (!deState.landedImpacts.has(key)) {
            deState.landedImpacts.add(key);
            callback();
        }
    };
    if (elapsed >= DROP_GROUND_END) {
        triggerImpact('ground', () => {
            spawnDust(0, st.startRow);
            spawnDust(COLS - 1, st.goalRow);
        });
    }
    if (elapsed >= DROP_GOAL_END) {
        triggerImpact('goal', () => { spawnDust(COLS, st.goalRow); });
    }
    if (elapsed >= DROP_PIPE_END) {
        triggerImpact('pipe', () => { spawnDust(-1.5, st.startRow); });
    }
    if (elapsed >= DROP_MAN_END) {
        triggerImpact('man', () => { spawnDust(-1.5, st.startRow); });
    }

    // --- ブラックホールのサイズ ---
    let bhRadius = 0;
    if (elapsed >= BH_APPEAR_START && elapsed < BH_APPEAR_END) {
        const t = (elapsed - BH_APPEAR_START) / (BH_APPEAR_END - BH_APPEAR_START);
        bhRadius = 62 * Math.pow(t, 1.6);
    } else if (elapsed >= BH_APPEAR_END && elapsed < 5550 + extraTime) {
        bhRadius = 62 + Math.sin(elapsed * 0.01) * 2.5;
    } else if (elapsed >= 5550 + extraTime && elapsed < 5950 + extraTime) {
        const t = (elapsed - (5550 + extraTime)) / 400;
        bhRadius = Math.max(0, 62 * Math.pow(1 - t, 2));
    }

    // --- ループ回転の進行マス数 (s) の計算 ---
    const loopPath = bh.loopPath;
    const N = loopPath.length;
    const halfN = N / 2;
    const v0 = halfN / (T_HALF / 1000);
    const k = 2.25;
    let loopS = 0;
    let loopSpeed = 1;

    if (elapsed < T_HALF) {
        loopS = (halfN / T_HALF) * elapsed;
        loopSpeed = 1;
    } else {
        const effectiveElapsed = Math.min(elapsed, LOOP_FREEZE_TIME);
        const dtSec = (effectiveElapsed - T_HALF) / 1000;
        loopS = halfN + (v0 / k) * (Math.exp(k * dtSec) - 1);
        loopSpeed = Math.exp(k * dtSec);
    }

    const getHoleLoopCoord = (holeData, sVal) => {
        const lp = holeData.loopPath;
        const lN = lp.length;
        const modS = ((sVal % lN) + lN) % lN;
        const idx = Math.floor(modS);
        const sub = modS - idx;
        const p0 = lp[idx];
        const p1 = lp[(idx + 1) % lN];
        return {
            col: p0.col + (p1.col - p0.col) * sub,
            row: p0.row + (p1.row - p0.row) * sub
        };
    };
    const getLoopCoord = (sVal, holeIdx = 0) => {
        const targetHole = (deState.holes && deState.holes[holeIdx]) ? deState.holes[holeIdx] : bh;
        return getHoleLoopCoord(targetHole, sVal);
    };

    // --- レンダリング開始 ---
    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);
    drawBackground();

    ctx.save();
    ctx.translate(baseCenterX + camShakeX, baseCenterY + camShakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-camTargetX, -camTargetY);

    // 1. 地面 (Ground)
    const startGroundY = GY + (st.startRow + 1) * CELL;
    const goalGroundY = GY + (st.goalRow + 1) * CELL;
    const leftGroundOrigX = GX / 2;
    const leftGroundOrigY = (startGroundY + TOTAL_H) / 2;
    const rightGroundOrigX = (GX + COLS * CELL + TOTAL_W) / 2;
    const rightGroundOrigY = (goalGroundY + TOTAL_H) / 2;

    if (elapsed < SUCK_GROUND_START) {
        drawGroundLeft();
        drawGroundRight();
        drawGroundPit();
    } else if (elapsed < SUCK_GROUND_END) {
        // レンガ・芝が1個ずつ独立して吸い込まれる
        drawGroundSuckPieces(elapsed, SUCK_GROUND_START, SUCK_GROUND_END, bhX, bhY);
    } else if (elapsed >= DROP_GROUND_START) {
        // 落下復帰
        const leftGrState = getObjectState(elapsed, SUCK_GROUND_START, SUCK_GROUND_END, DROP_GROUND_START, DROP_GROUND_END, leftGroundOrigX, leftGroundOrigY, bhX, bhY);
        const rightGrState = getObjectState(elapsed, SUCK_GROUND_START + 80, SUCK_GROUND_END, DROP_GROUND_START, DROP_GROUND_END, rightGroundOrigX, rightGroundOrigY, bhX, bhY);

        if (leftGrState.active) {
            ctx.save();
            ctx.translate(leftGrState.x, leftGrState.y);
            if (leftGrState.rotation) ctx.rotate(leftGrState.rotation);
            if (leftGrState.scale !== 1) ctx.scale(leftGrState.scale, leftGrState.scale);
            if (leftGrState.alpha < 1) ctx.globalAlpha *= leftGrState.alpha;
            ctx.translate(-leftGroundOrigX, -leftGroundOrigY);
            drawGroundLeft();
            ctx.restore();
        }
        if (rightGrState.active) {
            ctx.save();
            ctx.translate(rightGrState.x, rightGrState.y);
            if (rightGrState.rotation) ctx.rotate(rightGrState.rotation);
            if (rightGrState.scale !== 1) ctx.scale(rightGrState.scale, rightGrState.scale);
            if (rightGrState.alpha < 1) ctx.globalAlpha *= rightGrState.alpha;
            ctx.translate(-rightGroundOrigX, -rightGroundOrigY);
            drawGroundRight();
            ctx.restore();
        }
        if (leftGrState.active && rightGrState.active && leftGrState.scale === 1 && rightGrState.scale === 1) {
            drawGroundPit();
        }
    }

    // 2. グリッド線・天井
    if (elapsed < SUCK_GROUND_START || elapsed >= DROP_GROUND_END) {
        ctx.save();
        ctx.fillStyle = 'rgba(100,150,255,0.06)';
        ctx.fillRect(GX, GY, COLS * CELL, ROWS * CELL);
        drawGridLines();
        drawCeiling();
        ctx.restore();
    }

    // 3. ゴール (Goal)
    const goalBx = GX + COLS * CELL;
    const goalBy = GY + st.goalRow * CELL;
    const goalOrigX = goalBx + 28;
    const goalOrigY = goalBy + CELL / 2;
    const goalState = getObjectState(elapsed, SUCK_GOAL_START, SUCK_GOAL_END, DROP_GOAL_START, DROP_GOAL_END, goalOrigX, goalOrigY, bhX, bhY);
    if (goalState.active) {
        ctx.save();
        ctx.translate(goalState.x, goalState.y);
        if (goalState.rotation) ctx.rotate(goalState.rotation);
        if (goalState.scale !== 1) ctx.scale(goalState.scale, goalState.scale);
        if (goalState.alpha < 1) ctx.globalAlpha *= goalState.alpha;
        ctx.translate(-goalOrigX, -goalOrigY);
        drawGoal();
        ctx.restore();
    }

    // 4. 土管 (Pipe)
    const px = GX - 78;
    const py = GY + st.startRow * CELL + 2;
    const pw = 60, ph = startGroundY - py;
    const pipeOrigX = px + pw / 2;
    const pipeOrigY = py + ph / 2;
    const pipeState = getObjectState(elapsed, SUCK_PIPE_START, SUCK_PIPE_END, DROP_PIPE_START, DROP_PIPE_END, pipeOrigX, pipeOrigY, bhX, bhY);
    if (pipeState.active) {
        ctx.save();
        ctx.translate(pipeState.x, pipeState.y);
        if (pipeState.rotation) ctx.rotate(pipeState.rotation);
        if (pipeState.scale !== 1) ctx.scale(pipeState.scale, pipeState.scale);
        if (pipeState.alpha < 1) ctx.globalAlpha *= pipeState.alpha;
        ctx.translate(-pipeOrigX, -pipeOrigY);
        drawPipe();
        ctx.restore();
    }

    // 5. ギミック矢印 (Arrows)
    deState.gimmicks.forEach(g => {
        const arrowOrigX = GX + (g.col + 0.5) * CELL;
        const arrowOrigY = GY + (g.row + 0.5) * CELL;
        const arrowState = getObjectState(elapsed, SUCK_ARROWS_START, SUCK_ARROWS_END, DROP_ARROWS_START, DROP_ARROWS_END, arrowOrigX, arrowOrigY, bhX, bhY);
        if (arrowState.active) {
            ctx.save();
            ctx.translate(arrowState.x, arrowState.y);
            if (arrowState.rotation) ctx.rotate(arrowState.rotation);
            if (arrowState.scale !== 1) ctx.scale(arrowState.scale, arrowState.scale);
            if (arrowState.alpha < 1) ctx.globalAlpha *= arrowState.alpha;
            ctx.translate(-arrowOrigX, -arrowOrigY);
            drawGimmickTile(g);
            ctx.restore();
        }
    });

    // 6. ループブロック & 他のブロック達の描画（ブラックホールがブロックに重なるように先描き）
    if (elapsed < LOOP_FREEZE_TIME) {
        // 終端速度到達＆ブラックホール出現まで: 高速周回＆残像描画
        deState.placedBlocks.forEach(b => {
            if (b.isCollider) return;
            if (b.isLoopBlock) {
                const hIdx = (b.loopIndex !== undefined && b.loopIndex >= 0) ? b.loopIndex : 0;
                const s_b = loopS + b.loopOffset;
                const curCoord = getLoopCoord(s_b, hIdx);

                if (elapsed >= T_HALF && loopSpeed > 3) {
                    const trailCount = Math.min(5, Math.floor(loopSpeed * 0.35));
                    for (let t = trailCount; t >= 1; t--) {
                        const trailS = s_b - t * Math.min(0.35, 1.2 / trailCount);
                        const tc = getLoopCoord(trailS, hIdx);
                        ctx.save();
                        ctx.globalAlpha = 0.12 * (1 - t / (trailCount + 1));
                        drawMarioBlock(tc.col, tc.row);
                        ctx.restore();
                    }
                }
                drawMarioBlock(curCoord.col, curCoord.row);
            } else {
                drawMarioBlock(b.col, b.row);
            }
        });
    } else if (elapsed < SUCK_BLOCKS_END) {
        // ブラックホール出現後: 外周回転を止め、重力に引かれつつプレイヤー吸引後に一気に中心へ吸い込まれる
        const dtSecFreeze = (LOOP_FREEZE_TIME - T_HALF) / 1000;
        const loopSAtFreeze = halfN + (v0 / k) * (Math.exp(k * dtSecFreeze) - 1);

        let pullEase = 0;
        let rotAngle = 0;
        let scaleVal = 1;
        let alphaVal = 1;

        if (elapsed < SUCK_BLOCKS_START) {
            // 爆発〜プレイヤー吸引中: ブラックホール出現と同時に重力でじわじわ中心へ引き寄せられる
            const preT = (elapsed - LOOP_FREEZE_TIME) / (SUCK_BLOCKS_START - LOOP_FREEZE_TIME);
            pullEase = 0.32 * Math.pow(preT, 1.2);
            rotAngle = pullEase * Math.PI * 1.1;
            scaleVal = 1 - pullEase * 0.28;
        } else {
            // プレイヤー吸引直後: 他のブロック達も一気にブラックホール中心へ吸い込まれる
            const u = (elapsed - SUCK_BLOCKS_START) / (SUCK_BLOCKS_END - SUCK_BLOCKS_START);
            const postEase = Math.pow(u, 2.1);
            pullEase = 0.32 + 0.68 * postEase;
            rotAngle = (0.32 * Math.PI * 1.1) + postEase * Math.PI * 3.0;
            scaleVal = Math.max(0, (1 - 0.32 * 0.28) * (1 - postEase));
            alphaVal = Math.max(0, 1 - Math.pow(u, 2.0));
        }

        deState.placedBlocks.forEach(b => {
            if (b.isCollider) return;
            let drawCol = b.col;
            let drawRow = b.row;

            if (b.isLoopBlock) {
                const hIdx = (b.loopIndex !== undefined && b.loopIndex >= 0) ? b.loopIndex : 0;
                const s_b_freeze = loopSAtFreeze + b.loopOffset;
                const curCoordAtFreeze = getLoopCoord(s_b_freeze, hIdx);
                drawCol = curCoordAtFreeze.col;
                drawRow = curCoordAtFreeze.row;
            }

            const bOrigX = GX + (drawCol + 0.5) * CELL;
            const bOrigY = GY + (drawRow + 0.5) * CELL;
            const curX = bOrigX + (bhX - bOrigX) * pullEase;
            const curY = bOrigY + (bhY - bOrigY) * pullEase;

            ctx.save();
            ctx.translate(curX, curY);
            if (rotAngle) ctx.rotate(rotAngle);
            if (scaleVal !== 1) ctx.scale(scaleVal, scaleVal);
            if (alphaVal < 1) ctx.globalAlpha *= alphaVal;
            ctx.translate(-bOrigX, -bOrigY);
            drawMarioBlock(drawCol, drawRow);
            ctx.restore();
        });
    }

    // 7. ブラックホール本体（ブロックの上に重なるように描画）
    if (deState.isMultiBH && deState.holes && deState.holes.length >= 2) {
        const K = deState.holes.length;
        const TM_MAPPED = (K <= 2) ? 4000 : 5800;
        const TM_DUAL = 3300 + extraTime;
        let mappedElapsed = 0;
        if (elapsed >= BH_APPEAR_START && elapsed < TM_DUAL) {
            mappedElapsed = 1000 + ((elapsed - BH_APPEAR_START) / (TM_DUAL - BH_APPEAR_START)) * (TM_MAPPED - 1000);
        } else if (elapsed >= TM_DUAL) {
            mappedElapsed = TM_MAPPED + (elapsed - TM_DUAL);
        }
        const COLLAPSE_START_MAPPED = TM_MAPPED + (5550 + extraTime - TM_DUAL);
        const COLLAPSE_END_MAPPED = TM_MAPPED + (5950 + extraTime - TM_DUAL);
        renderHierarchicalBinaryBlackHoles(ctx, mappedElapsed, deState.holes, bhX, bhY, 1000, TM_MAPPED, COLLAPSE_START_MAPPED, COLLAPSE_END_MAPPED);
    } else if (bhRadius > 0) {
        const grad = ctx.createRadialGradient(bhX, bhY, bhRadius * 0.25, bhX, bhY, bhRadius * 2.3);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.35, 'rgba(88, 28, 135, 0.92)');
        grad.addColorStop(0.6, 'rgba(147, 51, 234, 0.75)');
        grad.addColorStop(0.85, 'rgba(56, 189, 248, 0.4)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhRadius * 2.3, 0, Math.PI * 2);
        ctx.fill();

        const diskAngle = elapsed * 0.005;
        ctx.save();
        ctx.translate(bhX, bhY);
        ctx.rotate(diskAngle);
        for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            ctx.strokeStyle = (i % 2 === 0) ? 'rgba(192, 132, 252, 0.45)' : 'rgba(56, 189, 248, 0.35)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, bhRadius * 1.6, bhRadius * 0.75, a, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        updateAndDrawBlackHoleParticles(ctx, bhX, bhY, bhRadius, elapsed);

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.stroke();
    }

    // 8. 爆発が起きるブロック達（全地点で近づく -> 一瞬止まる -> ブルブルしながら吸われ融合爆発）
    spots.forEach(sp => {
        if (!sp.exploded) {
            let moveRatio = 0;
            let whiteRatio = 0;
            let vibAmp = 0;
            let blockScale = 1.0;
            const APPROACH_MOVE_END = 1100;
            const stopRatio = sp.stopRatio || 0.45;

            if (elapsed < APPROACH_MOVE_END) {
                const t1 = elapsed / APPROACH_MOVE_END;
                const ease1 = t1 < 0.5 ? 2 * t1 * t1 : 1 - Math.pow(-2 * t1 + 2, 2) / 2;
                moveRatio = ease1 * stopRatio;
                whiteRatio = 0;
                vibAmp = 0;
            } else if (elapsed < APPROACH_END) {
                moveRatio = stopRatio;
                whiteRatio = 0;
                vibAmp = 0;
            } else {
                const t2 = (elapsed - APPROACH_END) / (EXPLODE_TIME - APPROACH_END);
                const fusionT = Math.min(1, t2 / 0.75);
                moveRatio = stopRatio + (1.0 - stopRatio) * (fusionT * fusionT);
                whiteRatio = Math.min(1, 0.12 + 0.88 * Math.pow(t2, 0.8));
                vibAmp = (0.04 + 0.12 * Math.sin(t2 * Math.PI)) * CELL;
                if (elapsed >= SN_SUCK_START) {
                    const stNorm = Math.min(1, (elapsed - SN_SUCK_START) / (EXPLODE_TIME - SN_SUCK_START));
                    blockScale = 1.0 - 0.26 * Math.pow(stNorm, 1.5);
                }
            }

            const curX = sp.curExplosionX;
            const curY = sp.curExplosionY;
            const shiftX = curX - sp.focusX;
            const shiftY = curY - sp.focusY;

            if (whiteRatio > 0.2) {
                ctx.save();
                const auraRadius = CELL * (0.6 + whiteRatio * 0.95);
                const grad = ctx.createRadialGradient(curX, curY, 2, curX, curY, auraRadius);
                grad.addColorStop(0, `rgba(255, 255, 255, ${whiteRatio * 0.92})`);
                grad.addColorStop(0.5, `rgba(165, 243, 252, ${whiteRatio * 0.55})`);
                grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(curX, curY, auraRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            sp.colliders.forEach((c, idx) => {
                const curCol = c.fromCol + (sp.col - c.fromCol) * moveRatio;
                const curRow = c.fromRow + (sp.row - c.fromRow) * moveRatio;
                const phaseShift = idx * 2.1;
                const vx = (vibAmp > 0 ? Math.sin(elapsed * 0.085 + phaseShift) * vibAmp : 0) + shiftX;
                const vy = (vibAmp > 0 ? Math.cos(elapsed * 0.105 + phaseShift) * vibAmp : 0) + shiftY;
                drawSupernovaBlock(curCol, curRow, whiteRatio, vx, vy, blockScale);
            });
        }
    });

    // 9. プレイヤー (Stickman) の描画（吹っ飛び & 画面外寸前で進路変更してブラックホール吸引）
    const startCx = GX + (-1.5 + 0.5) * CELL;
    const startBot = GY + (st.startRow + 1) * CELL;
    const targetCornerX = TOTAL_W - 40;
    const targetCornerY = 40;

    if (elapsed < BLOW_START) {
        let trembleX = 0;
        if (elapsed >= APPROACH_END && elapsed < EXPLODE_TIME) {
            trembleX = Math.sin(elapsed * 0.12) * 1.5;
        } else if (elapsed >= EXPLODE_TIME) {
            trembleX = Math.sin(elapsed * 0.25) * 3.5;
        }
        renderStickmanToContext(ctx, startCx + trembleX, startBot, 0, false);
    } else if (elapsed < ESCAPE_POINT) {
        const bt = (elapsed - BLOW_START) / (ESCAPE_POINT - BLOW_START);
        const curCx = startCx + (targetCornerX - startCx) * Math.pow(bt, 0.82);
        const curCy = (startBot - 33) + (targetCornerY - (startBot - 33)) * bt - Math.sin(bt * Math.PI) * 60;
        const rot = -bt * Math.PI * 5.0;

        ctx.save();
        ctx.translate(curCx, curCy);
        ctx.rotate(rot);
        renderStickmanToContext(ctx, 0, 33, 0, true);
        ctx.restore();
    } else if (elapsed < SUCK_MAN_END) {
        const mt = (elapsed - SUCK_MAN_START) / (SUCK_MAN_END - SUCK_MAN_START);
        const angle0 = Math.atan2(targetCornerY - bhY, targetCornerX - bhX);
        const dist0 = Math.hypot(targetCornerX - bhX, targetCornerY - bhY);

        const easeM = Math.pow(mt, 2.2);
        const curDist = dist0 * (1 - easeM);
        const curAngle = angle0 + easeM * Math.PI * 2.6;
        const curCx = bhX + Math.cos(curAngle) * curDist;
        const curCy = bhY + Math.sin(curAngle) * curDist;
        const scale = Math.max(0, 1 - easeM);
        const rot = -Math.PI * 5.0 - easeM * Math.PI * 6.0;
        const alpha = Math.max(0, 1 - Math.pow(mt, 2.0));

        ctx.save();
        ctx.translate(curCx, curCy);
        ctx.rotate(rot);
        ctx.scale(scale, scale);
        if (alpha < 1) ctx.globalAlpha *= alpha;
        renderStickmanToContext(ctx, 0, 33, 0, true);
        ctx.restore();
    } else if (elapsed < DROP_MAN_START) {
        // 吸引完了・消失中
    } else if (elapsed < DROP_MAN_END) {
        const dt = (elapsed - DROP_MAN_START) / (DROP_MAN_END - DROP_MAN_START);
        const b = easeOutBounce(dt);
        const curY = (startBot - 340) + 340 * b;
        renderStickmanToContext(ctx, startCx, curY, 0, true);
    } else {
        let squash = 1;
        if (elapsed < DROP_MAN_END + 180) {
            const stProgress = (elapsed - DROP_MAN_END) / 180;
            squash = 1 - Math.sin(stProgress * Math.PI) * 0.10;
        }
        ctx.save();
        ctx.translate(startCx, startBot);
        ctx.scale(1 + (1 - squash) * 0.6, squash);
        renderStickmanToContext(ctx, 0, 0, 0, false);
        ctx.restore();
    }

    // 10. 超新星爆発エフェクト（全地点でブラックホールに吸われながら爆発し、破片・粒子も吸い込まれる）
    spots.forEach(sp => {
        if (sp.exploded) {
            const t3 = Math.min(1, (elapsed - EXPLODE_TIME) / 1200);
            const baseExpX = sp.explodeX !== undefined ? sp.explodeX : sp.curExplosionX;
            const baseExpY = sp.explodeY !== undefined ? sp.explodeY : sp.curExplosionY;
            const postPull = Math.min(1, Math.pow(t3, 1.1) * 0.85);
            const effX = baseExpX + (bhX - baseExpX) * postPull;
            const effY = baseExpY + (bhY - baseExpY) * postPull;

            // 中心光球コア
            if (t3 < 0.75) {
                ctx.save();
                const coreProgress = t3 / 0.75;
                const coreRadius = CELL * (0.8 + coreProgress * 4.2) * (1 - coreProgress * 0.35);
                const coreAlpha = Math.max(0, 1 - coreProgress);
                const coreGrad = ctx.createRadialGradient(effX, effY, 0, effX, effY, coreRadius);
                coreGrad.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha})`);
                coreGrad.addColorStop(0.35, `rgba(253, 224, 71, ${coreAlpha * 0.85})`);
                coreGrad.addColorStop(0.7, `rgba(56, 189, 248, ${coreAlpha * 0.5})`);
                coreGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
                ctx.fillStyle = coreGrad;
                ctx.beginPath();
                ctx.arc(effX, effY, coreRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // 多重衝撃波リング
            const rings = [
                { delay: 0.0, maxR: 350, width: 14, color: '255, 255, 255' },
                { delay: 0.06, maxR: 280, width: 9, color: '103, 232, 249' },
                { delay: 0.12, maxR: 220, width: 6, color: '240, 171, 252' }
            ];
            rings.forEach(ring => {
                if (t3 > ring.delay) {
                    const rt = Math.min(1, (t3 - ring.delay) / (1 - ring.delay));
                    const easeR = 1 - Math.pow(1 - rt, 2.5);
                    const radius = easeR * ring.maxR;
                    const alpha = Math.max(0, 1 - rt);
                    ctx.save();
                    ctx.strokeStyle = `rgba(${ring.color}, ${alpha})`;
                    ctx.lineWidth = Math.max(1.5, ring.width * (1 - rt * 0.7));
                    ctx.beginPath();
                    ctx.arc(effX, effY, radius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            });

            // 吹き飛ぶブロックデブリ（ブラックホールの重力に引かれて吸い込まれる）
            sp.debris.forEach(d => {
                const dx = bhX - d.x;
                const dy = bhY - d.y;
                const dist = Math.max(18, Math.hypot(dx, dy));
                const pull = 18 / dist;
                d.vx = d.vx * 0.92 + (dx / dist) * pull;
                d.vy = d.vy * 0.92 + (dy / dist) * pull;
                d.x += d.vx;
                d.y += d.vy;
                d.rot += d.vRot;
                const nearFade = dist < 24 ? (dist / 24) : 1;
                d.alpha = Math.max(0, (1 - t3 * 1.15) * nearFade);
                if (d.alpha > 0) {
                    ctx.save();
                    ctx.translate(d.x, d.y);
                    ctx.rotate(d.rot);
                    ctx.globalAlpha = d.alpha;
                    ctx.fillStyle = '#f8c860';
                    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
                    ctx.strokeStyle = '#c06010';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
                    ctx.restore();
                }
            });

            // 超新星エネルギー粒子（ブラックホールへ吸い込まれる）
            sp.particles.forEach(p => {
                const dx = bhX - p.x;
                const dy = bhY - p.y;
                const dist = Math.max(16, Math.hypot(dx, dy));
                const pull = 22 / dist;
                p.vx = p.vx * 0.92 + (dx / dist) * pull;
                p.vy = p.vy * 0.92 + (dy / dist) * pull;
                p.x += p.vx;
                p.y += p.vy;
                p.alpha = Math.max(0, p.alpha - p.decay);
                if (dist < 18) p.alpha *= 0.5;
                if (p.alpha > 0) {
                    ctx.save();
                    ctx.globalAlpha = p.alpha;
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            });
        }
    });

    // 11. パーティクル (土煙など)
    updateAndDrawParticles(ctx);

    ctx.restore();

    // 爆発瞬間の画面全体ホワイトアウト閃光
    const anyExploded = spots.some(sp => sp.exploded);
    if (anyExploded) {
        const t3 = Math.min(1, (elapsed - EXPLODE_TIME) / 1200);
        if (t3 < 0.42) {
            const flashAlpha = Math.pow(1 - t3 / 0.42, 2) * 0.90;
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);
            ctx.restore();
        }
    }
}

// MARK: - Drawing Helpers
function drawBackground() {
    // キャンバスの背景は透明にし、背後の空グラデーションと雲をそのまま透過表示する
}

function renderGroundSection(startX, width, topY) {
    if (width <= 0) return;
    const totalHeight = TOTAL_H - topY;
    if (totalHeight <= 0) return;

    // 草 (Grass)
    ctx.fillStyle = '#54c418';
    ctx.fillRect(startX, topY, width, 10);
    for (let x = startX; x < startX + width; x += 14) {
        ctx.fillRect(x, topY, 7, 4);
    }

    // 土 (Dirt)
    ctx.fillStyle = '#c87830';
    ctx.fillRect(startX, topY + 10, width, totalHeight - 10);

    // レンガ模様 (Brick lines)
    const bw = 26, bh = 13;
    const halfW = bw / 2 - 2; // 0.5マスのレンガ幅（11px）
    ctx.fillStyle = '#a05820';
    for (let row = 0; row * bh < totalHeight - 10; row++) {
        const isStaggered = (row % 2 === 1);
        const off = isStaggered ? bw / 2 : 0;
        const by = topY + 10 + row * bh;
        const blockH = Math.min(bh - 2, topY + totalHeight - by - 2);
        if (blockH <= 0) continue;

        // 通常のフルレンガ
        for (let bx = startX - bw + off; bx < startX + width + bw; bx += bw) {
            if (bx + 1 >= startX && bx + bw - 1 <= startX + width) {
                ctx.fillRect(bx + 1, by + 1, bw - 2, blockH);
            }
        }

        // 下地が多く見える行（レンガが少ない行）の両端に0.5マスのレンガを追加
        if (isStaggered) {
            // 左端の0.5マスレンガ
            ctx.fillRect(startX + 1, by + 1, halfW, blockH);

            // 右端の0.5マスレンガ（フルレンガ列の直後に配置）
            const numFull = Math.floor((width - off) / bw);
            const rightHalfX = startX + off + numFull * bw + 1;
            if (rightHalfX + halfW <= startX + width) {
                ctx.fillRect(rightHalfX, by + 1, halfW, blockH);
            }
        }
    }
}

function drawGroundLeft() {
    const st = getStage();
    const startGroundY = GY + (st.startRow + 1) * CELL;
    renderGroundSection(0, GX, startGroundY);
}

function drawGroundRight() {
    const st = getStage();
    const gridRight = GX + COLS * CELL;
    const goalGroundY = GY + (st.goalRow + 1) * CELL;
    renderGroundSection(gridRight, TOTAL_W - gridRight, goalGroundY);
}

function drawGroundPit() {
    const st = getStage();
    const gridLeft = GX;
    const gridRight = GX + COLS * CELL;
    const startGroundY = GY + (st.startRow + 1) * CELL;
    const goalGroundY = GY + (st.goalRow + 1) * CELL;

    ctx.save();
    const leftShadow = ctx.createLinearGradient(gridLeft, startGroundY, gridLeft + 14, startGroundY);
    leftShadow.addColorStop(0, 'rgba(0,0,0,0.4)');
    leftShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(gridLeft, startGroundY, 14, TOTAL_H - startGroundY);

    const rightShadow = ctx.createLinearGradient(gridRight - 14, goalGroundY, gridRight, goalGroundY);
    rightShadow.addColorStop(0, 'rgba(0,0,0,0)');
    rightShadow.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = rightShadow;
    ctx.fillRect(gridRight - 14, goalGroundY, 14, TOTAL_H - goalGroundY);

    const pitTop = GY + ROWS * CELL;
    const pitGrad = ctx.createLinearGradient(0, pitTop, 0, TOTAL_H);
    pitGrad.addColorStop(0, 'rgba(15, 23, 42, 0.12)');
    pitGrad.addColorStop(1, 'rgba(15, 23, 42, 0.50)');
    ctx.fillStyle = pitGrad;
    ctx.fillRect(gridLeft, pitTop, gridRight - gridLeft, Math.max(0, TOTAL_H - pitTop));
    ctx.restore();
}

function drawGround() {
    drawGroundLeft();
    drawGroundRight();
    drawGroundPit();
}

// MARK: - Ground Pieces Extraction for Black Hole Suction (レンガ・芝の1個ずつ独立吸引)
let cachedGroundPieces = null;
let cachedGroundStageId = null;

function getGroundPieces() {
    const st = getStage();
    if (cachedGroundPieces && cachedGroundStageId === st.id) {
        return cachedGroundPieces;
    }

    const pieces = [];
    const extractSection = (startX, width, topY, isLeft) => {
        if (width <= 0) return;
        const totalHeight = TOTAL_H - topY;
        if (totalHeight <= 0) return;

        // 1. 芝片 (幅14pxごとに分割)
        const gw = 14;
        for (let x = startX; x < startX + width; x += gw) {
            const pw = Math.min(gw, startX + width - x);
            pieces.push({
                type: 'grass',
                x,
                y: topY,
                w: pw,
                h: 10,
                color: '#54c418',
                sprout: (pw >= 7),
                isLeft
            });
        }

        // 2. レンガ片 (renderGroundSection と同一グリッド配置)
        const bw = 26, bh = 13;
        const halfW = bw / 2 - 2;
        for (let row = 0; row * bh < totalHeight - 10; row++) {
            const isStaggered = (row % 2 === 1);
            const off = isStaggered ? bw / 2 : 0;
            const by = topY + 10 + row * bh;
            const blockH = Math.min(bh - 2, topY + totalHeight - by - 2);
            if (blockH <= 0) continue;

            for (let bx = startX - bw + off; bx < startX + width + bw; bx += bw) {
                if (bx + 1 >= startX && bx + bw - 1 <= startX + width) {
                    pieces.push({
                        type: 'brick',
                        x: bx + 1,
                        y: by + 1,
                        w: bw - 2,
                        h: blockH,
                        color: '#a05820',
                        isLeft
                    });
                }
            }

            if (isStaggered) {
                pieces.push({
                    type: 'brick',
                    x: startX + 1,
                    y: by + 1,
                    w: halfW,
                    h: blockH,
                    color: '#a05820',
                    isLeft
                });

                const numFull = Math.floor((width - off) / bw);
                const rightHalfX = startX + off + numFull * bw + 1;
                if (rightHalfX + halfW <= startX + width) {
                    pieces.push({
                        type: 'brick',
                        x: rightHalfX,
                        y: by + 1,
                        w: halfW,
                        h: blockH,
                        color: '#a05820',
                        isLeft
                    });
                }
            }
        }
    };

    const startGroundY = GY + (st.startRow + 1) * CELL;
    extractSection(0, GX, startGroundY, true);

    const gridRight = GX + COLS * CELL;
    const goalGroundY = GY + (st.goalRow + 1) * CELL;
    extractSection(gridRight, TOTAL_W - gridRight, goalGroundY, false);

    cachedGroundPieces = pieces;
    cachedGroundStageId = st.id;
    return pieces;
}

function drawGroundSuckPieces(elapsed, suckStart, suckEnd, bhX, bhY) {
    const pieces = getGroundPieces();
    if (pieces.length === 0) return;

    let minY = Infinity;
    let maxY = -Infinity;
    pieces.forEach(p => {
        const pcy = p.y + p.h / 2;
        if (pcy < minY) minY = pcy;
        if (pcy > maxY) maxY = pcy;
    });
    const yRange = Math.max(1, maxY - minY);

    const totalDuration = suckEnd - suckStart;
    const maxDelay = totalDuration * 0.62; // 全体の62%の時間差で上から順次剥離
    const pDuration = totalDuration - maxDelay;

    // 背景の下地土（Dirt）も上から順に削れ落ちるように描画
    const groundProgress = Math.min(1, Math.max(0, (elapsed - suckStart) / totalDuration));
    if (groundProgress < 1) {
        ctx.save();
        const dirtAlpha = Math.max(0, 1 - Math.pow(groundProgress, 1.8));
        ctx.globalAlpha *= dirtAlpha;
        const st = getStage();
        const startGroundY = GY + (st.startRow + 1) * CELL;
        const goalGroundY = GY + (st.goalRow + 1) * CELL;
        const gridRight = GX + COLS * CELL;

        // 進行度に応じて上端が削り下がる（崖の崩落表現）
        const leftCutY = startGroundY + 10 + (TOTAL_H - (startGroundY + 10)) * (groundProgress * 0.75);
        const rightCutY = goalGroundY + 10 + (TOTAL_H - (goalGroundY + 10)) * (groundProgress * 0.75);

        ctx.fillStyle = '#c87830';
        if (leftCutY < TOTAL_H) {
            ctx.fillRect(0, leftCutY, GX, TOTAL_H - leftCutY);
        }
        if (rightCutY < TOTAL_H) {
            ctx.fillRect(gridRight, rightCutY, TOTAL_W - gridRight, TOTAL_H - rightCutY);
        }
        ctx.restore();
    }

    // 各レンガ・芝ピースの個別描画（上から順に剥離）
    pieces.forEach(p => {
        const pcx = p.x + p.w / 2;
        const pcy = p.y + p.h / 2;
        const normY = (pcy - minY) / yRange;

        // 芝片（最上面）は真っ先に剥がれ、レンガは上段から下段へ崖面からの崩れ要素を交えて吸引
        let normOrder;
        if (p.type === 'grass') {
            normOrder = normY * 0.12;
        } else {
            const cliffEdge = p.isLeft
                ? (1 - Math.min(1, pcx / GX))
                : Math.min(1, (pcx - (GX + COLS * CELL)) / (TOTAL_W - (GX + COLS * CELL)));
            normOrder = 0.10 + normY * 0.78 + cliffEdge * 0.12;
        }

        const pStart = suckStart + normOrder * maxDelay;
        const pEnd = pStart + pDuration;

        if (elapsed < pStart) {
            // まだ吸われていない: 元の位置（剥離直前は微振動）
            let jitterX = 0, jitterY = 0;
            if (elapsed >= pStart - 130) {
                const jt = (elapsed - (pStart - 130)) / 130;
                jitterX = (Math.sin(elapsed * 0.25 + pcx) * 1.4) * jt;
                jitterY = (Math.cos(elapsed * 0.28 + pcy) * 1.4) * jt;
            }

            ctx.save();
            ctx.translate(jitterX, jitterY);
            if (p.type === 'grass') {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, p.w, p.h);
                if (p.sprout) ctx.fillRect(p.x, p.y, Math.min(7, p.w), 4);
            } else if (p.type === 'brick') {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, p.w, p.h);
            }
            ctx.restore();
        } else if (elapsed < pEnd) {
            // 剥がれてブラックホールへ吸引中
            const u = (elapsed - pStart) / pDuration;
            const ease = Math.pow(u, 2.3);

            const curX = pcx + (bhX - pcx) * ease;
            const curY = pcy + (bhY - pcy) * ease;
            const rotDir = (pcx < bhX) ? 1 : -1;
            const rot = ease * Math.PI * 4.2 * rotDir;
            const scale = Math.max(0, 1 - ease);
            const alpha = Math.max(0, 1 - Math.pow(u, 2.0));

            ctx.save();
            ctx.translate(curX, curY);
            ctx.rotate(rot);
            ctx.scale(scale, scale);
            if (alpha < 1) ctx.globalAlpha *= alpha;
            ctx.translate(-p.w / 2, -p.h / 2);

            if (p.type === 'grass') {
                ctx.fillStyle = '#54c418';
                ctx.fillRect(0, 0, p.w, p.h);
                if (p.sprout) ctx.fillRect(0, -3, Math.min(7, p.w), 4);
                ctx.fillStyle = '#c87830';
                ctx.fillRect(0, p.h - 3, p.w, 3);
            } else if (p.type === 'brick') {
                ctx.fillStyle = '#8a4818';
                ctx.fillRect(-1, -1, p.w + 2, p.h + 2);
                ctx.fillStyle = '#a05820';
                ctx.fillRect(0, 0, p.w, p.h);
                ctx.fillStyle = '#b86828';
                ctx.fillRect(1, 1, p.w - 2, 2);
            }
            ctx.restore();
        }
    });
}

// 天井の描画 (Canvaに天井があるステージ用)
function drawCeiling() {
    const st = getStage();
    if (!st.hasCeiling) return;

    const cy = GY;
    const gridLeft = GX;
    const gridRight = GX + COLS * CELL;

    ctx.save();
    // オレンジ色の頑丈な天井バー
    ctx.fillStyle = '#ff9800';
    ctx.fillRect(gridLeft - 12, cy - 6, (gridRight - gridLeft) + 24, 8);

    ctx.strokeStyle = '#e65100';
    ctx.lineWidth = 2;
    ctx.strokeRect(gridLeft - 12, cy - 6, (gridRight - gridLeft) + 24, 8);
    ctx.restore();
}

// Gimmick tile drawing
function drawGimmickTile(gimmick) {
    const x = GX + gimmick.col * CELL;
    const y = GY + gimmick.row * CELL;
    const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
    const isBlockPlacedHere = (grid[gimmick.row] && grid[gimmick.row][gimmick.col]);

    function getDirAngle(dir) {
        if (dir === 'down') return Math.PI / 2;
        if (dir === 'left') return Math.PI;
        if (dir === 'up') return -Math.PI / 2;
        return 0; // default 'right'
    }

    if (gimmick.type === 'dash') {
        // 水色: 矢印の方向に限界まで移動
        ctx.fillStyle = 'rgba(0, 195, 255, 0.22)';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);

        ctx.save();
        ctx.translate(x + CELL / 2, y + CELL / 2);
        ctx.rotate(getDirAngle(gimmick.dir));

        ctx.fillStyle = '#00c0ff';
        ctx.strokeStyle = '#0077b6';
        ctx.lineWidth = 2;

        const shift = pulse * 3;
        ctx.beginPath();
        ctx.moveTo(-16 + shift, -6);
        ctx.lineTo(4 + shift, -6);
        ctx.lineTo(4 + shift, -13);
        ctx.lineTo(16 + shift, 0);
        ctx.lineTo(4 + shift, 13);
        ctx.lineTo(4 + shift, 6);
        ctx.lineTo(-16 + shift, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    } else if (gimmick.type === 'step') {
        // 緑色: 1マスだけ矢印の方向に移動
        ctx.fillStyle = 'rgba(34, 197, 94, 0.22)';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);

        ctx.save();
        ctx.translate(x + CELL / 2, y + CELL / 2);
        ctx.rotate(getDirAngle(gimmick.dir));

        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 2;

        const shift = pulse * 2;
        ctx.beginPath();
        ctx.moveTo(-12 + shift, -5);
        ctx.lineTo(2 + shift, -5);
        ctx.lineTo(2 + shift, -11);
        ctx.lineTo(13 + shift, 0);
        ctx.lineTo(2 + shift, 11);
        ctx.lineTo(2 + shift, 5);
        ctx.lineTo(-12 + shift, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    } else if (gimmick.type === 'switch') {
        // スイッチブロック: 黄色枠 + 現在の向き・移動種別の矢印 + 切替方向数バッジ
        const curDir = getEffectiveGimmickDir(gimmick);
        const moveType = getEffectiveGimmickMoveType(gimmick);
        const seq = getSwitchDirSequence(gimmick);

        ctx.fillStyle = moveType === 'dash' ? 'rgba(0, 195, 255, 0.16)' : 'rgba(250, 204, 21, 0.22)';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);

        ctx.save();
        ctx.translate(x + CELL / 2, y + CELL / 2);
        ctx.rotate(getDirAngle(curDir));

        if (moveType === 'dash') {
            ctx.fillStyle = '#00c0ff';
            ctx.strokeStyle = '#0077b6';
            ctx.lineWidth = 2;
            const shift = pulse * 3;
            ctx.beginPath();
            ctx.moveTo(-16 + shift, -6);
            ctx.lineTo(4 + shift, -6);
            ctx.lineTo(4 + shift, -13);
            ctx.lineTo(16 + shift, 0);
            ctx.lineTo(4 + shift, 13);
            ctx.lineTo(4 + shift, 6);
            ctx.lineTo(-16 + shift, 6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillStyle = '#22c55e';
            ctx.strokeStyle = '#15803d';
            ctx.lineWidth = 2;
            const shift = pulse * 2;
            ctx.beginPath();
            ctx.moveTo(-12 + shift, -5);
            ctx.lineTo(2 + shift, -5);
            ctx.lineTo(2 + shift, -11);
            ctx.lineTo(13 + shift, 0);
            ctx.lineTo(2 + shift, 11);
            ctx.lineTo(2 + shift, 5);
            ctx.lineTo(-12 + shift, 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();

        // くっきりした黄色の枠
        ctx.save();
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 5;
        ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
        ctx.restore();

        // 右上の切替数バッジ（2〜4）
        ctx.save();
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x + CELL - 9, y + 9, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#422006';
        ctx.font = 'bold 8.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(seq.length), x + CELL - 9, y + 9.5);
        ctx.restore();
    } else if (gimmick.purpleBorder) {
        // 矢印のない紫枠マス（ブロックが置かれていない場合のみ背景表示）
        if (!isBlockPlacedHere) {
            ctx.fillStyle = 'rgba(168, 85, 247, 0.16)';
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
    }

    // ブロックが置かれているマスでは紫枠を描画しない（ブロックの周りが紫色になるバグを防止）
    if (gimmick.purpleBorder && !isBlockPlacedHere) {
        ctx.save();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        ctx.restore();
    }
}

// Forbidden tile drawing (赤の斜線)
function drawForbiddenTile(col, row) {
    const x = GX + col * CELL;
    const y = GY + row * CELL;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);

    ctx.save();
    ctx.strokeStyle = '#ef4444';
    const isThick = (col === 4 && row === 1);
    ctx.lineWidth = isThick ? 6 : 4;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x + 6, y + CELL - 6);
    ctx.lineTo(x + CELL - 6, y + 6);
    ctx.stroke();
    ctx.restore();
}

// Laser emitter & beam drawing
function drawLasers(isActive, targetGrid, movingRects) {
    const st = getStage();
    if (!st || !Array.isArray(st.lasers) || st.lasers.length === 0) return;

    const beams = isActive ? computeLaserBeams(targetGrid || grid) : [];

    // 移動中ブロックの補間矩形によるビームの追加クリッピング
    if (isActive && Array.isArray(movingRects) && movingRects.length > 0) {
        beams.forEach(b => {
            const { side } = b.laser;
            movingRects.forEach(mr => {
                if (side === 'left' || side === 'right') {
                    // 横向きレーザー: Yが矩形範囲内にあるか
                    if (b.startY >= mr.y + 1 && b.startY <= mr.y + mr.h - 1) {
                        if (side === 'left' && mr.x >= b.startX - 1 && mr.x < b.endX) {
                            b.endX = mr.x;
                            b.blocked = true;
                        } else if (side === 'right' && (mr.x + mr.w) <= b.startX + 1 && (mr.x + mr.w) > b.endX) {
                            b.endX = mr.x + mr.w;
                            b.blocked = true;
                        }
                    }
                } else {
                    // 縦向きレーザー: Xが矩形範囲内にあるか
                    if (b.startX >= mr.x + 1 && b.startX <= mr.x + mr.w - 1) {
                        if (side === 'top' && mr.y >= b.startY - 1 && mr.y < b.endY) {
                            b.endY = mr.y;
                            b.blocked = true;
                        } else if (side === 'bottom' && (mr.y + mr.h) <= b.startY + 1 && (mr.y + mr.h) > b.endY) {
                            b.endY = mr.y + mr.h;
                            b.blocked = true;
                        }
                    }
                }
            });
        });
    }

    // 1. ビーム描画（起動時のみ）
    if (isActive) {
        const pulse = (Math.sin(Date.now() / 80) + 1) / 2;
        beams.forEach(b => {
            const len = Math.hypot(b.endX - b.startX, b.endY - b.startY);
            if (len < 1) return;

            ctx.save();
            ctx.lineCap = 'round';

            // 外側のシアン発光グロー
            ctx.strokeStyle = `rgba(6, 182, 212, ${0.38 + pulse * 0.16})`;
            ctx.lineWidth = 10 + pulse * 2;
            ctx.beginPath();
            ctx.moveTo(b.startX, b.startY);
            ctx.lineTo(b.endX, b.endY);
            ctx.stroke();

            // 中間層シアン
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(b.startX, b.startY);
            ctx.lineTo(b.endX, b.endY);
            ctx.stroke();

            // 中心の白い高輝度コア
            ctx.strokeStyle = '#ecfeff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.startX, b.startY);
            ctx.lineTo(b.endX, b.endY);
            ctx.stroke();

            // ブロック面で受け止められた場合のヒットエフェクト
            if (b.blocked) {
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#22d3ee';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(b.endX, b.endY, 4 + pulse * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
    }

    // 2. レーザー発射口（本体）の描画（常に表示）
    st.lasers.forEach(laser => {
        if (!laser || typeof laser.col !== 'number' || typeof laser.row !== 'number') return;
        const cellX = GX + laser.col * CELL;
        const cellY = GY + laser.row * CELL;
        let cx = cellX + CELL / 2;
        let cy = cellY + CELL / 2;
        let angle = 0;

        if (laser.side === 'top') {
            cx = cellX + CELL / 2;
            cy = cellY;
            angle = Math.PI / 2; // 下向き発射
        } else if (laser.side === 'bottom') {
            cx = cellX + CELL / 2;
            cy = cellY + CELL;
            angle = -Math.PI / 2; // 上向き発射
        } else if (laser.side === 'left') {
            cx = cellX;
            cy = cellY + CELL / 2;
            angle = 0; // 右向き発射
        } else if (laser.side === 'right') {
            cx = cellX + CELL;
            cy = cellY + CELL / 2;
            angle = Math.PI; // 左向き発射
        } else {
            return;
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // 本体の台座（マスの枠に取り付く形状）
        ctx.fillStyle = '#0f766e';
        ctx.strokeStyle = '#134e4a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-4, -10, 10, 20, 3);
        ctx.fill();
        ctx.stroke();

        // 発射レンズ部分
        ctx.fillStyle = isActive ? '#22d3ee' : '#64748b';
        ctx.beginPath();
        ctx.arc(5, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

function drawGridLines() {
    ctx.strokeStyle = 'rgba(0,0,60,0.13)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(GX + c * CELL, GY);
        ctx.lineTo(GX + c * CELL, GY + ROWS * CELL);
        ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(GX, GY + r * CELL);
        ctx.lineTo(GX + COLS * CELL, GY + r * CELL);
        ctx.stroke();
    }
}

function drawKeyGuide(col, row) {
    // ユーザー要望によりグリッド内のキー文字（Q, W, E...）は非表示化
    return;
}

// Mario-style brick block (ポンと即座に配置されるシンプルなレンダリング)
function drawMarioBlock(col, row) {
    const x = GX + col * CELL, y = GY + row * CELL;
    const p = 2;
    ctx.save();

    const isGridAligned = (Math.abs(col - Math.round(col)) < 0.01 && Math.abs(row - Math.round(row)) < 0.01);
    const g = isGridAligned ? getGimmick(Math.round(col), Math.round(row)) : null;
    const hasArrow = g && (g.type === 'dash' || g.type === 'step' || g.type === 'switch');

    if (hasArrow) {
        // 矢印の上のブロックは、矢印の形状をくり抜いて下地本来の色（水色・緑色）を100%忠実に露出させる
        const arrowType = g.type === 'switch' ? getEffectiveGimmickMoveType(g) : g.type;
        const arrowDir = getEffectiveGimmickDir(g);
        const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
        const shift = (arrowType === 'dash') ? pulse * 3 : pulse * 2;

        function getDirAngle(dir) {
            if (dir === 'down') return Math.PI / 2;
            if (dir === 'left') return Math.PI;
            if (dir === 'up') return -Math.PI / 2;
            return 0;
        }

        ctx.beginPath();
        // 1. 全体領域
        ctx.rect(0, 0, TOTAL_W, TOTAL_H);

        // 2. くり抜く矢印の形状パス（矢印の輪郭線まで綺麗に見えるよう1px余裕を持たせる）
        ctx.save();
        ctx.translate(x + CELL / 2, y + CELL / 2);
        ctx.rotate(getDirAngle(arrowDir));

        if (arrowType === 'dash') {
            ctx.moveTo(-17 + shift, -7);
            ctx.lineTo(5 + shift, -7);
            ctx.lineTo(5 + shift, -14);
            ctx.lineTo(18 + shift, 0);
            ctx.lineTo(5 + shift, 14);
            ctx.lineTo(5 + shift, 7);
            ctx.lineTo(-17 + shift, 7);
            ctx.closePath();
        } else if (arrowType === 'step') {
            ctx.moveTo(-13 + shift, -6);
            ctx.lineTo(3 + shift, -6);
            ctx.lineTo(3 + shift, -12);
            ctx.lineTo(15 + shift, 0);
            ctx.lineTo(3 + shift, 12);
            ctx.lineTo(3 + shift, 6);
            ctx.lineTo(-13 + shift, 6);
            ctx.closePath();
        }
        ctx.restore();

        // 偶奇規則（evenodd）で矢印領域をクリッピングから除外（くり抜き）
        ctx.clip('evenodd');

        // ブロック自体の透明度
        ctx.globalAlpha *= 0.58;
    }

    ctx.fillStyle = '#e8a020';
    ctx.fillRect(x + p, y + p, CELL - p * 2, CELL - p * 2);
    ctx.fillStyle = '#f8c860';
    ctx.fillRect(x + p, y + p, CELL - p * 2, 5);
    ctx.fillRect(x + p, y + p, 5, CELL - p * 2, 5);
    ctx.strokeStyle = '#c06010';
    ctx.fillStyle = '#c06010';
    ctx.lineWidth = p;
    ctx.strokeRect(x + p, y + p, CELL - p * 2, CELL - p * 2);
    // cross
    ctx.strokeStyle = '#c06010';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + CELL / 2, y + p); ctx.lineTo(x + CELL / 2, y + CELL / 2);
    ctx.moveTo(x + p, y + CELL / 2); ctx.lineTo(x + CELL - p, y + CELL / 2);
    ctx.stroke();
    ctx.restore();

    if (g && g.type === 'switch') {
        ctx.save();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        ctx.restore();
    }
}

// Warp-pipe / Start platform on left
function drawPipe() {
    const st = getStage();
    const px = GX - 78;
    const py = GY + st.startRow * CELL + 2;
    const groundY = GY + (st.startRow + 1) * CELL;
    const pw = 60;
    // 地面の草の上面（groundY）にぴったり合わせて高さを決定
    const ph = groundY - py;

    // 土管の本体
    ctx.fillStyle = '#44aa00';
    ctx.fillRect(px, py, pw, ph);

    // 土管の上リム
    ctx.fillStyle = '#66cc22';
    ctx.fillRect(px - 5, py, pw + 10, 14);

    // 土管の右側の影
    ctx.fillStyle = '#226600';
    ctx.fillRect(px + pw - 10, py, 10, ph);
    ctx.fillRect(px + pw, py, 5, 14);

    // STARTテキスト
    ctx.fillStyle = '#fff';
    ctx.font = '5px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('START', px + pw / 2, py - 14);
    ctx.textAlign = 'left';
}

// Flag pole + goal block on right
let goalPulse = 0;
function drawGoalUpperWall(st) {
    const wallTopY = GY;
    const wallBottomY = GY + (st.goalRow - 1) * CELL;
    if (wallBottomY <= wallTopY) return;

    const wx = GX + COLS * CELL;
    const ww = 7;
    const wh = wallBottomY - wallTopY;

    ctx.save();
    ctx.fillStyle = 'rgba(71, 85, 105, 0.36)';
    ctx.fillRect(wx, wallTopY, ww, wh);

    // 左端の控えめなハイライトと外枠
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(wx + 1, wallTopY + 1, 1.5, Math.max(0, wh - 2));

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, wallTopY, ww, wh);

    // 1マス間隔のごく薄い目地線
    ctx.beginPath();
    for (let y = wallTopY + CELL; y < wallBottomY; y += CELL) {
        ctx.moveTo(wx + 1, y);
        ctx.lineTo(wx + ww - 1, y);
    }
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function drawGoal() {
    const st = getStage();
    drawGoalUpperWall(st);
    goalPulse = (Date.now() % 1200) / 1200;
    const bx = GX + COLS * CELL;
    const by = GY + st.goalRow * CELL;
    const bw = 56, bh = CELL;

    // Goal block
    const alpha = 0.18 + Math.sin(goalPulse * Math.PI * 2) * 0.14;
    ctx.fillStyle = `rgba(255,244,60,${alpha + 0.12})`;
    ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
    ctx.strokeStyle = '#ffe060';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);

    // Purple frame for goal block
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#ffe060';
    ctx.font = '5px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', bx + bw / 2, by + bh / 2 + 2);
    ctx.textAlign = 'left';
}

// MARK: - Visual Particles Engine (Juiciness: 土煙 & ゴールスパークル)
function spawnDust(gridX, gridY) {
    const px = GX + gridX * CELL + CELL / 2;
    const py = GY + (gridY + 1) * CELL;
    for (let i = 0; i < 7; i++) {
        gameParticles.push({
            type: 'dust',
            x: px + (Math.random() - 0.5) * 16,
            y: py - 2 + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 1.6,
            vy: -0.4 - Math.random() * 0.8,
            size: 3.2 + Math.random() * 3.2,
            alpha: 1.0,
            maxLife: 20 + Math.random() * 10,
            life: 0
        });
    }
}

function spawnGoalSparkles(gridX, gridY) {
    const px = GX + gridX * CELL + CELL / 2;
    const py = GY + gridY * CELL + CELL / 2;
    const colors = ['#fde047', '#fbbf24', '#ffffff', '#60a5fa', '#f43f5e', '#a855f7', '#34d399'];
    for (let i = 0; i < 45; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 6.0;
        gameParticles.push({
            type: 'spark',
            x: px,
            y: py,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.8,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 3.0 + Math.random() * 4.5,
            alpha: 1.0,
            maxLife: 45 + Math.random() * 25,
            life: 0
        });
    }
}

function updateAndDrawParticles(ctx) {
    if (gameParticles.length === 0) return;
    for (let i = gameParticles.length - 1; i >= 0; i--) {
        const p = gameParticles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha = Math.max(0, 1 - (p.life / p.maxLife));

        if (p.type === 'dust') {
            p.size *= 0.96;
            ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.65})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'spark') {
            p.vy += 0.08; // gravity
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            // 白い芯
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (p.life >= p.maxLife) {
            gameParticles.splice(i, 1);
        }
    }
}

// Stickman render to any canvas context
function renderStickmanToContext(targetCtx, cx, bot, walkCycle = 0, isJump = false) {
    targetCtx.save();
    targetCtx.imageSmoothingEnabled = false;

    // Hat brim
    targetCtx.fillStyle = '#e83000';
    targetCtx.fillRect(cx - 10, bot - 58, 20, 6);

    // Hat crown
    targetCtx.fillRect(cx - 8, bot - 66, 16, 9);

    // Face
    targetCtx.fillStyle = '#f8c080';
    targetCtx.fillRect(cx - 8, bot - 52, 16, 14);

    // Eyes
    targetCtx.fillStyle = '#1a0a00';
    targetCtx.fillRect(cx - 5, bot - 49, 3, 3);
    targetCtx.fillRect(cx + 3, bot - 49, 3, 3);

    // Moustache
    targetCtx.fillStyle = '#7a3800';
    targetCtx.fillRect(cx - 6, bot - 43, 12, 3);

    // Body (overalls)
    targetCtx.fillStyle = '#4060e0';
    targetCtx.fillRect(cx - 9, bot - 39, 18, 20);

    // Shirt (red)
    targetCtx.fillStyle = '#e83000';
    targetCtx.fillRect(cx - 8, bot - 37, 7, 12);
    targetCtx.fillRect(cx + 2, bot - 37, 7, 12);

    if (isJump) {
        targetCtx.fillStyle = '#4060e0';
        targetCtx.fillRect(cx - 8, bot - 19, 7, 10);
        targetCtx.fillRect(cx + 2, bot - 19, 7, 10);
        targetCtx.fillStyle = '#802000';
        targetCtx.fillRect(cx - 9, bot - 11, 9, 9);
        targetCtx.fillRect(cx + 1, bot - 11, 9, 9);
    } else {
        const angle = walkCycle;
        const leftX = Math.sin(angle) * 5;
        const rightX = -Math.sin(angle) * 5;
        const leftY = Math.sin(angle) > 0 ? Math.sin(angle) * 5 : 0;
        const rightY = Math.sin(angle) < 0 ? -Math.sin(angle) * 5 : 0;

        // Left leg
        targetCtx.fillStyle = '#4060e0';
        targetCtx.fillRect(cx - 8 + leftX, bot - 19 - leftY, 6, 14);
        targetCtx.fillStyle = '#802000';
        targetCtx.fillRect(cx - 9 + leftX, bot - 7 - leftY, 8, 7);

        // Right leg
        targetCtx.fillStyle = '#4060e0';
        targetCtx.fillRect(cx + 2 + rightX, bot - 19 - rightY, 6, 14);
        targetCtx.fillStyle = '#802000';
        targetCtx.fillRect(cx + 1 + rightX, bot - 7 - rightY, 8, 7);
    }

    targetCtx.restore();
}

// Stickman render on main game canvas
function drawStickman(gx_pos, gy_pos) {
    const cx = GX + (gx_pos + 0.5) * CELL;
    // 左側の地面の上は草の上面に、ブロック上はブロック上面に足裏を合わせる
    const onLeftGround = gx_pos < -0.5 && gy_pos === getStage().startRow;
    const bot = GY + (gy_pos + 1) * CELL - (onLeftGround ? 0 : 2);
    const isJump = man.state === 'jump';
    renderStickmanToContext(ctx, cx, bot, man.walkCycle, isJump);
}

// Render exact game stickman to the home title hero canvas
function renderHeroCharacter() {
    const heroCanvas = document.getElementById('heroCharacterCanvas');
    if (!heroCanvas) return;
    const hCtx = heroCanvas.getContext('2d');
    hCtx.clearRect(0, 0, heroCanvas.width, heroCanvas.height);
    // cx = 18, bot = 68 (キャンバス 36x70 の中央にぴったり描画)
    renderStickmanToContext(hCtx, 18, 68, 0, false);
}

// MARK: - Solution Overlay Drawing (答え合わせ用オレンジ色マス)
function drawSolutionOverlay() {
    if (!showSolution) return;
    const st = getStage();
    if (!st.solution || st.solution.length === 0) return;

    const pulse = (Math.sin(Date.now() / 250) + 1) / 2;

    st.solution.forEach(sol => {
        const x = GX + sol.col * CELL;
        const y = GY + sol.row * CELL;
        const isMatched = grid[sol.row][sol.col];

        ctx.save();

        if (isMatched) {
            // すでにプレイヤーが正しく配置している場合：緑のハイライト
            ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);

            ctx.fillStyle = '#22c55e';
            ctx.font = 'bold 16px "Press Start 2P", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', x + CELL / 2, y + CELL / 2);
        } else {
            // 正解のオレンジマス（半透明オレンジ＋パルス効果）
            ctx.fillStyle = `rgba(245, 158, 11, ${0.48 + pulse * 0.22})`;
            ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);

            ctx.strokeStyle = `rgba(217, 119, 6, ${0.85 + pulse * 0.15})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('答', x + CELL / 2, y + CELL / 2);
        }

        ctx.restore();
    });
}

function checkSolutionMatch() {
    const st = getStage();
    if (!st.solution) return { isMatch: false, matchCount: 0, totalSolution: 0, extraCount: 0 };

    let matchCount = 0;
    let extraCount = 0;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const shouldHave = st.solution.some(s => s.col === c && s.row === r);
            const actualHave = grid[r][c];
            if (shouldHave && actualHave) {
                matchCount++;
            } else if (!shouldHave && actualHave) {
                extraCount++;
            }
        }
    }

    return {
        isMatch: (matchCount === st.solution.length && extraCount === 0),
        matchCount: matchCount,
        totalSolution: st.solution.length,
        extraCount: extraCount
    };
}

function updateAnswerBtnUI() {
    if (!answerBtn) return;
    if (showSolution) {
        answerBtn.classList.add('active');
        answerBtn.title = '答え合わせガイドを隠す (💡 / .キー)';
    } else {
        answerBtn.classList.remove('active');
        answerBtn.title = '答え合わせガイドを表示 (💡 / .キー)';
    }
}

function toggleSolution() {
    showSolution = !showSolution;
    updateAnswerBtnUI();

    if (showSolution) {
        usedHintInStage = true;
        const check = checkSolutionMatch();
        if (check.isMatch) {
            statusBar.innerHTML = '<span class="status-clear">【答え合わせ】正解の配置と一致しています！（※ヒント使用）</span>';
        } else {
            statusBar.innerHTML = `<span class="status-place">【答え合わせ】オレンジ枠を表示中 (${check.matchCount}/${check.totalSolution} 正解) ※自力クリア対象外</span>`;
            if (hintText) hintText.textContent = 'オレンジ枠に合わせてブロックを配置してみよう';
        }
    } else {
        updateBlockBadge();
        if (hintText) hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
    }
    render();
}

function applySolutionToGrid() {
    const st = getStage();
    if (!st.solution) return;

    usedHintInStage = true;
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    st.solution.forEach(sol => {
        grid[sol.row][sol.col] = true;
        actionHistory.push({ row: sol.row, col: sol.col, remove: false });
    });

    showSolution = true;
    updateAnswerBtnUI();
    updateBlockBadge();
    statusBar.innerHTML = '<span class="status-clear">答えのブロックを配置しました！スタートで確認しよう！</span>';
    render();
}

// MARK: - Main Render
function render() {
    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);
    drawBackground();
    drawGround();

    // Light sky overlay on grid area
    ctx.fillStyle = 'rgba(100,150,255,0.06)';
    ctx.fillRect(GX, GY, COLS * CELL, ROWS * CELL);

    // Draw grid lines
    drawGridLines();
    drawCeiling();

    const st = getStage();

    // Draw gimmick tiles (水色 / 緑色矢印)
    st.gimmicks.forEach(g => {
        drawGimmickTile(g);
    });

    // Draw forbidden tiles (赤の斜線 - 矢印の上にも重なって見えるようギミックの後に描画)
    st.forbidden.forEach(f => {
        drawForbiddenTile(f.col, f.row);
    });

    // Draw solution overlay (答え合わせ)
    drawSolutionOverlay();

    // Draw placed blocks
    const now = performance.now();
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) {
                // Check if this block is currently animating
                const anim = slidingBlocks.find(b => b.toCol === c && (b.toRow !== undefined ? b.toRow === r : b.row === r));
                if (anim) {
                    const elapsed = now - anim.startTime;
                    const progress = Math.min(1, elapsed / anim.duration);

                    let currentC = anim.fromCol;
                    let currentR = (anim.fromRow !== undefined) ? anim.fromRow : r;

                    if (anim.path && anim.path.length > 1) {
                        const totalSegments = anim.path.length - 1;
                        const segProgress = progress * totalSegments;
                        const segIdx = Math.min(Math.floor(segProgress), totalSegments - 1);
                        const subT = segProgress - segIdx;
                        const p0 = anim.path[segIdx];
                        const p1 = anim.path[segIdx + 1];
                        currentC = p0.col + (p1.col - p0.col) * subT;
                        currentR = p0.row + (p1.row - p0.row) * subT;
                    } else {
                        currentC = anim.fromCol + (anim.toCol - anim.fromCol) * progress;
                        currentR = (anim.fromRow !== undefined && anim.toRow !== undefined)
                            ? anim.fromRow + (anim.toRow - anim.fromRow) * progress
                            : (anim.row !== undefined ? anim.row : r);
                    }

                    drawMarioBlock(currentC, currentR);
                    if (progress >= 1) {
                        slidingBlocks = slidingBlocks.filter(b => b !== anim);
                    }
                } else {
                    drawMarioBlock(c, r);
                }
            }
            if (phase === 'place') drawKeyGuide(c, r);
        }
    }

    // Draw lasers (起動中のみビーム描画、本体は常に描画)
    drawLasers(phase !== 'place', grid);

    // Draw pipe & goal
    drawPipe();
    drawGoal();

    // Draw character or respawn animation
    if (phase === 'respawning') {
        drawRespawnTrail(now);
    } else if (phase === 'place') {
        drawStickman(-1.5, st.startRow);
    } else {
        drawStickman(man.x, man.y);
    }

    // Draw particles (土煙・スターバースト等)
    updateAndDrawParticles(ctx);
}

// MARK: - Route Solver & Simulation (Character moves rightward)
function solveRoute() {
    return applyLaserCollisionsToKeyframes(solveRouteRaw());
}

function solveRouteRaw() {
    const st = getStage();
    const keyframes = [];
    let curX = -1.5;
    let curY = st.startRow;
    let curTime = 0;

    keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });

    for (let c = -1; c < COLS; c++) {
        const nextCol = c + 1;
        const curKfIdx = keyframes.length - 1;

        // Reach goal column
        if (nextCol === COLS) {
            if (curY === st.goalRow) {
                // 水平歩行でゴールイン！
                keyframes[curKfIdx].type = 'walk';
                curTime += (COLS - 0.5 + 0.15 - curX) / WALK_SPEED * 16.67;
                curX = COLS - 0.5 + 0.15;
                keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                return keyframes;
            } else if (curY === st.goalRow + 1) {
                // ゴール手前の左下（高さ1マス差）から1マス登ってゴールイン！
                keyframes[curKfIdx].type = 'jump';
                curTime += (COLS - 0.5 + 0.15 - curX) / JUMP_SPEED * 16.67;
                curX = COLS - 0.5 + 0.15;
                curY = st.goalRow;
                keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                return keyframes;
            } else if (curY === st.goalRow - 1) {
                // グリッドを出た後に1マス下がってゴールイン！（S5, S9, S17等）
                keyframes[curKfIdx].type = 'walk';
                curTime += (COLS - 0.15 - curX) / WALK_SPEED * 16.67;
                curX = COLS - 0.15;
                keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
                curTime += 60;
                curY = st.goalRow;
                keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
                curTime += (COLS - 0.5 + 0.15 - curX) / WALK_SPEED * 16.67;
                curX = COLS - 0.5 + 0.15;
                keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                return keyframes;
            } else {
                // それ以外の高さ（上空 curY < st.goalRow や 2マス以上下）は右壁衝突でアウト！
                // 上から落下してゴールする不正侵入を完全に防止
                const wallHitX = COLS - 0.65;
                keyframes[curKfIdx].type = 'walk';
                curTime += Math.max(0.05, wallHitX - curX) / WALK_SPEED * 16.67;
                curX = wallHitX;
                keyframes.push({ x: curX, y: curY, type: 'crash', time: curTime });
                curTime += 40;
                keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                return keyframes;
            }
        }

        const blockAhead = getBlock(nextCol, curY);
        if (blockAhead) {
            // Jump
            const jumpY = curY - 1;
            // 天井があるステージ（st.hasCeiling）のみ画面上部(jumpY < 0)を天井クラッシュとする
            const ceilHit = st.hasCeiling && (jumpY < 0);
            const jumpBlocked = (jumpY >= 0) && getBlock(nextCol, jumpY);
            const ceilBlocked = (c >= 0 && curY - 1 >= 0) && getBlock(c, curY - 1);

            if (ceilHit || jumpBlocked || ceilBlocked) {
                // 壁・天井に衝突 -> 即アウト！
                keyframes[curKfIdx].type = 'crash';
                const cd = Math.min(0.35, nextCol - curX - 0.05);
                curTime += Math.max(cd, 0.05) / WALK_SPEED * 16.67;
                curX = Math.min(curX + Math.max(cd, 0.05), nextCol - 0.02);
                keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                return keyframes;
            }

            // Successful Jump
            keyframes[curKfIdx].type = 'jump';
            curTime += (nextCol - curX) / JUMP_SPEED * 16.67;
            curX = nextCol;
            curY = jumpY;
            keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
            continue;
        }

        // Walk or Fall
        // 次の列の足元にブロックがあるか
        const hasFloor = getBlock(nextCol, curY + 1);
        if (hasFloor) {
            keyframes[curKfIdx].type = 'walk';
            curTime += (nextCol - curX) / WALK_SPEED * 16.67;
            curX = nextCol;
            keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
            continue;
        }

        // 足元にブロックがない場合、下方の足場(ブロック)を探す
        let landY = null;
        for (let y = curY + 1; y < ROWS; y++) {
            if (getBlock(nextCol, y + 1)) {
                landY = y;
                break;
            }
        }

        if (landY !== null) {
            // 下方のブロックに着地
            keyframes[curKfIdx].type = 'walk';
            curTime += (nextCol - curX) / WALK_SPEED * 16.67;
            curX = nextCol;
            keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
            curTime += (landY - curY) * 60;
            curY = landY;
            keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
        } else {
            // 下にブロックがない！奈落（くり抜かれた地面の穴）へ落下してミス！
            keyframes[curKfIdx].type = 'walk';
            curTime += (nextCol - curX) / WALK_SPEED * 16.67;
            curX = nextCol;
            keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
            curTime += (ROWS + 1.2 - curY) * 55;
            curY = ROWS + 1.2;
            keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
            return keyframes;
        }
    }

    keyframes[keyframes.length - 1].type = 'fail';
    return applyLaserCollisionsToKeyframes(keyframes);
}

function applyLaserCollisionsToKeyframes(keyframes) {
    const rawBeams = computeLaserBeams(grid);
    const activeBeams = rawBeams
        .filter(b => Math.hypot(b.endX - b.startX, b.endY - b.startY) >= 1)
        .map(b => ({
            minX: Math.min(b.startX, b.endX) - 2,
            maxX: Math.max(b.startX, b.endX) + 2,
            minY: Math.min(b.startY, b.endY) - 2,
            maxY: Math.max(b.startY, b.endY) + 2
        }));
    if (activeBeams.length === 0 || keyframes.length < 2) return keyframes;

    const SUB_STEPS = 24;
    for (let i = 0; i < keyframes.length - 1; i++) {
        const prevKf = keyframes[i];
        const nextKf = keyframes[i + 1];
        for (let s = 0; s <= SUB_STEPS; s++) {
            const ratio = s / SUB_STEPS;
            const x = prevKf.x + (nextKf.x - prevKf.x) * ratio;
            const y = (prevKf.type === 'jump')
                ? prevKf.y + (nextKf.y - prevKf.y) * ratio - 4 * 0.5 * ratio * (1 - ratio)
                : prevKf.y + (nextKf.y - prevKf.y) * ratio;
            const time = prevKf.time + (nextKf.time - prevKf.time) * ratio;

            const px = GX + (x + 0.5) * CELL;
            const pyBot = GY + (y + 1) * CELL;
            const charLeft = px - 7;
            const charRight = px + 7;
            const charTop = pyBot - 40;
            const charBot = pyBot - 2;

            const hit = activeBeams.some(b =>
                charRight >= b.minX && charLeft <= b.maxX &&
                charBot >= b.minY && charTop <= b.maxY
            );
            if (hit) {
                const truncated = keyframes.slice(0, i + 1);
                if (s > 0) {
                    truncated.push({ x, y, type: 'fail', time });
                } else {
                    truncated[truncated.length - 1] = { ...truncated[truncated.length - 1], type: 'fail' };
                }
                return truncated;
            }
        }
    }
    return keyframes;
}

function startRun() {
    phase = 'run';
    man = makeMan();
    currentRoute = solveRoute();
    routeStartTime = null;
    prevTime = null;
    lastKfIndex = -1;
    animate();
}

function step(ts) {
    if (phase !== 'run') return;

    const currentTime = ts || performance.now();
    if (routeStartTime === null) {
        routeStartTime = currentTime;
    }
    const elapsed = Math.max(0, currentTime - routeStartTime);

    let idx = 0;
    while (idx < currentRoute.length - 1 && currentRoute[idx + 1].time <= elapsed) {
        idx++;
    }

    let prevKf = currentRoute[idx];
    let nextKf = (idx < currentRoute.length - 1) ? currentRoute[idx + 1] : null;

    // キーフレーム切り替わり時の土煙エフェクト
    if (lastKfIndex !== idx) {
        if (lastKfIndex >= 0 && currentRoute[lastKfIndex].type === 'fall' && prevKf.type === 'walk') {
            spawnDust(prevKf.x, prevKf.y);
        }
        if (prevKf.type === 'jump') {
            spawnDust(prevKf.x, prevKf.y);
        }
        lastKfIndex = idx;
    }

    if (nextKf === null) {
        man.x = prevKf.x;
        man.y = prevKf.y;
        man.state = (prevKf.type === 'done' || prevKf.type === 'clear') ? 'done' : 'fail';

        if (prevKf.type === 'done' || prevKf.type === 'clear') {
            phase = 'clear';
            spawnGoalSparkles(man.x, man.y);
            render();
            showClear();
        } else {
            // ミス時：即座に「ｼｭｩｲｰﾝ」演出を開始してスタート位置へスムーズに戻る
            triggerRespawnAnimation(man.x, man.y);
        }
        return;
    }

    const denom = nextKf.time - prevKf.time;
    const ratio = denom > 0 ? (elapsed - prevKf.time) / denom : 0;

    man.x = prevKf.x + (nextKf.x - prevKf.x) * ratio;

    if (prevKf.type === 'jump') {
        man.y = prevKf.y + (nextKf.y - prevKf.y) * ratio - 4 * 0.5 * ratio * (1 - ratio);
        man.state = 'jump';
    } else if (prevKf.type === 'fall') {
        man.y = prevKf.y + (nextKf.y - prevKf.y) * ratio;
        man.state = 'jump';
    } else if (prevKf.type === 'crash') {
        man.y = prevKf.y + (nextKf.y - prevKf.y) * ratio;
        man.state = 'walk';
    } else {
        man.y = prevKf.y + (nextKf.y - prevKf.y) * ratio;
        man.state = 'walk';
    }

    man.walkCycle += 0.15;
    render();
    animId = requestAnimationFrame(step);
}

function animate() {
    animId = requestAnimationFrame(step);
}

// MARK: - Respawn Animation ("ｼｭｩｲｰﾝ" スムーズリスポーン)
let respawnEffect = null;

function triggerRespawnAnimation(failX, failY) {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    phase = 'respawning';
    startBtn.disabled = true;
    statusBar.innerHTML = '<span class="status-fail">ミス！ ｼｭｩｲｰﾝ... リトライ</span>';

    const st = getStage();
    const targetX = -1.5;
    const targetY = st.startRow;
    const startTime = performance.now();
    const duration = 850; // ゆっくり滑らかに移動

    respawnEffect = {
        failX,
        failY,
        targetX,
        targetY,
        currentX: failX,
        currentY: failY,
        startTime,
        duration,
        particles: []
    };

    // 初期弾けパーティクル
    for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.2 + Math.random() * 2.8;
        respawnEffect.particles.push({
            x: GX + (failX + 0.5) * CELL,
            y: GY + (failY + 0.5) * CELL,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            life: 1.0,
            color: (i % 2 === 0) ? '#38bdf8' : '#fbbf24',
            size: 3 + Math.random() * 3
        });
    }

    function respawnLoop(now) {
        if (phase !== 'respawning' || !respawnEffect) return;

        const elapsed = now - respawnEffect.startTime;
        const progress = Math.min(1, elapsed / respawnEffect.duration);

        // smooth cubic ease-in-out
        const t = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        respawnEffect.currentX = respawnEffect.failX + (respawnEffect.targetX - respawnEffect.failX) * t;
        // 上空を滑空するアーチカーブ
        const arch = Math.sin(progress * Math.PI) * -0.7;
        respawnEffect.currentY = respawnEffect.failY + (respawnEffect.targetY - respawnEffect.failY) * t + arch;

        // 飛行中のキラキラトレイル
        for (let k = 0; k < 2; k++) {
            respawnEffect.particles.push({
                x: GX + (respawnEffect.currentX + 0.5) * CELL + (Math.random() - 0.5) * 8,
                y: GY + (respawnEffect.currentY + 0.5) * CELL + (Math.random() - 0.5) * 8,
                vx: (Math.random() - 0.5) * 1.2,
                vy: (Math.random() - 0.5) * 1.2,
                life: 1.0,
                color: (Math.random() > 0.5) ? '#38bdf8' : '#f59e0b',
                size: 2.5 + Math.random() * 3
            });
        }

        render();

        if (progress < 1) {
            requestAnimationFrame(respawnLoop);
        } else {
            completeRespawn();
        }
    }

    requestAnimationFrame(respawnLoop);
}

function completeRespawn() {
    respawnEffect = null;

    // スタート前のブロック配置を自動復元
    if (originalGrid) {
        grid = originalGrid.map(r => [...r]);
    }
    slidingBlocks = [];
    blockAnimationRounds = [];
    currentRoundIndex = 0;
    resetSwitchStates();
    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;

    statusBar.innerHTML = '<span class="status-place">ブロックを再配置 (Space: 開始 / m: 全クリア)</span>';
    if (hintText) hintText.textContent = 'Spaceキーで即座に再スタートできます！';
    updateBlockBadge();
    render();
}

function drawRespawnTrail(now) {
    if (!respawnEffect) return;

    ctx.save();

    // パーティクルの更新と描画
    respawnEffect.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025; // 軌跡を長めに残す
    });
    respawnEffect.particles = respawnEffect.particles.filter(p => p.life > 0);

    // 光のオーブ本体（ｼｭｩｲｰﾝと飛ぶ光球）
    const ox = GX + (respawnEffect.currentX + 0.5) * CELL;
    const oy = GY + (respawnEffect.currentY + 0.5) * CELL;

    // 外側のグロー
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, 24);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.25, 'rgba(56, 189, 248, 0.85)');
    grad.addColorStop(0.65, 'rgba(245, 158, 11, 0.4)');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, 24, 0, Math.PI * 2);
    ctx.fill();

    // 中心の強い光核
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox, oy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// MARK: - View & Screen Management
let currentView = 'home'; // 'home' | 'select' | 'game'

function switchView(viewName) {
    currentView = viewName;
    const views = {
        home: document.getElementById('homeScreen'),
        select: document.getElementById('selectScreen'),
        game: document.getElementById('gameScreen')
    };

    Object.keys(views).forEach(key => {
        if (views[key]) {
            if (key === viewName) {
                views[key].classList.add('active');
            } else {
                views[key].classList.remove('active');
            }
        }
    });

    if (viewName === 'game') {
        render();
    } else if (viewName === 'select') {
        updateSelectScreenUI();
    } else if (viewName === 'home') {
        renderHeroCharacter();
    }
}

// MARK: - Cleared Stages Storage
// 共有URLから開いたステージはセッション内メモリに保持し、自作ステージは別キーに分離して記録する
let sharedMode = false;
let sharedClearedMemory = [];
let sharedRecordsMemory = {};
let customMode = false;

function getClearedStages() {
    if (sharedMode) return sharedClearedMemory;
    const key = customMode ? 'hako_custom_cleared_stages_v1' : 'hako_cleared_stages';
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : [];
    } catch (e) {
        return [];
    }
}

function markStageCleared(idx) {
    const cleared = getClearedStages();
    if (!cleared.includes(idx)) {
        cleared.push(idx);
        if (sharedMode) return;
        const key = customMode ? 'hako_custom_cleared_stages_v1' : 'hako_cleared_stages';
        try {
            localStorage.setItem(key, JSON.stringify(cleared));
        } catch (e) { }
    }
}

// MARK: - Cleared Stages & Stars Storage (3スター評価システム)
const STAGE_RECORDS_KEY = 'hako_stage_records_v2';

function getStageRecords() {
    if (sharedMode) return sharedRecordsMemory;
    const recordsKey = customMode ? 'hako_custom_stage_records_v1' : STAGE_RECORDS_KEY;
    try {
        let records = {};
        const raw = localStorage.getItem(recordsKey);
        if (raw) {
            records = JSON.parse(raw);
        }
        // 旧バージョンのクリアデータとの統合・マイグレーション
        const oldCleared = getClearedStages();
        oldCleared.forEach(idx => {
            if (!records[idx]) {
                records[idx] = {
                    cleared: true,
                    star1: true,
                    star2: false,
                    star3: false,
                    starsCount: 1,
                    bestBlocks: null
                };
            }
        });
        return records;
    } catch (e) {
        return {};
    }
}

function getStageRecord(idx) {
    const records = getStageRecords();
    return records[idx] || null;
}

function saveStageResult(idx, { cleared, blocksPlaced, usedHint }) {
    const records = getStageRecords();
    const st = STAGES[idx] || getStage();
    const targetBlocks = st.targetBlocks || (st.solution ? st.solution.length : st.maxBlocks);

    const prev = records[idx] || {
        cleared: false,
        star1: false,
        star2: false,
        star3: false,
        starsCount: 0,
        bestBlocks: null
    };

    const isStar1 = cleared || prev.star1;
    const isStar2 = (cleared && blocksPlaced <= targetBlocks) || prev.star2;
    const isStar3 = (cleared && !usedHint) || prev.star3;

    let bestBlocks = prev.bestBlocks;
    if (cleared) {
        if (bestBlocks === null || blocksPlaced < bestBlocks) {
            bestBlocks = blocksPlaced;
        }
    }

    const starsCount = (isStar1 ? 1 : 0) + (isStar2 ? 1 : 0) + (isStar3 ? 1 : 0);

    const updated = {
        cleared: isStar1,
        star1: isStar1,
        star2: isStar2,
        star3: isStar3,
        starsCount,
        bestBlocks,
        lastUpdated: Date.now()
    };

    records[idx] = updated;
    if (!sharedMode) {
        const recordsKey = customMode ? 'hako_custom_stage_records_v1' : STAGE_RECORDS_KEY;
        try {
            localStorage.setItem(recordsKey, JSON.stringify(records));
        } catch (e) { }
    }

    // 旧キーも同期して後方互換性を完全維持
    markStageCleared(idx);

    return {
        record: updated,
        currentStars: {
            star1: isStar1,
            star2: (cleared && blocksPlaced <= targetBlocks),
            star3: (cleared && !usedHint)
        },
        targetBlocks,
        blocksPlaced,
        usedHint
    };
}

function getTotalStars() {
    const records = getStageRecords();
    let total = 0;
    Object.values(records).forEach(rec => {
        if (rec && typeof rec.starsCount === 'number') {
            total += rec.starsCount;
        }
    });
    return total;
}

// MARK: - Stage Select Grid
function updateSelectScreenUI() {
    const selectGrid = document.getElementById('selectScreenGrid');
    const progressBadge = document.getElementById('selectProgressBadge');
    if (!selectGrid) return;

    selectGrid.innerHTML = '';
    const cleared = getClearedStages();
    const records = getStageRecords();
    const totalStars = getTotalStars();
    const validStagesCount = STAGES.filter(s => s && typeof s === 'object').length;
    const maxStars = validStagesCount * 3;

    if (progressBadge) {
        progressBadge.innerHTML = `クリア: ${cleared.length}/${validStagesCount} <span style="margin-left:6px; color:#f59e0b; font-weight:bold;">★ ${totalStars}/${maxStars}</span>`;
    }

    STAGES.forEach((st, idx) => {
        if (!st || typeof st !== 'object') return; // 欠番や未定義ステージの安全なスキップ
        const card = document.createElement('div');
        const isCleared = cleared.includes(idx);
        const rec = records[idx];
        const starsCount = rec ? rec.starsCount : 0;
        const targetBlocks = st.targetBlocks || (st.solution ? st.solution.length : st.maxBlocks);

        let starSlotsHtml = '';
        for (let s = 1; s <= 3; s++) {
            const active = rec && (
                (s === 1 && rec.star1) ||
                (s === 2 && rec.star2) ||
                (s === 3 && rec.star3)
            );
            starSlotsHtml += `<span class="star-slot ${active ? 'active' : ''}">${active ? '★' : '☆'}</span>`;
        }

        const isAllStars = (starsCount === 3);
        const isCustomStage = customMode && (
            Number(st.id) >= 20 ||
            Boolean(st.isCustom) ||
            (OFFICIAL_STAGES && OFFICIAL_STAGES[idx] && JSON.stringify(OFFICIAL_STAGES[idx]) !== JSON.stringify(st))
        );
        card.className = `stage-card ${isCleared ? 'cleared' : ''} ${isAllStars ? 'all-stars' : ''} ${isCustomStage ? 'custom-stage-card' : ''}`;
        const stageTitleText = st.title || `ステージ ${st.id}`;
        const hasGimmicks = Array.isArray(st.gimmicks) && st.gimmicks.length > 0;
        const badgeText = isCustomStage ? '自作' : (hasGimmicks ? 'ギミック有' : '基本');
        const badgeClass = isCustomStage ? 'stage-card-badge badge-custom' : 'stage-card-badge';
        card.innerHTML = `
            <div class="stage-card-num">${stageTitleText}</div>
            <div class="stage-card-stars">${starSlotsHtml}</div>
            <div class="stage-card-target">目標: ${targetBlocks}個</div>
            <div class="stage-card-blocks">${rec && rec.bestBlocks !== null ? `ベスト: ${rec.bestBlocks}個` : `最大: ${st.maxBlocks}個`}</div>
            <div class="${badgeClass}">${badgeText}</div>
        `;
        card.addEventListener('click', () => {
            selectStage(idx);
            switchView('game');
        });
        selectGrid.appendChild(card);
    });
}

// MARK: - Stage Announce Banner
let announceTimeout = null;
function triggerStageAnnounce() {
    const banner = document.getElementById('stageAnnounceBanner');
    const titleEl = document.getElementById('announceTitle');
    const subEl = document.getElementById('announceSub');
    if (!banner) return;

    const st = getStage();
    if (titleEl) titleEl.textContent = st.title;
    if (subEl) subEl.textContent = `${st.subtitle} (目標 ${st.targetBlocks || st.maxBlocks}個 / 最大 ${st.maxBlocks}個)`;

    banner.style.display = 'block';
    banner.style.animation = 'none';
    banner.offsetHeight; // reflow
    banner.style.animation = 'announcePopup 1.8s ease forwards';

    if (announceTimeout) clearTimeout(announceTimeout);
    announceTimeout = setTimeout(() => {
        banner.style.display = 'none';
    }, 1800);
}

// MARK: - UI & Clear Modal with Auto-Transition & Star Celebration
let clearCountdownTimer = null;

function showClear() {
    const blocksPlaced = placedBlocksAtStart || countPlacedBlocks();
    const res = saveStageResult(currentStageIndex, {
        cleared: true,
        blocksPlaced,
        usedHint: usedHintInStage
    });

    statusBar.innerHTML = '<span class="status-clear">★ クリア！ おめでとう！ ★</span>';
    if (hintText) hintText.textContent = '次のステージへ進みます！';
    startBtn.disabled = true;

    const clearModal = document.getElementById('clearModalOverlay');
    const modalTitle = document.getElementById('clearModalTitle');
    const modalSub = document.getElementById('clearModalSub');
    const countdownEl = document.getElementById('clearCountdown');
    const nextBtn = document.getElementById('clearNextStageBtn');
    const isLastStage = (currentStageIndex === STAGES.length - 1);

    if (modalTitle) {
        modalTitle.textContent = isLastStage ? '★ ALL STAGES CLEAR! ★' : 'STAGE CLEAR!';
    }
    if (modalSub) {
        const currentStageObj = getStage();
        const stageDisplayName = currentStageObj ? (currentStageObj.title || `ステージ ${currentStageObj.id}`) : `ステージ ${currentStageIndex + 1}`;
        modalSub.textContent = isLastStage
            ? 'おめでとうございます！全ステージを完全制覇しました！'
            : `お見事！${stageDisplayName} をクリア！次のステージを解放しました！`;
    }

    // スターアイテムの表示更新
    const starItem1 = document.getElementById('starItem1');
    const starItem2 = document.getElementById('starItem2');
    const starItem3 = document.getElementById('starItem3');
    const starText2 = document.getElementById('starText2');
    const statBlocksTag = document.getElementById('statBlocksTag');
    const statHintTag = document.getElementById('statHintTag');

    if (starText2) {
        starText2.textContent = `${res.targetBlocks}個以内でクリア`;
    }

    // アニメーション用クラスを一旦リセット
    [starItem1, starItem2, starItem3].forEach(item => {
        if (item) item.classList.remove('achieved', 'missed');
    });

    // 順次点灯演出 (60ms, 280ms, 500ms)
    setTimeout(() => {
        if (starItem1) starItem1.classList.add(res.record.star1 ? 'achieved' : 'missed');
    }, 60);

    setTimeout(() => {
        if (starItem2) starItem2.classList.add(res.record.star2 ? 'achieved' : 'missed');
    }, 280);

    setTimeout(() => {
        if (starItem3) starItem3.classList.add(res.record.star3 ? 'achieved' : 'missed');
    }, 500);

    // 統計タグの更新
    if (statBlocksTag) {
        const isOpt = blocksPlaced <= res.targetBlocks;
        statBlocksTag.textContent = `配置数: ${blocksPlaced} / ${res.targetBlocks}個 ${isOpt ? '(達成!)' : ''}`;
        statBlocksTag.className = `stat-tag ${isOpt ? 'highlight' : ''}`;
    }
    if (statHintTag) {
        statHintTag.textContent = usedHintInStage ? '答え合わせ: 使用' : 'ノーヒント達成!';
        statHintTag.className = `stat-tag ${!usedHintInStage ? 'highlight' : ''}`;
    }

    if (nextBtn) {
        if (isLastStage) {
            nextBtn.innerHTML = '<span>ステージ一覧を見る ▶</span>';
        } else {
            nextBtn.innerHTML = `<span>次のステージへ 進む ▶</span><span class="countdown-tag">(<span id="clearCountdown">4</span>秒後に自動移動)</span>`;
        }
    }

    if (clearModal) {
        clearModal.classList.add('open');
    }

    let count = 4;
    const cdEl = document.getElementById('clearCountdown');
    if (cdEl) cdEl.textContent = count;

    if (clearCountdownTimer) clearInterval(clearCountdownTimer);
    clearCountdownTimer = setInterval(() => {
        count--;
        const curCdEl = document.getElementById('clearCountdown');
        if (curCdEl) curCdEl.textContent = count;
        if (count <= 0) {
            clearInterval(clearCountdownTimer);
            clearCountdownTimer = null;
            proceedToNextStage();
        }
    }, 1000);
}

// MARK: - Stage Navigation & Skip Helpers (飛んだステージ番号や欠番のスキップ対応)
function findValidStageIndex(fromIdx, direction = 1) {
    if (!Array.isArray(STAGES) || STAGES.length === 0) return -1;
    let target = fromIdx + direction;
    while (target >= 0 && target < STAGES.length) {
        if (STAGES[target] && typeof STAGES[target] === 'object' && STAGES[target].id !== undefined) {
            return target;
        }
        target += direction;
    }
    return -1;
}

function selectStageById(stageId) {
    if (!Array.isArray(STAGES) || STAGES.length === 0) return;
    const foundIdx = STAGES.findIndex(s => s && s.id === stageId);
    if (foundIdx !== -1) {
        selectStage(foundIdx);
        return;
    }
    // 飛んだ番号の場合、指定ID以上の最初の有効ステージ、または直前の有効ステージを探す
    const nextIdx = STAGES.findIndex(s => s && s.id > stageId);
    if (nextIdx !== -1) {
        selectStage(nextIdx);
        return;
    }
    selectStage(Math.max(0, STAGES.length - 1));
}

function proceedToNextStage() {
    if (clearCountdownTimer) {
        clearInterval(clearCountdownTimer);
        clearCountdownTimer = null;
    }
    const clearModal = document.getElementById('clearModalOverlay');
    if (clearModal) clearModal.classList.remove('open');

    const nextIdx = findValidStageIndex(currentStageIndex, 1);
    if (nextIdx !== -1) {
        selectStage(nextIdx);
    } else {
        switchView('select');
    }
}

function closeClearModal() {
    if (clearCountdownTimer) {
        clearInterval(clearCountdownTimer);
        clearCountdownTimer = null;
    }
    const clearModal = document.getElementById('clearModalOverlay');
    if (clearModal) clearModal.classList.remove('open');
}

function showFail() {
    statusBar.innerHTML = '<span class="status-fail">ミス！もう一度挑戦！</span>';
    if (hintText) hintText.textContent = 'リセットでブロックを配置し直そう';
    startBtn.disabled = true;
}

function updateLegendUI() {
    if (!legendWrap) return;
    const st = getStage();
    legendWrap.innerHTML = '';
    if (!st) return;

    // ギミック種別ごとに集約したリストを構築（上下左右などの多段重複を防止）
    const items = [];
    const hasForbidden = (st.forbidden && st.forbidden.length > 0) || (st.legends && st.legends.some(l => l.type === 'forbidden'));
    if (hasForbidden) {
        items.push({ icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' });
    }
    const hasDash = (st.gimmicks && st.gimmicks.some(g => g.type === 'dash')) || (st.legends && st.legends.some(l => l.type === 'dash'));
    if (hasDash) {
        items.push({ icon: '→', type: 'dash', text: '青矢印：矢印方向に端まで移動' });
    }
    const hasStep = (st.gimmicks && st.gimmicks.some(g => g.type === 'step')) || (st.legends && st.legends.some(l => l.type === 'step'));
    if (hasStep) {
        items.push({ icon: '→', type: 'step', text: '緑矢印：矢印方向に1マス移動' });
    }
    const hasPurple = (st.gimmicks && st.gimmicks.some(g => g.purpleBorder)) || (st.legends && st.legends.some(l => l.type === 'purple'));
    if (hasPurple) {
        items.push({ icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' });
    }

    if (Array.isArray(st.legends)) {
        st.legends.forEach(l => {
            if (l.type !== 'forbidden' && l.type !== 'dash' && l.type !== 'step' && l.type !== 'purple') {
                items.push(l);
            }
        });
    }

    items.forEach(l => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <span class="legend-icon legend-${l.type}">${l.icon}</span>
            <span>${l.text}</span>
        `;
        legendWrap.appendChild(item);
    });
}

function updateStageNavUI() {
    const curStage = getStage();
    if (stageCurrentTitle && curStage) {
        const isCustom = customMode && (Number(curStage.id) >= 20 || curStage.isCustom);
        stageCurrentTitle.textContent = (curStage.title || `ステージ ${curStage.id}`) + (isCustom ? ' [自作]' : '');
    }
    if (prevStageBtn) {
        prevStageBtn.disabled = (findValidStageIndex(currentStageIndex, -1) === -1);
    }
    if (nextStageBtn) {
        nextStageBtn.disabled = (findValidStageIndex(currentStageIndex, 1) === -1);
    }
}

function selectStage(idx) {
    if (idx < 0 || idx >= STAGES.length) return;
    if (explosionMessageTimer) {
        clearTimeout(explosionMessageTimer);
        explosionMessageTimer = null;
    }
    currentStageIndex = idx;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    slidingBlocks = [];
    blockAnimationRounds = [];
    currentRoundIndex = 0;
    pendingSupernova = null;
    supernovaState = null;
    pendingBlackHole = null;
    blackHoleState = null;
    originalGrid = null;
    showSolution = false;
    usedHintInStage = false;
    placedBlocksAtStart = 0;
    gameParticles.length = 0;
    lastKfIndex = -1;
    resetSwitchStates();
    updateAnswerBtnUI();
    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;
    statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
    if (hintText) hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';

    updateStageNavUI();
    updateBlockBadge();
    updateLegendUI();
    render();

    // ステージ入場時アナウンスを表示
    triggerStageAnnounce();
}

function bgLoop() {
    if (currentView === 'game') {
        if (phase === 'place' || (phase !== 'supernova' && phase !== 'block_move' && gameParticles.length > 0)) {
            render();
        }
    }
    requestAnimationFrame(bgLoop);
}

// MARK: - Init
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = TOTAL_W;
    canvas.height = TOTAL_H;

    startBtn = document.getElementById('startBtn');
    resetBtn = document.getElementById('resetBtn');
    answerBtn = document.getElementById('answerBtn');
    statusBar = document.getElementById('statusBar');
    hintText = document.getElementById('hintText');
    stageCurrentTitle = document.getElementById('stageCurrentTitle');
    prevStageBtn = document.getElementById('prevStageBtn');
    nextStageBtn = document.getElementById('nextStageBtn');
    blockCountVal = document.getElementById('blockCountVal');
    legendWrap = document.getElementById('legendWrap');

    // ホーム画面ボタン
    const homeStartBtn = document.getElementById('homeStartBtn');
    const homeSelectBtn = document.getElementById('homeSelectBtn');
    const homeHelpBtn = document.getElementById('homeHelpBtn');
    const homeTechBtn = document.getElementById('homeTechBtn');

    // ステージ選択画面ボタン
    const selectBackToHomeBtn = document.getElementById('selectBackToHomeBtn');

    // ゲーム画面トップバーボタン
    const gameBackToHomeBtn = document.getElementById('gameBackToHomeBtn');
    const gameToSelectBtn = document.getElementById('gameToSelectBtn');

    // クリアモーダル内ボタン
    const clearNextStageBtn = document.getElementById('clearNextStageBtn');
    const clearRetryBtn = document.getElementById('clearRetryBtn');
    const clearSelectBtn = document.getElementById('clearSelectBtn');
    const clearModalOverlay = document.getElementById('clearModalOverlay');

    // 遊び方モーダル
    const helpBtn = document.getElementById('helpBtn');
    const helpModalOverlay = document.getElementById('helpModalOverlay');
    const modalCloseBtn = document.getElementById('modalCloseBtn');

    function openHelpModal() {
        if (helpModalOverlay) helpModalOverlay.classList.add('open');
    }
    function closeHelpModal() {
        if (helpModalOverlay) helpModalOverlay.classList.remove('open');
    }

    // ホーム画面ボタンイベント
    if (homeStartBtn) {
        homeStartBtn.addEventListener('click', () => {
            switchView('game');
            selectStage(currentStageIndex);
        });
    }
    if (homeSelectBtn) {
        homeSelectBtn.addEventListener('click', () => {
            switchView('select');
        });
    }
    if (homeHelpBtn) {
        homeHelpBtn.addEventListener('click', () => {
            openHelpModal();
        });
    }
    if (homeTechBtn) {
        homeTechBtn.addEventListener('click', (e) => {
            // aタグの標準動作でtech-doc.htmlへ遷移
        });
    }

    // ステージ選択画面ボタンイベント
    if (selectBackToHomeBtn) {
        selectBackToHomeBtn.addEventListener('click', () => {
            switchView('home');
        });
    }

    // ゲーム画面トップバーボタンイベント
    if (gameBackToHomeBtn) {
        gameBackToHomeBtn.addEventListener('click', () => {
            switchView('home');
        });
    }
    if (gameToSelectBtn) {
        gameToSelectBtn.addEventListener('click', () => {
            switchView('select');
        });
    }

    if (prevStageBtn) {
        prevStageBtn.addEventListener('click', () => {
            const prevIdx = findValidStageIndex(currentStageIndex, -1);
            if (prevIdx !== -1) selectStage(prevIdx);
        });
    }
    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            const nextIdx = findValidStageIndex(currentStageIndex, 1);
            if (nextIdx !== -1) selectStage(nextIdx);
        });
    }

    // クリアモーダル内ボタンイベント
    if (clearNextStageBtn) {
        clearNextStageBtn.addEventListener('click', () => {
            proceedToNextStage();
        });
    }
    if (clearRetryBtn) {
        clearRetryBtn.addEventListener('click', () => {
            closeClearModal();
            triggerReset();
        });
    }
    if (clearSelectBtn) {
        clearSelectBtn.addEventListener('click', () => {
            closeClearModal();
            switchView('select');
        });
    }

    // 遊び方モーダルボタンイベント
    if (helpBtn) {
        helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openHelpModal();
        });
    }
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeHelpModal);
    }
    if (helpModalOverlay) {
        helpModalOverlay.addEventListener('click', (e) => {
            if (e.target === helpModalOverlay) closeHelpModal();
        });
    }

    // Canvas内の表示領域（アスペクト比維持に伴う上下左右の余白）を正確に逆算してグリッド座標を取得する
    function getCanvasGridCoord(e) {
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const canvasRatio = canvas.width / canvas.height;
        const rectRatio = rect.width / rect.height;
        let drawW = rect.width;
        let drawH = rect.height;
        let offsetX = 0;
        let offsetY = 0;

        if (rectRatio > canvasRatio) {
            drawW = rect.height * canvasRatio;
            offsetX = (rect.width - drawW) / 2;
        } else {
            drawH = rect.width / canvasRatio;
            offsetY = (rect.height - drawH) / 2;
        }

        const clientX = e.clientX - rect.left - offsetX;
        const clientY = e.clientY - rect.top - offsetY;

        if (clientX < 0 || clientX > drawW || clientY < 0 || clientY > drawH) return null;

        const scale = canvas.width / drawW;
        const mx = clientX * scale;
        const my = clientY * scale;

        const col = Math.floor((mx - GX) / CELL);
        const row = Math.floor((my - GY) / CELL);

        return { col, row, mx, my };
    }

    // Mouse input for block placement
    canvas.addEventListener('click', e => {
        if (phase !== 'place') return;
        const coord = getCanvasGridCoord(e);
        if (!coord) return;

        if (coord.col >= 0 && coord.col < COLS && coord.row >= 0 && coord.row < ROWS) {
            placeBlock(coord.col, coord.row);
            if (showSolution) {
                const check = checkSolutionMatch();
                if (check.isMatch) {
                    statusBar.innerHTML = '<span class="status-clear">【答え合わせ】正解の配置と一致しています！</span>';
                } else {
                    statusBar.innerHTML = `<span class="status-place">【答え合わせ】オレンジ枠を表示中 (${check.matchCount}/${check.totalSolution} 正解)</span>`;
                }
            }
        }
    });

    canvas.addEventListener('mousemove', e => {
        if (phase !== 'place') return;
        render();

        const coord = getCanvasGridCoord(e);
        if (!coord) return;

        const col = coord.col;
        const row = coord.row;

        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            if (isForbidden(col, row)) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                ctx.fillRect(GX + col * CELL + 2, GY + row * CELL + 2, CELL - 4, CELL - 4);
            } else if (!grid[row][col]) {
                ctx.fillStyle = 'rgba(255, 228, 80, 0.25)';
                ctx.strokeStyle = '#ffe450';
                ctx.lineWidth = 2;
                ctx.fillRect(GX + col * CELL + 2, GY + row * CELL + 2, CELL - 4, CELL - 4);
                ctx.strokeRect(GX + col * CELL + 2, GY + row * CELL + 2, CELL - 4, CELL - 4);
            }
        }
    });

    canvas.addEventListener('mouseleave', () => { if (phase === 'place') render(); });

    function triggerStart() {
        if (phase !== 'place') return;

        // スタート直後のブロック移動・超新星爆発・無限ループの事前シミュレーション
        const { rounds, supernova, supernovas, blackHoleLoop, blackHoleLoops, switchEvents, finalSwitchDirs } = simulateGimmickBlockMoves();
        pendingSwitchEvents = switchEvents || [];
        pendingFinalSwitchDirs = finalSwitchDirs || null;

        // 紫枠（必須設置）とブロック連結ルールを常にチェック
        const st = getStage();
        const requiredGimmicks = st.gimmicks.filter(g => g.purpleBorder);
        const missingRequired = requiredGimmicks.filter(g => !grid[g.row][g.col]);
        if (missingRequired.length > 0) {
            statusBar.innerHTML = '<span class="status-fail">紫色の枠には必ずブロックを設置してください！</span>';
            setTimeout(() => {
                if (phase === 'place') {
                    updateBlockBadge();
                }
            }, 1800);
            return;
        }

        // ブロック同士の連結チェック (2個以上の場合はひっついておく必要がある)
        if (!areBlocksConnected()) {
            statusBar.innerHTML = '<span class="status-fail">ブロック同士をすべてくっつけて配置してください！</span>';
            setTimeout(() => {
                if (phase === 'place') {
                    updateBlockBadge();
                }
            }, 2000);
            return;
        }

        startBtn.disabled = true;

        // スタート前のブロック配置と個数をバックアップ（超新星爆発・ブラックホール時は全消去となるため復元しない）
        placedBlocksAtStart = countPlacedBlocks();
        originalGrid = (supernova || blackHoleLoop) ? null : grid.map(r => [...r]);
        pendingSupernova = (supernovas && supernovas.length > 0) ? supernovas : (supernova ? [supernova] : null);
        pendingBlackHole = (blackHoleLoops && blackHoleLoops.length > 0) ? blackHoleLoops : (blackHoleLoop ? [blackHoleLoop] : null);

        // ブロックがギミックによって移動する場合は、先行移動（block_move）を優先して実行
        if (rounds.length > 0) {
            phase = 'block_move';
            blockAnimationRounds = rounds;
            currentRoundIndex = 0;
            roundStartTime = performance.now();
            statusBar.innerHTML = '<span class="status-run">ブロック移動中...</span>';
            if (hintText) hintText.textContent = '';
            animId = requestAnimationFrame(animateBlockMove);
            return;
        }

        // 移動がない（0ステップでその場で発生する）場合の即時発動
        if (pendingSupernova && pendingBlackHole) {
            const snList = Array.isArray(pendingSupernova) ? pendingSupernova : [pendingSupernova];
            const bh = pendingBlackHole;
            pendingSupernova = null;
            pendingBlackHole = null;
            startDualSupernovaBlackHole(snList, bh);
            return;
        }

        if (pendingBlackHole) {
            const bh = pendingBlackHole;
            pendingBlackHole = null;
            startBlackHole(bh);
            return;
        }

        if (pendingSupernova) {
            const sn = pendingSupernova;
            pendingSupernova = null;
            startSupernova(sn);
            return;
        }

        statusBar.innerHTML = '<span class="status-run"> GO GO GO!!</span>';
        if (hintText) hintText.textContent = '';
        startRun();
    }

    function triggerReset() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        if (explosionMessageTimer) {
            clearTimeout(explosionMessageTimer);
            explosionMessageTimer = null;
        }
        resetBlackHoleUiStyles();
        if (canvas) canvas.style.cursor = '';
        slidingBlocks = [];
        blockAnimationRounds = [];
        currentRoundIndex = 0;
        pendingSupernova = null;
        supernovaState = null;
        pendingBlackHole = null;
        blackHoleState = null;
        dualEventState = null;

        // スタート後（実行中や結果画面）なら、スタート前の配置に復元して再挑戦しやすくする
        if (phase !== 'place' && originalGrid) {
            grid = originalGrid.map(r => [...r]);
            originalGrid = null;
        } else {
            // 配置中または超新星爆発後は全ブロックをクリア
            grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            actionHistory = [];
            originalGrid = null;
            usedHintInStage = false;
        }

        placedBlocksAtStart = 0;
        gameParticles.length = 0;
        resetSwitchStates();

        phase = 'place';
        man = makeMan();
        startBtn.disabled = false;
        statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
        if (hintText) hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
        updateBlockBadge();
        render();
    }

    startBtn.addEventListener('click', triggerStart);
    resetBtn.addEventListener('click', triggerReset);
    if (answerBtn) {
        answerBtn.addEventListener('click', () => {
            toggleSolution();
        });
    }

    // Keyboard input
    window.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();

        // 遊び方モーダルが開いている場合はEscapeで閉じる
        if (helpModalOverlay && helpModalOverlay.classList.contains('open')) {
            if (e.key === 'Escape') {
                closeHelpModal();
                e.preventDefault();
            }
            return;
        }

        // クリアモーダルが開いている時のキーボードショートカット
        if (clearModalOverlay && clearModalOverlay.classList.contains('open')) {
            if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
                proceedToNextStage();
                e.preventDefault();
                return;
            }
            if (key === 'm') {
                closeClearModal();
                triggerReset();
                e.preventDefault();
                return;
            }
            if (e.key === 'Escape') {
                closeClearModal();
                switchView('select');
                e.preventDefault();
                return;
            }
            return;
        }

        // ホーム画面の場合
        if (currentView === 'home') {
            if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
                switchView('game');
                selectStage(currentStageIndex);
                e.preventDefault();
            }
            return;
        }

        // ステージ選択画面の場合
        if (currentView === 'select') {
            if (e.key === 'Escape') {
                switchView('home');
                e.preventDefault();
            }
            return;
        }

        // これ以降は currentView === 'game' の時のみ
        if (currentView !== 'game') return;

        // Escapeでステージ選択へ戻る
        if (e.key === 'Escape') {
            switchView('select');
            e.preventDefault();
            return;
        }

        // 'm' key or Shift for Reset
        if (key === 'm' || e.key === 'Shift') {
            triggerReset();
            e.preventDefault();
            return;
        }
        // Space key or Enter for Start
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
            if (phase === 'place') {
                triggerStart();
                e.preventDefault();
            }
            return;
        }
        if (e.key === 'Backspace') {
            if (phase === 'place') {
                if (actionHistory.length > 0) {
                    const lastAction = actionHistory.pop();
                    grid[lastAction.row][lastAction.col] = !grid[lastAction.row][lastAction.col];
                    updateBlockBadge();
                    render();
                }
                e.preventDefault();
            }
            return;
        }

        // '.' key for solution toggle (答え合わせ)
        if ((e.key === '.' || e.code === 'Period') && phase === 'place') {
            toggleSolution(false);
            e.preventDefault();
            return;
        }

        // Left/Right arrow keys for stage switching
        if (e.key === 'ArrowLeft' && phase === 'place') {
            selectStage(currentStageIndex - 1);
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowRight' && phase === 'place') {
            selectStage(currentStageIndex + 1);
            e.preventDefault();
            return;
        }

        // '?' キーで遊び方モーダルを開く
        if (e.key === '?' || e.key === '/') {
            openHelpModal();
            e.preventDefault();
            return;
        }

        if (phase !== 'place') return;

        // エディタ内または外部制御でキー配置が無効化されている場合は無視（トースト等は表示しない）
        if (window.__game ? window.__game.disableKeyPlacement : isInsideEditorPreview()) {
            return;
        }

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (KEY_MAP[r][c] === key) {
                    placeBlock(c, r);
                    e.preventDefault();
                    return;
                }
            }
        }
    });

    updateStageNavUI();
    updateBlockBadge();
    updateLegendUI();
    updateSelectScreenUI();

    function isInsideEditorPreview() {
        try {
            return (window.self !== window.top || Boolean(window.frameElement));
        } catch (e) {
            return true;
        }
    }

    const inEditorPreview = isInsideEditorPreview();

    // 外部/テスト用露出
    window.__game = {
        selectStage,
        applySolutionToGrid,
        toggleSolution,
        triggerStart,
        triggerReset,
        switchView,
        getStage,
        getCurrentStageIndex: () => currentStageIndex,
        getStages: () => STAGES,
        getGrid: () => grid,
        placeBlock: (col, row) => placeBlock(col, row),
        render,
        // エディタ内でのキー配置有効/無効フラグ (ide.jsから制御可能)
        disableKeyPlacement: inEditorPreview,
        setDisableKeyPlacement: function (disabled) {
            this.disableKeyPlacement = Boolean(disabled);
        }
    };

    // 自作ステージ復帰ボタンのイベント登録
    const btnRestoreOfficial = document.getElementById('btnRestoreOfficial');
    if (btnRestoreOfficial) {
        btnRestoreOfficial.addEventListener('click', restoreOfficialStages);
    }
    const homeRestoreOfficialBtn = document.getElementById('homeRestoreOfficialBtn');
    if (homeRestoreOfficialBtn) {
        homeRestoreOfficialBtn.addEventListener('click', restoreOfficialStages);
    }

    // 初期画面はホーム（ただしWebエディタのプレビューiframe内では即座にステージ画面を表示）
    switchView(inEditorPreview ? 'game' : 'home');

    // 共有URL (#トークン) または 自作ステージモードの起動判定
    if (!inEditorPreview) {
        const isShared = bootSharedStagesFromHash();
        window.addEventListener('hashchange', bootSharedStagesFromHash);
        if (!isShared) {
            bootCustomStagesFromStorage();
        }
    }

    // プレビュー内でのサイズ監視と動的レイアウト切替（ボタン大型化＆サイズに応じた自動レイアウト調整）
    function updatePreviewLayout() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        let layout = 'normal';
        // プレビューが十分に横長（幅560px以上かつアスペクト比1.25以上）のときに元の横2カラム配置に切り替え
        if (w >= 560 && (w / h) >= 1.25) {
            layout = 'wide';
        } else if (h < 360) {
            layout = 'compact';
        }
        document.body.dataset.previewLayout = layout;
    }

    if (inEditorPreview) {
        window.addEventListener('resize', updatePreviewLayout);
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                updatePreviewLayout();
            });
            ro.observe(document.body);
        }
        updatePreviewLayout();
    }

    render();
    requestAnimationFrame(bgLoop);
});

// MARK: - External Playground / Editor API
// 教材ページや外部エディタからステージデータを即時注入してテストするためのAPI
window.applyCustomStages = function (newStages, targetIndex = 0, targetView = 'game') {
    if (!Array.isArray(newStages) || newStages.length === 0) return false;
    STAGES.length = 0;
    newStages.forEach(st => STAGES.push(st));
    if (typeof updateSelectScreenUI === 'function') updateSelectScreenUI();
    if (typeof switchView === 'function' && targetView) switchView(targetView);
    if (typeof selectStage === 'function') selectStage(Math.max(0, Math.min(targetIndex, STAGES.length - 1)));
    return true;
};

// MARK: - Custom Stages Management (エディタ連携・自作ステージ持ち込み)
function updateCustomModeUI() {
    const banner = document.getElementById('customStagesBanner');
    const bannerText = document.getElementById('customBannerText');
    const homeIndicator = document.getElementById('homeCustomIndicator');
    const gameToEditorBtn = document.getElementById('gameToEditorBtn');

    if (customMode) {
        if (banner) {
            banner.style.display = 'flex';
            if (bannerText) {
                bannerText.textContent = `エディタで作成・変更したステージを適用中（全 ${STAGES.length} ステージ）`;
            }
        }
        if (homeIndicator) homeIndicator.style.display = 'flex';
        if (gameToEditorBtn) gameToEditorBtn.style.display = 'inline-flex';
        document.body.classList.add('custom-stages-active');
    } else {
        if (banner) banner.style.display = 'none';
        if (homeIndicator) homeIndicator.style.display = 'none';
        if (gameToEditorBtn) gameToEditorBtn.style.display = 'none';
        document.body.classList.remove('custom-stages-active');
    }
}

function restoreOfficialStages() {
    customMode = false;
    try {
        localStorage.removeItem('hako_custom_mode_active');
    } catch (e) { }

    if (OFFICIAL_STAGES && OFFICIAL_STAGES.length > 0) {
        window.applyCustomStages(JSON.parse(JSON.stringify(OFFICIAL_STAGES)), 0, null);
    }
    try {
        history.replaceState(null, '', location.pathname);
    } catch (e) { }
    updateCustomModeUI();
    if (typeof updateSelectScreenUI === 'function') updateSelectScreenUI();
    showSharedNotice('公式ステージに戻しました');
}

function bootCustomStagesFromStorage() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    // 明示的に公式ゲームが指定された場合（左上「ゲームへ」など）
    if (mode === 'official') {
        customMode = false;
        try {
            localStorage.removeItem('hako_custom_mode_active');
        } catch (e) { }
        updateCustomModeUI();
        return false;
    }

    const isCustomActive = (mode === 'custom' || localStorage.getItem('hako_custom_mode_active') === 'true');
    if (!isCustomActive) {
        updateCustomModeUI();
        return false;
    }

    try {
        const raw = localStorage.getItem('hako_custom_stages_data');
        if (!raw) return false;
        const customStages = JSON.parse(raw);
        if (!Array.isArray(customStages) || customStages.length === 0) return false;

        customMode = true;
        window.applyCustomStages(customStages, 0, null);

        // 自作ステージを持ち込んだ場合は、ステージ一覧がすぐ見れるようにステージ選択画面を開く
        switchView('select');
        updateCustomModeUI();
        showSharedNotice('エディタのステージを読み込みました！');
        return true;
    } catch (e) {
        console.warn('Failed to load custom stages:', e);
        return false;
    }
}

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UPDATE_STAGES') {
        window.applyCustomStages(event.data.stages, event.data.targetIndex || 0);
    }
});

// 本格Webエディタからのコード直接ホットリロード
window.reloadStagesFromCode = function (code, targetIndex = 0) {
    try {
        const runner = new Function(code + '; return (typeof STAGES !== "undefined" ? STAGES : (typeof stages !== "undefined" ? stages : null));');
        const parsedStages = runner();
        if (Array.isArray(parsedStages) && parsedStages.length > 0) {
            return window.applyCustomStages(parsedStages, targetIndex);
        }
    } catch (e) {
        console.warn('Failed to hot-reload stages:', e);
    }
    return false;
};


// MARK: - 共有ステージ
// URLフラグメントのトークンを復号し、共有ステージだけをプレイ可能にする
function showSharedNotice(message) {
    let el = document.getElementById('sharedNotice');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sharedNotice';
        el.className = 'shared-notice';
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(showSharedNotice._timer);
    showSharedNotice._timer = setTimeout(() => el.classList.remove('show'), 5000);
}

function bootSharedStagesFromHash() {
    if (!window.ShareCodec) return false;
    const token = window.ShareCodec.tokenFromHash(location.hash);
    if (!token) return false;
    const result = window.ShareCodec.decode(token);
    if (!result.ok) {
        showSharedNotice('共有されたステージを開けませんでした: ' + result.error);
        return false;
    }
    sharedMode = true;
    sharedClearedMemory = [];
    sharedRecordsMemory = {};
    document.body.classList.add('shared-mode');
    window.applyCustomStages(result.stages, 0);
    showSharedNotice('共有されたステージです。記録は保存されません。');
    return true;
}
