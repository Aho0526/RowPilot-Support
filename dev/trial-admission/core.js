// ==========================================
// ⚙️ コアエンジン（変更不要） ⚙️
// ==========================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 設定の安全な取得（変な数値が入れられても壊れないようにする）
function getSafeNumber(val, min, max, defaultVal) {
    const num = Number(val);
    if (isNaN(num)) return defaultVal;
    return Math.max(min, Math.min(max, num));
}

let player = {
    x: canvas.width / 2 - 20,
    y: canvas.height - 30,
    width: getSafeNumber(GameConfig.player.width, 10, 100, 40),
    height: getSafeNumber(GameConfig.player.height, 10, 100, 20),
    speed: getSafeNumber(GameConfig.player.speed, 1, 50, 5),
    color: GameConfig.player.color || "#00FF00"
};

let bullets = [];
let enemies = [];
let keys = {};

// 敵の初期化
function initEnemies() {
    const rows = getSafeNumber(GameConfig.enemy.rows, 1, 10, 4);
    const cols = getSafeNumber(GameConfig.enemy.cols, 1, 15, 8);
    const eWidth = getSafeNumber(GameConfig.enemy.width, 10, 50, 30);
    const eHeight = getSafeNumber(GameConfig.enemy.height, 10, 50, 30);
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            enemies.push({
                x: c * (eWidth + 10) + 30,
                y: r * (eHeight + 10) + 30,
                width: eWidth,
                height: eHeight,
                active: true
            });
        }
    }
}

initEnemies();

let enemyDirection = 1;
let score = 0;

// キーボード入力
window.addEventListener("keydown", (e) => keys[e.code] = true);
window.addEventListener("keyup", (e) => keys[e.code] = false);

window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        const bw = getSafeNumber(GameConfig.bullet.width, 1, 20, 4);
        bullets.push({
            x: player.x + player.width / 2 - bw / 2,
            y: player.y,
            width: bw,
            height: getSafeNumber(GameConfig.bullet.height, 1, 50, 10),
            speed: getSafeNumber(GameConfig.bullet.speed, -50, -1, -7),
            color: GameConfig.bullet.color || "#FFFF00"
        });
    }
});

function update() {
    // プレイヤー設定の反映（リアルタイム変更対応）
    player.speed = getSafeNumber(GameConfig.player.speed, 1, 50, 5);
    player.color = GameConfig.player.color || "#00FF00";

    // プレイヤー移動
    if (keys["ArrowLeft"]) player.x -= player.speed;
    if (keys["ArrowRight"]) player.x += player.speed;
    
    // 画面外に出ないように制限
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

    // 弾移動
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y += bullets[i].speed;
        if (bullets[i].y < 0) {
            bullets.splice(i, 1);
        }
    }

    // 敵移動
    let hitWall = false;
    const enemySpeed = getSafeNumber(GameConfig.enemy.speed, 0.1, 30, 1);
    const dropAmount = getSafeNumber(GameConfig.enemy.dropAmount, 1, 100, 20);

    for (let e of enemies) {
        if (!e.active) continue;
        e.x += enemySpeed * enemyDirection;
        if (e.x <= 0 || e.x + e.width >= canvas.width) {
            hitWall = true;
        }
    }

    if (hitWall) {
        enemyDirection *= -1;
        for (let e of enemies) {
            e.y += dropAmount;
        }
    }

    // 当たり判定
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        for (let e of enemies) {
            if (!e.active) continue;
            if (b.x < e.x + e.width && b.x + b.width > e.x &&
                b.y < e.y + e.height && b.y + b.height > e.y) {
                e.active = false;
                bullets.splice(i, 1);
                score += 10;
                break;
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // プレイヤー
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // 弾
    for (let b of bullets) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    // 敵
    ctx.fillStyle = GameConfig.enemy.color || "#FF0000";
    for (let e of enemies) {
        if (e.active) {
            ctx.fillRect(e.x, e.y, e.width, e.height);
        }
    }
    
    // スコア
    ctx.fillStyle = "#FFF";
    ctx.font = "20px sans-serif";
    ctx.fillText("SCORE: " + score, 10, 30);
    
    // クリア判定
    let activeEnemies = enemies.filter(e => e.active);
    if (activeEnemies.length === 0) {
        ctx.fillStyle = "#FF0";
        ctx.font = "40px sans-serif";
        ctx.fillText("GAME CLEAR!", canvas.width/2 - 130, canvas.height/2);
    }
}

function loop() {
    update();
    draw();
    setTimeout(loop, 1000 / getSafeNumber(GameConfig.fps, 10, 120, 60));
}

loop();
