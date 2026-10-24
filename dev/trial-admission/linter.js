/**
 * linter.js - 初心者向け - 構文エラー診断エンジン
 *　外部ライブラリ非依存で、ファイルを横断した即時の構文チェックに対応
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
        player: ['speed', 'color', 'lives', 'maxBullets', 'fireInterval', 'muzzle'],
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

    // 既知のHTMLタグ一覧（タグ名タイポ検知用）
    const KNOWN_HTML_TAGS = new Set([
        'html', 'head', 'body', 'title', 'meta', 'link', 'style', 'script', 'noscript', 'base',
        'header', 'footer', 'main', 'nav', 'section', 'article', 'aside', 'div', 'span', 'p',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'search', 'address', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'a', 'button', 'input', 'select', 'option', 'optgroup', 'textarea', 'label', 'form', 'fieldset', 'legend',
        'datalist', 'output', 'progress', 'meter',
        'canvas', 'img', 'Picture', 'picture', 'source', 'audio', 'video', 'track', 'iframe', 'embed', 'object', 'param',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
        'br', 'hr', 'pre', 'code', 'kbd', 'samp', 'var', 'blockquote', 'q', 'cite', 'abbr', 'dfn', 'time', 'data',
        'strong', 'em', 'b', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark', 'ins', 'del', 'ruby', 'rt', 'rp', 'bdi', 'bdo',
        'figure', 'figcaption', 'details', 'summary', 'dialog', 'template', 'slot', 'wbr', 'area', 'map',
        // SVG関連
        'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
        'defs', 'use', 'symbol', 'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient', 'stop', 'filter', 'feBlend', 'feColorMatrix', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'feOffset'
    ]);

    // よくあるHTML属性のスペルミスマップ
    const HTML_ATTR_TYPOS = {
        'calss': 'class', 'clas': 'class', 'classs': 'class', 'clss': 'class',
        'hrf': 'href', 'herf': 'href', 'hre': 'href',
        'scr': 'src', 'srcc': 'src', 'srs': 'src',
        'stlye': 'style', 'styel': 'style', 'syle': 'style',
        'tyep': 'type', 'tpye': 'type',
        'witdh': 'width', 'wdith': 'width', 'widht': 'width',
        'heigth': 'height', 'hieght': 'height', 'heigh': 'height',
        'tabindx': 'tabindex', 'tabinex': 'tabindex',
        'onclik': 'onclick', 'onlcick': 'onclick',
        'placholder': 'placeholder', 'placehoder': 'placeholder',
        ' disabeld': 'disabled', 'diabled': 'disabled',
        'chcked': 'checked', 'checekd': 'checked'
    };

    // 既知の代表的CSSプロパティ一覧（タイポ検知用）
    const KNOWN_CSS_PROPERTIES = new Set([
        // 配置・レイアウト
        'position', 'top', 'right', 'bottom', 'left', 'inset', 'z-index',
        'display', 'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap',
        'justify-content', 'align-items', 'align-content', 'align-self', 'justify-items', 'justify-self', 'gap', 'row-gap', 'column-gap', 'order',
        'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow', 'grid-auto-rows', 'grid-column', 'grid-column-end', 'grid-column-gap', 'grid-column-start',
        'grid-row', 'grid-row-end', 'grid-row-gap', 'grid-row-start', 'grid-template', 'grid-template-areas', 'grid-template-columns', 'grid-template-rows',
        // ボックスモデル・サイズ
        'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'aspect-ratio', 'box-sizing',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-inline', 'padding-block',
        'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap', 'overscroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y',
        'visibility', 'clip-path', 'float', 'clear',
        // 背景・境界線
        'background', 'background-color', 'background-image', 'background-position', 'background-position-x', 'background-position-y',
        'background-repeat', 'background-size', 'background-attachment', 'background-clip', 'background-origin',
        'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
        'border-width', 'border-style', 'border-color',
        'border-top-width', 'border-top-style', 'border-top-color',
        'border-right-width', 'border-right-style', 'border-right-color',
        'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
        'border-left-width', 'border-left-style', 'border-left-color',
        'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
        'border-collapse', 'border-spacing',
        'outline', 'outline-color', 'outline-style', 'outline-width', 'outline-offset',
        'box-shadow', 'box-decoration-break',
        // 文字・タイポグラフィ
        'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-display',
        'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-align-last',
        'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
        'text-transform', 'text-indent', 'text-shadow', 'text-overflow', 'white-space', 'word-break',
        // アニメーション・エフェクト・操作
        'opacity', 'transform', 'transform-origin', 'transform-style', 'perspective', 'perspective-origin',
        'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
        'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state',
        'cursor', 'pointer-events', 'user-select', 'touch-action', 'resize', 'appearance',
        'filter', 'backdrop-filter', 'content', 'quotes', 'tab-size', 'caret-color', 'accent-color',
        'will-change', 'isolation', 'image-rendering', 'object-fit', 'object-position',
        'table-layout', 'vertical-align', 'list-style', 'list-style-type', 'list-style-position', 'list-style-image',
        'word-wrap', 'line-break', 'hyphens', 'scrollbar-width', 'scrollbar-color',
        // SVG
        'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'fill-opacity'
    ]);

    // 代表的CSSプロパティの有効キーワード値（値タイポ検知用: position: relativ 等を捕捉）
    const CSS_PROPERTY_VALUE_KEYWORDS = {
        'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],
        'display': [
            'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid',
            'none', 'contents', 'table', 'table-row', 'table-cell', 'table-column', 'list-item', 'flow-root'
        ],
        'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
        'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
        'justify-content': [
            'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly',
            'start', 'end', 'left', 'right', 'normal', 'stretch'
        ],
        'align-items': [
            'stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'first', 'last',
            'start', 'end', 'self-start', 'self-end', 'normal'
        ],
        'align-content': [
            'stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly',
            'start', 'end', 'normal', 'baseline'
        ],
        'align-self': ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end', 'self-start', 'self-end'],
        'box-sizing': ['content-box', 'border-box'],
        'overflow': ['visible', 'hidden', 'scroll', 'auto', 'clip'],
        'overflow-x': ['visible', 'hidden', 'scroll', 'auto', 'clip'],
        'overflow-y': ['visible', 'hidden', 'scroll', 'auto', 'clip'],
        'visibility': ['visible', 'hidden', 'collapse'],
        'text-align': ['left', 'right', 'center', 'justify', 'start', 'end'],
        'text-transform': ['none', 'capitalize', 'uppercase', 'lowercase', 'full-width'],
        'font-style': ['normal', 'italic', 'oblique'],
        'pointer-events': ['auto', 'none', 'visiblePainted', 'visibleFill', 'visibleStroke', 'visible', 'painted', 'fill', 'stroke', 'all'],
        'user-select': ['auto', 'none', 'text', 'all', 'contain'],
        'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
        'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
        'word-break': ['normal', 'break-all', 'keep-all', 'break-word'],
        'cursor': [
            'auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress', 'wait',
            'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy', 'move', 'no-drop',
            'not-allowed', 'grab', 'grabbing', 'all-scroll', 'col-resize', 'row-resize',
            'n-resize', 'e-resize', 's-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize',
            'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'zoom-in', 'zoom-out'
        ],
        'image-rendering': ['auto', 'smooth', 'high-quality', 'crisp-edges', 'pixelated']
    };

    const CSS_GLOBAL_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

    // 有効なCSS単位一覧（10pxx などの単位ミス検知用）
    const VALID_CSS_UNITS = new Set([
        'px', 'em', 'rem', '%', 'vh', 'vw', 'vmin', 'vmax', 'dvh', 'dvw', 'svh', 'svw', 'lvh', 'lvw',
        's', 'ms', 'deg', 'rad', 'grad', 'turn', 'fr', 'ch', 'ex', 'cap', 'ic', 'lh', 'rlh',
        'pt', 'pc', 'in', 'cm', 'mm', 'q', 'dpi', 'dpcm', 'dppx', 'x'
    ]);

    // 有効なCSS擬似クラス・擬似要素（:hovr などのミス検知用）
    const VALID_CSS_PSEUDOS = new Set([
        'hover', 'active', 'focus', 'focus-visible', 'focus-within', 'visited', 'link', 'target',
        'disabled', 'enabled', 'checked', 'indeterminate', 'placeholder-shown', 'default',
        'valid', 'invalid', 'in-range', 'out-of-range', 'required', 'optional', 'read-only', 'read-write',
        'first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type', 'only-of-type',
        'nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type',
        'empty', 'root', ' scope', 'scope', 'not', 'is', 'where', 'has', 'lang', 'dir', 'fullscreen', 'modal',
        'before', 'after', 'first-letter', 'first-line', 'selection', 'placeholder', 'marker', 'backdrop',
        'webkit-scrollbar', 'webkit-scrollbar-thumb', 'webkit-scrollbar-track', 'webkit-scrollbar-corner'
    ]);

    // 代表的CSS色キーワード
    const VALID_CSS_COLOR_NAMES = new Set([
        'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'aqua', 'fuchsia',
        'gray', 'grey', 'silver', 'maroon', 'olive', 'lime', 'teal', 'navy', 'purple', 'orange',
        'pink', 'brown', 'coral', 'crimson', 'darkblue', 'darkcyan', 'darkgray', 'darkgreen', 'darkmagenta',
        'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue',
        'darkslategray', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dodgerblue',
        'firebrick', 'floralwhite', 'forestgreen', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'greenyellow',
        'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen',
        'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen',
        'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightsteelblue', 'lightyellow',
        'limegreen', 'linen', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
        'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
        'mistyrose', 'moccasin', 'navajowhite', 'oldlace', 'olivedrab', 'orangered', 'orchid', 'palegoldenrod',
        'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'plum', 'powderblue',
        'rebeccapurple', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
        'sienna', 'skyblue', 'slateblue', 'slategray', 'snow', 'springgreen', 'steelblue', 'tan', 'thistle',
        'tomato', 'turquoise', 'violet', 'wheat', 'whitesmoke', 'yellowgreen', 'transparent', 'currentcolor'
    ]);

    function findClosestInCollection(input, collection, maxDist) {
        const low = input.toLowerCase();
        let bestMatch = null;
        let minDistance = (maxDist !== undefined ? maxDist : 2) + 1;
        for (const item of collection) {
            const itemLow = item.toLowerCase();
            if (itemLow.startsWith(low) && Math.abs(itemLow.length - low.length) <= 3) return item;
            if (low.startsWith(itemLow) && Math.abs(itemLow.length - low.length) <= 3) return item;
            const dist = levenshtein(low, itemLow);
            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = item;
            }
        }
        return bestMatch;
    }

    function findClosestCssProperty(input) {
        return findClosestInCollection(input, KNOWN_CSS_PROPERTIES, 2);
    }

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
        const safeLine = Math.max(1, line || 1);
        const safeCol = Math.max(1, col || 1);
        const safeMsg = message || '構文エラーがあります';
        return {
            line: safeLine,
            col: safeCol,
            column: safeCol,
            title: safeMsg,
            message: safeMsg,
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
     * CSS色文字列として有効か判定するヘルパー
     */
    function isValidCssColorString(str) {
        if (!str || typeof str !== 'string') return false;
        const s = str.trim();
        if (s.startsWith('#')) {
            const hex = s.slice(1);
            return /^[0-9a-fA-F]+$/.test(hex) && (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8);
        }
        if (/^(rgba?|hsla?)\s*\([^)]+\)$/i.test(s)) return true;
        return VALID_CSS_COLOR_NAMES.has(s.toLowerCase());
    }

    /**
     * 4. config.js 固有の初心者ミス＆タイポ・設定値・実行時エラー検知
     * （差分行だけでなくファイル全体の構造・型・値域・スプライト整合性を常時検証）
     */
    function checkConfigSchemaAndTraps(code, changedLines) {
        const issues = [];
        const lines = code.split('\n');

        let currentSection = null;
        let currentSpriteKey = null;
        let spriteExpectedWidth = 0;
        let inBlockComment = false;
        let braceDepth = 0;
        let bracketDepth = 0;

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

        // 文字列外の括弧深度変化を数えるヘルパー
        function countStructuralDeltas(str) {
            let dBrace = 0;
            let dBracket = 0;
            let inStr = null;
            for (let k = 0; k < str.length; k++) {
                const ch = str[k];
                if (inStr) {
                    if (ch === '\\') k++;
                    else if (ch === inStr) inStr = null;
                    continue;
                }
                if (ch === '"' || ch === "'" || ch === '`') {
                    inStr = ch;
                    continue;
                }
                if (ch === '{') dBrace++;
                else if (ch === '}') dBrace--;
                else if (ch === '[') dBracket++;
                else if (ch === ']') dBracket--;
            }
            return { dBrace, dBracket };
        }

        // GameConfig 宣言自体のタイポ検知 (例: const GameConfg = {)
        let hasGameConfigDecl = false;
        for (let i = 0; i < cleanLines.length; i++) {
            const cl = cleanLines[i];
            if (!cl) continue;
            const declMatch = cl.match(/^(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/);
            if (declMatch) {
                if (declMatch[1] === 'GameConfig') {
                    hasGameConfigDecl = true;
                } else if (levenshtein(declMatch[1].toLowerCase(), 'gameconfig') <= 3) {
                    issues.push(createIssue(
                        i + 1,
                        lines[i].indexOf(declMatch[1]) + 1,
                        `設定オブジェクト名「${declMatch[1]}」が間違っています（「GameConfig」のスペルミス）`,
                        `ゲーム本体が読み込めるよう「const GameConfig = {」に修正してください`,
                        'error',
                        lines[i]
                    ));
                    hasGameConfigDecl = true;
                }
            } else if (/^(?:window\.)?GameConfig\s*=/.test(cl)) {
                hasGameConfigDecl = true;
            }
        }

        if (!hasGameConfigDecl && cleanLines.some(l => l.length > 0)) {
            issues.push(createIssue(
                1,
                1,
                `config.js 内に「GameConfig」の定義が見つかりません`,
                `先頭に「const GameConfig = {」があるか確認してください`,
                'error',
                lines[0] || ''
            ));
        }

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const clean = cleanLines[i];
            if (!clean) continue;

            const depthBefore = braceDepth;
            const bracketBefore = bracketDepth;
            const deltas = countStructuralDeltas(clean);

            // トップレベルセクション開始の検知 (braceDepth === 1 のときのみ: game: {, player: { 等)
            const sectionMatch = clean.match(/^([^\s:{}]+)\s*:\s*\{/);
            if (sectionMatch && depthBefore === 1) {
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
                    } else {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(secName) + 1,
                            `未知の設定カテゴリ「${secName}」です`,
                            `有効なカテゴリは ${KNOWN_TOP_SECTIONS.map(s => `「${s}」`).join('、')} です`,
                            'error',
                            rawLine
                        ));
                    }
                }
                currentSection = secName;
                currentSpriteKey = null;
                braceDepth += deltas.dBrace;
                bracketDepth += deltas.dBracket;
                continue;
            }

            // sprites セクション内の各スプライト配列開始検知 (player: [ 等)
            if (currentSection === 'sprites' && depthBefore === 2) {
                const spriteMatch = clean.match(/^([^\s:\[\]{}]+)\s*:\s*\[/);
                if (spriteMatch) {
                    currentSpriteKey = spriteMatch[1];
                    spriteExpectedWidth = 0;
                    if (!KNOWN_CONFIG_SCHEMA.sprites.includes(currentSpriteKey)) {
                        const closestSp = findClosestInCollection(currentSpriteKey, KNOWN_CONFIG_SCHEMA.sprites, 3);
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(currentSpriteKey) + 1,
                            `「${currentSpriteKey}」というキャラクター設定はありません${closestSp ? `（「${closestSp}」のスペルミスではありませんか？）` : ''}`,
                            `有効なキャラクター名は ${KNOWN_CONFIG_SCHEMA.sprites.map(s => `「${s}」`).join('、')} です`,
                            'error',
                            rawLine
                        ));
                    }
                }
            }

            // スプライト配列内のドット絵行チェック ("00011000" 等)
            if (currentSection === 'sprites' && currentSpriteKey && bracketBefore >= 1) {
                const rowStrMatch = clean.match(/^["']([^"']*)["']\s*,?$/);
                if (rowStrMatch) {
                    const rowStr = rowStrMatch[1];
                    if (!/^[01]+$/.test(rowStr)) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(rowStrMatch[0]) + 1,
                            `ドット絵（${currentSpriteKey}）のデータには半角の「0」と「1」だけを使えます`,
                            `「1」が色あり、「0」が透明です。他の文字やスペースが混ざっていないか確認してください`,
                            'error',
                            rawLine
                        ));
                    } else {
                        if (spriteExpectedWidth === 0) {
                            spriteExpectedWidth = rowStr.length;
                        } else if (rowStr.length !== spriteExpectedWidth) {
                            issues.push(createIssue(
                                i + 1,
                                rawLine.indexOf(rowStrMatch[0]) + 1,
                                `ドット絵（${currentSpriteKey}）の横の文字数（${rowStr.length}文字）が他の行（${spriteExpectedWidth}文字）と揃っていません`,
                                `すべての行の「0」「1」の数を ${spriteExpectedWidth} 文字に揃えてください`,
                                'error',
                                rawLine
                            ));
                        }
                    }
                }
            }

            // enemy.colors 配列内のカラーコード文字列検証
            if (currentSection === 'enemy' && bracketBefore >= 1) {
                const colorElemMatch = clean.match(/^["']([^"']*)["']\s*,?$/);
                if (colorElemMatch) {
                    const cVal = colorElemMatch[1];
                    if (!isValidCssColorString(cVal)) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.indexOf(colorElemMatch[0]) + 1,
                            `敵のカラーコード「"${cVal}"」の形式が正しくありません`,
                            `「"#FFFF00"」のように「#」＋6桁（または3桁）の16進数（0〜9, A〜F）で指定してください`,
                            'error',
                            rawLine
                        ));
                    }
                }
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
                braceDepth += deltas.dBrace;
                bracketDepth += deltas.dBracket;
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
                braceDepth += deltas.dBrace;
                bracketDepth += deltas.dBracket;
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
                braceDepth += deltas.dBrace;
                bracketDepth += deltas.dBracket;
                continue;
            }

            // カラーコードのクォート忘れ (color: #00FF66 または配列内の #FFFF00)
            const unquotedHexProp = clean.match(/^[^\s:{}]+?\s*:\s*(#[0-9a-zA-Z]{1,10})\b/);
            const unquotedHexElem = clean.match(/^(#[0-9a-zA-Z]{1,10})\s*,?$/);
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
                braceDepth += deltas.dBrace;
                bracketDepth += deltas.dBracket;
                continue;
            }

            // プロパティキーの検知と値チェック (depthBefore === 2 のセクション直下プロパティ)
            const propMatch = clean.match(/^([^\s:{}]+)\s*:\s*(.+?)\s*([,;]?)$/);
            if (propMatch && currentSection && KNOWN_CONFIG_SCHEMA[currentSection] && depthBefore === 2) {
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

                // 値の未クォート単語・スペルミス・型・範囲チェック
                if (rawVal && !rawVal.startsWith('{') && !rawVal.startsWith('[')) {
                    const isQuoted = (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
                        (rawVal.startsWith("'") && rawVal.endsWith("'")) ||
                        (rawVal.startsWith('`') && rawVal.endsWith('`'));
                    const isNumber = /^-?\d+(\.\d+)?$/.test(rawVal);
                    const isBoolean = rawVal === 'true' || rawVal === 'false';
                    const isNullOrUndefined = rawVal === 'null' || rawVal === 'undefined';

                    if (!isQuoted && !isNumber && !isBoolean && !isNullOrUndefined) {
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
                    } else if (isQuoted) {
                        const strVal = rawVal.slice(1, -1);
                        // 色プロパティの検証
                        if (key === 'color') {
                            if (!isValidCssColorString(strVal)) {
                                issues.push(createIssue(
                                    i + 1,
                                    rawLine.lastIndexOf(rawVal) + 1,
                                    `色コード「${rawVal}」の形式が正しくありません`,
                                    `「"#00FF66"」のように「#」＋6桁（または3桁）の16進数（0〜9, A〜F）で指定してください`,
                                    'error',
                                    rawLine
                                ));
                            }
                        } else if (currentSection === 'game' && key === 'difficulty') {
                            const validDiffs = ['easy', 'normal', 'hard'];
                            if (!validDiffs.includes(strVal)) {
                                issues.push(createIssue(
                                    i + 1,
                                    rawLine.lastIndexOf(rawVal) + 1,
                                    `難易度「${rawVal}」は無効な設定値です`,
                                    `"easy"、"normal"、"hard" のいずれかを指定してください`,
                                    'error',
                                    rawLine
                                ));
                            }
                        } else if (currentSection === 'display' && key === 'background') {
                            const validBgs = ['space-bg', 'space-nebula', 'black'];
                            if (!validBgs.includes(strVal)) {
                                issues.push(createIssue(
                                    i + 1,
                                    rawLine.lastIndexOf(rawVal) + 1,
                                    `背景設定「${rawVal}」は無効な名前です`,
                                    `"space-bg"（星空）、"space-nebula"（星雲）、"black"（黒単色）のいずれかを指定してください`,
                                    'error',
                                    rawLine
                                ));
                            }
                        }
                    } else if (isNumber) {
                        const numVal = Number(rawVal);
                        if (currentSection === 'bullet' && key === 'speed' && numVal > 0) {
                            issues.push(createIssue(
                                i + 1,
                                rawLine.lastIndexOf(rawVal) + 1,
                                `弾の速度（bullet.speed）がプラス（${rawVal}）になっているため、弾が上へ飛びません`,
                                `上方向へ発射するには「 -8 」のようにマイナス（-）の数値を指定してください`,
                                'warning',
                                rawLine
                            ));
                        } else if ((key === 'rows' || key === 'cols' || key === 'lives' || key === 'maxWaves') && numVal <= 0) {
                            issues.push(createIssue(
                                i + 1,
                                rawLine.lastIndexOf(rawVal) + 1,
                                `「${key}」には 1 以上の数値を指定してください（現在: ${rawVal}）`,
                                `0 以下の数値にするとゲームが正常に動作しません`,
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

            braceDepth = Math.max(0, braceDepth + deltas.dBrace);
            bracketDepth = Math.max(0, bracketDepth + deltas.dBracket);
            if (braceDepth < 2) {
                currentSection = null;
                currentSpriteKey = null;
            }
            if (bracketDepth === 0) {
                currentSpriteKey = null;
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
     * CSSのプロパティ値を検証するヘルパー（値キーワードのタイポ、不正なカラーコード、不正な単位を検出）
     */
    function validateCssPropertyValue(propName, valStr, lineNum, rawLine, issues) {
        if (!propName || !valStr) return;
        const lowProp = propName.toLowerCase();

        // !important を除去して評価
        const cleanVal = valStr.replace(/!important\s*$/i, '').trim();
        if (!cleanVal) return;

        // 1. カラーコード (#...) の検証
        const hexMatches = cleanVal.match(/#[0-9a-zA-Z]+/g);
        if (hexMatches) {
            for (const hexToken of hexMatches) {
                const digits = hexToken.slice(1);
                if (!/^[0-9a-fA-F]+$/.test(digits) || (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8)) {
                    issues.push(createIssue(
                        lineNum,
                        Math.max(1, rawLine.indexOf(hexToken) + 1),
                        `CSSカラーコード「${hexToken}」の形式が正しくありません`,
                        `「#ffffff」（6桁）または「#fff」（3桁）のように16進数（0〜9, a〜f）で指定してください`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        // 2. 数値＋単位の検証（文字列や #hex や関数名を除外）
        const withoutStringsAndHex = cleanVal
            .replace(/"[^"]*"|'[^']*'/g, '')
            .replace(/#[0-9a-zA-Z]+/g, '')
            .replace(/url\([^)]*\)/gi, '');
        const unitRegex = /(?:^|[\s,(+\-*/])(-?\d+(?:\.\d+)?)([a-zA-Z%]+)/g;
        let uMatch;
        while ((uMatch = unitRegex.exec(withoutStringsAndHex)) !== null) {
            const unit = uMatch[2].toLowerCase();
            // 2d / 3d などの識別子誤認を避けるため数値直後の単位のみ検査
            if (!VALID_CSS_UNITS.has(unit)) {
                const closestUnit = findClosestInCollection(unit, VALID_CSS_UNITS, 2);
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(uMatch[1] + uMatch[2]) + 1),
                    `CSSの単位「${uMatch[2]}」は正しくありません（${uMatch[1]}${uMatch[2]}）`,
                    closestUnit
                        ? `「${uMatch[1]}${closestUnit}」のスペルミスではありませんか？（px, %, em, rem, vh, vw, s など）`
                        : `有効な単位（px, %, em, rem, vh, vw, s, ms, deg など）を指定してください`,
                    'error',
                    rawLine
                ));
            }
        }

        // 3. 固定キーワード値を持つプロパティの値タイポ検証 (position: relativ, display: flx 等)
        const allowedKeywords = CSS_PROPERTY_VALUE_KEYWORDS[lowProp];
        if (allowedKeywords && !cleanVal.includes('(') && !cleanVal.startsWith('--')) {
            const valLow = cleanVal.toLowerCase();
            if (!CSS_GLOBAL_KEYWORDS.has(valLow) && !allowedKeywords.map(k => k.toLowerCase()).includes(valLow)) {
                const closestKw = findClosestInCollection(valLow, allowedKeywords, 3);
                const hint = closestKw
                    ? `「${closestKw}」のスペルミスではありませんか？（例: ${lowProp}: ${closestKw};）`
                    : `「${lowProp}」には ${allowedKeywords.slice(0, 6).map(k => `「${k}」`).join('、')} などを指定してください`;
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.lastIndexOf(cleanVal) + 1),
                    `CSSプロパティ「${lowProp}」の値「${cleanVal}」は正しくありません`,
                    hint,
                    'error',
                    rawLine
                ));
            }
        }
    }

    /**
     * 6. CSS (style.css / <style>) チェック
     * （プロパティ名タイポ・値タイポ・単位ミス・セミコロン抜け・中括弧抜け・擬似クラスタイポまで完全対応）
     */
    function checkCSS(code, lineOffset) {
        const offset = lineOffset || 0;
        const issues = [];
        const lines = code.split('\n');
        let inBlockComment = false;
        let braceDepth = 0;

        // コメントを除去した行配列を作成（コメント内の記号による誤判定を防止）
        const cleanLines = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (inBlockComment) {
                const closeIdx = line.indexOf('*/');
                if (closeIdx !== -1) {
                    inBlockComment = false;
                    line = ' '.repeat(closeIdx + 2) + line.substring(closeIdx + 2);
                } else {
                    cleanLines.push('');
                    continue;
                }
            }
            while (true) {
                const openIdx = line.indexOf('/*');
                if (openIdx === -1) break;
                const closeIdx = line.indexOf('*/', openIdx + 2);
                if (closeIdx !== -1) {
                    line = line.substring(0, openIdx) + ' '.repeat(closeIdx + 2 - openIdx) + line.substring(closeIdx + 2);
                } else {
                    inBlockComment = true;
                    line = line.substring(0, openIdx);
                    break;
                }
            }
            cleanLines.push(line);
        }

        // 単一宣言（prop: val）を検査する内部関数
        function checkSingleCssDeclaration(declText, lineIdx, rawLine, requireSemicolon) {
            const trimmed = declText.trim();
            if (!trimmed) return;
            if (!trimmed.includes(':')) {
                if (/^[a-zA-Z-]+\s+[^,{}]+$/.test(trimmed)) {
                    issues.push(createIssue(
                        offset + lineIdx + 1,
                        Math.max(1, rawLine.indexOf(trimmed) + 1),
                        `CSSのプロパティ名と値の間にコロン（:）がありません`,
                        `「 プロパティ名: 値; 」のようにコロン（:）で区切ってください`,
                        'error',
                        rawLine
                    ));
                }
                return;
            }
            const colonIdx = trimmed.indexOf(':');
            const propName = trimmed.substring(0, colonIdx).trim();
            const valPart = trimmed.substring(colonIdx + 1).replace(/;/g, '').trim();

            if (propName && !propName.startsWith('--') && !propName.startsWith('-')) {
                const lowProp = propName.toLowerCase();
                if (!KNOWN_CSS_PROPERTIES.has(lowProp)) {
                    const closest = findClosestCssProperty(lowProp);
                    const hint = closest
                        ? `「${closest}」のスペルミスではありませんか？（例: ${closest}: ...;）`
                        : `正しいCSSプロパティ名かスペルを確認してください`;
                    issues.push(createIssue(
                        offset + lineIdx + 1,
                        Math.max(1, rawLine.indexOf(propName) + 1),
                        `「${propName}」は未知のCSSプロパティ名です`,
                        hint,
                        'error',
                        rawLine
                    ));
                }
            }

            if (!valPart) {
                issues.push(createIssue(
                    offset + lineIdx + 1,
                    Math.max(1, rawLine.indexOf(':') + 1),
                    `CSSのプロパティ値が入力されていません`,
                    `コロン（:）の後に色やサイズなどの値を入力してください（例: color: #ffffff;）`,
                    'error',
                    rawLine
                ));
            } else {
                validateCssPropertyValue(propName, valPart, offset + lineIdx + 1, rawLine, issues);
            }

            if (requireSemicolon && !trimmed.endsWith(';')) {
                issues.push(createIssue(
                    offset + lineIdx + 1,
                    rawLine.length,
                    `CSSプロパティ末尾のセミコロン（;）が抜けています`,
                    `行末に「 ; 」を追加してください（例: ${propName}: ${valPart || '...'};）`,
                    'error',
                    rawLine
                ));
            }
        }

        // セレクタ部分の構文・擬似クラスタイポ検査
        function checkCssSelector(selectorText, lineIdx, rawLine) {
            const sel = selectorText.trim();
            if (!sel || sel.startsWith('@') || sel === 'from' || sel === 'to' || /^[\d.%\s,]+$/.test(sel)) return;

            if (sel.includes('..')) {
                issues.push(createIssue(
                    offset + lineIdx + 1,
                    Math.max(1, rawLine.indexOf('..') + 1),
                    `CSSセレクタにピリオドが2つ連続しています（..）`,
                    `クラス指定のピリオドは1つにしてください（例: .class-name）`,
                    'error',
                    rawLine
                ));
            }

            if (sel.endsWith(',')) {
                issues.push(createIssue(
                    offset + lineIdx + 1,
                    Math.max(1, rawLine.lastIndexOf(',') + 1),
                    `CSSセレクタの末尾に余分なカンマ（,）があります`,
                    `「 { 」の直前のカンマを削除するか、続くセレクタを入力してください`,
                    'error',
                    rawLine
                ));
            }

            // 擬似クラス・擬似要素のタイポ検知 (:hovr, :befor 等)
            const pseudoRegex = /::?([a-zA-Z-]+)(?:\([^)]*\))?/g;
            let pMatch;
            while ((pMatch = pseudoRegex.exec(sel)) !== null) {
                const pseudoName = pMatch[1].toLowerCase();
                if (pseudoName.startsWith('-webkit-') || pseudoName.startsWith('-moz-')) continue;
                if (!VALID_CSS_PSEUDOS.has(pseudoName)) {
                    const closestPseudo = findClosestInCollection(pseudoName, VALID_CSS_PSEUDOS, 2);
                    issues.push(createIssue(
                        offset + lineIdx + 1,
                        Math.max(1, rawLine.indexOf(pMatch[0]) + 1),
                        `CSSの擬似クラス「${pMatch[0]}」は正しくありません`,
                        closestPseudo
                            ? `「:${closestPseudo}」のスペルミスではありませんか？`
                            : `正しい擬似クラス名（:hover, :active, :focus など）を確認してください`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        // 構文解析
        let pendingProperty = null; // 複数行にわたるプロパティ宣言の追跡

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const clean = cleanLines[i].trim();

            if (!clean) continue;

            const hasOpenBrace = clean.includes('{');
            const hasCloseBrace = clean.includes('}');
            const depthBeforeLine = braceDepth;

            // 1行完結ルール（例: 0%, 49% { opacity: 1; } や .box { positio: relative; }）の検査
            if (hasOpenBrace && hasCloseBrace) {
                const openIdx = clean.indexOf('{');
                const closeIdx = clean.lastIndexOf('}');
                if (openIdx < closeIdx) {
                    const selPart = clean.substring(0, openIdx).trim();
                    const innerPart = clean.substring(openIdx + 1, closeIdx).trim();
                    if (selPart) checkCssSelector(selPart, i, rawLine);
                    if (innerPart && !innerPart.includes('{')) {
                        const decls = innerPart.split(';');
                        for (let d = 0; d < decls.length; d++) {
                            const decl = decls[d].trim();
                            if (!decl) continue;
                            checkSingleCssDeclaration(decl + ';', i, rawLine, false);
                        }
                    }
                }
            } else if (hasOpenBrace) {
                const openIdx = clean.indexOf('{');
                const selPart = clean.substring(0, openIdx).trim();
                if (selPart) checkCssSelector(selPart, i, rawLine);
            }

            // ブロック深度を更新
            for (let c = 0; c < clean.length; c++) {
                if (clean[c] === '{') braceDepth++;
                else if (clean[c] === '}') {
                    braceDepth = Math.max(0, braceDepth - 1);
                    if (pendingProperty) {
                        issues.push(createIssue(
                            offset + pendingProperty.line,
                            pendingProperty.col,
                            `CSSのプロパティ値が入力されていません`,
                            `コロン（:）の後に色やサイズなどの値を入力してください（例: color: #ffffff;）`,
                            'error',
                            lines[pendingProperty.line - 1]
                        ));
                        pendingProperty = null;
                    }
                }
            }

            // 中括弧「{」を書き忘れてブロック外にプロパティを書いた場合の検知
            if (!hasOpenBrace && !hasCloseBrace && depthBeforeLine === 0) {
                if (clean.endsWith(';') && clean.includes(':') && !clean.startsWith('@')) {
                    const colonIdx = clean.indexOf(':');
                    const propCandidate = clean.substring(0, colonIdx).trim();
                    if (/^[a-zA-Z-]+$/.test(propCandidate)) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.indexOf(propCandidate) + 1),
                            `CSSプロパティ「${propCandidate}」が波括弧「 { ... } 」の外に書かれています`,
                            `直前のセレクタ行の末尾に開き波括弧「 { 」が抜けていないか確認してください`,
                            'error',
                            rawLine
                        ));
                        checkSingleCssDeclaration(clean, i, rawLine, true);
                    }
                }
                continue;
            }

            if (!hasOpenBrace && !hasCloseBrace && braceDepth > 0) {
                if (pendingProperty) {
                    // 複数行プロパティの継続行
                    pendingProperty.valAccum += ' ' + clean;
                    if (clean.includes(';')) {
                        const finalVal = pendingProperty.valAccum.replace(/;/g, '').trim();
                        if (!finalVal) {
                            issues.push(createIssue(
                                offset + pendingProperty.line,
                                pendingProperty.col,
                                `CSSのプロパティ値が入力されていません`,
                                `コロン（:）の後に色やサイズなどの値を入力してください（例: color: #ffffff;）`,
                                'error',
                                lines[pendingProperty.line - 1]
                            ));
                        } else {
                            validateCssPropertyValue(pendingProperty.propName, finalVal, offset + pendingProperty.line, lines[pendingProperty.line - 1], issues);
                        }
                        pendingProperty = null;
                    } else if (clean.endsWith(',')) {
                        // 次の行へ継続
                    } else {
                        let nextHasValue = false;
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextClean = cleanLines[j].trim();
                            if (!nextClean) continue;
                            if (nextClean.includes('{') || nextClean.includes('}')) break;
                            if (nextClean.includes(':')) break;
                            nextHasValue = true;
                            break;
                        }
                        if (!nextHasValue) {
                            issues.push(createIssue(
                                offset + i + 1,
                                rawLine.length,
                                `CSSプロパティ末尾のセミコロン（;）が抜けています`,
                                `行末に「 ; 」を追加してください（例: color: red;）`,
                                'error',
                                rawLine
                            ));
                            pendingProperty = null;
                        }
                    }
                } else if (clean.includes(':')) {
                    const colonIdx = clean.indexOf(':');
                    const propName = clean.substring(0, colonIdx).trim();
                    const valPart = clean.substring(colonIdx + 1).replace(/;/g, '').trim();

                    // セレクタが閉じ括弧なしで次のセレクタに入った場合の検知 (例: .btn:hover { が来る前に前ブロックの } が抜けた)
                    if (propName.includes(' ') || propName.startsWith('.') || propName.startsWith('#')) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.indexOf(propName) + 1),
                            `直前のCSSブロックの閉じ波括弧「 } 」が抜けています`,
                            `新しいセレクタを書く前に「 } 」で前のブロックを閉じてください`,
                            'error',
                            rawLine
                        ));
                        continue;
                    }

                    // プロパティ名のタイポ・未知プロパティ検証
                    if (propName && !propName.startsWith('--') && !propName.startsWith('-')) {
                        const lowProp = propName.toLowerCase();
                        if (!KNOWN_CSS_PROPERTIES.has(lowProp)) {
                            const closest = findClosestCssProperty(lowProp);
                            const hint = closest
                                ? `「${closest}」のスペルミスではありませんか？（例: ${closest}: ...;）`
                                : `正しいCSSプロパティ名かスペルを確認してください`;
                            issues.push(createIssue(
                                offset + i + 1,
                                rawLine.indexOf(propName) + 1,
                                `「${propName}」は未知のCSSプロパティ名です`,
                                hint,
                                'error',
                                rawLine
                            ));
                        }
                    }

                    if (!clean.includes(';')) {
                        if (!valPart || clean.endsWith(',')) {
                            pendingProperty = {
                                line: i + 1,
                                col: rawLine.indexOf(':') + 1,
                                propName: propName,
                                valAccum: valPart
                            };
                        } else {
                            let nextHasValue = false;
                            for (let j = i + 1; j < lines.length; j++) {
                                const nextClean = cleanLines[j].trim();
                                if (!nextClean) continue;
                                if (nextClean.includes('{') || nextClean.includes('}')) break;
                                if (nextClean.includes(':')) break;
                                nextHasValue = true;
                                break;
                            }
                            if (nextHasValue) {
                                pendingProperty = {
                                    line: i + 1,
                                    col: rawLine.indexOf(':') + 1,
                                    propName: propName,
                                    valAccum: valPart
                                };
                            } else {
                                validateCssPropertyValue(propName, valPart, offset + i + 1, rawLine, issues);
                                issues.push(createIssue(
                                    offset + i + 1,
                                    rawLine.length,
                                    `CSSプロパティ末尾のセミコロン（;）が抜けています`,
                                    `行末に「 ; 」を追加してください（例: color: red;）`,
                                    'error',
                                    rawLine
                                ));
                            }
                        }
                    } else {
                        if (!valPart) {
                            issues.push(createIssue(
                                offset + i + 1,
                                rawLine.indexOf(':') + 1,
                                `CSSのプロパティ値が入力されていません`,
                                `コロン（:）の後に色やサイズなどの値を入力してください（例: color: #ffffff;）`,
                                'error',
                                rawLine
                            ));
                        } else {
                            validateCssPropertyValue(propName, valPart, offset + i + 1, rawLine, issues);
                        }
                    }
                } else if (/^[a-zA-Z-]+\s+[^,{]+$/.test(clean)) {
                    issues.push(createIssue(
                        offset + i + 1,
                        rawLine.indexOf(clean) + 1,
                        `CSSのプロパティ名と値の間にコロン（:）がありません`,
                        `「 プロパティ名: 値; 」のようにコロン（:）で区切ってください`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        return issues;
    }

    /**
     * 7. HTML (index.html) チェック
     * （タグ対応・タグ名タイポ・属性タイポ・属性クォート・未閉じ山括弧・インラインScript・インラインStyle）
     */
    function checkHTML(code, changedLines) {
        const issues = [];
        const lines = code.split('\n');

        let inComment = false;
        let inScript = false;
        let inStyle = false;
        let scriptLines = [];
        let scriptStartLine = 0;
        let styleLines = [];
        let styleStartLine = 0;
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
                    const beforeClose = line.substring(0, closeMatch.index);
                    if (beforeClose.trim()) {
                        scriptLines.push(beforeClose);
                    }
                    if (scriptLines.length > 0) {
                        const scriptCode = scriptLines.join('\n');
                        const jsIssues = []
                            .concat(checkUnclosedQuotes('inline.js', scriptCode))
                            .concat(checkBracketPairs('inline.js', scriptCode))
                            .concat(checkJavaScriptNativeSyntax(scriptCode, null, false));
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
                    if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === 'script') {
                        tagStack.pop();
                    }
                    line = line.substring(closeMatch.index + closeMatch[0].length);
                } else {
                    scriptLines.push(rawLine);
                    continue;
                }
            }

            // <style> 内の収集とCSSチェック
            if (inStyle) {
                const closeMatch = line.match(/<\/style\s*>/i);
                if (closeMatch) {
                    inStyle = false;
                    const beforeClose = line.substring(0, closeMatch.index);
                    if (beforeClose.trim()) {
                        styleLines.push(beforeClose);
                    }
                    if (styleLines.length > 0) {
                        const styleCode = styleLines.join('\n');
                        const cssIssues = []
                            .concat(checkUnclosedQuotes('inline.css', styleCode))
                            .concat(checkBracketPairs('inline.css', styleCode))
                            .concat(checkCSS(styleCode, 0));
                        cssIssues.forEach(item => {
                            issues.push(createIssue(
                                styleStartLine + item.line,
                                item.col,
                                `<style>内のCSSエラー: ${item.message}`,
                                item.hint,
                                item.severity || 'error',
                                lines[styleStartLine + item.line - 1] || ''
                            ));
                        });
                        styleLines = [];
                    }
                    if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === 'style') {
                        tagStack.pop();
                    }
                    line = line.substring(closeMatch.index + closeMatch[0].length);
                } else {
                    styleLines.push(rawLine);
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

                const rawTagName = nameMatch[1];
                const tagName = rawTagName.toLowerCase();

                // HTMLタグ名のスペルミス検証（カスタム要素のハイフン入りは除外）
                if (!tagName.includes('-') && !KNOWN_HTML_TAGS.has(tagName) && !KNOWN_HTML_TAGS.has(rawTagName)) {
                    const closestTag = findClosestInCollection(tagName, KNOWN_HTML_TAGS, 2);
                    issues.push(createIssue(
                        i + 1,
                        ltIdx + 2,
                        `HTMLタグ「<${isClosing ? '/' : ''}${rawTagName}>」は存在しないタグ名です`,
                        closestTag
                            ? `「<${isClosing ? '/' : ''}${closestTag}>」のスペルミスではありませんか？`
                            : `HTMLタグ名のスペルを確認してください`,
                        'error',
                        rawLine
                    ));
                }

                // 開始タグの属性チェック（スペルミス・クォート忘れ等）
                if (!isClosing) {
                    const attrPart = tagContent.slice(rawTagName.length).replace(/\/$/, '').trim();
                    if (attrPart) {
                        const attrRegex = /([a-zA-Z_][a-zA-Z0-9_:-]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)?)?/g;
                        let aMatch;
                        while ((aMatch = attrRegex.exec(attrPart)) !== null) {
                            const attrName = aMatch[1];
                            const attrLow = attrName.toLowerCase();
                            if (HTML_ATTR_TYPOS[attrLow]) {
                                const correctAttr = HTML_ATTR_TYPOS[attrLow];
                                issues.push(createIssue(
                                    i + 1,
                                    Math.max(1, rawLine.indexOf(attrName, ltIdx) + 1),
                                    `HTML属性「${attrName}」は「${correctAttr}」のスペルミスです`,
                                    `「${correctAttr}="..."」に書き直してください`,
                                    'error',
                                    rawLine
                                ));
                            }
                            // 属性値に「=」があるのに値が空（例: id= class="foo" または id=>）
                            const fullMatchStr = aMatch[0];
                            if (fullMatchStr.includes('=') && aMatch[2] === undefined) {
                                issues.push(createIssue(
                                    i + 1,
                                    Math.max(1, rawLine.indexOf(attrName, ltIdx) + 1),
                                    `HTML属性「${attrName}=」の後に値が指定されていません`,
                                    `「${attrName}="..."」のようにダブルクォートで囲んだ値を指定してください`,
                                    'error',
                                    rawLine
                                ));
                            }
                        }
                    }
                }

                if (VOID_HTML_TAGS.has(tagName) || isSelfClosing) continue;

                if (!isClosing) {
                    tagStack.push({ tag: tagName, line: i + 1, col: ltIdx + 1, lineText: rawLine });
                    if (tagName === 'script') {
                        const restOfLine = line.substring(pos);
                        const sameLineClose = restOfLine.match(/<\/script\s*>/i);
                        if (sameLineClose) {
                            const inlineJs = restOfLine.substring(0, sameLineClose.index).trim();
                            if (inlineJs) {
                                const jsIssues = checkJavaScriptNativeSyntax(inlineJs, null, false);
                                jsIssues.forEach(item => {
                                    issues.push(createIssue(
                                        i + 1,
                                        ltIdx + 1,
                                        `<script>内のエラー: ${item.message}`,
                                        item.hint,
                                        'error',
                                        rawLine
                                    ));
                                });
                            }
                            tagStack.pop();
                            pos += sameLineClose.index + sameLineClose[0].length;
                        } else {
                            inScript = true;
                            if (restOfLine.trim()) {
                                scriptLines = [restOfLine];
                                scriptStartLine = i;
                            } else {
                                scriptLines = [];
                                scriptStartLine = i + 1;
                            }
                            break;
                        }
                    } else if (tagName === 'style') {
                        const restOfLine = line.substring(pos);
                        const sameLineClose = restOfLine.match(/<\/style\s*>/i);
                        if (sameLineClose) {
                            const inlineCss = restOfLine.substring(0, sameLineClose.index).trim();
                            if (inlineCss) {
                                const cssIssues = checkCSS(inlineCss, i);
                                issues.push(...cssIssues);
                            }
                            tagStack.pop();
                            pos += sameLineClose.index + sameLineClose[0].length;
                        } else {
                            inStyle = true;
                            if (restOfLine.trim()) {
                                styleLines = [restOfLine];
                                styleStartLine = i;
                            } else {
                                styleLines = [];
                                styleStartLine = i + 1;
                            }
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
     * 8. JSON (package.json 等) チェック
     */
    function checkJSON(code) {
        const issues = [];
        const lines = code.split('\n');

        // JSON内でコメントやシングルクォート、末尾カンマが使われていないか行単位で検査
        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                issues.push(createIssue(
                    i + 1,
                    rawLine.indexOf('/') + 1,
                    `JSONファイルではコメント（// や /* */）は使用できません`,
                    `コメント行を削除してください`,
                    'error',
                    rawLine
                ));
            }

            // 次の有効行が } または ] なのに末尾にカンマがある（トレーリングカンマ）
            if (trimmed.endsWith(',')) {
                for (let j = i + 1; j < lines.length; j++) {
                    const nextTrim = lines[j].trim();
                    if (!nextTrim) continue;
                    if (nextTrim.startsWith('}') || nextTrim.startsWith(']')) {
                        issues.push(createIssue(
                            i + 1,
                            rawLine.lastIndexOf(',') + 1,
                            `JSONでは最後の項目の後ろにカンマ（,）を付けることはできません`,
                            `この行の末尾の「 , 」を削除してください`,
                            'error',
                            rawLine
                        ));
                    }
                    break;
                }
            }
        }

        try {
            JSON.parse(code);
        } catch (err) {
            if (issues.length === 0) {
                const msg = err.message || '';
                let errLine = 1;
                const posMatch = msg.match(/position\s+(\d+)/i);
                if (posMatch) {
                    const pos = parseInt(posMatch[1], 10);
                    errLine = code.substring(0, pos).split('\n').length;
                }
                issues.push(createIssue(
                    errLine,
                    1,
                    `JSONの構文エラーがあります（${msg}）`,
                    `キーと文字列がすべてダブルクォート（" "）で囲まれているか、カンマの位置が正しいか確認してください`,
                    'error',
                    lines[errLine - 1] || ''
                ));
            }
        }

        return issues;
    }

    /**
     * 9. ファイル横断（クロスファイル）整合性チェック（セーブ前に全ファイル間の参照・ID・パスを検証）
     * @param {string} filename 現在検査中のファイル名
     * @param {string} code 現在のコード文字列
     * @param {Object} allFiles 全ファイルのマップ { 'index.html': '...', 'config.js': '...', ... }
     */
    function checkCrossFileIssues(filename, code, allFiles) {
        if (!allFiles || typeof allFiles !== 'object') return [];
        const issues = [];
        const lines = code.split('\n');

        // ファイル存在確認ヘルパー（クエリパラメータや相対パス ../ ./ を正規化）
        function resolveProjectPath(baseFile, refPath) {
            if (!refPath) return null;
            let cleanRef = refPath.split('?')[0].split('#')[0].trim();
            if (!cleanRef || /^(https?:|data:|mailto:|javascript:|about:|blob:|\/\/)/i.test(cleanRef)) return null;
            if (cleanRef.endsWith('/')) cleanRef += 'index.html';

            const baseDir = baseFile.includes('/') ? baseFile.substring(0, baseFile.lastIndexOf('/') + 1) : '';
            const rawCombined = cleanRef.startsWith('/') ? cleanRef.slice(1) : (baseDir + cleanRef);
            const parts = rawCombined.split('/');
            const normalized = [];
            for (const p of parts) {
                if (!p || p === '.') continue;
                if (p === '..') normalized.pop();
                else normalized.push(p);
            }
            return normalized.join('/');
        }

        function fileExistsInProject(resolvedPath) {
            if (!resolvedPath) return true;
            if (Object.prototype.hasOwnProperty.call(allFiles, resolvedPath)) return true;
            return false;
        }

        const getFileContent = (key) => {
            const v = allFiles[key];
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object') return v.content || '';
            return '';
        };

        // ── A. HTMLファイルの横断チェック (リンク先ファイル存在 & ゲーム必須DOM ID) ──
        if (filename.endsWith('.html')) {
            let configScriptLine = -1;
            let coreScriptLine = -1;

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                // コメント行は除外
                if (rawLine.trim().startsWith('<!--')) continue;

                // src="..." または href="..." の参照先ファイル存在チェック
                const refRegex = /\b(src|href)\s*=\s*["']([^"']+)["']/gi;
                let rMatch;
                while ((rMatch = refRegex.exec(rawLine)) !== null) {
                    const attr = rMatch[1];
                    const refVal = rMatch[2];
                    const resolved = resolveProjectPath(filename, refVal);
                    if (resolved && !fileExistsInProject(resolved)) {
                        const allKeys = Object.keys(allFiles);
                        const closestFile = findClosestInCollection(resolved, allKeys, 3);
                        issues.push(createIssue(
                            i + 1,
                            Math.max(1, rawLine.indexOf(refVal) + 1),
                            `[ファイル横断] ${attr}="${refVal}" で指定されたファイル「${resolved}」が見つかりません`,
                            closestFile
                                ? `「${closestFile}」のスペルミスではありませんか？ファイル名を確認してください`
                                : `プロジェクト内に存在するファイル名を指定してください`,
                            'error',
                            rawLine
                        ));
                    }
                    if (resolved === 'config.js') configScriptLine = i + 1;
                    if (resolved === 'core.js') coreScriptLine = i + 1;
                }
            }

            // ルート index.html の場合、core.js が必須とする要素 (#gameCanvas 等) と script 順序を検証
            if (filename === 'index.html') {
                const htmlIds = new Set();
                const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
                let idMatch;
                while ((idMatch = idRegex.exec(code)) !== null) {
                    htmlIds.add(idMatch[1]);
                }

                const requiredIds = [
                    { id: 'gameCanvas', desc: 'ゲーム画面を描画する <canvas id="gameCanvas">' },
                    { id: 'start-overlay', desc: 'ホーム画面オーバーレイ (id="start-overlay")' },
                    { id: 'btn-game-start', desc: 'ゲーム開始ボタン (id="btn-game-start")' }
                ];

                for (const req of requiredIds) {
                    if (!htmlIds.has(req.id)) {
                        const closestId = findClosestInCollection(req.id, htmlIds, 3);
                        let targetLine = 1;
                        if (closestId) {
                            for (let k = 0; k < lines.length; k++) {
                                if (lines[k].includes(closestId)) {
                                    targetLine = k + 1;
                                    break;
                                }
                            }
                        }
                        issues.push(createIssue(
                            targetLine,
                            1,
                            `[ファイル横断] core.js が使用する ${req.desc} が index.html 内に見つかりません`,
                            closestId
                                ? `行 ${targetLine} の id="${closestId}" は id="${req.id}" のスペルミスではありませんか？`
                                : `index.html 内に id="${req.id}" を持つ要素が必要です`,
                            'error',
                            lines[targetLine - 1] || ''
                        ));
                    }
                }

                if (configScriptLine !== -1 && coreScriptLine !== -1 && configScriptLine > coreScriptLine) {
                    issues.push(createIssue(
                        coreScriptLine,
                        1,
                        `[ファイル横断] core.js が config.js より先に読み込まれています`,
                        `<script src="config.js"></script> を <script src="core.js"></script> より上の行に配置してください`,
                        'error',
                        lines[coreScriptLine - 1] || ''
                    ));
                }
            }
        }

        // ── B. CSSファイルの横断チェック (url(...) の存在確認 & HTML/JS との ID/クラス整合性) ──
        if (filename.endsWith('.css')) {
            // 1. url(...) 参照先の存在チェック
            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const urlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
                let uMatch;
                while ((uMatch = urlRegex.exec(rawLine)) !== null) {
                    const refUrl = uMatch[1].trim();
                    const resolved = resolveProjectPath(filename, refUrl);
                    if (resolved && !fileExistsInProject(resolved)) {
                        const closestAsset = findClosestInCollection(resolved, Object.keys(allFiles), 3);
                        issues.push(createIssue(
                            i + 1,
                            Math.max(1, rawLine.indexOf(refUrl) + 1),
                            `[ファイル横断] CSSの url("${refUrl}") で指定された画像ファイルが見つかりません`,
                            closestAsset
                                ? `「${closestAsset}」のスペルミスではありませんか？`
                                : `assets/ フォルダ内の正しいファイル名を指定してください`,
                            'error',
                            rawLine
                        ));
                    }
                }
            }

            // 2. style.css の ID / クラスセレクタが index.html / core.js / monaca-bridge.js に存在するか横断チェック
            if (filename === 'style.css' && allFiles['index.html']) {
                const knownIds = new Set();
                const knownClasses = new Set([
                    // JSで動的に付与されるクラス・ID
                    'in-iframe', 'hidden', 'active', 'edit-mode', 'transitioning-to-editor',
                    'modal-sprite-cell', 'monaca-error-hud', 'monaca-hud-badge', 'hud-badge-dot',
                    'hud-badge-title', 'hud-badge-line', 'monaca-hud-body', 'monaca-hud-title',
                    'monaca-hud-msg', 'monaca-hud-hint', 'monaca-hud-footer',
                    'editor-transition-mock', 'mock-header', 'mock-brand', 'mock-body',
                    'mock-sidebar', 'mock-item', 'mock-dot', 'mock-editor', 'mock-tabs',
                    'mock-tab', 'mock-code', 'mock-line-nums', 'mock-code-lines', 'mock-code-bar'
                ]);
                knownIds.add('monaca-error-hud');

                const htmlText = getFileContent('index.html') + '\n' + getFileContent('editor/index.html');
                const jsText = getFileContent('core.js') + '\n' + getFileContent('monaca-bridge.js');

                let m;
                const htmlIdRe = /\bid\s*=\s*["']([^"']+)["']/gi;
                while ((m = htmlIdRe.exec(htmlText)) !== null) knownIds.add(m[1].trim());

                const htmlClassRe = /\bclass\s*=\s*["']([^"']+)["']/gi;
                while ((m = htmlClassRe.exec(htmlText)) !== null) {
                    m[1].split(/\s+/).forEach(c => { if (c) knownClasses.add(c.trim()); });
                }

                const jsClassRe = /classList\.(?:add|remove|toggle|contains)\(\s*["']([^"']+)["']/g;
                while ((m = jsClassRe.exec(jsText)) !== null) knownClasses.add(m[1].trim());

                const jsClassNameRe = /className\s*=\s*["']([^"']+)["']/g;
                while ((m = jsClassNameRe.exec(jsText)) !== null) {
                    m[1].split(/\s+/).forEach(c => { if (c) knownClasses.add(c.trim()); });
                }

                // CSS内のセレクタ行から #id と .class を抽出して照合
                let inComment = false;
                let depth = 0;
                for (let i = 0; i < lines.length; i++) {
                    const rawLine = lines[i];
                    let line = rawLine;
                    if (inComment) {
                        const cIdx = line.indexOf('*/');
                        if (cIdx !== -1) {
                            inComment = false;
                            line = line.substring(cIdx + 2);
                        } else continue;
                    }
                    line = line.replace(/\/\*[\s\S]*?\*\//g, '');
                    if (line.includes('/*')) {
                        inComment = true;
                        line = line.substring(0, line.indexOf('/*'));
                    }

                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    if (depth === 0 && !trimmed.startsWith('@')) {
                        const selPart = trimmed.includes('{') ? trimmed.substring(0, trimmed.indexOf('{')) : trimmed;
                        // セレクタ内の #id 検査
                        const idSelRe = /#([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
                        let idM;
                        while ((idM = idSelRe.exec(selPart)) !== null) {
                            const idName = idM[1];
                            if (!knownIds.has(idName)) {
                                const closestId = findClosestInCollection(idName, knownIds, 2);
                                if (closestId) {
                                    issues.push(createIssue(
                                        i + 1,
                                        Math.max(1, rawLine.indexOf('#' + idName) + 1),
                                        `[ファイル横断] CSSセレクタ「#${idName}」は index.html 内の「#${closestId}」のスペルミスではありませんか？`,
                                        `index.html には id="${closestId}" が定義されています`,
                                        'warning',
                                        rawLine
                                    ));
                                }
                            }
                        }

                        // セレクタ内の .class 検査
                        const classSelRe = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
                        let clsM;
                        while ((clsM = classSelRe.exec(selPart)) !== null) {
                            const clsName = clsM[1];
                            if (!knownClasses.has(clsName)) {
                                const closestCls = findClosestInCollection(clsName, knownClasses, 2);
                                if (closestCls) {
                                    issues.push(createIssue(
                                        i + 1,
                                        Math.max(1, rawLine.indexOf('.' + clsName) + 1),
                                        `[ファイル横断] CSSセレクタ「.${clsName}」は index.html 内の「.${closestCls}」のスペルミスではありませんか？`,
                                        `HTML側には class="${closestCls}" が使われています`,
                                        'warning',
                                        rawLine
                                    ));
                                }
                            }
                        }
                    }

                    for (let c = 0; c < trimmed.length; c++) {
                        if (trimmed[c] === '{') depth++;
                        else if (trimmed[c] === '}') depth = Math.max(0, depth - 1);
                    }
                }
            }
        }

        // ── C. core.js の横断チェック (index.html のDOM ID参照 & config.js の GameConfig 整合性) ──
        if (filename === 'core.js' && allFiles['index.html']) {
            const htmlText = getFileContent('index.html');
            const htmlIds = new Set(['monaca-error-hud', 'btn-left', 'btn-right', 'btn-fire', 'btn-sound']);
            const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
            let idM;
            while ((idM = idRegex.exec(htmlText)) !== null) {
                htmlIds.add(idM[1]);
            }

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const clean = stripLineComment(rawLine);
                const getElemMatch = clean.match(/document\.getElementById\(\s*["']([^"']+)["']\s*\)/);
                if (getElemMatch) {
                    const targetId = getElemMatch[1];
                    if (!htmlIds.has(targetId)) {
                        const closestId = findClosestInCollection(targetId, htmlIds, 3);
                        issues.push(createIssue(
                            i + 1,
                            Math.max(1, rawLine.indexOf(targetId) + 1),
                            `[ファイル横断] document.getElementById("${targetId}") に対応する id="${targetId}" が index.html にありません`,
                            closestId
                                ? `index.html 内の id="${closestId}" のスペルミスか、index.html 側で id が変更されています`
                                : `index.html 側に id="${targetId}" の要素が存在するか確認してください`,
                            'warning',
                            rawLine
                        ));
                    }
                }
            }
        }

        return issues;
    }

    /**
     * 10. 未復元箇所 (TODO) の警告検知
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
     * @param {string} filename ファイル名 (config.js, style.css, etc.) ※1引数呼び出し時は code として扱う後方互換あり
     * @param {string} code コード文字列
     * @param {Object} options オプション { baselineCode, changedLines, allFiles }
     * @returns {Array} 発見された問題の配列
     */
    function lint(filename, code, options) {
        // Monaca Bridge 等から Linter.lint(code) と1引数で呼ばれた場合の後方互換サポート
        if (code === undefined && typeof filename === 'string') {
            code = filename;
            filename = 'config.js';
        }
        if (!code || typeof code !== 'string') return [];
        filename = filename || 'config.js';

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

        // 4. ファイルタイプ別チェック（差分だけでなくファイル全体を検証）
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
            issues = issues.concat(checkCSS(code, 0));
        } else if (filename.endsWith('.html')) {
            issues = issues.concat(checkHTML(code, changedLines));
        } else if (filename.endsWith('.json')) {
            issues = issues.concat(checkJSON(code));
        }

        // 5. ファイル横断（クロスファイル）整合性チェック（セーブ前のリアルタイム検証）
        if (options.allFiles) {
            issues = issues.concat(checkCrossFileIssues(filename, code, options.allFiles));
        }

        // 6. TODO警告（config.js の穴埋め箇所のみ対象）
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
            item.filename = item.filename || filename;
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

    /**
     * プロジェクト全体の横断一括診断関数（セーブ前・編集時の全ファイル検証用）
     * @param {Object} filesMap IDEの files オブジェクトまたは { path: content } マップ
     * @returns {Object} { byFile: { [path]: issues[] }, allIssues: issues[], totalErrors: number, totalWarnings: number }
     */
    function lintProject(filesMap) {
        const byFile = {};
        const allIssues = [];
        let totalErrors = 0;
        let totalWarnings = 0;

        if (!filesMap || typeof filesMap !== 'object') {
            return { byFile, allIssues, totalErrors, totalWarnings };
        }

        for (const key of Object.keys(filesMap)) {
            const entry = filesMap[key];
            if (!entry) continue;
            if (typeof entry === 'object' && (entry.isBinary || entry.type === 'xml' || entry.type === 'text')) {
                byFile[key] = [];
                continue;
            }
            const content = typeof entry === 'string' ? entry : (entry.content || '');
            const baseline = typeof entry === 'object' ? (entry.baselineContent || '') : '';
            const changedLines = baseline ? computeChangedLines(baseline, content) : new Set();

            const fileIssues = lint(key, content, {
                baselineCode: baseline,
                changedLines: changedLines,
                allFiles: filesMap
            });

            fileIssues.forEach(iss => {
                iss.filename = key;
                if (iss.severity === 'error') totalErrors++;
                else totalWarnings++;
                allIssues.push(iss);
            });
            byFile[key] = fileIssues;
        }

        return {
            byFile: byFile,
            allIssues: allIssues,
            totalErrors: totalErrors,
            totalWarnings: totalWarnings
        };
    }

    const Linter = {
        lint: lint,
        lintProject: lintProject,
        createIssue: createIssue,
        computeChangedLines: computeChangedLines
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Linter;
    } else {
        global.Linter = Linter;
    }

})(typeof window !== 'undefined' ? window : global);
