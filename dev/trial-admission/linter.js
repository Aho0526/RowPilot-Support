/**
 * linter.js - 初心者（中学生）向け 親切な構文エラー診断エンジン
 * 
 * 専門用語を使わず、「何が起きていて」「どこをどう直せばいいか」を平易な日本語で案内します。
 * 外部ライブラリ非依存（完全オフライン・Monaca対応）。
 */

(function (global) {
    'use strict';

    // 全角記号マップ（※日本語カタカナの長音「ー」は通常の日本語文字なので含めない）
    const FULLWIDTH_CHARS = {
        '\u3000': { name: '全角スペース', fix: '半角スペース' },
        '：': { name: '全角コロン', fix: '半角コロン「 : 」' },
        '，': { name: '全角カンマ', fix: '半角カンマ「 , 」' },
        '、': { name: '読点（、）', fix: '半角カンマ「 , 」' },
        '。': { name: '句点（。）', fix: '半角ピリオド「 . 」またはカンマ「 , 」' },
        '；': { name: '全角セミコロン', fix: '半角セミコロン「 ; 」' },
        '”': { name: '全角ダブルクォート', fix: '半角の「 " 」' },
        '“': { name: '全角ダブルクォート', fix: '半角の「 " 」' },
        '’': { name: '全角シングルクォート', fix: '半角の「 \' 」' },
        '‘': { name: '全角シングルクォート', fix: '半角の「 \' 」' },
        '｛': { name: '全角の波括弧', fix: '半角の「 { 」' },
        '｝': { name: '全角の波括弧', fix: '半角の「 } 」' },
        '［': { name: '全角の角括弧', fix: '半角の「 [ 」' },
        '］': { name: '全角の角括弧', fix: '半角の「 ] 」' },
        '（': { name: '全角の丸括弧', fix: '半角の「 ( 」' },
        '）': { name: '全角の丸括弧', fix: '半角の「 ) 」' },
        '＝': { name: '全角イコール', fix: '半角イコール「 = 」' },
        '＋': { name: '全角プラス', fix: '半角プラス「 + 」' },
        '－': { name: '全角マイナス', fix: '半角マイナス「 - 」' }, // \uFF0D
        '＊': { name: '全角アスタリスク', fix: '半角の「 * 」' },
        '／': { name: '全角スラッシュ', fix: '半角の「 / 」' },
        '＃': { name: '全角シャープ', fix: '半角の「 # 」' },
        '！': { name: '全角エクスクラメーション', fix: '半角の「 ! 」' },
        '？': { name: '全角クエスチョン', fix: '半角の「 ? 」' },
        '＜': { name: '全角の山括弧', fix: '半角の「 < 」' },
        '＞': { name: '全角の山括弧', fix: '半角の「 > 」' }
    };

    // config.js の既知スキーマ（タイポ検知用・実ファイル config.js と完全同期）
    const KNOWN_CONFIG_SCHEMA = {
        game: ['maxWaves', 'difficulty'],
        player: ['speed', 'color', 'lives', 'maxBullets', 'fireInterval'],
        bullet: ['speed', 'color', 'width', 'height'],
        enemy: ['rows', 'cols', 'speed', 'dropAmount', 'shootInterval', 'bulletSpeed', 'colors', 'scores'],
        bunker: ['enabled', 'count', 'width', 'height', 'color', 'regenerateEachWave', 'passThroughPlayer'],
        ufo: ['enabled', 'speed', 'bonusScore', 'score', 'interval', 'color'],
        sprites: ['player', 'squid', 'crab', 'octopus', 'ufo'],
        display: ['background', 'sound', 'canvasWidth', 'canvasHeight', 'scale']
    };

    const KNOWN_TOP_SECTIONS = Object.keys(KNOWN_CONFIG_SCHEMA);

    // HTMLの閉じタグ不要要素（void elements）
    const VOID_HTML_TAGS = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);

    /**
     * 文字列の類似度（Levenshtein距離）
     */
    function levenshtein(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    /**
     * 文字列リテラルを考慮して一行コメント (//...) を除去する
     */
    function stripLineComment(line) {
        let inString = null;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const next = line[i + 1];
            if (inString) {
                if (ch === '\\') {
                    i++;
                } else if (ch === inString) {
                    inString = null;
                }
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                inString = ch;
                continue;
            }
            if (ch === '/' && next === '/') {
                return line.substring(0, i);
            }
        }
        return line;
    }

    /**
     * 変更された行（差分行）を検出する
     */
    function computeChangedLines(oldCode, newCode) {
        if (!oldCode || oldCode === newCode) return new Set();

        const oldLines = oldCode.split('\n');
        const newLines = newCode.split('\n');
        const changed = new Set();

        for (let i = 0; i < newLines.length; i++) {
            if (i >= oldLines.length || newLines[i] !== oldLines[i]) {
                changed.add(i + 1);
            }
        }

        return changed;
    }

    /**
     * エラーオブジェクトを生成
     */
    function createIssue(line, col, message, hint, severity, lineText, isChangedByUser) {
        return {
            line: Math.max(1, line || 1),
            col: Math.max(1, col || 1),
            message: message || '構文エラーがあります',
            hint: hint || '入力内容を確認してください',
            severity: severity || 'error', // 'error' | 'warning'
            lineText: lineText !== undefined ? lineText : '',
            isChangedByUser: !!isChangedByUser
        };
    }

    /**
     * 1. 全角記号・全角数字・全角英字チェック（コメント内・文字列内・HTMLテキスト内は完全に除外）
     */
    function checkFullwidthCharacters(filename, code) {
        const issues = [];
        const lines = code.split('\n');

        const isHtml = filename.endsWith('.html');
        const isJs = filename.endsWith('.js');

        let inHtmlComment = false;  // <!-- -->
        let inBlockComment = false; // /* */
        let templateStack = [];     // 'TEMPLATE' または { type: 'EXPR', braces: number }
        let inScriptTag = false;    // for HTML <script>
        let inStyleTag = false;     // for HTML <style>

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            let inString = null; // '"' or "'"
            let inHtmlTag = false;
            let prevNonSpace = '';
            let lastWord = '';

            for (let c = 0; c < rawLine.length; c++) {
                const ch = rawLine[c];
                const next = rawLine[c + 1];
                const next3 = rawLine.substring(c, c + 4);
                const next2 = rawLine.substring(c, c + 3);

                const currentTemplateMode = templateStack.length > 0 ? templateStack[templateStack.length - 1] : null;
                const isInsideTemplateString = currentTemplateMode === 'TEMPLATE';

                // --- HTMLコメント判定 (<!-- ... -->) ---
                if (isHtml) {
                    if (inHtmlComment) {
                        if (next2 === '-->') {
                            inHtmlComment = false;
                            c += 2;
                        }
                        continue;
                    }
                    if (!inString && !inBlockComment && !isInsideTemplateString && next3 === '<!--') {
                        inHtmlComment = true;
                        c += 3;
                        continue;
                    }

                    // <script> と <style> の出入り
                    if (!inString && !inBlockComment && !isInsideTemplateString) {
                        const lowerRest = rawLine.substring(c).toLowerCase();
                        if (lowerRest.startsWith('<script')) inScriptTag = true;
                        if (lowerRest.startsWith('</script>')) inScriptTag = false;
                        if (lowerRest.startsWith('<style')) inStyleTag = true;
                        if (lowerRest.startsWith('</style>')) inStyleTag = false;

                        if (ch === '<') inHtmlTag = true;
                        if (ch === '>') {
                            inHtmlTag = false;
                            continue;
                        }
                    }

                    // HTMLで、タグの外側（通常の日本語テキスト）かつscript/style外は全角チェック不要
                    if (!inHtmlTag && !inScriptTag && !inStyleTag) {
                        continue;
                    }
                }

                // --- ブロックコメント中 (/* ... */) ---
                if (inBlockComment) {
                    if (ch === '*' && next === '/') {
                        inBlockComment = false;
                        c++;
                    }
                    continue;
                }

                // --- テンプレートリテラル文字列部分中 (`...`) ---
                if (isInsideTemplateString) {
                    if (ch === '\\' && c + 1 < rawLine.length) {
                        c++; // エスケープ
                        continue;
                    }
                    if (ch === '$' && next === '{') {
                        // 式補間開始
                        templateStack.push({ type: 'EXPR', braces: 1 });
                        c++;
                        continue;
                    }
                    if (ch === '`') {
                        templateStack.pop();
                        continue;
                    }
                    // テンプレートリテラル文字列内の全角文字（日本語テキスト）は完全に許容
                    continue;
                }

                // --- 通常の文字列リテラル判定 (", ') ---
                if (inString) {
                    if (ch === '\\' && c + 1 < rawLine.length) {
                        c++; // エスケープ
                    } else if (ch === inString) {
                        inString = null; // 文字列終了
                    }
                    // 文字列リテラル内の全角文字は完全に許容
                    continue;
                }

                // テンプレート補間式の中（${ ... }）での波括弧深度追跡
                if (currentTemplateMode && currentTemplateMode.type === 'EXPR') {
                    if (ch === '{') {
                        currentTemplateMode.braces++;
                    } else if (ch === '}') {
                        currentTemplateMode.braces--;
                        if (currentTemplateMode.braces === 0) {
                            templateStack.pop();
                            continue;
                        }
                    }
                }

                // --- JS / CSS / HTML内script・style のコメント開始判定 ---
                const inJsContext = isJs || (isHtml && inScriptTag && !inHtmlTag);
                const inCssContext = filename.endsWith('.css') || (isHtml && inStyleTag && !inHtmlTag);

                if (inJsContext || inCssContext) {
                    if (ch === '/' && next === '*') {
                        inBlockComment = true;
                        c++;
                        continue;
                    }
                    if (inJsContext && ch === '/' && next === '/') {
                        // 一行コメント以降は行末まで完全にスキップ
                        break;
                    }
                }

                // テンプレートリテラル開始
                if (inJsContext && ch === '`') {
                    templateStack.push('TEMPLATE');
                    prevNonSpace = '`';
                    lastWord = '';
                    continue;
                }

                // 通常文字列開始
                if (ch === '"' || ch === "'") {
                    inString = ch;
                    prevNonSpace = ch;
                    lastWord = '';
                    continue;
                }

                // 正規表現リテラルの判定とスキップ
                if (inJsContext && ch === '/') {
                    const isRegex = !prevNonSpace || /[(=:;,!&|?+\-*%^~<>{}\\[]/.test(prevNonSpace) || /^(return|case|typeof|delete|void)$/.test(lastWord);
                    if (isRegex) {
                        c++;
                        let inCharClass = false;
                        while (c < rawLine.length && (inCharClass || rawLine[c] !== '/')) {
                            if (rawLine[c] === '\\' && c + 1 < rawLine.length) {
                                c += 2;
                            } else {
                                if (rawLine[c] === '[') inCharClass = true;
                                else if (rawLine[c] === ']') inCharClass = false;
                                c++;
                            }
                        }
                        prevNonSpace = '/';
                        lastWord = '';
                        continue;
                    }
                }

                // --- 全角記号チェック ---
                if (FULLWIDTH_CHARS[ch]) {
                    const info = FULLWIDTH_CHARS[ch];
                    issues.push(createIssue(
                        i + 1,
                        c + 1,
                        `全角の「${ch}」(${info.name}) が使われています`,
                        `キーボードを半角入力にして、${info.fix} に書き直してください`,
                        'error',
                        rawLine
                    ));
                    continue;
                }

                // --- 全角数字チェック (コメント・文字列外のみ) ---
                if (ch >= '０' && ch <= '９') {
                    issues.push(createIssue(
                        i + 1,
                        c + 1,
                        `全角数字の「${ch}」が入力されています`,
                        `半角数字の「${String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)}」に書き直してください`,
                        'error',
                        rawLine
                    ));
                    continue;
                }

                // --- 全角アルファベットチェック (コメント・文字列外のみ) ---
                if ((ch >= 'Ａ' && ch <= 'Ｚ') || (ch >= 'ａ' && ch <= 'ｚ')) {
                    const halfChar = String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
                    issues.push(createIssue(
                        i + 1,
                        c + 1,
                        `全角アルファベットの「${ch}」が入力されています`,
                        `キーボードを半角英数にして、半角の「${halfChar}」に書き直してください`,
                        'error',
                        rawLine
                    ));
                    continue;
                }

                // --- 全角日本語文字（ひらがな・カタカナ・漢字・CJK記号）チェック (コメント・文字列外のみ) ---
                const codePoint = ch.charCodeAt(0);
                // ひらがな: 0x3040 - 0x309F
                // カタカナ: 0x30A0 - 0x30FF
                // 漢字: 0x4E00 - 0x9FAF
                // CJK記号・句読点など: 0x3001 - 0x303F, 0x31F0 - 0x31FF
                const isHiragana = codePoint >= 0x3040 && codePoint <= 0x309F;
                const isKatakana = codePoint >= 0x30A0 && codePoint <= 0x30FF;
                const isKanji = codePoint >= 0x4E00 && codePoint <= 0x9FAF;
                const isCjkSymbol = (codePoint >= 0x3001 && codePoint <= 0x303F) || (codePoint >= 0x31F0 && codePoint <= 0x31FF);

                if (isHiragana || isKatakana || isKanji || isCjkSymbol) {
                    const kind = isHiragana ? 'ひらがな' : (isKatakana ? 'カタカナ' : (isKanji ? '漢字' : '全角記号'));
                    issues.push(createIssue(
                        i + 1,
                        c + 1,
                        `コード内に全角の${kind}「${ch}」が入力されています`,
                        `キーボードを「半角英数」入力にして書き直してください（日本語入力ONのまま打ってしまった可能性があります）`,
                        'error',
                        rawLine
                    ));
                    continue;
                }
            }
        }

        return issues;
    }

    /**
     * 2. クォート閉じ忘れチェック（コメント外のみ）
     */
    /**
     * 2. クォート閉じ忘れチェック（コメント・正規表現外のみ）
     */
    function checkUnclosedQuotes(filename, code) {
        if (filename.endsWith('.html')) return []; // HTMLは checkHTML 内で属性・タグごとに検査

        const issues = [];
        const lines = code.split('\n');
        let inMultiComment = false;
        let inTemplateLiteral = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let inString = null;
            let startCol = 0;
            let prevNonSpace = '';
            let lastWord = '';

            for (let c = 0; c < line.length; c++) {
                const ch = line[c];
                const next = line[c + 1];

                if (inMultiComment) {
                    if (ch === '*' && next === '/') {
                        inMultiComment = false;
                        c++;
                    }
                    continue;
                }

                if (inTemplateLiteral) {
                    if (ch === '\\' && c + 1 < line.length) {
                        c++;
                    } else if (ch === '`') {
                        inTemplateLiteral = false;
                    }
                    continue;
                }

                if (inString) {
                    if (ch === '\\' && c + 1 < line.length) {
                        c++;
                    } else if (ch === inString) {
                        inString = null;
                    }
                    continue;
                }

                // 一行コメント
                if (ch === '/' && next === '/') {
                    break;
                }

                // 複数行コメント開始
                if (ch === '/' && next === '*') {
                    inMultiComment = true;
                    c++;
                    continue;
                }

                // テンプレートリテラル開始
                if (ch === '`') {
                    inTemplateLiteral = true;
                    prevNonSpace = '`';
                    lastWord = '';
                    continue;
                }

                // 文字列開始
                if (ch === '"' || ch === "'") {
                    inString = ch;
                    startCol = c + 1;
                    prevNonSpace = ch;
                    lastWord = '';
                    continue;
                }

                // 正規表現リテラルの判定とスキップ
                if (ch === '/') {
                    const isRegex = !prevNonSpace || /[(=:;,!&|?+\-*%^~<>{}\\[]/.test(prevNonSpace) || /^(return|case|typeof|delete|void)$/.test(lastWord);
                    if (isRegex) {
                        c++;
                        let inCharClass = false;
                        while (c < line.length && (inCharClass || line[c] !== '/')) {
                            if (line[c] === '\\' && c + 1 < line.length) {
                                c += 2;
                            } else {
                                if (line[c] === '[') inCharClass = true;
                                else if (line[c] === ']') inCharClass = false;
                                c++;
                            }
                        }
                        prevNonSpace = '/';
                        lastWord = '';
                        continue;
                    }
                }

                if (/[a-zA-Z0-9_$]/.test(ch)) {
                    lastWord += ch;
                } else if (!/\s/.test(ch)) {
                    lastWord = '';
                }
                if (!/\s/.test(ch)) {
                    prevNonSpace = ch;
                }
            }

            if (inString && !inMultiComment && !inTemplateLiteral) {
                issues.push(createIssue(
                    i + 1,
                    startCol,
                    `文字列を囲む「 ${inString} 」が閉じていません`,
                    `値の最後に「 ${inString} 」を付けて正しく閉じてください`,
                    'error',
                    line
                ));
            }
        }

        return issues;
    }

    /**
     * 3. 括弧の対応チェック ({ }, [ ], ( ))
     */
    function checkBracketPairs(filename, code) {
        // HTMLはタグ体系が別なので対象外
        if (filename.endsWith('.html')) return [];

        const issues = [];
        const stack = [];
        const lines = code.split('\n');

        const BRACKET_PAIRS = {
            '}': { open: '{', name: '波括弧 { }' },
            ']': { open: '[', name: '角括弧 [ ]' },
            ')': { open: '(', name: '丸括弧 ( )' }
        };

        let inMultiComment = false;
        let inTemplateLiteral = false;
        let prevNonSpace = '';
        let lastWord = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let inString = null;

            for (let c = 0; c < line.length; c++) {
                const ch = line[c];
                const next = line[c + 1];

                // 複数行コメント中
                if (inMultiComment) {
                    if (ch === '*' && next === '/') {
                        inMultiComment = false;
                        c++;
                    }
                    continue;
                }

                // テンプレートリテラル中
                if (inTemplateLiteral) {
                    if (ch === '\\' && c + 1 < line.length) {
                        c++;
                    } else if (ch === '`') {
                        inTemplateLiteral = false;
                    }
                    continue;
                }

                // 文字列中
                if (inString) {
                    if (ch === '\\' && c + 1 < line.length) {
                        c++;
                    } else if (ch === inString) {
                        inString = null;
                    }
                    continue;
                }

                // 一行コメント
                if (ch === '/' && next === '/') break;

                // 複数行コメント開始
                if (ch === '/' && next === '*') {
                    inMultiComment = true;
                    c++;
                    continue;
                }

                // テンプレートリテラル開始
                if (ch === '`') {
                    inTemplateLiteral = true;
                    prevNonSpace = '`';
                    lastWord = '';
                    continue;
                }

                // 文字列開始
                if (ch === '"' || ch === "'") {
                    inString = ch;
                    prevNonSpace = ch;
                    lastWord = '';
                    continue;
                }

                // 正規表現リテラルスキップ
                if (ch === '/') {
                    const isRegex = !prevNonSpace || /[(=:;,!&|?+\-*%^~<>{}\\[]/.test(prevNonSpace) || /^(return|case|typeof|delete|void)$/.test(lastWord);
                    if (isRegex) {
                        c++;
                        let inCharClass = false;
                        while (c < line.length && (inCharClass || line[c] !== '/')) {
                            if (line[c] === '\\' && c + 1 < line.length) {
                                c += 2;
                            } else {
                                if (line[c] === '[') inCharClass = true;
                                else if (line[c] === ']') inCharClass = false;
                                c++;
                            }
                        }
                        prevNonSpace = '/';
                        lastWord = '';
                        continue;
                    }
                }

                // 括弧のスタック処理
                if (ch === '{' || ch === '[' || ch === '(') {
                    stack.push({ char: ch, line: i + 1, col: c + 1, lineText: line });
                } else if (ch === '}' || ch === ']' || ch === ')') {
                    const expected = BRACKET_PAIRS[ch];
                    if (stack.length === 0) {
                        issues.push(createIssue(
                            i + 1,
                            c + 1,
                            `余分な閉じ括弧「 ${ch} 」があります`,
                            `対応する開き括弧がないため、この「 ${ch} 」を削除するか確認してください`,
                            'error',
                            line
                        ));
                    } else {
                        const top = stack.pop();
                        if (top.char !== expected.open) {
                            issues.push(createIssue(
                                i + 1,
                                c + 1,
                                `括弧の種類が一致していません（行 ${top.line} の「${top.char}」に対して「${ch}」で閉じています）`,
                                `「${top.char}」に対応する正しい閉じ括弧を使用してください`,
                                'error',
                                line
                            ));
                        }
                    }
                }

                if (/[a-zA-Z0-9_$]/.test(ch)) {
                    lastWord += ch;
                } else if (!/\s/.test(ch)) {
                    lastWord = '';
                }
                if (!/\s/.test(ch)) {
                    prevNonSpace = ch;
                }
            }
        }

        while (stack.length > 0) {
            const unclosed = stack.pop();
            const pairName = unclosed.char === '{' ? '波括弧「 } 」' : (unclosed.char === '[' ? '角括弧「 ] 」' : '丸括弧「 ) 」');
            issues.push(createIssue(
                unclosed.line,
                unclosed.col,
                `開き括弧「 ${unclosed.char} 」が最後まで閉じられていません`,
                `対応する位置に閉じ括弧 ${pairName} を追加してください`,
                'error',
                unclosed.lineText
            ));
        }

        return issues;
    }

    /**
     * 4. config.js 固有の初心者ミス＆タイポ・実行時エラー検知
     */
    function checkConfigSchemaAndTraps(code, changedLines) {
        const issues = [];
        const lines = code.split('\n');

        let currentSection = null;
        let inBlockComment = false;

        // 事前に各行のコメント除去済みテキストを計算
        const cleanLines = lines.map(rawLine => {
            let line = rawLine;
            if (inBlockComment) {
                const closeIdx = line.indexOf('*/');
                if (closeIdx !== -1) {
                    inBlockComment = false;
                    line = line.substring(closeIdx + 2);
                } else {
                    return '';
                }
            }
            while (true) {
                const openIdx = line.indexOf('/*');
                if (openIdx === -1) break;
                const closeIdx = line.indexOf('*/', openIdx + 2);
                if (closeIdx !== -1) {
                    line = line.substring(0, openIdx) + line.substring(closeIdx + 2);
                } else {
                    inBlockComment = true;
                    line = line.substring(0, openIdx);
                    break;
                }
            }
            return stripLineComment(line).trim();
        });

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const clean = cleanLines[i];
            if (!clean) continue;

            // セクション開始の検知 (例: player: {, bullet: {)
            const sectionMatch = clean.match(/^([^\s:{}]+)\s*:\s*\{/);
            if (sectionMatch) {
                const secName = sectionMatch[1];
                if (!KNOWN_CONFIG_SCHEMA[secName]) {
                    let closestSec = null;
                    let minDist = 999;
                    for (const knownSec of KNOWN_TOP_SECTIONS) {
                        const d = levenshtein(secName.toLowerCase(), knownSec.toLowerCase());
                        if (d < minDist) {
                            minDist = d;
                            closestSec = knownSec;
                        }
                    }
                    if (minDist <= 3) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(secName) + 1,
                            `「${secName}」という設定カテゴリはありません（「${closestSec}」のスペルミスではありませんか？）`,
                            `カテゴリ名を「${closestSec}」に書き直してください`,
                            'error',
                            rawLine
                        ));
                    }
                }
                currentSection = secName;
                continue;
            }

            // 代入記号イコールの誤用 (speed = 5)
            const assignMatch = clean.match(/^([^\s:{}]+)\s*=\s*(.+)$/);
            if (assignMatch && !clean.startsWith('const ') && !clean.startsWith('let ') && !clean.startsWith('var ')) {
                issues.push(createIssue(
                    i + 1,
                    rawLine.indexOf('=') + 1,
                    `オブジェクトの設定では「 = 」ではなく「 : 」（コロン）を使います`,
                    `「 ${assignMatch[1]}: ${assignMatch[2]} 」のようにコロンに書き直してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // コロン抜け (speed 5)
            const missingColonMatch = clean.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([0-9"'{[a-zA-Z#-])/);
            if (missingColonMatch && !clean.startsWith('return ') && !clean.startsWith('const ') && !clean.startsWith('let ') && !clean.startsWith('var ')) {
                issues.push(createIssue(
                    i + 1,
                    rawLine.indexOf(missingColonMatch[1]) + missingColonMatch[1].length + 1,
                    `項目名「${missingColonMatch[1]}」の後にコロン（:）がありません`,
                    `「${missingColonMatch[1]}: 」のようにコロンを付けて値を指定してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // 値の抜け (speed: , または difficulty: のようにコロンの後に値がない)
            if (/^[^\s:{}]+?\s*:\s*[,;]?\s*$/.test(clean)) {
                issues.push(createIssue(
                    i + 1,
                    rawLine.indexOf(':') + 1,
                    `設定値が入力されていません（コロンの後に値がありません）`,
                    `コロンの後に数値や文字列（"..."）などの設定値を入力してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // カラーコードのクォート忘れ (color: #00FF66 または配列内の #FFFF00)
            const unquotedHexProp = clean.match(/^[^\s:{}]+?\s*:\s*(#[0-9a-fA-F]{3,8})\b/);
            const unquotedHexElem = clean.match(/^(#[0-9a-fA-F]{3,8})\s*,?$/);
            if (unquotedHexProp || unquotedHexElem) {
                const hex = (unquotedHexProp || unquotedHexElem)[1];
                issues.push(createIssue(
                    i + 1,
                    rawLine.indexOf(hex) + 1,
                    `カラーコード「${hex}」がダブルクォート（" "）で囲まれていません`,
                    `色のコードは「 "${hex}" 」のように半角の「 " 」で囲んで指定してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // プロパティキーの検知と値チェック (例: maxBullets: 8, colおr: "#FFFF00")
            const propMatch = clean.match(/^([^\s:{}]+)\s*:\s*(.+?)\s*([,;]?)$/);
            if (propMatch && currentSection && KNOWN_CONFIG_SCHEMA[currentSection]) {
                const key = propMatch[1];
                const rawVal = propMatch[2].replace(/,\s*$/, '').trim();
                const knownKeys = KNOWN_CONFIG_SCHEMA[currentSection];

                if (!knownKeys.includes(key)) {
                    let closest = null;
                    let minDistance = 999;
                    for (const known of knownKeys) {
                        const dist = levenshtein(key.toLowerCase(), known.toLowerCase());
                        if (dist < minDistance) {
                            minDistance = dist;
                            closest = known;
                        }
                    }

                    const isChanged = changedLines && changedLines.has(i + 1);
                    if (closest && minDistance <= 3) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(key) + 1,
                            `「${key}」という設定項目はありません（「${closest}」のスペルミスではありませんか？）`,
                            `「${currentSection}」には「${closest}」を指定してください（例: ${closest}: ...）`,
                            'error',
                            rawLine,
                            isChanged
                        ));
                    } else {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(key) + 1,
                            `「${currentSection}」設定に「${key}」という項目はありません`,
                            `有効な設定項目は ${knownKeys.map(k => `「${k}」`).join('、')} です`,
                            'error',
                            rawLine,
                            isChanged
                        ));
                    }
                }

                // 値の未クォート単語・スペルミス判定 (例: difficulty: normal, enabled: ture, background: space-bg)
                if (rawVal && !rawVal.startsWith('{') && !rawVal.startsWith('[')) {
                    const isQuoted = (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
                                     (rawVal.startsWith("'") && rawVal.endsWith("'")) ||
                                     (rawVal.startsWith('`') && rawVal.endsWith('`'));
                    const isNumber = /^-?\d+(\.\d+)?$/.test(rawVal);
                    const isBoolean = rawVal === 'true' || rawVal === 'false';
                    const isNullOrUndefined = rawVal === 'null' || rawVal === 'undefined';

                    if (!isQuoted && !isNumber && !isBoolean && !isNullOrUndefined) {
                        // true / false のスペルミスかチェック
                        const distTrue = levenshtein(rawVal.toLowerCase(), 'true');
                        const distFalse = levenshtein(rawVal.toLowerCase(), 'false');
                        if (distTrue <= 2 && rawVal !== 'true') {
                            issues.push(createIssue(
                                i + 1,
                                rawLine.lastIndexOf(rawVal) + 1,
                                `設定値「${rawVal}」は使えません（「true」のスペルミスではありませんか？）`,
                                `ONにする場合は半角小文字で「 true 」、OFFにする場合は「 false 」と入力してください`,
                                'error',
                                rawLine
                            ));
                        } else if (distFalse <= 2 && rawVal !== 'false') {
                            issues.push(createIssue(
                                i + 1,
                                rawLine.lastIndexOf(rawVal) + 1,
                                `設定値「${rawVal}」は使えません（「false」のスペルミスではありませんか？）`,
                                `OFFにする場合は半角小文字で「 false 」、ONにする場合は「 true 」と入力してください`,
                                'error',
                                rawLine
                            ));
                        } else if (/^[a-zA-Z0-9_$-]+$/.test(rawVal)) {
                            issues.push(createIssue(
                                i + 1,
                                rawLine.lastIndexOf(rawVal) + 1,
                                `文字の設定値「${rawVal}」がダブルクォート（" "）で囲まれていません`,
                                `文字を指定するときは「 "${rawVal}" 」のように半角の「 " 」で囲んでください`,
                                'error',
                                rawLine
                            ));
                        }
                    }
                }
            }

            // カンマ抜けチェック（次の有効行との関係を検査）
            let nextIndex = -1;
            for (let j = i + 1; j < lines.length; j++) {
                if (cleanLines[j]) {
                    nextIndex = j;
                    break;
                }
            }

            if (nextIndex !== -1) {
                const nextClean = cleanLines[nextIndex];
                const lastChar = clean.slice(-1);
                const nextIsProperty = /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/.test(nextClean);
                const nextIsArrayItem = /^(".*"|'.*'|-?\d+(\.\d+)?)\s*,?$/.test(nextClean);

                // 1) プロパティ行の後ろに別のプロパティ行が続くのにカンマがない
                const isPropertyLine = /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*.+$/.test(clean);
                if (isPropertyLine && lastChar !== ',' && lastChar !== '{' && lastChar !== '[' && lastChar !== '(') {
                    if (nextIsProperty) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.length,
                            `行末のカンマ（,）が抜けています`,
                            `この行の末尾に「 , 」を追加してください（次の項目と区切るためにカンマが必要です）`,
                            'error',
                            rawLine
                        ));
                    }
                }

                // 2) オブジェクト閉じ「}」または配列閉じ「]」の後ろに次のプロパティが続くのにカンマがない
                if ((clean === '}' || clean === ']') && nextIsProperty) {
                    issues.push(createIssue(
                        i + 1,
                        rawLine.length,
                        `閉じ括弧「 ${clean} 」の後ろにカンマ（,）が抜けています`,
                        `「 ${clean}, 」のようにカンマを付けて、次の設定項目と区切ってください`,
                        'error',
                        rawLine
                    ));
                }

                // 3) 配列要素（文字列や数値）の後ろに次の配列要素が続くのにカンマがない
                const isArrayItemLine = /^(".*"|'.*'|-?\d+(\.\d+)?)$/.test(clean);
                if (isArrayItemLine && nextIsArrayItem) {
                    issues.push(createIssue(
                        i + 1,
                        rawLine.length,
                        `配列データの行末にカンマ（,）が抜けています`,
                        `この行の末尾に「 , 」を追加してください（データを並べるにはカンマで区切る必要があります）`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        return issues;
    }

    /**
     * コード断片の未閉じ括弧を自動補完する文字列を返す（行番号特定用）
     */
    function getAutoCloseBrackets(code) {
        const stack = [];
        let inBlockComment = false;
        let inString = null;

        for (let i = 0; i < code.length; i++) {
            const ch = code[i];
            const next = code[i + 1];

            if (inBlockComment) {
                if (ch === '*' && next === '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }
            if (inString) {
                if (ch === '\\') {
                    i++;
                } else if (ch === inString) {
                    inString = null;
                }
                continue;
            }
            if (ch === '/' && next === '/') {
                while (i < code.length && code[i] !== '\n') i++;
                continue;
            }
            if (ch === '/' && next === '*') {
                inBlockComment = true;
                i++;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                inString = ch;
                continue;
            }
            if (ch === '{') stack.push('}');
            else if (ch === '[') stack.push(']');
            else if (ch === '(') stack.push(')');
            else if (ch === '}' || ch === ']' || ch === ')') {
                if (stack.length > 0 && stack[stack.length - 1] === ch) {
                    stack.pop();
                }
            }
        }
        return stack.reverse().join('');
    }

    /**
     * 5. JS構文解析＆正確なエラー行特定
     */
    function checkJavaScriptNativeSyntax(code, changedLines, isConfig) {
        try {
            new Function(code);
        } catch (err) {
            const rawMsg = err.message || '';
            const lines = code.split('\n');

            let userMessage = 'JavaScriptの構文エラーがあります';
            let userHint = '直前の行のカンマ（,）や括弧の閉じ忘れを確認してください';

            if (rawMsg.includes('Unexpected token')) {
                if (rawMsg.includes("','")) {
                    userMessage = '不要なカンマ（,）があるか、記号の使い方が間違っています';
                    userHint = '余分なカンマを消すか、カンマの前の値を確認してください';
                } else if (rawMsg.includes("'}'")) {
                    userMessage = '波括弧「 } 」の位置が不正か、直前の行に値がありません';
                    userHint = '直前の行でコロンの後に値が抜けているか、余分な閉じ括弧がないか確認してください';
                } else if (rawMsg.includes("']'")) {
                    userMessage = '角括弧「 ] 」の位置が不正です';
                    userHint = '配列内のカンマや閉じ括弧の位置を確認してください';
                } else if (rawMsg.includes("':'")) {
                    userMessage = 'コロン（:）の位置が不正です';
                    userHint = '前の行のカンマ抜けや、波括弧「 { } 」の閉じ忘れがないか確認してください';
                } else {
                    userMessage = `記号または単語の使い方が不正です（${rawMsg}）`;
                    userHint = '綴りミスや記号の位置を確認してください';
                }
            } else if (rawMsg.includes('Unexpected identifier')) {
                userMessage = 'カンマ（,）が抜けているか、文字が「" "」で囲まれていません';
                userHint = '前の行の末尾にカンマ「 , 」があるか、または文字列を「 " " 」で囲んでいるか確認してください';
            } else if (rawMsg.includes('Unexpected number')) {
                userMessage = '数値の位置が不正です';
                userHint = '前の行の末尾にカンマ「 , 」があるか、数値の前にコロン「 : 」があるか確認してください';
            } else if (rawMsg.includes('Unexpected string')) {
                userMessage = '文字列の位置が不正です（前の行のカンマ抜けの可能性があります）';
                userHint = '直前の行の末尾にカンマ「 , 」が抜けていないか確認してください';
            } else if (rawMsg.includes('Unexpected end of input')) {
                userMessage = 'コードが途中で終わっています（括弧やクォートが閉じられていません）';
                userHint = 'ファイル全体の「 { } 」「 [ ] 」のペアがすべて閉じているか確認してください';
            } else if (rawMsg.includes('Invalid or unexpected token') || rawMsg.includes('Private field')) {
                userMessage = '使えない記号があるか、カラーコード等が「" "」で囲まれていません';
                userHint = '色コード（"#00FF66" など）を「 " " 」で囲んでいるか、全角文字がないか確認してください';
            }

            let errorLine = findSyntaxErrorLine(lines);
            if (changedLines && changedLines.size > 0) {
                for (const line of changedLines) {
                    if (Math.abs(line - errorLine) <= 2) {
                        errorLine = line;
                        userHint += `（あなたが編集した 行 ${line} 付近を確認してください）`;
                        break;
                    }
                }
            }

            return [createIssue(
                errorLine,
                1,
                userMessage,
                userHint,
                'error',
                lines[errorLine - 1] || '',
                changedLines ? changedLines.has(errorLine) : false
            )];
        }

        // config.js の場合は実際に評価して ReferenceError（未定義の単語・クォート忘れ等）も捕捉する
        if (isConfig) {
            try {
                const cfg = new Function(code + '\n; return typeof GameConfig !== "undefined" ? GameConfig : null;')();
                if (!cfg || typeof cfg !== 'object') {
                    return [createIssue(
                        1,
                        1,
                        'GameConfig の定義が見つかりません',
                        '「const GameConfig = { ... };」の名前を消していないか確認してください',
                        'error',
                        lines[0] || '',
                        false
                    )];
                }
            } catch (runtimeErr) {
                const msg = runtimeErr.message || '';
                const lines = code.split('\n');
                const notDefinedMatch = msg.match(/^(.+?) is not defined$/);
                if (notDefinedMatch) {
                    const badWord = notDefinedMatch[1];
                    let foundLine = 1;
                    const wordRegex = new RegExp(`\\b${badWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                    for (let i = 0; i < lines.length; i++) {
                        const clean = stripLineComment(lines[i]);
                        if (wordRegex.test(clean)) {
                            foundLine = i + 1;
                            break;
                        }
                    }
                    return [createIssue(
                        foundLine,
                        1,
                        `「${badWord}」という設定値はそのままでは使えません`,
                        `文字列なら「 "${badWord}" 」のように半角の「 " 」で囲み、ON/OFFなら「 true 」「 false 」と入力してください`,
                        'error',
                        lines[foundLine - 1] || '',
                        changedLines ? changedLines.has(foundLine) : false
                    )];
                }
            }
        }

        return [];
    }

    function findSyntaxErrorLine(lines) {
        for (let i = 1; i <= lines.length; i++) {
            const rawLine = lines[i - 1];
            const trimmed = stripLineComment(rawLine).trim();
            // 空行や次行へ続く演算子末尾の行はスキップ
            if (!trimmed || /[+\-*/&|=?:,(.$]$/.test(trimmed)) continue;

            const subCode = lines.slice(0, i).join('\n');
            const autoClose = getAutoCloseBrackets(subCode);
            try {
                new Function(subCode + '\n' + autoClose);
            } catch (e) {
                const msg = e.message || '';
                if (!msg.includes('Unexpected end of input') &&
                    !msg.includes('Missing catch or finally after try')) {
                    // カンマ抜け等で「次の行の先頭」でエラーが出た場合、直前の行に原因があることが多い
                    if (i > 1 && (msg.includes('Unexpected identifier') || msg.includes('Unexpected string') || msg.includes('Unexpected number'))) {
                        const prevClean = stripLineComment(lines[i - 2]).trim();
                        if (prevClean && !prevClean.endsWith(',') && !prevClean.endsWith('{') && !prevClean.endsWith('[') && !prevClean.endsWith(';') && !prevClean.endsWith('(')) {
                            return i - 1;
                        }
                    }
                    return i;
                }
            }
        }
        return lines.length;
    }

    /**
     * 6. CSS (style.css) チェック
     */
    function checkCSS(code) {
        const issues = [];
        const lines = code.split('\n');
        let inBlockComment = false;
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            let line = rawLine;

            if (inBlockComment) {
                const closeIdx = line.indexOf('*/');
                if (closeIdx !== -1) {
                    inBlockComment = false;
                    line = line.substring(closeIdx + 2);
                } else {
                    continue;
                }
            }
            while (true) {
                const openIdx = line.indexOf('/*');
                if (openIdx === -1) break;
                const closeIdx = line.indexOf('*/', openIdx + 2);
                if (closeIdx !== -1) {
                    line = line.substring(0, openIdx) + line.substring(closeIdx + 2);
                } else {
                    inBlockComment = true;
                    line = line.substring(0, openIdx);
                    break;
                }
            }

            const trimmed = line.trim();
            if (!trimmed) continue;

            const hasOpenBrace = trimmed.includes('{');
            const hasCloseBrace = trimmed.includes('}');

            if (!hasOpenBrace && !hasCloseBrace && braceDepth > 0) {
                // ルール内部のプロパティ行
                if (trimmed.includes(':')) {
                    const colonIdx = trimmed.indexOf(':');
                    const valPart = trimmed.substring(colonIdx + 1).replace(/;/g, '').trim();
                    if (!valPart) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(':') + 1,
                            `CSSのプロパティ値が入力されていません`,
                            `コロン（:）の後に色やサイズなどの値を入力してください（例: color: #ffffff;）`,
                            'error',
                            rawLine
                        ));
                    } else if (!trimmed.endsWith(';') && !trimmed.endsWith(',')) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.length,
                            `CSSプロパティ末尾のセミコロン（;）が抜けています`,
                            `行末に「 ; 」を追加してください（例: color: red;）`,
                            'error',
                            rawLine
                        ));
                    }
                } else if (/^[a-zA-Z-]+\s+[^,{]+$/.test(trimmed)) {
                    issues.push(createIssue(
                        i + 1,
                        rawLine.indexOf(trimmed) + 1,
                        `CSSのプロパティ名と値の間にコロン（:）がありません`,
                        `「 プロパティ名: 値; 」のようにコロン（:）で区切ってください`,
                        'error',
                        rawLine
                    ));
                }
            }

            for (let c = 0; c < trimmed.length; c++) {
                if (trimmed[c] === '{') braceDepth++;
                else if (trimmed[c] === '}') braceDepth = Math.max(0, braceDepth - 1);
            }
        }

        return issues;
    }

    /**
     * 7. HTML (index.html) チェック（タグ対応・属性クォート・未閉じ山括弧・インラインScript）
     */
    function checkHTML(code, changedLines) {
        const issues = [];
        const lines = code.split('\n');

        let inComment = false;
        let inScript = false;
        let inStyle = false;
        let scriptLines = [];
        let scriptStartLine = 0;
        const tagStack = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            let line = rawLine;

            // コメント処理 (<!-- ... -->)
            if (inComment) {
                const closeIdx = line.indexOf('-->');
                if (closeIdx !== -1) {
                    inComment = false;
                    line = line.substring(closeIdx + 3);
                } else {
                    continue;
                }
            }
            while (true) {
                const openIdx = line.indexOf('<!--');
                if (openIdx === -1) break;
                const closeIdx = line.indexOf('-->', openIdx + 4);
                if (closeIdx !== -1) {
                    line = line.substring(0, openIdx) + line.substring(closeIdx + 3);
                } else {
                    inComment = true;
                    line = line.substring(0, openIdx);
                    break;
                }
            }

            // <script> 内の収集と終了チェック
            if (inScript) {
                const closeMatch = line.match(/<\/script\s*>/i);
                if (closeMatch) {
                    inScript = false;
                    if (scriptLines.length > 0) {
                        const scriptCode = scriptLines.join('\n');
                        const jsIssues = checkJavaScriptNativeSyntax(scriptCode, null, false);
                        jsIssues.forEach(item => {
                            issues.push(createIssue(
                                scriptStartLine + item.line,
                                item.col,
                                `<script>内のエラー: ${item.message}`,
                                item.hint,
                                'error',
                                lines[scriptStartLine + item.line - 1] || ''
                            ));
                        });
                        scriptLines = [];
                    }
                    const top = tagStack.length > 0 && tagStack[tagStack.length - 1].tag === 'script' ? tagStack.pop() : null;
                    line = line.substring(closeMatch.index + closeMatch[0].length);
                } else {
                    scriptLines.push(rawLine);
                    continue;
                }
            }

            // <style> 内のスキップと終了チェック
            if (inStyle) {
                const closeMatch = line.match(/<\/style\s*>/i);
                if (closeMatch) {
                    inStyle = false;
                    if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === 'style') {
                        tagStack.pop();
                    }
                    line = line.substring(closeMatch.index + closeMatch[0].length);
                } else {
                    continue;
                }
            }

            // 行内のタグと属性クォートを走査
            let pos = 0;
            while (pos < line.length) {
                const ltIdx = line.indexOf('<', pos);
                if (ltIdx === -1) break;

                // '<' から '>' までを探す（クォート内を考慮）
                let gtIdx = -1;
                let quoteChar = null;
                let quoteStartCol = 0;
                for (let k = ltIdx + 1; k < line.length; k++) {
                    const ch = line[k];
                    if (quoteChar) {
                        if (ch === quoteChar) quoteChar = null;
                    } else {
                        if (ch === '"' || ch === "'") {
                            quoteChar = ch;
                            quoteStartCol = k + 1;
                        } else if (ch === '>') {
                            gtIdx = k;
                            break;
                        } else if (ch === '<') {
                            break;
                        }
                    }
                }

                if (quoteChar) {
                    issues.push(createIssue(
                        i + 1,
                        quoteStartCol,
                        `HTMLタグ内の属性を囲む「 ${quoteChar} 」が閉じていません`,
                        `属性値の最後に「 ${quoteChar} 」と「 > 」があるか確認してください`,
                        'error',
                        rawLine
                    ));
                    break;
                }

                if (gtIdx === -1) {
                    issues.push(createIssue(
                        i + 1,
                        ltIdx + 1,
                        `HTMLタグの「 < 」に対応する閉じ「 > 」がありません`,
                        `タグの最後に「 > 」を追加してください`,
                        'error',
                        rawLine
                    ));
                    break;
                }

                const tagContent = line.substring(ltIdx + 1, gtIdx).trim();
                pos = gtIdx + 1;

                if (!tagContent || tagContent.startsWith('!')) continue; // <!DOCTYPE html> 等

                const isClosing = tagContent.startsWith('/');
                const isSelfClosing = tagContent.endsWith('/');
                const nameMatch = tagContent.replace(/^\//, '').match(/^([a-zA-Z0-9-]+)/);
                if (!nameMatch) continue;

                const tagName = nameMatch[1].toLowerCase();
                if (VOID_HTML_TAGS.has(tagName) || isSelfClosing) continue;

                if (!isClosing) {
                    tagStack.push({ tag: tagName, line: i + 1, col: ltIdx + 1, lineText: rawLine });
                    if (tagName === 'script') {
                        const hasSrc = /\bsrc\s*=/i.test(tagContent);
                        const restOfLine = line.substring(pos);
                        const sameLineClose = restOfLine.match(/<\/script\s*>/i);
                        if (sameLineClose) {
                            tagStack.pop();
                            pos += sameLineClose.index + sameLineClose[0].length;
                        } else {
                            inScript = true;
                            scriptLines = [];
                            scriptStartLine = i + 1;
                            if (hasSrc) {
                                // src付きの <script src="..."> で同じ行に </script> がない場合
                            }
                            break;
                        }
                    } else if (tagName === 'style') {
                        const restOfLine = line.substring(pos);
                        const sameLineClose = restOfLine.match(/<\/style\s*>/i);
                        if (sameLineClose) {
                            tagStack.pop();
                            pos += sameLineClose.index + sameLineClose[0].length;
                        } else {
                            inStyle = true;
                            break;
                        }
                    }
                } else {
                    if (tagStack.length === 0) {
                        issues.push(createIssue(
                            i + 1,
                            ltIdx + 1,
                            `対応する開始タグがない閉じタグ </${tagName}> があります`,
                            `<${tagName}> が消えていないか、または余分な </${tagName}> でないか確認してください`,
                            'error',
                            rawLine
                        ));
                    } else {
                        const top = tagStack[tagStack.length - 1];
                        if (top.tag === tagName) {
                            tagStack.pop();
                        } else {
                            // スタック内に一致する開始タグがあるか探す（途中のタグの閉じ忘れ）
                            let matchIdx = -1;
                            for (let s = tagStack.length - 1; s >= 0; s--) {
                                if (tagStack[s].tag === tagName) {
                                    matchIdx = s;
                                    break;
                                }
                            }
                            if (matchIdx !== -1) {
                                while (tagStack.length > matchIdx + 1) {
                                    const unclosed = tagStack.pop();
                                    issues.push(createIssue(
                                        unclosed.line,
                                        unclosed.col,
                                        `<${unclosed.tag}> タグが閉じられていません（</${unclosed.tag}> が抜けています）`,
                                        `行 ${unclosed.line} の <${unclosed.tag}> に対応する </${unclosed.tag}> を追加してください`,
                                        'error',
                                        unclosed.lineText
                                    ));
                                }
                                tagStack.pop();
                            } else {
                                issues.push(createIssue(
                                    i + 1,
                                    ltIdx + 1,
                                    `タグの対応が一致していません（<${top.tag}> に対して </${tagName}> で閉じています）`,
                                    `</${top.tag}> で閉じるか、タグ名を確認してください`,
                                    'error',
                                    rawLine
                                ));
                            }
                        }
                    }
                }
            }
        }

        while (tagStack.length > 0) {
            const unclosed = tagStack.pop();
            issues.push(createIssue(
                unclosed.line,
                unclosed.col,
                `<${unclosed.tag}> タグが正しく閉じられていません（</${unclosed.tag}> がありません）`,
                `行 ${unclosed.line} で開いた <${unclosed.tag}> に対応する </${unclosed.tag}> を追加してください`,
                'error',
                unclosed.lineText
            ));
        }

        return issues;
    }

    /**
     * 8. 未復元箇所 (TODO) の警告検知
     */
    function checkTodoWarnings(code) {
        const warnings = [];
        const lines = code.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('TODO')) {
                warnings.push(createIssue(
                    i + 1,
                    line.indexOf('TODO') + 1,
                    `未復元の箇所 (TODO) があります`,
                    `この行の設定値を確認して、指示に従って数値を入力してみましょう`,
                    'warning',
                    line
                ));
            }
        }

        return warnings;
    }

    /**
     * メイン診断関数
     * @param {string} filename ファイル名 (config.js, style.css, etc.)
     * @param {string} code コード文字列
     * @param {Object} options オプション { baselineCode, changedLines }
     * @returns {Array} 発見された問題の配列
     */
    function lint(filename, code, options) {
        if (!code || typeof code !== 'string') return [];

        options = options || {};
        let changedLines = options.changedLines;
        if (!changedLines && options.baselineCode) {
            changedLines = computeChangedLines(options.baselineCode, code);
        }

        let issues = [];

        // 1. 全角文字チェック（コメント・文字列・HTMLテキストを除外）
        issues = issues.concat(checkFullwidthCharacters(filename, code));

        // 2. クォート閉じ忘れチェック
        issues = issues.concat(checkUnclosedQuotes(filename, code));

        // 3. 括弧対応チェック
        issues = issues.concat(checkBracketPairs(filename, code));

        // 4. ファイルタイプ別チェック
        if (filename.endsWith('config.js')) {
            issues = issues.concat(checkConfigSchemaAndTraps(code, changedLines));
            if (issues.filter(i => i.severity === 'error').length === 0) {
                issues = issues.concat(checkJavaScriptNativeSyntax(code, changedLines, true));
            }
        } else if (filename.endsWith('.js')) {
            if (issues.filter(i => i.severity === 'error').length === 0) {
                issues = issues.concat(checkJavaScriptNativeSyntax(code, changedLines, false));
            }
        } else if (filename.endsWith('.css')) {
            issues = issues.concat(checkCSS(code));
        } else if (filename.endsWith('.html')) {
            issues = issues.concat(checkHTML(code, changedLines));
        }

        // 5. TODO警告（config.js の穴埋め箇所のみ対象）
        if (filename.endsWith('config.js')) {
            const warnings = checkTodoWarnings(code);
            issues = issues.concat(warnings);
        }

        // 差分行マーク付け
        if (changedLines && changedLines.size > 0) {
            for (const issue of issues) {
                if (changedLines.has(issue.line)) {
                    issue.isChangedByUser = true;
                }
            }
        }

        // 重複除外
        const seen = new Set();
        const unique = [];

        for (const item of issues) {
            const key = `${item.line}:${item.col}:${item.message}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            }
        }

        // ソート順：
        // 1. ユーザーが編集した行 (isChangedByUser) を最優先！
        // 2. エラー (severity === 'error') を警告より優先
        // 3. 行番号順
        unique.sort((a, b) => {
            if (a.isChangedByUser && !b.isChangedByUser) return -1;
            if (!a.isChangedByUser && b.isChangedByUser) return 1;

            if (a.severity === 'error' && b.severity !== 'error') return -1;
            if (a.severity !== 'error' && b.severity === 'error') return 1;

            if (a.line !== b.line) return a.line - b.line;
            return a.col - b.col;
        });

        return unique;
    }

    const Linter = {
        lint: lint,
        createIssue: createIssue,
        computeChangedLines: computeChangedLines
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Linter;
    } else {
        global.Linter = Linter;
    }

})(typeof window !== 'undefined' ? window : global);
