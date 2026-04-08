/**
 * Test Helper
 *
 * Creates an isolated Express app + database for each test suite.
 * Supports both SQLite and PostgreSQL (via DATABASE_URL).
 * No Socket.IO, no background services — pure HTTP testing.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const isPg = !!process.env.DATABASE_URL;

// ─── SQLite setup (only when not using PostgreSQL) ───────────────
let testDbPath;
if (!isPg) {
  testDbPath = path.join(os.tmpdir(), `company-os-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  process.env.DB_PATH = testDbPath;
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.NODE_ENV = 'test';
process.env.LLM_API_KEY = '';
// Suppress pino-pretty in tests
process.env.LOG_LEVEL = 'silent';

// Run migrations on the test DB
const { execSync } = require('child_process');
const serverRoot = path.join(__dirname, '..', '..');
execSync(`node ${path.join(serverRoot, 'src/config/migrate.js')}`, {
  env: { ...process.env },
  cwd: serverRoot,
});

// Now require the app modules
const express = require('express');
const db = require('../../src/config/db');

// ─── Helpers ─────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.use('/api/auth', require('../../src/routes/auth'));
  app.use('/api/departments', require('../../src/routes/departments'));
  app.use('/api/tasks', require('../../src/routes/tasks'));
  app.use('/api/agents', require('../../src/routes/agents'));
  app.use('/api/ai', require('../../src/routes/ai'));
  app.use('/api/knowledge', require('../../src/routes/knowledge'));
  app.use('/api/email', require('../../src/routes/email'));
  app.use('/api/workflows', require('../../src/routes/workflows'));
  app.use('/api/notifications', require('../../src/routes/notifications'));
  app.use('/api/system', require('../../src/routes/system'));

  app.use((err, req, res, next) => {
    // Suppress expected test errors (e.g., ambiguous column)
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function createTestUser(overrides = {}) {
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const password_hash = bcrypt.hashSync(overrides.password || 'TestPass123!', 10);
  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  const result = await db.prepare('INSERT INTO users (email, password_hash, name, role, department_id) VALUES (?, ?, ?, ?, ?)').run(email, password_hash, overrides.name || 'Test User', overrides.role || 'member', overrides.department_id || null);

  const user = { id: result.lastInsertRowid, email, name: overrides.name || 'Test User', role: overrides.role || 'member' };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { ...user, token };
}

async function createAdminUser() {
  return createTestUser({ email: `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, name: 'Admin User', role: 'admin' });
}

async function seedDefaults() {
  const deptRow = await db.prepare('SELECT COUNT(*) as count FROM departments').get();
  const deptCount = deptRow ? (deptRow.count || deptRow.c || 0) : 0;
  if (Number(deptCount) === 0) {
    const defaults = [
      { name: 'Operations', description: 'Day-to-day business operations', icon: '⚙️', color: '#6366f1' },
      { name: 'Marketing', description: 'Marketing, branding, and growth', icon: '📈', color: '#ec4899' },
      { name: 'Engineering', description: 'Technical development and infrastructure', icon: '🛠️', color: '#10b981' },
      { name: 'Sales', description: 'Revenue generation and client management', icon: '💰', color: '#f59e0b' },
      { name: 'HR & Admin', description: 'People operations and administration', icon: '👥', color: '#8b5cf6' },
      { name: 'Design', description: 'Creative and visual design', icon: '🎨', color: '#ef4444' },
    ];
    const insert = db.prepare('INSERT INTO departments (name, description, icon, color) VALUES (?, ?, ?, ?)');
    for (const d of defaults) await insert.run(d.name, d.description, d.icon, d.color);
  }
}

async function cleanup() {
  if (isPg) {
    // PostgreSQL: truncate all tables to isolate test suites
    const tables = [
      'notifications', 'workflow_logs', 'task_comments', 'uploads',
      'emails', 'messages', 'knowledge_base', 'scheduled_tasks',
      'tasks', 'workflows', 'agents', 'users', 'departments',
    ];
    try {
      for (const table of tables) {
        await db.prepare(`TRUNCATE TABLE ${table} CASCADE`).run();
      }
    } catch (err) {
      console.error('PG cleanup error:', err.message);
    }
    try { await db.close(); } catch {}
  } else {
    // SQLite: close and delete temp file
    try { db.close(); } catch {}
    try {
      fs.unlinkSync(testDbPath);
      fs.unlinkSync(testDbPath + '-wal');
      fs.unlinkSync(testDbPath + '-shm');
    } catch {}
  }
}

module.exports = { createTestApp, createTestUser, createAdminUser, cleanup, db, seedDefaults };
