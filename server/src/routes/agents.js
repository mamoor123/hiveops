const express = require('express');
const db = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { validateBody, sanitizeBody } = require('../middleware/validate');

const router = express.Router();

// List agents
router.get('/', authMiddleware, (req, res) => {
  const agents = db.prepare(`
    SELECT a.*, d.name as department_name, d.icon as department_icon
    FROM agents a
    LEFT JOIN departments d ON a.department_id = d.id
    ORDER BY a.name
  `).all();
  res.json(agents);
});

// Create agent
router.post('/', authMiddleware, adminOnly, sanitizeBody(['name', 'role']), validateBody(['name', 'role', 'department_id']), (req, res) => {
  const { name, role, department_id, system_prompt, model, capabilities } = req.body;

  const result = db.prepare(`
    INSERT INTO agents (name, role, department_id, system_prompt, model, capabilities)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, role, department_id, system_prompt || '', model || 'gpt-4', JSON.stringify(capabilities || []));

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(agent);
});

// Update agent
router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  const { name, role, system_prompt, model, status, capabilities } = req.body;

  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (system_prompt !== undefined) { updates.push('system_prompt = ?'); params.push(system_prompt); }
  if (model !== undefined) { updates.push('model = ?'); params.push(model); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (capabilities !== undefined) { updates.push('capabilities = ?'); params.push(JSON.stringify(capabilities)); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  res.json(agent);
});

// Delete agent
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
