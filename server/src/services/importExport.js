import { Chess } from 'chess.js';
import { HttpError } from '../lib/httpError.js';
import { START_FEN, positionKeyFromFen } from '../lib/positionKey.js';
import { applyMoveInput, createGame, moveToUci, safePositionKey } from '../lib/chessEngine.js';
import { withTransaction } from '../db/database.js';
import { getOrCreateMove } from './positions.js';

export const EXPORT_FORMAT = 'lotus-opening-library';
export const EXPORT_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value, label, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  return value;
}

function asString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function exportLibrary(db) {
  const positions = db.prepare('SELECT position_key AS key, fen FROM positions ORDER BY id').all();
  const moves = db.prepare(`
    SELECT pf.position_key AS fromKey, pt.position_key AS toKey, m.uci, m.san
    FROM moves m
    JOIN positions pf ON pf.id = m.from_position_id
    JOIN positions pt ON pt.id = m.to_position_id
    ORDER BY m.id
  `).all();

  const sessions = db.prepare('SELECT * FROM sessions ORDER BY id').all().map((session) => {
    const line = db.prepare(`
      SELECT sm.ply, m.uci, m.san, pf.position_key AS fromKey
      FROM session_moves sm
      JOIN moves m ON m.id = sm.move_id
      JOIN positions pf ON pf.id = m.from_position_id
      WHERE sm.session_id = ?
      ORDER BY sm.ply
    `).all(session.id);
    return {
      exportId: `s${session.id}`,
      name: session.name,
      lessonName: session.lesson_name,
      status: session.status,
      startedAt: session.started_at,
      lastActivityAt: session.last_activity_at,
      ply: Number(session.ply),
      currentFen: session.current_fen,
      line,
    };
  });

  const observations = db.prepare(`
    SELECT
      o.session_id,
      o.ply,
      o.observed_at AS observedAt,
      o.source,
      pf.position_key AS fromKey,
      m.uci,
      m.san
    FROM observations o
    JOIN moves m ON m.id = o.move_id
    JOIN positions pf ON pf.id = m.from_position_id
    ORDER BY o.id
  `).all().map((row) => ({
    sessionExportId: `s${row.session_id}`,
    ply: Number(row.ply),
    observedAt: row.observedAt,
    source: row.source,
    fromKey: row.fromKey,
    uci: row.uci,
    san: row.san,
  }));

  const openings = db.prepare('SELECT * FROM openings ORDER BY id').all().map((opening) => ({
    name: opening.name,
    source: opening.source,
    notes: opening.notes,
    createdAt: opening.created_at,
    updatedAt: opening.updated_at,
    line: db.prepare(`
      SELECT om.ply, m.uci, m.san, pf.position_key AS fromKey
      FROM opening_moves om
      JOIN moves m ON m.id = om.move_id
      JOIN positions pf ON pf.id = m.from_position_id
      WHERE om.opening_id = ?
      ORDER BY om.ply
    `).all(opening.id),
  }));

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    encounterPolicy:
      'Each accepted observation event counts once. Undo then repeating the same move at the same ply in the same session does not add another observation.',
    positions,
    moves,
    sessions,
    observations,
    openings,
  };
}

function validatePositionEntry(entry, index, errors) {
  if (!isPlainObject(entry)) {
    errors.push(`positions[${index}] must be an object`);
    return;
  }
  try {
    const key = asString(entry.key || entry.positionKey);
    const fen = asString(entry.fen);
    if (!key || !fen) {
      errors.push(`positions[${index}] needs key and fen`);
      return;
    }
    createGame(fen);
    const derived = positionKeyFromFen(fen);
    if (derived !== key) {
      errors.push(`positions[${index}] key does not match fen`);
    }
  } catch (err) {
    errors.push(`positions[${index}] is not a legal chess position`);
    void err;
  }
}

