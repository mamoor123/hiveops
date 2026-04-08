/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../data/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`),
});

const fileFilter = (req, file, cb) => {
  const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.dll', '.scr'];
  if (blocked.includes(path.extname(file.originalname).toLowerCase())) return cb(new Error('File type not allowed'), false);
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const result = await db.prepare('INSERT INTO uploads (filename, original_name, mime_type, size, path, uploaded_by, task_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, req.user.id, req.body.task_id || null);
  const upload = await db.prepare('SELECT * FROM uploads WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(upload);
});

router.get('/task/:taskId', authMiddleware, async (req, res) => {
  res.json(await db.prepare('SELECT u.*, usr.name as uploader_name FROM uploads u LEFT JOIN users usr ON u.uploaded_by = usr.id WHERE u.task_id = ? ORDER BY u.created_at DESC').all(req.params.taskId));
});

router.get('/:id/download', async (req, res) => {
  const file = await db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.download(file.path, file.original_name);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
