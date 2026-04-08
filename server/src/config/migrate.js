/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

/**
 * Database Migration Runner
 *
 * Supports SQLite and PostgreSQL.
 * Run with: npm run migrate
 * Idempotent — safe to run multiple times.
 */

const DATABASE_URL = process.env.DATABASE_URL;

// ─── Migration definitions ───────────────────────────────────────

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    sqlite: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'manager', 'member')),
        department_id INTEGER,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id)
      );
      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        icon TEXT DEFAULT '🏢',
        color TEXT DEFAULT '#6366f1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        department_id INTEGER NOT NULL,
        system_prompt TEXT,
        model TEXT DEFAULT 'gpt-4',
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'offline')),
        capabilities TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id)
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'review', 'completed', 'blocked')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        department_id INTEGER,
        assigned_to INTEGER,
        assigned_agent_id INTEGER,
        created_by INTEGER NOT NULL,
        due_date DATETIME,
        completed_at DATETIME,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_error TEXT,
        execution_timeout_ms INTEGER DEFAULT 120000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id),
        FOREIGN KEY (assigned_to) REFERENCES users(id),
        FOREIGN KEY (assigned_agent_id) REFERENCES agents(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        user_id INTEGER,
        agent_id INTEGER,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL DEFAULT 'general',
        sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'agent')),
        sender_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        trigger TEXT NOT NULL,
        conditions TEXT DEFAULT '[]',
        actions TEXT DEFAULT '[]',
        enabled INTEGER DEFAULT 1,
        runs INTEGER DEFAULT 0,
        last_run DATETIME,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL,
        trigger TEXT NOT NULL,
        context TEXT DEFAULT '{}',
        results TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_addr TEXT NOT NULL,
        to_addr TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT DEFAULT '',
        folder TEXT DEFAULT 'inbox' CHECK(folder IN ('inbox', 'sent', 'drafts', 'trash', 'archive')),
        read INTEGER DEFAULT 0,
        starred INTEGER DEFAULT 0,
        labels TEXT DEFAULT '[]',
        in_reply_to INTEGER,
        user_id INTEGER,
        message_id TEXT,
        uid INTEGER,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (in_reply_to) REFERENCES emails(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('task_assigned', 'task_completed', 'task_comment', 'agent_response', 'workflow_triggered', 'mention', 'system')),
        title TEXT NOT NULL,
        body TEXT DEFAULT '',
        link TEXT,
        read INTEGER DEFAULT 0,
        data TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        path TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL,
        task_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploaded_by) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        type TEXT DEFAULT 'daily' CHECK(type IN ('daily', 'weekly', 'interval')),
        time TEXT DEFAULT '09:00',
        day_of_week INTEGER,
        interval_minutes INTEGER,
        agent_id INTEGER,
        department_id INTEGER,
        priority TEXT DEFAULT 'medium',
        enabled INTEGER DEFAULT 1,
        run_count INTEGER DEFAULT 0,
        last_run DATETIME,
        next_run DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id),
        FOREIGN KEY (department_id) REFERENCES departments(id)
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        icon TEXT DEFAULT '🏢',
        color TEXT DEFAULT '#6366f1',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'manager', 'member')),
        department_id INTEGER REFERENCES departments(id),
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        department_id INTEGER NOT NULL REFERENCES departments(id),
        system_prompt TEXT,
        model TEXT DEFAULT 'gpt-4',
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'offline')),
        capabilities JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'review', 'completed', 'blocked')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        department_id INTEGER REFERENCES departments(id),
        assigned_to INTEGER REFERENCES users(id),
        assigned_agent_id INTEGER REFERENCES agents(id),
        created_by INTEGER NOT NULL REFERENCES users(id),
        due_date TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_error TEXT,
        execution_timeout_ms INTEGER DEFAULT 120000,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS task_comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        agent_id INTEGER REFERENCES agents(id),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        channel TEXT NOT NULL DEFAULT 'general',
        sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'agent')),
        sender_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id SERIAL PRIMARY KEY,
        department_id INTEGER REFERENCES departments(id),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        tags JSONB DEFAULT '[]',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        "trigger" TEXT NOT NULL,
        conditions JSONB DEFAULT '[]',
        actions JSONB DEFAULT '[]',
        enabled BOOLEAN DEFAULT true,
        runs INTEGER DEFAULT 0,
        last_run TIMESTAMPTZ,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        "trigger" TEXT NOT NULL,
        context JSONB DEFAULT '{}',
        results JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        from_addr TEXT NOT NULL,
        to_addr TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT DEFAULT '',
        folder TEXT DEFAULT 'inbox' CHECK(folder IN ('inbox', 'sent', 'drafts', 'trash', 'archive')),
        read BOOLEAN DEFAULT false,
        starred BOOLEAN DEFAULT false,
        labels JSONB DEFAULT '[]',
        in_reply_to INTEGER REFERENCES emails(id),
        user_id INTEGER REFERENCES users(id),
        message_id TEXT,
        uid INTEGER,
        date TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('task_assigned', 'task_completed', 'task_comment', 'agent_response', 'workflow_triggered', 'mention', 'system')),
        title TEXT NOT NULL,
        body TEXT DEFAULT '',
        link TEXT,
        read BOOLEAN DEFAULT false,
        data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS uploads (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        path TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL REFERENCES users(id),
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        type TEXT DEFAULT 'daily' CHECK(type IN ('daily', 'weekly', 'interval')),
        time TEXT DEFAULT '09:00',
        day_of_week INTEGER,
        interval_minutes INTEGER,
        agent_id INTEGER REFERENCES agents(id),
        department_id INTEGER REFERENCES departments(id),
        priority TEXT DEFAULT 'medium',
        enabled BOOLEAN DEFAULT true,
        run_count INTEGER DEFAULT 0,
        last_run TIMESTAMPTZ,
        next_run TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    version: 2,
    name: 'add_performance_indexes',
    sqlite: `
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
      CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
      CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);
      CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_knowledge_dept ON knowledge_base(department_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(category);
      CREATE INDEX IF NOT EXISTS idx_uploads_task ON uploads(task_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_logs_wf ON workflow_logs(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run);
      CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
    `,
    postgres: `
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
      CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
      CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);
      CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_knowledge_dept ON knowledge_base(department_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(category);
      CREATE INDEX IF NOT EXISTS idx_uploads_task ON uploads(task_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_logs_wf ON workflow_logs(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run);
      CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
    `,
  },
];

