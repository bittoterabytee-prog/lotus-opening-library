-- Lotus Opening Library V1 schema
-- Applied once via schema_migrations. Never dropped on startup.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Canonical identity: piece placement, side to move, castling, en passant.
  -- Excludes halfmove clock and fullmove number.
  position_key TEXT NOT NULL UNIQUE,
  -- Representative full FEN (includes clocks) for replaying this position.
  fen TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_position_id INTEGER NOT NULL REFERENCES positions(id),
  to_position_id INTEGER NOT NULL REFERENCES positions(id),
  uci TEXT NOT NULL,
  san TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_position_id, uci)
);

CREATE INDEX IF NOT EXISTS idx_moves_from ON moves(from_position_id);
CREATE INDEX IF NOT EXISTS idx_moves_to ON moves(to_position_id);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  lesson_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  current_fen TEXT NOT NULL,
  ply INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity_at DESC);

-- One row per accepted observation event. Undo does not delete these rows.
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  move_id INTEGER NOT NULL REFERENCES moves(id),
  ply INTEGER NOT NULL,
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'manual',
  client_event_id TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_obs_move ON observations(move_id);
CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_obs_session_ply_move ON observations(session_id, ply, move_id);

-- Current (and future, after undo) path of a session. Truncated only when
-- the user plays a different move after stepping back.
CREATE TABLE IF NOT EXISTS session_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ply INTEGER NOT NULL,
  move_id INTEGER NOT NULL REFERENCES moves(id),
  observation_id INTEGER REFERENCES observations(id),
  UNIQUE (session_id, ply)
);

CREATE INDEX IF NOT EXISTS idx_session_moves_session ON session_moves(session_id);

CREATE TABLE IF NOT EXISTS openings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_openings_name ON openings(name);
CREATE INDEX IF NOT EXISTS idx_openings_source ON openings(source);

-- Ordered main-line plies for a named opening/lesson.
-- Deleting an opening removes only these rows, not shared move history.
CREATE TABLE IF NOT EXISTS opening_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opening_id INTEGER NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  ply INTEGER NOT NULL,
  move_id INTEGER NOT NULL REFERENCES moves(id),
  UNIQUE (opening_id, ply)
);

CREATE INDEX IF NOT EXISTS idx_opening_moves_opening ON opening_moves(opening_id);
CREATE INDEX IF NOT EXISTS idx_opening_moves_move ON opening_moves(move_id);
