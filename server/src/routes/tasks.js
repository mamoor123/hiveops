/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { validateBody, sanitizeBody } = require('../middleware/validate');
const notificationService = require('../services/notifications');

const router = express.Router();

// List tasks
router.get('/', authMiddleware, async (req, res) => {
  const { status, priority, department_id, assigned_to } = req.query;
  let query = `SELECT t.*, d.name as department_name, d.icon as department_icon,
    u1.name as assignee_name, a.name as agent_name, u2.name as creator_name
    FROM tasks t LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN agents a ON t.assigned_agent_id = a.id
    LEFT JOIN users u2 ON t.created_by = u2.id WHERE 1=1`;
  const params = [];
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (department_id) { query += ' AND t.department_id = ?'; params.push(department_id); }
  if (assigned_to) { query += ' AND t.assigned_to = ?'; params.push(assigned_to); }
  query += " ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC";
  const tasks = await db.prepare(query).all(...params);
  res.json(tasks);
});

// Get single task
router.get('/:id', authMiddleware, async (req, res) => {
  const task = await db.prepare(`SELECT t.*, d.name as department_name, d.icon as department_icon, d.color as department_color,
    u1.name as assignee_name, u1.email as assignee_email, a.name as agent_name, u2.name as creator_name
    FROM tasks t LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN agents a ON t.assigned_agent_id = a.id
    LEFT JOIN users u2 ON t.created_by = u2.id WHERE t.id = ?`).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Create task
router.post('/', authMiddleware, sanitizeBody(['title', 'description']), validateBody(['title']), async (req, res) => {
  const { title, description, priority, department_id, assigned_to, assigned_agent_id, due_date } = req.body;
  const result = await db.prepare(`INSERT INTO tasks (title, description, priority, department_id, assigned_to, assigned_agent_id, created_by, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(title, description || '', priority || 'medium', department_id || null, assigned_to || null, assigned_agent_id || null, req.user.id, due_date || null);
  const task = await db.prepare('SELECT t.*, d.name as department_name, u.name as assignee_name FROM tasks t LEFT JOIN departments d ON t.department_id = d.id LEFT JOIN users u ON t.assigned_to = u.id WHERE t.id = ?').get(result.lastInsertRowid);
  if (assigned_to && assigned_to !== req.user.id) {
    notificationService.notify({ userId: assigned_to, type: 'task_assigned', title: 'New task assigned to you', body: `"${title}" — ${priority} priority`, link: '/tasks', data: { taskId: result.lastInsertRowid } });
  }
  res.status(201).json(task);
});

// Update task
router.put('/:id', authMiddleware, async (req, res) => {
  const currentTask = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!currentTask) return res.status(404).json({ error: 'Task not found' });
  const { title, description, status, priority, assigned_to, assigned_agent_id, due_date } = req.body;
  const updates = [];
  const params = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
  if (assigned_agent_id !== undefined) { updates.push('assigned_agent_id = ?'); params.push(assigned_agent_id); }
  if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
  if (status === 'completed') updates.push('completed_at = CURRENT_TIMESTAMP');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);
  await db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (status && status !== currentTask.status && status === 'completed' && currentTask.created_by !== req.user.id) {
    notificationService.notify({ userId: currentTask.created_by, type: 'task_completed', title: 'Task completed', body: `"${task.title}" has been marked as done`, link: '/tasks', data: { taskId: task.id } });
  }
  if (assigned_to && assigned_to !== currentTask.assigned_to && assigned_to !== req.user.id) {
    notificationService.notify({ userId: assigned_to, type: 'task_assigned', title: 'Task assigned to you', body: `"${task.title}"`, link: '/tasks', data: { taskId: task.id } });
  }
  res.json(task);
});

// Add comment
router.post('/:id/comments', authMiddleware, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  await db.prepare('INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.user.id, content);
  await db.prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  const comments = await db.prepare('SELECT c.*, u.name as user_name FROM task_comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.task_id = ? ORDER BY c.created_at').all(req.params.id);
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (task) {
    const notifyIds = new Set();
    if (task.created_by && task.created_by !== req.user.id) notifyIds.add(task.created_by);
    if (task.assigned_to && task.assigned_to !== req.user.id) notifyIds.add(task.assigned_to);
    for (const uid of notifyIds) {
      notificationService.notify({ userId: uid, type: 'task_comment', title: 'New comment on task', body: `"${task.title}" — ${req.user.name}: ${content.slice(0, 80)}`, link: '/tasks', data: { taskId: task.id } });
    }
  }
  res.status(201).json(comments);
});

// Get comments
router.get('/:id/comments', authMiddleware, async (req, res) => {
  const comments = await db.prepare('SELECT c.*, u.name as user_name, a.name as agent_name FROM task_comments c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN agents a ON c.agent_id = a.id WHERE c.task_id = ? ORDER BY c.created_at').all(req.params.id);
  res.json(comments);
});

// Delete task
router.delete('/:id', authMiddleware, async (req, res) => {
  await db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
