/**
 * linter.js - リアルタイム構文診断エンジン
 * 初心者がつまずきやすい全角記号の混入や構文エラー、ドット絵データの形式不備などを
 * 外部ライブラリ非依存で即座に検出し、わかりやすい日本語で修正ヒントを提示します。
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
        enemy: ['rows', 'cols', 'speed', 'dropAmount', 'shootInterval', 'bulletSpeed', 'colors', 'scores', 'hardHpBoost'],
        bunker: ['enabled', 'count', 'color', 'regenerateEachWave', 'passThroughPlayer'],
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
        'position', 'top', 'right', 'bottom', 'left', 'inset', 'inset-block', 'inset-inline', 'z-index',
        'display', 'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap',
        'justify-content', 'align-items', 'align-content', 'align-self', 'justify-items', 'justify-self', 'gap', 'row-gap', 'column-gap', 'order',
        'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow', 'grid-auto-rows', 'grid-column', 'grid-column-end', 'grid-column-gap', 'grid-column-start',
        'grid-row', 'grid-row-end', 'grid-row-gap', 'grid-row-start', 'grid-template', 'grid-template-areas', 'grid-template-columns', 'grid-template-rows',
        // コンテナクエリ
        'container', 'container-name', 'container-type',
        // ボックスモデル・サイズ
        'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'aspect-ratio', 'box-sizing',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-inline', 'padding-block',
        'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap', 'overscroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y', 'overscroll-behavior-inline', 'overscroll-behavior-block',
        'visibility', 'clip-path', 'float', 'clear',
        // 背景・境界線
        'background', 'background-color', 'background-image', 'background-position', 'background-position-x', 'background-position-y',
        'background-repeat', 'background-size', 'background-attachment', 'background-clip', 'background-origin',
        'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-inline', 'border-block',
        'border-width', 'border-style', 'border-color',
        'border-top-width', 'border-top-style', 'border-top-color',
        'border-right-width', 'border-right-style', 'border-right-color',
        'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
        'border-left-width', 'border-left-style', 'border-left-color',
        'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
        'border-collapse', 'border-spacing',
        'outline', 'outline-color', 'outline-style', 'outline-width', 'outline-offset',
        'box-shadow', 'box-decoration-break',
        // マスク
        'mask', 'mask-image', 'mask-size', 'mask-repeat', 'mask-position',
        // 文字・タイポグラフィ
        'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-variant-numeric', 'font-variant-caps', 'font-variant-east-asian', 'font-variant-ligatures', 'font-display',
        'font-feature-settings', 'font-variation-settings', 'font-synthesis',
        'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-align-last',
        'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
        'text-transform', 'text-indent', 'text-shadow', 'text-overflow', 'white-space', 'word-break',
        'text-wrap', 'text-wrap-mode', 'text-wrap-style', 'writing-mode', 'text-orientation', 'direction',
        // アニメーション・エフェクト・操作・スクロール
        'opacity', 'transform', 'transform-origin', 'transform-style', 'perspective', 'perspective-origin',
        'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
        'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state',
        'cursor', 'pointer-events', 'user-select', 'touch-action', 'resize', 'appearance',
        'filter', 'backdrop-filter', 'content', 'quotes', 'tab-size', 'caret-color', 'accent-color', 'color-scheme',
        'will-change', 'isolation', 'image-rendering', 'object-fit', 'object-position', 'contain', 'contain-intrinsic-size', 'contain-intrinsic-width', 'contain-intrinsic-height',
        'scroll-behavior', 'scrollbar-gutter', 'scrollbar-width', 'scrollbar-color',
        'scroll-snap-type', 'scroll-snap-align', 'scroll-snap-stop', 'scroll-margin', 'scroll-padding',
        'table-layout', 'vertical-align', 'list-style', 'list-style-type', 'list-style-position', 'list-style-image',
        'word-wrap', 'line-break', 'hyphens',
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
                    const isRegex = !prevNonSpace || /[(=:;,!&|?+\-*%^~<>{}\[]/.test(prevNonSpace) || /^(return|case|typeof|delete|void|in|instanceof|new|throw|yield|await)$/.test(lastWord);
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

                // 識別子・直前の非空白トークン追跡（除算 `/` と正規表現リテラル `/.../` の正確な区別のために必須）
                if (/[a-zA-Z0-9_$]/.test(ch)) {
                    lastWord += ch;
                } else if (!/\s/.test(ch)) {
                    lastWord = '';
                }
                if (!/\s/.test(ch)) {
                    prevNonSpace = ch;
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
        const templateStack = [];
        let prevNonSpace = '';
        let lastWord = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let inString = null;

            for (let c = 0; c < line.length; c++) {
                const ch = line[c];
                const next = line[c + 1];
                const topTpl = templateStack.length > 0 ? templateStack[templateStack.length - 1] : null;
                const inTemplateText = topTpl === 'TEMPLATE';

                // 複数行コメント中
                if (inMultiComment) {
                    if (ch === '*' && next === '/') {
                        inMultiComment = false;
                        c++;
                    }
                    continue;
                }

                // テンプレートリテラル文字列中
                if (inTemplateText) {
                    if (ch === '\\' && c + 1 < line.length) {
                        c++;
                    } else if (ch === '$' && next === '{') {
                        templateStack.push({ type: 'EXPR', braces: 1 });
                        stack.push({ char: '{', line: i + 1, col: c + 2, lineText: line });
                        c++;
                    } else if (ch === '`') {
                        templateStack.pop();
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
                    templateStack.push('TEMPLATE');
                    prevNonSpace = '`';
                    lastWord = '';
                    continue;
                }

                if (topTpl && topTpl.type === 'EXPR') {
                    if (ch === '{') topTpl.braces++;
                    else if (ch === '}') {
                        topTpl.braces--;
                        if (topTpl.braces === 0) {
                            templateStack.pop();
                        }
                    }
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

    // config.js のプロパティごとの期待される型・制約定義
    const CONFIG_PROPERTY_SPECS = {
        'game.maxWaves': { type: 'number', min: 1, max: 10 },
        'game.difficulty': { type: 'enum', values: ['easy', 'normal', 'hard'] },
        'player.speed': { type: 'number', min: 0, max: 100 },
        'player.color': { type: 'color' },
        'player.lives': { type: 'number', min: 0, max: 99999 },
        'player.maxBullets': { type: 'number', min: 1, max: 300 },
        'player.fireInterval': { type: 'number', min: 1, max: 300 },
        'player.muzzle': { type: 'muzzle' },
        'bullet.speed': { type: 'number', min: -200, max: 0, warnPositive: true },
        'bullet.color': { type: 'color' },
        'bullet.width': { type: 'number', min: 1, max: 480 },
        'bullet.height': { type: 'number', min: 1, max: 200 },
        'enemy.rows': { type: 'number', min: 1, max: 12 },
        'enemy.cols': { type: 'number', min: 1, max: 20 },
        'enemy.speed': { type: 'number', min: 0.1, max: 50 },
        'enemy.dropAmount': { type: 'number', min: 0, max: 100 },
        'enemy.shootInterval': { type: 'number', min: 1, max: 600 },
        'enemy.bulletSpeed': { type: 'number', min: 0.5, max: 50 },
        'enemy.colors': { type: 'colorArray' },
        'enemy.scores': { type: 'numberArray' },
        'enemy.hardHpBoost': { type: 'boolean' },
        'bunker.enabled': { type: 'boolean' },
        'bunker.count': { type: 'number', min: 0, max: 8 },
        'bunker.color': { type: 'color' },
        'bunker.regenerateEachWave': { type: 'boolean' },
        'bunker.passThroughPlayer': { type: 'boolean' },
        'ufo.enabled': { type: 'boolean' },
        'ufo.speed': { type: 'number', min: 0.5, max: 50 },
        'ufo.bonusScore': { type: 'number', min: 0, max: 99999999 },
        'ufo.score': { type: 'number', min: 0, max: 99999999 },
        'ufo.interval': { type: 'number', min: 1, max: 120 },
        'ufo.color': { type: 'color' },
        'display.background': { type: 'enum', values: ['space-bg', 'space-nebula', 'black'] },
        'display.sound': { type: 'boolean' },
        'display.canvasWidth': { type: 'number', min: 100, max: 2000 },
        'display.canvasHeight': { type: 'number', min: 100, max: 2000 },
        'display.scale': { type: 'number', min: 0.1, max: 5 }
    };

    const REQUIRED_CONFIG_SECTIONS = ['game', 'player', 'bullet', 'enemy', 'bunker', 'ufo', 'display', 'sprites'];

    const REQUIRED_CONFIG_PROPERTIES = {
        game: ['maxWaves', 'difficulty'],
        player: ['speed', 'color', 'lives', 'maxBullets', 'fireInterval', 'muzzle'],
        bullet: ['speed', 'color', 'width', 'height'],
        enemy: ['rows', 'cols', 'speed', 'dropAmount', 'shootInterval', 'bulletSpeed', 'colors', 'scores', 'hardHpBoost'],
        bunker: ['enabled', 'count', 'color', 'regenerateEachWave', 'passThroughPlayer'],
        ufo: ['enabled', 'speed', 'bonusScore', 'interval', 'color'],
        display: ['background', 'sound'],
        sprites: ['player', 'squid', 'crab', 'octopus', 'ufo']
    };

    /**
     * 4. config.js 固有の初心者ミス＆タイポ・設定値・実行時エラー検知
     * （差分行だけでなくファイル全体の構造・型・値域・スプライト整合性を常時検証）
     */
        /**
     * 4. stages.js 固有のステージ定義構造・座標・ギミック・解答手数・タイポ・実行時エラー検知
     */
    function checkStagesSchemaAndTraps(code, changedLines) {
        const issues = [];
        const lines = code.split("\n");

        // 行単位のキー名タイポ検証（例: maxBlock, forbiden, gimmick, startrow, goalrow, colm, dirs など）
        const VALID_STAGE_KEYS = new Set([
            "id", "title", "subtitle", "maxBlocks", "targetBlocks", "startRow", "goalRow", "hasCeiling",
            "forbidden", "gimmicks", "solution", "legends",
            "col", "row", "type", "dir", "steps", "purpleBorder", "icon", "text"
        ]);
        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const clean = stripLineComment(rawLine);
            if (!clean.trim()) continue;
            // オブジェクトのキー名らしきパターン（文字列リテラル内を除外）
            const noStr = clean.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
            const keyRe = /(?:^|[{,\s])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
            let km;
            while ((km = keyRe.exec(noStr)) !== null) {
                const kName = km[1];
                if (!VALID_STAGE_KEYS.has(kName)) {
                    const closestKey = findClosestInCollection(kName, VALID_STAGE_KEYS, 3);
                    const colPos = Math.max(1, rawLine.indexOf(kName) + 1);
                    issues.push(createIssue(
                        i + 1,
                        colPos,
                        closestKey
                            ? `項目名「${kName}」は「${closestKey}」のスペルミスです`
                            : `未知のステージ設定項目「${kName}」が指定されています`,
                        closestKey
                            ? `「${closestKey}: ...」に書き直してください（大文字・小文字も区別されます）`
                            : `有効な項目名（id, title, subtitle, maxBlocks, startRow, goalRow, forbidden, gimmicks, solution, legends 等）を確認してください`,
                        "error",
                        rawLine,
                        changedLines ? changedLines.has(i + 1) : true
                    ));
                }
            }
        }

        let evalStages = null;
        try {
            const runner = new Function(code + "; return (typeof STAGES !== \"undefined\" ? STAGES : (typeof stages !== \"undefined\" ? stages : null));");
            evalStages = runner();
        } catch (e) {
            return issues;
        }

        if (!evalStages || !Array.isArray(evalStages)) {
            issues.push(createIssue(1, 1, "STAGES 配列が定義されていません", "const STAGES = [ { id: 1, ... } ]; の形式で全ステージの配列を定義してください。", "error", lines[0] || "", true));
            return issues;
        }

        // 各ステージの開始行番号を推定するヘルパー
        function findStageStartLine(stageId, stageIdx) {
            if (stageId !== undefined && stageId !== null) {
                const idRe = new RegExp(`\\bid\\s*:\\s*${stageId}\\b`);
                for (let i = 0; i < lines.length; i++) {
                    if (idRe.test(stripLineComment(lines[i]))) return i + 1;
                }
            }
            let count = -1;
            for (let i = 0; i < lines.length; i++) {
                if (/\bid\s*:/.test(stripLineComment(lines[i]))) {
                    count++;
                    if (count === stageIdx) return i + 1;
                }
            }
            return 1;
        }

        function findPropLineFrom(startLine, propName) {
            const re = new RegExp(`\\b${propName}\\s*:`);
            for (let i = Math.max(0, startLine - 2); i < Math.min(lines.length, startLine + 45); i++) {
                if (re.test(stripLineComment(lines[i]))) return i + 1;
            }
            return startLine;
        }

        const REQUIRED_KEYS = ["id", "title", "maxBlocks", "startRow", "goalRow"];
        const VALID_GIMMICK_TYPES = ["dash", "step"];
        const VALID_GIMMICK_DIRS = ["up", "down", "left", "right"];
        const seenIds = new Map();

        evalStages.forEach((stage, idx) => {
            const stageNum = idx + 1;
            const stLine = findStageStartLine(stage && stage.id, idx);
            if (!stage || typeof stage !== "object") {
                issues.push(createIssue(stLine, 1, "ステージ [" + idx + "] のオブジェクト定義が不正です", "{ id: " + stageNum + ", title: '...', ... } の形式で記述してください。", "error", lines[stLine - 1] || "", true));
                return;
            }

            REQUIRED_KEYS.forEach(reqKey => {
                if (stage[reqKey] === undefined || stage[reqKey] === null) {
                    issues.push(createIssue(stLine, 1, "ステージ " + (stage.id || stageNum) + " に必須項目「" + reqKey + "」がありません", "ステージ定義には id, title, maxBlocks, startRow, goalRow が必須です。", "error", lines[stLine - 1] || "", true));
                }
            });

            if (typeof stage.id === "number") {
                if (seenIds.has(stage.id)) {
                    issues.push(createIssue(stLine, 1, "ステージID「" + stage.id + "」が重複しています（行 " + seenIds.get(stage.id) + " と同じID）", "各ステージの id は他のステージと重ならない番号にしてください。", "error", lines[stLine - 1] || "", true));
                }
                seenIds.set(stage.id, stLine);
            }

            ["startRow", "goalRow"].forEach(rowProp => {
                const pLine = findPropLineFrom(stLine, rowProp);
                if (typeof stage[rowProp] === "number") {
                    if (stage[rowProp] < 0 || stage[rowProp] > 4 || !Number.isInteger(stage[rowProp])) {
                        issues.push(createIssue(pLine, 1, "ステージ " + (stage.id || stageNum) + " の " + rowProp + " (" + stage[rowProp] + ") が盤面外です", "ハコゲームは縦5マスなので、0 から 4 までの整数を指定してください。", "error", lines[pLine - 1] || "", true));
                    }
                } else if (stage[rowProp] !== undefined) {
                    issues.push(createIssue(pLine, 1, "ステージ " + (stage.id || stageNum) + " の " + rowProp + " には 0〜4 の数値を指定してください", rowProp + ": 3 のようにクォートなしの数値で指定してください。", "error", lines[pLine - 1] || "", true));
                }
            });

            if (typeof stage.maxBlocks === "number" && (stage.maxBlocks <= 0 || stage.maxBlocks > 25)) {
                const pLine = findPropLineFrom(stLine, "maxBlocks");
                issues.push(createIssue(pLine, 1, "ステージ " + (stage.id || stageNum) + " の maxBlocks (" + stage.maxBlocks + ") が範囲外です", "配置可能ブロック数は 1〜25 の整数を指定してください。", stage.maxBlocks <= 0 ? "error" : "warning", lines[pLine - 1] || "", true));
            }

            if (Array.isArray(stage.forbidden)) {
                const fLine = findPropLineFrom(stLine, "forbidden");
                stage.forbidden.forEach((cell, cIdx) => {
                    if (!cell || typeof cell.col !== "number" || typeof cell.row !== "number" || cell.col < 0 || cell.col > 4 || cell.row < 0 || cell.row > 4) {
                        issues.push(createIssue(fLine, 1, "ステージ " + (stage.id || stageNum) + " の forbidden[" + cIdx + "] の座標 (" + (cell && cell.col) + ", " + (cell && cell.row) + ") が不正または盤面外です", "{ col: 0〜4, row: 0〜4 } の範囲で指定してください。", "error", lines[fLine - 1] || "", true));
                    }
                });
            }

            if (Array.isArray(stage.gimmicks)) {
                const gLine = findPropLineFrom(stLine, "gimmicks");
                stage.gimmicks.forEach((g, gIdx) => {
                    if (!g || typeof g.col !== "number" || typeof g.row !== "number" || g.col < 0 || g.col > 4 || g.row < 0 || g.row > 4) {
                        issues.push(createIssue(gLine, 1, "ステージ " + (stage.id || stageNum) + " の gimmicks[" + gIdx + "] の座標 (" + (g && g.col) + ", " + (g && g.row) + ") が不正または盤面外です", "col と row は 0〜4 の範囲で指定してください。", "error", lines[gLine - 1] || "", true));
                    }
                    if (g && g.type && !VALID_GIMMICK_TYPES.includes(g.type)) {
                        issues.push(createIssue(gLine, 1, "ステージ " + (stage.id || stageNum) + " の ギミック種別「" + g.type + "」は無効です", "指定できる type は 'dash'（水色矢印）または 'step'（緑矢印）です。", "error", lines[gLine - 1] || "", true));
                    }
                    if (g && g.dir && !VALID_GIMMICK_DIRS.includes(g.dir)) {
                        issues.push(createIssue(gLine, 1, "ステージ " + (stage.id || stageNum) + " の ギミック向き「" + g.dir + "」は無効です", "向き dir は 'up', 'down', 'left', 'right' のいずれかを指定してください。", "error", lines[gLine - 1] || "", true));
                    }
                });
            }

            if (Array.isArray(stage.solution) && typeof stage.maxBlocks === "number") {
                const sLine = findPropLineFrom(stLine, "solution");
                if (stage.solution.length > stage.maxBlocks) {
                    issues.push(createIssue(sLine, 1, "ステージ " + (stage.id || stageNum) + " の解答配置数 (" + stage.solution.length + "個) が maxBlocks (" + stage.maxBlocks + ") を超過しています", "solution の要素数は maxBlocks 以下にしてください。", "warning", lines[sLine - 1] || "", true));
                }
            }
        });

        return issues;
    }

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
                userMessage = 'コードが途中で終わっています（括弧やクォート、コメントが閉じられていません）';
                userHint = 'ファイル全体の「 { } 」「 [ ] 」や「 /* ... */ 」のペアがすべて閉じているか確認してください';
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

        // stages.js / config.js の場合は実際に評価して ReferenceError（未定義の単語・クォート忘れ等）や構造破壊も捕捉する
        if (isConfig) {
            const lines = code.split('\n');
            try {
                const evaluated = new Function(code + '\n; return typeof STAGES !== "undefined" ? STAGES : (typeof GameConfig !== "undefined" ? GameConfig : null);')();
                if (!evaluated || typeof evaluated !== 'object') {
                    return [createIssue(
                        1,
                        1,
                        'STAGES 配列の定義が見つかりません',
                        '「const STAGES = [ ... ];」の名前を消していないか確認してください',
                        'error',
                        lines[0] || '',
                        false
                    )];
                }
                if (Array.isArray(evaluated) && evaluated.length === 0) {
                    return [createIssue(
                        1,
                        1,
                        'STAGES 配列が空になっています',
                        '少なくとも1つ以上のステージオブジェクト { id: 1, ... } を定義してください',
                        'error',
                        lines[0] || '',
                        false
                    )];
                }
            } catch (runtimeErr) {
                const msg = runtimeErr.message || '';
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
                        `文字列なら「 '${badWord}' 」のようにクォートで囲み、真偽値なら「 true 」「 false 」と入力してください`,
                        'error',
                        lines[foundLine - 1] || '',
                        changedLines ? changedLines.has(foundLine) : false
                    )];
                }
                return [createIssue(
                    1,
                    1,
                    `stages.js の実行時にエラーが発生しました（${msg}）`,
                    `設定値の記述形式が正しいか確認してください`,
                    'error',
                    lines[0] || '',
                    false
                )];
            }
        }

        return [];
    }

    function getAutoCloseBrackets(codeStr) {
        const stack = [];
        let inStr = null;
        for (let i = 0; i < codeStr.length; i++) {
            const c = codeStr[i];
            if (inStr) {
                if (c === '\\') { i++; continue; }
                if (c === inStr) inStr = null;
                continue;
            }
            if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
            if (c === '{') stack.push('}');
            else if (c === '[') stack.push(']');
            else if (c === '(') stack.push(')');
            else if (c === '}' || c === ']' || c === ')') stack.pop();
        }
        return stack.reverse().join('');
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

    const CSS_COLOR_ONLY_PROPERTIES = new Set([
        'color', 'background-color', 'border-color', 'border-top-color', 'border-right-color',
        'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke',
        'caret-color', 'accent-color', 'text-decoration-color', 'column-rule-color'
    ]);

    const CSS_NUMERIC_OR_LENGTH_PROPERTIES = new Set([
        'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
        'top', 'right', 'bottom', 'left', 'inset',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'gap', 'row-gap', 'column-gap', 'grid-gap',
        'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
        'font-size', 'letter-spacing', 'word-spacing', 'line-height',
        'z-index', 'opacity', 'flex-grow', 'flex-shrink', 'order', 'outline-width', 'outline-offset'
    ]);

    const CSS_UNITLESS_NUMERIC_PROPERTIES = new Set([
        'z-index', 'opacity', 'flex-grow', 'flex-shrink', 'order'
    ]);

    const CSS_ALLOWED_LENGTH_KEYWORDS = new Set([
        'auto', 'none', 'normal', 'inherit', 'initial', 'unset', 'revert',
        'fit-content', 'max-content', 'min-content',
        'thin', 'medium', 'thick',
        'xx-small', 'x-small', 'small', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger'
    ]);

    const VALID_CSS_AT_RULES = new Set([
        'media', 'keyframes', '-webkit-keyframes', '-moz-keyframes',
        'import', 'charset', 'supports', 'font-face', 'layer', 'container', 'page', 'property', 'namespace'
    ]);

    const CSS_STRING_ALLOWED_PROPERTIES = new Set([
        'font-family', 'font', 'content', 'quotes', 'grid-template-areas', 'grid-template', 'list-style-type', 'counter-reset', 'counter-increment'
    ]);

    const VALID_CSS_BORDER_STYLES = new Set([
        'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'
    ]);

    const CSS_BORDER_SHORTHAND_PROPERTIES = new Set([
        'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'outline', 'column-rule'
    ]);

    const VALID_CSS_BACKGROUND_KEYWORDS = new Set([
        'none', 'transparent', 'currentcolor', 'repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round',
        'scroll', 'fixed', 'local', 'center', 'top', 'bottom', 'left', 'right', 'cover', 'contain', 'auto',
        'border-box', 'padding-box', 'content-box', 'text'
    ]);

    // 有効なCSS総称フォントファミリー名 (Generic Font Families)
    const CSS_GENERIC_FONT_FAMILIES = new Set([
        'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
        'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong'
    ]);

    // 代表的な既知フォント名（OS標準・Web標準フォント）
    const KNOWN_COMMON_FONT_FAMILIES = new Set([
        '-apple-system', 'blinkmacsystemfont', 'roboto', 'helvetica', 'arial', 'verdana', 'tahoma',
        'trebuchet ms', 'times new roman', 'georgia', 'garamond', 'courier new', 'consolas', 'monaco',
        'menlo', 'lucida console', 'meiryo', 'yu gothic', 'yu mincho', 'hiragino sans',
        'hiragino kaku gothic pron', 'hiragino mincho pron', 'noto sans', 'noto sans jp',
        'noto serif', 'noto serif jp', 'ms gothic', 'ms pgothic', 'ms mincho', 'ms pmincho',
        'segoe ui', 'sf pro', 'sf mono', 'impact', 'comic sans ms', 'courier', 'lucida grande',
        'geneva', 'optima', 'palatino', 'century gothic', 'franklin gothic medium', 'futura'
    ]);

    /**
     * font-family プロパティの値を詳細検証する
     * （カンマ抜け、末尾カンマ、連続カンマ、空白フォント名のクォート漏れ、総称フォント名タイポ、無効な文字・値を検出）
     */
    function validateFontFamily(valStr, lineNum, rawLine, issues) {
        const clean = valStr.replace(/!important\s*$/i, '').trim();
        if (!clean) {
            issues.push(createIssue(
                lineNum,
                Math.max(1, rawLine.indexOf('font-family') + 1),
                `CSSプロパティ「font-family」の値が入力されていません`,
                `「font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;」のようにフォント名を指定してください`,
                'error',
                rawLine
            ));
            return;
        }

        if (clean === ',' || /^,+$/.test(clean)) {
            issues.push(createIssue(
                lineNum,
                Math.max(1, rawLine.indexOf(',') + 1),
                `CSSプロパティ「font-family」の値がカンマ（,）のみになっています`,
                `フォント名または総称フォント名（例: sans-serif）を指定してください`,
                'error',
                rawLine
            ));
            return;
        }

        if (clean.startsWith(',')) {
            issues.push(createIssue(
                lineNum,
                Math.max(1, rawLine.indexOf(',') + 1),
                `font-family の先頭に余分なカンマ（,）があります`,
                `先頭のカンマを削除してください`,
                'error',
                rawLine
            ));
            return;
        }

        if (clean.endsWith(',')) {
            issues.push(createIssue(
                lineNum,
                Math.max(1, rawLine.lastIndexOf(',') + 1),
                `font-family の末尾に余分なカンマ（,）があります`,
                `末尾に続くフォント名を指定するか、不要なカンマを削除してください`,
                'error',
                rawLine
            ));
            return;
        }

        if (clean.includes(',,')) {
            issues.push(createIssue(
                lineNum,
                Math.max(1, rawLine.indexOf(',,') + 1),
                `font-family にカンマが2つ連続しています（,,）`,
                `カンマは1つ（,）にしてください`,
                'error',
                rawLine
            ));
            return;
        }

        // クォートおよび関数括弧（var(...)等）を考慮してカンマでトークン分割
        const tokens = [];
        let curTok = '';
        let inQ = null;
        let parenDepth = 0;
        for (let i = 0; i < clean.length; i++) {
            const ch = clean[i];
            if (inQ) {
                curTok += ch;
                if (ch === inQ) inQ = null;
            } else {
                if (ch === '"' || ch === "'") {
                    inQ = ch;
                    curTok += ch;
                } else if (ch === '(') {
                    parenDepth++;
                    curTok += ch;
                } else if (ch === ')') {
                    if (parenDepth > 0) parenDepth--;
                    curTok += ch;
                } else if (ch === ',' && parenDepth === 0) {
                    tokens.push(curTok.trim());
                    curTok = '';
                } else {
                    curTok += ch;
                }
            }
        }
        tokens.push(curTok.trim());

        let hasGenericOrValid = false;
        const placeholderWords = new Set(['hoge', 'hogehoge', 'fuga', 'piyo', 'test', 'foo', 'bar', 'baz', 'asdf', 'abc', 'xyz']);

        for (let t = 0; t < tokens.length; t++) {
            const rawTok = tokens[t];
            if (!rawTok) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf('font-family') + 1),
                    `font-family のカンマの間にフォント名が指定されていません`,
                    `フォント名を指定するか、余分なカンマを削除してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            const isQuoted = (rawTok.startsWith('"') && rawTok.endsWith('"')) || (rawTok.startsWith("'") && rawTok.endsWith("'"));
            const unquoted = isQuoted ? rawTok.slice(1, -1).trim() : rawTok.trim();
            const unquotedLow = unquoted.toLowerCase();

            if (isQuoted && !unquoted) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(rawTok) + 1),
                    `空のフォント名「""」が指定されています`,
                    `具体的なフォント名（例: "Segoe UI"）を指定してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // CSS変数・関数 (var(--font-ui), var(--font-code, ...) 等) は有効なフォント定義として許容
            if (/^var\s*\(/i.test(unquoted)) {
                hasGenericOrValid = true;
                continue;
            }

            // クォートなしで空白を含んでいる場合 (例: Segoe UI, Hiragino Sans)
            if (!isQuoted && /\s+/.test(unquoted)) {
                const parts = unquoted.split(/\s+/);
                const lastPartLow = parts[parts.length - 1].toLowerCase();
                if (CSS_GENERIC_FONT_FAMILIES.has(lastPartLow) || KNOWN_COMMON_FONT_FAMILIES.has(lastPartLow)) {
                    issues.push(createIssue(
                        lineNum,
                        Math.max(1, rawLine.indexOf(rawTok) + 1),
                        `フォント名の間をカンマ（,）で区切っていません（「${unquoted}」）`,
                        `「${parts.slice(0, -1).join(' ')}, ${parts[parts.length - 1]}」のようにカンマ（,）で区切ってください`,
                        'error',
                        rawLine
                    ));
                    continue;
                } else {
                    issues.push(createIssue(
                        lineNum,
                        Math.max(1, rawLine.indexOf(rawTok) + 1),
                        `空白を含むフォント名「${unquoted}」はダブルクォートで囲む必要があります`,
                        `「"${unquoted}"」のようにダブルクォート（"）で囲んでください`,
                        'error',
                        rawLine
                    ));
                    continue;
                }
            }

            // 数値のみ、または単位付き数値（123, 16px 等）
            if (/^[-+]?\d+(?:\.\d+)?(?:[a-zA-Z%]+)?$/.test(unquoted)) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(rawTok) + 1),
                    `フォント名に数値またはサイズ「${unquoted}」を指定することはできません`,
                    `フォントサイズは font-size プロパティで指定し、font-family にはフォント名（sans-serif など）を指定してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // CSS色名やプロパティキーワードなどの無関係な単語
            if (VALID_CSS_COLOR_NAMES.has(unquotedLow) && !isQuoted) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(rawTok) + 1),
                    `「${unquoted}」はフォント名ではなく色名です`,
                    `font-family には正しいフォント名または総称フォント名（sans-serif, serif 等）を指定してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // CSSグローバルキーワード (inherit, initial, unset)
            if (CSS_GLOBAL_KEYWORDS.has(unquotedLow)) {
                if (tokens.length > 1) {
                    issues.push(createIssue(
                        lineNum,
                        Math.max(1, rawLine.indexOf(rawTok) + 1),
                        `CSSキーワード「${unquoted}」は他のフォント名と併用することはできません`,
                        `「${unquoted}」を単独で指定するか、フォント名リストから削除してください`,
                        'error',
                        rawLine
                    ));
                }
                hasGenericOrValid = true;
                continue;
            }

            // 総称フォントファミリー名の検証・タイポ検知
            if (CSS_GENERIC_FONT_FAMILIES.has(unquotedLow)) {
                if (isQuoted) {
                    issues.push(createIssue(
                        lineNum,
                        Math.max(1, rawLine.indexOf(rawTok) + 1),
                        `総称フォント名「${unquoted}」にクォート（${rawTok[0]}）は付けません`,
                        `クォートを外して「${unquoted}」と記述してください`,
                        'error',
                        rawLine
                    ));
                }
                hasGenericOrValid = true;
                continue;
            }

            // 総称フォントファミリーのタイポ検知 (san-serif, sans-serf, monospac 等)
            const closestGeneric = findClosestInCollection(unquotedLow, CSS_GENERIC_FONT_FAMILIES, 2);
            if (closestGeneric) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(rawTok) + 1),
                    `総称フォント名「${unquoted}」は「${closestGeneric}」のスペルミスです`,
                    `「${closestGeneric}」に修正してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // 既知フォント名かどうかの確認
            if (KNOWN_COMMON_FONT_FAMILIES.has(unquotedLow)) {
                hasGenericOrValid = true;
                continue;
            }

            // 既知フォント名のタイポ検知（例: -aple-system, BlinkMacSystem, Robotoo 等）
            const closestKnown = findClosestInCollection(unquotedLow, KNOWN_COMMON_FONT_FAMILIES, 2);
            if (closestKnown) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(rawTok) + 1),
                    `フォント名「${unquoted}」は「${closestKnown}」のスペルミスではありませんか？`,
                    `「${closestKnown}」に修正するか、正しいフォント名を確認してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // プレースホルダー単語（hoge, test, asdf 等）
            if (placeholderWords.has(unquotedLow)) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(rawTok) + 1),
                    `フォント名「${unquoted}」は有効なフォント名ではありません`,
                    `正しいフォント名（例: -apple-system, "Segoe UI", Roboto）または総称フォント名（sans-serif, serif, monospace）を指定してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            if (!/^[a-zA-Z_一-龠ぁ-んァ-ヶ][a-zA-Z0-9_\s一-龠ぁ-んァ-ヶ-]*$/.test(unquoted)) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(rawTok) + 1),
                    `フォント名「${unquoted}」に不正な記号が含まれています`,
                    `有効なフォント名を入力してください`,
                    'error',
                    rawLine
                ));
                continue;
            }

            // その他のカスタムフォント名は許容
            hasGenericOrValid = true;
        }

        // 全体として有効な総称フォント名または既知フォントが1つも含まれていない場合
        if (!hasGenericOrValid && tokens.length > 0) {
            issues.push(createIssue(
                lineNum,
                Math.max(1, rawLine.indexOf('font-family') + 1),
                `CSSプロパティ「font-family」に有効なフォント名が指定されていません`,
                `末尾に総称フォント名（例: sans-serif）を含めたフォントリストを指定してください（例: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;）`,
                'error',
                rawLine
            ));
        }
    }

    /**
     * CSSのプロパティ値を検証するヘルパー（値キーワードのタイポ、不正なカラーコード、不正な単位、型違反を検出）
     */
    function validateCssPropertyValue(propName, valStr, lineNum, rawLine, issues) {
        if (!propName || !valStr) return;
        const lowProp = propName.toLowerCase();

        // font-family の詳細検証
        if (lowProp === 'font-family') {
            validateFontFamily(valStr, lineNum, rawLine, issues);
            return;
        }

        // !important を除去して評価
        const cleanVal = valStr.replace(/!important\s*$/i, '').trim();
        if (!cleanVal) return;

        // 0. 文字列リテラルを取らないCSSプロパティでダブルクォート・シングルクォートが使われた場合 (例: color: "#00ffff";)
        if (!CSS_STRING_ALLOWED_PROPERTIES.has(lowProp) && !lowProp.startsWith('--')) {
            const withoutUrl = cleanVal.replace(/url\([^)]*\)/gi, '');
            const quoteMatch = withoutUrl.match(/(["'])([^"']*)\1/);
            if (quoteMatch) {
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.indexOf(quoteMatch[0]) + 1),
                    `CSSの「${lowProp}」の値「${quoteMatch[0]}」にクォート（${quoteMatch[1]}）は不要です`,
                    `CSSでは「${lowProp}: ${quoteMatch[2]};」のようにクォート（" "）を外して指定してください`,
                    'error',
                    rawLine
                ));
                return;
            }
        }

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

        // 1.5 先頭の「#」が抜けた16進数カラーコード（例: 00ffff, ffff00, 080d1a 等）の事前検知
        const withoutFuncsAndStrings = cleanVal
            .replace(/"[^"]*"|'[^']*'/g, ' ')
            .replace(/url\([^)]*\)/gi, ' ')
            .replace(/[a-zA-Z_-]+\([^)]*\)/g, ' ');
        const bareTokens = withoutFuncsAndStrings.split(/[\s,/]+/).filter(Boolean);
        let foundUnhashedHex = false;
        const canContainColor = CSS_COLOR_ONLY_PROPERTIES.has(lowProp) ||
            CSS_BORDER_SHORTHAND_PROPERTIES.has(lowProp) ||
            lowProp === 'background' ||
            lowProp === 'box-shadow' ||
            lowProp === 'text-shadow' ||
            lowProp.startsWith('--');
        if (canContainColor) {
            for (const bTok of bareTokens) {
                if (bTok.startsWith('#')) continue;
                const bLow = bTok.toLowerCase();
                // 3桁・6桁・8桁の16進数で、英字(a-f)と数字の両方を含むか、6桁のa-fのみ（ffff00, 00ffff, ff00aa, ffffff 等）
                // ※ 100s, 200ms, 100dpcm 等の正当な数値+単位は除外
                const numUnitCheck = bLow.match(/^(-?\d+(?:\.\d+)?)([a-z%]+)$/);
                if (numUnitCheck && VALID_CSS_UNITS.has(numUnitCheck[2])) continue;
                if (/^[0-9a-f]{6}$/i.test(bTok) && (/[a-f]/i.test(bTok) || CSS_COLOR_ONLY_PROPERTIES.has(lowProp) || lowProp === 'background')) {
                    if (!VALID_CSS_COLOR_NAMES.has(bLow)) {
                        issues.push(createIssue(
                            lineNum,
                            Math.max(1, rawLine.lastIndexOf(bTok) + 1),
                            `カラーコード「${bTok}」の先頭に「#」がありません`,
                            `「#${bTok}」のように先頭に半角の「 # 」を付けて指定してください`,
                            'error',
                            rawLine
                        ));
                        foundUnhashedHex = true;
                    }
                } else if (/^[0-9a-f]{3}$/i.test(bTok) && /[0-9]/.test(bTok) && /[a-f]/i.test(bTok)) {
                    issues.push(createIssue(
                        lineNum,
                        Math.max(1, rawLine.lastIndexOf(bTok) + 1),
                        `カラーコード「${bTok}」の先頭に「#」がありません`,
                        `「#${bTok}」のように先頭に半角の「 # 」を付けて指定してください`,
                        'error',
                        rawLine
                    ));
                    foundUnhashedHex = true;
                }
            }
        }
        if (foundUnhashedHex) return;

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
            } else if (CSS_UNITLESS_NUMERIC_PROPERTIES.has(lowProp)) {
                // opacity は % のみ許容、z-index / flex-grow / flex-shrink / order は単位不可
                if (!(lowProp === 'opacity' && unit === '%')) {
                    issues.push(createIssue(
                        lineNum,
                        Math.max(1, rawLine.indexOf(uMatch[1] + uMatch[2]) + 1),
                        `CSSプロパティ「${lowProp}」には単位「${uMatch[2]}」を付けることはできません`,
                        `「${lowProp}: ${uMatch[1]};」のように単位なしの数値のみで指定してください`,
                        'error',
                        rawLine
                    ));
                }
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
                return;
            }
        }

        // 4. 色専用プロパティ (color, background-color, border-color 等) の値検証
        if (CSS_COLOR_ONLY_PROPERTIES.has(lowProp) && !cleanVal.includes('var(')) {
            const valLow = cleanVal.toLowerCase();
            if (!CSS_GLOBAL_KEYWORDS.has(valLow) && valLow !== 'currentcolor' && valLow !== 'transparent' && valLow !== 'none') {
                if (!cleanVal.startsWith('#') && !isValidCssColorString(cleanVal)) {
                    if (/^[0-9a-fA-F]{3,8}$/.test(cleanVal)) {
                        issues.push(createIssue(
                            lineNum,
                            Math.max(1, rawLine.lastIndexOf(cleanVal) + 1),
                            `カラーコード「${cleanVal}」の先頭に「#」がありません`,
                            `「#${cleanVal}」のように先頭に半角の「 # 」を付けてください`,
                            'error',
                            rawLine
                        ));
                    } else {
                        const closestColor = findClosestInCollection(valLow, VALID_CSS_COLOR_NAMES, 2);
                        issues.push(createIssue(
                            lineNum,
                            Math.max(1, rawLine.lastIndexOf(cleanVal) + 1),
                            `CSSプロパティ「${lowProp}」の色指定「${cleanVal}」は正しくありません`,
                            closestColor
                                ? `「${closestColor}」のスペルミスではありませんか？または「#ffffff」のようなカラーコードで指定してください`
                                : `「#00f0ff」のようなカラーコード、または正しい色名（red, white, transparent など）を指定してください`,
                            'error',
                            rawLine
                        ));
                    }
                }
            }
        }

        // 4.5 border / border-top / outline 等の複合ショートハンドおよび border-style / background の検証 (STEP 2 対策)
        if ((CSS_BORDER_SHORTHAND_PROPERTIES.has(lowProp) || lowProp === 'border-style' || lowProp === 'outline-style') && !cleanVal.startsWith('--')) {
            const strippedFuncs = cleanVal.replace(/[a-zA-Z_-]+\([^)]*\)/g, ' ');
            const tokens = strippedFuncs.split(/\s+/).filter(Boolean);
            for (const tok of tokens) {
                if (tok.startsWith('#') || /^[-+]?\d/.test(tok)) continue;
                const tokLow = tok.toLowerCase();
                if (CSS_GLOBAL_KEYWORDS.has(tokLow) || VALID_CSS_BORDER_STYLES.has(tokLow)) continue;
                if (CSS_BORDER_SHORTHAND_PROPERTIES.has(lowProp)) {
                    if (tokLow === 'thin' || tokLow === 'medium' || tokLow === 'thick') continue;
                    if (tokLow === 'transparent' || tokLow === 'currentcolor' || VALID_CSS_COLOR_NAMES.has(tokLow)) continue;
                }
                const closestStyle = findClosestInCollection(tokLow, VALID_CSS_BORDER_STYLES, 2);
                const closestColor = CSS_BORDER_SHORTHAND_PROPERTIES.has(lowProp) ? findClosestInCollection(tokLow, VALID_CSS_COLOR_NAMES, 2) : null;
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.lastIndexOf(tok) + 1),
                    `CSSプロパティ「${lowProp}」の値「${tok}」は正しくありません`,
                    closestStyle
                        ? `線の種類「${closestStyle}」のスペルミスではありませんか？（例: 2px ${closestStyle} #00ff66）`
                        : closestColor
                            ? `色名「${closestColor}」のスペルミスではありませんか？または「#00ff66」のようなカラーコードで指定してください`
                            : `「2px solid #00ff66」のように太さ・線の種類（solid, dashed 等）・色を指定してください`,
                    'error',
                    rawLine
                ));
            }
        } else if (lowProp === 'background' && !cleanVal.startsWith('--')) {
            const strippedFuncs = cleanVal.replace(/[a-zA-Z_-]+\([^)]*\)/g, ' ');
            const tokens = strippedFuncs.split(/[\s,/]+/).filter(Boolean);
            for (const tok of tokens) {
                if (tok.startsWith('#') || /^[-+]?\d/.test(tok)) continue;
                const tokLow = tok.toLowerCase();
                if (CSS_GLOBAL_KEYWORDS.has(tokLow) || VALID_CSS_BACKGROUND_KEYWORDS.has(tokLow) || VALID_CSS_COLOR_NAMES.has(tokLow)) continue;
                const closestColor = findClosestInCollection(tokLow, VALID_CSS_COLOR_NAMES, 2);
                const closestBgKw = findClosestInCollection(tokLow, VALID_CSS_BACKGROUND_KEYWORDS, 2);
                issues.push(createIssue(
                    lineNum,
                    Math.max(1, rawLine.lastIndexOf(tok) + 1),
                    `CSSプロパティ「background」の値「${tok}」は正しくありません`,
                    closestColor
                        ? `色名「${closestColor}」のスペルミスではありませんか？または「#080d1a」のようなカラーコードで指定してください`
                        : closestBgKw
                            ? `「${closestBgKw}」のスペルミスではありませんか？`
                            : `「#080d1a」のようなカラーコード、または正しい色名を指定してください`,
                    'error',
                    rawLine
                ));
            }
        }

        // 5. 数値・サイズ専用プロパティ (width, height, margin, padding, opacity, z-index 等) に不正な英単語が指定された場合
        if (CSS_NUMERIC_OR_LENGTH_PROPERTIES.has(lowProp) && !cleanVal.includes('(') && !cleanVal.startsWith('--')) {
            const tokens = cleanVal.split(/[\s/]+/).filter(Boolean);
            for (const tok of tokens) {
                const tokLow = tok.toLowerCase();
                if (/^[a-zA-Z-]+$/.test(tokLow)) {
                    if (!CSS_ALLOWED_LENGTH_KEYWORDS.has(tokLow) && !CSS_GLOBAL_KEYWORDS.has(tokLow)) {
                        const closestKw = findClosestInCollection(tokLow, CSS_ALLOWED_LENGTH_KEYWORDS, 2);
                        issues.push(createIssue(
                            lineNum,
                            Math.max(1, rawLine.lastIndexOf(tok) + 1),
                            `CSSプロパティ「${lowProp}」の値「${tok}」は正しくありません`,
                            closestKw
                                ? `「${closestKw}」のスペルミスではありませんか？または数値＋単位（例: 10px, 100%）を指定してください`
                                : `「${lowProp}」には数値＋単位（例: 16px, 100%）または auto などを指定してください`,
                            'error',
                            rawLine
                        ));
                    } else if (CSS_UNITLESS_NUMERIC_PROPERTIES.has(lowProp) && tokLow !== 'auto' && !CSS_GLOBAL_KEYWORDS.has(tokLow)) {
                        issues.push(createIssue(
                            lineNum,
                            Math.max(1, rawLine.lastIndexOf(tok) + 1),
                            `CSSプロパティ「${lowProp}」の値「${tok}」は正しくありません`,
                            `「${lowProp}」には数値を指定してください（例: ${lowProp === 'opacity' ? '0.8' : '1'}）`,
                            'error',
                            rawLine
                        ));
                    }
                }
            }
        }
    }

    /**
     * 6. CSS (style.css / <style>) チェック
     * （プロパティ名タイポ・値タイポ・単位ミス・セミコロン抜け・中括弧抜け・擬似クラスタイポ・未閉じコメント・孤立テキストまで完全対応）
     */
    function checkCSS(code, lineOffset) {
        const offset = lineOffset || 0;
        const issues = [];
        const lines = code.split('\n');
        let inBlockComment = false;
        let blockCommentStartLine = 1;
        let blockCommentStartCol = 1;
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
                    blockCommentStartLine = i + 1;
                    blockCommentStartCol = openIdx + 1;
                    line = line.substring(0, openIdx);
                    break;
                }
            }
            cleanLines.push(line);
        }

        if (inBlockComment) {
            issues.push(createIssue(
                offset + blockCommentStartLine,
                blockCommentStartCol,
                `CSSのコメント「 /* 」が閉じられていません（対応する「 */ 」がありません）`,
                `コメントの終わりに「 */ 」を追加してください`,
                'error',
                lines[blockCommentStartLine - 1] || ''
            ));
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
                } else if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
                    issues.push(createIssue(
                        offset + lineIdx + 1,
                        Math.max(1, rawLine.indexOf(trimmed) + 1),
                        `CSSブロック内に不完全な記述「${trimmed}」があります`,
                        `「 プロパティ名: 値; 」の形式で記述するか、不要な文字を削除してください`,
                        'error',
                        rawLine
                    ));
                }
                return;
            }
            if (trimmed.includes('::')) {
                issues.push(createIssue(
                    offset + lineIdx + 1,
                    Math.max(1, rawLine.indexOf('::') + 1),
                    `CSSのプロパティ宣言でコロンが2つ連続しています（::）`,
                    `プロパティ名と値の間はコロン1つ（:）にしてください`,
                    'error',
                    rawLine
                ));
            }
            if (trimmed.includes(';;')) {
                issues.push(createIssue(
                    offset + lineIdx + 1,
                    Math.max(1, rawLine.indexOf(';;') + 1),
                    `CSSのセミコロンが2つ連続しています（;;）`,
                    `行末のセミコロンは1つ（;）にしてください`,
                    'error',
                    rawLine
                ));
            }
            const colonIdx = trimmed.indexOf(':');
            const propName = trimmed.substring(0, colonIdx).trim();
            const valPart = trimmed.substring(colonIdx + 1).replace(/^:+/, '').replace(/;/g, '').trim();

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
                const valWithoutUrlAndQuotes = valPart.replace(/url\([^)]*\)/gi, '').replace(/"[^"]*"|'[^']*'/g, '');
                if (valWithoutUrlAndQuotes.includes(':')) {
                    issues.push(createIssue(
                        offset + lineIdx + 1,
                        Math.max(1, rawLine.lastIndexOf(':') + 1),
                        `1行に複数のCSSプロパティがセミコロン（;）なしで並んでいます`,
                        `各プロパティの後ろを「 ; 」で区切るか、改行して1行ずつ記述してください`,
                        'error',
                        rawLine
                    ));
                } else {
                    validateCssPropertyValue(propName, valPart, offset + lineIdx + 1, rawLine, issues);
                }
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

        // セレクタ部分の構文・@ルール・擬似クラスタイポ検査
        function checkCssSelector(selectorText, lineIdx, rawLine) {
            const sel = selectorText.trim();
            if (!sel || sel === 'from' || sel === 'to' || /^[\d.%\s,]+$/.test(sel)) return;

            if (sel.startsWith('@')) {
                const atMatch = sel.match(/^@([a-zA-Z-]+)/);
                if (atMatch) {
                    const atName = atMatch[1].toLowerCase();
                    if (!VALID_CSS_AT_RULES.has(atName)) {
                        const closestAt = findClosestInCollection(atName, VALID_CSS_AT_RULES, 2);
                        issues.push(createIssue(
                            offset + lineIdx + 1,
                            Math.max(1, rawLine.indexOf('@') + 1),
                            `CSSの「@${atMatch[1]}」は存在しない @ルールです`,
                            closestAt
                                ? `「@${closestAt}」のスペルミスではありませんか？`
                                : `@media や @keyframes など正しい @ルール名を指定してください`,
                            'error',
                            rawLine
                        ));
                    }
                }
                return;
            }

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
            // セレクタ内のタグ名・識別子（#id, .class, [attr], :pseudo, *, >, +, ~ を除いた英単語）が有効なHTMLタグ名か検証
            const withoutAttrAndPseudo = sel
                .replace(/\[[^\]]*\]/g, ' ')
                .replace(/::?[a-zA-Z-]+(?:\([^)]*\))?/g, ' ')
                .replace(/[#.][a-zA-Z_-][a-zA-Z0-9_-]*/g, ' ');
            const tagTokens = withoutAttrAndPseudo.split(/[\s>+~,]+/).filter(Boolean);
            for (const tok of tagTokens) {
                if (tok === '*' || /^[\d.%]+$/.test(tok)) continue;
                const lowTok = tok.toLowerCase();
                if (!KNOWN_HTML_TAGS.has(lowTok) && !KNOWN_HTML_TAGS.has(tok)) {
                    const closestTag = findClosestInCollection(lowTok, KNOWN_HTML_TAGS, 2);
                    issues.push(createIssue(
                        offset + lineIdx + 1,
                        Math.max(1, rawLine.indexOf(tok) + 1),
                        `CSSセレクタに不明な要素名または不要な文字「${tok}」があります`,
                        closestTag
                            ? `HTMLタグ「${closestTag}」のスペルミスか、クラス「.${tok}」・ID「#${tok}」の記号抜けではありませんか？`
                            : `クラスなら先頭に「.」、IDなら先頭に「#」を付けるか、不要な文字であれば削除してください`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        // 構文解析
        let pendingProperty = null; // 複数行にわたるプロパティ宣言の追跡
        let insideAtMedia = false;
        let atMediaDepth = 0;
        let insideAtKeyframes = false;
        let atKeyframesDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const clean = cleanLines[i].trim();

            if (!clean) continue;

            const hasOpenBrace = clean.includes('{');
            const hasCloseBrace = clean.includes('}');
            const depthBeforeLine = braceDepth;

            if (hasOpenBrace && /^@media\b/i.test(clean)) {
                insideAtMedia = true;
                atMediaDepth = depthBeforeLine + 1;
            }
            if (hasOpenBrace && /^@(?:-webkit-)?keyframes\b/i.test(clean)) {
                insideAtKeyframes = true;
                atKeyframesDepth = depthBeforeLine + 1;
            }

            // 1行完結ルール（例: 0%, 49% { opacity: 1; } や .box { positio: relative; }）の検査
            if (hasOpenBrace && hasCloseBrace) {
                const openIdx = clean.indexOf('{');
                const closeIdx = clean.lastIndexOf('}');
                if (openIdx < closeIdx) {
                    const selPart = clean.substring(0, openIdx).trim();
                    const innerPart = clean.substring(openIdx + 1, closeIdx).trim();
                    if (selPart) checkCssSelector(selPart, i, rawLine);
                    if (innerPart && !innerPart.includes('{')) {
                        if (innerPart.includes(';;')) {
                            issues.push(createIssue(
                                offset + i + 1,
                                Math.max(1, rawLine.indexOf(';;') + 1),
                                `CSSのセミコロンが2つ連続しています（;;）`,
                                `セミコロンは1つ（;）にしてください`,
                                'error',
                                rawLine
                            ));
                        }
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
                    if (insideAtMedia && braceDepth < atMediaDepth) {
                        insideAtMedia = false;
                    }
                    if (insideAtKeyframes && braceDepth < atKeyframesDepth) {
                        insideAtKeyframes = false;
                    }
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

            // 中括弧「{」の外（depth === 0）に書かれた行の検査
            if (!hasOpenBrace && !hasCloseBrace && depthBeforeLine === 0) {
                if (clean.startsWith('@')) {
                    checkCssSelector(clean, i, rawLine);
                    continue;
                }
                if (clean.includes(':')) {
                    const colonIdx = clean.indexOf(':');
                    const propCandidate = clean.substring(0, colonIdx).trim();
                    const afterColon = clean.substring(colonIdx);
                    const isPseudoSelector = /^:(?:not|is|where|has|hover|focus|active|visited|disabled|checked|first-child|last-child|nth-child|root|empty|before|after)\b/i.test(afterColon);
                    if (!isPseudoSelector && !clean.endsWith(',') && /^[a-zA-Z-]+$/.test(propCandidate)) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.indexOf(propCandidate) + 1),
                            `CSSプロパティ「${propCandidate}」が波括弧「 { ... } 」の外に書かれています`,
                            `セレクタの後ろに開き波括弧「 { 」があるか確認してください`,
                            'error',
                            rawLine
                        ));
                        checkSingleCssDeclaration(clean, i, rawLine, true);
                        continue;
                    }
                }
                // 複数行セレクタ（直後の非空行が { で始まる、またはカンマ区切りで次行へ続くセレクタ）かどうかを確認
                let leadsToOpenBrace = false;
                for (let j = i + 1; j < lines.length; j++) {
                    const nextClean = cleanLines[j].trim();
                    if (!nextClean) continue;
                    if (nextClean.startsWith('{') || (clean.endsWith(',') && nextClean.includes('{'))) {
                        leadsToOpenBrace = true;
                        break;
                    }
                    if (clean.endsWith(',') && (nextClean.endsWith(',') || nextClean.includes('{'))) {
                        continue;
                    }
                    break;
                }
                if (leadsToOpenBrace) {
                    checkCssSelector(clean.replace(/,\s*$/, ''), i, rawLine);
                } else {
                    issues.push(createIssue(
                        offset + i + 1,
                        Math.max(1, rawLine.indexOf(clean) + 1),
                        `CSSのセレクタまたは記述「${clean}」の後に波括弧「 { ... } 」がありません`,
                        `セレクタの後ろに「 { プロパティ: 値; } 」を書くか、不要なテキストであれば削除してください`,
                        'error',
                        rawLine
                    ));
                }
                continue;
            }

            if (!hasOpenBrace && !hasCloseBrace && braceDepth > 0) {
                if (pendingProperty) {
                    // もし現在の行が新しいプロパティ宣言（例: margin: 0;）である場合、
                    // 直前の pendingProperty は値が入力されないまま新しい行が始まったと判定してエラーを発行
                    const isNewPropertyDeclaration = clean.includes(':') && !clean.startsWith('@') && /^[a-zA-Z_-][a-zA-Z0-9_-]*\s*:/.test(clean);
                    if (isNewPropertyDeclaration) {
                        issues.push(createIssue(
                            offset + pendingProperty.line,
                            pendingProperty.col,
                            `CSSのプロパティ値が入力されていません`,
                            `コロン（:）の後に色やサイズなどの値を入力してください（例: ${pendingProperty.propName}: ...;）`,
                            'error',
                            lines[pendingProperty.line - 1]
                        ));
                        pendingProperty = null;
                    }
                }

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
                    if (clean.includes('::') && !(insideAtMedia && braceDepth === atMediaDepth)) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.indexOf('::') + 1),
                            `CSSのプロパティ宣言でコロンが2つ連続しています（::）`,
                            `プロパティ名と値の間はコロン1つ（:）にしてください`,
                            'error',
                            rawLine
                        ));
                    }
                    if (clean.includes(';;')) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.indexOf(';;') + 1),
                            `CSSのセミコロンが2つ連続しています（;;）`,
                            `行末のセミコロンは1つ（;）にしてください`,
                            'error',
                            rawLine
                        ));
                    }

                    const colonIdx = clean.indexOf(':');
                    const propName = clean.substring(0, colonIdx).trim();
                    const valPart = clean.substring(colonIdx + 1).replace(/^:+/, '').replace(/;/g, '').trim();

                    // セレクタが閉じ括弧なしで次のセレクタに入った場合の検知 (例: .btn:hover { が来る前に前ブロックの } が抜けた)
                    if (propName.includes(' ') || propName.startsWith('.') || propName.startsWith('#')) {
                        if (insideAtMedia && braceDepth === atMediaDepth) {
                            // @media 直下の複数行セレクタ行
                            checkCssSelector(clean, i, rawLine);
                            continue;
                        }
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

                    // 1行にセミコロンなしで複数プロパティが書かれた場合の検知 (例: width: 100px height: 50px;)
                    const valWithoutUrlAndQuotes = valPart.replace(/url\([^)]*\)/gi, '').replace(/"[^"]*"|'[^']*'/g, '');
                    if (!clean.slice(colonIdx + 1).includes(';') && valWithoutUrlAndQuotes.includes(':')) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.lastIndexOf(':') + 1),
                            `1行に複数のCSSプロパティがセミコロン（;）なしで並んでいます`,
                            `各プロパティの後ろを「 ; 」で区切るか、改行して1行ずつ記述してください`,
                            'error',
                            rawLine
                        ));
                        continue;
                    }
                    // 行末に ; はあるが途中に別の : がある場合 (例: width: 100px height: 50px;)
                    const semiParts = clean.split(';').map(s => s.trim()).filter(Boolean);
                    if (semiParts.length > 1) {
                        for (const sp of semiParts) {
                            checkSingleCssDeclaration(sp + ';', i, rawLine, false);
                        }
                        continue;
                    } else if (valWithoutUrlAndQuotes.includes(':')) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.lastIndexOf(':') + 1),
                            `1行に複数のCSSプロパティがセミコロン（;）なしで並んでいます`,
                            `前のプロパティの後ろに「 ; 」を追加してください`,
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
                    if (insideAtMedia && braceDepth === atMediaDepth) {
                        // @media 内の複数行セレクタか確認
                        let leadsToOpenBrace = false;
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextClean = cleanLines[j].trim();
                            if (!nextClean) continue;
                            if (nextClean.includes('{')) { leadsToOpenBrace = true; break; }
                            if (nextClean.includes('}') || nextClean.includes(';')) break;
                        }
                        if (leadsToOpenBrace) continue;
                    }
                    if (insideAtKeyframes && braceDepth === atKeyframesDepth) {
                        // @keyframes 内のキーフレームセレクタ (from, to, 0% 等)
                        let leadsToOpenBrace = false;
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextClean = cleanLines[j].trim();
                            if (!nextClean) continue;
                            if (nextClean.includes('{')) { leadsToOpenBrace = true; break; }
                            if (nextClean.includes('}') || nextClean.includes(';')) break;
                        }
                        if (leadsToOpenBrace) continue;
                    }
                    issues.push(createIssue(
                        offset + i + 1,
                        rawLine.indexOf(clean) + 1,
                        `CSSのプロパティ名と値の間にコロン（:）がありません`,
                        `「 プロパティ名: 値; 」のようにコロン（:）で区切ってください`,
                        'error',
                        rawLine
                    ));
                } else if (insideAtKeyframes && braceDepth === atKeyframesDepth) {
                    // @keyframes 内のキーフレームセレクタ (0%, 50%, 100% など)
                    let leadsToOpenBrace = false;
                    for (let j = i + 1; j < lines.length; j++) {
                        const nextClean = cleanLines[j].trim();
                        if (!nextClean) continue;
                        if (nextClean.includes('{')) { leadsToOpenBrace = true; break; }
                        if (nextClean.includes('}') || nextClean.includes(';')) break;
                    }
                    if (!leadsToOpenBrace && !clean.endsWith(',')) {
                        issues.push(createIssue(
                            offset + i + 1,
                            Math.max(1, rawLine.indexOf(clean) + 1),
                            `キーフレームセレクタ「${clean}」の後に波括弧「 { 」がありません`,
                            `キーフレームの後ろに「 { ... } 」を記述してください`,
                            'error',
                            rawLine
                        ));
                    }
                } else if (!(insideAtMedia && braceDepth === atMediaDepth && clean.endsWith(','))) {
                    issues.push(createIssue(
                        offset + i + 1,
                        Math.max(1, rawLine.indexOf(clean) + 1),
                        `CSSブロック内に不正な記述「${clean}」があります`,
                        `「 プロパティ名: 値; 」の形式で記述するか、不要な文字を削除してください`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        return issues;
    }

    const VALID_HTML_BOOLEAN_ATTRIBUTES = new Set([
        'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
        'crossorigin', 'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'inert',
        'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nomodule',
        'novalidate', 'open', 'playsinline', 'readonly', 'required', 'reversed',
        'selected', 'shadowrootclonable', 'shadowrootdelegatesfocus', 'shadowrootserializable'
    ]);

    const SVG_SELF_CLOSING_TAGS = new Set([
        'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
        'use', 'stop', 'g', 'defs', 'clippath', 'lineargradient', 'radialgradient', 'mask', 'pattern', 'image'
    ]);

    /**
     * 7. HTML (index.html) チェック
     * （タグ対応・タグ名タイポ・属性タイポ・属性クォート・未閉じ山括弧・未閉じコメント・重複ID・不要な文字・インラインScript・インラインStyle）
     */
    function checkHTML(code, changedLines) {
        const issues = [];
        const lines = code.split('\n');

        let inComment = false;
        let commentStartLine = 1;
        let commentStartCol = 1;
        let inScript = false;
        let inStyle = false;
        let scriptLines = [];
        let scriptStartLine = 0;
        let styleLines = [];
        let styleStartLine = 0;
        const tagStack = [];
        const seenHtmlIds = new Map(); // id -> lineNum

        function checkOutsideTagSegment(segText, lineIdx, segStartCol, rawLine) {
            if (!segText) return;
            // タグ外に孤立した「>」がある場合（例: <div id="a">> や </div>>）
            const strayGtIdx = segText.indexOf('>');
            if (strayGtIdx !== -1) {
                issues.push(createIssue(
                    lineIdx + 1,
                    segStartCol + strayGtIdx,
                    `HTMLタグの外に余分な閉じ山括弧「 > 」があります`,
                    `「 > 」が2つ連続していないか、または開始の「 < 」が消えていないか確認してください`,
                    'error',
                    rawLine
                ));
            }
            // <body> の外、または <body> / <head> / <html> / <select> / <svg> 直下に書かれた不要なテキスト・開始 '<' 抜けタグの検出
            const trimmedSeg = segText.replace(/>/g, '').trim();
            if (trimmedSeg) {
                const insideBody = tagStack.some(t => t.tag === 'body');
                const topTag = tagStack.length > 0 ? tagStack[tagStack.length - 1].tag : null;
                const looksLikeBrokenTag = /\b(?:id|class|src|href|style|type|rel|width|height|data-[a-z-]+)\s*=/i.test(trimmedSeg) ||
                    /^(?:div|span|canvas|script|link|meta|title|head|body|html|button|img|a|p|h[1-6])\b/i.test(trimmedSeg);
                const isDirectContainerText = topTag === 'body' || topTag === 'head' || topTag === 'html' || topTag === 'select' || topTag === 'svg' || topTag === 'tr' || topTag === 'ul' || topTag === 'ol';
                if ((!insideBody && topTag !== 'title') || looksLikeBrokenTag || isDirectContainerText) {
                    issues.push(createIssue(
                        lineIdx + 1,
                        Math.max(1, rawLine.indexOf(trimmedSeg) + 1),
                        looksLikeBrokenTag
                            ? `HTMLタグの先頭の「 < 」が抜けているか、タグの外に属性「${trimmedSeg.slice(0, 25)}」が書かれています`
                            : `HTMLタグの外に不要な文字「${trimmedSeg.slice(0, 25)}」が書かれています`,
                        `タグの先頭に「 < 」があるか確認するか、不要な文字を削除してください`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            let line = rawLine;

            // コメント処理 (<!-- ... -->)
            if (inComment) {
                const closeIdx = line.indexOf('-->');
                if (closeIdx !== -1) {
                    inComment = false;
                    line = ' '.repeat(closeIdx + 3) + line.substring(closeIdx + 3);
                } else {
                    continue;
                }
            }
            while (true) {
                const openIdx = line.indexOf('<!--');
                if (openIdx === -1) break;
                const closeIdx = line.indexOf('-->', openIdx + 4);
                if (closeIdx !== -1) {
                    line = line.substring(0, openIdx) + ' '.repeat(closeIdx + 3 - openIdx) + line.substring(closeIdx + 3);
                } else {
                    inComment = true;
                    commentStartLine = i + 1;
                    commentStartCol = openIdx + 1;
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
                        // Cloudflare や Live Server 等の開発インフラ自動注入スクリプトは構文チェック対象外
                        const isPlatformInjected = /\/cdn-cgi\/|__CF\$cv\$params|cloudflare|\brefreshCSS\b|live-server|Live-Reloading|IsThisFirstTime_Log_From_LiveServer/i.test(scriptCode);
                        if (!isPlatformInjected) {
                            let jsIssues = []
                                .concat(checkFullwidthCharacters('inline.js', scriptCode))
                                .concat(checkUnclosedQuotes('inline.js', scriptCode))
                                .concat(checkBracketPairs('inline.js', scriptCode))
                                .concat(checkJavaScriptNativeSyntax(scriptCode, null, false));
                            if (jsIssues.length === 0) {
                                jsIssues = jsIssues.concat(checkJavaScriptSemanticAndConfigRefs('inline.js', scriptCode));
                            }
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
                        }
                        scriptLines = [];
                    }
                    if (tagStack.length > 0 && tagStack[tagStack.length - 1].tag === 'script') {
                        tagStack.pop();
                    }
                    line = ' '.repeat(closeMatch.index + closeMatch[0].length) + line.substring(closeMatch.index + closeMatch[0].length);
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
                            .concat(checkFullwidthCharacters('inline.css', styleCode))
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
                    line = ' '.repeat(closeMatch.index + closeMatch[0].length) + line.substring(closeMatch.index + closeMatch[0].length);
                } else {
                    styleLines.push(rawLine);
                    continue;
                }
            }

            // 行内のタグと属性クォートを走査
            let pos = 0;
            while (pos < line.length) {
                const ltIdx = line.indexOf('<', pos);
                if (ltIdx === -1) {
                    checkOutsideTagSegment(line.substring(pos), i, pos + 1, rawLine);
                    break;
                }

                if (ltIdx > pos) {
                    checkOutsideTagSegment(line.substring(pos, ltIdx), i, pos + 1, rawLine);
                }

                // '<' から '>' までを探す（クォート内を考慮）
                let gtIdx = -1;
                let quoteChar = null;
                let quoteStartCol = 0;
                let unquotedQuoteIssue = false;
                for (let k = ltIdx + 1; k < line.length; k++) {
                    const ch = line[k];
                    if (quoteChar) {
                        if (ch === quoteChar) quoteChar = null;
                    } else {
                        if (ch === '"' || ch === "'") {
                            // 直前が「=」または空白でないのにクォートが現れた場合（例: id=gameCanvas" のような開きクォート抜け）
                            const prevChar = line[k - 1];
                            if (prevChar && prevChar !== '=' && !/\s/.test(prevChar)) {
                                issues.push(createIssue(
                                    i + 1,
                                    k + 1,
                                    `HTML属性の値を囲む開始の「 ${ch} 」が抜けています`,
                                    `「=」の直後に「 ${ch} 」を付けて属性値を囲んでください（例: id="gameCanvas"）`,
                                    'error',
                                    rawLine
                                ));
                                unquotedQuoteIssue = true;
                                break;
                            }
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

                if (unquotedQuoteIssue) {
                    break;
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

                let tagContent = '';
                let tagLineIdx = i;
                let tagRawLine = rawLine;
                if (gtIdx === -1) {
                    // 次の行にまたがる複数行タグのルックアヘッド走査
                    let multilineContent = line.substring(ltIdx + 1);
                    let foundGtInNext = false;
                    let foundGtLineIdx = -1;
                    let foundGtCol = -1;

                    if (!multilineContent.includes('<')) {
                        let curQuote = quoteChar;
                        for (let nextI = i + 1; nextI < lines.length; nextI++) {
                            const nextRaw = lines[nextI];
                            let nextGt = -1;
                            for (let k = 0; k < nextRaw.length; k++) {
                                const ch = nextRaw[k];
                                if (curQuote) {
                                    if (ch === curQuote) curQuote = null;
                                } else {
                                    if (ch === '"' || ch === "'") {
                                        curQuote = ch;
                                    } else if (ch === '>') {
                                        nextGt = k;
                                        break;
                                    } else if (ch === '<') {
                                        break;
                                    }
                                }
                            }
                            if (nextGt !== -1) {
                                multilineContent += ' ' + nextRaw.substring(0, nextGt);
                                foundGtInNext = true;
                                foundGtLineIdx = nextI;
                                foundGtCol = nextGt;
                                break;
                            }
                            if (nextRaw.includes('<')) break;
                            multilineContent += ' ' + nextRaw;
                        }
                    }

                    if (foundGtInNext) {
                        tagContent = multilineContent.trim();
                        i = foundGtLineIdx;
                        line = lines[i];
                        pos = foundGtCol + 1;
                    } else {
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
                } else {
                    tagContent = line.substring(ltIdx + 1, gtIdx).trim();
                    pos = gtIdx + 1;
                }

                if (!tagContent) {
                    issues.push(createIssue(
                        tagLineIdx + 1,
                        ltIdx + 1,
                        `空のHTMLタグ「<>」があります`,
                        `正しいタグ名を入力するか、不要な「<>」を削除してください`,
                        'error',
                        tagRawLine
                    ));
                    continue;
                }
                if (tagContent.startsWith('!')) {
                    if (!/^!doctype\s+html$/i.test(tagContent.trim())) {
                        issues.push(createIssue(
                            tagLineIdx + 1,
                            ltIdx + 1,
                            `DOCTYPE宣言またはコメント「<${tagContent}>」の形式が正しくありません`,
                            `「<!DOCTYPE html>」またはコメント「<!-- ... -->」の形式で記述してください`,
                            'error',
                            tagRawLine
                        ));
                    }
                    continue;
                }

                const isClosing = tagContent.startsWith('/');
                const isSelfClosing = tagContent.endsWith('/');
                const nameMatch = tagContent.replace(/^\//, '').match(/^([a-zA-Z0-9-]+)/);
                if (!nameMatch) {
                    issues.push(createIssue(
                        tagLineIdx + 1,
                        ltIdx + 1,
                        `HTMLタグ「<${tagContent}>」の書き方が正しくありません`,
                        `正しいHTMLタグ名を指定してください`,
                        'error',
                        tagRawLine
                    ));
                    continue;
                }

                const rawTagName = nameMatch[1];
                const tagName = rawTagName.toLowerCase();

                // HTMLタグ名のスペルミス検証（カスタム要素のハイフン入りは除外）
                if (!tagName.includes('-') && !KNOWN_HTML_TAGS.has(tagName) && !KNOWN_HTML_TAGS.has(rawTagName)) {
                    const closestTag = findClosestInCollection(tagName, KNOWN_HTML_TAGS, 2);
                    issues.push(createIssue(
                        tagLineIdx + 1,
                        ltIdx + 2,
                        `HTMLタグ「<${isClosing ? '/' : ''}${rawTagName}>」は存在しないタグ名です`,
                        closestTag
                            ? `「<${isClosing ? '/' : ''}${closestTag}>」のスペルミスではありませんか？`
                            : `HTMLタグ名のスペルを確認してください`,
                        'error',
                        tagRawLine
                    ));
                }

                // 開始タグの属性チェック（スペルミス・クォート忘れ・重複ID・インラインstyle等）
                if (!isClosing) {
                    const attrPart = tagContent.slice(rawTagName.length).replace(/\/$/, '').trim();
                    if (attrPart) {
                        const attrRegex = /([a-zA-Z_][a-zA-Z0-9_:-]*)\s*(?:(\s*=\s*)(\x22[^\x22]*\x22|\x27[^\x27]*\x27|[^\s\x22\x27=<>\x60]+)?)?/g;
                        let aMatch;
                        while ((aMatch = attrRegex.exec(attrPart)) !== null) {
                            const attrName = aMatch[1];
                            const hasEquals = Boolean(aMatch[2]);
                            const rawAttrVal = aMatch[3];
                            const attrLow = attrName.toLowerCase();

                            if (HTML_ATTR_TYPOS[attrLow]) {
                                const correctAttr = HTML_ATTR_TYPOS[attrLow];
                                issues.push(createIssue(
                                    tagLineIdx + 1,
                                    Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                    `HTML属性「${attrName}」は「${correctAttr}」のスペルミスです`,
                                    `「${correctAttr}="..."」に書き直してください`,
                                    'error',
                                    tagRawLine
                                ));
                            }

                            // タグと属性の組み合わせミス (<script href="...">, <link src="...">, <a src="...">, <img href="...">)
                            if (tagName === 'script' && attrLow === 'href') {
                                issues.push(createIssue(
                                    tagLineIdx + 1,
                                    Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                    `<script>タグでは「href」ではなく「src」属性を使います`,
                                    `<script src="core.js"></script> のように「src="..."」で指定してください`,
                                    'error',
                                    tagRawLine
                                ));
                            } else if ((tagName === 'link' || tagName === 'a') && attrLow === 'src') {
                                issues.push(createIssue(
                                    tagLineIdx + 1,
                                    Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                    `<${tagName}>タグでは「src」ではなく「href」属性を使います`,
                                    `「href="..."」に書き直してください`,
                                    'error',
                                    tagRawLine
                                ));
                            } else if (tagName === 'img' && attrLow === 'href') {
                                issues.push(createIssue(
                                    tagLineIdx + 1,
                                    Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                    `<img>タグでは「href」ではなく「src」属性を使います`,
                                    `「src="..."」に書き直してください`,
                                    'error',
                                    tagRawLine
                                ));
                            }

                            if (hasEquals && rawAttrVal === undefined) {
                                issues.push(createIssue(
                                    tagLineIdx + 1,
                                    Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                    `HTML属性「${attrName}=」の後に値が指定されていません`,
                                    `「${attrName}="..."」のようにダブルクォートで囲んだ値を指定してください`,
                                    'error',
                                    tagRawLine
                                ));
                            } else if (hasEquals && rawAttrVal !== undefined) {
                                // クォートなしで属性値が書かれている場合 (例: id=gameCanvas)
                                if (!((rawAttrVal.startsWith('"') && rawAttrVal.endsWith('"')) || (rawAttrVal.startsWith("'") && rawAttrVal.endsWith("'")))) {
                                    issues.push(createIssue(
                                        tagLineIdx + 1,
                                        Math.max(1, tagRawLine.indexOf(rawAttrVal, ltIdx) + 1),
                                        `HTML属性「${attrName}」の値「${rawAttrVal}」がダブルクォート（"）で囲まれていません`,
                                        `「${attrName}="${rawAttrVal.replace(/["']/g, '')}"」のようにダブルクォート（"）で囲んでください`,
                                        'error',
                                        tagRawLine
                                    ));
                                } else {
                                    const unquotedVal = rawAttrVal.slice(1, -1);
                                    if (attrLow === 'id') {
                                        const trimmedId = unquotedVal.trim();
                                        if (!trimmedId) {
                                            issues.push(createIssue(
                                                tagLineIdx + 1,
                                                Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                                `id属性の値が空（id=""）になっています`,
                                                `固有のid名を指定してください`,
                                                'error',
                                                tagRawLine
                                            ));
                                        } else if (seenHtmlIds.has(trimmedId)) {
                                            const prevLine = seenHtmlIds.get(trimmedId);
                                            issues.push(createIssue(
                                                tagLineIdx + 1,
                                                Math.max(1, tagRawLine.indexOf(trimmedId, ltIdx) + 1),
                                                `HTML内に同じ id="${trimmedId}" が複数回使われています（行 ${prevLine} と重複）`,
                                                `HTMLの id はページ内で1つだけになるように固有の名前を指定してください`,
                                                'error',
                                                tagRawLine
                                            ));
                                        } else {
                                            seenHtmlIds.set(trimmedId, tagLineIdx + 1);
                                        }
                                    } else if ((attrLow === 'src' && tagName !== 'iframe' && !tagContent.includes('image-viewer-img')) || attrLow === 'href') {
                                        if (!unquotedVal.trim()) {
                                            issues.push(createIssue(
                                                tagLineIdx + 1,
                                                Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                                `HTML属性「${attrName}=""」の値が空になっています`,
                                                attrLow === 'href' && tagName === 'link'
                                                    ? `「href="assets/octopus.png"」や「href="style.css"」のように読み込むファイル名を指定してください`
                                                    : `「${attrName}="..."」の中にファイル名やパスを指定してください`,
                                                'error',
                                                tagRawLine
                                            ));
                                        }
                                    } else if (attrLow === 'data-diff') {
                                        const diffVal = unquotedVal.trim();
                                        if (!['easy', 'normal', 'hard'].includes(diffVal)) {
                                            issues.push(createIssue(
                                                tagLineIdx + 1,
                                                Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                                `data-diff属性の値「${unquotedVal}」は正しくありません`,
                                                `"easy"、"normal"、"hard" のいずれかを指定してください`,
                                                'error',
                                                tagRawLine
                                            ));
                                        }
                                    } else if (attrLow === 'data-waves') {
                                        const wavesVal = unquotedVal.trim();
                                        if (!/^[1-9]\d*$/.test(wavesVal) || Number(wavesVal) > 10) {
                                            issues.push(createIssue(
                                                tagLineIdx + 1,
                                                Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                                `data-waves属性の値「${unquotedVal}」には 1〜10 の整数を指定してください`,
                                                `例: data-waves="3"`,
                                                'error',
                                                tagRawLine
                                            ));
                                        }
                                    } else if ((attrLow === 'width' || attrLow === 'height') && tagName === 'canvas') {
                                        const dimVal = unquotedVal.trim();
                                        if (!/^[1-9]\d*$/.test(dimVal)) {
                                            issues.push(createIssue(
                                                tagLineIdx + 1,
                                                Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                                `<canvas>の${attrLow}属性「${unquotedVal}」には 1 以上の半角数値を指定してください`,
                                                `単位（pxなど）は付けずに数値のみを指定してください（例: ${attrLow}="480"）`,
                                                'error',
                                                tagRawLine
                                            ));
                                        }
                                    } else if (attrLow === 'style') {
                                        // インライン style="..." のCSSプロパティ・値チェック
                                        const inlineCssBlock = `.inline-style { ${unquotedVal} }`;
                                        const inlineCssIssues = checkCSS(inlineCssBlock, tagLineIdx);
                                        for (const cssIss of inlineCssIssues) {
                                            issues.push(createIssue(
                                                tagLineIdx + 1,
                                                Math.max(1, tagRawLine.indexOf('style', ltIdx) + 1),
                                                `style属性内のCSSエラー: ${cssIss.message}`,
                                                cssIss.hint,
                                                'error',
                                                tagRawLine
                                            ));
                                        }
                                    }
                                }
                            } else if (!hasEquals) {
                                // = がない単独トークン（boolean属性でない場合はイコール抜けや不要な単語の誤入力）
                                if (!VALID_HTML_BOOLEAN_ATTRIBUTES.has(attrLow) && !attrLow.startsWith('data-') && !attrLow.startsWith('aria-')) {
                                    issues.push(createIssue(
                                        tagLineIdx + 1,
                                        Math.max(1, tagRawLine.indexOf(attrName, ltIdx) + 1),
                                        `HTMLタグ内に不正な属性または文字「${attrName}」があります`,
                                        `「${attrName}="..."」のように値を指定するか、不要な文字であれば削除してください`,
                                        'error',
                                        tagRawLine
                                    ));
                                }
                            }
                        }
                    }
                }

                if (VOID_HTML_TAGS.has(tagName) || SVG_SELF_CLOSING_TAGS.has(tagName)) {
                    if (isSelfClosing || VOID_HTML_TAGS.has(tagName)) continue;
                } else if (isSelfClosing) {
                    issues.push(createIssue(
                        tagLineIdx + 1,
                        ltIdx + 1,
                        `<${rawTagName}> タグは「 /> 」で省略して閉じることができません`,
                        tagName === 'script'
                            ? `HTMLのscriptタグは必ず「<script src="core.js"></script>」のように閉じタグ </script> を書いてください`
                            : `「<${rawTagName}>...</${rawTagName}>」のように閉じタグ </${rawTagName}> を記述してください`,
                        'error',
                        tagRawLine
                    ));
                    continue;
                }

                if (!isClosing) {
                    tagStack.push({ tag: tagName, line: i + 1, col: ltIdx + 1, lineText: rawLine });
                    if (tagName === 'script') {
                        const hasSrc = /\bsrc\s*=/i.test(tagContent);
                        const restOfLine = line.substring(pos);
                        const sameLineClose = restOfLine.match(/<\/script\s*>/i);
                        if (sameLineClose) {
                            const inlineJs = restOfLine.substring(0, sameLineClose.index).trim();
                            // Cloudflare や CDN インフラ自動注入スクリプトは構文チェック対象外
                            const isPlatformInjected = /\/cdn-cgi\/|__CF\$cv\$params|cloudflare/i.test(inlineJs);
                            if (inlineJs && !isPlatformInjected) {
                                let jsIssues = []
                                    .concat(checkFullwidthCharacters('inline.js', inlineJs))
                                    .concat(checkUnclosedQuotes('inline.js', inlineJs))
                                    .concat(checkBracketPairs('inline.js', inlineJs))
                                    .concat(checkJavaScriptNativeSyntax(inlineJs, null, false));
                                if (jsIssues.length === 0) {
                                    jsIssues = jsIssues.concat(checkJavaScriptSemanticAndConfigRefs('inline.js', inlineJs));
                                }
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
                        } else if (hasSrc) {
                            // src属性があるのに閉じタグがない場合、初心者ミス（<img>と同様に閉じないと思い込む）を親切に案内
                            issues.push(createIssue(
                                i + 1,
                                ltIdx + 1,
                                `<script src="..."> タグが閉じられていません（</script> が抜けています）`,
                                `HTMLのscriptタグは必ず閉じタグが必要です。「${rawLine.trim()}</script>」のように記述してください`,
                                'error',
                                rawLine
                            ));
                            tagStack.pop(); // 後続HTMLの巻き込みを防止
                            continue;
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

        if (inComment) {
            issues.push(createIssue(
                commentStartLine,
                commentStartCol,
                `HTMLコメント「 <!-- 」が閉じられていません（対応する「 --> 」がありません）`,
                `コメントの終わりに「 --> 」を追加してください`,
                'error',
                lines[commentStartLine - 1] || ''
            ));
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

    const JS_BUILTIN_IDENTIFIERS = new Set([
        // JS keywords & literals
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
        'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'super', 'switch', 'this',
        'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
        'async', 'await', 'of', 'static', 'get', 'set', 'from', 'as',
        // Standard globals & Browser APIs
        'window', 'document', 'navigator', 'location', 'history', 'screen', 'console', 'performance',
        'localStorage', 'sessionStorage', 'indexedDB', 'crypto', 'caches',
        'Math', 'Date', 'Number', 'String', 'Boolean', 'Object', 'Array', 'Function', 'Symbol', 'BigInt',
        'RegExp', 'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError',
        'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect', 'JSON', 'Intl',
        'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
        'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
        'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
        'escape', 'unescape', 'eval', 'NaN', 'Infinity', 'globalThis', 'global', 'self', 'top', 'parent', 'frames',
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback', 'queueMicrotask',
        'alert', 'confirm', 'prompt', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'BroadcastChannel', 'MessageChannel',
        'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent', 'PointerEvent', 'FocusEvent', 'InputEvent', 'ErrorEvent',
        'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'HTMLAudioElement', 'HTMLVideoElement', 'HTMLInputElement',
        'Node', 'Element', 'DocumentFragment', 'Text', 'Comment', 'DOMParser', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
        'Image', 'Audio', 'AudioContext', 'webkitAudioContext', 'OfflineAudioContext', 'GainNode', 'OscillatorNode',
        'CanvasRenderingContext2D', 'Path2D', 'ImageData', 'OffscreenCanvas',
        'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request', 'Response', 'AbortController',
        'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'structuredClone', ' getComputedStyle', 'getComputedStyle', 'matchMedia',
        'devicePixelRatio', 'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset',
        'scrollTo', 'scrollBy', 'focus', 'blur', 'open', 'close', 'print', 'stop', 'postMessage', 'addEventListener', 'removeEventListener', 'dispatchEvent',
        // Common Node / UMD / Project globals
        'module', 'exports', 'require', '__dirname', '__filename', 'process', 'Buffer',
        'GameConfig', 'STAGES', 'DOCS_DATA', 'Linter', 'StickyScroll', 'StickyScrollController',
        'CSS', 'performance', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'arguments'
    ]);

    const CORE_JS_REQUIRED_FUNCTIONS = [
        { name: 'initEnemies', desc: 'インベーダー初期化関数 initEnemies()' },
        { name: 'initBunkers', desc: '防壁初期化関数 initBunkers()' },
        { name: 'resetGame', desc: 'ゲームリセット関数 resetGame()' },
        { name: 'startGame', desc: 'ゲーム開始関数 startGame()' },
        { name: 'pauseGame', desc: '一時停止関数 pauseGame()' },
        { name: 'resumeGame', desc: '再開関数 resumeGame()' },
        { name: 'quitToHome', desc: 'タイトル帰還関数 quitToHome()' },
        { name: 'firePlayerBullet', desc: 'プレイヤー弾発射関数 firePlayerBullet()' },
        { name: 'fireEnemyBullet', desc: '敵弾発射関数 fireEnemyBullet()' },
        { name: 'updateUFO', desc: 'UFO更新関数 updateUFO()' },
        { name: 'update', desc: 'ゲーム更新関数 update()' },
        { name: 'draw', desc: 'ゲーム描画関数 draw()' },
        { name: 'loop', desc: 'メインループ関数 loop()' },
        { name: 'start', desc: '起動関数 start()' },
        { name: 'drawPixelPattern', desc: 'スプライト描画関数 drawPixelPattern()' },
        { name: 'getSprite', desc: 'スプライト取得関数 getSprite()' },
        { name: 'renderHomePreviewSprites', desc: 'ホーム画面プレビュー描画関数 renderHomePreviewSprites()' },
        { name: 'setupHomeUI', desc: 'ホーム画面UI初期化関数 setupHomeUI()' },
        { name: 'setupPauseUI', desc: '一時停止UI初期化関数 setupPauseUI()' },
        { name: 'applyConfigToActiveGame', desc: '設定即時反映関数 applyConfigToActiveGame()' }
    ];

    const BUILTIN_OBJECT_MEMBERS = {
        Math: new Set([
            'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'ceil',
            'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor', 'fround', 'hypot', 'imul', 'log',
            'log10', 'log1p', 'log2', 'max', 'min', 'pow', 'random', 'round', 'sign', 'sin',
            'sinh', 'sqrt', 'tan', 'tanh', 'trunc', 'E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2'
        ]),
        document: new Set([
            'getElementById', 'querySelector', 'querySelectorAll', 'getElementsByClassName',
            'getElementsByTagName', 'getElementsByName', 'createElement', 'createDocumentFragment',
            'createTextNode', 'createComment', 'createEvent', 'addEventListener', 'removeEventListener',
            'dispatchEvent', 'body', 'head', 'documentElement', 'title', 'cookie', 'readyState',
            'activeElement', 'hidden', 'visibilityState', 'hasFocus', 'execCommand', 'write', 'writeln'
        ]),
        console: new Set([
            'log', 'warn', 'error', 'info', 'debug', 'trace', 'dir', 'table', 'time', 'timeEnd',
            'timeLog', 'assert', 'clear', 'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd'
        ]),
        JSON: new Set(['parse', 'stringify']),
        localStorage: new Set(['getItem', 'setItem', 'removeItem', 'clear', 'key', 'length']),
        sessionStorage: new Set(['getItem', 'setItem', 'removeItem', 'clear', 'key', 'length']),
        classList: new Set(['add', 'remove', 'toggle', 'contains', 'replace', 'item', 'entries', 'forEach', 'keys', 'values', 'length', 'value'])
    };

    const VALID_JS_MEMBER_NAMES = new Set([
        // core.js project members
        'AudioContext', 'GameConfig', 'UFO', 'WebSocket', 'abs', 'action', 'active', 'activeElement', 'add',
        'addEventListener', 'alive', 'alpha', 'animFrame', 'apply', 'arcade', 'background', 'bind', 'blur',
        'bonusScore', 'buffer', 'bullet', 'bulletSpeed', 'bunker', 'call', 'checkHit', 'classList',
        'clearRect', 'code', 'col', 'color', 'colors', 'cols', 'complete', 'connect', 'corrode',
        'count', 'createBuffer', 'createBufferSource', 'createGain', 'createOscillator',
        'currentTime', 'damage', 'damageFlashTimer', 'data', 'destination', 'difficulty', 'dir', 'disconnect',
        'display', 'draw', 'drawImage', 'dropAmount', 'dyingTimer', 'enabled', 'enemy', 'exp',
        'exponentialRampToValueAtTime', 'fillRect', 'fillStyle', 'fillText', 'filter',
        'fireInterval', 'floor', 'focus', 'font', 'forEach', 'frequency', 'gain', 'game',
        'getAttribute', 'getChannelData', 'getContext', 'getElementById', 'getElementsByTagName', 'getItem', 'grid',
        'hardHpBoost', 'height', 'hp', 'includes', 'interval', 'isArray', 'isNaN', 'jpg', 'js', 'key', 'left',
        'length', 'linearRampToValueAtTime', 'lives', 'map', 'max', 'maxBullets', 'maxHp', 'maxWaves',
        'min', 'muzzle', 'naturalWidth', 'noPassThrough', 'normal', 'now', 'onmessage', 'onerror', 'onopen', 'onclose', 'padStart',
        'passThroughPlayer', 'pattern', 'pixelSize', 'playBunkerHit', 'playInvaderHit', 'playPlayerHit',
        'playShoot', 'playUFOHit', 'playWalk', 'player', 'playerBlow', 'preventDefault',
        'prevY', 'push', 'querySelectorAll', 'random', 'readyState', 'regenerateEachWave',
        'reloadGameWithNewConfig', 'remove', 'restore', 'resume', 'right', 'round', 'row',
        'rows', 'sampleRate', 'save', 'scale', 'score', 'scoreText', 'scores', 'send', 'setItem',
        'setValueAtTime', 'shoot', 'shootInterval', 'sin', 'size', 'slice', 'sound', 'speed',
        'splice', 'spriteKey', 'spritePattern', 'sprites', 'sqrt', 'src', 'start', 'startUFO',
        'state', 'stop', 'stopPropagation', 'stopUFO', 'style', 'textAlign', 'textBaseline',
        'textContent', 'timer', 'toggle', 'twinkleSpeed', 'type', 'ufo', 'ufoGain', 'ufoOsc',
        'updateLiveSpritePreview', 'vx', 'walkPitches', 'walkStep', 'webkitAudioContext',
        'width', 'wiggleTimer', 'x', 'y', 'vy', 'id', 'className', 'innerHTML', 'innerText',
        'value', 'disabled', 'checked', 'href', 'rel', 'target', 'dataset', 'parentElement',
        'parentNode', 'children', 'childNodes', 'firstChild', 'lastChild', 'nextSibling',
        'previousSibling', 'appendChild', 'removeChild', 'insertBefore', 'replaceChild',
        'cloneNode', 'contains', 'setAttribute', 'removeAttribute', 'hasAttribute',
        'getBoundingClientRect', 'scrollIntoView', 'click', 'submit', 'reset',
        'querySelector', 'createElement', 'close', 'removeItem', 'clear', 'parse', 'stringify',
        // Standard Canvas 2D & Web APIs & Array/String/Number/Object prototype methods
        'strokeRect', 'strokeText', 'measureText', 'beginPath', 'closePath', 'moveTo',
        'lineTo', 'arc', 'arcTo', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'roundRect',
        'fill', 'stroke', 'clip', 'translate', 'rotate', 'transform', 'setTransform',
        'resetTransform', 'createLinearGradient', 'createRadialGradient', 'createPattern',
        'getImageData', 'putImageData', 'createImageData', 'globalAlpha', 'globalCompositeOperation',
        'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'strokeStyle', 'shadowColor',
        'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'imageSmoothingEnabled', 'canvas',
        'concat', 'every', 'fill', 'find', 'findIndex', 'flat', 'flatMap', 'indexOf',
        'join', 'keys', 'lastIndexOf', 'pop', 'reduce', 'reduceRight', 'reverse', 'shift',
        'some', 'sort', 'unshift', 'values', 'entries', 'at', 'charAt', 'charCodeAt',
        'endsWith', 'match', 'matchAll', 'padEnd', 'repeat', 'replace', 'replaceAll',
        'search', 'split', 'startsWith', 'substring', 'substr', 'toLowerCase', 'toUpperCase',
        'trim', 'trimStart', 'trimEnd', 'toString', 'toFixed', 'toPrecision', 'valueOf',
        'hasOwnProperty', 'assign', 'freeze', 'seal', 'create', 'defineProperty', 'fromEntries',
        'log', 'warn', 'error', 'info', 'debug', 'PI', 'ceil', 'cos', 'tan', 'atan2', 'pow',
        'sign', 'trunc', 'hypot', 'postMessage', 'location', 'reload', 'href', 'origin',
        'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'navigator',
        'userAgent', ' innerWidth', 'innerHeight', 'devicePixelRatio', 'requestAnimationFrame',
        'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'display', 'visibility', 'opacity', 'transform', 'transition', 'backgroundColor',
        'borderColor', 'color', 'width', 'height', 'top', 'left', 'right', 'bottom',
        'margin', 'padding', 'zIndex', 'cursor', 'pointerEvents', 'overflow', 'fontSize',
        'fontFamily', 'fontWeight', 'textShadow', 'boxShadow', 'border', 'borderRadius',
        'tagName', 'isContentEditable', 'closest'
    ]);

    const VALID_DOM_EVENT_NAMES = new Set([
        'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave',
        'mouseover', 'mouseout', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress',
        'touchstart', 'touchend', 'touchmove', 'touchcancel', 'pointerdown', 'pointerup',
        'pointermove', 'pointerenter', 'pointerleave', 'pointercancel', 'focus', 'blur',
        'focusin', 'focusout', 'change', 'input', 'submit', 'reset', 'load', 'unload',
        'beforeunload', 'resize', 'scroll', 'error', 'message', 'DOMContentLoaded',
        'visibilitychange', 'pageshow', 'pagehide', 'popstate', 'animationstart', 'animationend', 'animationiteration',
        'transitionstart', 'transitionend', 'ended', 'play', 'pause'
    ]);

    /**
     * 8.5 JavaScript (core.js 等) の未定義識別子・関数名タイポ・GameConfigプロパティ参照チェック
     */
    function checkJavaScriptSemanticAndConfigRefs(filename, code) {
        const issues = [];
        const lines = code.split('\n');

        // 1. 文字列・テンプレートリテラル・正規表現・コメントを空白に置換したコードを作成（行・列番号を完全保持）
        let stripped = '';
        let i = 0;
        const len = code.length;
        let lastTokenChar = '';
        let lastWord = '';

        function consumeTemplateLiteral() {
            stripped += ' ';
            i++;
            while (i < len && code[i] !== '`') {
                if (code[i] === '\\') {
                    stripped += '  ';
                    i += 2;
                    continue;
                }
                if (code[i] === '$' && code[i + 1] === '{') {
                    stripped += '  ';
                    i += 2;
                    let braceDepth = 1;
                    let exprLastChar = '{';
                    while (i < len && braceDepth > 0) {
                        if (code[i] === '{') {
                            braceDepth++;
                            stripped += '{';
                            exprLastChar = '{';
                            i++;
                        } else if (code[i] === '}') {
                            braceDepth--;
                            if (braceDepth === 0) {
                                stripped += ' ';
                                i++;
                                break;
                            }
                            stripped += '}';
                            exprLastChar = '}';
                            i++;
                        } else if (code[i] === '`') {
                            consumeTemplateLiteral();
                            exprLastChar = '`';
                        } else if (code[i] === '"' || code[i] === "'") {
                            const sq = code[i];
                            stripped += ' ';
                            i++;
                            while (i < len && code[i] !== sq && code[i] !== '\n') {
                                if (code[i] === '\\') { stripped += '  '; i += 2; continue; }
                                stripped += ' ';
                                i++;
                            }
                            if (i < len && code[i] === sq) { stripped += ' '; i++; }
                            exprLastChar = sq;
                        } else if (code[i] === '/' && code[i + 1] !== '/' && code[i + 1] !== '*' && '=(,:;[!?&|+-*~^%<>/{};'.includes(exprLastChar)) {
                            stripped += ' ';
                            i++;
                            let inCC = false;
                            while (i < len && code[i] !== '\n') {
                                if (code[i] === '\\') { stripped += '  '; i += 2; continue; }
                                if (code[i] === '[') inCC = true;
                                else if (code[i] === ']') inCC = false;
                                else if (code[i] === '/' && !inCC) {
                                    stripped += ' ';
                                    i++;
                                    while (i < len && /[gimsuy]/.test(code[i])) { stripped += ' '; i++; }
                                    break;
                                }
                                stripped += ' ';
                                i++;
                            }
                            exprLastChar = '/';
                        } else {
                            if (!/\s/.test(code[i])) exprLastChar = code[i];
                            stripped += code[i];
                            i++;
                        }
                    }
                    continue;
                }
                stripped += (code[i] === '\n' ? '\n' : ' ');
                i++;
            }
            if (i < len && code[i] === '`') {
                stripped += ' ';
                i++;
            }
        }

        while (i < len) {
            const ch = code[i];
            const next = code[i + 1];

            // 行コメント //
            if (ch === '/' && next === '/') {
                while (i < len && code[i] !== '\n') {
                    stripped += ' ';
                    i++;
                }
                continue;
            }
            // ブロックコメント /* ... */
            if (ch === '/' && next === '*') {
                stripped += '  ';
                i += 2;
                while (i < len && !(code[i] === '*' && code[i + 1] === '/')) {
                    stripped += (code[i] === '\n' ? '\n' : ' ');
                    i++;
                }
                if (i < len) {
                    stripped += '  ';
                    i += 2;
                }
                continue;
            }
            // 文字列 "..." または '...'
            if (ch === '"' || ch === "'") {
                const q = ch;
                stripped += ' ';
                i++;
                while (i < len && code[i] !== q && code[i] !== '\n') {
                    if (code[i] === '\\') {
                        stripped += '  ';
                        i += 2;
                        continue;
                    }
                    stripped += ' ';
                    i++;
                }
                if (i < len && code[i] === q) {
                    stripped += ' ';
                    i++;
                }
                lastTokenChar = q;
                lastWord = '';
                continue;
            }
            // テンプレートリテラル `...`
            if (ch === '`') {
                consumeTemplateLiteral();
                lastTokenChar = '`';
                lastWord = '';
                continue;
            }
            // 正規表現リテラル /.../
            if (ch === '/' && next !== '/' && next !== '*') {
                const regexPrecedingWords = new Set(['return', 'typeof', 'void', 'delete', 'throw', 'case', 'in', 'of', 'instanceof', 'new', 'yield', 'await']);
                if (!lastTokenChar || '=(,:;[!?&|+-*~^%<>/{};'.includes(lastTokenChar) || regexPrecedingWords.has(lastWord)) {
                    stripped += ' ';
                    i++;
                    let inCharClass = false;
                    while (i < len && code[i] !== '\n') {
                        if (code[i] === '\\') {
                            stripped += '  ';
                            i += 2;
                            continue;
                        }
                        if (code[i] === '[') inCharClass = true;
                        else if (code[i] === ']') inCharClass = false;
                        else if (code[i] === '/' && !inCharClass) {
                            stripped += ' ';
                            i++;
                            while (i < len && /[gimsuy]/.test(code[i])) {
                                stripped += ' ';
                                i++;
                            }
                            break;
                        }
                        stripped += ' ';
                        i++;
                    }
                    lastTokenChar = '/';
                    lastWord = '';
                    continue;
                }
            }

            if (/[a-zA-Z0-9_$]/.test(ch)) {
                lastWord += ch;
                lastTokenChar = ch;
            } else if (!/\s/.test(ch)) {
                lastTokenChar = ch;
                lastWord = '';
            }
            stripped += ch;
            i++;
        }

        // 2. ファイル内の全宣言識別子（var/let/const/function/メソッド/引数/catch/分割代入）を収集
        const declared = new Set(JS_BUILTIN_IDENTIFIERS);
        let m;

        const varDeclRe = /\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        while ((m = varDeclRe.exec(stripped)) !== null) declared.add(m[1]);

        // カンマ区切りの複数変数宣言 (例: let a, b, c; や let minC = Infinity, maxC = -Infinity;)
        const commaVarRe = /,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*(?:=|;|,|\n))/g;
        while ((m = commaVarRe.exec(stripped)) !== null) declared.add(m[1]);

        const destructDeclRe = /\b(?:var|let|const)\s*[\[{]([^\]}]+)[\]}]\s*(?:=|\bof\b|\bin\b)/g;
        while ((m = destructDeclRe.exec(stripped)) !== null) {
            const parts = m[1].split(',');
            for (const p of parts) {
                const sub = p.split(':').pop().split('=')[0].trim().replace(/^\.\.\./, '');
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(sub)) declared.add(sub);
            }
        }

        const funcDeclRe = /\bfunction\s*\*?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/g;
        while ((m = funcDeclRe.exec(stripped)) !== null) {
            declared.add(m[1]);
            m[2].split(',').forEach(arg => {
                const cleanArg = arg.split('=')[0].trim().replace(/^\.\.\./, '');
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanArg)) declared.add(cleanArg);
            });
        }

        const anonFuncRe = /\bfunction\s*\(([^)]*)\)/g;
        while ((m = anonFuncRe.exec(stripped)) !== null) {
            m[1].split(',').forEach(arg => {
                const cleanArg = arg.split('=')[0].trim().replace(/^\.\.\./, '');
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanArg)) declared.add(cleanArg);
            });
        }

        // クラスメソッドおよびオブジェクト短縮メソッド (例: checkHit(rectX, rectY, rectW, rectH) { ... })
        const methodDeclRe = /(?:^|[\n{};,])\s*(?:async\s+|static\s+|get\s+|set\s+)*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^()]*)\)\s*\{/g;
        const controlFlowKeywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);
        while ((m = methodDeclRe.exec(stripped)) !== null) {
            const methodName = m[1];
            if (!controlFlowKeywords.has(methodName)) {
                declared.add(methodName);
                m[2].split(',').forEach(arg => {
                    const cleanArg = arg.split('=')[0].trim().replace(/^\.\.\./, '');
                    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanArg)) declared.add(cleanArg);
                });
            }
        }

        const arrowParenRe = /\(([^()]*)\)\s*=>/g;
        while ((m = arrowParenRe.exec(stripped)) !== null) {
            m[1].split(',').forEach(arg => {
                const cleanArg = arg.split('=')[0].trim().replace(/^\.\.\./, '');
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanArg)) declared.add(cleanArg);
            });
        }

        const arrowSingleRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g;
        while ((m = arrowSingleRe.exec(stripped)) !== null) {
            declared.add(m[1]);
        }

        const catchRe = /\bcatch\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/g;
        while ((m = catchRe.exec(stripped)) !== null) {
            declared.add(m[1]);
        }

        const classRe = /\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        while ((m = classRe.exec(stripped)) !== null) {
            declared.add(m[1]);
        }

        const strippedLines = stripped.split('\n');

        // 3. 未定義の変数・関数名タイポ・孤立した識別子の検査
        for (let lineIdx = 0; lineIdx < strippedLines.length; lineIdx++) {
            const sLine = strippedLines[lineIdx];
            const rawLine = lines[lineIdx];
            if (!sLine.trim()) continue;

            const idRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
            let idM;
            while ((idM = idRe.exec(sLine)) !== null) {
                const name = idM[1];
                const idx = idM.index;

                // 直前が '.'（プロパティアクセス obj.prop）の場合はスキップ
                let prevIdx = idx - 1;
                while (prevIdx >= 0 && /\s/.test(sLine[prevIdx])) prevIdx--;
                if (prevIdx >= 0 && sLine[prevIdx] === '.') continue;
                // 前行末尾が '.' の場合もスキップ
                if (prevIdx < 0 && lineIdx > 0) {
                    const prevLineTrim = strippedLines[lineIdx - 1].trim();
                    if (prevLineTrim.endsWith('.')) continue;
                }

                // 直後が ':'（オブジェクトリテラルのキーやラベル { key: val }）の場合はスキップ（ただし三項演算子 ? a : b は除外）
                let nextIdx = idx + name.length;
                while (nextIdx < sLine.length && /\s/.test(sLine[nextIdx])) nextIdx++;
                if (nextIdx < sLine.length && sLine[nextIdx] === ':') {
                    const beforeSlice = sLine.slice(0, idx);
                    if (!beforeSlice.includes('?')) continue;
                }

                if (!declared.has(name)) {
                    const closest = findClosestInCollection(name, declared, 2);
                    const isCall = nextIdx < sLine.length && sLine[nextIdx] === '(';
                    issues.push(createIssue(
                        lineIdx + 1,
                        idx + 1,
                        isCall
                            ? `関数「${name}()」は定義されていません`
                            : `変数または識別子「${name}」は定義されていません`,
                        closest
                            ? `「${closest}」のスペルミスではありませんか？`
                            : `変数名・関数名のスペルを確認するか、不要な文字であれば削除してください`,
                        'error',
                        rawLine
                    ));
                }
            }
        }

        // 4. core.js および HTMLインラインJS（inline.js）の GameConfig 参照・メンバータイポ・条件式代入・DOMメソッド検証
        const isCoreJs = filename === 'core.js' || filename.endsWith('/core.js');
        const isInlineJs = filename === 'inline.js';

        if (isCoreJs || isInlineJs) {
            // GameConfig のエイリアス変数 (pCfg = GameConfig.player, bCfg = GameConfig.bullet || GameConfig.bunker 等) を追跡
            const activeConfigVarMap = new Map([
                ['pCfg', 'player'],
                ['eCfg', 'enemy'],
                ['bCfg', 'bullet'],
                ['uCfg', 'ufo'],
                ['dCfg', 'display'],
                ['gCfg', 'game'],
                ['sCfg', 'sprites']
            ]);

            const validSections = Object.keys(KNOWN_CONFIG_SCHEMA);

            for (let lineIdx = 0; lineIdx < strippedLines.length; lineIdx++) {
                const sLine = strippedLines[lineIdx];
                const rawLine = lines[lineIdx];
                if (!sLine.trim()) continue;

                if (isCoreJs) {
                    // 行内で const pCfg = ... GameConfig.<sec> または cfg.<sec> が束縛された場合はターゲットセクションを記録
                    // ※ ただし (cfg.enemy && cfg.enemy.colors) のように2階層目のプロパティを代入している場合はセクションエイリアスではない
                    const hasTwoLevelAccess = /\b(?:GameConfig|cfg)\.[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*/.test(sLine);
                    const lineAliasMatch = !hasTwoLevelAccess && sLine.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*[^;]*?\b(?:GameConfig|cfg)\.([a-zA-Z_$][a-zA-Z0-9_$]*)(?![.\[])/);
                    if (lineAliasMatch) {
                        const varName = lineAliasMatch[1];
                        const secName = lineAliasMatch[2];
                        if (KNOWN_CONFIG_SCHEMA[secName]) {
                            activeConfigVarMap.set(varName, secName);
                        }
                    } else if (/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:window\.)?GameConfig\b(?![.\[])/.test(sLine)) {
                        const rootAliasMatch = sLine.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:window\.)?GameConfig\b(?![.\[])/);
                        if (rootAliasMatch) {
                            activeConfigVarMap.delete(rootAliasMatch[1]);
                        }
                    }

                    // (a) GameConfig.<section> / cfg.<section>（cfg がルートを指しているときのみ）および GameConfig.<section>.<prop> の検証
                    const rootCfgPattern = activeConfigVarMap.has('cfg')
                        ? /\bGameConfig\.([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\.([a-zA-Z_$][a-zA-Z0-9_$]*))?/g
                        : /\b(?:GameConfig|cfg)\.([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\.([a-zA-Z_$][a-zA-Z0-9_$]*))?/g;
                    let gcM;
                    while ((gcM = rootCfgPattern.exec(sLine)) !== null) {
                        const sec = gcM[1];
                        const prop = gcM[2];
                        if (!KNOWN_CONFIG_SCHEMA[sec]) {
                            const closestSec = findClosestInCollection(sec, validSections, 3);
                            issues.push(createIssue(
                                lineIdx + 1,
                                Math.max(1, rawLine.indexOf(sec) + 1),
                                `GameConfig.${sec} という設定カテゴリは config.js に存在しません`,
                                closestSec
                                    ? `「GameConfig.${closestSec}」のスペルミスではありませんか？`
                                    : `有効なセクション名（${validSections.join(', ')}）を指定してください`,
                                'error',
                                rawLine
                            ));
                        } else if (prop && !KNOWN_CONFIG_SCHEMA[sec].includes(prop)) {
                            const closestProp = findClosestInCollection(prop, KNOWN_CONFIG_SCHEMA[sec], 3);
                            issues.push(createIssue(
                                lineIdx + 1,
                                Math.max(1, rawLine.indexOf(prop, rawLine.indexOf(sec)) + 1),
                                `GameConfig.${sec}.${prop} という設定項目は config.js に存在しません`,
                                closestProp
                                    ? `「GameConfig.${sec}.${closestProp}」のスペルミスではありませんか？`
                                    : `GameConfig.${sec} の有効な項目（${KNOWN_CONFIG_SCHEMA[sec].join(', ')}）を指定してください`,
                                'error',
                                rawLine
                            ));
                        }
                    }

                    // (b) pCfg.<prop>, eCfg.<prop> などのエイリアス変数経由のプロパティアクセス検証
                    for (const [varName, secName] of activeConfigVarMap.entries()) {
                        const varPropRe = new RegExp(`\\b${varName}\\.([a-zA-Z_$][a-zA-Z0-9_$]*)`, 'g');
                        let vpM;
                        while ((vpM = varPropRe.exec(sLine)) !== null) {
                            const prop = vpM[1];
                            const allowedProps = KNOWN_CONFIG_SCHEMA[secName];
                            if (allowedProps && !allowedProps.includes(prop)) {
                                const closestProp = findClosestInCollection(prop, allowedProps, 3);
                                issues.push(createIssue(
                                    lineIdx + 1,
                                    Math.max(1, rawLine.indexOf(`${varName}.${prop}`) + varName.length + 2),
                                    `${varName}.${prop}（GameConfig.${secName}.${prop}）という設定項目は存在しません`,
                                    closestProp
                                        ? `「${varName}.${closestProp}」のスペルミスではありませんか？`
                                        : `GameConfig.${secName} の有効な項目（${allowedProps.join(', ')}）を確認してください`,
                                'error',
                                rawLine
                            ));
                        }
                    }
                }
            }

                // (c) 標準オブジェクト（Math, document, console, JSON, localStorage, classList）および一般オブジェクトの .member タイポ検証
                const dotMemberRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
                let dmM;
                while ((dmM = dotMemberRe.exec(sLine)) !== null) {
                    const objName = dmM[1];
                    const memName = dmM[2];
                    if (objName === 'GameConfig' || objName === 'cfg' || objName === 'window' || activeConfigVarMap.has(objName)) {
                        continue;
                    }
                    if (BUILTIN_OBJECT_MEMBERS[objName]) {
                        const validSet = BUILTIN_OBJECT_MEMBERS[objName];
                        if (!validSet.has(memName)) {
                            const closestMem = findClosestInCollection(memName, validSet, 3);
                            issues.push(createIssue(
                                lineIdx + 1,
                                Math.max(1, rawLine.indexOf(memName, rawLine.indexOf(objName)) + 1),
                                `「${objName}.${memName}」は存在しないメソッドまたはプロパティです`,
                                closestMem
                                    ? `「${objName}.${closestMem}」のスペルミスではありませんか？`
                                    : `${objName} の正しいメソッド・プロパティ名を確認してください`,
                                'error',
                                rawLine
                            ));
                        }
                    } else if (!VALID_JS_MEMBER_NAMES.has(memName) && !declared.has(memName)) {
                        const closestMem = findClosestInCollection(memName, VALID_JS_MEMBER_NAMES, 2);
                        issues.push(createIssue(
                            lineIdx + 1,
                            Math.max(1, rawLine.lastIndexOf(memName) + 1),
                            `プロパティまたはメソッド「.${memName}」は存在しません`,
                            closestMem
                                ? `「.${closestMem}」のスペルミスではありませんか？`
                                : `プロパティ名・メソッド名のスペルを確認してください`,
                            'error',
                            rawLine
                        ));
                    }
                }

                // (d) if (...) 条件式内の誤代入（= と == / === の間違い）の検出
                const ifAssignMatch = sLine.match(/\bif\s*\(([^)]*)\)/);
                if (ifAssignMatch) {
                    const cond = ifAssignMatch[1];
                    if (/(?<![=!<>])=(?!=)/.test(cond)) {
                        issues.push(createIssue(
                            lineIdx + 1,
                            Math.max(1, rawLine.indexOf('=', rawLine.indexOf('if')) + 1),
                            `if文の条件式の中で代入「 = 」が使われています（比較は「 === 」または「 == 」を使います）`,
                            `等しいかどうか調べるには「 === 」に書き直してください`,
                            'error',
                            rawLine
                        ));
                    }
                }

                // (e) getContext("2d") および addEventListener("<event>", ...) の文字列引数タイポ検証
                const cleanRaw = stripLineComment(rawLine);
                const ctxMatch = cleanRaw.match(/\.getContext\(\s*["']([^"']*)["']\s*\)/);
                if (ctxMatch && ctxMatch[1] !== '2d' && ctxMatch[1] !== 'webgl' && ctxMatch[1] !== 'webgl2') {
                    issues.push(createIssue(
                        lineIdx + 1,
                        Math.max(1, rawLine.indexOf(ctxMatch[1]) + 1),
                        `getContext("${ctxMatch[1]}") の指定が正しくありません`,
                        `2Dキャンバスを描画するには getContext("2d") と指定してください`,
                        'error',
                        rawLine
                    ));
                }
                const evMatch = cleanRaw.match(/\.addEventListener\(\s*["']([^"']*)["']/);
                if (evMatch && !VALID_DOM_EVENT_NAMES.has(evMatch[1])) {
                    const closestEv = findClosestInCollection(evMatch[1], VALID_DOM_EVENT_NAMES, 3);
                    issues.push(createIssue(
                        lineIdx + 1,
                        Math.max(1, rawLine.indexOf(evMatch[1]) + 1),
                        `addEventListener("${evMatch[1]}") は存在しないイベント名です`,
                        closestEv
                            ? `「"${closestEv}"」のスペルミスではありませんか？`
                            : `正しいイベント名（"click", "keydown", "keyup" など）を指定してください`,
                        'error',
                        rawLine
                    ));
                }

                // (e2) classList.(add|remove|toggle|contains) の引数検証（空白混入・空文字・タイポ検知）
                const classListRegex = /\.classList\.(add|remove|toggle|contains)\s*\(\s*(['"])([^'"]*)\2\s*\)/g;
                let clM;
                while ((clM = classListRegex.exec(cleanRaw)) !== null) {
                    const clMethod = clM[1];
                    const rawCls = clM[3];
                    const cls = rawCls.trim();

                    if (!cls) {
                        issues.push(createIssue(
                            lineIdx + 1,
                            Math.max(1, rawLine.indexOf(clM[0]) + 1),
                            `classList.${clMethod}() に空のクラス名が指定されています`,
                            `有効なクラス名（例: "in-iframe"）を指定してください`,
                            'error',
                            rawLine
                        ));
                        continue;
                    }

                    // 空白文字混入の検知（ブラウザ実行時に DOMException となり画面遷移やスタイルが破壊される）
                    if (/\s/.test(rawCls)) {
                        issues.push(createIssue(
                            lineIdx + 1,
                            Math.max(1, rawLine.indexOf(rawCls) + 1),
                            `classList.${clMethod}("${rawCls}") に空白文字が含まれています`,
                            `classList に渡すクラス名にスペースを含めることはできません。ハイフン「-」等で繋ぐか（例: "in-iframe"）、引数をカンマで分けてください`,
                            'error',
                            rawLine
                        ));
                        continue;
                    }

                    // 既知のDOMクラス名（プロジェクト全体の主要クラス名）
                    const KNOWN_DOM_CLASSES = new Set([
                        'in-iframe', 'transitioning-to-editor', 'active', 'hidden', 'edit-mode',
                        'modal-sprite-cell', 'monaca-error-hud', 'game-top-bar', 'game-container',
                        'screen-view', 'cleared', 'all-stars', 'stage-card', 'star-slot', 'earned',
                        'is-open', 'is-collapsed', 'show', 'visible', 'has-error', 'has-warning', 'has-unsaved'
                    ]);

                    if (!KNOWN_DOM_CLASSES.has(cls)) {
                        const closestCls = findClosestInCollection(cls, KNOWN_DOM_CLASSES, 2);
                        if (closestCls) {
                            issues.push(createIssue(
                                lineIdx + 1,
                                Math.max(1, rawLine.indexOf(rawCls) + 1),
                                `クラス名「${cls}」は「${closestCls}」のスペルミスです`,
                                `「"${closestCls}"」に修正してください`,
                                'error',
                                rawLine
                            ));
                        }
                    }
                }
            }

            // (f) core.js の必須トップレベル関数が消されていないか検証
            if (isCoreJs) {
                for (const reqFn of CORE_JS_REQUIRED_FUNCTIONS) {
                    if (!declared.has(reqFn.name)) {
                        const closestFn = findClosestInCollection(reqFn.name, declared, 3);
                        let targetLine = 1;
                        if (closestFn) {
                            for (let k = 0; k < strippedLines.length; k++) {
                                if (new RegExp(`\\bfunction\\s+${closestFn}\\b`).test(strippedLines[k])) {
                                    targetLine = k + 1;
                                    break;
                                }
                            }
                        }
                        issues.push(createIssue(
                            targetLine,
                            1,
                            `core.js 内の必須関数「${reqFn.desc}」が見つかりません`,
                            closestFn
                                ? `関数名「${closestFn}」は「${reqFn.name}」のスペルミスではありませんか？`
                                : `ゲームを動かすために function ${reqFn.name}() が必要です`,
                            'error',
                            lines[targetLine - 1] || ''
                        ));
                    }
                }
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
            // CDN やクラウドホスティングの予約パス (Cloudflare の /cdn-cgi/ 等) は除外
            if (/^\/?cdn-cgi\//i.test(cleanRef)) return null;
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

        function findAssetSuggestion(resolvedPath) {
            const allKeys = Object.keys(allFiles);
            if (!resolvedPath.startsWith('assets/') && Object.prototype.hasOwnProperty.call(allFiles, 'assets/' + resolvedPath)) {
                return `先頭に「assets/」が抜けています。「assets/${resolvedPath}」のように指定してください`;
            }
            const closestDirect = findClosestInCollection(resolvedPath, allKeys, 3);
            if (closestDirect) {
                return `「${closestDirect}」のスペルミスではありませんか？ファイル名を確認してください`;
            }
            if (!resolvedPath.startsWith('assets/')) {
                const closestInAssets = findClosestInCollection('assets/' + resolvedPath, allKeys, 3);
                if (closestInAssets) {
                    return `「${closestInAssets}」のスペルミスではありませんか？（assets/ フォルダ内のファイル名を確認してください）`;
                }
            }
            return `プロジェクト内に存在するファイル名（assets/octopus.png など）を指定してください`;
        }

        const getFileContent = (key) => {
            const v = allFiles[key];
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object') return v.content || '';
            return '';
        };

        // HTMLから <!-- ... --> コメントを空白置換（行番号維持）するヘルパー
        const stripHtmlCommentsPreservingLines = (htmlStr) => {
            return htmlStr.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
        };

        // ── A. HTMLファイルの横断チェック (リンク先ファイル存在 & ゲーム必須DOM ID・必須タグ) ──
        if (filename.endsWith('.html')) {
            let configScriptLine = -1;
            let coreScriptLine = -1;
            let styleCssLinkLine = -1;
            let inScript = false;
            let inStyle = false;
            const commentFreeHtml = stripHtmlCommentsPreservingLines(code);
            const commentFreeLines = commentFreeHtml.split('\n');

            for (let i = 0; i < commentFreeLines.length; i++) {
                const rawLine = lines[i];
                const cfLine = commentFreeLines[i];
                if (!cfLine.trim()) continue;

                // <script> や <style> タグ内のインラインコードは HTML 属性チェックから除外
                if (inScript) {
                    if (/<\/script>/i.test(cfLine)) inScript = false;
                    continue;
                }
                if (inStyle) {
                    if (/<\/style>/i.test(cfLine)) inStyle = false;
                    continue;
                }

                // 同一行内に完結するインライン <script>...</script> や <style>...</style> の内容を除去
                let scanLine = cfLine.replace(/<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi, '');
                scanLine = scanLine.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

                if (/<script\b/i.test(cfLine) && !/<\/script>/i.test(cfLine)) {
                    inScript = true;
                }
                if (/<style\b/i.test(cfLine) && !/<\/style>/i.test(cfLine)) {
                    inStyle = true;
                }

                // src="..." または href="..." の参照先ファイル存在チェック
                const refRegex = /\b(src|href)\s*=\s*["']([^"']+)["']/gi;
                let rMatch;
                while ((rMatch = refRegex.exec(scanLine)) !== null) {
                    const attr = rMatch[1].toLowerCase();
                    const refVal = rMatch[2];
                    const resolved = resolveProjectPath(filename, refVal);
                    if (!resolved) continue;

                    // 公知のページ遷移パス・外部共通アセットパス（editor/ や ../ や pictures/ 等）は除外
                    const isKnownNavPath = (
                        refVal === 'editor/' || refVal === 'editor' || refVal === '../' || refVal === './' ||
                        resolved === 'editor/index.html' || resolved === 'index.html' ||
                        resolved.startsWith('pictures/') || refVal.includes('how-to-play.html') ||
                        refVal.includes('tech-doc') || resolved.startsWith('editor/')
                    );

                    if (resolved && !fileExistsInProject(resolved) && !isKnownNavPath) {
                        issues.push(createIssue(
                            i + 1,
                            Math.max(1, rawLine.indexOf(refVal) + 1),
                            `[ファイル横断] ${rMatch[1]}="${refVal}" で指定されたファイル「${resolved}」が見つかりません`,
                            findAssetSuggestion(resolved),
                            'error',
                            rawLine
                        ));
                    }
                    if ((resolved === 'stages.js' || resolved === 'config.js') && /<script\b/i.test(scanLine) && attr === 'src') configScriptLine = i + 1;
                    if ((resolved === 'main.js' || resolved === 'core.js') && /<script\b/i.test(scanLine) && attr === 'src') coreScriptLine = i + 1;
                    if (resolved === 'style.css' && /<link\b/i.test(scanLine) && attr === 'href') styleCssLinkLine = i + 1;
                }
            }

            // ルート index.html の場合、main.js が必須とする要素・外部ファイル読み込み・順序を検証
            if (filename === 'index.html') {
                const titleMatch = commentFreeHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
                if (!titleMatch) {
                    issues.push(createIssue(
                        1,
                        1,
                        `[ファイル横断] index.html 内に <title>...</title> タグが見つかりません`,
                        `<head> 内に <title>ハコゲーム</title> のようにタイトルタグを記述してください`,
                        'error',
                        lines[0] || ''
                    ));
                } else if (!titleMatch[1].trim()) {
                    let titleLine = 1;
                    for (let k = 0; k < commentFreeLines.length; k++) {
                        if (/<title\b/i.test(commentFreeLines[k])) { titleLine = k + 1; break; }
                    }
                    issues.push(createIssue(
                        titleLine,
                        1,
                        `[ファイル横断] <title></title> の中身が空になっています`,
                        `<title> と </title> の間にゲームタイトルを入力してください`,
                        'error',
                        lines[titleLine - 1] || ''
                    ));
                }

                const htmlIds = new Set();
                const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
                let idMatch;
                while ((idMatch = idRegex.exec(commentFreeHtml)) !== null) {
                    htmlIds.add(idMatch[1].trim());
                }

                const requiredIds = [
                    { id: 'gameCanvas', desc: 'ゲーム画面を描画する <canvas id="gameCanvas">' },
                    { id: 'homeScreen', desc: 'ホーム画面コンテナ (id="homeScreen")' },
                    { id: 'selectScreen', desc: 'ステージ選択画面コンテナ (id="selectScreen")' },
                    { id: 'gameScreen', desc: 'ゲームプレイ画面コンテナ (id="gameScreen")' },
                    { id: 'startBtn', desc: 'スタートボタン (id="startBtn")' },
                    { id: 'resetBtn', desc: 'リセットボタン (id="resetBtn")' },
                    { id: 'statusBar', desc: 'ステータス表示バー (id="statusBar")' },
                    { id: 'blockCountVal', desc: '残りブロック数表示 (id="blockCountVal")' }
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
                        } else {
                            for (let k = 0; k < lines.length; k++) {
                                if (lines[k].includes(req.id)) {
                                    targetLine = k + 1;
                                    break;
                                }
                            }
                        }
                        issues.push(createIssue(
                            targetLine,
                            1,
                            `[ファイル横断] main.js が使用する ${req.desc} が index.html 内に見つかりません`,
                            closestId
                                ? `行 ${targetLine} の id="${closestId}" は id="${req.id}" のスペルミスではありませんか？`
                                : `index.html 内の id="${req.id}" を持つ要素が消去またはコメントアウトされていないか確認してください`,
                            'error',
                            lines[targetLine - 1] || ''
                        ));
                    }
                }

                if (configScriptLine === -1) {
                    let targetLine = 1;
                    for (let k = 0; k < lines.length; k++) {
                        if (lines[k].includes('stages.js') || lines[k].includes('</head>')) {
                            targetLine = k + 1;
                            break;
                        }
                    }
                    issues.push(createIssue(
                        targetLine,
                        1,
                        `[ファイル横断] index.html 内で stages.js が読み込まれていません`,
                        `<head> 内に <script src="stages.js" defer></script> を記述してください`,
                        'error',
                        lines[targetLine - 1] || ''
                    ));
                }
                if (coreScriptLine === -1) {
                    let targetLine = 1;
                    for (let k = 0; k < lines.length; k++) {
                        if (lines[k].includes('main.js') || lines[k].includes('</head>')) {
                            targetLine = k + 1;
                            break;
                        }
                    }
                    issues.push(createIssue(
                        targetLine,
                        1,
                        `[ファイル横断] index.html 内で main.js が読み込まれていません`,
                        `<head> 内に <script src="main.js" defer></script> を記述してください`,
                        'error',
                        lines[targetLine - 1] || ''
                    ));
                }
                if (styleCssLinkLine === -1) {
                    let targetLine = 1;
                    for (let k = 0; k < lines.length; k++) {
                        if (lines[k].includes('style.css') || lines[k].includes('</head>')) {
                            targetLine = k + 1;
                            break;
                        }
                    }
                    issues.push(createIssue(
                        targetLine,
                        1,
                        `[ファイル横断] index.html 内で style.css が読み込まれていません`,
                        `<head> 内に <link rel="stylesheet" href="style.css"> を記述してください`,
                        'error',
                        lines[targetLine - 1] || ''
                    ));
                }

                if (configScriptLine !== -1 && coreScriptLine !== -1 && configScriptLine > coreScriptLine) {
                    issues.push(createIssue(
                        coreScriptLine,
                        1,
                        `[ファイル横断] main.js が stages.js より先に読み込まれています`,
                        `<script src="stages.js" defer></script> を <script src="main.js" defer></script> より上の行に配置してください`,
                        'error',
                        lines[coreScriptLine - 1] || ''
                    ));
                }
            }
        }

        // ── B. CSSファイルの横断チェック (url(...) の存在確認 & HTML/JS との ID/クラス整合性) ──
        if (filename.endsWith('.css')) {
            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const urlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
                let uMatch;
                while ((uMatch = urlRegex.exec(rawLine)) !== null) {
                    const refUrl = uMatch[1].trim();
                    const resolved = resolveProjectPath(filename, refUrl);
                    if (resolved && !fileExistsInProject(resolved)) {
                        issues.push(createIssue(
                            i + 1,
                            Math.max(1, rawLine.indexOf(refUrl) + 1),
                            `[ファイル横断] CSSの url("${refUrl}") で指定された画像ファイルが見つかりません`,
                            findAssetSuggestion(resolved),
                            'error',
                            rawLine
                        ));
                    }
                }
            }

            // style.css の ID / クラスセレクタが index.html / main.js に存在するか横断チェック
            if (filename === 'style.css' && allFiles['index.html']) {
                const knownIds = new Set([
                    'stageCurrentBtn', 'stageMenuPopup', 'stageMenuGrid', 'hintText'
                ]);
                const knownClasses = new Set([
                    'hidden', 'active', 'edit-mode', 'is-standby', 'in-iframe', 'transitioning-to-editor',
                    'cleared', 'all-stars', 'stage-card', 'stage-card-num', 'stage-card-stars',
                    'star-slot', 'earned', 'stage-card-target', 'legend-item', 'legend-icon', 'legend-text',
                    'forbidden', 'dash', 'step', 'purple', 'status-place', 'status-run', 'status-clear',
                    'status-fail', 'status-hint', 'confetti-piece', 'announce-show', 'is-active',
                    'stage-menu-btn', 'stage-menu-popup', 'stage-menu-grid', 'stage-current-btn', 'stage-select-wrap',
                    'dropdown-arrow', 'hint-active', 'solution-match', 'limit-reached', 'show'
                ]);

                const htmlText = stripHtmlCommentsPreservingLines(getFileContent('index.html'));
                const jsText = getFileContent('main.js') + '\n' + getFileContent('core.js') + '\n' + htmlText;

                let m;
                const htmlIdRe = /\bid\s*=\s*["']([^"']+)["']/gi;
                while ((m = htmlIdRe.exec(jsText)) !== null) knownIds.add(m[1].trim());

                const htmlClassRe = /\bclass\s*=\s*["']([^"']+)["']/gi;
                while ((m = htmlClassRe.exec(jsText)) !== null) {
                    m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach(c => { if (c) knownClasses.add(c.trim()); });
                }

                const jsClassRe = /classList\.(?:add|remove|toggle|contains)\(\s*["']([^"']+)["']/g;
                while ((m = jsClassRe.exec(jsText)) !== null) knownClasses.add(m[1].trim());

                const jsClassNameRe = /className\s*=\s*["'` ]([^"'`]+)["'`]/g;
                while ((m = jsClassNameRe.exec(jsText)) !== null) {
                    m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach(c => { if (c) knownClasses.add(c.trim()); });
                }

                let inComment = false;
                let depth = 0;
                let inAtMedia = false;
                let atMediaBaseDepth = 0;
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

                    if (trimmed.startsWith('@media') && trimmed.includes('{')) {
                        inAtMedia = true;
                        atMediaBaseDepth = depth + 1;
                    }

                    const isSelectorContext = (depth === 0 && !trimmed.startsWith('@')) || (inAtMedia && depth === atMediaBaseDepth && !trimmed.startsWith('@') && !trimmed.startsWith('}'));
                    if (isSelectorContext) {
                        const selPart = trimmed.includes('{') ? trimmed.substring(0, trimmed.indexOf('{')) : trimmed;
                        const idSelRe = /#([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
                        let idM;
                        while ((idM = idSelRe.exec(selPart)) !== null) {
                            const idName = idM[1];
                            if (!knownIds.has(idName)) {
                                const closestId = findClosestInCollection(idName, knownIds, 3);
                                issues.push(createIssue(
                                    i + 1,
                                    Math.max(1, rawLine.indexOf('#' + idName) + 1),
                                    closestId
                                        ? `[ファイル横断] CSSセレクタ「#${idName}」は index.html 内の「#${closestId}」のスペルミスです`
                                        : `[ファイル横断] CSSセレクタ「#${idName}」に対応する id="${idName}" が index.html 内に存在しません`,
                                    closestId
                                        ? `「#${closestId}」に修正してください（index.html には id="${closestId}" が定義されています）`
                                        : `index.html 内の id 名と一致しているか確認してください`,
                                    'error',
                                    rawLine
                                ));
                            }
                        }
                    }

                    for (let c = 0; c < trimmed.length; c++) {
                        if (trimmed[c] === '{') depth++;
                        else if (trimmed[c] === '}') {
                            depth = Math.max(0, depth - 1);
                            if (inAtMedia && depth < atMediaBaseDepth) {
                                inAtMedia = false;
                            }
                        }
                    }
                }
            }
        }

        // ── C. main.js の横断チェック (index.html のDOM ID参照整合性) ──
        if ((filename === 'main.js' || filename === 'core.js') && allFiles['index.html']) {
            const htmlText = stripHtmlCommentsPreservingLines(getFileContent('index.html'));
            const htmlIds = new Set([
                'stageCurrentBtn', 'stageMenuPopup', 'stageMenuGrid', 'hintText'
            ]);

            let m;
            const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
            while ((m = idRegex.exec(htmlText)) !== null) {
                htmlIds.add(m[1].trim());
            }

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const clean = stripLineComment(rawLine);

                const getElemRe = /document\.getElementById\(\s*["']([^"']+)["']\s*\)/g;
                let geM;
                while ((geM = getElemRe.exec(clean)) !== null) {
                    const targetId = geM[1];
                    if (!htmlIds.has(targetId)) {
                        const closestId = findClosestInCollection(targetId, htmlIds, 3);
                        issues.push(createIssue(
                            i + 1,
                            Math.max(1, rawLine.indexOf(targetId) + 1),
                            `[ファイル横断] document.getElementById("${targetId}") に対応する id="${targetId}" が index.html にありません`,
                            closestId
                                ? `index.html 内の id="${closestId}" のスペルミスか、index.html 側で id が変更されています`
                                : `index.html 側に id="${targetId}" の要素が存在するか確認してください`,
                            'error',
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
            filename = 'stages.js';
        }
        if (typeof code !== 'string') return [];
        filename = filename || 'stages.js';

        // テキスト文書 (LICENSE, .txt, .md, .xml 等) は構文チェック対象外
        if (!/\.(?:js|css|html|json)$/i.test(filename)) {
            return [];
        }

        // ファイルが空（または空白・改行・コメントのみ）に消去された場合の検知
        const codeWithoutComments = filename.endsWith('.html')
            ? code.replace(/<!--[\s\S]*?-->/g, '').trim()
            : filename.endsWith('.css')
                ? code.replace(/\/\*[\s\S]*?\*\//g, '').trim()
                : code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();

        if (!code.trim() || !codeWithoutComments) {
            return [createIssue(
                1,
                1,
                `ファイル「${filename}」の中身が空（またはコメントのみ）になっています`,
                `コードが消えてしまっています。「元に戻す（Undo）」または「初期設定に戻す（リセット）」で復元してください`,
                'error',
                (code.split('\n')[0] || '')
            )];
        }

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
        if (filename.endsWith('stages.js') || filename.endsWith('config.js')) {
            issues = issues.concat(checkStagesSchemaAndTraps(code, changedLines));
            if (issues.filter(i => i.severity === 'error').length === 0) {
                issues = issues.concat(checkJavaScriptNativeSyntax(code, changedLines, true));
            }
        } else if (filename.endsWith('.js')) {
            if (issues.filter(i => i.severity === 'error').length === 0) {
                issues = issues.concat(checkJavaScriptNativeSyntax(code, changedLines, false));
            }
            if (issues.filter(i => i.severity === 'error').length === 0) {
                issues = issues.concat(checkJavaScriptSemanticAndConfigRefs(filename, code));
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

        // 6. TODO警告（stages.js / config.js の穴埋め箇所のみ対象）
        if (filename.endsWith('stages.js') || filename.endsWith('config.js')) {
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
            if (entry === null || entry === undefined) continue;
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
        // CLI から直接実行された場合の簡易テストランナー (npm test 対応)
        if (typeof require !== 'undefined' && require.main === module) {
            const fs = require('fs');
            const path = require('path');
            const baseDir = path.resolve(__dirname, '..');
            const checkFiles = [
                'index.html',
                'stages.js',
                'main.js',
                'style.css',
                'editor/index.html',
                'editor/ide.js',
                'editor/linter.js',
                'editor/ide.css',
                'editor/docs.css',
                'editor/sticky-scroll.css',
                'editor/sticky-scroll.js'
            ];
            const filesMap = {};
            for (const f of checkFiles) {
                const fullPath = path.join(baseDir, f);
                if (fs.existsSync(fullPath)) {
                    filesMap[f] = { content: fs.readFileSync(fullPath, 'utf8') };
                }
            }
            const res = lintProject(filesMap);
            if (res.totalErrors > 0) {
                console.error(`❌ エラーが ${res.totalErrors} 件検出されました:`);
                res.allIssues.filter(iss => iss.severity === 'error').forEach(iss => {
                    console.error(`  - [${iss.filename}:${iss.line}] ${iss.message}`);
                });
                process.exit(1);
            } else {
                console.log(`✔ 全ファイルの構文・横断チェック完了 (エラー: 0件, 警告: ${res.totalWarnings}件)`);
            }
        }
    } else {
        global.Linter = Linter;
    }

})(typeof window !== 'undefined' ? window : global);
