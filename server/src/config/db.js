/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

/**
 * Database Connection Module
 *
 * Dual-mode: SQLite (default) or PostgreSQL (when DATABASE_URL is set).
 *
 * API:
 *   db.prepare(sql).run(...params)   → { changes, lastInsertRowid }
 *   db.prepare(sql).get(...params)   → row | undefined
 *   db.prepare(sql).all(...params)   → [rows]
 *   db.exec(sql)                     → void
 *   db.healthCheck()                 → boolean
 *   db.close()                       → void
 *   db._type                         → 'sqlite' | 'pg'
 *
 * For SQLite: methods return synchronously (plain values).
 * For PostgreSQL: methods return Promises (async).
 * Use `await` in handlers — it works on both sync values and Promises.
 *
 * Auto-converts ? → $1,$2 for PG.
 * Auto-converts @param → $1,$2 for PG (better-sqlite3 named params).
 * Auto-converts boolean comparisons (read = 0 → read = false) for PG.
 * Auto-converts boolean param values (0/1 → true/false) for PG.
 * Auto-appends RETURNING id to INSERT queries for lastInsertRowid.
 *
 * NOTE: For PG compatibility, always quote "trigger" in SQL strings
 * (the reserved word). The transformer no longer auto-quotes it.
 */

const path = require('path');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL;

// ─── PostgreSQL Mode ─────────────────────────────────────────────

function createPgAdapter() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: parseInt(process.env.PG_POOL_MAX || '20'),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => console.error('PG pool error:', err.message));
  console.log('🐘 PostgreSQL adapter initialized');

  /**
   * Transform SQL for PostgreSQL compatibility:
   * 1. Convert @named params to $1, $2 (better-sqlite3 → pg)
   * 2. Convert ? positional params to $1, $2
   * 3. Convert integer boolean comparisons (= 0 / = 1) to (= false / = true)
   */
  function transformForPg(sql) {
    let result = sql;

    // 1. Convert @named parameters to $1, $2
    //    Must handle @trigger before any other processing
    const namedParams = [];
    result = result.replace(/@(\w+)/g, (match, name) => {
      const idx = namedParams.indexOf(name);
      if (idx === -1) {
        namedParams.push(name);
        return `$${namedParams.length}`;
      }
      return `$${idx + 1}`;
    });

    // 2. Convert ? to $1, $2 (only if no $ params exist yet)
    if (!result.includes('$1')) {
      let i = 0;
      result = result.replace(/\?/g, () => `$${++i}`);
    }

    // 3. Convert integer boolean comparisons for known boolean columns
    //    Handles: column = 0, column = 1 patterns
    const booleanCols = ['read', 'starred', 'enabled'];
    for (const col of booleanCols) {
      result = result.replace(
        new RegExp(`\\b${col}\\s*=\\s*0\\b`, 'gi'),
        `${col} = false`
      );
      result = result.replace(
        new RegExp(`\\b${col}\\s*=\\s*1\\b`, 'gi'),
        `${col} = true`
      );
    }

    return { sql: result, namedParams };
  }

  /**
   * Convert positional or named params to plain array.
   * Also converts integer 0/1 to boolean true/false for known boolean columns.
   */
  function convertParams(params, namedParams, sql) {
    // Named params: { name: 'foo', enabled: 1 } → ['foo', true]
    if (namedParams.length > 0 && params.length === 1 && typeof params[0] === 'object' && params[0] !== null) {
      const booleanCols = ['read', 'starred', 'enabled'];
      return namedParams.map(name => {
        const val = params[0][name];
        if (booleanCols.includes(name) && (val === 0 || val === 1)) {
          return val === 1;
        }
        return val;
      });
    }

    // Positional params — detect boolean column assignments
    const booleanCols = ['read', 'starred', 'enabled'];

    // For INSERT, detect which params map to boolean columns
    if (/^\s*INSERT/i.test(sql)) {
      const colMatch = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
      if (colMatch) {
        const cols = colMatch[1].split(',').map(c => c.trim().replace(/"/g, ''));
        return params.map((val, i) => {
          const col = cols[i];
          if (col && booleanCols.includes(col) && (val === 0 || val === 1)) {
            return val === 1;
          }
          return val;
        });
      }
    }

    // For UPDATE SET, detect boolean column assignments
    if (/^\s*UPDATE/i.test(sql)) {
      const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/is);
      if (setMatch) {
        const assignments = setMatch[1].split(',').map(a => a.trim());
        let paramIdx = 0;
        const converted = [];
        for (const assignment of assignments) {
          const colName = assignment.split('=')[0]?.trim().replace(/"/g, '');
          const hasPlaceholder = /\$\d+/.test(assignment);
          if (hasPlaceholder && paramIdx < params.length) {
            const val = params[paramIdx];
            if (colName && booleanCols.includes(colName) && (val === 0 || val === 1)) {
              converted.push(val === 1);
            } else {
              converted.push(val);
            }
            paramIdx++;
          }
        }
        // Add remaining params (WHERE clause, etc.)
        while (paramIdx < params.length) {
          converted.push(params[paramIdx]);
          paramIdx++;
        }
        return converted;
      }
    }

    return params;
  }

  /**
   * Coerce bigint-as-string values to JS numbers so callers
   * never need to worry about PG returning COUNT(*) as "42".
   */
  function coerceRow(row) {
    if (!row) return row;
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (typeof val === 'string' && /^\d+$/.test(val)) {
        const n = Number(val);
        if (n <= Number.MAX_SAFE_INTEGER) row[key] = n;
      }
    }
    return row;
  }

  function coerceRows(rows) {
    for (const row of rows) coerceRow(row);
    return rows;
  }

  function maybeAddReturning(sql) {
    const trimmed = sql.trim();
    if (/^\s*INSERT\s/i.test(trimmed) && !/\bRETURNING\b/i.test(trimmed)) {
      return trimmed + ' RETURNING id';
    }
    return trimmed;
  }

  function prepare(sql) {
    // Transform once at prepare time for get/all (no RETURNING needed)
    const { sql: transformedSql, namedParams } = transformForPg(sql);

    return {
      run(...params) {
        // Re-transform with RETURNING for run
        const { sql: finalSql } = transformForPg(maybeAddReturning(sql));
        const convertedParams = convertParams(params, namedParams, sql);
        return pool.query(finalSql, convertedParams).then(result => ({
          changes: result.rowCount,
          lastInsertRowid: result.rows[0]?.id !== undefined ? Number(result.rows[0].id) : undefined,
        }));
      },
      get(...params) {
        const convertedParams = convertParams(params, namedParams, sql);
        return pool.query(transformedSql, convertedParams).then(r => coerceRow(r.rows[0]) || undefined);
      },
      all(...params) {
        const convertedParams = convertParams(params, namedParams, sql);
        return pool.query(transformedSql, convertedParams).then(r => coerceRows(r.rows));
      },
    };
  }

  function exec(sql) {
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    return (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const stmt of statements) {
          const { sql: transformed } = transformForPg(stmt);
          await client.query(transformed);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally { client.release(); }
    })();
  }

  function pragma() {}
  function close() { return pool.end(); }
  function healthCheck() { return pool.query('SELECT 1').then(() => true).catch(() => false); }

  return { prepare, exec, pragma, close, healthCheck, _type: 'pg' };
}

