const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const { validateBody, sanitizeBody } = require('../middleware/validate');
const { rateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const authRateLimit = rateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 20 });

// Register
router.post('/register', authRateLimit, sanitizeBody(['email', 'name']), validateBody(['email', 'password', 'name']), (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const userRole = role || 'member';

    const result = db.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(email, password_hash, name, userRole);

    const token = jwt.sign(
      { id: result.lastInsertRowid, email, name, role: userRole },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: result.lastInsertRowid, email, name, role: userRole }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', authRateLimit, sanitizeBody(['email']), validateBody(['email', 'password']), (req, res) => {
  try {
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, department_id: user.department_id }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, department_id, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// List users
router.get('/', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, department_id, avatar_url, created_at FROM users').all();
  res.json(users);
});

module.exports = router;
