import { DEFAULT_DB_PATH, openDatabase } from './database.js';

const db = openDatabase();
db.close();
console.log(`Database ready at ${process.env.LOTUS_DB_PATH || DEFAULT_DB_PATH}`);
