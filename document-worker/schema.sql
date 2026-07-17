-- ================================================================
-- Document Correction Support — D1 Schema
-- ================================================================

-- エッセイ（最新の下書き状態を保持）
CREATE TABLE IF NOT EXISTS essays (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL DEFAULT 'エッセイ',
  current_content TEXT    NOT NULL DEFAULT '',
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- エッセイバージョン（レビュー依頼ごとのスナップショット）
-- 将来の diff 表示のために全履歴を保持
CREATE TABLE IF NOT EXISTS essay_versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  essay_id   INTEGER NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- レビューセッション
CREATE TABLE IF NOT EXISTS reviews (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id       INTEGER NOT NULL REFERENCES essay_versions(id) ON DELETE CASCADE,
  markdown_comment TEXT    NOT NULL DEFAULT '',
  submitted_at     TEXT,           -- NULL = 下書き中, 値あり = 提出済み
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- チェックリスト項目（キーごとに checked 状態を記録）
CREATE TABLE IF NOT EXISTS review_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id     INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  checklist_key TEXT    NOT NULL,
  checked       INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  UNIQUE(review_id, checklist_key)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_essay_versions_essay_id ON essay_versions(essay_id);
CREATE INDEX IF NOT EXISTS idx_reviews_version_id ON reviews(version_id);
CREATE INDEX IF NOT EXISTS idx_review_items_review_id ON review_items(review_id);

-- 初期データ（エッセイ id=1 を作成）
INSERT OR IGNORE INTO essays (id, title, current_content, updated_at)
VALUES (1, '課題論文', '', datetime('now'));
