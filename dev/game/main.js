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
const TOTAL_H = ROWS * CELL + 44;

const GX = LEFT_W;
const GY = 0;

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

// Sliding block animations queue & Multi-round gimmick animation state
let slidingBlocks = [];
let blockAnimationRounds = [];
let currentRoundIndex = 0;
let roundStartTime = null;

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

// MARK: - Helper Functions
function isForbidden(col, row) {
    const st = getStage();
    return st.forbidden.some(f => f.col === col && f.row === row);
}

function getGimmick(col, row) {
    const st = getStage();
    return st.gimmicks.find(g => g.col === col && g.row === row);
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
        [ 0, -1],          [ 0, 1],
        [ 1, -1], [ 1, 0], [ 1, 1]
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

function updateBlockBadge() {
    if (!blockCountVal) return;
    const placed = countPlacedBlocks();
    const max = getStage().maxBlocks;
    blockCountVal.textContent = `${placed} / ${max}`;
    if (placed >= max) {
        blockCountVal.classList.add('limit');
    } else {
        blockCountVal.classList.remove('limit');
    }

    if (phase === 'place' && statusBar) {
        if (placed >= 2 && !areBlocksConnected()) {
            statusBar.innerHTML = '<span class="status-place" style="color: #fbbf24;">⚠️ ブロック同士をくっつけて配置してください</span>';
        } else if (!showSolution) {
            statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
        }
    }
}

// Saved grid before block movement for retry
let originalGrid = null;

// MARK: - Normal Block Placement (Does not move until Start)
function placeBlock(col, row) {
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
                statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
            }
        }, 1200);
        return;
    }

    const max = getStage().maxBlocks;
    if (countPlacedBlocks() >= max) {
        statusBar.innerHTML = `<span class="status-fail">ブロックは最大${max}個までです！</span>`;
        setTimeout(() => {
            if (phase === 'place') {
                statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
            }
        }, 1200);
        return;
    }

    grid[row][col] = true;
    actionHistory.push({ row, col, remove: false });
    updateBlockBadge();
    render();
}

