//MARK: -constants
const COLS = 5;
const ROWS = 5;
const CELL = 56;

const LEFT_W = 108;
const RIGHT_W = 108;
const TOTAL_W = LEFT_W + COLS * CELL + RIGHT_W;
const TOTAL_H = ROWS * CELL + 44;

const GX = LEFT_W;
const GY = 0;

const GOAL_ROW = 2;

const WALK_SPEED = 0.015;
const JUMP_SPEED = 0.040;

const KEY_MAP = [
    ['q', 'w', 'e', 'r', 't'],
    ['y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g'],
    ['h', 'j', 'k', 'l', 'z'],
    ['x', 'c', 'v', 'b', 'n']
];

function drawKeyGuide(col, row) {
    const keyChar = KEY_MAP[row][col].toUpperCase();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(keyChar, GX + (col + 1) * CELL - 4, GY + row * CELL + 4);
}

//MARK: -state
let canvas;
let ctx;
let startBtn;
let resetBtn;
let statusBar;
let hintText;

let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
let phase = 'place';
let actionHistory = [];

function makeMan() {
    return {
        x: -1.5,
        y: ROWS - 1,
        jumping: false,
        jumpTarget: null,
        state: 'walk',   //what the fuck?
        walkCycle: 0,
    };
}
let man = makeMan();

let animId = null;
let prevTime = null;

//MARK: -grid helpers
function getBlock(col, row) {
    const r = Math.floor(row);
    const c = Math.floor(col);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return grid[r][c];
}

function surfaceInCol(col) {
    const c = Math.floor(col)
    if (c < 0 || c >= COLS) return ROWS;
    for (let r = 0; r < ROWS; r++) {
        if (grid[r][c]) return r;
    }
    return ROWS;
}

function standingRow(col) {
    return surfaceInCol(col) - 1;
}

//MARK: -drawing helpers
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

// Warp-pipe on left
function drawPipe() {
    const px = GX - 78;
    const py = GY + (ROWS - 1) * CELL + 2;
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
// Goal block is at grid row GOAL_ROW, just outside the right edge.
// In canvas coords: x = GX + COLS*CELL, y = GY + GOAL_ROW*CELL
let goalPulse = 0;
function drawGoal() {
    goalPulse = (Date.now() % 1200) / 1200; // 0..1
    const bx = GX + COLS * CELL;
    const by = GY + GOAL_ROW * CELL;
    const bw = 56, bh = CELL;

    // Goal block - pulsing
    const alpha = 0.18 + Math.sin(goalPulse * Math.PI * 2) * 0.14;
    ctx.fillStyle = `rgba(255,244,60,${alpha + 0.12})`;
    ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
    ctx.strokeStyle = '#ffe060';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);
    ctx.fillStyle = '#ffe060';
    ctx.font = '5px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', bx + bw / 2, by + bh / 2 + 2);
    ctx.textAlign = 'left';
}

// Mario-ish chunky stickman
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

//MARK:- Main render
function render() {
    ctx.clearRect(0, 0, TOTAL_W, TOTAL_H);
    drawBackground();
    drawGround();

    // Light sky overlay on grid area
    ctx.fillStyle = 'rgba(100,150,255,0.06)';
    ctx.fillRect(GX, GY, COLS * CELL, ROWS * CELL);
    drawGridLines();
    drawPipe();

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) drawMarioBlock(c, r);
            if (phase === 'place') drawKeyGuide(c, r);
        }
    }

    drawGoal();

    if (phase === 'place') {
        drawStickman(-1.5, ROWS - 1);
    } else {
        drawStickman(man.x, man.y);
    }
}

