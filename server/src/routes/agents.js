/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const db = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const agents = await db.prepare('SELECT a.*, d.name as department_name, d.icon as department_icon, d.color as department_color FROM agents a LEFT JOIN departments d ON a.department_id = d.id ORDER BY a.name').all();
  res.json(agents);
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { name, role, department_id, system_prompt, model, capabilities } = req.body;
  if (!name || !role || !department_id) return res.status(400).json({ error: 'Name, role, and department_id required' });
  const result = await db.prepare('INSERT INTO agents (name, role, department_id, system_prompt, model, capabilities) VALUES (?, ?, ?, ?, ?, ?)').run(name, role, department_id, system_prompt || '', model || 'gpt-4', JSON.stringify(capabilities || []));
  const agent = await db.prepare('SELECT a.*, d.name as department_name FROM agents a LEFT JOIN departments d ON a.department_id = d.id WHERE a.id = ?').get(result.lastInsertRowid);
  res.status(201).json(agent);
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, role, department_id, system_prompt, model, status, capabilities } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (department_id !== undefined) { updates.push('department_id = ?'); params.push(department_id); }
  if (system_prompt !== undefined) { updates.push('system_prompt = ?'); params.push(system_prompt); }
  if (model !== undefined) { updates.push('model = ?'); params.push(model); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (capabilities !== undefined) { updates.push('capabilities = ?'); params.push(JSON.stringify(capabilities)); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  await db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const agent = await db.prepare('SELECT a.*, d.name as department_name FROM agents a LEFT JOIN departments d ON a.department_id = d.id WHERE a.id = ?').get(req.params.id);
  res.json(agent);
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  await db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
