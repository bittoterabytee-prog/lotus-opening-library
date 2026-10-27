import { HttpError } from '../lib/httpError.js';
import { withTransaction } from '../db/database.js';
import { applyLineToNewSession, getSessionRow } from './sessions.js';

function mapOpening(row) {
  return {
    id: Number(row.id),
    name: row.name,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function openingLine(db, openingId) {
  return db.prepare(`
    SELECT om.ply, m.uci, m.san, p_from.position_key AS from_key, p_to.position_key AS to_key
    FROM opening_moves om
    JOIN moves m ON m.id = om.move_id
    JOIN positions p_from ON p_from.id = m.from_position_id
    JOIN positions p_to ON p_to.id = m.to_position_id
    WHERE om.opening_id = ?
    ORDER BY om.ply ASC
  `).all(openingId).map((row) => ({
    ply: Number(row.ply),
    uci: row.uci,
    san: row.san,
    fromKey: row.from_key,
    toKey: row.to_key,
  }));
}

export function getOpening(db, openingId) {
  const row = db.prepare('SELECT * FROM openings WHERE id = ?').get(openingId);
  if (!row) throw new HttpError(404, 'Opening not found');
  return {
    ...mapOpening(row),
    line: openingLine(db, openingId),
    pgn: toPgn(openingLine(db, openingId)),
  };
}

function toPgn(line) {
  const parts = [];
  for (const move of line) {
    if (move.ply % 2 === 1) {
      parts.push(`${Math.ceil(move.ply / 2)}. ${move.san}`);
    } else {
      parts.push(move.san);
    }
  }
  return parts.join(' ');
}

export function listOpenings(db, { q } = {}) {
  let rows;
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    rows = db.prepare(`
      SELECT * FROM openings
      WHERE name LIKE ? OR IFNULL(source, '') LIKE ? OR IFNULL(notes, '') LIKE ?
      ORDER BY datetime(updated_at) DESC, id DESC
    `).all(like, like, like);
  } else {
    rows = db.prepare(`
      SELECT * FROM openings
      ORDER BY datetime(updated_at) DESC, id DESC
    `).all();
  }

  return rows.map((row) => {
    const line = openingLine(db, row.id);
    return {
      ...mapOpening(row),
      plyCount: line.length,
      pgn: toPgn(line),
      line,
    };
  });
}

export function createOpeningFromSession(db, sessionId, { name, source, notes } = {}) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    throw new HttpError(400, 'Opening name is required');
  }

  return withTransaction(db, () => {
    const session = getSessionRow(db, sessionId);
    const moves = db.prepare(`
      SELECT ply, move_id FROM session_moves
      WHERE session_id = ? AND ply <= ?
      ORDER BY ply ASC
    `).all(sessionId, session.ply);

    if (moves.length === 0) {
      throw new HttpError(400, 'Save at least one move before naming this line');
    }

    const info = db.prepare(`
      INSERT INTO openings (name, source, notes)
      VALUES (?, ?, ?)
    `).run(trimmed, source?.trim() || null, notes?.trim() || null);

    const insertMove = db.prepare(`
      INSERT INTO opening_moves (opening_id, ply, move_id)
      VALUES (?, ?, ?)
    `);
    for (const move of moves) {
      insertMove.run(info.lastInsertRowid, move.ply, move.move_id);
    }

    return getOpening(db, info.lastInsertRowid);
  });
}

export function updateOpening(db, openingId, { name, source, notes } = {}) {
  const current = db.prepare('SELECT * FROM openings WHERE id = ?').get(openingId);
  if (!current) throw new HttpError(404, 'Opening not found');

  const nextName = name === undefined ? current.name : String(name).trim();
  if (!nextName) throw new HttpError(400, 'Opening name is required');

  db.prepare(`
    UPDATE openings
    SET name = ?, source = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nextName,
    source === undefined ? current.source : (source?.trim() || null),
    notes === undefined ? current.notes : (notes?.trim() || null),
    openingId,
  );

  return getOpening(db, openingId);
}

export function deleteOpening(db, openingId) {
  const current = db.prepare('SELECT * FROM openings WHERE id = ?').get(openingId);
  if (!current) throw new HttpError(404, 'Opening not found');

  withTransaction(db, () => {
    db.prepare('DELETE FROM opening_moves WHERE opening_id = ?').run(openingId);
    db.prepare('DELETE FROM openings WHERE id = ?').run(openingId);
  });

  return { deleted: true, id: Number(openingId) };
}

export function playOpening(db, openingId) {
  const opening = getOpening(db, openingId);
  if (opening.line.length === 0) {
    throw new HttpError(400, 'This opening has no moves to replay');
  }

  return applyLineToNewSession(db, {
    name: `Replay: ${opening.name}`,
    lessonName: opening.source || opening.name,
    moveUcis: opening.line.map((move) => move.uci),
    observe: false,
  });
}
