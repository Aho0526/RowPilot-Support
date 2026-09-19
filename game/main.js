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

// Sliding block animations queue: [{ fromCol, toCol, row, progress, startTime, duration }]
let slidingBlocks = [];

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

// MARK: - Gimmick Block Movements at Start
function applyGimmickBlockMoves() {
    const st = getStage();
    const moves = [];

    // Find all blocks placed on gimmick tiles
    st.gimmicks.forEach(g => {
        if (grid[g.row][g.col]) {
            moves.push({
                gimmick: g,
                fromCol: g.col,
                row: g.row
            });
        }
    });

    if (moves.length === 0) return false;

    // Separate by direction to resolve collisions smoothly
    // Right moves: resolve from right to left (descending col)
    // Left moves: resolve from left to right (ascending col)
    const rightMoves = moves.filter(m => m.gimmick.dir === 'right').sort((a, b) => b.fromCol - a.fromCol);
    const leftMoves = moves.filter(m => m.gimmick.dir === 'left').sort((a, b) => a.fromCol - b.fromCol);

    let hasAnyMove = false;

    function executeMove(m) {
        const g = m.gimmick;
        const originCol = m.fromCol;
        const row = m.row;

        if (g.type === 'dash') {
            // 水色: 矢印の方向に限界まで移動
            let destCol = originCol;
            if (g.dir === 'right') {
                for (let c = originCol + 1; c < COLS; c++) {
                    if (grid[row][c]) break;
                    destCol = c;
                }
            } else if (g.dir === 'left') {
                for (let c = originCol - 1; c >= 0; c--) {
                    if (grid[row][c]) break;
                    destCol = c;
                }
            }

            if (destCol !== originCol) {
                grid[row][originCol] = false;
                grid[row][destCol] = true;
                slidingBlocks.push({
                    fromCol: originCol,
                    toCol: destCol,
                    row: row,
                    startTime: performance.now(),
                    duration: 350
                });
                hasAnyMove = true;
            }
        } else if (g.type === 'step') {
            // 緑色: 1マスだけ矢印の方向に移動
            let destCol = originCol;
            if (g.dir === 'right') {
                destCol = Math.min(COLS - 1, originCol + 1);
            } else if (g.dir === 'left') {
                destCol = Math.max(0, originCol - 1);
            }

            if (destCol !== originCol && !grid[row][destCol]) {
                grid[row][originCol] = false;
                grid[row][destCol] = true;
                slidingBlocks.push({
                    fromCol: originCol,
                    toCol: destCol,
                    row: row,
                    startTime: performance.now(),
                    duration: 250
                });
                hasAnyMove = true;
            }
        }
    }

    rightMoves.forEach(executeMove);
    leftMoves.forEach(executeMove);

    return hasAnyMove;
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
    const gy = ROWS * CELL;
    // Grass
    ctx.fillStyle = '#54c418';
    ctx.fillRect(0, gy, TOTAL_W, 10);
    for (let x = 0; x < TOTAL_W; x += 14) ctx.fillRect(x, gy, 7, 4);
    // Dirt
    ctx.fillStyle = '#c87830';
    ctx.fillRect(0, gy + 10, TOTAL_W, 34);
    // Brick lines
    const bw = 26, bh = 13;
    ctx.fillStyle = '#a05820';
    for (let row = 0; row * bh < 34; row++) {
        const off = (row % 2) ? bw / 2 : 0;
        for (let bx = -bw + off; bx < TOTAL_W + bw; bx += bw) {
            ctx.fillRect(bx + 1, gy + 10 + row * bh + 1, bw - 2, bh - 2);
        }
        ctx.fillStyle = '#c87830';
        ctx.fillRect(0, gy + 10 + row * bh, TOTAL_W, 1);
        ctx.fillStyle = '#a05820';
    }
}

// Gimmick tile drawing
function drawGimmickTile(gimmick) {
    const x = GX + gimmick.col * CELL;
    const y = GY + gimmick.row * CELL;
    const pulse = (Math.sin(Date.now() / 200) + 1) / 2;

    if (gimmick.type === 'dash') {
        // 水色: 矢印の方向に限界まで移動
        ctx.fillStyle = 'rgba(0, 195, 255, 0.22)';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);

        ctx.save();
        ctx.translate(x + CELL / 2, y + CELL / 2);
        if (gimmick.dir === 'left') ctx.scale(-1, 1);

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

        if (gimmick.purpleBorder) {
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 4;
            ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
    } else if (gimmick.type === 'step') {
        // 緑色: 1マスだけ矢印の方向に移動
        ctx.fillStyle = 'rgba(34, 197, 94, 0.22)';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);

        ctx.save();
        ctx.translate(x + CELL / 2, y + CELL / 2);
        if (gimmick.dir === 'left') ctx.scale(-1, 1);

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
    if (isForbidden(col, row)) return;
    const keyChar = KEY_MAP[row][col].toUpperCase();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(keyChar, GX + (col + 1) * CELL - 4, GY + row * CELL + 4);
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

    // Start orange platform guide line under pipe
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, py + ph);
    ctx.lineTo(GX, py + ph);
    ctx.stroke();
}

