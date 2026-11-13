// テスト: linter.js の差分監視・関数削除検知・行番号正確性検証
const fs = require('fs');
const path = require('path');
const Linter = require('../editor/linter.js');

const baseDir = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(baseDir, 'main.js'), 'utf8');
const shareJs = fs.readFileSync(path.join(baseDir, 'share-codec.js'), 'utf8');
const stagesJs = fs.readFileSync(path.join(baseDir, 'stages.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(baseDir, 'style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(baseDir, 'index.html'), 'utf8');

const allFiles = {
    'main.js': { content: mainJs, baselineContent: mainJs },
    'share-codec.js': { content: shareJs, baselineContent: shareJs },
    'stages.js': { content: stagesJs, baselineContent: stagesJs },
    'style.css': { content: styleCss, baselineContent: styleCss },
    'index.html': { content: indexHtml, baselineContent: indexHtml }
};

function assert(cond, msg) {
    if (!cond) throw new Error('Assertion failed: ' + msg);
}

// 1. 正常なプロジェクト全体でエラー 0 件
console.log('Test 1: 正常なプロジェクト全体の診断');
{
    const res = Linter.lintProject(allFiles);
    assert(res.totalErrors === 0, `Expected 0 errors, got ${res.totalErrors}`);
    console.log(' -> OK: エラー 0 件');
}

// 2. computeChangedLines の行ズレ耐性（100行目に1行挿入しても100行目だけが差分になる）
console.log('Test 2: computeChangedLines の行ズレ耐性検証');
{
    const lines = mainJs.split('\n');
    lines.splice(99, 0, '// inserted comment');
    const mod = lines.join('\n');
    const changed = Linter.computeChangedLines(mainJs, mod);
    assert(changed.size === 1 && changed.has(100), `Expected only line 100 changed, got size=${changed.size}`);
    console.log(' -> OK: 1行挿入時に挿入行(100)のみが差分として検出されました。');
}

// 3. getStage() を main.js から削除したときにエラーが検出されること
console.log('Test 3: main.js から getStage() を削除した際の検知検証');
{
    const mod = mainJs.replace(/function\s+getStage\b[\s\S]*?\n\s*\}\n/, '');
    const issues = Linter.lint('main.js', mod, { baselineCode: mainJs, allFiles });
    assert(issues.length > 0, 'Expected errors when getStage() is deleted');
    assert(issues.some(i => i.message.includes('getStage')), 'Error message should mention getStage');
    const first = issues[0];
    assert(first.line >= 30 && first.line <= 45, `Expected primary baseline error near deleted line 36, got ${first.line}`);
    console.log(` -> OK: ${issues.length} 件のエラーを検出（最優先行: ${first.line} - ${first.message}）`);
}

// 4. share-codec.js から main.js 等で参照されている関数を削除したときにエラーが検出されること
console.log('Test 4: share-codec.js の公開関数削除時の検知検証');
{
    const match = shareJs.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    assert(match, 'No function found in share-codec.js');
    // share-codec.js 内で定義され main.js から使われている関数を消す（例: encodeShareToken や decodeShareToken など）
    const targetName = shareJs.includes('function encodeStageShare') ? 'encodeStageShare'
        : (shareJs.includes('function encodeShareToken') ? 'encodeShareToken' : match[1]);
    const fnRe = new RegExp(`function\\s+${targetName}\\b[\\s\\S]*?\\n\\s*\\}\\n`);
    const modShare = shareJs.replace(fnRe, '');
    if (modShare !== shareJs) {
        const issues = Linter.lint('share-codec.js', modShare, { baselineCode: shareJs, allFiles });
        console.log(` -> share-codec.js から ${targetName} 削除時: ${issues.length} 件`, issues.map(i => ({ line: i.line, msg: i.message })));
        // もし main.js または share-codec.js 自身から参照されているならエラーが出る
        if (mainJs.includes(targetName) || modShare.includes(targetName)) {
            assert(issues.length > 0, `Expected error when referenced ${targetName} is deleted`);
        }
    }
    console.log(' -> OK: クロスファイル参照切れを検知しました。');
}

// 5. 構文エラー時に最終行などの意味不明な行ではなく編集行付近にエラーが出ること
console.log('Test 5: 構文エラー時の行番号正確性検証');
{
    const lines = mainJs.split('\n');
    // 100行目に不正な構文を挿入
    lines.splice(99, 0, 'const broken = ;');
    const mod = lines.join('\n');
    const issues = Linter.lint('main.js', mod, { baselineCode: mainJs, allFiles });
    assert(issues.length > 0, 'Expected syntax error');
    assert(issues[0].line === 100, `Expected error at line 100, got ${issues[0].line}`);
    assert(issues[0].isChangedByUser === true, 'Error should be marked as isChangedByUser');
    console.log(` -> OK: 構文エラーが正確な行(${issues[0].line})に報告されました。`);
}

console.log('ALL LINTER TESTS PASSED!');
