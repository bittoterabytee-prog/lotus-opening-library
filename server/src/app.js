import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import cors from 'cors';
import { HttpError } from './lib/httpError.js';
import { openDatabase, PROJECT_ROOT, resolveDbPath } from './db/database.js';
import { mountRoutes } from './routes.js';
import { scheduleLibraryBackup } from './services/backup.js';

export function createApp(options = {}) {
  const dbPath = resolveDbPath(options.dbPath);
  const db = openDatabase(dbPath);
  const app = express();

  app.disable('x-powered-by');
  app.locals.dbPath = dbPath;
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '12mb' }));
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });

  app.use((req, res, next) => {
    res.on('finish', () => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
      if (!req.originalUrl.startsWith('/api')) return;
      if (res.statusCode >= 400) return;
      scheduleLibraryBackup(db, dbPath);
    });
    next();
  });

  mountRoutes(app);

  const serveClient = options.serveClient !== false;
  const clientDist = options.clientDist || join(PROJECT_ROOT, 'client', 'dist');
  if (serveClient && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: err.message,
        details: err.details ?? undefined,
      });
      return;
    }

    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }

    console.error('[lotus] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return {
    app,
    db,
    dbPath,
    close() {
      db.close();
    },
  };
}
