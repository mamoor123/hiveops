-- Migration: Add notifications table
-- Run this if upgrading an existing database

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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