// MARK: - Gimmick Block Movements at Start (連鎖・複数ステップ対応シミュレーション)
function simulateGimmickBlockMoves() {
    const st = getStage();
    const rounds = [];
    // シミュレーション作業用の一時グリッド
    const simGrid = grid.map(r => [...r]);

    const maxRounds = 20;
    let roundCount = 0;

    while (roundCount < maxRounds) {
        roundCount++;
        // 矢印ギミック（step または dash）の上にブロックが乗っているか？
        const candidateMoves = [];
        st.gimmicks.forEach(g => {
            if ((g.type === 'step' || g.type === 'dash') && simGrid[g.row][g.col]) {
                candidateMoves.push({
                    gimmick: g,
                    fromCol: g.col,
                    fromRow: g.row
                });
            }
        });

        if (candidateMoves.length === 0) {
            // 動くブロックがもうない -> シミュレーション完了
            break;
        }

        // 衝突を避ける自然な順序でソート（先頭側のブロックから動かす）
        const upMoves = candidateMoves.filter(m => m.gimmick.dir === 'up').sort((a, b) => a.fromRow - b.fromRow);
        const downMoves = candidateMoves.filter(m => m.gimmick.dir === 'down').sort((a, b) => b.fromRow - a.fromRow);
        const leftMoves = candidateMoves.filter(m => m.gimmick.dir === 'left').sort((a, b) => a.fromCol - b.fromCol);
        const rightMoves = candidateMoves.filter(m => m.gimmick.dir === 'right').sort((a, b) => b.fromCol - a.fromCol);

        const orderedMoves = [...upMoves, ...downMoves, ...leftMoves, ...rightMoves];
        const roundMoves = [];

        orderedMoves.forEach(m => {
            const g = m.gimmick;
            const originCol = m.fromCol;
            const originRow = m.fromRow;

            // すでに他のブロックが移動してこのマスが変わっていないか確認
            if (!simGrid[originRow][originCol]) return;

            // 一旦自身を simGrid から外す
            simGrid[originRow][originCol] = false;

            let curC = originCol;
            let curR = originRow;
            let currentDir = g.dir;
            let currentMode = g.type; // 'dash' または 'step'
            let remainingSteps = (currentMode === 'step') ? 1 : Infinity;

            const path = [{ col: curC, row: curR }];
            const visited = new Set();
            visited.add(`${curC},${curR},${currentDir},${currentMode}`);

            const maxTotalSteps = COLS * ROWS * 2;
            let totalStepsTaken = 0;

            while (totalStepsTaken < maxTotalSteps) {
                let nextC = curC;
                let nextR = curR;
                if (currentDir === 'right') nextC++;
                else if (currentDir === 'left') nextC--;
                else if (currentDir === 'up') nextR--;
                else if (currentDir === 'down') nextR++;

                // 壁（グリッド境界）に衝突
                if (nextC < 0 || nextC >= COLS || nextR < 0 || nextR >= ROWS) {
                    break;
                }
                // 他のブロックに衝突（※赤斜線 isForbidden は通過・停止可能）
                if (simGrid[nextR][nextC]) {
                    break;
                }

                // 1マス進む
                curC = nextC;
                curR = nextR;
                path.push({ col: curC, row: curR });
                totalStepsTaken++;

                // 移動先（または通過中）のマスに矢印ギミックがあるかチェック
                const tileGimmick = getGimmick(curC, curR);
                if (tileGimmick && tileGimmick.type) {
                    // 矢印マスを踏んだ/着地した！
                    if (tileGimmick.type === 'step') {
                        currentDir = tileGimmick.dir;
                        currentMode = 'step';
                        remainingSteps = 1;
                    } else if (tileGimmick.type === 'dash') {
                        currentDir = tileGimmick.dir;
                        currentMode = 'dash';
                        remainingSteps = Infinity;
                    }
                } else {
                    // 通常マス
                    if (currentMode === 'step') {
                        remainingSteps--;
                        if (remainingSteps <= 0) {
                            break;
                        }
                    }
                }

                // ループ検知
                const stateKey = `${curC},${curR},${currentDir},${currentMode}`;
                if (visited.has(stateKey)) {
                    break;
                }
                visited.add(stateKey);
            }

            const destCol = curC;
            const destRow = curR;

            // 最終位置にブロックを配置
            simGrid[destRow][destCol] = true;

            if (destCol !== originCol || destRow !== originRow) {
                roundMoves.push({
                    fromCol: originCol,
                    fromRow: originRow,
                    toCol: destCol,
                    toRow: destRow,
                    path: path,
                    duration: Math.max(220, (path.length - 1) * 90)
                });
            }
        });

        if (roundMoves.length === 0) {
            // このラウンドで動けたブロックがない -> 終了
            break;
        }

        rounds.push(roundMoves);
    }

    return { rounds, finalGrid: simGrid };
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
        // このラウンドの移動を実際の grid に反映
        currentMoves.forEach(m => {
            grid[m.fromRow][m.fromCol] = false;
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

function renderBlockMoveState(activeMoves, progress) {
    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);
    drawBackground();
    drawGround();
    drawGridLines();
    drawCeiling();

    const st = getStage();
    st.forbidden.forEach(f => drawForbiddenTile(f.col, f.row));
    st.gimmicks.forEach(g => drawGimmickTile(g));
    drawSolutionOverlay();

    // 静止しているブロックを描画
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) {
                const isMoving = activeMoves.some(m => m.fromCol === c && m.fromRow === r);
                if (!isMoving) {
                    drawMarioBlock(c, r);
                }
            }
        }
    }

    // 移動中のブロックを描画（path に沿った補間位置）
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
        drawMarioBlock(currentC, currentR);
    });

    drawPipe();
    drawGoal();
    drawStickman(-1.5, st.startRow);
}

