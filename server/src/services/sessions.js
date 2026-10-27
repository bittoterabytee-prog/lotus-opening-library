import { START_FEN } from '../lib/positionKey.js';
import { HttpError } from '../lib/httpError.js';
import {
  applyMoveInput,
  createGame,
  gameStatus,
  moveToUci,
  safePositionKey,
} from '../lib/chessEngine.js';
import { isUniqueConstraintError, withTransaction } from '../db/database.js';
import { getOrCreateMove, getSuggestions } from './positions.js';

function mapSession(row) {
  return {
    id: Number(row.id),
    name: row.name,
    lessonName: row.lesson_name,
    status: row.status,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    currentFen: row.current_fen,
    ply: Number(row.ply),
  };
}

export function getSessionRow(db, sessionId) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!row) throw new HttpError(404, 'Session not found');
  return row;
}

export function listSessions(db) {
  return db.prepare(`
    SELECT * FROM sessions
    ORDER BY datetime(last_activity_at) DESC, id DESC
    LIMIT 100
  `).all().map(mapSession);
}

export function getActiveSession(db) {
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE status = 'active'
    ORDER BY datetime(last_activity_at) DESC, id DESC
    LIMIT 1
  `).get();
  return row ? mapSession(row) : null;
}

function closeActiveSessions(db, status) {
  db.prepare(`
    UPDATE sessions
    SET status = ?, last_activity_at = datetime('now')
    WHERE status = 'active'
  `).run(status);
}

export function createSession(db, { name, lessonName, reuseActive, force } = {}) {
  return withTransaction(db, () => {
    const active = db.prepare(`
      SELECT * FROM sessions
      WHERE status = 'active'
      ORDER BY datetime(last_activity_at) DESC, id DESC
      LIMIT 1
    `).get();

    if (active && reuseActive && !force) {
      return getSessionState(db, active.id);
    }

    if (active && !force) {
      throw new HttpError(409, 'An active session is already in progress', {
        needsConfirmation: true,
        session: mapSession(active),
      });
    }

    if (active && force) {
      const nextStatus = Number(active.ply) > 0 ? 'completed' : 'abandoned';
      closeActiveSessions(db, nextStatus);
    }

    const info = db.prepare(`
      INSERT INTO sessions (name, lesson_name, current_fen, ply, status)
      VALUES (?, ?, ?, 0, 'active')
    `).run(name ?? null, lessonName ?? null, START_FEN);

    return getSessionState(db, info.lastInsertRowid);
  });
}

export function updateSession(db, sessionId, { name, lessonName, status } = {}) {
  const current = getSessionRow(db, sessionId);
  const nextName = name === undefined ? current.name : name;
  const nextLesson = lessonName === undefined ? current.lesson_name : lessonName;
  let nextStatus = current.status;

  if (status !== undefined) {
    if (!['active', 'completed', 'abandoned'].includes(status)) {
      throw new HttpError(400, 'Invalid session status');
    }
    nextStatus = status;
  }

  db.prepare(`
    UPDATE sessions
    SET name = ?, lesson_name = ?, status = ?, last_activity_at = datetime('now')
    WHERE id = ?
  `).run(nextName ?? null, nextLesson ?? null, nextStatus, sessionId);

  return getSessionState(db, sessionId);
}

function replayToPly(db, sessionId, ply) {
  const chess = createGame(START_FEN);
  if (ply <= 0) return chess;

  const rows = db.prepare(`
    SELECT m.uci
    FROM session_moves sm
    JOIN moves m ON m.id = sm.move_id
    WHERE sm.session_id = ? AND sm.ply <= ?
    ORDER BY sm.ply ASC
  `).all(sessionId, ply);

  for (const row of rows) {
    applyMoveInput(chess, row.uci);
  }
  return chess;
}

function buildHistory(db, sessionId) {
  const rows = db.prepare(`
    SELECT sm.ply, m.uci, m.san, p_to.fen AS fen_after, p_from.fen AS fen_before
    FROM session_moves sm
    JOIN moves m ON m.id = sm.move_id
    JOIN positions p_from ON p_from.id = m.from_position_id
    JOIN positions p_to ON p_to.id = m.to_position_id
    WHERE sm.session_id = ?
    ORDER BY sm.ply ASC
  `).all(sessionId);

  return rows.map((row) => ({
    ply: Number(row.ply),
    uci: row.uci,
    san: row.san,
    fenBefore: row.fen_before,
    fenAfter: row.fen_after,
  }));
}

export function getSessionState(db, sessionId) {
  const row = getSessionRow(db, sessionId);
  const chess = createGame(row.current_fen);
  const history = buildHistory(db, sessionId);
  const maxPly = history.length;
  const last = history.find((item) => item.ply === Number(row.ply)) ?? null;
  const key = safePositionKey(row.current_fen);

  return {
    session: mapSession(row),
    fen: row.current_fen,
    positionKey: key,
    maxPly,
    canUndo: Number(row.ply) > 0,
    canRedo: Number(row.ply) < maxPly,
    lastMove: last ? { uci: last.uci, san: last.san, from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null,
    history,
    suggestions: getSuggestions(db, key),
    game: gameStatus(chess),
  };
}

export function recordSessionMove(db, sessionId, { uci, san, clientEventId, source } = {}) {
  return withTransaction(db, () => {
    if (clientEventId) {
      const existingEvent = db.prepare(
        'SELECT session_id FROM observations WHERE client_event_id = ?',
      ).get(clientEventId);
      if (existingEvent) {
        return getSessionState(db, existingEvent.session_id);
      }
    }

    const session = getSessionRow(db, sessionId);
    if (session.status !== 'active') {
      throw new HttpError(400, 'Session is not active');
    }

    const chess = createGame(session.current_fen);
    const fromFen = chess.fen();
    const move = applyMoveInput(chess, uci || san);
    const actualUci = moveToUci(move);
    const toFen = chess.fen();
    const nextPly = Number(session.ply) + 1;

    const moveRow = getOrCreateMove(db, fromFen, toFen, actualUci, move.san);

    const existingAtPly = db.prepare(
      'SELECT * FROM session_moves WHERE session_id = ? AND ply = ?',
    ).get(sessionId, nextPly);

    if (existingAtPly && Number(existingAtPly.move_id) === Number(moveRow.id)) {
      db.prepare(`
        UPDATE sessions
        SET current_fen = ?, ply = ?, last_activity_at = datetime('now')
        WHERE id = ?
      `).run(toFen, nextPly, sessionId);
      return getSessionState(db, sessionId);
    }

    if (existingAtPly) {
      db.prepare('DELETE FROM session_moves WHERE session_id = ? AND ply >= ?').run(sessionId, nextPly);
    }

    let observationId = null;
    const retry = db.prepare(`
      SELECT * FROM observations
      WHERE session_id = ? AND ply = ? AND move_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(sessionId, nextPly, moveRow.id);

    if (retry) {
      observationId = retry.id;
    } else {
      try {
        const info = db.prepare(`
          INSERT INTO observations (session_id, move_id, ply, source, client_event_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(sessionId, moveRow.id, nextPly, source || 'manual', clientEventId || null);
        observationId = info.lastInsertRowid;
      } catch (err) {
        if (clientEventId && isUniqueConstraintError(err)) {
          return getSessionState(db, sessionId);
        }
        throw err;
      }
    }

    db.prepare(`
      INSERT INTO session_moves (session_id, ply, move_id, observation_id)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, nextPly, moveRow.id, observationId);

    db.prepare(`
      UPDATE sessions
      SET current_fen = ?, ply = ?, last_activity_at = datetime('now')
      WHERE id = ?
    `).run(toFen, nextPly, sessionId);

    return getSessionState(db, sessionId);
  });
}

