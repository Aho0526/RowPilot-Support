// ==========================================
// ハコゲーム - stages.js (ステージ定義)
// ==========================================

const STAGES = [
    {
        id: 1,
        title: 'ステージ 1',
        subtitle: 'ブロックが滑る新ギミック！',
        maxBlocks: 6,
        startRow: 3, // S: 左側 row 3
        goalRow: 1,  // G: 右側 row 1
        forbidden: [
            { col: 3, row: 0 },
            { col: 4, row: 1 }, // 太い赤斜線
            { col: 3, row: 2 },
            { col: 3, row: 3 }
        ],
        gimmicks: [
            // 水色: 矢印の方向に限界まで移動 (row 3, col 1: 右向き、紫枠)
            { col: 1, row: 3, type: 'dash', dir: 'right', purpleBorder: true },
            // 水色: 矢印の方向に限界まで移動 (row 1, col 2: 左向き)
            { col: 2, row: 1, type: 'dash', dir: 'left', purpleBorder: false },
            // 緑色: 1マスだけ矢印の方向に移動 (row 1, col 3: 左向き)
            { col: 3, row: 1, type: 'step', dir: 'left', steps: 1 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に限界まで移動' },
            { icon: '←', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' }
        ]
    },
    {
        id: 2,
        title: 'ステージ 2',
        subtitle: '基本の階段づくり',
        maxBlocks: 8,
        startRow: 4,
        goalRow: 2,
        forbidden: [],
        gimmicks: [],
        legends: [
            { icon: '■', type: 'step', text: 'ブロックを配置してゴールを目指そう' }
        ]
    },
    {
        id: 3,
        title: 'ステージ 3',
        subtitle: 'ダッシュブロックで奈落を埋めろ',
        maxBlocks: 5,
        startRow: 4,
        goalRow: 0,
        forbidden: [
            { col: 2, row: 4 },
            { col: 2, row: 3 },
            { col: 2, row: 2 }
        ],
        gimmicks: [
            { col: 0, row: 4, type: 'dash', dir: 'right', purpleBorder: false },
            { col: 4, row: 2, type: 'step', dir: 'left', steps: 1 }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に限界まで移動' },
            { icon: '←', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' }
        ]
    },
    {
        id: 4,
        title: 'ステージ 4',
        subtitle: '1マスシフトを使いこなせ',
        maxBlocks: 5,
        startRow: 4,
        goalRow: 1,
        forbidden: [
            { col: 1, row: 4 },
            { col: 3, row: 3 }
        ],
        gimmicks: [
            { col: 2, row: 4, type: 'step', dir: 'left', steps: 1 },
            { col: 2, row: 2, type: 'dash', dir: 'right', purpleBorder: false }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に限界まで移動' },
            { icon: '←', type: 'step', text: '緑色：置いたブロックが1マスだけ矢印の方向に移動' }
        ]
    },
    {
        id: 5,
        title: 'ステージ 5',
        subtitle: '高い壁を乗り越えろ',
        maxBlocks: 6,
        startRow: 4,
        goalRow: 0,
        forbidden: [
            { col: 2, row: 4 },
            { col: 2, row: 3 }
        ],
        gimmicks: [
            { col: 1, row: 4, type: 'dash', dir: 'right', purpleBorder: false },
            { col: 3, row: 2, type: 'dash', dir: 'left', purpleBorder: false }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に限界まで移動' }
        ]
    }
];

// 残り（ステージ 6 〜 20）のプレースホルダーを生成
for (let i = 6; i <= 20; i++) {
    STAGES.push({
        id: i,
        title: `ステージ ${i}`,
        subtitle: `ステージ ${i}（構築中）`,
        maxBlocks: 6,
        startRow: 4,
        goalRow: (i % 3 === 0) ? 0 : (i % 2 === 0 ? 1 : 2),
        forbidden: [
            { col: (i * 2) % 5, row: (i % 4) }
        ],
        gimmicks: [
            { col: (i + 1) % 5, row: 3, type: 'dash', dir: 'right', purpleBorder: false }
        ],
        legends: [
            { icon: '／', type: 'forbidden', text: '赤の斜線：配置不可' },
            { icon: '➔', type: 'dash', text: '水色：置いたブロックが矢印の方向に限界まで移動' }
        ]
    });
}
