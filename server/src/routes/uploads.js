const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Ensure upload directory exists
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(UPLOAD_DIR, String(req.user.id));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Block dangerous file types
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.com'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) {
      cb(new Error('File type not allowed'));
    } else {
      cb(null, true);
    }
  },
});

// Upload file
router.post('/', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const taskId = req.body.task_id ? parseInt(req.body.task_id) : null;

  const result = db.prepare(`
    INSERT INTO uploads (filename, original_name, mime_type, size, path, uploaded_by, task_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.file.size,
    req.file.path,
    req.user.id,
    taskId,
  );

  const upload_record = db.prepare(`
    SELECT u.*, usr.name as uploader_name
    FROM uploads u
    LEFT JOIN users usr ON u.uploaded_by = usr.id
    WHERE u.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(upload_record);
});

// Get uploads for a task
router.get('/task/:taskId', authMiddleware, (req, res) => {
  const files = db.prepare(`
    SELECT u.*, usr.name as uploader_name
    FROM uploads u
    LEFT JOIN users usr ON u.uploaded_by = usr.id
    WHERE u.task_id = ?
    ORDER BY u.created_at DESC
  `).all(req.params.taskId);
  res.json(files);
});

// Download file
router.get('/:id/download', (req, res) => {
  // Support auth via query param for direct links
  let userId = null;
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = require('jsonwebtoken').verify(token, require('../middleware/auth').JWT_SECRET);
      userId = decoded.id;
    } catch {}
  }
  if (!userId && req.query.token) {
    try {
      const decoded = require('jsonwebtoken').verify(req.query.token, require('../middleware/auth').JWT_SECRET);
      userId = decoded.id;
    } catch {}
  }
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const file = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  if (!fs.existsSync(file.path)) return res.status(404).json({ error: 'File not found on disk' });

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Type', file.mime_type);
  res.sendFile(path.resolve(file.path));
});

// Delete file
router.delete('/:id', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  // Only uploader or admin can delete
  if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Delete from disk
  if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

  db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get user's uploads
router.get('/', authMiddleware, (req, res) => {
  const files = db.prepare(`
    SELECT u.*, usr.name as uploader_name
    FROM uploads u
    LEFT JOIN users usr ON u.uploaded_by = usr.id
    ORDER BY u.created_at DESC
    LIMIT 50
  `).all();
  res.json(files);
});

module.exports = router;
