/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const { department_id, category, search } = req.query;
  let query = 'SELECT kb.*, d.name as department_name, d.icon as department_icon, u.name as author_name FROM knowledge_base kb LEFT JOIN departments d ON kb.department_id = d.id LEFT JOIN users u ON kb.created_by = u.id WHERE 1=1';
  const params = [];
  if (department_id) { query += ' AND kb.department_id = ?'; params.push(department_id); }
  if (category) { query += ' AND kb.category = ?'; params.push(category); }
  if (search) { query += ' AND (kb.title LIKE ? OR kb.content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY kb.updated_at DESC';
  res.json(await db.prepare(query).all(...params));
});

router.get('/meta/categories', authMiddleware, async (req, res) => {
  res.json(await db.prepare('SELECT DISTINCT category, COUNT(*) as count FROM knowledge_base GROUP BY category ORDER BY count DESC').all());
});

router.get('/:id', authMiddleware, async (req, res) => {
  const article = await db.prepare('SELECT kb.*, d.name as department_name, d.icon as department_icon, u.name as author_name FROM knowledge_base kb LEFT JOIN departments d ON kb.department_id = d.id LEFT JOIN users u ON kb.created_by = u.id WHERE kb.id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article not found' });
  res.json(article);
});

router.post('/', authMiddleware, async (req, res) => {
  const { title, content, department_id, category, tags } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
  const result = await db.prepare('INSERT INTO knowledge_base (title, content, department_id, category, tags, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(title, content, department_id || null, category || 'general', JSON.stringify(tags || []), req.user.id);
  res.status(201).json(await db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { title, content, department_id, category, tags } = req.body;
  const updates = [];
  const params = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (department_id !== undefined) { updates.push('department_id = ?'); params.push(department_id); }
  if (category !== undefined) { updates.push('category = ?'); params.push(category); }
  if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);
  await db.prepare(`UPDATE knowledge_base SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(await db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/search', authMiddleware, async (req, res) => {
  const { query, department_id, limit } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });
  let sql = 'SELECT kb.id, kb.title, substr(kb.content, 1, 300) as excerpt, kb.category, kb.department_id, d.name as department_name FROM knowledge_base kb LEFT JOIN departments d ON kb.department_id = d.id WHERE (kb.title LIKE ? OR kb.content LIKE ?)';
  const params = [`%${query}%`, `%${query}%`];
  if (department_id) { sql += ' AND kb.department_id = ?'; params.push(department_id); }
  sql += ' ORDER BY kb.updated_at DESC LIMIT ?';
  params.push(limit || 10);
  res.json(await db.prepare(sql).all(...params));
});

module.exports = router;
