// ===============================================================
// スペースインベーダー コアエンジン (core.js)
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
    // レトロサウンドエンジン (Web Audio API)
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
    // スプライト（ドット絵）定義
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

    // 敵キャラ(1コマ形式)の2コマ目を自動生成: 下3行を1ドット右にずらして足踏みを表現
    const WALKING_KEYS = ["squid", "crab", "octopus"];
    function makeWalkFrame(pattern) {
        const legStart = Math.max(0, pattern.length - 3);
        return pattern.map((row, i) => {
            if (i < legStart) return row;
            return "0" + row.slice(0, row.length - 1);
        });
    }

    // 動的スプライト取得ヘルパー（GameConfig.sprites で上書き可能）
    function getSprite(key, frame = 0) {
        if (window.GameConfig && window.GameConfig.sprites && window.GameConfig.sprites[key]) {
            const custom = window.GameConfig.sprites[key];
            if (Array.isArray(custom) && custom.length > 0) {
                if (Array.isArray(custom[0])) {
                    return custom[frame % custom.length] || custom[0];
                }
                if (WALKING_KEYS.includes(key) && frame % 2 === 1) {
                    return makeWalkFrame(custom);
                }
                return custom;
            }
        }
        const def = SPRITES[key];
        if (Array.isArray(def) && Array.isArray(def[0])) {
            return def[frame % def.length];
        }
        return def;
    }

    // スプライトの幅と高さを動的計算
    function getSpriteDimensions(pattern, pixelSize = 2) {
        if (!pattern || !pattern.length) return { width: 16, height: 16 };
        let maxCols = 0;
        for (let r = 0; r < pattern.length; r++) {
            if (pattern[r] && pattern[r].length > maxCols) {
                maxCols = pattern[r].length;
            }
        }
        return {
            width: Math.max(8, maxCols * pixelSize),
            height: Math.max(8, pattern.length * pixelSize)
        };
    }

    // ピクセルパターン描画関数（堅牢版: 欠損行や空文字でも停止しない）
    function drawPixelPattern(pattern, x, y, pixelSize, color) {
        if (!pattern || !pattern.length) return;
        ctx.fillStyle = color;
        for (let r = 0; r < pattern.length; r++) {
            const row = pattern[r];
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
                if (row[c] === '1') {
                    ctx.fillRect(x + c * pixelSize, y + r * pixelSize, pixelSize, pixelSize);
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // 防壁（トーチカ・バンカー）ピクセルモデル
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
    // 背景画像管理
    // ─────────────────────────────────────────────
    const bgImages = {
        "space-bg": new Image(),
        "space-nebula": new Image()
    };
    bgImages["space-bg"].src = "assets/space-bg.jpg";
    bgImages["space-nebula"].src = "assets/space-nebula.jpg";

    // ─────────────────────────────────────────────
    // ゲーム状態
    // ─────────────────────────────────────────────
    let gameState = "READY"; // "READY", "PLAYING", "PLAYER_DYING", "GAME_OVER", "CLEAR"
    let score = 0;
    let hiScore = parseInt(localStorage.getItem("invader_hiscore") || "0", 10);
    let wave = 1;
    let maxWaves = 3; // クリアに必要なウェーブ数 (3 または 5)
    let currentDifficulty = "normal"; // "easy", "normal", "hard"
    let lives = 3;
    let playerPowerLevel = 1; // 自機のショット段階 (1: 通常, 2: 2連装, 3: 3WAY)
    let animFrame = 0; // 0 or 1
    let stepTimer = 0;
    let stepInterval = 45; // インベーダー歩行間隔 (フレーム数)

    // 難易度プリセット
    const DIFFICULTY_PRESETS = {
        easy: {
            lives: 5,
            shootInterval: 70,
            bulletSpeed: 2.8,
            passThroughPlayer: true,
            fireInterval: 8,
            maxBullets: 10
        },
        normal: {
            lives: 3,
            shootInterval: 50,
            bulletSpeed: 3.5,
            passThroughPlayer: true,
            fireInterval: 10,
            maxBullets: 8
        },
        hard: {
            lives: 2,
            shootInterval: 32,
            bulletSpeed: 4.2,
            passThroughPlayer: false,
            fireInterval: 14,
            maxBullets: 6
        }
    };

    // 難易度による補正 (config.js の値を NORMAL として、そこからの増減)
    //   lives: 残機の増減 / interval: 敵の発射間隔の倍率 / speed: 敵弾速度の倍率
    const DIFFICULTY_MODS = {
        easy:   { lives: 2,  interval: 1.4,  speed: 0.8, noPassThrough: false },
        normal: { lives: 0,  interval: 1.0,  speed: 1.0, noPassThrough: false },
        hard:   { lives: -1, interval: 0.65, speed: 1.2, noPassThrough: true }
    };
    function diffMod() {
        return DIFFICULTY_MODS[currentDifficulty] || DIFFICULTY_MODS.normal;
    }

    // ホーム画面で選んだ項目は優先し、未選択の場合は config.js の game 設定を使う
    let difficultyChosen = false;
    let wavesChosen = false;
    function applyGameSettings() {
        const gCfg = (window.GameConfig && window.GameConfig.game) || {};
        if (!difficultyChosen) {
            const d = String(gCfg.difficulty || "normal");
            currentDifficulty = DIFFICULTY_MODS[d] ? d : "normal";
        }
        if (!wavesChosen) {
            maxWaves = safeNum(gCfg.maxWaves, 1, 10, 3);
        }
        syncHomeButtons();
    }

    function syncHomeButtons() {
        document.querySelectorAll("#diff-options .arcade-pill").forEach(b => {
            b.classList.toggle("active", b.getAttribute("data-diff") === currentDifficulty);
        });
        document.querySelectorAll("#wave-options .arcade-pill").forEach(b => {
            b.classList.toggle("active", parseInt(b.getAttribute("data-waves"), 10) === maxWaves);
        });
        const hs = document.getElementById("home-hiscore");
        if (hs) hs.textContent = String(hiScore).padStart(5, "0");
    }

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
    // インベーダーの初期化 (ウェーブ別フォーメーション)
    // ─────────────────────────────────────────────
    function initEnemies() {
        enemies = [];
        const cfg = window.GameConfig ? window.GameConfig.enemy : {};
        const rows = safeNum(cfg.rows, 1, 10, 5);
        const cols = safeNum(cfg.cols, 1, 16, 10);
        const colors = cfg.colors || ["#FFFF00", "#00FFFF", "#00FFFF", "#FF3399", "#FF3399"];
        const scores = cfg.scores || [30, 20, 20, 10, 10];

        // 画面幅に合わせた等間隔配置
        const maxW = V_WIDTH - 60;
        const spacingX = Math.min(36, Math.floor(maxW / Math.max(1, cols)));
        const startX = Math.max(20, Math.floor((V_WIDTH - (cols - 1) * spacingX - 24) / 2));
        const baseStartY = 85;
        const spacingY = 28;

        for (let r = 0; r < rows; r++) {
            // スプライト種類の決定: 0行目=squid, 1-2行目=crab, 3行目以降=octopus
            let type = "octopus";
            let pixelSize = 2;
            if (r === 0) {
                type = "squid";
            } else if (r === 1 || r === 2) {
                type = "crab";
            }

            const spritePattern = getSprite(type, 0);
            const dims = getSpriteDimensions(spritePattern, pixelSize);

            const rowColor = colors[r % colors.length] || "#00FFFF";
            const rowScore = scores[r % scores.length] || 10;

            for (let c = 0; c < cols; c++) {
                // ウェーブごとのフォーメーション変位
                let offsetY = 0;
                let active = true;

                if (wave === 2) {
                    // Wave 2: V字フォーメーション (中央が奥、両端が手前)
                    const centerCol = (cols - 1) / 2;
                    offsetY = (Math.abs(c - centerCol)) * 6;
                } else if (wave === 3) {
                    // Wave 3: ピラミッド型 (上段を少なく、下段を広く)
                    const centerCol = (cols - 1) / 2;
                    const allowedWidth = (r + 1) * 2;
                    if (Math.abs(c - centerCol) > allowedWidth / 2) {
                        active = false;
                    }
                } else if (wave === 4) {
                    // Wave 4: 菱形陣形
                    const centerCol = (cols - 1) / 2;
                    const centerRow = (rows - 1) / 2;
                    const dist = Math.abs(c - centerCol) + Math.abs(r - centerRow);
                    if (dist > 4) {
                        active = false;
                    }
                } else if (wave >= 5) {
                    // Wave 5: 逆V字突撃陣 (中央が突出)
                    const centerCol = (cols - 1) / 2;
                    offsetY = - (Math.abs(c - centerCol)) * 6;
                }

                if (!active) continue;

                enemies.push({
                    x: startX + c * spacingX,
                    y: baseStartY + r * spacingY + offsetY,
                    origX: startX + c * spacingX,
                    width: dims.width,
                    height: dims.height,
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

        // 敵が存在しない場合の安全対策 (フォールバック)
        if (enemies.length === 0) {
            wave = 1;
            initEnemies();
            return;
        }

        enemyDir = 1;
        stepInterval = Math.max(10, 52 - wave * 5);
        stepTimer = 0;
    }

    // ─────────────────────────────────────────────
    // 防壁の初期化
    // ─────────────────────────────────────────────
    function initBunkers() {
        bunkers = [];
        const cfg = window.GameConfig ? window.GameConfig.bunker : {};
        if (cfg.enabled === false) return;

        const count = safeNum(cfg.count, 0, 8, 4);
        if (count <= 0) return;

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
    // ゲームの開始 & リセット
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
        const gCfg = window.GameConfig ? window.GameConfig.game : {};
        const pSprite = getSprite("player");
        const pDims = getSpriteDimensions(pSprite, player.pixelSize);
        player.width = pDims.width;
        player.height = pDims.height;
        player.speed = safeNum(pCfg.speed, 0, 50, 5);
        player.color = pCfg.color || "#00FF66";
        player.x = V_WIDTH / 2 - player.width / 2;
        player.y = V_HEIGHT - 60;
        player.dyingTimer = 0;

        const uCfg = window.GameConfig ? window.GameConfig.ufo : {};
        if (uCfg) {
            ufo.speed = safeNum(uCfg.speed, 0.5, 30, 2.2);
            ufo.color = uCfg.color || "#FF0033";
        }

        playerBullets = [];
        enemyBullets = [];
        explosions = [];
        ufo.active = false;
        ufo.timer = 0;
        Sound.stopUFO();

        if (fullReset) {
            applyGameSettings();
            lives = Math.max(1, safeNum(pCfg.lives, 1, 99999, 3) + diffMod().lives);
            score = 0;
            wave = 1;
            playerPowerLevel = 1;
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
            if (document.activeElement && document.activeElement !== canvas && document.activeElement.blur) {
                document.activeElement.blur();
            }
            if (gameState === "READY") {
                startGame();
            } else if (gameState === "GAME_OVER" || gameState === "CLEAR") {
                resetGame(true, false);
            } else if (shootCooldown <= 0) {
                firePlayerBullet();
                const pCfg = window.GameConfig ? window.GameConfig.player : {};
                const preset = DIFFICULTY_PRESETS[currentDifficulty] || DIFFICULTY_PRESETS.normal;
                shootCooldown = safeNum(pCfg.fireInterval, 2, 60, preset.fireInterval);
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
        } else if (gameState === "GAME_OVER" || gameState === "CLEAR") {
            resetGame(true, false);
        }
    });

    // ホーム画面 (本格アーケード演出 & 難易度選択) の初期化
    let homeAnimFrame = 0;
    let homeAnimTimer = null;

    function renderHomePreviewSprites() {
        function drawToCanvas(canvasId, spriteKey, color, pixelSize = 2, frame = 0) {
            const cvs = document.getElementById(canvasId);
            if (!cvs) return;
            const cCtx = cvs.getContext("2d");
            cCtx.clearRect(0, 0, cvs.width, cvs.height);
            const pattern = getSprite(spriteKey, frame);
            if (!pattern) return;
            
            cCtx.fillStyle = color;
            const rows = pattern.length;
            const cols = pattern[0].length;
            const startX = Math.floor((cvs.width - cols * pixelSize) / 2);
            const startY = Math.floor((cvs.height - rows * pixelSize) / 2);

            for (let r = 0; r < rows; r++) {
                const row = pattern[r];
                if (!row) continue;
                for (let c = 0; c < row.length; c++) {
                    if (row[c] === '1') {
                        cCtx.fillRect(startX + c * pixelSize, startY + r * pixelSize, pixelSize, pixelSize);
                    }
                }
            }
        }

        function updateSprites() {
            homeAnimFrame = 1 - homeAnimFrame;
            const cfg = window.GameConfig || {};
            const eColors = (cfg.enemy && cfg.enemy.colors) || [];
            const ufoColor = (cfg.ufo && cfg.ufo.color) || "#FF3344";
            const squidColor = eColors[0] || "#FFFF00";
            const crabColor = eColors[1] || "#00FFFF";
            const octopusColor = eColors[3] || eColors[eColors.length - 1] || "#FF3399";
            const playerColor = (cfg.player && cfg.player.color) || "#00FF66";

            drawToCanvas("preview-ufo", "ufo", ufoColor, 2, 0);
            drawToCanvas("preview-squid", "squid", squidColor, 2, homeAnimFrame);
            drawToCanvas("preview-crab", "crab", crabColor, 2, homeAnimFrame);
            drawToCanvas("preview-octopus", "octopus", octopusColor, 2, homeAnimFrame);
            drawToCanvas("preview-player", "player", playerColor, 2, 0);
        }

        updateSprites();
        if (!homeAnimTimer) {
            homeAnimTimer = setInterval(updateSprites, 480);
        }
    }

    function setupHomeUI() {
        const btnStart = document.getElementById("btn-game-start");
        if (btnStart) {
            btnStart.addEventListener("click", (e) => {
                e.stopPropagation();
                startGame();
            });
        }

        // 難易度ボタンの選択
        const diffButtons = document.querySelectorAll("#diff-options .arcade-pill");
        diffButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                difficultyChosen = true;
                currentDifficulty = btn.getAttribute("data-diff") || "normal";
                resetGame(true, false);
                btn.blur();
            });
        });

        // クリア条件 (ウェーブ数) ボタンの選択
        const waveButtons = document.querySelectorAll("#wave-options .arcade-pill");
        waveButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                wavesChosen = true;
                maxWaves = parseInt(btn.getAttribute("data-waves") || "3", 10);
                syncHomeButtons();
                btn.blur();
            });
        });

        renderHomePreviewSprites();
    }

    // 画面下部のオンスクリーンボタン
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
            if (gameState === "READY") {
                startGame();
            } else if (gameState === "GAME_OVER" || gameState === "CLEAR") {
                resetGame(true, false);
            } else {
                firePlayerBullet();
            }
        }, () => keys.shoot = false);

        if (btnSound) {
            btnSound.addEventListener("click", () => {
                initAudio();
                Sound.enabled = !Sound.enabled;
                btnSound.textContent = Sound.enabled ? "ON" : "OFF";
            });
        }
    }

    // ─────────────────────────────────────────────
    // 弾の発射 (連射 & パワーアップショット)
    // ─────────────────────────────────────────────
    function firePlayerBullet() {
        if (gameState !== "PLAYING") return;
        const bCfg = window.GameConfig ? window.GameConfig.bullet : {};
        const pCfg = window.GameConfig ? window.GameConfig.player : {};
        const preset = DIFFICULTY_PRESETS[currentDifficulty] || DIFFICULTY_PRESETS.normal;
        const maxBullets = safeNum(pCfg.maxBullets, 1, 100, preset.maxBullets);

        if (playerBullets.length >= maxBullets) return;

        const bw = safeNum(bCfg.width, 1, 100, 3);
        const bh = safeNum(bCfg.height, 2, 100, 12);
        const spd = safeNum(bCfg.speed, -100, -1, -8);
        const col = bCfg.color || "#FFFF00";

        if (playerPowerLevel === 1) {
            // Level 1: 通常単発
            playerBullets.push({
                x: player.x + player.width / 2 - bw / 2,
                y: player.y - bh,
                vx: 0,
                width: bw,
                height: bh,
                speed: spd,
                color: col
            });
        } else if (playerPowerLevel === 2) {
            // Level 2: 2連装平行ショット
            playerBullets.push({
                x: player.x + 3,
                y: player.y - bh,
                vx: 0,
                width: bw,
                height: bh,
                speed: spd,
                color: col
            });
            playerBullets.push({
                x: player.x + player.width - 3 - bw,
                y: player.y - bh,
                vx: 0,
                width: bw,
                height: bh,
                speed: spd,
                color: col
            });
        } else {
            // Level 3+: 3WAYショット
            playerBullets.push({
                x: player.x + player.width / 2 - bw / 2,
                y: player.y - bh,
                vx: 0,
                width: bw,
                height: bh,
                speed: spd,
                color: col
            });
            playerBullets.push({
                x: player.x + 2,
                y: player.y - bh,
                vx: -1.2,
                width: bw,
                height: bh,
                speed: spd,
                color: col
            });
            playerBullets.push({
                x: player.x + player.width - 2 - bw,
                y: player.y - bh,
                vx: 1.2,
                width: bw,
                height: bh,
                speed: spd,
                color: col
            });
        }

        Sound.playShoot();
    }

    function fireEnemyBullet(enemy) {
        const eCfg = window.GameConfig ? window.GameConfig.enemy : {};
        const preset = DIFFICULTY_PRESETS[currentDifficulty] || DIFFICULTY_PRESETS.normal;
        const spd = safeNum(eCfg.bulletSpeed, 1, 10, 3.5) * diffMod().speed;

        // Wave 2以降、一部の弾をプレイヤー狙いのエイム弾にする
        let vx = 0;
        if (wave >= 2 && Math.random() < 0.35) {
            const dx = (player.x + player.width / 2) - (enemy.x + enemy.width / 2);
            vx = Math.max(-1.4, Math.min(1.4, dx / 70));
        }

        enemyBullets.push({
            x: enemy.x + enemy.width / 2 - 1.5,
            y: enemy.y + enemy.height,
            vx: vx,
            width: 3,
            height: 10,
            speed: spd,
            wiggleTimer: 0
        });
    }

    // ─────────────────────────────────────────────
    // UFO ロジック
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
                ufo.dir = Math.random() < 0.5 ? 1 : -1;
                ufo.x = ufo.dir === 1 ? -40 : V_WIDTH + 10;
                Sound.startUFO();
            }
        } else {
            ufo.x += ufo.speed * ufo.dir;
            if ((ufo.dir === 1 && ufo.x > V_WIDTH + 40) || (ufo.dir === -1 && ufo.x < -60)) {
                ufo.active = false;
                Sound.stopUFO();
            }
        }
    }

    // ─────────────────────────────────────────────
    // メイン更新 (Update Loop)
    // ─────────────────────────────────────────────
    function update() {
        const eCfg = window.GameConfig ? window.GameConfig.enemy : {};
        const pCfg = window.GameConfig ? window.GameConfig.player : {};
        const preset = DIFFICULTY_PRESETS[currentDifficulty] || DIFFICULTY_PRESETS.normal;

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

        // プレイヤー射撃 (押しっぱなし連射)
        if (keys.shoot) {
            shootCooldown--;
            if (shootCooldown <= 0) {
                firePlayerBullet();
                shootCooldown = safeNum(pCfg.fireInterval, 2, 60, preset.fireInterval);
            }
        }

        // プレイヤーの弾移動
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            b.x += (b.vx || 0);
            b.y += b.speed;
            if (b.y < 35 || b.x < 0 || b.x > V_WIDTH) {
                playerBullets.splice(i, 1);
            }
        }

        // 敵の弾移動
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const eb = enemyBullets[i];
            eb.y += eb.speed;
            eb.x += (eb.vx || 0);
            eb.wiggleTimer++;
            eb.x += Math.sin(eb.wiggleTimer * 0.4) * 0.6;
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
            // 全滅！ウェーブクリア判定
            wave++;
            Sound.stopUFO();

            if (wave > maxWaves) {
                // 全ウェーブ走破！ゲームクリア
                gameState = "CLEAR";
                Sound.playUFOHit();
                return;
            }

            // 次のウェーブへ
            playerPowerLevel = Math.min(3, wave);

            // 防壁の毎ウェーブ再生
            const bCfg = window.GameConfig ? window.GameConfig.bunker : {};
            const regenerate = (bCfg.regenerateEachWave !== false);
            if (regenerate) {
                initBunkers();
            }

            playerBullets = [];
            enemyBullets = [];
            initEnemies();
            return;
        }

        // 残り匹数に応じた行進テンポの加速
        const baseSpeed = safeNum(eCfg.speed, 0.2, 5, 1.0);
        const aliveRatio = aliveEnemies.length / enemies.length;
        stepInterval = Math.max(4, Math.floor((40 * aliveRatio) / baseSpeed));

        stepTimer++;
        if (stepTimer >= stepInterval) {
            stepTimer = 0;
            animFrame = 1 - animFrame;
            Sound.playWalk();

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

            // 防壁の侵食チェック
            for (let e of aliveEnemies) {
                for (let bunker of bunkers) {
                    bunker.corrode(e.x, e.y, e.width, e.height);
                }
            }

            // 最前線到達チェック
            const invasionLine = player.y - 10;
            for (let e of aliveEnemies) {
                if (e.y + e.height >= invasionLine) {
                    gameState = "GAME_OVER";
                    Sound.playPlayerHit();
                    return;
                }
            }
        }

        // ── 敵の射撃 ──
        const shootInterval = Math.max(10, safeNum(eCfg.shootInterval, 10, 200, 50) * diffMod().interval);
        if (Math.random() < (1.0 / shootInterval)) {
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
            if (bottomEnemies.length > 0 && enemyBullets.length < 5) {
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

            // 防壁との判定 (自弾が貫通するかどうか)
            const bCfg = window.GameConfig ? window.GameConfig.bunker : {};
            const passThrough = (bCfg.passThroughPlayer !== false) && !diffMod().noPassThrough;

            if (!passThrough) {
                for (let bunker of bunkers) {
                    if (bunker.checkHit(pb.x, pb.y, pb.width, pb.height)) {
                        bunker.damage(pb.x + pb.width / 2, pb.y, 4);
                        playerBullets.splice(bi, 1);
                        break;
                    }
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
    // 描画ループ (Draw Loop)
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
            drawPixelPattern(getSprite("ufo"), ufo.x, ufo.y, 2, ufo.color);
        }

        // 4. インベーダー描画
        for (let e of enemies) {
            if (!e.alive) continue;
            const pattern = getSprite(e.type, animFrame);
            if (pattern) {
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
            ctx.fillRect(eb.x, eb.y, eb.width, 3);
            ctx.fillRect(eb.x + 2, eb.y + 3, eb.width, 3);
            ctx.fillRect(eb.x - 2, eb.y + 6, eb.width, 3);
            ctx.fillRect(eb.x, eb.y + 9, eb.width, 3);
        }

        // 8. 爆発エフェクト
        for (let exp of explosions) {
            if (exp.scoreText) {
                ctx.fillStyle = "#FF0033";
                ctx.font = "bold 16px 'Courier New', monospace";
                ctx.fillText(exp.scoreText, exp.x, exp.y);
            } else {
                drawPixelPattern(getSprite("explosion"), exp.x, exp.y, 2, exp.color || "#FFFFFF");
            }
        }

        // 9. プレイヤー描画
        if (gameState === "PLAYER_DYING") {
            const blowFrame = Math.floor(player.dyingTimer / 8) % 2;
            drawPixelPattern(SPRITES.playerBlow[blowFrame], player.x, player.y, player.pixelSize, "#FF3333");
        } else if (gameState !== "GAME_OVER") {
            drawPixelPattern(getSprite("player"), player.x, player.y, player.pixelSize, player.color);
        }

        // 10. 最下部の境界線とステータス（残機数・クレジット表示）
        const groundY = V_HEIGHT - 32;
        ctx.fillStyle = "#FF0033";
        ctx.fillRect(0, groundY, V_WIDTH, 2);

        // 残機表示 (残機が多い場合はアイコン×数字、少ない場合はアイコン並べ)
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "14px 'Courier New', monospace";
        const playerPattern = getSprite("player");
        if (lives <= 5) {
            ctx.fillText(lives, 25, groundY + 8);
            for (let i = 0; i < Math.max(0, lives - 1); i++) {
                drawPixelPattern(playerPattern, 45 + i * 28, groundY + 6, 1.5, player.color);
            }
        } else {
            drawPixelPattern(playerPattern, 25, groundY + 6, 1.5, player.color);
            ctx.fillText(`× ${lives}`, 55, groundY + 8);
        }

        // 右下のクレジット表示
        ctx.fillStyle = "#FF00FF";
        ctx.fillText("CREDIT 00", V_WIDTH - 110, groundY + 8);

        // 11. ゲームオーバー・クリア画面
        if (gameState === "GAME_OVER") {
            ctx.fillStyle = "rgba(10, 14, 20, 0.88)";
            ctx.fillRect(0, 160, V_WIDTH, 220);

            ctx.fillStyle = "#FF3344";
            ctx.font = "bold 30px 'Courier New', monospace";
            ctx.textAlign = "center";
            ctx.fillText("GAME OVER", V_WIDTH / 2, 210);

            ctx.fillStyle = "#FFFF00";
            ctx.font = "15px 'Courier New', monospace";
            ctx.fillText("FINAL SCORE: " + score, V_WIDTH / 2, 260);

            ctx.fillStyle = "#00FFFF";
            ctx.font = "13px 'Courier New', monospace";
            ctx.fillText("PRESS [SPACE] TO RETURN TO TITLE", V_WIDTH / 2, 310);
            ctx.textAlign = "left";
        } else if (gameState === "CLEAR") {
            ctx.fillStyle = "rgba(10, 14, 20, 0.90)";
            ctx.fillRect(0, 140, V_WIDTH, 250);

            ctx.fillStyle = "#00FF66";
            ctx.font = "bold 30px 'Courier New', monospace";
            ctx.textAlign = "center";
            ctx.fillText("GAME CLEAR", V_WIDTH / 2, 190);

            ctx.fillStyle = "#FFFF00";
            ctx.font = "14px 'Courier New', monospace";
            ctx.fillText("ALL " + maxWaves + " WAVES COMPLETED", V_WIDTH / 2, 225);

            ctx.fillStyle = "#FFFFFF";
            ctx.font = "15px 'Courier New', monospace";
            ctx.fillText("FINAL SCORE: " + score, V_WIDTH / 2, 265);
            ctx.fillText("REMAINING LIVES: " + lives, V_WIDTH / 2, 295);

            ctx.fillStyle = "#00FFFF";
            ctx.font = "13px 'Courier New', monospace";
            ctx.fillText("PRESS [SPACE] TO RETURN TO TITLE", V_WIDTH / 2, 345);
            ctx.textAlign = "left";
        }
    }

    // ─────────────────────────────────────────────
    // メインループ
    // ─────────────────────────────────────────────
    function loop() {
        update();
        draw();
        requestAnimationFrame(loop);
    }

    // 起動
    function start() {
        setupHomeUI();
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
        const wasPlaying = (gameState !== "READY");
        if (newConfig) window.GameConfig = newConfig;
        difficultyChosen = false;
        wavesChosen = false;
        resetGame(true, wasPlaying);
        renderHomePreviewSprites();
    };
})();
