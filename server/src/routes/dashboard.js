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
  const [departments, users, agents, activeTasks, urgentTasks, recentTasks, recentNotifications] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM departments').get(),
    db.prepare('SELECT COUNT(*) as count FROM users').get(),
    db.prepare('SELECT COUNT(*) as count FROM agents').get(),
    db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status IN ('pending', 'in_progress', 'review')").get(),
    db.prepare("SELECT COUNT(*) as count FROM tasks WHERE priority = 'urgent' AND status != 'completed'").get(),
    db.prepare("SELECT t.*, d.name as department_name, u.name as assignee_name, a.name as agent_name FROM tasks t LEFT JOIN departments d ON t.department_id = d.id LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN agents a ON t.assigned_agent_id = a.id ORDER BY t.created_at DESC LIMIT 10").all(),
    db.prepare('SELECT n.*, u.name as user_name FROM notifications n LEFT JOIN users u ON n.user_id = u.id ORDER BY n.created_at DESC LIMIT 10').all(),
  ]);
  res.json({
    stats: { departments: departments.count, users: users.count, agents: agents.count, activeTasks: activeTasks.count, urgentTasks: urgentTasks.count },
    recentTasks,
    recentNotifications,
  });
});

router.get('/activity', authMiddleware, async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const activity = await db.prepare(`SELECT date(created_at) as date, COUNT(*) as count FROM tasks WHERE created_at >= datetime('now', ?) GROUP BY date(created_at) ORDER BY date`).all(`-${days} days`);
  res.json(activity);
});

module.exports = router;