// Flag pole + goal block on right
let goalPulse = 0;
function drawGoal() {
    const st = getStage();
    goalPulse = (Date.now() % 1200) / 1200;
    const bx = GX + COLS * CELL;
    const by = GY + st.goalRow * CELL;
    const bw = 56, bh = CELL;

    // Right wall orange boundary line
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bx, by + bh);
    ctx.lineTo(bx, GY + ROWS * CELL);
    ctx.stroke();

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

// Stickman render
function drawStickman(gx_pos, gy_pos) {
    const cx = GX + (gx_pos + 0.5) * CELL;
    const bot = GY + (gy_pos + 1) * CELL - 2;
    const isJump = man.state === 'jump';

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Hat brim
    ctx.fillStyle = '#e83000';
    ctx.fillRect(cx - 10, bot - 58, 20, 6);

    // Hat crown
    ctx.fillRect(cx - 8, bot - 66, 16, 9);

    // Face
    ctx.fillStyle = '#f8c080';
    ctx.fillRect(cx - 8, bot - 52, 16, 14);

    // Eyes
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(cx - 5, bot - 49, 3, 3);
    ctx.fillRect(cx + 3, bot - 49, 3, 3);

    // Moustache
    ctx.fillStyle = '#7a3800';
    ctx.fillRect(cx - 6, bot - 43, 12, 3);

    // Body (overalls)
    ctx.fillStyle = '#4060e0';
    ctx.fillRect(cx - 9, bot - 39, 18, 20);

    // Shirt (red)
    ctx.fillStyle = '#e83000';
    ctx.fillRect(cx - 8, bot - 37, 7, 12);
    ctx.fillRect(cx + 2, bot - 37, 7, 12);

    if (isJump) {
        ctx.fillStyle = '#4060e0';
        ctx.fillRect(cx - 8, bot - 19, 7, 10);
        ctx.fillRect(cx + 2, bot - 19, 7, 10);
        ctx.fillStyle = '#802000';
        ctx.fillRect(cx - 9, bot - 11, 9, 9);
        ctx.fillRect(cx + 1, bot - 11, 9, 9);
    } else {
        const angle = man.walkCycle;
        const leftX = Math.sin(angle) * 5;
        const rightX = -Math.sin(angle) * 5;
        const leftY = Math.sin(angle) > 0 ? Math.sin(angle) * 5 : 0;
        const rightY = Math.sin(angle) < 0 ? -Math.sin(angle) * 5 : 0;

        // Left leg
        ctx.fillStyle = '#4060e0';
        ctx.fillRect(cx - 8 + leftX, bot - 19 - leftY, 6, 14);
        ctx.fillStyle = '#802000';
        ctx.fillRect(cx - 9 + leftX, bot - 7 - leftY, 8, 7);

        // Right leg
        ctx.fillStyle = '#4060e0';
        ctx.fillRect(cx + 2 + rightX, bot - 19 - rightY, 6, 14);
        ctx.fillStyle = '#802000';
        ctx.fillRect(cx + 1 + rightX, bot - 7 - rightY, 8, 7);
    }

    ctx.restore();
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

    const st = getStage();

    // Draw forbidden tiles (赤の斜線)
    st.forbidden.forEach(f => {
        drawForbiddenTile(f.col, f.row);
    });

    // Draw gimmick tiles (水色 / 緑色矢印)
    st.gimmicks.forEach(g => {
        drawGimmickTile(g);
    });

    // Draw placed blocks
    const now = performance.now();
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) {
                // Check if this block is currently animating
                const anim = slidingBlocks.find(b => b.toCol === c && b.row === r);
                if (anim) {
                    const elapsed = now - anim.startTime;
                    const progress = Math.min(1, elapsed / anim.duration);
                    const currentC = anim.fromCol + (anim.toCol - anim.fromCol) * progress;
                    drawMarioBlock(currentC, r);
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

    // Draw character
    if (phase === 'place') {
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
                // Clear!
                keyframes[curKfIdx].type = 'walk';
                curTime += (COLS - 0.5 + 0.15 - curX) / WALK_SPEED * 16.67;
                curX = COLS - 0.5 + 0.15;
                keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                return keyframes;
            } else {
                // Hit wall or fall
                keyframes[curKfIdx].type = 'walk';
                curTime += (COLS - curX) / WALK_SPEED * 16.67;
                curX = COLS;
                keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
                curTime += (ROWS - curY) * 150;
                curY = ROWS;
                keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                return keyframes;
            }
        }

        const blockAhead = getBlock(nextCol, curY);
        if (blockAhead) {
            // Jump
            const jumpY = curY - 1;
            const outOfTop = jumpY < 0;
            const jumpBlocked = !outOfTop && getBlock(nextCol, jumpY);
            const ceilBlocked = (c >= 0) && getBlock(c, curY - 1);

            if (outOfTop || jumpBlocked || ceilBlocked) {
                // Crash
                keyframes[curKfIdx].type = 'crash';
                const cd = Math.min(0.4, nextCol - curX - 0.05);
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
        const hasFloor = getBlock(nextCol, curY + 1) || (curY + 1 >= ROWS);
        if (hasFloor) {
            keyframes[curKfIdx].type = 'walk';
            curTime += (nextCol - curX) / WALK_SPEED * 16.67;
            curX = nextCol;
            keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
            continue;
        }

        // No floor -> find landing
        let landY = -1;
        for (let y = curY + 1; y < ROWS; y++) {
            if (getBlock(nextCol, y + 1) || (y + 1 >= ROWS)) {
                landY = y;
                break;
            }
        }

        if (landY === -1) {
            keyframes[curKfIdx].type = 'walk';
            curTime += (nextCol - curX) / WALK_SPEED * 16.67;
            curX = nextCol;
            keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
            curTime += (ROWS - curY) * 150;
            curY = ROWS;
            keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
            return keyframes;
        }

        keyframes[curKfIdx].type = 'walk';
        curTime += (nextCol - curX) / WALK_SPEED * 16.67;
        curX = nextCol;
        keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
        curTime += (landY - curY) * 120;
        curY = landY;
        keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
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
            phase = 'fail';
            render();
            showFail();
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

// MARK: - UI & Feedback
function showClear() {
    statusBar.innerHTML = '<span class="status-clear">★ クリア！ おめでとう！ ★</span>';
    hintText.textContent = 'リセットでもう一度チャレンジ！または次のステージへ！';
    startBtn.disabled = true;
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

    // Update popup grid active states
    if (stageMenuGrid) {
        const items = stageMenuGrid.querySelectorAll('.stage-grid-item');
        items.forEach((btn, idx) => {
            if (idx === currentStageIndex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

function initStageMenuGrid() {
    if (!stageMenuGrid) return;
    stageMenuGrid.innerHTML = '';
    STAGES.forEach((st, idx) => {
        const btn = document.createElement('button');
        btn.className = `stage-grid-item ${idx === currentStageIndex ? 'active' : ''}`;
        btn.textContent = st.id;
        btn.title = st.title;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectStage(idx);
            closeStageMenu();
        });
        stageMenuGrid.appendChild(btn);
    });
}

function toggleStageMenu() {
    if (!stageMenuPopup) return;
    stageMenuPopup.classList.toggle('open');
}

function closeStageMenu() {
    if (stageMenuPopup) {
        stageMenuPopup.classList.remove('open');
    }
}

function selectStage(idx) {
    if (idx < 0 || idx >= STAGES.length) return;
    currentStageIndex = idx;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    actionHistory = [];
    slidingBlocks = [];
    phase = 'place';
    man = makeMan();
    startBtn.disabled = false;
    statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
    hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';

    updateStageNavUI();
    updateBlockBadge();
    updateLegendUI();
    render();
}

function bgLoop() {
    if (phase === 'place') render();
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
    statusBar = document.getElementById('statusBar');
    hintText = document.getElementById('hintText');
    stageCurrentTitle = document.getElementById('stageCurrentTitle');
    stageCurrentBtn = document.getElementById('stageCurrentBtn');
    stageMenuPopup = document.getElementById('stageMenuPopup');
    stageMenuGrid = document.getElementById('stageMenuGrid');
    prevStageBtn = document.getElementById('prevStageBtn');
    nextStageBtn = document.getElementById('nextStageBtn');
    blockCountVal = document.getElementById('blockCountVal');
    legendWrap = document.getElementById('legendWrap');

    initStageMenuGrid();
    updateStageNavUI();
    updateBlockBadge();
    updateLegendUI();

    // Stage dropdown popup handlers
    stageCurrentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStageMenu();
    });

    document.addEventListener('click', () => {
        closeStageMenu();
    });

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
        startBtn.disabled = true;

        // スタート前のブロック配置をバックアップ
        originalGrid = grid.map(r => [...r]);

        // スタート直後にブロック移動ギミックを適用
        const hasMove = applyGimmickBlockMoves();

        if (hasMove) {
            phase = 'block_move';
            statusBar.innerHTML = '<span class="status-run">ブロック移動中...</span>';
            hintText.textContent = '';
            render();

            // ブロックの移動アニメーション完了後にキャラクターが走り出す
            setTimeout(() => {
                if (phase !== 'block_move') return;
                statusBar.innerHTML = '<span class="status-run"> GO GO GO!!</span>';
                startRun();
            }, 400);
        } else {
            statusBar.innerHTML = '<span class="status-run"> GO GO GO!!</span>';
            hintText.textContent = '';
            startRun();
        }
    }

    function triggerReset() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        slidingBlocks = [];

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

    // Keyboard input
    window.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();

        if (e.key === 'Shift') {
            triggerReset();
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter') {
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

    render();
    requestAnimationFrame(bgLoop);
});