// ─── Runner ──────────────────────────────────────────────────────

async function runMigrations() {
  if (DATABASE_URL) {
    await runPgMigrations();
  } else {
    runSqliteMigrations();
  }
}

function runSqliteMigrations() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/company-os.db');
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));

  let ran = 0;
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    console.log(`  ↑ Migration ${m.version}: ${m.name}`);
    try {
      db.exec(m.sqlite);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      ran++;
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
        ran++;
      } else throw err;
    }
  }
  console.log(ran === 0 ? '✅ All migrations already applied' : `✅ Applied ${ran} migration(s)`);
  db.close();
}

async function runPgMigrations() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });

  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())');
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map(r => r.version));

    let ran = 0;
    for (const m of migrations) {
      if (applied.has(m.version)) continue;
      console.log(`  ↑ Migration ${m.version}: ${m.name}`);
      // Split PostgreSQL SQL into individual statements
      const statements = m.postgres.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
      await client.query('BEGIN');
      try {
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
        await client.query('COMMIT');
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        if (err.message.includes('already exists')) {
          await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [m.version, m.name]);
          ran++;
        } else throw err;
      }
    }
    console.log(ran === 0 ? '✅ All PostgreSQL migrations already applied' : `✅ Applied ${ran} PostgreSQL migration(s)`);
  } finally {
    client.release();
    await pool.end();
  }
}

// ─── CLI entry point ─────────────────────────────────────────────

if (require.main === module) {
  runMigrations().catch(err => { console.error('❌ Migration failed:', err.message); process.exit(1); });
}

module.exports = { runMigrations };
