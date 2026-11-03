// node tests/share-codec.test.js
const fs = require('fs');
const path = require('path');
const codec = require('../share-codec.js');
const STAGES = new Function(fs.readFileSync(path.join(__dirname, '../stages.js'), 'utf8') + '; return STAGES;')();

const norm = (st) => JSON.stringify({
    s: st.startRow, g: st.goalRow, c: !!st.hasCeiling, m: st.maxBlocks, t: st.targetBlocks ?? st.solution.length,
    f: st.forbidden.map(x => x.row * 5 + x.col).sort((a, b) => a - b),
    gm: st.gimmicks.map(x => [x.row * 5 + x.col, x.type||null, x.dir||null, !!x.purpleBorder]).sort((a, b) => a[0] - b[0]),
    so: st.solution.map(x => x.row * 5 + x.col).sort((a, b) => a - b)
});
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };

let encodable = 0;
for (let i = 0; i < STAGES.length; i++) {
    const r = codec.encode([STAGES[i]]);
    if (!r.ok) { console.log('skip', STAGES[i].id, r.error); continue; }
    encodable++;
    const d = codec.decode(r.token);
    ok(d.ok && norm(d.stages[0]) === norm(STAGES[i]), 'roundtrip stage ' + STAGES[i].id);
}
console.log('encodable', encodable, '/', STAGES.length);

const triple = codec.encode(STAGES.slice(0, 3), { includeTitles: true });
ok(triple.ok, 'triple');
const dt = codec.decode(triple.token);
ok(dt.ok && dt.stages.length === 3 && dt.stages[0].title === 'ステージ 1'.slice(0, 16), 'titles');
console.log('token', triple.token.length, triple.token);
const noTitle = codec.encode(STAGES.slice(0, 3));
console.log('no title token', noTitle.token.length, codec.decode(noTitle.token).stages[0].title);

ok(!codec.encode(STAGES.slice(0, 4)).ok, 'over 3 rejected');
ok(!codec.encode([]).ok, 'empty rejected');
ok(!codec.decode('abc').ok, 'short');
ok(!codec.decode('!!!!!!!!!!!!').ok, 'chars');
const t = noTitle.token;
const bad = t.slice(0, 10) + (t[10] === 'A' ? 'B' : 'A') + t.slice(11);
ok(!codec.decode(bad).ok, 'tamper');
ok(!codec.decode(t.slice(0, -4)).ok, 'truncate');
for (let n = 0; n < 2000; n++) {
    let s = ''; const L = 8 + Math.floor(Math.random() * 100);
    for (let k = 0; k < L; k++) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[Math.floor(Math.random() * 64)];
    const r = codec.decode(s); // 例外を投げないこと
}
// 2つの同一ステージでもトークンが異なる
const a = codec.encode([STAGES[0]]).token, b = codec.encode([STAGES[0]]).token;
console.log('salt differs sample', a === b ? 'same' : 'different');
console.log(fail ? 'FAILED ' + fail : 'ALL PASSED');
process.exit(fail ? 1 : 0);
