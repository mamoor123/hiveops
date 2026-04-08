/**
 * Database Connection Module
 *
 * Schema is managed via migrations (npm run migrate).
 * This module just opens the connection with best-practice pragmas.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/company-os.db');

// Allow test override
const actualPath = process.env.NODE_ENV === 'test' && process.env.TEST_DB_PATH
  ? process.env.TEST_DB_PATH
  : DB_PATH;

const dbDir = path.dirname(actualPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(actualPath);

// Performance & safety pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');  // Wait up to 5s on lock contention instead of failing
db.pragma('synchronous = NORMAL'); // Good balance for WAL mode
db.pragma('cache_size = -64000');  // 64MB cache
db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

module.exports = db;
