import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '../../..');
export const DEFAULT_DB_PATH = join(PROJECT_ROOT, 'data', 'lotus-openings.sqlite');

const SCHEMA_SQL = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

export function resolveDbPath(dbPath) {
  if (dbPath) return dbPath;
  if (process.env.LOTUS_DB_PATH) return process.env.LOTUS_DB_PATH;
  return DEFAULT_DB_PATH;
}

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Connection may already be aborted.
    }
    throw err;
  }
}

export function isUniqueConstraintError(err) {
  const message = String(err?.message ?? err ?? '');
  return /UNIQUE constraint failed/i.test(message);
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get();
  const current = Number(row?.v ?? 0);

  if (current < 1) {
    withTransaction(db, () => {
      db.exec(SCHEMA_SQL);
      const already = db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
      if (!already) {
        db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
      }
    });
  }
}

export function openDatabase(dbPath = resolveDbPath()) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
  }
  migrate(db);
  return db;
}
