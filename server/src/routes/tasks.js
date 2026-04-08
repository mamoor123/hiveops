const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { validateBody, sanitizeBody } = require('../middleware/validate');

const router = express.Router();

// List tasks
router.get('/', authMiddleware, (req, res) => {
  const { status, priority, department_id, assigned_to } = req.query;
  let query = `
    SELECT t.*, 
      d.name as department_name, d.icon as department_icon,
      u1.name as assignee_name,
      a.name as agent_name,
      u2.name as creator_name
    FROM tasks t
    LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN agents a ON t.assigned_agent_id = a.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    WHERE 1=1
  `;
  const params = [];

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (department_id) { query += ' AND t.department_id = ?'; params.push(department_id); }
  if (assigned_to) { query += ' AND t.assigned_to = ?'; params.push(assigned_to); }

  query += ' ORDER BY CASE t.priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// Create task
router.post('/', authMiddleware, sanitizeBody(['title', 'description']), validateBody(['title']), (req, res) => {
  const { title, description, priority, department_id, assigned_to, assigned_agent_id, due_date } = req.body;

  const result = db.prepare(`
    INSERT INTO tasks (title, description, priority, department_id, assigned_to, assigned_agent_id, created_by, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', priority || 'medium', department_id || null, assigned_to || null, assigned_agent_id || null, req.user.id, due_date || null);

  const task = db.prepare(`
    SELECT t.*, d.name as department_name, u.name as assignee_name
    FROM tasks t
    LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(task);
});

// Update task
router.put('/:id', authMiddleware, (req, res) => {
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

  if (status === 'completed') {
    updates.push('completed_at = CURRENT_TIMESTAMP');
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json(task);
});

// Add comment
router.post('/:id/comments', authMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  db.prepare('INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.user.id, content);
  db.prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

  const comments = db.prepare(`
    SELECT c.*, u.name as user_name FROM task_comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ? ORDER BY c.created_at
  `).all(req.params.id);

  res.status(201).json(comments);
});

// Get comments
router.get('/:id/comments', authMiddleware, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, a.name as agent_name FROM task_comments c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN agents a ON c.agent_id = a.id
    WHERE c.task_id = ? ORDER BY c.created_at
  `).all(req.params.id);
  res.json(comments);
});

// Delete task
router.delete('/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
