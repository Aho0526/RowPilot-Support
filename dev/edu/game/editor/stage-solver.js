/**
 * stage-solver.js
 * ハコゲーム 5×5 盤面エディタ用 厳密クリア可否検証 & 最小ブロック数解 (solution) 自動探索エンジン
 *
 * main.js の物理シミュレーション（離散時間並行移動・玉突き停止・正面すれ違い停止・
 * 超新星爆発・ブラックホール無限ループ・スイッチ切替・天井クラッシュ・体半分レーザー切断）を
 * 完全忠実に再現し、反復深化 + 静止閉包下界 + 列供給ビットマスク枝刈り + Redelmeier 連結列挙により
 * 最小ブロック数の正解配置を自動計算します。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.HakoStageSolver = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const COLS = 5;
    const ROWS = 5;
    const CELL = 56;
    const GX = 108;
    const GY = 88;
    const WALK_SPEED = 0.015;
    const JUMP_SPEED = 0.040;
    const CLOCKWISE_DIRS = ['right', 'down', 'left', 'up'];
    const OPPOSITE_DIR = { up: 'down', down: 'up', left: 'right', right: 'left' };
    const DIR_DELTA = {
        up: [-1, 0],
        down: [1, 0],
        left: [0, -1],
        right: [0, 1]
    };

    function createEmptyGrid() {
        return [
            [false, false, false, false, false],
            [false, false, false, false, false],
            [false, false, false, false, false],
            [false, false, false, false, false],
            [false, false, false, false, false]
        ];
    }

    function coordsToGrid(coords) {
        const g = createEmptyGrid();
        if (!Array.isArray(coords)) return g;
        for (let i = 0; i < coords.length; i++) {
            const p = coords[i];
            if (p && p.row >= 0 && p.row < ROWS && p.col >= 0 && p.col < COLS) {
                g[p.row][p.col] = true;
            }
        }
        return g;
    }

    function gridToCoords(grid) {
        const list = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c]) {
                    list.push({ col: c, row: r });
                }
            }
        }
        return list;
    }

    function countBlocksInGrid(grid) {
        let cnt = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c]) cnt++;
            }
        }
        return cnt;
    }

    function areBlocksConnected(grid) {
        let firstR = -1;
        let firstC = -1;
        let total = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c]) {
                    total++;
                    if (firstR === -1) {
                        firstR = r;
                        firstC = c;
                    }
                }
            }
        }
        if (total <= 1) return true;

        let visitedMask = 1 << (firstR * COLS + firstC);
        const queueR = [firstR];
        const queueC = [firstC];
        let head = 0;
        let visitedCount = 1;

        while (head < queueR.length) {
            const cr = queueR[head];
            const cc = queueC[head];
            head++;
            for (let dr = -1; dr <= 1; dr++) {
                const nr = cr + dr;
                if (nr < 0 || nr >= ROWS) continue;
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nc = cc + dc;
                    if (nc < 0 || nc >= COLS || !grid[nr][nc]) continue;
                    const bit = 1 << (nr * COLS + nc);
                    if ((visitedMask & bit) === 0) {
                        visitedMask |= bit;
                        visitedCount++;
                        queueR.push(nr);
                        queueC.push(nc);
                    }
                }
            }
        }
        return visitedCount === total;
    }

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

    function getEffectiveGimmickMoveType(g) {
        if (!g) return 'step';
        if (g.type === 'switch') {
            return g.moveType === 'dash' ? 'dash' : 'step';
        }
        return g.type;
    }

    function buildStageLookup(stage) {
        const forbidden = createEmptyGrid();
        if (Array.isArray(stage.forbidden)) {
            for (let i = 0; i < stage.forbidden.length; i++) {
                const f = stage.forbidden[i];
                if (f && f.row >= 0 && f.row < ROWS && f.col >= 0 && f.col < COLS) {
                    forbidden[f.row][f.col] = true;
                }
            }
        }

        const gimmickAt = [
            [null, null, null, null, null],
            [null, null, null, null, null],
            [null, null, null, null, null],
            [null, null, null, null, null],
            [null, null, null, null, null]
        ];
        const requiredList = [];
        if (Array.isArray(stage.gimmicks)) {
            for (let i = 0; i < stage.gimmicks.length; i++) {
                const g = stage.gimmicks[i];
                if (g && g.row >= 0 && g.row < ROWS && g.col >= 0 && g.col < COLS) {
                    gimmickAt[g.row][g.col] = g;
                    if (g.purpleBorder) {
                        requiredList.push({ row: g.row, col: g.col });
                    }
                }
            }
        }

        return {
            stage,
            forbidden,
            gimmickAt,
            requiredList,
            startRow: typeof stage.startRow === 'number' ? stage.startRow : 3,
            goalRow: typeof stage.goalRow === 'number' ? stage.goalRow : 1,
            maxBlocks: Math.max(0, Math.floor(Number(stage.maxBlocks) || 0)),
            hasCeiling: Boolean(stage.hasCeiling),
            lasers: Array.isArray(stage.lasers) ? stage.lasers : []
        };
    }

    // ---------------------------------------------------------
    // 1. ギミック並行移動シミュレータ (main.js と完全同一仕様)
    // ---------------------------------------------------------
    function simulateGimmickMoves(lookup, initialGrid) {
        const { gimmickAt } = lookup;
        const simSwitches = new Map();

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const g = gimmickAt[r][c];
                if (g && g.type === 'switch') {
                    simSwitches.set(`${c},${r}`, {
                        seq: getSwitchDirSequence(g),
                        index: 0,
                        moveType: getEffectiveGimmickMoveType(g),
                        steps: g.steps || 1
                    });
                }
            }
        }

        const getSimSwitchKey = () => {
            if (simSwitches.size === 0) return '';
            const parts = [];
            simSwitches.forEach((sw, key) => parts.push(`${key}:${sw.index}`));
            return parts.join('|');
        };

        const consumeSwitchAt = (col, row) => {
            const sw = simSwitches.get(`${col},${row}`);
            if (!sw) return null;
            const activeDir = sw.seq[sw.index];
            if (sw.index < sw.seq.length - 1) {
                sw.index++;
            }
            return { dir: activeDir, mode: sw.moveType, steps: sw.steps };
        };

        const blocks = [];
        let idCounter = 1;
        const initSwitchKey = getSimSwitchKey();

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!initialGrid[r][c]) continue;
                const g = gimmickAt[r][c];
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
                    dir: initDir,
                    mode: initMode,
                    remainingSteps: initSteps,
                    isMoving: hasMove,
                    startedOnSwitch,
                    pathLen: 1,
                    history: [{
                        col: c,
                        row: r,
                        dir: initDir,
                        mode: initMode,
                        remainingSteps: initSteps,
                        switchKey: initSwitchKey,
                        tick: 0,
                        pathIndex: 0
                    }]
                });
            }
        }

        const maxTicks = 80;
        let tickCount = 0;
        let lastStopTick = 0;
        const supernovas = [];
        let blackHoleCount = 0;

        while (tickCount < maxTicks) {
            tickCount++;
            const movingBlocks = [];
            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i].isMoving) movingBlocks.push(blocks[i]);
            }
            if (movingBlocks.length === 0) {
                tickCount--;
                break;
            }

            const intentions = new Map();
            for (let i = 0; i < movingBlocks.length; i++) {
                const b = movingBlocks[i];
                let nc = b.col;
                let nr = b.row;
                if (b.dir === 'right') nc++;
                else if (b.dir === 'left') nc--;
                else if (b.dir === 'up') nr--;
                else if (b.dir === 'down') nr++;

                if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) {
                    b.isMoving = false;
                } else {
                    intentions.set(b.id, { nc, nr });
                }
            }

            const resolveStoppedQueue = () => {
                let changed = true;
                while (changed) {
                    changed = false;
                    let stoppedBits = 0;
                    for (let i = 0; i < blocks.length; i++) {
                        if (!blocks[i].isMoving) {
                            stoppedBits |= (1 << (blocks[i].row * COLS + blocks[i].col));
                        }
                    }
                    for (let i = 0; i < supernovas.length; i++) {
                        stoppedBits |= (1 << (supernovas[i].row * COLS + supernovas[i].col));
                    }
                    for (let i = 0; i < movingBlocks.length; i++) {
                        const b = movingBlocks[i];
                        if (!b.isMoving) continue;
                        const dest = intentions.get(b.id);
                        if (!dest) continue;
                        if (stoppedBits & (1 << (dest.nr * COLS + dest.nc))) {
                            b.isMoving = false;
                            intentions.delete(b.id);
                            changed = true;
                        }
                    }
                }
            };
            resolveStoppedQueue();

            // 正面すれ違い衝突停止
            let swapCollisionOccurred = false;
            for (let i = 0; i < movingBlocks.length; i++) {
                const b = movingBlocks[i];
                if (!b.isMoving || !intentions.has(b.id)) continue;
                const dest = intentions.get(b.id);
                let other = null;
                for (let j = 0; j < blocks.length; j++) {
                    const ob = blocks[j];
                    if (ob.id !== b.id && ob.isMoving && ob.col === dest.nc && ob.row === dest.nr) {
                        other = ob;
                        break;
                    }
                }
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
            }
            if (swapCollisionOccurred) {
                resolveStoppedQueue();
            }

            // 同一マス同時進入（超新星爆発）
            let sameCellCollisionOccurred = false;
            const resolveSameCellCollisions = (onlyUnoccupied) => {
                let occupiedBits = 0;
                if (onlyUnoccupied) {
                    for (let i = 0; i < blocks.length; i++) {
                        occupiedBits |= (1 << (blocks[i].row * COLS + blocks[i].col));
                    }
                }
                const targetGroups = new Map();
                for (let i = 0; i < movingBlocks.length; i++) {
                    const b = movingBlocks[i];
                    if (b.isMoving && intentions.has(b.id)) {
                        const dest = intentions.get(b.id);
                        const cellIdx = dest.nr * COLS + dest.nc;
                        if (onlyUnoccupied && (occupiedBits & (1 << cellIdx))) continue;
                        let grp = targetGroups.get(cellIdx);
                        if (!grp) {
                            grp = [];
                            targetGroups.set(cellIdx, grp);
                        }
                        grp.push(b);
                    }
                }
                let collided = false;
                targetGroups.forEach((grp, cellIdx) => {
                    if (grp.length > 1) {
                        const nc = cellIdx % COLS;
                        const nr = (cellIdx - nc) / COLS;
                        if (!supernovas.some(s => s.col === nc && s.row === nr)) {
                            supernovas.push({ col: nc, row: nr, tick: tickCount });
                        }
                        for (let k = 0; k < grp.length; k++) {
                            grp[k].isMoving = false;
                            intentions.delete(grp[k].id);
                        }
                        collided = true;
                        sameCellCollisionOccurred = true;
                    }
                });
                if (collided) {
                    resolveStoppedQueue();
                }
            };

            resolveSameCellCollisions(true);
            resolveSameCellCollisions(false);

            if (intentions.size === 0) {
                tickCount--;
                break;
            }

            // スイッチ上の初期ブロック出発消費
            for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if (b.isMoving && intentions.has(b.id) && b.startedOnSwitch) {
                    consumeSwitchAt(b.col, b.row);
                    b.startedOnSwitch = false;
                }
            }

            // 移動実行
            for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if (b.isMoving && intentions.has(b.id)) {
                    const dest = intentions.get(b.id);
                    b.col = dest.nc;
                    b.row = dest.nr;
                    b.pathLen++;

                    const g = gimmickAt[b.row][b.col];
                    if (g && g.type === 'switch') {
                        const swRes = consumeSwitchAt(b.col, b.row);
                        if (swRes) {
                            b.dir = swRes.dir;
                            b.mode = swRes.mode;
                            b.remainingSteps = (swRes.mode === 'step') ? swRes.steps : Infinity;
                        }
                    } else if (g && (g.type === 'step' || g.type === 'dash')) {
                        b.dir = g.dir;
                        b.mode = g.type;
                        b.remainingSteps = (g.type === 'step') ? (g.steps || 1) : Infinity;
                    } else if (b.mode === 'step') {
                        b.remainingSteps--;
                        if (b.remainingSteps <= 0) {
                            b.isMoving = false;
                        }
                    }
                } else {
                    b.pathLen++;
                }
            }

            if (movingBlocks.some(b => !b.isMoving) || swapCollisionOccurred || sameCellCollisionOccurred) {
                lastStopTick = tickCount;
            }

            const stillMoving = [];
            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i].isMoving) stillMoving.push(blocks[i]);
            }

            if (stillMoving.length > 0) {
                const curSwitchKey = getSimSwitchKey();
                let matchedCount = 0;
                for (let i = 0; i < stillMoving.length; i++) {
                    const b = stillMoving[i];
                    let matched = false;
                    for (let hi = b.history.length - 1; hi >= 0; hi--) {
                        const h = b.history[hi];
                        if (h.tick < lastStopTick) break;
                        if (
                            h.col === b.col &&
                            h.row === b.row &&
                            h.dir === b.dir &&
                            h.mode === b.mode &&
                            h.remainingSteps === b.remainingSteps &&
                            h.switchKey === curSwitchKey &&
                            (b.pathLen - 1 - h.pathIndex) >= 2
                        ) {
                            matched = true;
                            break;
                        }
                    }
                    if (matched) matchedCount++;
                    b.history.push({
                        col: b.col,
                        row: b.row,
                        dir: b.dir,
                        mode: b.mode,
                        remainingSteps: b.remainingSteps,
                        switchKey: curSwitchKey,
                        tick: tickCount,
                        pathIndex: b.pathLen - 1
                    });
                }

                if (matchedCount === stillMoving.length) {
                    blackHoleCount = stillMoving.length;
                    break;
                }
            }
        }

        // maxTicks に到達しても動き続けているブロックがある場合はループ扱い
        if (blackHoleCount === 0 && blocks.some(b => b.isMoving)) {
            blackHoleCount = blocks.filter(b => b.isMoving).length;
        }

        const finalGrid = createEmptyGrid();
        if (supernovas.length === 0 && blackHoleCount === 0) {
            for (let i = 0; i < blocks.length; i++) {
                finalGrid[blocks[i].row][blocks[i].col] = true;
            }
        }

        return {
            finalGrid,
            supernovas,
            blackHoleCount,
            ticks: tickCount
        };
    }

    // ---------------------------------------------------------
    // 2. レーザー・キャラクター経路シミュレータ (main.js 完全準拠)
    // ---------------------------------------------------------
    function computeLaserBeams(lookup, targetGrid) {
        const { lasers } = lookup;
        if (!lasers || lasers.length === 0) return [];
        const beams = [];

        for (let i = 0; i < lasers.length; i++) {
            const laser = lasers[i];
            if (!laser || typeof laser.col !== 'number' || typeof laser.row !== 'number') continue;
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
                continue;
            }

            let c = col;
            let r = row;
            let blocked = false;
            let endX = startX;
            let endY = startY;

            while (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
                if (targetGrid[r][c]) {
                    blocked = true;
                    if (dc === 1) endX = GX + c * CELL;
                    else if (dc === -1) endX = GX + (c + 1) * CELL;
                    else if (dr === 1) endY = GY + r * CELL;
                    else if (dr === -1) endY = GY + (r + 1) * CELL;
                    break;
                }
                c += dc;
                r += dr;
            }

            if (!blocked) {
                if (dc === 1) endX = GX + COLS * CELL;
                else if (dc === -1) endX = GX;
                else if (dr === 1) endY = GY + ROWS * CELL;
                else if (dr === -1) endY = GY;
            }

            if (Math.hypot(endX - startX, endY - startY) >= 1) {
                const dx = Math.abs(endX - startX);
                const dy = Math.abs(endY - startY);
                beams.push({
                    rawMinX: Math.min(startX, endX),
                    rawMaxX: Math.max(startX, endX),
                    rawMinY: Math.min(startY, endY),
                    rawMaxY: Math.max(startY, endY),
                    orientation: dx >= dy ? 'horizontal' : 'vertical',
                    beamX: (startX + endX) / 2,
                    beamY: (startY + endY) / 2
                });
            }
        }
        return beams;
    }

    function solveCharacterRoute(lookup, finalGrid) {
        const { startRow, goalRow, hasCeiling } = lookup;
        const getBlock = (col, row) => {
            if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
            return finalGrid[row][col];
        };

        const keyframes = [];
        let curX = -1.5;
        let curY = startRow;
        let curTime = 0;
        let jumpCount = 0;
        let failKind = null;
        let failCol = -1;

        keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });

        for (let c = -1; c < COLS; c++) {
            const nextCol = c + 1;
            const curKfIdx = keyframes.length - 1;

            if (nextCol === COLS) {
                if (curY === goalRow) {
                    keyframes[curKfIdx].type = 'walk';
                    curTime += (COLS - 0.5 + 0.15 - curX) / WALK_SPEED * 16.67;
                    curX = COLS - 0.5 + 0.15;
                    keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                    break;
                } else if (curY === goalRow + 1) {
                    keyframes[curKfIdx].type = 'jump';
                    jumpCount++;
                    curTime += (COLS - 0.5 + 0.15 - curX) / JUMP_SPEED * 16.67;
                    curX = COLS - 0.5 + 0.15;
                    curY = goalRow;
                    keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                    break;
                } else if (curY === goalRow - 1) {
                    keyframes[curKfIdx].type = 'walk';
                    curTime += (COLS - 0.15 - curX) / WALK_SPEED * 16.67;
                    curX = COLS - 0.15;
                    keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
                    curTime += 60;
                    curY = goalRow;
                    keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
                    curTime += (COLS - 0.5 + 0.15 - curX) / WALK_SPEED * 16.67;
                    curX = COLS - 0.5 + 0.15;
                    keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                    break;
                } else {
                    const wallHitX = COLS - 0.65;
                    keyframes[curKfIdx].type = 'walk';
                    curTime += Math.max(0.05, wallHitX - curX) / WALK_SPEED * 16.67;
                    curX = wallHitX;
                    keyframes.push({ x: curX, y: curY, type: 'crash', time: curTime });
                    curTime += 40;
                    keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                    failKind = 'goal_wall';
                    failCol = COLS;
                    break;
                }
            }

            if (getBlock(nextCol, curY)) {
                const jumpY = curY - 1;
                const ceilHit = hasCeiling && (jumpY < 0);
                const jumpBlocked = (jumpY >= 0) && getBlock(nextCol, jumpY);
                const ceilBlocked = (c >= 0 && curY - 1 >= 0) && getBlock(c, curY - 1);

                if (ceilHit || jumpBlocked || ceilBlocked) {
                    keyframes[curKfIdx].type = 'crash';
                    const cd = Math.min(0.35, nextCol - curX - 0.05);
                    curTime += Math.max(cd, 0.05) / WALK_SPEED * 16.67;
                    curX = Math.min(curX + Math.max(cd, 0.05), nextCol - 0.02);
                    keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                    failKind = ceilHit ? 'ceiling' : 'wall';
                    failCol = nextCol;
                    break;
                }

                keyframes[curKfIdx].type = 'jump';
                jumpCount++;
                curTime += (nextCol - curX) / JUMP_SPEED * 16.67;
                curX = nextCol;
                curY = jumpY;
                keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
                continue;
            }

            if (getBlock(nextCol, curY + 1)) {
                keyframes[curKfIdx].type = 'walk';
                curTime += (nextCol - curX) / WALK_SPEED * 16.67;
                curX = nextCol;
                keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
                continue;
            }

            let landY = null;
            for (let y = curY + 1; y < ROWS; y++) {
                if (getBlock(nextCol, y + 1)) {
                    landY = y;
                    break;
                }
            }

            if (landY !== null) {
                keyframes[curKfIdx].type = 'walk';
                curTime += (nextCol - curX) / WALK_SPEED * 16.67;
                curX = nextCol;
                keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
                curTime += (landY - curY) * 60;
                curY = landY;
                keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
            } else {
                keyframes[curKfIdx].type = 'walk';
                curTime += (nextCol - curX) / WALK_SPEED * 16.67;
                curX = nextCol;
                keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
                curTime += (ROWS + 1.2 - curY) * 55;
                curY = ROWS + 1.2;
                keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                failKind = 'pit';
                failCol = nextCol;
                break;
            }
        }

        // レーザー衝突検査
        const activeBeams = computeLaserBeams(lookup, finalGrid);
        if (activeBeams.length > 0 && keyframes.length >= 2) {
            const getSampleAt = (prevKf, nextKf, ratio) => {
                const x = prevKf.x + (nextKf.x - prevKf.x) * ratio;
                const y = (prevKf.type === 'jump')
                    ? prevKf.y + (nextKf.y - prevKf.y) * ratio - 4 * 0.5 * ratio * (1 - ratio)
                    : prevKf.y + (nextKf.y - prevKf.y) * ratio;
                const time = prevKf.time + (nextKf.time - prevKf.time) * ratio;
                const cx = GX + (x + 0.5) * CELL;
                const onLeftGround = x < -0.5 && y === startRow;
                const bot = GY + (y + 1) * CELL - (onLeftGround ? 0 : 2);
                return { x, y, time, cx, bot, top: bot - 66, centerY: bot - 33 };
            };

            const SUB_STEPS = 48;
            for (let i = 0; i < keyframes.length - 1; i++) {
                const prevKf = keyframes[i];
                const nextKf = keyframes[i + 1];
                for (let s = 0; s < SUB_STEPS; s++) {
                    const r0 = s / SUB_STEPS;
                    const r1 = (s + 1) / SUB_STEPS;
                    const p0 = getSampleAt(prevKf, nextKf, r0);
                    const p1 = getSampleAt(prevKf, nextKf, r1);
                    let bestHit = null;

                    for (let bi = 0; bi < activeBeams.length; bi++) {
                        const b = activeBeams[bi];
                        if (b.orientation === 'vertical') {
                            const crossesX = (p0.cx <= b.beamX && p1.cx >= b.beamX) || (p0.cx >= b.beamX && p1.cx <= b.beamX);
                            const nearX = Math.abs(p0.cx - b.beamX) <= 0.5 || Math.abs(p1.cx - b.beamX) <= 0.5;
                            if (!crossesX && !nearX) continue;
                            let u = 0;
                            if (Math.abs(p1.cx - p0.cx) > 1e-6) {
                                u = Math.max(0, Math.min(1, (b.beamX - p0.cx) / (p1.cx - p0.cx)));
                            }
                            const hitRatio = r0 + (r1 - r0) * u;
                            const hitSample = getSampleAt(prevKf, nextKf, hitRatio);
                            const overlapY = Math.min(hitSample.bot, b.rawMaxY) - Math.max(hitSample.top, b.rawMinY);
                            const centerInsideY = hitSample.centerY >= b.rawMinY && hitSample.centerY <= b.rawMaxY;
                            if (overlapY >= 33 || centerInsideY) {
                                if (!bestHit || hitRatio < bestHit.ratio) {
                                    bestHit = { ratio: hitRatio, sample: hitSample };
                                }
                            }
                        } else {
                            const crossesY = (p0.centerY <= b.beamY && p1.centerY >= b.beamY) || (p0.centerY >= b.beamY && p1.centerY <= b.beamY);
                            if (crossesY) {
                                let hitRatio = r0;
                                if (Math.abs(p1.centerY - p0.centerY) > 1e-6) {
                                    if (prevKf.type === 'jump') {
                                        let lo = r0, hi = r1;
                                        const fLo = p0.centerY - b.beamY;
                                        if (Math.abs(fLo) < 1e-7) hitRatio = r0;
                                        else if (Math.abs(p1.centerY - b.beamY) < 1e-7) hitRatio = r1;
                                        else {
                                            for (let iter = 0; iter < 18; iter++) {
                                                const mid = (lo + hi) * 0.5;
                                                const fMid = getSampleAt(prevKf, nextKf, mid).centerY - b.beamY;
                                                if ((fLo <= 0 && fMid <= 0) || (fLo >= 0 && fMid >= 0)) lo = mid;
                                                else hi = mid;
                                            }
                                            hitRatio = (lo + hi) * 0.5;
                                        }
                                    } else {
                                        const u = Math.max(0, Math.min(1, (b.beamY - p0.centerY) / (p1.centerY - p0.centerY)));
                                        hitRatio = r0 + (r1 - r0) * u;
                                    }
                                }
                                const hitSample = getSampleAt(prevKf, nextKf, hitRatio);
                                if (hitSample.cx >= b.rawMinX && hitSample.cx <= b.rawMaxX) {
                                    if (!bestHit || hitRatio < bestHit.ratio) {
                                        bestHit = { ratio: hitRatio, sample: hitSample };
                                    }
                                    continue;
                                }
                            }
                            const isPureVerticalMove = Math.abs(p1.cx - p0.cx) < 1e-6;
                            if (!isPureVerticalMove) {
                                const enteringFromSide = (p0.cx < b.rawMinX && p1.cx >= b.rawMinX) || (p0.cx > b.rawMaxX && p1.cx <= b.rawMaxX);
                                const walkingInside = (prevKf.type !== 'fall' && prevKf.type !== 'jump') && p0.cx >= b.rawMinX && p0.cx <= b.rawMaxX;
                                if (enteringFromSide || walkingInside) {
                                    let hitU = null;
                                    if (walkingInside && Math.abs(p0.centerY - b.beamY) <= 17) {
                                        hitU = 0;
                                    } else if (p0.cx < b.rawMinX && p1.cx >= b.rawMinX) {
                                        hitU = (b.rawMinX - p0.cx) / Math.max(1e-6, p1.cx - p0.cx);
                                    } else if (p0.cx > b.rawMaxX && p1.cx <= b.rawMaxX) {
                                        hitU = (b.rawMaxX - p0.cx) / Math.min(-1e-6, p1.cx - p0.cx);
                                    }
                                    if (hitU !== null) {
                                        hitU = Math.max(0, Math.min(1, hitU));
                                        const hitRatio = r0 + (r1 - r0) * hitU;
                                        const hitSample = getSampleAt(prevKf, nextKf, hitRatio);
                                        if (Math.abs(hitSample.centerY - b.beamY) <= 17) {
                                            if (!bestHit || hitRatio < bestHit.ratio) {
                                                bestHit = { ratio: hitRatio, sample: hitSample };
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (bestHit) {
                        const hitCol = Math.max(0, Math.min(COLS - 1, Math.round(bestHit.sample.x)));
                        return {
                            cleared: false,
                            failKind: 'laser',
                            failCol: hitCol,
                            clearTime: bestHit.sample.time,
                            jumpCount
                        };
                    }
                }
            }
        }

        const lastKf = keyframes[keyframes.length - 1];
        const cleared = Boolean(lastKf && lastKf.type === 'done');
        return {
            cleared,
            failKind: cleared ? null : (failKind || 'fail'),
            failCol,
            clearTime: lastKf ? lastKf.time : 0,
            jumpCount
        };
    }

    // ---------------------------------------------------------
    // 3. 単一配置の詳細診断 API (現在の solution 検証用)
    // ---------------------------------------------------------
    function validateSolution(stage, coordsOverride = null, options = {}) {
        const lookup = buildStageLookup(stage);
        const coords = Array.isArray(coordsOverride) ? coordsOverride : (Array.isArray(stage.solution) ? stage.solution : []);
        const grid = coordsToGrid(coords);
        const blockCount = countBlocksInGrid(grid);

        if (blockCount === 0 && coords.length === 0) {
            if (lookup.requiredList.length === 0) {
                const zeroRoute = solveCharacterRoute(lookup, grid);
                if (zeroRoute.cleared) {
                    return {
                        ok: true,
                        blockCount: 0,
                        ticks: 0,
                        jumpCount: zeroRoute.jumpCount,
                        clearTime: zeroRoute.clearTime,
                        reasonCode: 'ok_zero',
                        message: 'ブロック0個のままでゴールに到達できます'
                    };
                }
            }
            return {
                ok: false,
                blockCount: 0,
                reasonCode: 'empty_solution',
                message: '正解ブロックがまだ配置されていません'
            };
        }

        for (let i = 0; i < coords.length; i++) {
            const p = coords[i];
            if (!p || p.row < 0 || p.row >= ROWS || p.col < 0 || p.col >= COLS) continue;
            if (lookup.forbidden[p.row][p.col]) {
                return {
                    ok: false,
                    blockCount,
                    reasonCode: 'on_forbidden',
                    message: `禁止マス ${p.col},${p.row} に正解ブロックが置かれています`
                };
            }
        }

        if (!options.ignoreMaxBlocks && blockCount > lookup.maxBlocks) {
            return {
                ok: false,
                blockCount,
                reasonCode: 'exceeds_max',
                message: `正解ブロック数 ${blockCount}個 が上限 maxBlocks ${lookup.maxBlocks}個 を超えています`
            };
        }

        for (let i = 0; i < lookup.requiredList.length; i++) {
            const req = lookup.requiredList[i];
            if (!grid[req.row][req.col]) {
                return {
                    ok: false,
                    blockCount,
                    reasonCode: 'missing_purple',
                    message: `紫枠の必須マス ${req.col},${req.row} に正解ブロックがありません`
                };
            }
        }

        if (!areBlocksConnected(grid)) {
            return {
                ok: false,
                blockCount,
                reasonCode: 'disconnected',
                message: '正解ブロック同士が縦・横・斜めの8方向で一続きに連結していません'
            };
        }

        const sim = simulateGimmickMoves(lookup, grid);
        if (sim.supernovas.length > 0) {
            const s0 = sim.supernovas[0];
            return {
                ok: false,
                blockCount,
                reasonCode: 'supernova',
                message: `ギミック移動中にマス ${s0.col},${s0.row} でブロック同士が衝突し超新星爆発が発生します`
            };
        }
        if (sim.blackHoleCount > 0) {
            return {
                ok: false,
                blockCount,
                reasonCode: 'blackhole',
                message: `ギミック移動が無限ループになりブラックホールが発生します`
            };
        }

        const route = solveCharacterRoute(lookup, sim.finalGrid);
        if (!route.cleared) {
            let reasonMsg = 'ゴールに到達できません';
            if (route.failKind === 'laser') {
                reasonMsg = `列 ${route.failCol} 付近でキャラクターがレーザーに切断されます`;
            } else if (route.failKind === 'pit') {
                reasonMsg = `列 ${route.failCol} に足場がなくキャラクターが穴へ落下します`;
            } else if (route.failKind === 'ceiling') {
                reasonMsg = `列 ${route.failCol} でジャンプ時に天井へ衝突します`;
            } else if (route.failKind === 'wall') {
                reasonMsg = `列 ${route.failCol} で2段以上の壁または頭上ブロックに阻まれます`;
            } else if (route.failKind === 'goal_wall') {
                reasonMsg = '右端到達時の高さがゴールと合わず右壁に衝突します';
            }
            return {
                ok: false,
                blockCount,
                reasonCode: route.failKind || 'route_fail',
                message: reasonMsg
            };
        }

        return {
            ok: true,
            blockCount,
            ticks: sim.ticks,
            jumpCount: route.jumpCount,
            clearTime: route.clearTime,
            finalGrid: sim.finalGrid,
            reasonCode: 'ok',
            message: `クリア可能：正解ブロック ${blockCount}個 でゴール到達を確認しました`
        };
    }

    // ---------------------------------------------------------
    // 4. 静的構造解析・下界算出・供給マスク前処理
    // ---------------------------------------------------------
    function analyzeStageStructure(lookup) {
        const { forbidden, gimmickAt, requiredList, startRow, goalRow, hasCeiling, lasers } = lookup;

        const getDirsAt = (r, c) => {
            const g = gimmickAt[r][c];
            if (!g) return null;
            if (g.type === 'switch') return getSwitchDirSequence(g);
            if (g.type === 'step' || g.type === 'dash') return [g.dir];
            return null;
        };

        // 各セルに置いたブロックが到達し得るセル・列の計算
        const canReach = Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: COLS }, (__, c) => !forbidden[r][c])
        );

        let changed = true;
        while (changed) {
            changed = false;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (!canReach[r][c]) continue;
                    const g = gimmickAt[r][c];
                    const dirs = getDirsAt(r, c);
                    if (!dirs) continue;
                    // 注意: step でも別セルのブロックに玉突きされる手前までは 1 マス、dash は直進全マスに到達可能
                    const isDash = (g.type === 'dash' || (g.type === 'switch' && getEffectiveGimmickMoveType(g) === 'dash'));
                    for (let di = 0; di < dirs.length; di++) {
                        const dv = DIR_DELTA[dirs[di]];
                        if (!dv) continue;
                        let nr = r + dv[0];
                        let nc = c + dv[1];
                        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                            if (!canReach[nr][nc]) {
                                canReach[nr][nc] = true;
                                changed = true;
                            }
                            if (!isDash) break;
                            nr += dv[0];
                            nc += dv[1];
                        }
                    }
                }
            }
        }

        // 各初期セル (r,c) から出発した1個のブロックが最終的に到達し得る列の 5bit マスク
        const supplyColsAt = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        for (let sr = 0; sr < ROWS; sr++) {
            for (let sc = 0; sc < COLS; sc++) {
                if (forbidden[sr][sc]) continue;
                const vis = createEmptyGrid();
                vis[sr][sc] = true;
                const q = [{ r: sr, c: sc }];
                let colMask = (1 << sc);
                let head = 0;
                while (head < q.length) {
                    const cur = q[head++];
                    const g = gimmickAt[cur.r][cur.c];
                    const dirs = getDirsAt(cur.r, cur.c);
                    if (!dirs) continue;
                    const isDash = (g.type === 'dash' || (g.type === 'switch' && getEffectiveGimmickMoveType(g) === 'dash'));
                    for (let di = 0; di < dirs.length; di++) {
                        const dv = DIR_DELTA[dirs[di]];
                        if (!dv) continue;
                        let nr = cur.r + dv[0];
                        let nc = cur.c + dv[1];
                        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                            colMask |= (1 << nc);
                            if (!vis[nr][nc]) {
                                vis[nr][nc] = true;
                                q.push({ r: nr, c: nc });
                            }
                            if (!isDash) break;
                            nr += dv[0];
                            nc += dv[1];
                        }
                    }
                }
                supplyColsAt[sr][sc] = colMask;
            }
        }

        // 保守的静止可能セル (canStay)
        const canStay = createEmptyGrid();
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!getDirsAt(r, c) && canReach[r][c]) {
                    canStay[r][c] = true;
                }
            }
        }
        let stayChanged = true;
        while (stayChanged) {
            stayChanged = false;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (canStay[r][c] || !canReach[r][c]) continue;
                    const dirs = getDirsAt(r, c);
                    if (!dirs) continue;
                    for (let di = 0; di < dirs.length; di++) {
                        const d = dirs[di];
                        const dv = DIR_DELTA[d];
                        if (!dv) continue;
                        const nr = r + dv[0];
                        const nc = c + dv[1];
                        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || canStay[nr][nc]) {
                            canStay[r][c] = true;
                            stayChanged = true;
                            break;
                        }
                        const nbrDirs = getDirsAt(nr, nc);
                        if (nbrDirs && canReach[nr][nc] && nbrDirs.includes(OPPOSITE_DIR[d])) {
                            canStay[r][c] = true;
                            stayChanged = true;
                            break;
                        }
                    }
                }
            }
        }

        // 移動しない必須紫枠は確実にその場に残る
        const fixedTrue = createEmptyGrid();
        for (let i = 0; i < requiredList.length; i++) {
            const p = requiredList[i];
            if (!getDirsAt(p.row, p.col)) {
                fixedTrue[p.row][p.col] = true;
            }
        }

        // 絶対に遮断できない垂直レーザー範囲
        const guaranteedVBeamsAtCol = [[], [], [], [], []];
        for (let i = 0; i < lasers.length; i++) {
            const laser = lasers[i];
            if (!laser || (laser.side !== 'top' && laser.side !== 'bottom')) continue;
            const c = laser.col;
            let r = laser.row;
            if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
            const dr = laser.side === 'top' ? 1 : -1;
            const startY = laser.side === 'top' ? (GY + r * CELL) : (GY + (r + 1) * CELL);
            let endY = startY;
            while (r >= 0 && r < ROWS) {
                if (canStay[r][c]) {
                    endY = laser.side === 'top' ? (GY + r * CELL) : (GY + (r + 1) * CELL);
                    break;
                }
                r += dr;
            }
            if (r < 0 || r >= ROWS) {
                endY = laser.side === 'top' ? (GY + ROWS * CELL) : GY;
            }
            const minY = Math.min(startY, endY);
            const maxY = Math.max(startY, endY);
            if (maxY - minY > 1) {
                guaranteedVBeamsAtCol[c].push({ minY, maxY });
            }
        }

        const isHeightKilledByGuaranteedBeam = (c, y) => {
            const beams = guaranteedVBeamsAtCol[c];
            if (beams.length === 0) return false;
            const bot = GY + (y + 1) * CELL - 2;
            const topSafe = bot - 48;
            const botSafe = bot - 16;
            return beams.some(b => botSafe >= b.minY + 1 && topSafe <= b.maxY - 1);
        };

        // 候補列高さ経路の列挙
        const rawPaths = [];
        const colHeights = new Array(COLS);

        function dfsPaths(c, curY) {
            if (c === COLS) {
                if (curY === goalRow || curY === goalRow + 1 || curY === goalRow - 1) {
                    rawPaths.push(colHeights.slice());
                }
                return;
            }
            const jumpY = curY - 1;
            if (curY >= 0 && curY < ROWS && canStay[curY][c]) {
                const ceilHit = hasCeiling && (jumpY < 0);
                const jumpBlocked = (jumpY >= 0 && jumpY < ROWS) && fixedTrue[jumpY][c];
                const prevCeilBlocked = (c - 1 >= 0 && curY - 1 >= 0) && fixedTrue[curY - 1][c - 1];
                if (!ceilHit && !jumpBlocked && !prevCeilBlocked && !isHeightKilledByGuaranteedBeam(c, jumpY)) {
                    colHeights[c] = jumpY;
                    dfsPaths(c + 1, jumpY);
                }
            }
            if (curY >= 0 && curY < ROWS && !fixedTrue[curY][c]) {
                if (curY < 4 && canStay[curY + 1][c] && !isHeightKilledByGuaranteedBeam(c, curY)) {
                    colHeights[c] = curY;
                    dfsPaths(c + 1, curY);
                }
                for (let ny = curY + 1; ny < 4; ny++) {
                    if (fixedTrue[ny][c]) break;
                    if (canStay[ny + 1][c] && !isHeightKilledByGuaranteedBeam(c, ny)) {
                        colHeights[c] = ny;
                        dfsPaths(c + 1, ny);
                    }
                }
            } else if (curY === -1) {
                for (let ny = 0; ny < 4; ny++) {
                    if (fixedTrue[ny][c]) break;
                    if (canStay[ny + 1][c] && !isHeightKilledByGuaranteedBeam(c, ny)) {
                        colHeights[c] = ny;
                        dfsPaths(c + 1, ny);
                    }
                }
            }
        }
        dfsPaths(0, startRow);

        // 各経路に対する厳密下界 minNeed と必須供給列マスクの算出
        const computePathInfo = (ys) => {
            const seedMap = new Map();
            const addCell = (r, c) => {
                if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                    seedMap.set(r * COLS + c, { r, c });
                }
            };
            for (let c = 0; c < COLS; c++) {
                addCell(ys[c] + 1, c);
            }
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (fixedTrue[r][c]) addCell(r, c);
                }
            }

            // 垂直レーザーがキャラ位置 (c, ys[c]) を直撃する場合、その手前の遮断可能セル群を抽出
            const extraLaserBlockers = [];
            for (let i = 0; i < lasers.length; i++) {
                const l = lasers[i];
                if (!l || (l.side !== 'top' && l.side !== 'bottom')) continue;
                const c = l.col;
                if (c < 0 || c >= COLS) continue;
                const charY = ys[c];
                const bot = GY + (charY + 1) * CELL - 2;
                const centerY = bot - 33;
                const fullStart = l.side === 'top' ? (GY + l.row * CELL) : (GY + (l.row + 1) * CELL);
                const fullEnd = l.side === 'top' ? (GY + ROWS * CELL) : GY;
                if (centerY >= Math.min(fullStart, fullEnd) && centerY <= Math.max(fullStart, fullEnd)) {
                    // ビーム元からキャラ中心より手前で止められる候補セルを集める
                    const dr = l.side === 'top' ? 1 : -1;
                    let rr = l.row;
                    const candidates = [];
                    let alreadyCovered = false;
                    while (rr >= 0 && rr < ROWS) {
                        const stopY = l.side === 'top' ? (GY + rr * CELL) : (GY + (rr + 1) * CELL);
                        const blocksBeforeChar = l.side === 'top' ? (stopY < centerY) : (stopY > centerY);
                        if (!blocksBeforeChar) break;
                        if (seedMap.has(rr * COLS + c)) {
                            alreadyCovered = true;
                            break;
                        }
                        if (canStay[rr][c]) {
                            candidates.push({ r: rr, c });
                        }
                        rr += dr;
                    }
                    if (!alreadyCovered) {
                        if (candidates.length === 0) {
                            return null; // どうやっても遮断不能
                        }
                        if (candidates.length === 1) {
                            addCell(candidates[0].r, candidates[0].c);
                        } else {
                            extraLaserBlockers.push(candidates);
                        }
                    }
                }
            }

            // 移動ギミック上の一意ストッパー閉包展開
            let loop = true;
            while (loop) {
                loop = false;
                const values = Array.from(seedMap.values());
                for (let vi = 0; vi < values.length; vi++) {
                    const { r, c } = values[vi];
                    const dirs = getDirsAt(r, c);
                    if (!dirs) continue;
                    let satisfied = false;
                    const cands = [];
                    for (let di = 0; di < dirs.length; di++) {
                        const dv = DIR_DELTA[dirs[di]];
                        if (!dv) continue;
                        const nr = r + dv[0];
                        const nc = c + dv[1];
                        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seedMap.has(nr * COLS + nc)) {
                            satisfied = true;
                            break;
                        }
                        if (canStay[nr][nc] || (getDirsAt(nr, nc) && canReach[nr][nc])) {
                            cands.push({ r: nr, c: nc });
                        }
                    }
                    if (!satisfied) {
                        if (cands.length === 0) return null;
                        if (cands.length === 1) {
                            addCell(cands[0].r, cands[0].c);
                            loop = true;
                        }
                    }
                }
            }

            // まだ未充足の複数候補レーザー遮断セットがあれば、既存 seedMap と重ならない独立分を下界に加算
            let extraCount = 0;
            const usedColsSet = new Set();
            for (let i = 0; i < extraLaserBlockers.length; i++) {
                const cands = extraLaserBlockers[i];
                if (cands.some(p => seedMap.has(p.r * COLS + p.c))) continue;
                const colKey = cands[0].c;
                if (!usedColsSet.has(colKey)) {
                    usedColsSet.add(colKey);
                    extraCount++;
                }
            }

            const minNeed = Math.max(seedMap.size + extraCount, requiredList.length);
            return {
                ys,
                minNeed,
                seedCells: Array.from(seedMap.values()),
                extraLaserBlockers
            };
        };

        const paths = [];
        for (let i = 0; i < rawPaths.length; i++) {
            const info = computePathInfo(rawPaths[i]);
            if (info) paths.push(info);
        }
        paths.sort((a, b) => a.minNeed - b.minNeed);

        // 全有効経路に共通して最終盤面で最低1個ブロックが必要な列マスク (通常 0b11111 = 31)
        let commonFinalColsMask = paths.length > 0 ? 0b11111 : 0;
        for (let i = 0; i < paths.length; i++) {
            let pm = 0;
            for (let j = 0; j < paths[i].seedCells.length; j++) {
                pm |= (1 << paths[i].seedCells[j].c);
            }
            commonFinalColsMask &= pm;
        }

        // 各セルに逆向きで流入し得る「1〜4マス手前の発射元セル候補」の逆引きマップ（ガイド探索用）
        const reverseOriginsAt = Array.from({ length: ROWS }, () =>
            Array.from({ length: COLS }, () => [])
        );
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!forbidden[r][c]) {
                    reverseOriginsAt[r][c].push({ r, c });
                }
            }
        }
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (forbidden[r][c]) continue;
                const g = gimmickAt[r][c];
                const dirs = getDirsAt(r, c);
                if (!dirs) continue;
                const isDash = (g.type === 'dash' || (g.type === 'switch' && getEffectiveGimmickMoveType(g) === 'dash'));
                for (let di = 0; di < dirs.length; di++) {
                    const dv = DIR_DELTA[dirs[di]];
                    if (!dv) continue;
                    let nr = r + dv[0];
                    let nc = c + dv[1];
                    while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        const list = reverseOriginsAt[nr][nc];
                        if (!list.some(p => p.r === r && p.c === c)) {
                            list.push({ r, c });
                        }
                        if (!isDash) break;
                        nr += dv[0];
                        nc += dv[1];
                    }
                }
            }
        }

        return {
            canReach,
            canStay,
            fixedTrue,
            supplyColsAt,
            commonFinalColsMask,
            paths,
            reverseOriginsAt,
            getDirsAt
        };
    }

    // 8方向BFSで指定シード群を最小個数の非禁止セルで一続きに繋ぐ
    function connectSeedsMinBridge(forbidden, seedList, maxAllowed) {
        const g = createEmptyGrid();
        const used = [];
        for (let i = 0; i < seedList.length; i++) {
            const p = seedList[i];
            if (p.r >= 0 && p.r < ROWS && p.c >= 0 && p.c < COLS && !forbidden[p.r][p.c] && !g[p.r][p.c]) {
                g[p.r][p.c] = true;
                used.push({ r: p.r, c: p.c });
            }
        }
        if (used.length === 0 || used.length > maxAllowed) return null;

        while (!areBlocksConnected(g)) {
            const comp = new Set();
            const q = [used[0]];
            comp.add(used[0].r * COLS + used[0].c);
            const bfsQ = [{ r: used[0].r, c: used[0].c, parent: null }];
            const visited = new Set([used[0].r * COLS + used[0].c]);

            while (q.length > 0) {
                const cur = q.shift();
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = cur.r + dr, nc = cur.c + dc;
                        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc]) {
                            const key = nr * COLS + nc;
                            if (!comp.has(key)) {
                                comp.add(key);
                                q.push({ r: nr, c: nc });
                                bfsQ.push({ r: nr, c: nc, parent: null });
                                visited.add(key);
                            }
                        }
                    }
                }
            }

            let foundBridge = null;
            let head = 0;
            while (head < bfsQ.length && !foundBridge) {
                const curNode = bfsQ[head++];
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = curNode.r + dr, nc = curNode.c + dc;
                        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || forbidden[nr][nc]) continue;
                        const key = nr * COLS + nc;
                        if (g[nr][nc] && !comp.has(key)) {
                            foundBridge = curNode;
                            break;
                        }
                        if (!visited.has(key)) {
                            visited.add(key);
                            bfsQ.push({ r: nr, c: nc, parent: curNode });
                        }
                    }
                    if (foundBridge) break;
                }
            }
            if (!foundBridge) return null;

            let trace = foundBridge;
            while (trace) {
                if (!g[trace.r][trace.c]) {
                    g[trace.r][trace.c] = true;
                    used.push({ r: trace.r, c: trace.c });
                    if (used.length > maxAllowed) return null;
                }
                trace = trace.parent;
            }
        }
        return { grid: g, count: used.length };
    }

    // ---------------------------------------------------------
    // 5. 最小ブロック数探索コア (ジェネレータによる同期・非同期共用実装)
    // ---------------------------------------------------------
    function* createMinSolutionSearchGenerator(stage, options = {}) {
        const lookup = buildStageLookup(stage);
        const { forbidden, requiredList, maxBlocks } = lookup;

        // 必須セルが禁止マスと重複していたら絶対不可能
        for (let i = 0; i < requiredList.length; i++) {
            if (forbidden[requiredList[i].row][requiredList[i].col]) {
                return {
                    found: false,
                    reasonCode: 'required_on_forbidden',
                    evaluatedCount: 0,
                    message: `紫枠の必須マス ${requiredList[i].col},${requiredList[i].row} が禁止マスと重なっているためクリア不可能です`
                };
            }
        }

        let evaluatedCount = 0;

        // k = 0 チェック
        if (requiredList.length === 0) {
            const emptyG = createEmptyGrid();
            evaluatedCount++;
            const r0 = solveCharacterRoute(lookup, emptyG);
            if (r0.cleared) {
                return {
                    found: true,
                    solution: [],
                    solutions: [{
                        solution: [],
                        blockCount: 0,
                        ticks: 0,
                        jumpCount: r0.jumpCount,
                        clearTime: r0.clearTime
                    }],
                    solutionCount: 1,
                    solutionsTruncated: false,
                    blockCount: 0,
                    exceededOriginalMaxBlocks: false,
                    recommendedMaxBlocks: maxBlocks,
                    ticks: 0,
                    jumpCount: r0.jumpCount,
                    clearTime: r0.clearTime,
                    evaluatedCount,
                    message: 'ブロックを1個も置かずに0個でゴール可能です'
                };
            }
        }

        const analysis = analyzeStageStructure(lookup);
        if (analysis.paths.length === 0) {
            return {
                found: false,
                reasonCode: 'no_structural_path',
                evaluatedCount,
                message: 'どのブロック配置でも足場またはレーザー回避経路が成立しないためクリア不可能です'
            };
        }

        // 利用可能セル (最大25個) とビットマスク前計算
        const avail = [];
        const cellToAvail = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!forbidden[r][c]) {
                    cellToAvail[r][c] = avail.length;
                    avail.push({ r, c, supplyMask: analysis.supplyColsAt[r][c] });
                }
            }
        }
        const N = avail.length;
        if (N === 0 || requiredList.length > N) {
            return {
                found: false,
                reasonCode: 'no_available_cells',
                evaluatedCount,
                message: '配置可能なマスが不足しているためクリア不可能です'
            };
        }

        const adjMask = new Array(N).fill(0);
        for (let i = 0; i < N; i++) {
            let m = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = avail[i].r + dr;
                    const nc = avail[i].c + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        const j = cellToAvail[nr][nc];
                        if (j !== -1) m |= (1 << j);
                    }
                }
            }
            adjMask[i] = m;
        }

        let reqMask = 0;
        let firstReqIdx = N;
        for (let i = 0; i < requiredList.length; i++) {
            const idx = cellToAvail[requiredList[i].row][requiredList[i].col];
            reqMask |= (1 << idx);
            if (idx < firstReqIdx) firstReqIdx = idx;
        }

        // 必須紫マス同士がそもそも avail グラフ上で連結可能か確認
        if (reqMask !== 0) {
            let reach = (1 << firstReqIdx);
            let front = reach;
            while (front !== 0) {
                let nf = 0;
                for (let b = front; b; b &= b - 1) {
                    nf |= adjMask[31 - Math.clz32(b & -b)];
                }
                nf &= ~reach;
                reach |= nf;
                front = nf;
            }
            if ((reach & reqMask) !== reqMask) {
                return {
                    found: false,
                    reasonCode: 'required_disconnected',
                    evaluatedCount,
                    message: '禁止マスに阻まれて紫枠の必須マス同士を連結できないためクリア不可能です'
                };
            }
        }

        // 各根 root 以降で供給可能な列の累積マスク suffixSupplyCols[root]
        const suffixSupplyCols = new Array(N + 1).fill(0);
        for (let i = N - 1; i >= 0; i--) {
            suffixSupplyCols[i] = suffixSupplyCols[i + 1] | avail[i].supplyMask;
        }
        const commonCols = analysis.commonFinalColsMask;

        // 5bit 列マスクの立っているビット数テーブル
        const POPCNT5 = new Uint8Array(32);
        for (let m = 1; m < 32; m++) POPCNT5[m] = POPCNT5[m >> 1] + (m & 1);

        // 単一セルで何列分供給できるかの最大値 (すべて非移動なら 1、横移動があれば >1)
        let maxColsPerSingleCell = 1;
        for (let i = 0; i < N; i++) {
            const pc = POPCNT5[avail[i].supplyMask & commonCols];
            if (pc > maxColsPerSingleCell) maxColsPerSingleCell = pc;
        }

        const evalGridCandidate = (grid) => {
            evaluatedCount++;
            const sim = simulateGimmickMoves(lookup, grid);
            if (sim.supernovas.length > 0 || sim.blackHoleCount > 0) return null;
            const route = solveCharacterRoute(lookup, sim.finalGrid);
            if (!route.cleared) return null;
            return {
                grid,
                solution: gridToCoords(grid),
                blockCount: countBlocksInGrid(grid),
                ticks: sim.ticks,
                jumpCount: route.jumpCount,
                clearTime: route.clearTime
            };
        };

        const maskToGrid = (mask) => {
            const g = createEmptyGrid();
            for (let i = 0; i < N; i++) {
                if (mask & (1 << i)) {
                    g[avail[i].r][avail[i].c] = true;
                }
            }
            return g;
        };

        // 経路ガイドから直接生成した有望シード候補をあらかじめサイズ別に分類キャッシュ
        const guidedCandidatesByK = new Map();
        const addGuidedGrid = (gObj) => {
            if (!gObj) return;
            let mask = 0;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (gObj.grid[r][c]) {
                        const idx = cellToAvail[r][c];
                        if (idx === -1) return;
                        mask |= (1 << idx);
                    }
                }
            }
            if ((mask & reqMask) !== reqMask) return;
            let bucket = guidedCandidatesByK.get(gObj.count);
            if (!bucket) {
                bucket = new Set();
                guidedCandidatesByK.set(gObj.count, bucket);
            }
            bucket.add(mask);
        };

        const maxSearchLimit = options.allowExceedMaxBlocks !== false
            ? Math.min(N, Math.max(maxBlocks, 14))
            : Math.min(N, maxBlocks);

        // 上位候補経路から直接ブリッジ・ストッパー・逆発射元を組み合わせたガイド候補を構築
        const reqSeedCoords = requiredList.map(p => ({ r: p.row, c: p.col }));
        for (let pi = 0; pi < Math.min(analysis.paths.length, 60); pi++) {
            const pInfo = analysis.paths[pi];
            const baseSeeds = [...reqSeedCoords, ...pInfo.seedCells];
            addGuidedGrid(connectSeedsMinBridge(forbidden, baseSeeds, maxSearchLimit));

            // 移動マス上の足場に対する全方向隣接ストッパー展開
            const stopperSeeds = [...baseSeeds];
            for (let si = 0; si < pInfo.seedCells.length; si++) {
                const sc = pInfo.seedCells[si];
                const dirs = analysis.getDirsAt(sc.r, sc.c);
                if (!dirs) continue;
                for (let di = 0; di < dirs.length; di++) {
                    const dv = DIR_DELTA[dirs[di]];
                    if (!dv) continue;
                    const nr = sc.r + dv[0], nc = sc.c + dv[1];
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !forbidden[nr][nc]) {
                        stopperSeeds.push({ r: nr, c: nc });
                        break;
                    }
                }
            }
            addGuidedGrid(connectSeedsMinBridge(forbidden, stopperSeeds, maxSearchLimit));

            // 逆発射元（ギミックで外から足場へ滑り込む配置）の代表候補
            const revSeeds = [...reqSeedCoords];
            for (let si = 0; si < pInfo.seedCells.length; si++) {
                const sc = pInfo.seedCells[si];
                const origins = analysis.reverseOriginsAt[sc.r][sc.c];
                if (origins.length > 1) {
                    revSeeds.push(origins[1]);
                } else if (origins.length === 1) {
                    revSeeds.push(origins[0]);
                }
            }
            addGuidedGrid(connectSeedsMinBridge(forbidden, revSeeds, maxSearchLimit));
        }

        const startK = Math.max(1, requiredList.length, analysis.paths[0].minNeed);
        const maxEvaluationsTotal = options.maxEvaluations || 250000;
        const yieldInterval = options.yieldEvery || 350;
        let stepCounter = 0;

        // 既定の stage.solution も有効なら上限キャップの基準として保持
        let knownUpperBound = null;
        if (Array.isArray(stage.solution) && stage.solution.length > 0) {
            const curVal = validateSolution(stage, stage.solution, { ignoreMaxBlocks: true });
            if (curVal.ok) {
                knownUpperBound = {
                    solution: stage.solution.map(p => ({ col: p.col, row: p.row })),
                    blockCount: curVal.blockCount,
                    ticks: curVal.ticks,
                    jumpCount: curVal.jumpCount,
                    clearTime: curVal.clearTime
                };
            }
        }

        const effectiveLimit = knownUpperBound
            ? Math.min(maxSearchLimit, knownUpperBound.blockCount)
            : maxSearchLimit;

        const collectAll = options.collectAll !== false;
        const maxSolutions = Math.max(1, Number(options.maxSolutions) || 200);

        const coordsToAvailMask = (coords) => {
            if (!Array.isArray(coords)) return -1;
            let mask = 0;
            for (let i = 0; i < coords.length; i++) {
                const p = coords[i];
                if (!p || p.row < 0 || p.row >= ROWS || p.col < 0 || p.col >= COLS) return -1;
                const idx = cellToAvail[p.row][p.col];
                if (idx === -1) return -1;
                mask |= (1 << idx);
            }
            return mask;
        };

        for (let k = startK; k <= effectiveLimit; k++) {
            let bestAtK = null;
            const foundSolutionsAtK = [];
            const foundMasksAtK = new Set();
            let solutionsTruncated = false;

            const recordHit = (mask, hit) => {
                if (!hit) return;
                if (mask >= 0) {
                    if (foundMasksAtK.has(mask)) return;
                    foundMasksAtK.add(mask);
                }
                const entry = {
                    solution: hit.solution,
                    blockCount: hit.blockCount,
                    ticks: hit.ticks,
                    jumpCount: hit.jumpCount,
                    clearTime: hit.clearTime
                };
                foundSolutionsAtK.push(entry);
                if (
                    !bestAtK ||
                    entry.clearTime < bestAtK.clearTime ||
                    (entry.clearTime === bestAtK.clearTime && entry.jumpCount < bestAtK.jumpCount)
                ) {
                    bestAtK = entry;
                }
            };

            if (knownUpperBound && k === knownUpperBound.blockCount) {
                const knownMask = coordsToAvailMask(knownUpperBound.solution);
                recordHit(knownMask, knownUpperBound);
                if (!collectAll) {
                    const gSet = guidedCandidatesByK.get(k);
                    if (gSet) {
                        for (const mask of gSet) {
                            const hit = evalGridCandidate(maskToGrid(mask));
                            if (hit) recordHit(mask, hit);
                        }
                    }
                    const exceeded = bestAtK.blockCount > maxBlocks;
                    return {
                        found: true,
                        solution: bestAtK.solution,
                        solutions: foundSolutionsAtK,
                        solutionCount: foundSolutionsAtK.length,
                        solutionsTruncated: false,
                        blockCount: bestAtK.blockCount,
                        exceededOriginalMaxBlocks: exceeded,
                        recommendedMaxBlocks: exceeded ? bestAtK.blockCount : maxBlocks,
                        ticks: bestAtK.ticks,
                        jumpCount: bestAtK.jumpCount,
                        clearTime: bestAtK.clearTime,
                        evaluatedCount,
                        message: exceeded
                            ? `元の最大数 ${maxBlocks}個 ではクリア不可のため、最小 ${bestAtK.blockCount}個 の解を検出しました`
                            : `最小 ${bestAtK.blockCount}個 の正解配置を検出しました`
                    };
                }
            }

            // Step A: サイズ k のガイド付き候補を先に評価
            const guidedSet = guidedCandidatesByK.get(k);
            if (guidedSet) {
                for (const mask of guidedSet) {
                    const hit = evalGridCandidate(maskToGrid(mask));
                    if (hit) {
                        recordHit(mask, hit);
                        if (!collectAll || foundSolutionsAtK.length >= maxSolutions) {
                            if (foundSolutionsAtK.length >= maxSolutions) {
                                solutionsTruncated = true;
                            }
                            break;
                        }
                    }
                }
                if (bestAtK && (!collectAll || solutionsTruncated)) {
                    foundSolutionsAtK.sort((a, b) => (a.clearTime - b.clearTime) || (a.jumpCount - b.jumpCount));
                    bestAtK = foundSolutionsAtK[0];
                    const exceeded = bestAtK.blockCount > maxBlocks;
                    return {
                        found: true,
                        solution: bestAtK.solution,
                        solutions: foundSolutionsAtK,
                        solutionCount: foundSolutionsAtK.length,
                        solutionsTruncated,
                        blockCount: bestAtK.blockCount,
                        exceededOriginalMaxBlocks: exceeded,
                        recommendedMaxBlocks: exceeded ? bestAtK.blockCount : maxBlocks,
                        ticks: bestAtK.ticks,
                        jumpCount: bestAtK.jumpCount,
                        clearTime: bestAtK.clearTime,
                        evaluatedCount,
                        message: exceeded
                            ? `元の最大数 ${maxBlocks}個 ではクリア不可のため、最小 ${bestAtK.blockCount}個 の解を検出しました`
                            : `最小 ${bestAtK.blockCount}個 の正解配置を検出しました`
                    };
                }
            }

            // Step B: サイズ k の Redelmeier 完全連結列挙 (ビットマスク枝刈り付き)
            const maxRoot = reqMask !== 0 ? Math.min(N - 1, firstReqIdx) : (N - k);
            let exhaustedOrCapped = false;

            for (let root = 0; root <= maxRoot; root++) {
                // root 以降の全セルを使っても必要列が埋まらないなら即終了
                if ((suffixSupplyCols[root] & commonCols) !== commonCols) break;
                // root 以降の残りセル数が k 未満ならサイズ k は作れない
                if (N - root < k) break;

                const rootBit = (1 << root);
                const aboveOrEqualMask = (~(rootBit - 1)) & ((1 << N) - 1);
                const initNeighbors = adjMask[root] & aboveOrEqualMask & ~rootBit;
                const initUntried = [];
                for (let bits = initNeighbors; bits; bits &= bits - 1) {
                    initUntried.push(31 - Math.clz32(bits & -bits));
                }
                const initSeen = ((rootBit - 1) | rootBit | initNeighbors);

                const stack = [{
                    mask: rootBit,
                    count: 1,
                    supplyCols: avail[root].supplyMask,
                    untried: initUntried,
                    seen: initSeen,
                    idx: initUntried.length - 1
                }];

                while (stack.length > 0) {
                    stepCounter++;
                    if (stepCounter >= yieldInterval) {
                        stepCounter = 0;
                        const shouldAbort = yield {
                            currentK: k,
                            maxK: effectiveLimit,
                            evaluatedCount,
                            foundCount: foundSolutionsAtK.length
                        };
                        if (shouldAbort) {
                            return {
                                found: false,
                                aborted: true,
                                reasonCode: 'aborted',
                                evaluatedCount,
                                message: '自動計算を中断しました'
                            };
                        }
                    }

                    if (evaluatedCount >= maxEvaluationsTotal) {
                        exhaustedOrCapped = true;
                        break;
                    }

                    const frame = stack[stack.length - 1];

                    if (frame.count === k) {
                        stack.pop();
                        if ((frame.mask & reqMask) === reqMask && (frame.supplyCols & commonCols) === commonCols) {
                            if (!guidedSet || !guidedSet.has(frame.mask)) {
                                const hit = evalGridCandidate(maskToGrid(frame.mask));
                                if (hit) {
                                    recordHit(frame.mask, hit);
                                    if (!collectAll || foundSolutionsAtK.length >= maxSolutions) {
                                        if (foundSolutionsAtK.length >= maxSolutions) {
                                            solutionsTruncated = true;
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                        continue;
                    }

                    if (frame.idx < 0) {
                        stack.pop();
                        continue;
                    }

                    const rem = k - frame.count;
                    if (frame.idx + 1 < rem && stack.length === 1) {
                        // ルート直下で候補不足
                    }

                    // 列供給数枝刈り: 単一セル最大供給数 * 残り個数 で未カバー必要列に届かないならポップ
                    const missingCols = commonCols & ~frame.supplyCols;
                    if (missingCols !== 0 && maxColsPerSingleCell === 1 && POPCNT5[missingCols] > rem) {
                        stack.pop();
                        continue;
                    }

                    // 必須紫マス距離枝刈り
                    if (reqMask !== 0 && (frame.mask & reqMask) !== reqMask) {
                        let reach = frame.mask;
                        let front = frame.mask;
                        for (let stp = 0; stp < rem; stp++) {
                            let nf = 0;
                            for (let b = front; b; b &= b - 1) {
                                nf |= adjMask[31 - Math.clz32(b & -b)];
                            }
                            nf = (nf & aboveOrEqualMask) & ~reach;
                            reach |= nf;
                            front = nf;
                            if ((reach & reqMask) === reqMask || front === 0) break;
                        }
                        if ((reach & reqMask) !== reqMask) {
                            stack.pop();
                            continue;
                        }
                    }

                    const u = frame.untried[frame.idx];
                    frame.idx--;

                    // u を選ばない場合は frame がそのまま次の idx を処理（ただし u は既に frame.seen に入っているため再訪しない）
                    // u を選ぶ子フレームを push する: untried の残り [0 .. frame.idx] + u の新規隣接
                    const childUntried = frame.idx >= 0 ? frame.untried.slice(0, frame.idx + 1) : [];
                    const newNbrBits = adjMask[u] & aboveOrEqualMask & ~frame.seen;
                    let childSeen = frame.seen | newNbrBits;
                    if (newNbrBits !== 0) {
                        for (let bits = newNbrBits; bits; bits &= bits - 1) {
                            childUntried.push(31 - Math.clz32(bits & -bits));
                        }
                    }

                    if (frame.count + 1 < k && childUntried.length === 0) {
                        continue;
                    }

                    stack.push({
                        mask: frame.mask | (1 << u),
                        count: frame.count + 1,
                        supplyCols: frame.supplyCols | avail[u].supplyMask,
                        untried: childUntried,
                        seen: childSeen,
                        idx: childUntried.length - 1
                    });
                }

                if (bestAtK && (!collectAll || solutionsTruncated)) break;
                if (exhaustedOrCapped) break;
            }

            if (bestAtK) {
                foundSolutionsAtK.sort((a, b) => (a.clearTime - b.clearTime) || (a.jumpCount - b.jumpCount));
                bestAtK = foundSolutionsAtK[0];
                const exceeded = bestAtK.blockCount > maxBlocks;
                return {
                    found: true,
                    solution: bestAtK.solution,
                    solutions: foundSolutionsAtK,
                    solutionCount: foundSolutionsAtK.length,
                    solutionsTruncated,
                    blockCount: bestAtK.blockCount,
                    exceededOriginalMaxBlocks: exceeded,
                    recommendedMaxBlocks: exceeded ? bestAtK.blockCount : maxBlocks,
                    ticks: bestAtK.ticks,
                    jumpCount: bestAtK.jumpCount,
                    clearTime: bestAtK.clearTime,
                    evaluatedCount,
                    message: exceeded
                        ? `元の最大数 ${maxBlocks}個 ではクリア不可のため、最小 ${bestAtK.blockCount}個 の解を検出しました`
                        : `最小 ${bestAtK.blockCount}個 の正解配置を検出しました`
                };
            }

            if (exhaustedOrCapped) {
                break;
            }
        }

        return {
            found: false,
            reasonCode: 'unsolvable',
            evaluatedCount,
            message: 'すべての有効なブロック配置を検証しましたが、ゴールに到達できる解は存在しません'
        };
    }

    function findMinimumSolutionSync(stage, options = {}) {
        const gen = createMinSolutionSearchGenerator(stage, options);
        let step = gen.next();
        while (!step.done) {
            step = gen.next(false);
        }
        return step.value;
    }

    async function findMinimumSolutionAsync(stage, options = {}) {
        const gen = createMinSolutionSearchGenerator(stage, {
            ...options,
            yieldEvery: options.yieldEvery || 280
        });
        let lastYieldMs = Date.now();
        let step = gen.next(false);

        while (!step.done) {
            const aborted = Boolean(options.isCancelled && options.isCancelled());
            if (aborted) {
                step = gen.next(true);
                break;
            }
            const now = Date.now();
            if (now - lastYieldMs >= 14) {
                if (typeof options.onProgress === 'function') {
                    options.onProgress(step.value);
                }
                await new Promise(resolve => setTimeout(resolve, 0));
                lastYieldMs = Date.now();
            }
            step = gen.next(Boolean(options.isCancelled && options.isCancelled()));
        }
        return step.value;
    }

    return {
        validateSolution,
        findMinimumSolutionSync,
        findMinimumSolutionAsync,
        coordsToGrid,
        gridToCoords,
        areBlocksConnected
    };
});
