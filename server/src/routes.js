import { HttpError, wrapAsync } from './lib/httpError.js';
import { safePositionKey } from './lib/chessEngine.js';
import { DEFAULT_DB_PATH, resolveDbPath } from './db/database.js';
import { getSuggestions } from './services/positions.js';
import {
  createSession,
  getActiveSession,
  getSessionState,
  gotoSessionPly,
  listSessions,
  recordSessionMove,
  redoSessionMove,
  restartBoard,
  undoSessionMove,
  updateSession,
} from './services/sessions.js';
import {
  createOpeningFromSession,
  deleteOpening,
  getOpening,
  listOpenings,
  playOpening,
  updateOpening,
} from './services/openings.js';
import { exportLibrary, importLibrary } from './services/importExport.js';
import { getBackupStatus } from './services/backup.js';

export function mountRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      dbPath: req.app.locals.dbPath || resolveDbPath(),
      defaultDbPath: DEFAULT_DB_PATH,
      backup: getBackupStatus(),
    });
  });

  app.get('/api/suggestions', wrapAsync((req, res) => {
    const fen = String(req.query.fen || '');
    const key = safePositionKey(fen);
    res.json({ positionKey: key, suggestions: getSuggestions(req.db, key) });
  }));

  app.get('/api/sessions', wrapAsync((req, res) => {
    res.json({ sessions: listSessions(req.db) });
  }));

  app.get('/api/sessions/active', wrapAsync((req, res) => {
    const session = getActiveSession(req.db);
    if (!session) {
      res.json({ session: null, state: null });
      return;
    }
    res.json({ session, state: getSessionState(req.db, session.id) });
  }));

  app.post('/api/sessions', wrapAsync((req, res) => {
    const state = createSession(req.db, {
      name: req.body?.name,
      lessonName: req.body?.lessonName,
      reuseActive: Boolean(req.body?.reuseActive),
      force: Boolean(req.body?.force),
    });
    res.status(201).json(state);
  }));

  app.get('/api/sessions/:id', wrapAsync((req, res) => {
    res.json(getSessionState(req.db, Number(req.params.id)));
  }));

  app.get('/api/sessions/:id/state', wrapAsync((req, res) => {
    res.json(getSessionState(req.db, Number(req.params.id)));
  }));

  app.patch('/api/sessions/:id', wrapAsync((req, res) => {
    res.json(updateSession(req.db, Number(req.params.id), {
      name: req.body?.name,
      lessonName: req.body?.lessonName,
      status: req.body?.status,
    }));
  }));

  app.post('/api/sessions/:id/moves', wrapAsync((req, res) => {
    const body = req.body || {};
    res.json(recordSessionMove(req.db, Number(req.params.id), {
      uci: body.uci,
      san: body.san,
      clientEventId: body.clientEventId,
      source: body.source,
    }));
  }));

  app.post('/api/sessions/:id/undo', wrapAsync((req, res) => {
    res.json(undoSessionMove(req.db, Number(req.params.id)));
  }));

  app.post('/api/sessions/:id/redo', wrapAsync((req, res) => {
    res.json(redoSessionMove(req.db, Number(req.params.id)));
  }));

  app.post('/api/sessions/:id/goto', wrapAsync((req, res) => {
    res.json(gotoSessionPly(req.db, Number(req.params.id), Number(req.body?.ply)));
  }));

  app.post('/api/sessions/:id/restart', wrapAsync((req, res) => {
    res.json(restartBoard(req.db, Number(req.params.id), { force: true }));
  }));

  app.get('/api/openings', wrapAsync((req, res) => {
    res.json({ openings: listOpenings(req.db, { q: req.query.q }) });
  }));

  app.post('/api/openings', wrapAsync((req, res) => {
    const body = req.body || {};
    if (!body.sessionId) {
      throw new HttpError(400, 'sessionId is required to save the current line');
    }
    const opening = createOpeningFromSession(req.db, Number(body.sessionId), {
      name: body.name,
      source: body.source,
      notes: body.notes,
    });
    res.status(201).json(opening);
  }));

  app.get('/api/openings/:id', wrapAsync((req, res) => {
    res.json(getOpening(req.db, Number(req.params.id)));
  }));

  app.patch('/api/openings/:id', wrapAsync((req, res) => {
    res.json(updateOpening(req.db, Number(req.params.id), {
      name: req.body?.name,
      source: req.body?.source,
      notes: req.body?.notes,
    }));
  }));

  app.delete('/api/openings/:id', wrapAsync((req, res) => {
    res.json(deleteOpening(req.db, Number(req.params.id)));
  }));

  app.post('/api/openings/:id/play', wrapAsync((req, res) => {
    res.json(playOpening(req.db, Number(req.params.id)));
  }));

  app.get('/api/export', wrapAsync((req, res) => {
    const data = exportLibrary(req.db);
    res.json(data);
  }));

  app.post('/api/import', wrapAsync((req, res) => {
    res.json(importLibrary(req.db, req.body));
  }));
}
