/**
 * ===============================================================
 * VS Code 準拠 スティッキースクロール (Sticky Scroll) エンジン
 * ===============================================================
 * スクロール位置に応じて、現在表示されているコードの親スコープ
 * （関数・クラス・設定セクション・配列・CSSルール・HTML構造タグなど）を
 * エディタ上部に最大5階層まで固定表示し、スコープ終端（閉じ括弧・閉じタグ）の
 * 到達に合わせて1ピクセル単位で滑らかに押し出しアニメーションを行います。
 */

(function () {
    'use strict';

    const EDITOR_LINE_HEIGHT = 22;
    const EDITOR_TOP_PADDING = 12;
    const MAX_STICKY_LINES = 5;

    // 1-indexed の行番号が現在の scrollTop で画面上のどのY座標(px)にあるかを返す
    // (エディタ上端を y = 0 とする座標系)
    function lineScreenY(line, scrollTop) {
        return EDITOR_TOP_PADDING + (line - 1) * EDITOR_LINE_HEIGHT - scrollTop;
    }

    // JSでノイズになりやすい短い制御構文かどうかを判定
    function isControlFlowHeader(trimmedLine) {
        return /^(?:\}\s*)?(?:if|else\s+if|else|for|while|do|switch|try|catch|finally)\b/.test(trimmedLine);
    }

    // ファイル全体を囲むだけの匿名IIFEラッパーかどうかを判定
    function isAnonymousIifeHeader(trimmedLine, startLine, endLine, totalLines) {
        if (startLine <= 12 && endLine >= totalLines - 12) {
            if (/^\(\s*function\s*\(\s*\)/.test(trimmedLine) || /^\(\s*\(\s*\)\s*=>/.test(trimmedLine)) {
                return true;
            }
        }
        return false;
    }

    // 配列スコープ `[` がスティッキー表示に値する名前付き定義（sprites.player: [ など）か判定
    function isMeaningfulArrayHeader(trimmedLine) {
        // 例: player: [, colors: [, const list = [
        return /^(?:(?:const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*|[a-zA-Z0-9_$]+\s*:\s*)\[/.test(trimmedLine);
    }

    /**
     * JS / CSS / JSON 用のブレース・ブラケット階層パーサー
     * - 文字列・テンプレートリテラル・コメント内の括弧を厳密に除外
     * - `{ ... }` に加え、`config.js` の `player: [` 等の複数行配列 `[ ... ]` も認識
     * - VS Code の Outline Model 同様、数行だけの短い if/for でチラつかないようフィルタリング
     */
    function parseBracedScopeTree(lines, type, lineOffset = 0) {
        const root = { children: [], startLine: 0, endLine: lines.length + lineOffset };
        const braceStack = []; // { scope, isSticky, openChar }
        let inBlockComment = false;
        const isCss = (type === 'css');

        function currentStickyParent() {
            for (let i = braceStack.length - 1; i >= 0; i--) {
                if (braceStack[i].isSticky && braceStack[i].scope) {
                    return braceStack[i].scope;
                }
            }
            return root;
        }

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();
            const lineNum = i + 1 + lineOffset;

            let inString = false;
            let stringChar = '';

            for (let c = 0; c < rawLine.length; c++) {
                const ch = rawLine[c];
                const next = rawLine[c + 1];

                if (inBlockComment) {
                    if (ch === '*' && next === '/') {
                        inBlockComment = false;
                        c++;
                    }
                    continue;
                }

                if (inString) {
                    if (ch === '\\') {
                        c++;
                        continue;
                    }
                    if (ch === stringChar) {
                        inString = false;
                    }
                    continue;
                }

                // 行コメント開始
                if (ch === '/' && next === '/') {
                    break;
                }

                // ブロックコメント開始
                if (ch === '/' && next === '*') {
                    inBlockComment = true;
                    c++;
                    continue;
                }

                // 文字列開始
                if (ch === '"' || ch === "'" || ch === '`') {
                    inString = true;
                    stringChar = ch;
                    continue;
                }

                if (ch === '{' || (!isCss && ch === '[')) {
                    const openChar = ch;
                    const expectedClose = (openChar === '{') ? '}' : ']';

                    // 同一行内で閉じる単一行ブロック（例: `muzzle: { col: 6, row: 0 }` や `scores: [30, 20]`）は
                    // 以降のループで同等の閉じ括弧により即座にポップされるため一旦スタックに積む
                    let headerLine = lineNum;
                    let headerText = rawLine;

                    // `{` 単体の行なら直前の有効行をヘッダーとして採用 (Allmanスタイル対応)
                    if (openChar === '{' && trimmed === '{' && i > 0) {
                        for (let p = i - 1; p >= Math.max(0, i - 3); p--) {
                            const prevTrimmed = lines[p].trim();
                            if (prevTrimmed.length > 0 && !prevTrimmed.startsWith('//') && !prevTrimmed.endsWith('*/')) {
                                headerLine = p + 1 + lineOffset;
                                headerText = lines[p];
                                break;
                            }
                        }
                    }

                    const canBeSticky = (openChar === '{') || isMeaningfulArrayHeader(trimmed);
                    const newScope = {
                        startLine: headerLine,
                        endLine: lines.length + lineOffset,
                        text: headerText,
                        trimmedHeader: headerText.trim(),
                        openChar: openChar,
                        children: [],
                        parent: currentStickyParent()
                    };

                    braceStack.push({
                        scope: newScope,
                        canBeSticky: canBeSticky,
                        isSticky: canBeSticky, // 閉じ括弧到達時に行数等で最終確定
                        expectedClose: expectedClose
                    });
                } else if (ch === '}' || (!isCss && ch === ']')) {
                    // 対応する開き括弧をスタックから探す
                    let matchIdx = -1;
                    for (let s = braceStack.length - 1; s >= 0; s--) {
                        if (braceStack[s].expectedClose === ch) {
                            matchIdx = s;
                            break;
                        }
                    }
                    if (matchIdx !== -1) {
                        // 途中に未閉じの異種括弧があればまとめてポップ
                        while (braceStack.length > matchIdx) {
                            const popped = braceStack.pop();
                            const sc = popped.scope;
                            sc.endLine = lineNum;

                            const span = sc.endLine - sc.startLine;
                            let keepSticky = popped.canBeSticky && (span >= 3);

                            if (keepSticky && !isCss) {
                                // ファイル全体を包むだけの匿名IIFEは除外（子スコープをルート直下に昇格）
                                if (isAnonymousIifeHeader(sc.trimmedHeader, sc.startLine - lineOffset, sc.endLine - lineOffset, lines.length)) {
                                    keepSticky = false;
                                } else if (isControlFlowHeader(sc.trimmedHeader)) {
                                    // 短い if / for / while 等でスティッキーヘッダーが激しくバタつくのを防止
                                    // 10行以上の大きな制御ブロックのみスティッキー対象にする
                                    if (span < 10) {
                                        keepSticky = false;
                                    }
                                }
                            }

                            if (keepSticky) {
                                // 子スコープの終端が親スコープを超えないようクランプ
                                for (let k = 0; k < sc.children.length; k++) {
                                    if (sc.children[k].endLine > sc.endLine) {
                                        sc.children[k].endLine = sc.endLine;
                                    }
                                }
                                sc.parent.children.push(sc);
                            } else {
                                // このスコープ自体はスティッキー表示しないが、内部の子スコープは親へ引き継ぐ
                                for (let k = 0; k < sc.children.length; k++) {
                                    sc.children[k].parent = sc.parent;
                                    if (sc.children[k].endLine > sc.endLine) {
                                        sc.children[k].endLine = sc.endLine;
                                    }
                                    sc.parent.children.push(sc.children[k]);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 編集中などで閉じ括弧が未入力のスコープもツリーに反映
        while (braceStack.length > 0) {
            const popped = braceStack.pop();
            const sc = popped.scope;
            sc.endLine = lines.length + lineOffset;
            const span = sc.endLine - sc.startLine;
            const isIife = !isCss && isAnonymousIifeHeader(sc.trimmedHeader, sc.startLine - lineOffset, sc.endLine - lineOffset, lines.length);
            const isShortCtrl = !isCss && isControlFlowHeader(sc.trimmedHeader) && span < 10;

            if (popped.canBeSticky && span >= 3 && !isIife && !isShortCtrl) {
                sc.parent.children.push(sc);
            } else {
                for (let k = 0; k < sc.children.length; k++) {
                    sc.children[k].parent = sc.parent;
                    sc.parent.children.push(sc.children[k]);
                }
            }
        }

        // startLine 順に整列し、同一行で `} else {` 等が繋がる場合の境界を最適化
        normalizeScopeChildren(root);
        return root;
    }

    function normalizeScopeChildren(node) {
        if (!node.children || node.children.length === 0) return;
        node.children.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            if (node.endLine && child.endLine > node.endLine) {
                child.endLine = node.endLine;
            }
            normalizeScopeChildren(child);
        }
    }

    /**
     * HTML 用のタグ階層パーサー
     * - 構造的コンテナ要素（html, body, header, main, section, div, form, ul, table, style, script 等）を追跡
     * - インライン装飾タグや数行の小要素を除外し、VS Code同様の安定した階層表示を実現
     * - <style> / <script> 内の CSS / JS スコープもシームレスに統合
     */
    const HTML_VOID_TAGS = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);

    // スティッキー表示の対象とするHTML構造タグ
    const HTML_STRUCTURAL_TAGS = new Set([
        'html', 'head', 'body', 'header', 'nav', 'main', 'section', 'article',
        'aside', 'footer', 'div', 'form', 'fieldset', 'ul', 'ol', 'dl',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'select', 'details',
        'dialog', 'template', 'figure', 'style', 'script', 'button', 'svg'
    ]);

    function parseHtmlScopeTree(lines) {
        const root = { children: [], startLine: 0, endLine: lines.length };
        const stack = [root];
        const fullText = lines.join('\n');

        // 各行の開始文字インデックスから行番号(1-indexed)を高速逆引き
        const lineOffsets = [0];
        for (let i = 0; i < lines.length; i++) {
            lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
        }

        function getLineFromIndex(idx) {
            let low = 0;
            let high = lines.length - 1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (lineOffsets[mid] <= idx && idx < lineOffsets[mid + 1]) {
                    return mid + 1;
                } else if (idx < lineOffsets[mid]) {
                    high = mid - 1;
                } else {
                    low = mid + 1;
                }
            }
            return lines.length;
        }

        // コメント、scriptブロック、styleブロック、通常のタグを一括トークン化
        const tokenRegex = /<!--[\s\S]*?-->|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>|<style\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/style\s*>|<(\/?)([a-zA-Z0-9\-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;
        let match;

        while ((match = tokenRegex.exec(fullText)) !== null) {
            const fullMatch = match[0];
            if (fullMatch.startsWith('<!--')) continue;

            // <script> または <style> ブロック全体
            if (/^<(?:script|style)\b/i.test(fullMatch)) {
                const isScript = /^<script\b/i.test(fullMatch);
                const openTagEnd = fullMatch.indexOf('>');
                const closeTagStart = fullMatch.lastIndexOf('</');
                if (openTagEnd !== -1 && closeTagStart > openTagEnd) {
                    const startLine = getLineFromIndex(match.index);
                    const endLine = getLineFromIndex(match.index + closeTagStart);
                    if (endLine - startLine >= 3) {
                        const parentScope = stack[stack.length - 1];
                        const tagScope = {
                             tagName: isScript ? 'script' : 'style',
                            startLine: startLine,
                            endLine: endLine,
                            text: lines[startLine - 1],
                            children: [],
                            parent: parentScope
                        };
                        // 内部のJS/CSSスコープを解析して子に追加
                        const innerLines = lines.slice(startLine, endLine - 1);
                        if (innerLines.length > 0) {
                            const innerTree = parseBracedScopeTree(innerLines, isScript ? 'js' : 'css', startLine);
                            for (const child of innerTree.children) {
                                child.parent = tagScope;
                                tagScope.children.push(child);
                            }
                        }
                        parentScope.children.push(tagScope);
                    }
                }
                continue;
            }

            const isClosing = match[1] === '/';
            const tagName = (match[2] || '').toLowerCase();
            const isSelfClosing = match[4] === '/' || HTML_VOID_TAGS.has(tagName);
            if (isSelfClosing) continue;

            const lineNum = getLineFromIndex(match.index);

            if (!isClosing) {
                const parentScope = stack[stack.length - 1];
                const newScope = {
                    tagName: tagName,
                    startLine: lineNum,
                    endLine: lines.length,
                    text: lines[lineNum - 1],
                    children: [],
                    parent: parentScope
                };
                stack.push(newScope);
            } else {
                // 対応する開きタグをスタックから探す
                let foundIdx = -1;
                for (let s = stack.length - 1; s >= 1; s--) {
                    if (stack[s].tagName === tagName) {
                        foundIdx = s;
                        break;
                    }
                }
                if (foundIdx !== -1) {
                    while (stack.length > foundIdx) {
                        const closedScope = stack.pop();
                        closedScope.endLine = lineNum;
                        const span = closedScope.endLine - closedScope.startLine;
                        const isStructural = HTML_STRUCTURAL_TAGS.has(closedScope.tagName);

                        if (isStructural && span >= 3) {
                            closedScope.parent.children.push(closedScope);
                        } else {
                            // 小さなタグやインライン要素は自身を表示せず、子要素があれば親へ引き継ぐ
                            for (let k = 0; k < closedScope.children.length; k++) {
                                closedScope.children[k].parent = closedScope.parent;
                                closedScope.parent.children.push(closedScope.children[k]);
                            }
                        }
                    }
                }
            }
        }

        // 未閉じタグの後処理
        while (stack.length > 1) {
            const unclosed = stack.pop();
            unclosed.endLine = lines.length;
            const span = unclosed.endLine - unclosed.startLine;
            if (HTML_STRUCTURAL_TAGS.has(unclosed.tagName) && span >= 3) {
                unclosed.parent.children.push(unclosed);
            } else {
                for (let k = 0; k < unclosed.children.length; k++) {
                    unclosed.children[k].parent = unclosed.parent;
                    unclosed.parent.children.push(unclosed.children[k]);
                }
            }
        }

        normalizeScopeChildren(root);
        return root;
    }

    /**
     * ファイル種別に応じたスコープツリーを構築
     */
    function parseScopeTree(text, type) {
        const lines = (text || '').split('\n');
        if (type === 'html') {
            return parseHtmlScopeTree(lines);
        }
        return parseBracedScopeTree(lines, type, 0);
    }

    /**
     * 現在の scrollTop におけるスティッキー階層と各行の正確な Y 座標を計算
     *
     * 【VS Code 準拠の物理モデル】
     * - スロット i の本来の固定 Y 位置は `slotTopY = stackBottomY` (通常 `i * 22` px)。
     * - スコープ `sc` は、開始行 `sc.startLine` が `slotTopY` より上 (`startY < slotTopY`) に
     *   スクロールされた瞬間にスロット i へ固定される。
     * - スコープ自身の終了行（閉じ括弧 `}` や閉じタグ `</...>` がある `sc.endLine`）の上端 `endY` が
     *   スロット i の下端 (`slotTopY + 22`) に到達すると、終了行がスティッキー行を下から物理的に押し上げる：
     *   `rowTopY = Math.min(slotTopY, endY - 22)`
     * - `endY <= slotTopY` になった時点でそのスコープは完全に押し出され、次の兄弟スコープへバトンタッチする。
     */
    function computeStickyHierarchy(root, scrollTop) {
        const hierarchy = [];
        let currentParent = root;
        let stackBottomY = 0;

        while (currentParent && currentParent.children && currentParent.children.length > 0 && hierarchy.length < MAX_STICKY_LINES) {
            const slotTopY = stackBottomY;
            const slotBottomY = slotTopY + EDITOR_LINE_HEIGHT;

            let activeScope = null;
            let rowTopY = slotTopY;
            let pushOffset = 0;

            for (let i = 0; i < currentParent.children.length; i++) {
                const sc = currentParent.children[i];
                if (sc.endLine <= sc.startLine) continue;

                const startY = lineScreenY(sc.startLine, scrollTop);

                // 開始行がまだスロット位置より上へスクロールされていない場合、
                // これ以降の兄弟スコープもすべて下にあるため探索終了
                if (startY >= slotTopY) {
                    break;
                }

                // スコープ自身の閉じ行（`}` や `</div>`）の上端 Y 座標
                const endY = lineScreenY(sc.endLine, scrollTop);

                // 閉じ行がすでにスロット上端を通過し終えている場合は、このスコープは完全に退出済み
                if (endY <= slotTopY) {
                    continue;
                }

                // 閉じ行がスロット領域 [slotTopY, slotBottomY] に入り込んでいる場合、その分だけ上に押し出す
                if (endY < slotBottomY) {
                    pushOffset = slotBottomY - endY;
                    rowTopY = endY - EDITOR_LINE_HEIGHT;
                } else {
                    pushOffset = 0;
                    rowTopY = slotTopY;
                }

                activeScope = sc;
                break;
            }

            if (!activeScope) {
                break;
            }

            const rowBottomY = rowTopY + EDITOR_LINE_HEIGHT;

            hierarchy.push({
                line: activeScope.startLine,
                endLine: activeScope.endLine,
                text: activeScope.text,
                top: rowTopY,
                bottom: rowBottomY,
                pushOffset: pushOffset
            });

            stackBottomY = rowBottomY;
            currentParent = activeScope;

            // 現在の行が押し出し中（スコープ終端の閉じ括弧がすぐ直下にある状態）なら子スコープはすでに退出済み
            if (pushOffset > 0) {
                break;
            }
        }

        return hierarchy;
    }

    /**
     * スティッキースクロール UI コントローラー
     */
    class StickyScrollController {
        constructor() {
            this.container = document.getElementById('editor-sticky-scroll-container');
            this.linesWrapper = document.getElementById('sticky-scroll-lines');
            this.codeTextarea = document.getElementById('code-textarea');
            this.scopeTree = null;
            this.fileType = 'js';
            this.fileKey = '';
            this.rawText = '';
            this.indentSize = 4;
            this.lastRenderedKey = '';
            this.highlightFn = null;
            this.indentGuideFn = null;
            this.jumpToLineFn = null;
            this.errorLineSet = null;
            this.warningLineSet = null;
            this.currentScrollLeft = 0;
            this.currentScrollTop = 0;
        }

        init(options) {
            this.highlightFn = options.highlightFn || ((code) => code);
            this.indentGuideFn = options.indentGuideFn || null;
            this.jumpToLineFn = options.jumpToLineFn || null;
            this.errorLineSet = options.errorLineSet || null;
            this.warningLineSet = options.warningLineSet || null;

            if (!this.container) {
                this.container = document.getElementById('editor-sticky-scroll-container');
            }
            if (!this.linesWrapper) {
                this.linesWrapper = document.getElementById('sticky-scroll-lines');
            }
            if (!this.codeTextarea) {
                this.codeTextarea = document.getElementById('code-textarea');
            }

            if (this.container && !this._eventsBound) {
                this._eventsBound = true;

                // 行クリックで該当スコープ定義行へ正確にジャンプ
                this.container.addEventListener('click', (e) => {
                    const row = e.target.closest('.sticky-line-row');
                    if (row && this.jumpToLineFn) {
                        const line = parseInt(row.getAttribute('data-line'), 10);
                        const idx = parseInt(row.getAttribute('data-sticky-index') || '0', 10);
                        if (line) {
                            this.jumpToLineFn(line, idx);
                        }
                    }
                });

                // スティッキーヘッダー上にマウスカーソルがある状態でのホイール/トラックパッドスクロールを
                // そのままエディタ本体へ転送し、スクロールが引っかからないようにする
                this.container.addEventListener('wheel', (e) => {
                    if (!this.codeTextarea) return;
                    e.preventDefault();
                    this.codeTextarea.scrollTop += e.deltaY;
                    this.codeTextarea.scrollLeft += e.deltaX;
                }, { passive: false });
            }
        }

        updateFile(fileKey, text, type) {
            this.fileKey = fileKey;
            this.fileType = type || 'js';
            this.rawText = text || '';
            this.scopeTree = parseScopeTree(this.rawText, this.fileType);
            this.lastRenderedKey = ''; // 強制再構築
        }

        updateScroll(scrollTop, scrollLeft) {
            if (!this.container || !this.linesWrapper || !this.scopeTree) return;

            this.currentScrollTop = scrollTop;
            this.currentScrollLeft = scrollLeft;

            if (scrollTop <= 0) {
                if (this.container.style.display !== 'none') {
                    this.container.style.display = 'none';
                    this.lastRenderedKey = '';
                }
                return;
            }

            const hierarchy = computeStickyHierarchy(this.scopeTree, scrollTop);

            if (hierarchy.length === 0) {
                if (this.container.style.display !== 'none') {
                    this.container.style.display = 'none';
                    this.lastRenderedKey = '';
                }
                return;
            }

            const totalHeight = Math.max(0, hierarchy[hierarchy.length - 1].bottom);
            if (totalHeight <= 0) {
                if (this.container.style.display !== 'none') {
                    this.container.style.display = 'none';
                    this.lastRenderedKey = '';
                }
                return;
            }

            if (this.container.style.display === 'none') {
                this.container.style.display = 'block';
            }

            this.renderStickyLines(hierarchy, totalHeight, scrollLeft);
        }

        renderStickyLines(hierarchy, totalHeight, scrollLeft) {
            // 階層構造（行番号・テキスト・エラー状態）が変化したときのみDOMを再生成
            const structKey = hierarchy.map((h, idx) => {
                const errFlag = (this.errorLineSet && this.errorLineSet.has(h.line)) ? 'E' :
                    ((this.warningLineSet && this.warningLineSet.has(h.line)) ? 'W' : '');
                return `${idx}:${h.line}:${errFlag}:${h.text}`;
            }).join('|');

            if (structKey !== this.lastRenderedKey) {
                this.lastRenderedKey = structKey;
                this.linesWrapper.innerHTML = '';

                hierarchy.forEach((item, idx) => {
                    const row = document.createElement('div');
                    row.className = 'sticky-line-row';
                    row.setAttribute('data-line', String(item.line));
                    row.setAttribute('data-sticky-index', String(idx));
                    row.title = `${item.line}行目へ移動`;

                    const numEl = document.createElement('div');
                    let numCls = 'sticky-line-num';
                    if (this.errorLineSet && this.errorLineSet.has(item.line)) {
                        numCls += ' has-error';
                    } else if (this.warningLineSet && this.warningLineSet.has(item.line)) {
                        numCls += ' has-warning';
                    }
                    numEl.className = numCls;
                    numEl.textContent = String(item.line);

                    const codeWrap = document.createElement('div');
                    codeWrap.className = 'sticky-line-code-wrap';

                    const codeEl = document.createElement('div');
                    codeEl.className = 'sticky-line-code';
                    let highlighted = this.highlightFn(item.text, this.fileType);
                    if (this.indentGuideFn) {
                        highlighted = this.indentGuideFn(highlighted, item.text, this.rawText);
                    }
                    codeEl.innerHTML = highlighted;

                    codeWrap.appendChild(codeEl);
                    row.appendChild(numEl);
                    row.appendChild(codeWrap);
                    this.linesWrapper.appendChild(row);
                });
            }

            // 各行の絶対Y座標・重なり順・横スクロール位置を1px単位で同期
            const rows = this.linesWrapper.children;
            for (let i = 0; i < hierarchy.length; i++) {
                const row = rows[i];
                const item = hierarchy[i];
                if (!row) continue;

                // 親スコープほど手前 (z-index大) に配置することで、
                // 子スコープが押し出される際に親スコープの背面へ滑らかに潜り込む
                row.style.top = `${item.top}px`;
                row.style.zIndex = `${30 - i}`;

                const codeEl = row.querySelector('.sticky-line-code');
                if (codeEl) {
                    codeEl.style.transform = `translateX(-${scrollLeft}px)`;
                }
            }

            this.container.style.height = `${totalHeight}px`;
            this.linesWrapper.style.height = `${totalHeight}px`;
        }
    }

    window.StickyScrollController = StickyScrollController;
})();