function validateMoveGraph(payload, errors) {
  const positions = asArray(payload.positions, 'positions', errors);
  const moves = asArray(payload.moves, 'moves', errors);
  const fenByKey = new Map();

  positions.forEach((entry, index) => {
    if (!isPlainObject(entry)) return;
    const key = asString(entry.key || entry.positionKey);
    const fen = asString(entry.fen);
    if (key && fen) fenByKey.set(key, fen);
    validatePositionEntry(entry, index, errors);
  });

  moves.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`moves[${index}] must be an object`);
      return;
    }
    const fromKey = asString(entry.fromKey);
    const toKey = asString(entry.toKey);
    const uci = asString(entry.uci);
    if (!fromKey || !uci) {
      errors.push(`moves[${index}] needs fromKey and uci`);
      return;
    }
    const fen = fenByKey.get(fromKey);
    if (!fen) {
      errors.push(`moves[${index}] references unknown fromKey`);
      return;
    }
    try {
      const chess = createGame(fen);
      const move = applyMoveInput(chess, uci);
      const actualTo = safePositionKey(chess.fen());
      if (toKey && toKey !== actualTo) {
        errors.push(`moves[${index}] toKey does not match the legal result of ${uci}`);
      }
      void move;
    } catch (err) {
      errors.push(`moves[${index}] is not a legal move from its position`);
      void err;
    }
  });
}

function validateLinesFromStart(lines, label, errors) {
  lines.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`${label}[${index}] must be an object`);
      return;
    }
    const line = asArray(entry.line, `${label}[${index}].line`, errors);
    const chess = new Chess();
    line.forEach((move, moveIndex) => {
      if (!isPlainObject(move)) {
        errors.push(`${label}[${index}].line[${moveIndex}] must be an object`);
        return;
      }
      const token = asString(move.uci || move.san);
      if (!token) {
        errors.push(`${label}[${index}].line[${moveIndex}] needs uci or san`);
        return;
      }
      try {
        applyMoveInput(chess, token);
      } catch {
        errors.push(`${label}[${index}].line[${moveIndex}] (${token}) is illegal in this sequence`);
      }
    });
  });
}

export function validateImportPayload(payload) {
  const errors = [];
  if (!isPlainObject(payload)) {
    return ['Import file must be a JSON object'];
  }
  if (payload.format !== EXPORT_FORMAT) {
    errors.push(`Unsupported format. Expected "${EXPORT_FORMAT}"`);
  }
  if (payload.version !== EXPORT_VERSION) {
    errors.push(`Unsupported version ${payload.version}. This app reads version ${EXPORT_VERSION}`);
  }

  validateMoveGraph(payload, errors);
  validateLinesFromStart(asArray(payload.openings, 'openings', errors), 'openings', errors);
  validateLinesFromStart(asArray(payload.sessions, 'sessions', errors), 'sessions', errors);

  asArray(payload.observations, 'observations', errors).forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`observations[${index}] must be an object`);
      return;
    }
    if (!asString(entry.uci) && !asString(entry.san)) {
      errors.push(`observations[${index}] needs uci or san`);
    }
  });

  return errors;
}

function playTokens(tokens) {
  const chess = createGame(START_FEN);
  const applied = [];
  for (const token of tokens) {
    const fromFen = chess.fen();
    const move = applyMoveInput(chess, token);
    applied.push({
      fromFen,
      toFen: chess.fen(),
      uci: moveToUci(move),
      san: move.san,
    });
  }
  return { chess, applied };
}