export function undoSessionMove(db, sessionId) {
  return withTransaction(db, () => {
    const session = getSessionRow(db, sessionId);
    if (session.status !== 'active') {
      throw new HttpError(400, 'Session is not active');
    }
    if (Number(session.ply) <= 0) {
      throw new HttpError(400, 'Nothing to undo');
    }

    const nextPly = Number(session.ply) - 1;
    const chess = replayToPly(db, sessionId, nextPly);

    db.prepare(`
      UPDATE sessions
      SET current_fen = ?, ply = ?, last_activity_at = datetime('now')
      WHERE id = ?
    `).run(chess.fen(), nextPly, sessionId);

    return getSessionState(db, sessionId);
  });
}

export function redoSessionMove(db, sessionId) {
  return withTransaction(db, () => {
    const session = getSessionRow(db, sessionId);
    if (session.status !== 'active') {
      throw new HttpError(400, 'Session is not active');
    }

    const next = db.prepare(`
      SELECT sm.ply, m.uci
      FROM session_moves sm
      JOIN moves m ON m.id = sm.move_id
      WHERE sm.session_id = ? AND sm.ply = ?
    `).get(sessionId, Number(session.ply) + 1);

    if (!next) {
      throw new HttpError(400, 'Nothing to redo');
    }

    const chess = createGame(session.current_fen);
    applyMoveInput(chess, next.uci);

    db.prepare(`
      UPDATE sessions
      SET current_fen = ?, ply = ?, last_activity_at = datetime('now')
      WHERE id = ?
    `).run(chess.fen(), next.ply, sessionId);

    return getSessionState(db, sessionId);
  });
}