// ─── SQLite Mode ─────────────────────────────────────────────────

function createSqliteAdapter() {
  const Database = require('better-sqlite3');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/company-os.db');
  const actualPath = process.env.NODE_ENV === 'test' && process.env.TEST_DB_PATH ? process.env.TEST_DB_PATH : DB_PATH;
  const dbDir = path.dirname(actualPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const db = new Database(actualPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('mmap_size = 268435456');
  console.log('📦 SQLite adapter initialized:', actualPath);

  // Convert booleans to integers for SQLite binding
  function mapParam(val) {
    if (val === true) return 1;
    if (val === false) return 0;
    return val;
  }
  function mapParams(params) {
    return params.map(p => {
      if (p !== null && typeof p === 'object' && !Array.isArray(p) && !Buffer.isBuffer(p)) {
        // Named params object — convert booleans in values
        const mapped = {};
        for (const [k, v] of Object.entries(p)) mapped[k] = mapParam(v);
        return mapped;
      }
      return mapParam(p);
    });
  }

  function prepare(sql) {
    const stmt = db.prepare(sql);
    return {
      run(...params) {
        const result = stmt.run(...mapParams(params));
        return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
      },
      get(...params) { return stmt.get(...mapParams(params)); },
      all(...params) { return stmt.all(...mapParams(params)); },
    };
  }

  function exec(sql) { db.exec(sql); }
  function pragma(name) { db.pragma(name); }
  function close() { db.close(); }
  function healthCheck() { try { db.prepare('SELECT 1').get(); return true; } catch { return false; } }

  return { prepare, exec, pragma, close, healthCheck, _type: 'sqlite' };
}

// ─── Export ──────────────────────────────────────────────────────

const db = DATABASE_URL ? createPgAdapter() : createSqliteAdapter();
module.exports = db;
