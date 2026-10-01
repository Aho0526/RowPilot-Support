// ==========================================
// ハコゲーム - stages.js (ステージ 1 〜 19 定義)
// ==========================================

const STAGES = [
    // ------------------------------------------
    // ステージ 1
    // ------------------------------------------
    {
        id: 1,
        title: 'ステージ 1',
        subtitle: 'ブロックが滑る新ギミック！',
        maxBlocks: 7,
        startRow: 3,
        goalRow: 1,
        forbidden: [
            { col: 3, row: 0 },
            { col: 4, row: 1 },
            { col: 3, row: 2 },
            { col: 3, row: 3 }
        ],
        gimmicks: [
            { col: 1, row: 3, type: 'dash', dir: 'right', purpleBorder: true },
            { col: 2, row: 1, type: 'dash', dir: 'left', purpleBorder: false },
            { col: 3, row: 1, type: 'step', dir: 'left', steps: 1 }
        ],
        solution: [
            { col: 3, row: 1 },
            { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 4, row: 2 },
            { col: 0, row: 3 }, { col: 1, row: 3 }, { col: 4, row: 3 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '←', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 2
    // ------------------------------------------
    {
        id: 2,
        title: 'ステージ 2',
        subtitle: '下と右へのギミック活用',
        maxBlocks: 5,
        startRow: 1,
        goalRow: 1,
        forbidden: [
            { col: 2, row: 0 },
            { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 4, row: 1 },
            { col: 4, row: 2 },
            { col: 4, row: 3 }
        ],
        gimmicks: [
            { col: 1, row: 2, type: 'step', dir: 'down', steps: 1 },
            { col: 1, row: 3, type: 'dash', dir: 'right', purpleBorder: false }
        ],
        solution: [
            { col: 1, row: 0 },
            { col: 0, row: 1 }, { col: 3, row: 1 },
            { col: 1, row: 2 }, { col: 2, row: 2 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '↓', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' }
        ]
    },

    // ------------------------------------------
    // ステージ 3
    // ------------------------------------------
    {
        id: 3,
        title: 'ステージ 3',
        subtitle: '紫枠は必ず設置！',
        maxBlocks: 6,
        startRow: 0,
        goalRow: 3,
        forbidden: [
            { col: 3, row: 3 }
        ],
        gimmicks: [
            { col: 1, row: 1, type: 'dash', dir: 'right', purpleBorder: true },
            { col: 1, row: 2, purpleBorder: true },
            { col: 1, row: 3, type: 'dash', dir: 'up', purpleBorder: false },
            { col: 3, row: 1, type: 'dash', dir: 'down', purpleBorder: false },
            { col: 3, row: 3, type: 'dash', dir: 'left', purpleBorder: false }
        ],
        solution: [
            { col: 0, row: 1 }, { col: 1, row: 1 },
            { col: 1, row: 2 },
            { col: 2, row: 3 },
            { col: 3, row: 4 }, { col: 4, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 4
    // ------------------------------------------
    {
        id: 4,
        title: 'ステージ 4',
        subtitle: '下へスライドさせて足場を組め',
        maxBlocks: 5,
        startRow: 4,
        goalRow: 0,
        forbidden: [],
        gimmicks: [
            { col: 1, row: 1, type: 'dash', dir: 'down', purpleBorder: true },
            { col: 2, row: 1, type: 'dash', dir: 'right', purpleBorder: false },
            { col: 1, row: 3, type: 'step', dir: 'down', steps: 1 },
            { col: 1, row: 4, type: 'step', dir: 'left', steps: 1 }
        ],
        solution: [
            { col: 1, row: 1 }, { col: 2, row: 1 },
            { col: 3, row: 2 },
            { col: 1, row: 3 }, { col: 2, row: 3 }
        ],
        legends: [
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '↓', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 5
    // ------------------------------------------
    {
        id: 5,
        title: 'ステージ 5',
        subtitle: '矢印の連鎖',
        maxBlocks: 6,
        startRow: 1,
        goalRow: 3,
        forbidden: [
            { col: 3, row: 0 },
            { col: 2, row: 3 }
        ],
        gimmicks: [
            { col: 0, row: 0, type: 'dash', dir: 'right', purpleBorder: true },
            { col: 3, row: 1, type: 'step', dir: 'up', steps: 1 },
            { col: 2, row: 2, type: 'step', dir: 'up', steps: 1 },
            { col: 3, row: 3, type: 'step', dir: 'down', steps: 1 },
            { col: 1, row: 4, type: 'step', dir: 'left', steps: 1 }
        ],
        solution: [
            { col: 0, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 2 },
            { col: 2, row: 2 },
            { col: 3, row: 3 },
            { col: 4, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '↑', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 6
    // ------------------------------------------
    {
        id: 6,
        title: 'ステージ 6',
        subtitle: '上向きステップの使い道',
        maxBlocks: 6,
        startRow: 1,
        goalRow: 3,
        forbidden: [
            { col: 3, row: 0 },
            { col: 2, row: 3 }
        ],
        gimmicks: [
            { col: 1, row: 2, purpleBorder: true },
            { col: 3, row: 1, type: 'step', dir: 'up', steps: 1, purpleBorder: true },
            { col: 2, row: 2, type: 'step', dir: 'up', steps: 1 },
            { col: 3, row: 3, type: 'step', dir: 'down', steps: 1 },
            { col: 1, row: 4, type: 'step', dir: 'right', steps: 1 }
        ],
        solution: [
            { col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 },
            { col: 3, row: 1 },
            { col: 3, row: 3 },
            { col: 4, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '↑', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 7
    // ------------------------------------------
    {
        id: 7,
        title: 'ステージ 7',
        subtitle: '縦横スライドで道を作れ',
        maxBlocks: 6,
        startRow: 1,
        goalRow: 3,
        forbidden: [
            { col: 2, row: 2 },
            { col: 2, row: 3 }
        ],
        gimmicks: [
            { col: 2, row: 0, type: 'dash', dir: 'down', purpleBorder: true },
            { col: 3, row: 1, type: 'dash', dir: 'down', purpleBorder: false },
            { col: 2, row: 4, type: 'dash', dir: 'right', purpleBorder: false }
        ],
        solution: [
            { col: 2, row: 0 },
            { col: 1, row: 1 }, { col: 3, row: 1 },
            { col: 0, row: 2 },
            { col: 1, row: 3 },
            { col: 2, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 8
    // ------------------------------------------
    {
        id: 8,
        title: 'ステージ 8',
        subtitle: 'ステップとダッシュのコンビネーション',
        maxBlocks: 6,
        startRow: 3,
        goalRow: 3,
        forbidden: [
            { col: 0, row: 3 },
            { col: 1, row: 4 }
        ],
        gimmicks: [
            { col: 4, row: 1, type: 'dash', dir: 'down', purpleBorder: true },
            { col: 1, row: 2, type: 'step', dir: 'right', steps: 1 },
            { col: 2, row: 3, type: 'dash', dir: 'left', purpleBorder: false },
            { col: 2, row: 4, purpleBorder: true }
        ],
        solution: [
            { col: 3, row: 1 }, { col: 4, row: 1 },
            { col: 1, row: 2 }, { col: 2, row: 2 },
            { col: 2, row: 3 },
            { col: 2, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '→', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 9
    // ------------------------------------------
    {
        id: 9,
        title: 'ステージ 9',
        subtitle: '上へ持ち上げられるブロック',
        maxBlocks: 6,
        startRow: 1,
        goalRow: 0,
        forbidden: [
            { col: 2, row: 0 },
            { col: 2, row: 3 }
        ],
        gimmicks: [
            { col: 1, row: 0, type: 'dash', dir: 'right', purpleBorder: false },
            { col: 1, row: 1, type: 'step', dir: 'up', steps: 1, purpleBorder: true },
            { col: 1, row: 2, type: 'step', dir: 'right', steps: 1 },
            { col: 2, row: 2, type: 'step', dir: 'down', steps: 1 }
        ],
        solution: [
            { col: 1, row: 1 }, { col: 3, row: 1 },
            { col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 },
            { col: 1, row: 3 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '↑', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 10
    // ------------------------------------------
    {
        id: 10,
        title: 'ステージ 10',
        subtitle: '十字のギミック交差点',
        maxBlocks: 6,
        startRow: 0,
        goalRow: 0,
        forbidden: [
            { col: 3, row: 0 },
            { col: 2, row: 1 },
            { col: 4, row: 2 }
        ],
        gimmicks: [
            { col: 1, row: 0, type: 'dash', dir: 'down', purpleBorder: true },
            { col: 3, row: 1, type: 'dash', dir: 'left', purpleBorder: false },
            { col: 3, row: 2, type: 'step', dir: 'right', steps: 1 },
            { col: 3, row: 3, type: 'step', dir: 'up', steps: 1 },
            { col: 0, row: 4, type: 'step', dir: 'right', steps: 1 }
        ],
        solution: [
            { col: 1, row: 0 },
            { col: 3, row: 1 },
            { col: 1, row: 2 }, { col: 3, row: 2 },
            { col: 3, row: 3 },
            { col: 0, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '→', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 11
    // ------------------------------------------
    {
        id: 11,
        title: 'ステージ 11',
        subtitle: '谷底からの脱出',
        maxBlocks: 7,
        startRow: 0,
        goalRow: 1,
        forbidden: [],
        gimmicks: [
            { col: 2, row: 0, purpleBorder: true },
            { col: 1, row: 1, type: 'dash', dir: 'down', purpleBorder: false },
            { col: 2, row: 3, purpleBorder: true }
        ],
        solution: [
            { col: 2, row: 0 },
            { col: 1, row: 1 }, { col: 4, row: 1 },
            { col: 0, row: 2 }, { col: 3, row: 2 },
            { col: 1, row: 3 }, { col: 2, row: 3 }
        ],
        legends: [
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 12
    // ------------------------------------------
    {
        id: 12,
        title: 'ステージ 12',
        subtitle: '角の紫枠を活かせ',
        maxBlocks: 7,
        startRow: 1,
        goalRow: 3,
        forbidden: [
            { col: 2, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 }
        ],
        gimmicks: [
            { col: 2, row: 1, type: 'dash', dir: 'left', purpleBorder: false },
            { col: 3, row: 1, purpleBorder: true },
            { col: 1, row: 2, type: 'dash', dir: 'right', purpleBorder: false },
            { col: 3, row: 2, type: 'dash', dir: 'down', purpleBorder: false },
            { col: 1, row: 4, purpleBorder: true },
            { col: 3, row: 4, type: 'step', dir: 'right', steps: 1 }
        ],
        solution: [
            { col: 2, row: 1 }, { col: 3, row: 1 },
            { col: 1, row: 2 }, { col: 3, row: 2 },
            { col: 1, row: 3 }, { col: 2, row: 3 },
            { col: 1, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '→', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 13
    // ------------------------------------------
    {
        id: 13,
        title: 'ステージ 13',
        subtitle: '右向きダッシュと上向きダッシュ',
        maxBlocks: 6,
        startRow: 2,
        goalRow: 2,
        forbidden: [
            { col: 2, row: 0 },
            { col: 2, row: 1 },
            { col: 0, row: 2 },
            { col: 4, row: 2 },
            { col: 4, row: 3 },
            { col: 4, row: 4 }
        ],
        gimmicks: [
            { col: 1, row: 2, type: 'step', dir: 'left', steps: 1 },
            { col: 3, row: 2, type: 'dash', dir: 'up', purpleBorder: true },
            { col: 2, row: 3, type: 'dash', dir: 'right', purpleBorder: true }
        ],
        solution: [
            { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 },
            { col: 1, row: 3 }, { col: 2, row: 3 },
            { col: 3, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '←', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 14
    // ------------------------------------------
    {
        id: 14,
        title: 'ステージ 14',
        subtitle: 'ジグザグの狭路',
        maxBlocks: 5,
        startRow: 0,
        goalRow: 3,
        forbidden: [
            { col: 2, row: 0 }, { col: 4, row: 0 },
            { col: 2, row: 1 }, { col: 4, row: 1 },
            { col: 0, row: 2 },
            { col: 0, row: 3 }, { col: 3, row: 3 },
            { col: 0, row: 4 }, { col: 3, row: 4 }
        ],
        gimmicks: [
            { col: 3, row: 0, type: 'step', dir: 'right', steps: 1 },
            { col: 1, row: 1, type: 'step', dir: 'left', steps: 1 },
            { col: 1, row: 4, type: 'dash', dir: 'right', purpleBorder: true },
            { col: 2, row: 4, type: 'step', dir: 'up', steps: 1 }
        ],
        solution: [
            { col: 3, row: 0 },
            { col: 1, row: 1 },
            { col: 1, row: 2 },
            { col: 2, row: 3 },
            { col: 1, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '→', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 15
    // ------------------------------------------
    {
        id: 15,
        title: 'ステージ 15',
        subtitle: '外周ギミックを回せ',
        maxBlocks: 6,
        startRow: 0,
        goalRow: 3,
        forbidden: [
            { col: 4, row: 2 },
            { col: 4, row: 3 },
            { col: 4, row: 4 }
        ],
        gimmicks: [
            { col: 0, row: 2, type: 'dash', dir: 'down', purpleBorder: false },
            { col: 1, row: 3, type: 'step', dir: 'up', steps: 1, purpleBorder: true },
            { col: 3, row: 2, type: 'dash', dir: 'left', purpleBorder: false },
            { col: 0, row: 4, type: 'dash', dir: 'right', purpleBorder: false }
        ],
        solution: [
            { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 3 },
            { col: 1, row: 3 }, { col: 2, row: 3 },
            { col: 0, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '↑', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 16
    // ------------------------------------------
    {
        id: 16,
        title: 'ステージ 16',
        subtitle: '左右の壁に挟まれた回廊',
        maxBlocks: 5,
        startRow: 0,
        goalRow: 0,
        forbidden: [
            { col: 0, row: 1 }, { col: 2, row: 1 }, { col: 4, row: 1 },
            { col: 0, row: 2 }, { col: 4, row: 2 },
            { col: 0, row: 3 }, { col: 4, row: 3 },
            { col: 0, row: 4 }, { col: 4, row: 4 }
        ],
        gimmicks: [
            { col: 1, row: 1, type: 'step', dir: 'left', steps: 1 },
            { col: 3, row: 1, type: 'step', dir: 'left', steps: 1 },
            { col: 2, row: 2, type: 'dash', dir: 'right', purpleBorder: false },
            { col: 1, row: 3, type: 'step', dir: 'right', steps: 1 }
        ],
        solution: [
            { col: 1, row: 1 }, { col: 3, row: 1 },
            { col: 1, row: 2 }, { col: 2, row: 2 },
            { col: 3, row: 3 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '←', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' }
        ]
    },

    // ------------------------------------------
    // ステージ 17
    // ------------------------------------------
    {
        id: 17,
        title: 'ステージ 17',
        subtitle: '高低差を乗り越えろ',
        maxBlocks: 5,
        startRow: 3,
        goalRow: 0,
        forbidden: [
            { col: 3, row: 2 }
        ],
        gimmicks: [
            { col: 1, row: 1, type: 'dash', dir: 'right', purpleBorder: true },
            { col: 1, row: 2, type: 'dash', dir: 'down', purpleBorder: false },
            { col: 3, row: 3, type: 'step', dir: 'up', steps: 1 }
        ],
        solution: [
            { col: 1, row: 1 }, { col: 1, row: 2 },
            { col: 0, row: 3 }, { col: 2, row: 3 }, { col: 3, row: 3 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '↑', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    },

    // ------------------------------------------
    // ステージ 18
    // ------------------------------------------
    {
        id: 18,
        title: 'ステージ 18',
        subtitle: '斜め障害物を縫う道',
        maxBlocks: 5,
        startRow: 0,
        goalRow: 0,
        forbidden: [
            { col: 3, row: 0 },
            { col: 2, row: 1 },
            { col: 4, row: 2 }
        ],
        gimmicks: [
            { col: 3, row: 1, type: 'dash', dir: 'left', purpleBorder: false },
            { col: 3, row: 2, type: 'step', dir: 'right', steps: 1 },
            { col: 3, row: 3, type: 'step', dir: 'up', steps: 1 }
        ],
        solution: [
            { col: 3, row: 1 },
            { col: 2, row: 2 }, { col: 3, row: 2 },
            { col: 1, row: 3 }, { col: 3, row: 3 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '↑', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' }
        ]
    },

    // ------------------------------------------
    // ステージ 19
    // ------------------------------------------
    {
        id: 19,
        title: 'ステージ 19',
        subtitle: '最終関門・中央の壁',
        maxBlocks: 6,
        startRow: 2,
        goalRow: 2,
        forbidden: [
            { col: 3, row: 0 },
            { col: 3, row: 1 },
            { col: 3, row: 2 },
            { col: 3, row: 3 }
        ],
        gimmicks: [
            { col: 1, row: 1, type: 'dash', dir: 'down', purpleBorder: true },
            { col: 2, row: 2, type: 'step', dir: 'right', steps: 1 },
            { col: 1, row: 4, type: 'dash', dir: 'right', purpleBorder: false }
        ],
        solution: [
            { col: 1, row: 1 },
            { col: 0, row: 2 }, { col: 2, row: 2 },
            { col: 1, row: 3 }, { col: 2, row: 3 },
            { col: 1, row: 4 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に端まで移動（緑矢印で方向転換し1マス移動）' },
            { icon: '→', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' },
            { icon: '▢', type: 'purple', text: '紫枠：必ずブロックを設置' }
        ]
    }
];
