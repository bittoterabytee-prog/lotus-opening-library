# Database schema

SQLite file: `data/lotus-openings.sqlite` at the project root (override with `LOTUS_DB_PATH`).

Migrations live in `schema.sql` and are applied once through `schema_migrations`. Startup never drops an existing database.

## Encounter definition

An **observed encounter** is one accepted observation event: a legal move that the user entered and the server persisted.

- The same move played again in a **new session** increments the count.
- Undo does **not** delete historical observations.
- Undo followed by the **same** move at the same ply in the same session is a retry / redo and does **not** increment.
- Duplicate HTTP submits with the same `clientEventId` are idempotent.

Counts are scoped to `(from_position, uci)`. They are not engine evaluations or winning percentages.

## Position identity

`positions.position_key` is FEN fields 1–4 (placement, side to move, castling, en passant). Clocks are omitted.

## Tree vs named openings

- `moves` is the shared repertoire tree.
- `observations` are the event log used for encounter counts.
- `openings` + `opening_moves` are named lines/lessons pointing at shared `moves` rows.
- Deleting a named opening only removes `opening_moves` for that opening.
