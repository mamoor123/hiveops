/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const notificationService = require('../services/notifications');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const { unread } = req.query;
  res.json(await notificationService.getNotifications(req.user.id, { unreadOnly: unread === 'true' }));
});

router.get('/unread-count', authMiddleware, async (req, res) => {
  res.json({ count: await notificationService.getUnreadCount(req.user.id) });
});

router.post('/:id/read', authMiddleware, async (req, res) => {
  await notificationService.markRead(req.params.id, req.user.id);
  res.json({ success: true });
});

router.post('/read-all', authMiddleware, async (req, res) => {
  await notificationService.markAllRead(req.user.id);
  res.json({ success: true });
});

module.exports = router;
