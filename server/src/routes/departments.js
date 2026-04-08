/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const db = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { validateBody, sanitizeBody } = require('../middleware/validate');

const router = express.Router();

// List departments
router.get('/', authMiddleware, async (req, res) => {
  const depts = await db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) as member_count,
      (SELECT COUNT(*) FROM agents a WHERE a.department_id = d.id) as agent_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id AND t.status != 'completed') as active_tasks
    FROM departments d ORDER BY d.name
  `).all();
  res.json(depts);
});

// Create department
router.post('/', authMiddleware, adminOnly, sanitizeBody(['name', 'description']), validateBody(['name']), async (req, res) => {
  try {
    const { name, description, icon, color } = req.body;
    const result = await db.prepare('INSERT INTO departments (name, description, icon, color) VALUES (?, ?, ?, ?)').run(name, description || '', icon || '🏢', color || '#6366f1');
    const dept = await db.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(dept);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get department
router.get('/:id', authMiddleware, async (req, res) => {
  const dept = await db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });
  const members = await db.prepare('SELECT id, name, email, role FROM users WHERE department_id = ?').all(req.params.id);
  const agents = await db.prepare('SELECT * FROM agents WHERE department_id = ?').all(req.params.id);
  const tasks = await db.prepare('SELECT * FROM tasks WHERE department_id = ? ORDER BY priority DESC, created_at DESC').all(req.params.id);
  res.json({ ...dept, members, agents, tasks });
});

// Update department
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, description, icon, color } = req.body;
  await db.prepare('UPDATE departments SET name = COALESCE(?, name), description = COALESCE(?, description), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ?').run(name, description, icon, color, req.params.id);
  const dept = await db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  res.json(dept);
});

// Delete department
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  await db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
