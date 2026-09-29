-- Cloudflare D1 データベース定義
-- 犯罪回避ゲーム (Crime Avoidance Game) - ターン制心理戦

-- ルームテーブル
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'waiting', -- waiting, playing, finished
    map_type TEXT NOT NULL DEFAULT '3x3',
    time_limit INTEGER NOT NULL DEFAULT 120,
    current_turn INTEGER NOT NULL DEFAULT 1,
    max_turns INTEGER NOT NULL DEFAULT 12,
    started_at INTEGER,
    ended_at INTEGER,
    winner TEXT, -- 'criminal', 'victim', 'timeout'
    finish_reason TEXT,
    victim_goal_node TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- プレイヤーカーブル
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'criminal', 'victim'
    name TEXT NOT NULL,
    current_node TEXT NOT NULL,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    -- 現在のターンの未確定行動
    pending_move_node TEXT,
    pending_chat_text TEXT,
    is_turn_ready INTEGER NOT NULL DEFAULT 0,
    last_seen_at INTEGER,
    joined_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 移動履歴テーブル（振り返り用）
CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    role TEXT NOT NULL,
    turn INTEGER NOT NULL DEFAULT 1,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    elapsed_seconds INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- チャット履歴テーブル（振り返り用 & リアルタイム用）
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    role TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    turn INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    sender_node_at_time TEXT NOT NULL, -- 送信時の実際の位置（振り返り用）
    timestamp INTEGER NOT NULL,
    elapsed_seconds INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_moves_room ON moves(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