//MARK:- Route Solver & Simulation
function solveRoute() {
    const keyframes = [];
    let curX = -1.5;
    let curY = ROWS - 1; // row 4 (bottom)
    let curTime = 0;

    // 開始地点
    keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });

    // c = -1 : 土管 → col0 への移行も含めてシミュレート
    for (let c = -1; c < COLS; c++) {
        const nextCol = c + 1;
        const curKfIdx = keyframes.length - 1;

        // ── ゴール到達 ──────────────────────────────────────────
        if (nextCol === COLS) {
            if (curY === GOAL_ROW) {
                // クリア
                keyframes[curKfIdx].type = 'walk';
                curTime += (COLS - 0.5 + 0.15 - curX) / WALK_SPEED * 16.67;
                curX = COLS - 0.5 + 0.15;
                keyframes.push({ x: curX, y: curY, type: 'done', time: curTime });
                return keyframes;
            } else {
                // 右端から奈落落下
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

        // ────────────────────────────────────────────────────────
        // キャラクターは「1マス」として扱う（足元 = curY のみ）
        // 衝突判定: 進行先 (nextCol, curY) にブロックがあるか
        // ────────────────────────────────────────────────────────
        const blockAhead = getBlock(nextCol, curY);

        if (blockAhead) {
            // ── 壁あり → ジャンプ試行 ─────────────────────────
            const jumpY = curY - 1;

            // 上方向の範囲外 (グリッド上端を超える)
            const outOfTop = jumpY < 0;
            // ジャンプ先のマスにブロックがある (頭がめり込む)
            const jumpBlocked = !outOfTop && getBlock(nextCol, jumpY);
            // 今いる列の真上にブロックがある (頭をぶつけてジャンプできない)
            // c >= 0 のときのみチェック (土管エリア c=-1 は天井なし)
            const ceilBlocked = (c >= 0) && getBlock(c, curY - 1);

            if (outOfTop || jumpBlocked || ceilBlocked) {
                // ── クラッシュ演出 ────────────────────────────
                if (curX < 0) {
                    // 土管内でクラッシュ確定 → まずグリッド入口(x=0)まで歩く
                    keyframes[curKfIdx].type = 'walk';
                    curTime += (0 - curX) / WALK_SPEED * 16.67;
                    curX = 0;
                    // グリッド内で少し進んでから止まる
                    keyframes.push({ x: curX, y: curY, type: 'crash', time: curTime });
                    const cd = Math.min(0.35, nextCol - 0.05);
                    curTime += cd / WALK_SPEED * 16.67;
                    curX = cd;
                    keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                } else {
                    keyframes[curKfIdx].type = 'crash';
                    const cd = Math.min(0.4, nextCol - curX - 0.05);
                    curTime += Math.max(cd, 0.05) / WALK_SPEED * 16.67;
                    curX = Math.min(curX + Math.max(cd, 0.05), nextCol - 0.02);
                    keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
                }
                return keyframes;
            }

            // ジャンプ成功
            keyframes[curKfIdx].type = 'jump';
            curTime += (nextCol - curX) / JUMP_SPEED * 16.67;
            curX = nextCol;
            curY = jumpY;
            keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
            continue;
        }

        // ── 壁なし → 歩行 or 落下 ──────────────────────────────
        const hasFloor = getBlock(nextCol, curY + 1) || (curY + 1 >= ROWS);

        if (hasFloor) {
            // 足場あり → 歩く
            keyframes[curKfIdx].type = 'walk';
            curTime += (nextCol - curX) / WALK_SPEED * 16.67;
            curX = nextCol;
            keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
            continue;
        }

        // 足場なし → 落下先を探す
        let landY = -1;
        for (let y = curY + 1; y < ROWS; y++) {
            if (getBlock(nextCol, y + 1) || (y + 1 >= ROWS)) {
                landY = y;
                break;
            }
        }

        if (landY === -1) {
            // 着地点なし → 奈落落下
            keyframes[curKfIdx].type = 'walk';
            curTime += (nextCol - curX) / WALK_SPEED * 16.67;
            curX = nextCol;
            keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
            curTime += (ROWS - curY) * 150;
            curY = ROWS;
            keyframes.push({ x: curX, y: curY, type: 'fail', time: curTime });
            return keyframes;
        }

        // 歩いてから落下
        keyframes[curKfIdx].type = 'walk';
        curTime += (nextCol - curX) / WALK_SPEED * 16.67;
        curX = nextCol;
        keyframes.push({ x: curX, y: curY, type: 'fall', time: curTime });
        curTime += (landY - curY) * 120;
        curY = landY;
        keyframes.push({ x: curX, y: curY, type: 'walk', time: curTime });
        continue;
    }

    keyframes[keyframes.length - 1].type = 'fail';
    return keyframes;
}

let currentRoute = [];
let routeStartTime = null;

function startRun() {
    phase = 'run';
    man = makeMan(); // Ensure man object is freshly initialized
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
    
    // Find keyframe index using a robust index scan
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
        man.state = 'jump'; // use jump pose while falling
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

//MARK:- UI
function showClear() {
    statusBar.innerHTML = '<span class="status-clear">★ クリア！ おめでとう！ ★</span>';
    hintText.textContent = 'リセットでもう一度チャレンジ！';
    startBtn.disabled = true;
}
function showFail() {
    statusBar.innerHTML = '<span class="status-fail">ミス！もう一度挑戦！</span>';
    hintText.textContent = 'リセットでブロックを配置し直そう';
    startBtn.disabled = true;
}

// Render loop
function bgLoop() {
    if (phase === 'place') render();
    requestAnimationFrame(bgLoop);
}

//MARK:- INIT
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = TOTAL_W;
    canvas.height = TOTAL_H;

    startBtn = document.getElementById('startBtn');
    resetBtn = document.getElementById('resetBtn');
    statusBar = document.getElementById('statusBar');
    hintText = document.getElementById('hintText');

    // Mouse input
    canvas.addEventListener('click', e => {
        if (phase !== 'place') return;
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const mx = (e.clientX - rect.left) * scale;
        const my = (e.clientY - rect.top) * scale;
        const col = Math.floor((mx - GX) / CELL);
        const row = Math.floor((my - GY) / CELL);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            grid[row][col] = !grid[row][col];
            actionHistory.push({ row, col });
            render();
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
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS && !grid[row][col]) {
            ctx.fillStyle = 'rgba(255,228,80,0.22)';
            ctx.strokeStyle = 'rgba(255,228,80,0.22)';
            ctx.lineWidth = 2;
            ctx.fillRect(GX + col * CELL + 2, GY + row * CELL + 2, CELL - 4, CELL - 4);
            ctx.strokeRect(GX + col * CELL + 2, GY + row * CELL + 2, CELL - 4, CELL - 4);
        }
    });

    canvas.addEventListener('mouseleave', () => { if (phase === 'place') render(); });

    function triggerStart() {
        if (phase !== 'place') return;
        startBtn.disabled = true;
        statusBar.innerHTML = '<span class="status-run"> GO GO GO!!</span>';
        hintText.textContent = '';
        startRun();
    }

    function triggerReset() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
        actionHistory = [];
        phase = 'place';
        man = makeMan();
        startBtn.disabled = false;
        statusBar.innerHTML = '<span class="status-place">ブロックを配置してください</span>';
        hintText.textContent = 'クリックでブロック配置 / もう一度クリックで削除';
        render();
    }

    startBtn.addEventListener('click', triggerStart);
    resetBtn.addEventListener('click', triggerReset);

    // Keyboard input
    window.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();

        // Hotkey controls
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
                    render();
                }
                e.preventDefault();
            }
            return;
        }

        if (phase !== 'place') return;

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (KEY_MAP[r][c] === key) {
                    grid[r][c] = !grid[r][c];
                    actionHistory.push({ row: r, col: c });
                    render();
                    e.preventDefault();
                    return;
                }
            }
        }
    });

    render();
    requestAnimationFrame(bgLoop);
});
