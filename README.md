# Lotus Opening Library

A personal, local chess opening-learning app. Watch a lesson on Lotus Chess on your phone, enter the same moves on this laptop app, and the program remembers every observed continuation for the next time you reach that position.

No accounts, no cloud, no AI APIs, and no connection to the Lotus Chess app. Everything stays in a SQLite file on this machine.

## Requirements

- Node.js 18.18 or newer (Node 22+ recommended; this project uses the built-in `node:sqlite` driver)
- npm 9+

## Install

```bash
npm install
```

Initialize the database (also happens automatically on first server start):

```bash
npm run db:init
```

## Run

Development (API on port 3001, Vite on port 5173):

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The Vite dev server proxies `/api` to the local backend.

Production-style run (serves the built UI from Express):

```bash
npm run build
npm start
```

Then open [http://127.0.0.1:3001](http://127.0.0.1:3001).

## Tests, types, and build

```bash
npm test
npm run lint
npm run build
```

`npm test` runs the server integration and unit tests, including the V1 acceptance scenario.

## Where data is stored

Default SQLite file:

```
<data directory>/lotus-openings.sqlite
```

That path is `<project-root>/data/lotus-openings.sqlite`. Override it with:

```bash
set LOTUS_DB_PATH=C:\path\to\lotus-openings.sqlite
```

On macOS/Linux:

```bash
export LOTUS_DB_PATH=/path/to/lotus-openings.sqlite
```

Startup never deletes or recreates an existing database. Schema changes go through `schema_migrations`.

Every accepted move, named opening, and import is written to SQLite immediately. The same snapshot is also written to:

```
<data directory>/library-backup.json
```

If this folder is a git repository with a remote (for example the GitHub copy), that JSON file is committed and pushed a few seconds later. Your learned lines stay on disk even if GitHub is unreachable. Set `LOTUS_DISABLE_GIT_BACKUP=1` to keep the local JSON backup without pushing. Set `LOTUS_DISABLE_BACKUP=1` to skip the JSON file as well.

## How encounters are counted

An **observed encounter** is one accepted move event that the server persisted.

- Playing the same move in a later session increments the count.
- Undo does not erase historical observations.
- Undo, then playing the **same** move at the same ply in the same session, is treated as a retry and does not increment.
- Duplicate submits with the same `clientEventId` are ignored.
- Counts belong to the exact starting position and move. The same SAN from a different position is stored separately.
- Percentages are “share of observations from this position”, not engine evaluations.

## Backup and restore

On **Opening Library**, use **Export backup** and **Import backup**. The JSON file includes named openings, the move tree, sessions, and encounter history. It does not include passwords or unrelated system files.

Imports are validated before anything is written. Malformed JSON, the wrong format name, a different version, illegal moves, or invalid FENs are rejected and the existing database is left unchanged.

You can also copy `data/lotus-openings.sqlite` (and any `-wal` / `-shm` files) while the server is stopped.

## Typical workflow

1. Open **Learn**. A session starts from the standard chess position.
2. Play the moves you see on Lotus Chess (click-to-move, or type SAN/UCI such as `e4` or `e2e4`).
3. Every legal accepted move is saved immediately.
4. Known continuations appear with encounter counts. Click one to play it, or enter a new legal move.
5. Use **Name this line** to store the current sequence as a named opening/lesson.
6. **Restart board** / **New session** starts a fresh board without deleting the library.
7. After an app restart, an unfinished session is resumed.

## Project structure

```
client/                 React + Vite UI
server/src/             Express API and SQLite services
server/src/db/          Schema, migrations, database helpers
server/tests/           Unit and integration tests
data/                   SQLite file plus GitHub JSON backup
```

## Troubleshooting

**The UI says it cannot reach the server.** Start `npm run dev` and confirm the API log shows port 3001. If only Vite is running, `/api` calls will fail.

**Port 3001 or 5173 is already in use.** Stop the other process, or set `PORT` for the API.

**Pieces look odd.** The board uses system Unicode chess glyphs. On Windows, Segoe UI Symbol is used.

**I entered a move that Lotus Chess showed, but this app rejected it.** The move is illegal in the current position. Check that the laptop board matches the phone, including whose turn it is and whether a piece was captured.

**I undid a move and the count did not drop.** That is intentional. Undo changes the session path; it does not rewrite history. Retrying the same move will not increment again.

## Limitations

- There is no engine, cloud sync, or automatic import from Lotus Chess.
- V1 is single-user and local-only.
- Importing a backup merges into the current database; it does not replace it.
- Promotion requires choosing Q, R, B, or N on the board.
