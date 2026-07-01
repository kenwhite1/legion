-- Легион: профили игроков и накопленная статистика.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,           -- telegram user id
  name          TEXT    NOT NULL DEFAULT 'Player',
  username      TEXT,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  played        INTEGER NOT NULL DEFAULT 0,
  streak        INTEGER NOT NULL DEFAULT 0,    -- current win streak
  best_streak   INTEGER NOT NULL DEFAULT 0,
  coins         INTEGER NOT NULL DEFAULT 0,    -- soft currency for flair
  write_access  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT
);

-- Finished-round ledger (for leaderboards / history).
CREATE TABLE IF NOT EXISTS results (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  mode      TEXT    NOT NULL,                  -- 'solo' | 'online'
  won       INTEGER NOT NULL,
  score     INTEGER NOT NULL DEFAULT 0,
  ts        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_results_user ON results(user_id);