export function gotoSessionPly(db, sessionId, ply) {
  return withTransaction(db, () => {
    const session = getSessionRow(db, sessionId);
    if (session.status !== 'active') {
      throw new HttpError(400, 'Session is not active');
    }

    const target = Number(ply);
    const max = db.prepare(
      'SELECT COALESCE(MAX(ply), 0) AS max_ply FROM session_moves WHERE session_id = ?',
    ).get(sessionId);
    const maxPly = Number(max.max_ply);
    if (!Number.isInteger(target) || target < 0 || target > maxPly) {
      throw new HttpError(400, 'Invalid ply');
    }

    const chess = replayToPly(db, sessionId, target);
    db.prepare(`
      UPDATE sessions
      SET current_fen = ?, ply = ?, last_activity_at = datetime('now')
      WHERE id = ?
    `).run(chess.fen(), target, sessionId);

    return getSessionState(db, sessionId);
  });
}

export function restartBoard(db, sessionId, { force } = {}) {
  getSessionRow(db, sessionId);
  return createSession(db, { force: force !== false, reuseActive: false });
}

export function applyLineToNewSession(db, { name, lessonName, moveUcis, observe }) {
  return withTransaction(db, () => {
    const active = db.prepare(`
      SELECT * FROM sessions WHERE status = 'active' LIMIT 1
    `).get();
    if (active) {
      const nextStatus = Number(active.ply) > 0 ? 'completed' : 'abandoned';
      closeActiveSessions(db, nextStatus);
    }

    const created = db.prepare(`
      INSERT INTO sessions (name, lesson_name, current_fen, ply, status)
      VALUES (?, ?, ?, 0, 'active')
    `).run(name ?? null, lessonName ?? null, START_FEN);

    const sessionId = created.lastInsertRowid;
    const chess = createGame(START_FEN);

    moveUcis.forEach((uci, index) => {
      const fromFen = chess.fen();
      const move = applyMoveInput(chess, uci);
      const toFen = chess.fen();
      const moveRow = getOrCreateMove(db, fromFen, toFen, moveToUci(move), move.san);
      const ply = index + 1;
      let observationId = null;
      if (observe) {
        const info = db.prepare(`
          INSERT INTO observations (session_id, move_id, ply, source)
          VALUES (?, ?, ?, 'replay')
        `).run(sessionId, moveRow.id, ply);
        observationId = info.lastInsertRowid;
      }
      db.prepare(`
        INSERT INTO session_moves (session_id, ply, move_id, observation_id)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, ply, moveRow.id, observationId);
    });

    db.prepare(`
      UPDATE sessions
      SET current_fen = ?, ply = ?, last_activity_at = datetime('now')
      WHERE id = ?
    `).run(chess.fen(), moveUcis.length, sessionId);

    return getSessionState(db, sessionId);
  });
}
