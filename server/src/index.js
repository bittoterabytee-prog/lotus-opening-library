import { createApp } from './app.js';
import { DEFAULT_DB_PATH } from './db/database.js';

const PORT = Number(process.env.PORT || 3001);
const { app, dbPath } = createApp();

app.listen(PORT, () => {
  console.log(`Lotus Opening Library API on http://127.0.0.1:${PORT}`);
  console.log(`SQLite database: ${dbPath || DEFAULT_DB_PATH}`);
});
