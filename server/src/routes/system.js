const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const executionLoop = require('../services/execution-loop');
const scheduler = require('../services/scheduler');

const router = express.Router();

// System status
router.get('/status', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  res.json({
    server: {
      uptime: process.uptime(),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      env: process.env.NODE_ENV || 'development',
    },
    llm: {
      configured: !!process.env.LLM_API_KEY,
      url: process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
      model: process.env.DEFAULT_MODEL || 'gpt-4',
    },
    executionLoop: executionLoop.getStatus(),
    scheduler: scheduler.getStatus(),
  });
});

// Test LLM connection
router.post('/test-llm', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const { apiKey, apiUrl, model } = req.body;

  const testUrl = apiUrl || process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
  const testKey = apiKey || process.env.LLM_API_KEY;
  const testModel = model || process.env.DEFAULT_MODEL || 'gpt-4';

  if (!testKey) {
    return res.json({ success: false, message: 'No API key provided. Using simulated responses.' });
  }

  try {
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testKey}`,
      },
      body: JSON.stringify({
        model: testModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Reply with just "Connection successful!"' },
          { role: 'user', content: 'Say hello' },
        ],
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.json({ success: false, message: `API error: ${response.status} — ${err.slice(0, 200)}` });
    }

    const data = await response.json();
    res.json({
      success: true,
      message: 'Connection successful!',
      model: data.model || testModel,
      response: data.choices?.[0]?.message?.content || '(empty)',
    });
  } catch (err) {
    res.json({ success: false, message: `Connection failed: ${err.message}` });
  }
});

// Toggle execution loop
router.post('/execution-loop/toggle', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const status = executionLoop.getStatus();
  if (status.running) {
    executionLoop.stop();
  } else {
    executionLoop.start();
  }
  res.json(executionLoop.getStatus());
});

// Trigger execution loop manually
router.post('/execution-loop/run', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  try {
    await executionLoop.tick();
    res.json({ success: true, message: 'Execution cycle completed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scheduler CRUD
router.get('/schedules', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  res.json(scheduler.getSchedules());
});

router.post('/schedules', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const schedule = scheduler.createSchedule(req.body);
  res.status(201).json(schedule);
});

router.put('/schedules/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const schedule = scheduler.updateSchedule(req.params.id, req.body);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  res.json(schedule);
});

router.delete('/schedules/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  scheduler.deleteSchedule(req.params.id);
  res.json({ success: true });
});

router.post('/schedules/:id/toggle', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const schedule = scheduler.toggleSchedule(req.params.id);
  res.json(schedule);
});

module.exports = router;
