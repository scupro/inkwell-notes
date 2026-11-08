-- 可選：函數首次請求時會自動建表。也可在 Neon SQL Editor 手動執行。
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING GIN (tags);
CREATE INDEX IF NOT EXISTS notes_category_idx ON notes (category_id);
