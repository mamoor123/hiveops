const db = require('../config/db');

let io = null;

function setIO(socketIO) { io = socketIO; }

function notify({ userId, type, title, body = '', link = null, data = {} }) {
  const result = db.prepare('INSERT INTO notifications (user_id, type, title, body, link, data) VALUES (?, ?, ?, ?, ?, ?)').run(userId, type, title, body, link, JSON.stringify(data));
  const notification = { id: result.lastInsertRowid, user_id: userId, type, title, body, link, read: 0, data, created_at: new Date().toISOString() };
  if (io) io.to(`user:${userId}`).emit('notification', notification);
  return notification;
}

function notifyMany(userIds, opts) { return userIds.map(id => notify({ ...opts, userId: id })); }

function getNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [userId];
  if (unreadOnly) query += ' AND read = 0';
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(query).all(...params).map(row => ({ ...row, data: JSON.parse(row.data || '{}'), read: !!row.read }));
}

function getUnreadCount(userId) { return db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0').get(userId).c; }

function markRead(id, userId) { db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, userId); }

function markAllRead(userId) { db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId); }

function cleanup(userId) { db.prepare("DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100)").run(userId, userId); }

module.exports = { setIO, notify, notifyMany, getNotifications, getUnreadCount, markRead, markAllRead, cleanup };
