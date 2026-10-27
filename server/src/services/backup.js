import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PROJECT_ROOT } from '../db/database.js';
import { exportLibrary } from './importExport.js';

const execFileAsync = promisify(execFile);
export const BACKUP_JSON_PATH = join(PROJECT_ROOT, 'data', 'library-backup.json');

const GIT_PUSH_DELAY_MS = 8000;
let pushTimer = null;
let lastBackupAt = null;
let lastGitError = null;

function looksLikeTestDatabase(dbPath) {
  if (!dbPath || dbPath === ':memory:') return true;
  const resolved = resolve(dbPath);
  const rel = relative(resolve(tmpdir()), resolved);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function backupsEnabled(dbPath) {
  if (process.env.LOTUS_DISABLE_BACKUP === '1') return false;
  return !looksLikeTestDatabase(dbPath);
}

export function getBackupStatus() {
  let fileUpdatedAt = null;
  if (existsSync(BACKUP_JSON_PATH)) {
    fileUpdatedAt = statSync(BACKUP_JSON_PATH).mtime.toISOString();
  }
  return {
    file: BACKUP_JSON_PATH,
    lastBackupAt,
    fileUpdatedAt,
    gitPushEnabled: process.env.LOTUS_DISABLE_GIT_BACKUP !== '1',
    lastGitError,
  };
}

export function writeLibraryBackup(db) {
  mkdirSync(dirname(BACKUP_JSON_PATH), { recursive: true });
  const payload = exportLibrary(db);
  writeFileSync(BACKUP_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  lastBackupAt = new Date().toISOString();
  return BACKUP_JSON_PATH;
}

async function gitCommitAndPush() {
  if (process.env.LOTUS_DISABLE_GIT_BACKUP === '1') return;
  if (!existsSync(join(PROJECT_ROOT, '.git'))) return;

  const opts = { cwd: PROJECT_ROOT, windowsHide: true };
  await execFileAsync('git', ['add', 'data/library-backup.json'], opts);
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain', '--', 'data/library-backup.json'],
    opts,
  );
  if (!stdout.trim()) return;

  await execFileAsync(
    'git',
    ['commit', '-m', 'Save opening library backup'],
    opts,
  );
  await execFileAsync('git', ['push'], opts);
  lastGitError = null;
  console.log('[lotus] Pushed opening library backup to GitHub');
}

export function scheduleLibraryBackup(db, dbPath) {
  if (!backupsEnabled(dbPath)) return;

  try {
    writeLibraryBackup(db);
    console.log(`[lotus] Saved local backup ${BACKUP_JSON_PATH}`);
  } catch (err) {
    console.error('[lotus] Local backup failed:', err);
    return;
  }

  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    gitCommitAndPush().catch((err) => {
      lastGitError = err?.message || String(err);
      console.error('[lotus] Git backup push failed:', lastGitError);
    });
  }, GIT_PUSH_DELAY_MS);
}
