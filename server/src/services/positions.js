import { START_FEN } from '../lib/positionKey.js';
import { canonicalFen, safePositionKey } from '../lib/chessEngine.js';

export function upsertPosition(db, fen) {
  const canonical = canonicalFen(fen);
  const key = safePositionKey(canonical);
  const existing = db.prepare('SELECT * FROM positions WHERE position_key = ?').get(key);
  if (existing) return existing;

  const info = db.prepare(
    'INSERT INTO positions (position_key, fen) VALUES (?, ?)',
  ).run(key, canonical);

  return db.prepare('SELECT * FROM positions WHERE id = ?').get(info.lastInsertRowid);
}

export function ensureStartPosition(db) {
  return upsertPosition(db, START_FEN);
}

export function getSuggestions(db, positionKey) {
  const pos = db.prepare('SELECT id FROM positions WHERE position_key = ?').get(positionKey);
  if (!pos) return [];

  const rows = db.prepare(`
    SELECT
      m.id,
      m.uci,
      m.san,
      COUNT(o.id) AS encounter_count,
      MAX(o.observed_at) AS last_seen
    FROM moves m
    JOIN observations o ON o.move_id = m.id
    WHERE m.from_position_id = ?
    GROUP BY m.id
    ORDER BY encounter_count DESC, m.san COLLATE NOCASE ASC
  `).all(pos.id);

  const total = rows.reduce((sum, row) => sum + Number(row.encounter_count), 0);
  const namesStmt = db.prepare(`
    SELECT DISTINCT op.name
    FROM opening_moves om
    JOIN openings op ON op.id = om.opening_id
    WHERE om.move_id = ?
    ORDER BY op.name COLLATE NOCASE
  `);

  return rows.map((row) => ({
    moveId: Number(row.id),
    uci: row.uci,
    san: row.san,
    encounterCount: Number(row.encounter_count),
    percentage: total ? Math.round((Number(row.encounter_count) / total) * 1000) / 10 : 0,
    lastSeen: row.last_seen,
    openingNames: namesStmt.all(row.id).map((item) => item.name),
  }));
}

export function getOrCreateMove(db, fromFen, toFen, uci, san) {
  const fromPos = upsertPosition(db, fromFen);
  const toPos = upsertPosition(db, toFen);
  const existing = db.prepare(
    'SELECT * FROM moves WHERE from_position_id = ? AND uci = ?',
  ).get(fromPos.id, uci);

  if (existing) return existing;

  const info = db.prepare(
    'INSERT INTO moves (from_position_id, to_position_id, uci, san) VALUES (?, ?, ?, ?)',
  ).run(fromPos.id, toPos.id, uci, san);

  return db.prepare('SELECT * FROM moves WHERE id = ?').get(info.lastInsertRowid);
}