function finishBlockMove() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    blockAnimationRounds = [];
    currentRoundIndex = 0;
    statusBar.innerHTML = '<span class="status-run"> GO GO GO!!</span>';
    startRun();
}

// MARK: - Drawing Helpers
function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, TOTAL_H);
    g.addColorStop(0, '#5c94fc');
    g.addColorStop(1, '#8bbcff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);
}

function drawGround() {
    const st = getStage();
    const gridLeft = GX;
    const gridRight = GX + COLS * CELL;

    // スタート位置（st.startRow）の足元に合わせて左側地面の上面高さを決定
    // キャラクターの足元・土管の設置面は (st.startRow + 1) * CELL
    const startGroundY = GY + (st.startRow + 1) * CELL;

    // ゴール位置（st.goalRow）の足元に合わせて右側地面の上面高さを決定
    const goalGroundY = GY + (st.goalRow + 1) * CELL;

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
        ctx.fillStyle = '#a05820';
        for (let row = 0; row * bh < totalHeight - 10; row++) {
            const off = (row % 2) ? bw / 2 : 0;
            const by = topY + 10 + row * bh;
            for (let bx = startX - bw + off; bx < startX + width + bw; bx += bw) {
                if (bx + 1 >= startX && bx + bw - 1 <= startX + width) {
                    const blockH = Math.min(bh - 2, topY + totalHeight - by - 2);
                    if (blockH > 0) {
                        ctx.fillRect(bx + 1, by + 1, bw - 2, blockH);
                    }
                }
            }
        }
    }

    // 左側の足場 (スタート位置に合わせて地面を上まで伸ばす)
    renderGroundSection(0, gridLeft, startGroundY);

    // 右側の足場 (ゴール位置に合わせて地面を上まで伸ばす)
    renderGroundSection(gridRight, TOTAL_W - gridRight, goalGroundY);

    // 中央グリッド下の奈落演出（底なしの穴・崖）
    ctx.save();
    // 崖の左端の影 (startGroundY から TOTAL_H まで)
    const leftShadow = ctx.createLinearGradient(gridLeft, startGroundY, gridLeft + 14, startGroundY);
    leftShadow.addColorStop(0, 'rgba(0,0,0,0.4)');
    leftShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(gridLeft, startGroundY, 14, TOTAL_H - startGroundY);

    // 崖の右端の影 (goalGroundY から TOTAL_H まで)
    const rightShadow = ctx.createLinearGradient(gridRight - 14, goalGroundY, gridRight, goalGroundY);
    rightShadow.addColorStop(0, 'rgba(0,0,0,0)');
    rightShadow.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = rightShadow;
    ctx.fillRect(gridRight - 14, goalGroundY, 14, TOTAL_H - goalGroundY);

    // 奈落の最下部グラデーション
    const pitGrad = ctx.createLinearGradient(0, ROWS * CELL, 0, TOTAL_H);
    pitGrad.addColorStop(0, 'rgba(15, 23, 42, 0.12)');
    pitGrad.addColorStop(1, 'rgba(15, 23, 42, 0.50)');
    ctx.fillStyle = pitGrad;
    ctx.fillRect(gridLeft, ROWS * CELL, gridRight - gridLeft, TOTAL_H - ROWS * CELL);

    ctx.restore();
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
    } else if (gimmick.purpleBorder) {
        // 矢印のない紫枠マス（ブロックが置かれていない場合のみ背景表示）
        if (!isBlockPlacedHere) {
            ctx.fillStyle = 'rgba(168, 85, 247, 0.16)';
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
    }

    // ブロックが置かれているマスでは紫枠を描画しない（ブロックの周りが紫色になるバグを防止）
    if (gimmick.purpleBorder && !isBlockPlacedHere) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
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

// Mario-style brick block
function drawMarioBlock(col, row) {
    const x = GX + col * CELL, y = GY + row * CELL;
    const p = 2;
    ctx.fillStyle = '#e8a020';
    ctx.fillRect(x + p, y + p, CELL - p * 2, CELL - p * 2);
    ctx.fillStyle = '#f8c860';
    ctx.fillRect(x + p, y + p, CELL - p * 2, 5);
    ctx.fillRect(x + p, y + p, 5, CELL - p * 2, 5);
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
}

// Warp-pipe / Start platform on left
function drawPipe() {
    const st = getStage();
    const px = GX - 78;
    const py = GY + st.startRow * CELL + 2;
    const pw = 60, ph = CELL - 4;

    ctx.fillStyle = '#44aa00';
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#66cc22';
    ctx.fillRect(px - 5, py, pw + 10, 14);
    ctx.fillStyle = '#226600';
    ctx.fillRect(px + pw - 10, py, 10, ph);
    ctx.fillRect(px + pw, py, 5, 14);
    ctx.fillStyle = '#fff';
    ctx.font = '5px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('START', px + pw / 2, py - 14);
    ctx.textAlign = 'left';
}

// Flag pole + goal block on right
let goalPulse = 0;
function drawGoal() {
    const st = getStage();
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
    const bot = GY + (gy_pos + 1) * CELL - 2;
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

function toggleSolution() {
    showSolution = !showSolution;
    if (answerBtn) {
        if (showSolution) {
            answerBtn.classList.add('active');
            answerBtn.innerHTML = '<span class="btn-main-label">答えを隠す</span><span class="btn-key-badge">.</span>';
        } else {
            answerBtn.classList.remove('active');
            answerBtn.innerHTML = '<span class="btn-main-label">答え合わせ</span><span class="btn-key-badge">.</span>';
        }
    }

    if (showSolution) {
        const check = checkSolutionMatch();
        if (check.isMatch) {
            statusBar.innerHTML = '<span class="status-clear">【答え合わせ】正解の配置と一致しています！</span>';
        } else {
            statusBar.innerHTML = `<span class="status-place">【答え合わせ】オレンジ枠を表示中 (${check.matchCount}/${check.totalSolution} 正解)</span>`;
            hintText.textContent = 'オレンジ枠に合わせてブロックを配置してみよう';
        }
    } else {
        statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
        hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
    }
    render();
}

function applySolutionToGrid() {
    const st = getStage();
    if (!st.solution) return;

    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    st.solution.forEach(sol => {
        grid[sol.row][sol.col] = true;
        actionHistory.push({ row: sol.row, col: sol.col, remove: false });
    });

    showSolution = true;
    if (answerBtn) {
        answerBtn.classList.add('active');
        answerBtn.textContent = '答えを隠す';
    }
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

    // Draw forbidden tiles (赤の斜線)
    st.forbidden.forEach(f => {
        drawForbiddenTile(f.col, f.row);
    });

    // Draw gimmick tiles (水色 / 緑色矢印)
    st.gimmicks.forEach(g => {
        drawGimmickTile(g);
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
}

// MARK: - Route Solver & Simulation (Character moves rightward)
function solveRoute() {
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
    return keyframes;
}

function startRun() {
    phase = 'run';
    man = makeMan();
    currentRoute = solveRoute();
    routeStartTime = null;
    prevTime = null;
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

    if (nextKf === null) {
        man.x = prevKf.x;
        man.y = prevKf.y;
        man.state = (prevKf.type === 'done' || prevKf.type === 'clear') ? 'done' : 'fail';

        if (prevKf.type === 'done' || prevKf.type === 'clear') {
            phase = 'clear';
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
    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;

    statusBar.innerHTML = '<span class="status-place">ブロックを再配置 (Space: 開始 / m: 全クリア)</span>';
    hintText.textContent = 'Spaceキーで即座に再スタートできます！';
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
function getClearedStages() {
    try {
        const val = localStorage.getItem('hako_cleared_stages');
        return val ? JSON.parse(val) : [];
    } catch (e) {
        return [];
    }
}

function markStageCleared(idx) {
    const cleared = getClearedStages();
    if (!cleared.includes(idx)) {
        cleared.push(idx);
        try {
            localStorage.setItem('hako_cleared_stages', JSON.stringify(cleared));
        } catch (e) {}
    }
}

// MARK: - Stage Select Grid
function updateSelectScreenUI() {
    const selectGrid = document.getElementById('selectScreenGrid');
    const progressBadge = document.getElementById('selectProgressBadge');
    if (!selectGrid) return;

    selectGrid.innerHTML = '';
    const cleared = getClearedStages();

    if (progressBadge) {
        progressBadge.textContent = `クリア: ${cleared.length} / ${STAGES.length}`;
    }

    STAGES.forEach((st, idx) => {
        const card = document.createElement('div');
        const isCleared = cleared.includes(idx);
        card.className = `stage-card ${isCleared ? 'cleared' : ''}`;
        card.innerHTML = `
            <div class="stage-card-num">${st.title}</div>
            <div class="stage-card-blocks">ブロック: 最大${st.maxBlocks}個</div>
            <div class="stage-card-badge">${st.gimmicks.length > 0 ? 'ギミック有' : '基本'}</div>
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
    if (subEl) subEl.textContent = `${st.subtitle} (ブロック最大 ${st.maxBlocks}個)`;

    banner.style.display = 'block';
    banner.style.animation = 'none';
    banner.offsetHeight; // reflow
    banner.style.animation = 'announcePopup 1.8s ease forwards';

    if (announceTimeout) clearTimeout(announceTimeout);
    announceTimeout = setTimeout(() => {
        banner.style.display = 'none';
    }, 1800);
}

// MARK: - UI & Clear Modal with Auto-Transition
let clearCountdownTimer = null;

function showClear() {
    markStageCleared(currentStageIndex);
    statusBar.innerHTML = '<span class="status-clear">★ クリア！ おめでとう！ ★</span>';
    hintText.textContent = '次のステージへ進みます！';
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
        modalSub.textContent = isLastStage
            ? 'おめでとうございます！全19ステージを完全制覇しました！'
            : `お見事！ステージ ${currentStageIndex + 1} をクリア！次のステージを解放しました！`;
    }
    if (nextBtn) {
        if (isLastStage) {
            nextBtn.innerHTML = '<span>ステージ一覧を見る ▶</span>';
        } else {
            nextBtn.innerHTML = `<span>次のステージへ 進む ▶</span><span class="countdown-tag">(<span id="clearCountdown">3</span>秒後に自動移動)</span>`;
        }
    }

    if (clearModal) {
        clearModal.classList.add('open');
    }

    let count = 3;
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

function proceedToNextStage() {
    if (clearCountdownTimer) {
        clearInterval(clearCountdownTimer);
        clearCountdownTimer = null;
    }
    const clearModal = document.getElementById('clearModalOverlay');
    if (clearModal) clearModal.classList.remove('open');

    if (currentStageIndex < STAGES.length - 1) {
        selectStage(currentStageIndex + 1);
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
    hintText.textContent = 'リセットでブロックを配置し直そう';
    startBtn.disabled = true;
}

function updateLegendUI() {
    if (!legendWrap) return;
    const st = getStage();
    legendWrap.innerHTML = '';
    st.legends.forEach(l => {
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
    if (stageCurrentTitle) {
        stageCurrentTitle.textContent = getStage().title;
    }
    if (prevStageBtn) {
        prevStageBtn.disabled = (currentStageIndex === 0);
    }
    if (nextStageBtn) {
        nextStageBtn.disabled = (currentStageIndex === STAGES.length - 1);
    }
}

function selectStage(idx) {
    if (idx < 0 || idx >= STAGES.length) return;
    currentStageIndex = idx;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    slidingBlocks = [];
    blockAnimationRounds = [];
    currentRoundIndex = 0;
    originalGrid = null;
    showSolution = false;
    if (answerBtn) {
        answerBtn.classList.remove('active');
        answerBtn.innerHTML = '<span class="btn-main-label">答え合わせ</span><span class="btn-key-badge">.</span>';
    }
    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;
    statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
    hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';

    updateStageNavUI();
    updateBlockBadge();
    updateLegendUI();
    render();

    // ステージ入場時アナウンスを表示
    triggerStageAnnounce();
}

function bgLoop() {
    if (phase === 'place' && currentView === 'game') render();
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
            selectStage(currentStageIndex - 1);
        });
    }
    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            selectStage(currentStageIndex + 1);
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

    // Mouse input for block placement
    canvas.addEventListener('click', e => {
        if (phase !== 'place') return;
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const mx = (e.clientX - rect.left) * scale;
        const my = (e.clientY - rect.top) * scale;
        const col = Math.floor((mx - GX) / CELL);
        const row = Math.floor((my - GY) / CELL);

        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            placeBlock(col, row);
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
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const mx = (e.clientX - rect.left) * scale;
        const my = (e.clientY - rect.top) * scale;
        const col = Math.floor((mx - GX) / CELL);
        const row = Math.floor((my - GY) / CELL);
        render();

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

        // 紫枠（必須設置）のチェック
        const st = getStage();
        const requiredGimmicks = st.gimmicks.filter(g => g.purpleBorder);
        const missingRequired = requiredGimmicks.filter(g => !grid[g.row][g.col]);
        if (missingRequired.length > 0) {
            statusBar.innerHTML = '<span class="status-fail">紫色の枠には必ずブロックを設置してください！</span>';
            setTimeout(() => {
                if (phase === 'place') {
                    statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
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

        // スタート前のブロック配置をバックアップ
        originalGrid = grid.map(r => [...r]);

        // スタート直後にブロック連鎖移動ギミックをシミュレーション
        const { rounds } = simulateGimmickBlockMoves();

        if (rounds.length > 0) {
            phase = 'block_move';
            blockAnimationRounds = rounds;
            currentRoundIndex = 0;
            roundStartTime = performance.now();
            statusBar.innerHTML = '<span class="status-run">ブロック移動中...</span>';
            hintText.textContent = '';
            animId = requestAnimationFrame(animateBlockMove);
        } else {
            statusBar.innerHTML = '<span class="status-run"> GO GO GO!!</span>';
            hintText.textContent = '';
            startRun();
        }
    }

    function triggerReset() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        slidingBlocks = [];
        blockAnimationRounds = [];
        currentRoundIndex = 0;

        // スタート後（実行中や結果画面）なら、スタート前の配置に復元して再挑戦しやすくする
        if (phase !== 'place' && originalGrid) {
            grid = originalGrid.map(r => [...r]);
            originalGrid = null;
        } else {
            // 配置中なら全ブロックをクリア
            grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            actionHistory = [];
            originalGrid = null;
        }

        phase = 'place';
        man = makeMan();
        startBtn.disabled = false;
        statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
        hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
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

    // 初期画面はホーム
    switchView('home');

    render();
    requestAnimationFrame(bgLoop);
});

// MARK: - External Playground / Editor API
// 教材ページや外部エディタからステージデータを即時注入してテストするためのAPI
window.applyCustomStages = function(newStages, targetIndex = 0) {
    if (!Array.isArray(newStages) || newStages.length === 0) return false;
    STAGES.length = 0;
    newStages.forEach(st => STAGES.push(st));
    if (typeof updateSelectScreenUI === 'function') updateSelectScreenUI();
    if (typeof switchView === 'function') switchView('game');
    if (typeof selectStage === 'function') selectStage(Math.max(0, Math.min(targetIndex, STAGES.length - 1)));
    return true;
};

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UPDATE_STAGES') {
        window.applyCustomStages(event.data.stages, event.data.targetIndex || 0);
    }
});
