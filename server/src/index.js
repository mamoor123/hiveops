/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const log = require('./config/logger');
const db = require('./config/db');
const { JWT_SECRET } = require('./middleware/auth');
const { chatWithAgent } = require('./services/ai-engine');
const notificationService = require('./services/notifications');

// ─── Run migrations on startup ───────────────────────────────────
const { runMigrations } = require('./config/migrate');
try {
  log.info('📦 Running database migrations...');
  // Use sync for SQLite, async for PG — handle both
  const migrationResult = runMigrations();
  if (migrationResult && typeof migrationResult.then === 'function') {
    // PG mode: we need to handle async startup
    // This is handled below in the async startup function
  }
} catch (err) {
  log.error({ err }, '❌ Migration failed');
  process.exit(1);
}

// ─── Express + Socket.IO setup ───────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path !== '/api/health') {
      log.info({ method: req.method, path: req.path, status: res.statusCode, ms }, `${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/email', require('./routes/email'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/system', require('./routes/system'));

// Health check with DB connectivity
app.get('/api/health', async (req, res) => {
  try {
    const healthy = await db.healthCheck();
    res.json({ status: 'ok', time: new Date().toISOString(), db: healthy ? db._type : 'error' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  log.error({ err, path: req.path }, 'Unhandled error');
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 10MB)' });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Socket.IO ───────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  log.info({ user: socket.user.name }, '⚡ User connected');
  socket.join(`user:${socket.user.id}`);

  socket.on('join-channel', (channel) => socket.join(channel));
  socket.on('leave-channel', (channel) => socket.leave(channel));

  socket.on('message', async (data) => {
    const { channel, content } = data;
    if (!channel || !content) return;
    const result = await db.prepare('INSERT INTO messages (channel, sender_type, sender_id, content) VALUES (?, ?, ?, ?)').run(channel, 'user', socket.user.id, content);
    io.to(channel).emit('message', { id: result.lastInsertRowid, channel, sender_type: 'user', sender_id: socket.user.id, sender_name: socket.user.name, content, created_at: new Date().toISOString() });
  });

  socket.on('agent-message', async (data) => {
    const { channel, agentId, content } = data;
    if (!channel || !agentId || !content) return;
    const userMsg = await db.prepare("INSERT INTO messages (channel, sender_type, sender_id, content) VALUES (?, 'user', ?, ?)").run(channel, socket.user.id, content);
    io.to(channel).emit('message', { id: userMsg.lastInsertRowid, channel, sender_type: 'user', sender_id: socket.user.id, sender_name: socket.user.name, content, created_at: new Date().toISOString() });
    io.to(channel).emit('agent-typing', { agentId, channel });
    try {
      const response = await chatWithAgent(agentId, content, channel);
      const agent = await db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId);
      io.to(channel).emit('message', { id: Date.now(), channel, sender_type: 'agent', sender_id: agentId, sender_name: agent?.name || 'Agent', content: response, created_at: new Date().toISOString() });
    } catch (err) { io.to(socket.id).emit('error', { message: err.message }); }
    io.to(channel).emit('agent-stop-typing', { agentId, channel });
  });

  socket.on('disconnect', () => log.info({ user: socket.user.name }, '💤 User disconnected'));
});

// ─── Seed defaults ───────────────────────────────────────────────
async function seedDefaults() {
  const deptCount = (await db.prepare('SELECT COUNT(*) as count FROM departments').get()).count;
  if (deptCount === 0) {
    const defaults = [
      { name: 'Operations', description: 'Day-to-day business operations', icon: '⚙️', color: '#6366f1' },
      { name: 'Marketing', description: 'Marketing, branding, and growth', icon: '📈', color: '#ec4899' },
      { name: 'Engineering', description: 'Technical development and infrastructure', icon: '🛠️', color: '#10b981' },
      { name: 'Sales', description: 'Revenue generation and client management', icon: '💰', color: '#f59e0b' },
      { name: 'HR & Admin', description: 'People operations and administration', icon: '👥', color: '#8b5cf6' },
      { name: 'Design', description: 'Creative and visual design', icon: '🎨', color: '#ef4444' },
    ];
    for (const d of defaults) await db.prepare('INSERT INTO departments (name, description, icon, color) VALUES (?, ?, ?, ?)').run(d.name, d.description, d.icon, d.color);
    log.info('✅ Seeded default departments');
  }
}

// Initialize notification service with Socket.IO
notificationService.setIO(io);

// ─── Background services ─────────────────────────────────────────
const executionLoop = require('./services/execution-loop');
const scheduler = require('./services/scheduler');
const emailReal = require('./services/email-real');

// ─── Async startup (handles PG migrations) ───────────────────────
async function startup() {
  // Wait for async migrations if PG
  if (db._type === 'pg') {
    try { await runMigrations(); } catch (err) { log.error({ err }, '❌ PG migration failed'); process.exit(1); }
  }

  await seedDefaults();

  server.listen(PORT, () => {
    log.info(`🏢 Company OS Server v0.4.0 — port ${PORT} — ${db._type} mode`);
    executionLoop.start();
    scheduler.start();
    emailReal.startImapPolling();
  });
}

startup();

// ─── Graceful shutdown ───────────────────────────────────────────
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info({ signal }, '🛑 Shutting down...');
  server.close(() => log.info('✓ HTTP server closed'));
  executionLoop.stop();
  scheduler.stop();
  emailReal.stopImapPolling();
  io.close(() => log.info('✓ Socket.IO closed'));
  db.close();
  log.info('👋 Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log.error({ reason }, 'Unhandled Rejection'));
process.on('uncaughtException', (err) => { log.error({ err }, 'Uncaught Exception'); gracefulShutdown('uncaughtException'); });