export function importLibrary(db, payload) {
  let parsed = payload;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new HttpError(400, 'Import file is not valid JSON');
    }
  }

  const errors = validateImportPayload(parsed);
  if (errors.length) {
    throw new HttpError(400, 'Import validation failed', errors);
  }

  return withTransaction(db, () => {
    const summary = {
      positions: 0,
      moves: 0,
      sessions: 0,
      observations: 0,
      openings: 0,
    };

    const sessionIdByExportId = new Map();

    for (const session of parsed.sessions || []) {
      const tokens = (session.line || []).map((move) => move.uci || move.san);
      const { chess, applied } = playTokens(tokens);
      const info = db.prepare(`
        INSERT INTO sessions (name, lesson_name, status, current_fen, ply, started_at, last_activity_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
      `).run(
        session.name ?? null,
        session.lessonName ?? session.lesson_name ?? null,
        session.status === 'active' ? 'completed' : (
          ['completed', 'abandoned'].includes(session.status) ? session.status : 'completed'
        ),
        session.currentFen && Number(session.ply) === applied.length ? session.currentFen : chess.fen(),
        applied.length,
        session.startedAt ?? null,
        session.lastActivityAt ?? null,
      );
      const sessionId = info.lastInsertRowid;
      if (session.exportId) sessionIdByExportId.set(session.exportId, sessionId);

      applied.forEach((item, index) => {
        const moveRow = getOrCreateMove(db, item.fromFen, item.toFen, item.uci, item.san);
        summary.moves += 1;
        db.prepare(`
          INSERT INTO session_moves (session_id, ply, move_id)
          VALUES (?, ?, ?)
        `).run(sessionId, index + 1, moveRow.id);
      });
      summary.sessions += 1;
    }

    for (const observation of parsed.observations || []) {
      const token = observation.uci || observation.san;
      let fromFen = observation.fromFen;
      if (!fromFen && observation.fromKey) {
        const pos = db.prepare('SELECT fen FROM positions WHERE position_key = ?').get(observation.fromKey);
        fromFen = pos?.fen;
        if (!fromFen) {
          try {
            fromFen = `${observation.fromKey} 0 1`;
            createGame(fromFen);
          } catch {
            fromFen = null;
          }
        }
      }
      if (!fromFen) continue;
      const chess = createGame(fromFen);
      const move = applyMoveInput(chess, token);
      const moveRow = getOrCreateMove(db, fromFen, chess.fen(), moveToUci(move), move.san);
      summary.moves += 1;

      let sessionId = sessionIdByExportId.get(observation.sessionExportId);
      if (!sessionId) {
        const created = db.prepare(`
          INSERT INTO sessions (name, status, current_fen, ply)
          VALUES ('Imported observations', 'completed', ?, 0)
        `).run(START_FEN);
        sessionId = created.lastInsertRowid;
        if (observation.sessionExportId) {
          sessionIdByExportId.set(observation.sessionExportId, sessionId);
        }
        summary.sessions += 1;
      }

      db.prepare(`
        INSERT INTO observations (session_id, move_id, ply, observed_at, source)
        VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?)
      `).run(
        sessionId,
        moveRow.id,
        Number(observation.ply) || 1,
        observation.observedAt ?? null,
        observation.source || 'import',
      );
      summary.observations += 1;
    }

    for (const opening of parsed.openings || []) {
      const tokens = (opening.line || []).map((move) => move.uci || move.san);
      const { applied } = playTokens(tokens);
      const info = db.prepare(`
        INSERT INTO openings (name, source, notes, created_at, updated_at)
        VALUES (?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
      `).run(
        asString(opening.name).trim() || 'Imported opening',
        opening.source ?? null,
        opening.notes ?? null,
        opening.createdAt ?? null,
        opening.updatedAt ?? null,
      );
      applied.forEach((item, index) => {
        const moveRow = getOrCreateMove(db, item.fromFen, item.toFen, item.uci, item.san);
        db.prepare(`
          INSERT INTO opening_moves (opening_id, ply, move_id)
          VALUES (?, ?, ?)
        `).run(info.lastInsertRowid, index + 1, moveRow.id);
      });
      summary.openings += 1;
    }

    summary.positions = Number(db.prepare('SELECT COUNT(*) AS n FROM positions').get().n);
    return { imported: true, summary };
  });
}

export function restoreBackup(db, payload) {
  return importLibrary(db, payload);
}
