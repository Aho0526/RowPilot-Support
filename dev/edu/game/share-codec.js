// ==========================================
// ハコゲーム - share-codec.js
// ステージ共有用コーデック。ステージ(最大3件)を不透明な文字列トークンへ変換する。
// トークンは URL のフラグメントに置くため、サーバーを必要としない。
//
// トークン構造 (base64url)
//   [1バイト: ソルト][スクランブル済みペイロード]
//   ペイロードはソルトから作る疑似乱数列と XOR され、規則性が見えない文字列になる。
//
// ペイロード構造 (ビット列、MSB先頭)
//   version(4) count-1(2)
//   ステージごと:
//     セル 25 x (禁止1bit + ギミック5bit) / solution 25bit / startRow 3 / goalRow 3 / hasCeiling 1
//     maxBlocks 5 / targetBlocks 5 / hasTitle 1 / [titleLen 5 + 16bit x titleLen]
//   バイト境界までパディング後、16bit チェックサム
// ==========================================
(function (root) {
    'use strict';

    var VERSION = 1;
    var COLS = 5;
    var ROWS = 5;
    var MAX_STAGES = 3;
    var MAX_TITLE = 16;
    var MAX_TOKEN_LENGTH = 400;
    var SHARED_ID_BASE = 9001;
    var DIRS = ['up', 'right', 'down', 'left'];
    var DIR_ICON = { up: '↑', right: '→', down: '↓', left: '←' };

    // ギミック値: 0 なし / 1 紫枠のみ / 2-5 dash / 6-9 step / 10-13 dash+紫枠 / 14-17 step+紫枠
    // 禁止マスは別ビットで持つ。禁止とギミックは同じマスに共存できる
    function cellCodeOf(kind, dir, purple) {
        var d = DIRS.indexOf(dir);
        if (d < 0) return -1;
        var base = kind === 'dash' ? 2 : 6;
        return base + d + (purple ? 8 : 0);
    }

    function describeCell(code) {
        if (code === 0) return { kind: 'empty' };
        if (code === 1) return { kind: 'purple' };
        if (code >= 2 && code <= 17) {
            var purple = code >= 10;
            var c = purple ? code - 8 : code;
            var kind = c < 6 ? 'dash' : 'step';
            var dir = DIRS[(c - 2) % 4];
            return { kind: kind, dir: dir, purple: purple };
        }
        return null;
    }

    // MARK: - ビット入出力
    function BitWriter() {
        this.bits = [];
    }
    BitWriter.prototype.write = function (value, n) {
        for (var i = n - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
    };
    BitWriter.prototype.align = function () {
        while (this.bits.length % 8 !== 0) this.bits.push(0);
    };
    BitWriter.prototype.toBytes = function () {
        this.align();
        var out = [];
        for (var i = 0; i < this.bits.length; i += 8) {
            var b = 0;
            for (var j = 0; j < 8; j++) b = (b << 1) | this.bits[i + j];
            out.push(b);
        }
        return out;
    };

    function BitReader(bytes) {
        this.bytes = bytes;
        this.pos = 0;
    }
    BitReader.prototype.read = function (n) {
        var v = 0;
        for (var i = 0; i < n; i++) {
            var byteIdx = this.pos >> 3;
            if (byteIdx >= this.bytes.length) throw new Error('データが途中で終わっています');
            var bit = (this.bytes[byteIdx] >> (7 - (this.pos & 7))) & 1;
            v = (v << 1) | bit;
            this.pos++;
        }
        return v;
    };
    BitReader.prototype.align = function () {
        this.pos = (this.pos + 7) & ~7;
    };

    // MARK: - スクランブル・チェックサム
    function keystream(salt, length) {
        var s = (Math.imul(salt + 1, 2654435761) ^ 0x9E3779B9) >>> 0;
        if (s === 0) s = 0x1234567;
        var out = new Array(length);
        for (var i = 0; i < length + 8; i++) {
            s ^= s << 13; s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5; s >>>= 0;
            if (i >= 8) out[i - 8] = (s >>> 8) & 255;
        }
        return out;
    }

    function checksum16(bytes, len) {
        var h = 0x811C9DC5;
        for (var i = 0; i < len; i++) {
            h ^= bytes[i];
            h = Math.imul(h, 16777619) >>> 0;
        }
        return (h ^ (h >>> 16)) & 0xFFFF;
    }

    // MARK: - base64url
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    function toBase64Url(bytes) {
        var out = '';
        for (var i = 0; i < bytes.length; i += 3) {
            var b0 = bytes[i];
            var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
            var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
            out += B64[b0 >> 2];
            out += B64[((b0 & 3) << 4) | (b1 >> 4)];
            if (i + 1 < bytes.length) out += B64[((b1 & 15) << 2) | (b2 >> 6)];
            if (i + 2 < bytes.length) out += B64[b2 & 63];
        }
        return out;
    }

    function fromBase64Url(str) {
        if (!/^[A-Za-z0-9_-]+$/.test(str) || str.length % 4 === 1) return null;
        var out = [];
        var buf = 0;
        var bits = 0;
        for (var i = 0; i < str.length; i++) {
            buf = (buf << 6) | B64.indexOf(str[i]);
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.push((buf >> bits) & 255);
                buf &= (1 << bits) - 1;
            }
        }
        return out;
    }

    // MARK: - ステージ検証・正規化
    function inRange(n, lo, hi) {
        return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi;
    }

    function sanitizeTitle(raw) {
        if (typeof raw !== 'string') return '';
        // 制御文字と HTML で意味を持つ文字を除去する
        return raw.replace(/[\u0000-\u001F\u007F<>&"'`\\]/g, '').trim().slice(0, MAX_TITLE);
    }

    function stageToCells(st, index) {
        var label = 'ステージ' + (index + 1);
        var cells = [];
        for (var n = 0; n < COLS * ROWS; n++) cells.push({ forbidden: 0, code: 0 });
        var used = {};
        function put(col, row, code, what) {
            if (!inRange(col, 0, COLS - 1) || !inRange(row, 0, ROWS - 1)) {
                throw new Error(label + ': ' + what + 'の位置が盤面の範囲外です');
            }
            var k = row * COLS + col;
            if (used[k]) throw new Error(label + ': 同じマスに複数のギミックがあります');
            used[k] = true;
            cells[k].code = code;
        }
        (st.forbidden || []).forEach(function (f) {
            if (!inRange(f.col, 0, COLS - 1) || !inRange(f.row, 0, ROWS - 1)) {
                throw new Error(label + ': 禁止マスの位置が盤面の範囲外です');
            }
            cells[f.row * COLS + f.col].forbidden = 1;
        });
        (st.gimmicks || []).forEach(function (g) {
            if (g.type === undefined || g.type === null) {
                // 種別なしは紫枠のみのマス
                if (!g.purpleBorder) throw new Error(label + ': 種別のないギミックは紫枠のみ共有できます');
                put(g.col, g.row, 1, '紫枠');
                return;
            }
            if (g.type !== 'dash' && g.type !== 'step') {
                throw new Error(label + ': 共有できないギミック種別 ' + g.type + ' があります');
            }
            if (g.type === 'step' && g.steps !== undefined && g.steps !== 1) {
                throw new Error(label + ': 共有できるのは steps が 1 の step のみです');
            }
            var code = cellCodeOf(g.type, g.dir, !!g.purpleBorder);
            if (code < 0) throw new Error(label + ': ギミックの向きが不正です');
            put(g.col, g.row, code, 'ギミック');
        });
        return cells;
    }

    function stageToSolutionMask(st, index) {
        var mask = new Array(COLS * ROWS).fill(0);
        (st.solution || []).forEach(function (s) {
            if (!inRange(s.col, 0, COLS - 1) || !inRange(s.row, 0, ROWS - 1)) {
                throw new Error('ステージ' + (index + 1) + ': solution の位置が範囲外です');
            }
            mask[s.row * COLS + s.col] = 1;
        });
        return mask;
    }

    // options.includeTitles が true の場合のみステージ名をトークンへ含める
    function encode(stages, options) {
        options = options || {};
        try {
            if (!Array.isArray(stages) || stages.length === 0) throw new Error('共有するステージがありません');
            if (stages.length > MAX_STAGES) throw new Error('共有できるのは最大 ' + MAX_STAGES + ' ステージまでです');

            var w = new BitWriter();
            w.write(VERSION, 4);
            w.write(stages.length - 1, 2);

            stages.forEach(function (st, i) {
                var label = 'ステージ' + (i + 1);
                if (!st || typeof st !== 'object') throw new Error(label + ': データが不正です');
                if (!inRange(st.startRow, 0, ROWS - 1) || !inRange(st.goalRow, 0, ROWS - 1)) {
                    throw new Error(label + ': startRow / goalRow は 0 から 4 の整数にしてください');
                }
                var maxBlocks = st.maxBlocks;
                var targetBlocks = st.targetBlocks !== undefined ? st.targetBlocks : (st.solution ? st.solution.length : maxBlocks);
                if (!inRange(maxBlocks, 0, 25) || !inRange(targetBlocks, 0, 25)) {
                    throw new Error(label + ': maxBlocks / targetBlocks は 0 から 25 の整数にしてください');
                }
                var cells = stageToCells(st, i);
                var mask = stageToSolutionMask(st, i);

                cells.forEach(function (c) { w.write(c.forbidden, 1); w.write(c.code, 5); });
                mask.forEach(function (m) { w.write(m, 1); });
                w.write(st.startRow, 3);
                w.write(st.goalRow, 3);
                w.write(st.hasCeiling ? 1 : 0, 1);
                w.write(maxBlocks, 5);
                w.write(targetBlocks, 5);

                var title = options.includeTitles ? sanitizeTitle(st.title) : '';
                if (title.length > 0) {
                    w.write(1, 1);
                    w.write(title.length, 5);
                    for (var k = 0; k < title.length; k++) w.write(title.charCodeAt(k), 16);
                } else {
                    w.write(0, 1);
                }
            });

            var body = w.toBytes();
            var sum = checksum16(body, body.length);
            var plain = body.concat([(sum >> 8) & 255, sum & 255]);

            var salt = Math.floor(Math.random() * 256);
            var ks = keystream(salt, plain.length);
            var scrambled = plain.map(function (b, i) { return b ^ ks[i]; });
            var token = toBase64Url([salt].concat(scrambled));
            if (token.length > MAX_TOKEN_LENGTH) throw new Error('生成された共有コードが長すぎます');
            return { ok: true, token: token };
        } catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    }

    function buildLegends(stage) {
        var hasForbidden = stage.forbidden.length > 0;
        var dash = stage.gimmicks.filter(function (g) { return g.type === 'dash'; });
        var step = stage.gimmicks.filter(function (g) { return g.type === 'step'; });
        var hasPurple = stage.gimmicks.some(function (g) { return g.purpleBorder; });
        var legends = [];
        if (hasForbidden) legends.push({ icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' });
        if (dash.length) legends.push({ icon: '→', type: 'dash', text: '青矢印：矢印方向に端まで移動' });
        if (step.length) legends.push({ icon: '→', type: 'step', text: '緑矢印：矢印方向に1マス移動' });
        if (hasPurple) legends.push({ icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' });
        return legends;
    }

    function decode(token) {
        try {
            if (typeof token !== 'string') throw new Error('共有コードがありません');
            token = token.trim();
            if (token.length < 8 || token.length > MAX_TOKEN_LENGTH) throw new Error('共有コードの長さが正しくありません');
            var raw = fromBase64Url(token);
            if (!raw || raw.length < 5) throw new Error('共有コードの形式が正しくありません');

            var salt = raw[0];
            var scrambled = raw.slice(1);
            var ks = keystream(salt, scrambled.length);
            var plain = scrambled.map(function (b, i) { return b ^ ks[i]; });

            var r = new BitReader(plain);
            var version = r.read(4);
            if (version !== VERSION) throw new Error('未対応のバージョンです');
            var count = r.read(2) + 1;
            if (count > MAX_STAGES) throw new Error('ステージ数が不正です');

            var stages = [];
            for (var i = 0; i < count; i++) {
                var cells = [];
                for (var c = 0; c < COLS * ROWS; c++) {
                    var fb = r.read(1);
                    var desc = describeCell(r.read(5));
                    if (!desc) throw new Error('不正なセル値が含まれています');
                    desc.forbidden = fb === 1;
                    cells.push(desc);
                }
                var mask = [];
                for (var m = 0; m < COLS * ROWS; m++) mask.push(r.read(1));
                var startRow = r.read(3);
                var goalRow = r.read(3);
                if (startRow > ROWS - 1 || goalRow > ROWS - 1) throw new Error('スタートまたはゴールの位置が不正です');
                var hasCeiling = r.read(1) === 1;
                var maxBlocks = r.read(5);
                var targetBlocks = r.read(5);
                if (maxBlocks > 25 || targetBlocks > 25) throw new Error('ブロック数が不正です');

                var title = '';
                if (r.read(1) === 1) {
                    var len = r.read(5);
                    if (len > MAX_TITLE) throw new Error('タイトルが長すぎます');
                    var chars = [];
                    for (var t = 0; t < len; t++) chars.push(String.fromCharCode(r.read(16)));
                    title = sanitizeTitle(chars.join(''));
                }

                var forbidden = [];
                var gimmicks = [];
                var solution = [];
                for (var idx = 0; idx < cells.length; idx++) {
                    var col = idx % COLS;
                    var row = Math.floor(idx / COLS);
                    var cell = cells[idx];
                    if (cell.forbidden) forbidden.push({ col: col, row: row });
                    if (cell.kind === 'purple') {
                        gimmicks.push({ col: col, row: row, purpleBorder: true });
                    } else if (cell.kind === 'dash') {
                        gimmicks.push({ col: col, row: row, type: 'dash', dir: cell.dir, purpleBorder: cell.purple });
                    } else if (cell.kind === 'step') {
                        gimmicks.push({ col: col, row: row, type: 'step', dir: cell.dir, steps: 1, purpleBorder: cell.purple });
                    }
                    if (mask[idx]) solution.push({ col: col, row: row });
                }

                var stage = {
                    id: SHARED_ID_BASE + i,
                    title: title || ('共有ステージ ' + (i + 1)),
                    subtitle: '共有されたステージ',
                    maxBlocks: maxBlocks,
                    targetBlocks: targetBlocks,
                    startRow: startRow,
                    goalRow: goalRow,
                    hasCeiling: hasCeiling,
                    forbidden: forbidden,
                    gimmicks: gimmicks,
                    solution: solution,
                    legends: []
                };
                stage.legends = buildLegends(stage);
                stages.push(stage);
            }

            r.align();
            var bodyLen = r.pos >> 3;
            var stored = r.read(16);
            if (stored !== checksum16(plain, bodyLen)) throw new Error('共有コードが壊れています');
            return { ok: true, stages: stages };
        } catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    }

    // location.hash などから共有トークンを取り出す。無ければ null
    function tokenFromHash(hash) {
        if (typeof hash !== 'string') return null;
        var t = hash.replace(/^#\/?/, '');
        return t.length > 0 ? t : null;
    }

    function buildUrl(token, baseUrl) {
        var base = (baseUrl || '').split('#')[0].split('?')[0];
        return base + '#' + token;
    }

    root.ShareCodec = {
        MAX_STAGES: MAX_STAGES,
        MAX_TITLE: MAX_TITLE,
        encode: encode,
        decode: decode,
        tokenFromHash: tokenFromHash,
        buildUrl: buildUrl
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = root.ShareCodec;
    }
})(typeof window !== 'undefined' ? window : globalThis);
