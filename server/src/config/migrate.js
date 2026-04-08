/**
 * Database Migration Runner
 *
 * Manages schema migrations with version tracking.
 * Run with: npm run migrate
 * Idempotent — safe to run multiple times.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/company-os.db');
const dbDir = path.dirname(DB_PATH);

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create migrations tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const applied = new Set(
  db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
);

// ─── Migration definitions ───────────────────────────────────────

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Core tables (idempotent via IF NOT EXISTS)
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
    `,
  },
  {
    version: 2,
    name: 'add_performance_indexes',
    up: `
      -- Indexes for common query patterns
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

      CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_comments_user ON task_comments(user_id);
      CREATE INDEX IF NOT EXISTS idx_task_comments_agent ON task_comments(agent_id);

      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_type, sender_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);

      CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
      CREATE INDEX IF NOT EXISTS idx_emails_user ON emails(user_id);
      CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);

      CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

      CREATE INDEX IF NOT EXISTS idx_knowledge_dept ON knowledge_base(department_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(category);

      CREATE INDEX IF NOT EXISTS idx_uploads_task ON uploads(task_id);
      CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(uploaded_by);

      CREATE INDEX IF NOT EXISTS idx_workflow_logs_wf ON workflow_logs(workflow_id);
    `,
  },
  {
    version: 3,
    name: 'add_task_retry_fields',
    up: `
      ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 3;
      ALTER TABLE tasks ADD COLUMN last_error TEXT;
      ALTER TABLE tasks ADD COLUMN execution_timeout_ms INTEGER DEFAULT 120000;
    `,
  },
  {
    version: 4,
    name: 'add_scheduled_tasks_table',
    up: `
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

      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run);
    `,
  },
  {
    version: 5,
    name: 'add_email_imap_fields',
    up: `
      ALTER TABLE emails ADD COLUMN message_id TEXT;
      ALTER TABLE emails ADD COLUMN uid INTEGER;
      CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
    `,
  },
];

// ─── Run migrations ──────────────────────────────────────────────

let ran = 0;
const runMigration = db.transaction(() => {
  for (const m of migrations) {
    if (applied.has(m.version)) continue;

    console.log(`  ↑ Migration ${m.version}: ${m.name}`);
    try {
      db.exec(m.up);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      ran++;
    } catch (err) {
      // ALTER TABLE fails if column already exists — check and skip
      if (err.message.includes('duplicate column name')) {
        console.log(`    ⚠ Column already exists, marking as applied`);
        db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
        ran++;
      } else {
        throw err;
      }
    }
  }
});

runMigration();

if (ran === 0) {
  console.log('✅ All migrations already applied');
} else {
  console.log(`✅ Applied ${ran} migration(s)`);
}

db.close();
