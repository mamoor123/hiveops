/**
 * Test Helper
 *
 * Creates an isolated Express app + SQLite DB for each test suite.
 * No Socket.IO, no background services — pure HTTP testing.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Set up test env BEFORE requiring any modules
const testDbPath = path.join(os.tmpdir(), `company-os-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.NODE_ENV = 'test';
process.env.LLM_API_KEY = ''; // No real LLM calls in tests

// Run migrations on the test DB
const { execSync } = require('child_process');
const serverRoot = path.join(__dirname, '..', '..');
execSync(`node ${path.join(serverRoot, 'src/config/migrate.js')}`, {
  env: { ...process.env },
  cwd: serverRoot,
});

// Now require the app modules (they'll use the test DB)
const express = require('express');
const db = require('../../src/config/db');

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mount routes
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

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Test error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Create a test user and return their auth token
 */
function createTestUser(overrides = {}) {
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const password_hash = bcrypt.hashSync(overrides.password || 'TestPass123!', 10);

  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, department_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    email,
    password_hash,
    overrides.name || 'Test User',
    overrides.role || 'member',
    overrides.department_id || null,
  );

  const user = {
    id: result.lastInsertRowid,
    email,
    name: overrides.name || 'Test User',
    role: overrides.role || 'member',
  };

  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { ...user, token };
}

/**
 * Create an admin user
 */
function createAdminUser() {
  return createTestUser({
    email: `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Admin User',
    role: 'admin',
  });
}

/**
 * Clean up the test DB
 */
function cleanup() {
  try { db.close(); } catch {}
  try {
    fs.unlinkSync(testDbPath);
    fs.unlinkSync(testDbPath + '-wal');
    fs.unlinkSync(testDbPath + '-shm');
  } catch {}
}

/**
 * Seed default departments (mimics what index.js does)
 */
function seedDefaults() {
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;
  if (deptCount === 0) {
    const defaults = [
      { name: 'Operations', description: 'Day-to-day business operations', icon: '⚙️', color: '#6366f1' },
      { name: 'Marketing', description: 'Marketing, branding, and growth', icon: '📈', color: '#ec4899' },
      { name: 'Engineering', description: 'Technical development and infrastructure', icon: '🛠️', color: '#10b981' },
      { name: 'Sales', description: 'Revenue generation and client management', icon: '💰', color: '#f59e0b' },
      { name: 'HR & Admin', description: 'People operations and administration', icon: '👥', color: '#8b5cf6' },
      { name: 'Design', description: 'Creative and visual design', icon: '🎨', color: '#ef4444' },
    ];
    const insert = db.prepare('INSERT INTO departments (name, description, icon, color) VALUES (?, ?, ?, ?)');
    for (const d of defaults) insert.run(d.name, d.description, d.icon, d.color);
  }
}

module.exports = { createTestApp, createTestUser, createAdminUser, cleanup, db, seedDefaults };
