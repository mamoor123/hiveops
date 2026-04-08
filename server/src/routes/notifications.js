const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const notificationService = require('../services/notifications');

const router = express.Router();

// Get notifications
router.get('/', authMiddleware, (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const limit = parseInt(req.query.limit) || 50;
  const notifications = notificationService.getNotifications(req.user.id, { unreadOnly, limit });
  res.json(notifications);
});

// Get unread count
router.get('/unread-count', authMiddleware, (req, res) => {
  res.json({ count: notificationService.getUnreadCount(req.user.id) });
});

// Mark single as read
router.post('/:id/read', authMiddleware, (req, res) => {
  notificationService.markRead(req.params.id, req.user.id);
  res.json({ success: true });
});

// Mark all as read
router.post('/read-all', authMiddleware, (req, res) => {
  notificationService.markAllRead(req.user.id);
  res.json({ success: true });
});

module.exports = router;
