// ===============================================================
// ⚙️ 本格スペースインベーダー コアエンジン (core.js) ⚙️
// ※ 基本的に編集不要ですが、コードを読んで改造してもOK！
// ===============================================================

(function() {
    'use strict';

    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // キャンバス基準解像度 (480 x 560)
    const V_WIDTH = 480;
    const V_HEIGHT = 560;
    canvas.width = V_WIDTH;
    canvas.height = V_HEIGHT;

    // 安全な数値取得ヘルパー
    function safeNum(val, min, max, defaultVal) {
        const n = Number(val);
        if (isNaN(n)) return defaultVal;
        return Math.max(min, Math.min(max, n));
    }

    // ─────────────────────────────────────────────
    // 🔊 レトロサウンドエンジン (Web Audio API)
    // ─────────────────────────────────────────────
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    const Sound = {
        enabled: false, // デフォルトでミュート
        walkStep: 0,
        walkPitches: [58, 52, 46, 40], // 4音行進ステップ

        playWalk() {
            if (!this.enabled || !audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "square";
            osc.frequency.setValueAtTime(this.walkPitches[this.walkStep % 4], audioCtx.currentTime);
            this.walkStep++;
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        },

        playShoot() {
            if (!this.enabled || !audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(900, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        },

        playInvaderHit() {
            if (!this.enabled || !audioCtx) return;
            // ノイズバースト
            const bufferSize = audioCtx.sampleRate * 0.09;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            noise.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start();
        },

        playPlayerHit() {
            if (!this.enabled || !audioCtx) return;
            const bufferSize = audioCtx.sampleRate * 0.4;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
            noise.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start();
        },

        ufoOsc: null,
        ufoGain: null,
        startUFO() {
            if (!this.enabled || !audioCtx || this.ufoOsc) return;
            this.ufoOsc = audioCtx.createOscillator();
            this.ufoGain = audioCtx.createGain();
            this.ufoOsc.type = "sawtooth";
            this.ufoGain.gain.setValueAtTime(0.07, audioCtx.currentTime);
            
            // ピロピロ変調
            const now = audioCtx.currentTime;
            this.ufoOsc.frequency.setValueAtTime(450, now);
            for (let i = 0; i < 200; i++) {
                this.ufoOsc.frequency.setValueAtTime((i % 2 === 0 ? 550 : 450), now + i * 0.06);
            }
            this.ufoOsc.connect(this.ufoGain);
            this.ufoGain.connect(audioCtx.destination);
            this.ufoOsc.start();
        },

        stopUFO() {
            if (this.ufoOsc) {
                try {
                    this.ufoOsc.stop();
                    this.ufoOsc.disconnect();
                } catch(e) {}
                this.ufoOsc = null;
            }
        },

        playUFOHit() {
            this.stopUFO();
            if (!this.enabled || !audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "triangle";
            const now = audioCtx.currentTime;
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.12);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.2);
        }
    };

    // ─────────────────────────────────────────────
    // 👾 ピクセルアートスプライト (ビットマップパターン)
    // ─────────────────────────────────────────────
    // 1: ピクセル描画, 0: 透明
    const SPRITES = {
        // イカ型 (Squid) 8x8
        squid: [
            [
                "00011000",
                "00111100",
                "01111110",
                "11011011",
                "11111111",
                "00100100",
                "01011010",
                "10100101"
            ],
            [
                "00011000",
                "00111100",
                "01111110",
                "11011011",
                "11111111",
                "01011010",
                "10000001",
                "01000010"
            ]
        ],
        // カニ型 (Crab) 11x8
        crab: [
            [
                "00100000100",
                "00010001000",
                "00111111100",
                "01101110110",
                "11111111111",
                "10111111101",
                "10100000101",
                "00011011000"
            ],
            [
                "00100000100",
                "10010001001",
                "10111111101",
                "11101110111",
                "11111111111",
                "01111111110",
                "00100000100",
                "01000000010"
            ]
        ],
        // タコ型 (Octopus) 12x8
        octopus: [
            [
                "000011110000",
                "011111111110",
                "111111111111",
                "111001100111",
                "111111111111",
                "000110011000",
                "001101101100",
                "110000000011"
            ],
            [
                "000011110000",
                "011111111110",
                "111111111111",
                "111001100111",
                "111111111111",
                "001100001100",
                "011011110110",
                "000100001000"
            ]
        ],
        // プレイヤー砲台 (Player Cannon) 13x8
        player: [
            "0000001000000",
            "0000011100000",
            "0000011100000",
            "0111111111110",
            "1111111111111",
            "1111111111111",
            "1111111111111",
            "1111111111111"
        ],
        // UFO (Mystery Ship) 16x7
        ufo: [
            "0000011111100000",
            "0001111111111000",
            "0011111111111100",
            "0110110110110110",
            "1111111111111111",
            "0001110001110000",
            "0000100000100000"
        ],
        // 敵撃破爆発 (Explosion) 11x8
        explosion: [
            "00001000100",
            "01000101000",
            "00100000100",
            "11000000011",
            "11000000011",
            "00100000100",
            "01000101000",
            "00001000100"
        ],
        // プレイヤーやられ爆発 2コマ
        playerBlow: [
            [
                "0001001000100",
                "0100100010010",
                "0010001000100",
                "1000100010001",
                "0100000000010",
                "1001000001001",
                "0010010100100",
                "0100000000010"
            ],
            [
                "0100010001000",
                "0010001000100",
                "1001000001001",
                "0100000000010",
                "0001001000100",
                "0100000000010",
                "1000100010001",
                "0010001000100"
            ]
        ]
    };

    // ピクセルパターン描画関数
    function drawPixelPattern(pattern, x, y, pixelSize, color) {
        ctx.fillStyle = color;
        for (let r = 0; r < pattern.length; r++) {
            const row = pattern[r];
            for (let c = 0; c < row.length; c++) {
                if (row[c] === '1') {
                    ctx.fillRect(x + c * pixelSize, y + r * pixelSize, pixelSize, pixelSize);
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // 🛡️ 防壁（トーチカ・バンカー）ピクセルモデル
    // ─────────────────────────────────────────────
    // 22 x 16 ドットのドーム形状
    const BUNKER_TEMPLATE = [
        "00001111111111110000",
        "00011111111111111000",
        "00111111111111111100",
        "01111111111111111110",
        "11111111111111111111",
        "11111111111111111111",
        "11111111111111111111",
        "11111111111111111111",
        "11111111111111111111",
        "11111100000000111111",
        "11111000000000011111",
        "11110000000000001111",
        "11110000000000001111",
        "11110000000000001111"
    ];

    class Bunker {
        constructor(x, y, pixelSize = 2, color = "#33FF33") {
            this.x = x;
            this.y = y;
            this.pixelSize = pixelSize;
            this.color = color;
            this.rows = BUNKER_TEMPLATE.length;
            this.cols = BUNKER_TEMPLATE[0].length;
            this.width = this.cols * pixelSize;
            this.height = this.rows * pixelSize;
            
            // ピクセルの状態グリッド (1: 存在, 0: 破壊)
            this.grid = [];
            for (let r = 0; r < this.rows; r++) {
                this.grid[r] = [];
                for (let c = 0; c < this.cols; c++) {
                    this.grid[r][c] = BUNKER_TEMPLATE[r][c] === '1' ? 1 : 0;
                }
            }
        }

        // 衝突判定と破壊（半径 radius ピクセルを削る）
        damage(hitX, hitY, radius = 3) {
            const centerC = Math.floor((hitX - this.x) / this.pixelSize);
            const centerR = Math.floor((hitY - this.y) / this.pixelSize);

            let hitSomething = false;
            for (let r = centerR - radius; r <= centerR + radius; r++) {
                for (let c = centerC - radius; c <= centerC + radius; c++) {
                    if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
                        const dist = Math.sqrt((r - centerR)**2 + (c - centerC)**2);
                        if (dist <= radius + (Math.random() * 0.8)) {
                            if (this.grid[r][c] === 1) {
                                this.grid[r][c] = 0;
                                hitSomething = true;
                            }
                        }
                    }
                }
            }
            return hitSomething;
        }

        // 指定の矩形と接触しているか確認
        checkHit(rectX, rectY, rectW, rectH) {
            if (rectX + rectW < this.x || rectX > this.x + this.width ||
                rectY + rectH < this.y || rectY > this.y + this.height) {
                return false;
            }
            // 重なっているピクセルがあるか検査
            const startC = Math.max(0, Math.floor((rectX - this.x) / this.pixelSize));
            const endC = Math.min(this.cols - 1, Math.floor((rectX + rectW - this.x) / this.pixelSize));
            const startR = Math.max(0, Math.floor((rectY - this.y) / this.pixelSize));
            const endR = Math.min(this.rows - 1, Math.floor((rectY + rectH - this.y) / this.pixelSize));

            for (let r = startR; r <= endR; r++) {
                for (let c = startC; c <= endC; c++) {
                    if (this.grid[r][c] === 1) return true;
                }
            }
            return false;
        }

        // インベーダーが通過した際の侵食破壊
        corrode(rectX, rectY, rectW, rectH) {
            if (rectX + rectW < this.x || rectX > this.x + this.width ||
                rectY + rectH < this.y || rectY > this.y + this.height) {
                return;
            }
            const startC = Math.max(0, Math.floor((rectX - this.x) / this.pixelSize));
            const endC = Math.min(this.cols - 1, Math.floor((rectX + rectW - this.x) / this.pixelSize));
            const startR = Math.max(0, Math.floor((rectY - this.y) / this.pixelSize));
            const endR = Math.min(this.rows - 1, Math.floor((rectY + rectH - this.y) / this.pixelSize));

            for (let r = startR; r <= endR; r++) {
                for (let c = startC; c <= endC; c++) {
                    this.grid[r][c] = 0;
                }
            }
        }

        draw() {
            ctx.fillStyle = this.color;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.grid[r][c] === 1) {
                        ctx.fillRect(this.x + c * this.pixelSize, this.y + r * this.pixelSize, this.pixelSize, this.pixelSize);
                    }
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // 🌌 背景画像管理
    // ─────────────────────────────────────────────
    const bgImages = {
        "space-bg": new Image(),
        "space-nebula": new Image()
    };
    bgImages["space-bg"].src = "assets/space-bg.jpg";
    bgImages["space-nebula"].src = "assets/space-nebula.jpg";

    // ─────────────────────────────────────────────
    // 🎮 ゲーム状態
    // ─────────────────────────────────────────────
    let gameState = "READY"; // "READY", "PLAYING", "PLAYER_DYING", "GAME_OVER", "CLEAR"
    let score = 0;
    let hiScore = parseInt(localStorage.getItem("invader_hiscore") || "0", 10);
    let wave = 1;
    let lives = 3;
    let animFrame = 0; // 0 or 1
    let stepTimer = 0;
    let stepInterval = 45; // インベーダー歩行間隔（フレーム数）

    // プレイヤー
    let player = {
        x: V_WIDTH / 2 - 13,
        y: V_HEIGHT - 60,
        pixelSize: 2,
        width: 26,
        height: 16,
        speed: 5,
        color: "#00FF66",
        dyingTimer: 0
    };

    let playerBullets = [];
    let enemyBullets = [];
    let explosions = []; // { x, y, timer, scoreText }
    let enemies = [];
    let enemyDir = 1; // 1: 右, -1: 左
    let bunkers = [];

    // UFO
    let ufo = {
        active: false,
        x: -40,
        y: 65,
        width: 32,
        height: 14,
        speed: 2.2,
        dir: 1,
        timer: 0,
        color: "#FF0033"
    };

    // 操作キー
    const keys = {
        left: false,
        right: false,
        shoot: false
    };

    // ─────────────────────────────────────────────
    // 🕹️ インベーダーの初期化
    // ─────────────────────────────────────────────
    function initEnemies() {
        enemies = [];
        const cfg = window.GameConfig ? window.GameConfig.enemy : {};
        const rows = safeNum(cfg.rows, 1, 6, 5);
        const cols = safeNum(cfg.cols, 1, 11, 10);
        const colors = cfg.colors || ["#FFFF00", "#00FFFF", "#00FFFF", "#FF3399", "#FF3399"];
        const scores = cfg.scores || [30, 20, 20, 10, 10];

        const startX = 40;
        const startY = 90 + Math.min(wave * 8, 40); // ウェーブごとに少し下から出現
        const spacingX = 36;
        const spacingY = 28;

        for (let r = 0; r < rows; r++) {
            // スプライト種類の決定: 0行目=squid, 1-2行目=crab, 3-4行目=octopus
            let type = "octopus";
            let pixelSize = 2;
            let width = 24;
            let height = 16;
            if (r === 0) {
                type = "squid";
                width = 16;
            } else if (r === 1 || r === 2) {
                type = "crab";
                width = 22;
            }

            const rowColor = colors[r % colors.length] || "#00FFFF";
            const rowScore = scores[r % scores.length] || 10;

            for (let c = 0; c < cols; c++) {
                enemies.push({
                    x: startX + c * spacingX,
                    y: startY + r * spacingY,
                    origX: startX + c * spacingX,
                    width: width,
                    height: height,
                    type: type,
                    pixelSize: pixelSize,
                    color: rowColor,
                    score: rowScore,
                    alive: true,
                    row: r,
                    col: c
                });
            }
        }

        enemyDir = 1;
        stepInterval = Math.max(12, 50 - wave * 4);
        stepTimer = 0;
    }

    // ─────────────────────────────────────────────
    // 🛡️ 防壁の初期化
    // ─────────────────────────────────────────────
    function initBunkers() {
        bunkers = [];
        const cfg = window.GameConfig ? window.GameConfig.bunker : {};
        if (cfg.enabled === false) return;

        const count = safeNum(cfg.count, 2, 4, 4);
        const color = cfg.color || "#33FF33";
        const bunkerWidth = 40;
        const spacing = (V_WIDTH - (count * bunkerWidth)) / (count + 1);

        for (let i = 0; i < count; i++) {
            const bx = spacing + i * (bunkerWidth + spacing);
            const by = V_HEIGHT - 130;
            bunkers.push(new Bunker(bx, by, 2, color));
        }
    }

    // ─────────────────────────────────────────────
    // 🎮 ゲームの開始 & リセット
    // ─────────────────────────────────────────────
    function startGame() {
        initAudio();
        gameState = "PLAYING";
        const overlay = document.getElementById("start-overlay");
        if (overlay) overlay.classList.add("hidden");
        canvas.focus();
    }

    function resetGame(fullReset = true, autoStart = false) {
        const pCfg = window.GameConfig ? window.GameConfig.player : {};
        player.speed = safeNum(pCfg.speed, 1, 20, 5);
        player.color = pCfg.color || "#00FF66";
        player.x = V_WIDTH / 2 - player.width / 2;
        player.y = V_HEIGHT - 60;
        player.dyingTimer = 0;

        playerBullets = [];
        enemyBullets = [];
        explosions = [];
        ufo.active = false;
        ufo.timer = 0;
        Sound.stopUFO();

        if (fullReset) {
            lives = safeNum(pCfg.lives, 1, 9, 3);
            score = 0;
            wave = 1;
            initBunkers();
        }

        initEnemies();

        const overlay = document.getElementById("start-overlay");
        if (autoStart) {
            gameState = "PLAYING";
            if (overlay) overlay.classList.add("hidden");
        } else {
            gameState = "READY";
            if (overlay) overlay.classList.remove("hidden");
        }
    }

    // ─────────────────────────────────────────────
    // ⌨️ キーボード入力処理 & メッセージ連携
    // ─────────────────────────────────────────────
    let shootCooldown = 0;

    function handleKeyDown(code) {
        initAudio();
        if (code === "Escape") {
            resetGame(true, false);
            return;
        }
        if (code === "ArrowLeft" || code === "KeyA") {
            keys.left = true;
        }
        if (code === "ArrowRight" || code === "KeyD") {
            keys.right = true;
        }
        if (code === "Space" || code === "KeyZ") {
            keys.shoot = true;
            if (gameState === "READY") {
                startGame();
            } else if (gameState === "GAME_OVER") {
                resetGame(true, false);
            } else if (shootCooldown <= 0) {
                firePlayerBullet();
                shootCooldown = 12;
            }
        }
    }

    function handleKeyUp(code) {
        if (code === "ArrowLeft" || code === "KeyA") keys.left = false;
        if (code === "ArrowRight" || code === "KeyD") keys.right = false;
        if (code === "Space" || code === "KeyZ") {
            keys.shoot = false;
            shootCooldown = 0;
        }
    }

    window.addEventListener("keydown", (e) => {
        if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(e.code)) {
            e.preventDefault();
        }
        handleKeyDown(e.code);
    });

    window.addEventListener("keyup", (e) => {
        if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(e.code)) {
            e.preventDefault();
        }
        handleKeyUp(e.code);
    });

    // 親ウィンドウ (IDE) からのキー入力 & 設定ブリッジ
    window.addEventListener("message", (e) => {
        if (!e.data) return;
        if (e.data.type === 'KEY_EVENT') {
            if (e.data.action === 'down') handleKeyDown(e.data.code);
            if (e.data.action === 'up') handleKeyUp(e.data.code);
        } else if (e.data.type === 'SET_SOUND') {
            initAudio();
            Sound.enabled = !!e.data.enabled;
            if (window.GameConfig && window.GameConfig.display) {
                window.GameConfig.display.sound = Sound.enabled;
            }
        } else if (e.data.type === 'SET_CANVAS_SCALE') {
            const sc = Number(e.data.scale);
            if (!isNaN(sc) && sc > 0) {
                const baseWidth = 440;
                canvas.style.width = Math.round(baseWidth * sc) + 'px';
                canvas.style.height = Math.round(baseWidth * sc * (560 / 480)) + 'px';
            }
        }
    });

    canvas.addEventListener("click", () => {
        canvas.focus();
        initAudio();
        if (gameState === "READY") {
            startGame();
        }
    });

    const btnStart = document.getElementById("btn-game-start");
    if (btnStart) {
        btnStart.addEventListener("click", (e) => {
            e.stopPropagation();
            startGame();
        });
    }

    // 画面下部のオンスクリーンボタン（存在する場合のみフォールバック動作）
    function setupTouchControls() {
        const btnLeft = document.getElementById("btn-left");
        const btnRight = document.getElementById("btn-right");
        const btnFire = document.getElementById("btn-fire");
        const btnSound = document.getElementById("btn-sound");

        function bindTouch(elem, onDown, onUp) {
            if (!elem) return;
            const start = (e) => {
                e.preventDefault();
                initAudio();
                onDown();
            };
            const end = (e) => {
                e.preventDefault();
                onUp();
            };
            elem.addEventListener("touchstart", start, { passive: false });
            elem.addEventListener("touchend", end, { passive: false });
            elem.addEventListener("mousedown", start);
            elem.addEventListener("mouseup", end);
            elem.addEventListener("mouseleave", onUp);
        }

        bindTouch(btnLeft, () => keys.left = true, () => keys.left = false);
        bindTouch(btnRight, () => keys.right = true, () => keys.right = false);
        bindTouch(btnFire, () => {
            keys.shoot = true;
            firePlayerBullet();
            if (gameState === "GAME_OVER") resetGame(true);
        }, () => keys.shoot = false);

        if (btnSound) {
            btnSound.addEventListener("click", () => {
                initAudio();
                Sound.enabled = !Sound.enabled;
                btnSound.textContent = Sound.enabled ? "🔊" : "🔇";
            });
        }
    }

    // ─────────────────────────────────────────────
    // 🔫 弾の発射
    // ─────────────────────────────────────────────
    function firePlayerBullet() {
        if (gameState !== "PLAYING") return;
        const bCfg = window.GameConfig ? window.GameConfig.bullet : {};
        const pCfg = window.GameConfig ? window.GameConfig.player : {};
        const maxBullets = safeNum(pCfg.maxBullets, 1, 5, 1);

        if (playerBullets.length >= maxBullets) return;

        const bw = safeNum(bCfg.width, 1, 10, 3);
        const bh = safeNum(bCfg.height, 4, 30, 12);
        const spd = safeNum(bCfg.speed, -25, -2, -8);
        const col = bCfg.color || "#FFFF00";

        playerBullets.push({
            x: player.x + player.width / 2 - bw / 2,
            y: player.y - bh,
            width: bw,
            height: bh,
            speed: spd,
            color: col
        });

        Sound.playShoot();
    }

    function fireEnemyBullet(enemy) {
        const eCfg = window.GameConfig ? window.GameConfig.enemy : {};
        const spd = safeNum(eCfg.bulletSpeed, 1, 10, 3.5);

        enemyBullets.push({
            x: enemy.x + enemy.width / 2 - 1.5,
            y: enemy.y + enemy.height,
            width: 3,
            height: 10,
            speed: spd,
            wiggleTimer: 0
        });
    }

    // ─────────────────────────────────────────────
    // 🛸 UFO ロジック
    // ─────────────────────────────────────────────
    function updateUFO() {
        const uCfg = window.GameConfig ? window.GameConfig.ufo : {};
        if (uCfg.enabled === false) return;

        const interval = safeNum(uCfg.interval, 5, 60, 18) * 60; // フレーム換算
        ufo.color = uCfg.color || "#FF0033";
        ufo.speed = safeNum(uCfg.speed, 1, 10, 2.2);

        if (!ufo.active) {
            ufo.timer++;
            if (ufo.timer >= interval) {
                ufo.active = true;
                ufo.timer = 0;
                // 出現方向をランダムに決定
                ufo.dir = Math.random() < 0.5 ? 1 : -1;
                ufo.x = ufo.dir === 1 ? -40 : V_WIDTH + 10;
                Sound.startUFO();
            }
        } else {
            ufo.x += ufo.speed * ufo.dir;
            // 画面外に出たら終了
            if ((ufo.dir === 1 && ufo.x > V_WIDTH + 40) || (ufo.dir === -1 && ufo.x < -60)) {
                ufo.active = false;
                Sound.stopUFO();
            }
        }
    }

    // ─────────────────────────────────────────────
    // 🔄 メイン更新 (Update Loop)
    // ─────────────────────────────────────────────
    function update() {
        const eCfg = window.GameConfig ? window.GameConfig.enemy : {};
        const pCfg = window.GameConfig ? window.GameConfig.player : {};

        if (window.GameConfig && window.GameConfig.display && typeof window.GameConfig.display.sound === 'boolean') {
            Sound.enabled = window.GameConfig.display.sound;
        }

        // プレイヤー被弾中の演出待機
        if (gameState === "PLAYER_DYING") {
            player.dyingTimer--;
            if (player.dyingTimer <= 0) {
                if (lives > 0) {
                    gameState = "PLAYING";
                    player.x = V_WIDTH / 2 - player.width / 2;
                } else {
                    gameState = "GAME_OVER";
                }
            }
            return;
        }

        if (gameState !== "PLAYING") return;

        // プレイヤー移動
        player.speed = safeNum(pCfg.speed, 1, 20, 5);
        player.color = pCfg.color || "#00FF66";
        if (keys.left) player.x -= player.speed;
        if (keys.right) player.x += player.speed;
        player.x = Math.max(10, Math.min(V_WIDTH - player.width - 10, player.x));

        // プレイヤー射撃（押しっぱなし連射対応）
        if (keys.shoot) {
            shootCooldown--;
            if (shootCooldown <= 0) {
                firePlayerBullet();
                shootCooldown = 15;
            }
        }

        // プレイヤーの弾移動
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            b.y += b.speed;
            if (b.y < 35) {
                playerBullets.splice(i, 1);
            }
        }

        // 敵の弾移動
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const eb = enemyBullets[i];
            eb.y += eb.speed;
            eb.wiggleTimer++;
            // ジグザグ横揺れ
            eb.x += Math.sin(eb.wiggleTimer * 0.4) * 0.8;
            if (eb.y > V_HEIGHT - 30) {
                enemyBullets.splice(i, 1);
            }
        }

        // 爆発エフェクトのタイマー更新
        for (let i = explosions.length - 1; i >= 0; i--) {
            explosions[i].timer--;
            if (explosions[i].timer <= 0) {
                explosions.splice(i, 1);
            }
        }

        // UFO 更新
        updateUFO();

        // ── インベーダーの行進 ──
        const aliveEnemies = enemies.filter(e => e.alive);
        if (aliveEnemies.length === 0) {
            // 全滅！ウェーブクリア
            wave++;
            Sound.stopUFO();
            initEnemies();
            return;
        }

        // 残り匹数に応じて行進テンポを動的にアップ！
        const baseSpeed = safeNum(eCfg.speed, 0.2, 5, 1.0);
        const aliveRatio = aliveEnemies.length / enemies.length;
        stepInterval = Math.max(4, Math.floor((40 * aliveRatio) / baseSpeed));

        stepTimer++;
        if (stepTimer >= stepInterval) {
            stepTimer = 0;
            animFrame = 1 - animFrame; // 2コマアニメ反転
            Sound.playWalk();

            // 端に達しているかチェック
            let hitEdge = false;
            const stepDx = 6 * enemyDir;
            for (let e of aliveEnemies) {
                const nextX = e.x + stepDx;
                if (nextX < 15 || nextX + e.width > V_WIDTH - 15) {
                    hitEdge = true;
                    break;
                }
            }

            const dropAmount = safeNum(eCfg.dropAmount, 2, 40, 14);

            if (hitEdge) {
                enemyDir *= -1;
                for (let e of aliveEnemies) {
                    e.y += dropAmount;
                }
            } else {
                for (let e of aliveEnemies) {
                    e.x += stepDx;
                }
            }

            // 防壁の侵食チェック（敵が防壁にぶつかったら削る）
            for (let e of aliveEnemies) {
                for (let bunker of bunkers) {
                    bunker.corrode(e.x, e.y, e.width, e.height);
                }
            }

            // 最前線到達チェック（自機の高度または防衛ライン）
            const invasionLine = player.y - 10;
            for (let e of aliveEnemies) {
                if (e.y + e.height >= invasionLine) {
                    // インベーダー到達！即座にゲームオーバー
                    gameState = "GAME_OVER";
                    Sound.playPlayerHit();
                    return;
                }
            }
        }

        // ── 敵の射撃 ──
        const shootInterval = safeNum(eCfg.shootInterval, 10, 200, 60);
        if (Math.random() < (1.0 / shootInterval)) {
            // 生きている列ごとに最下段のインベーダーを抽出
            const bottomEnemies = [];
            const colMap = {};
            for (let e of aliveEnemies) {
                if (!colMap[e.col] || colMap[e.col].row < e.row) {
                    colMap[e.col] = e;
                }
            }
            for (let col in colMap) {
                bottomEnemies.push(colMap[col]);
            }
            if (bottomEnemies.length > 0 && enemyBullets.length < 4) {
                const shooter = bottomEnemies[Math.floor(Math.random() * bottomEnemies.length)];
                fireEnemyBullet(shooter);
            }
        }

        // ── 当たり判定: プレイヤー弾 vs 敵 ──
        for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
            const pb = playerBullets[bi];
            let bulletRemoved = false;

            // UFO との判定
            if (ufo.active) {
                if (pb.x < ufo.x + ufo.width && pb.x + pb.width > ufo.x &&
                    pb.y < ufo.y + ufo.height && pb.y + pb.height > ufo.y) {
                    ufo.active = false;
                    playerBullets.splice(bi, 1);
                    bulletRemoved = true;
                    const uCfg = window.GameConfig ? window.GameConfig.ufo : {};
                    const uScore = safeNum(uCfg.bonusScore, 50, 1000, 300);
                    score += uScore;
                    if (score > hiScore) {
                        hiScore = score;
                        localStorage.setItem("invader_hiscore", hiScore);
                    }
                    Sound.playUFOHit();
                    explosions.push({
                        x: ufo.x,
                        y: ufo.y,
                        timer: 25,
                        scoreText: uScore
                    });
                    continue;
                }
            }

            // インベーダーとの判定
            for (let e of aliveEnemies) {
                if (pb.x < e.x + e.width && pb.x + pb.width > e.x &&
                    pb.y < e.y + e.height && pb.y + pb.height > e.y) {
                    e.alive = false;
                    playerBullets.splice(bi, 1);
                    bulletRemoved = true;
                    score += e.score;
                    if (score > hiScore) {
                        hiScore = score;
                        localStorage.setItem("invader_hiscore", hiScore);
                    }
                    Sound.playInvaderHit();
                    explosions.push({
                        x: e.x,
                        y: e.y,
                        timer: 12,
                        color: e.color
                    });
                    break;
                }
            }

            if (bulletRemoved) continue;

            // 防壁との判定 (プレイヤー弾)
            for (let bunker of bunkers) {
                if (bunker.checkHit(pb.x, pb.y, pb.width, pb.height)) {
                    bunker.damage(pb.x + pb.width / 2, pb.y, 4);
                    playerBullets.splice(bi, 1);
                    break;
                }
            }
        }

        // ── 当たり判定: 敵弾 vs 防壁 ──
        for (let ebi = enemyBullets.length - 1; ebi >= 0; ebi--) {
            const eb = enemyBullets[ebi];
            for (let bunker of bunkers) {
                if (bunker.checkHit(eb.x, eb.y, eb.width, eb.height)) {
                    bunker.damage(eb.x + eb.width / 2, eb.y + eb.height, 4);
                    enemyBullets.splice(ebi, 1);
                    break;
                }
            }
        }

        // ── 当たり判定: 敵弾 vs プレイヤー弾 (相殺) ──
        for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
            const pb = playerBullets[bi];
            for (let ebi = enemyBullets.length - 1; ebi >= 0; ebi--) {
                const eb = enemyBullets[ebi];
                if (Math.abs(pb.x - eb.x) < 5 && Math.abs(pb.y - eb.y) < 8) {
                    playerBullets.splice(bi, 1);
                    enemyBullets.splice(ebi, 1);
                    break;
                }
            }
        }

        // ── 当たり判定: 敵弾 vs プレイヤー ──
        for (let ebi = enemyBullets.length - 1; ebi >= 0; ebi--) {
            const eb = enemyBullets[ebi];
            if (eb.x < player.x + player.width && eb.x + eb.width > player.x &&
                eb.y < player.y + player.height && eb.y + eb.height > player.y) {
                enemyBullets.splice(ebi, 1);
                lives--;
                Sound.playPlayerHit();
                gameState = "PLAYER_DYING";
                player.dyingTimer = 60; // 1秒間やられ演出
                break;
            }
        }
    }

    // ─────────────────────────────────────────────
    // 🎨 描画ループ (Draw Loop)
    // ─────────────────────────────────────────────
    function draw() {
        ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

        // 1. 宇宙背景の描画
        const dCfg = window.GameConfig ? window.GameConfig.display : {};
        const bgChoice = (dCfg && dCfg.background) || "space-bg";

        if (bgChoice !== "black" && bgImages[bgChoice] && bgImages[bgChoice].complete) {
            ctx.drawImage(bgImages[bgChoice], 0, 0, V_WIDTH, V_HEIGHT);
            // 視認性を保つための半透明オーバーレイ
            ctx.fillStyle = "rgba(5, 5, 12, 0.65)";
            ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
        } else {
            // クラシック黒背景
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
        }

        // 2. ヘッダースコア (クラシックなアーケード表示)
        ctx.font = "14px 'Courier New', monospace, monospace";
        ctx.textBaseline = "top";
        
        ctx.fillStyle = "#00FFFF";
        ctx.fillText("SCORE<1>", 30, 10);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText("HI-SCORE", 190, 10);
        ctx.fillStyle = "#00FF66";
        ctx.fillText("WAVE", 370, 10);

        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(String(score).padStart(5, '0'), 40, 26);
        ctx.fillStyle = "#00FFFF";
        ctx.fillText(String(hiScore).padStart(5, '0'), 200, 26);
        ctx.fillStyle = "#FFFF00";
        ctx.fillText(String(wave).padStart(2, '0'), 385, 26);

        // 3. UFO 描画
        if (ufo.active) {
            drawPixelPattern(SPRITES.ufo, ufo.x, ufo.y, 2, ufo.color);
        }

        // 4. インベーダー描画
        for (let e of enemies) {
            if (!e.alive) continue;
            const spriteFrames = SPRITES[e.type];
            if (spriteFrames) {
                const pattern = spriteFrames[animFrame];
                drawPixelPattern(pattern, e.x, e.y, e.pixelSize, e.color);
            }
        }

        // 5. 防壁（バンカー）描画
        for (let bunker of bunkers) {
            bunker.draw();
        }

        // 6. プレイヤーの弾描画
        for (let b of playerBullets) {
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x, b.y, b.width, b.height);
        }

        // 7. 敵の弾描画 (ジグザグ・雷型)
        for (let eb of enemyBullets) {
            ctx.fillStyle = "#FFFFFF";
            // ギザギザ弾
            ctx.fillRect(eb.x, eb.y, eb.width, 3);
            ctx.fillRect(eb.x + 2, eb.y + 3, eb.width, 3);
            ctx.fillRect(eb.x - 2, eb.y + 6, eb.width, 3);
            ctx.fillRect(eb.x, eb.y + 9, eb.width, 3);
        }

        // 8. 爆発エフェクト
        for (let exp of explosions) {
            if (exp.scoreText) {
                // UFO撃破ボーナス得点ポップアップ
                ctx.fillStyle = "#FF0033";
                ctx.font = "bold 16px 'Courier New', monospace";
                ctx.fillText(exp.scoreText, exp.x, exp.y);
            } else {
                drawPixelPattern(SPRITES.explosion, exp.x, exp.y, 2, exp.color || "#FFFFFF");
            }
        }

        // 9. プレイヤー描画
        if (gameState === "PLAYER_DYING") {
            const blowFrame = Math.floor(player.dyingTimer / 8) % 2;
            drawPixelPattern(SPRITES.playerBlow[blowFrame], player.x, player.y, player.pixelSize, "#FF3333");
        } else if (gameState !== "GAME_OVER") {
            drawPixelPattern(SPRITES.player, player.x, player.y, player.pixelSize, player.color);
        }

        // 10. 最下部の赤い境界線とステータス（残機数・クレジット表示）
        const groundY = V_HEIGHT - 32;
        ctx.fillStyle = "#FF0033";
        ctx.fillRect(0, groundY, V_WIDTH, 2);

        // 残機表示 (数値 + ミニアイコン)
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText(lives, 25, groundY + 8);
        for (let i = 0; i < Math.max(0, lives - 1); i++) {
            drawPixelPattern(SPRITES.player, 45 + i * 28, groundY + 6, 1.5, player.color);
        }

        // 右下のクレジット表示
        ctx.fillStyle = "#FF00FF";
        ctx.fillText("CREDIT 00", V_WIDTH - 110, groundY + 8);

        // 11. ゲームオーバー・クリア画面
        if (gameState === "GAME_OVER") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            ctx.fillRect(0, 180, V_WIDTH, 200);

            ctx.fillStyle = "#FF0033";
            ctx.font = "bold 32px 'Courier New', monospace";
            ctx.textAlign = "center";
            ctx.fillText("GAME OVER", V_WIDTH / 2, 220);

            ctx.fillStyle = "#FFFF00";
            ctx.font = "16px 'Courier New', monospace";
            ctx.fillText("FINAL SCORE: " + score, V_WIDTH / 2, 270);

            ctx.fillStyle = "#00FFFF";
            ctx.font = "14px 'Courier New', monospace";
            ctx.fillText("PRESS [SPACE] OR TAP FIRE TO RETRY", V_WIDTH / 2, 320);
            ctx.textAlign = "left"; // リセット
        }
    }

    // ─────────────────────────────────────────────
    // 🚀 メインループ
    // ─────────────────────────────────────────────
    function loop() {
        update();
        draw();
        requestAnimationFrame(loop);
    }

    // 起動
    function start() {
        setupTouchControls();
        resetGame(true);
        requestAnimationFrame(loop);
    }

    if (document.readyState === 'loading') {
        window.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

    // 設定変更時のリスタート用グローバル関数（IDEからの更新連携用）
    window.reloadGameWithNewConfig = function(newConfig) {
        if (newConfig) window.GameConfig = newConfig;
        resetGame(true);
    };
})();
