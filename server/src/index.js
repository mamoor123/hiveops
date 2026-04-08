const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./config/db');
const { JWT_SECRET } = require('./middleware/auth');
const { chatWithAgent } = require('./services/ai-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.IO for real-time chat
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`⚡ User connected: ${socket.user.name}`);

  socket.on('join-channel', (channel) => {
    socket.join(channel);
    console.log(`${socket.user.name} joined #${channel}`);
  });

  socket.on('leave-channel', (channel) => {
    socket.leave(channel);
  });

  socket.on('message', (data) => {
    const { channel, content } = data;
    if (!channel || !content) return;

    const result = db.prepare(
      'INSERT INTO messages (channel, sender_type, sender_id, content) VALUES (?, ?, ?, ?)'
    ).run(channel, 'user', socket.user.id, content);

    const message = {
      id: result.lastInsertRowid,
      channel,
      sender_type: 'user',
      sender_id: socket.user.id,
      sender_name: socket.user.name,
      content,
      created_at: new Date().toISOString()
    };

    io.to(channel).emit('message', message);
  });

  // Chat with agent via socket
  socket.on('agent-message', async (data) => {
    const { channel, agentId, content } = data;
    if (!channel || !agentId || !content) return;

    // Store user message
    const userMsg = db.prepare(
      "INSERT INTO messages (channel, sender_type, sender_id, content) VALUES (?, 'user', ?, ?)"
    ).run(channel, socket.user.id, content);

    const userMessage = {
      id: userMsg.lastInsertRowid,
      channel,
      sender_type: 'user',
      sender_id: socket.user.id,
      sender_name: socket.user.name,
      content,
      created_at: new Date().toISOString()
    };
    io.to(channel).emit('message', userMessage);

    // Emit typing indicator
    io.to(channel).emit('agent-typing', { agentId, channel });

    try {
      // Get agent response
      const response = await chatWithAgent(agentId, content, channel);

      const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId);
      const agentMessage = {
        id: Date.now(),
        channel,
        sender_type: 'agent',
        sender_id: agentId,
        sender_name: agent?.name || 'Agent',
        content: response,
        created_at: new Date().toISOString()
      };
      io.to(channel).emit('message', agentMessage);
    } catch (err) {
      io.to(socket.id).emit('error', { message: err.message });
    }

    io.to(channel).emit('agent-stop-typing', { agentId, channel });
  });

  socket.on('disconnect', () => {
    console.log(`💤 User disconnected: ${socket.user.name}`);
  });
});

// Seed default data if empty
function seedDefaults() {
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;
  if (deptCount === 0) {
    const defaults = [
      { name: 'Operations', description: 'Day-to-day business operations', icon: '⚙️', color: '#6366f1' },
      { name: 'Marketing', description: 'Marketing, branding, and growth', icon: '📈', color: '#ec4899' },
      { name: 'Engineering', description: 'Technical development and infrastructure', icon: '🛠️', color: '#10b981' },
      { name: 'Sales', description: 'Revenue generation and client management', icon: '💰', color: '#f59e0b' },
      { name: 'HR & Admin', description: 'People operations and administration', icon: '👥', color: '#8b5cf6' },
      { name: 'Design', description: 'Creative and visual design', icon: '🎨', color: '#ef4444' },
    ];

    const insert = db.prepare('INSERT INTO departments (name, description, icon, color) VALUES (?, ?, ?, ?)');
    for (const d of defaults) {
      insert.run(d.name, d.description, d.icon, d.color);
    }
    console.log('✅ Seeded default departments');
  }
}

seedDefaults();

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║     🏢 Company OS Server v0.1.0     ║
  ║     Running on port ${PORT}            ║
  ╚══════════════════════════════════════╝
  `);
});
