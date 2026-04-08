const db = require('../config/db');

let io = null;

function setIO(socketIO) { io = socketIO; }

async function notify({ userId, type, title, body = '', link = null, data = {} }) {
  const result = await db.prepare('INSERT INTO notifications (user_id, type, title, body, link, data) VALUES (?, ?, ?, ?, ?, ?)').run(userId, type, title, body, link, JSON.stringify(data));
  const notification = { id: result.lastInsertRowid, user_id: userId, type, title, body, link, read: false, data, created_at: new Date().toISOString() };
  if (io) io.to(`user:${userId}`).emit('notification', notification);
  return notification;
}

async function notifyMany(userIds, opts) {
  const results = [];
  for (const id of userIds) {
    results.push(await notify({ ...opts, userId: id }));
  }
  return results;
}

function safeJson(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

async function getNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [userId];
  if (unreadOnly) query += ' AND read = false';
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const rows = await db.prepare(query).all(...params);
  return rows.map(row => ({ ...row, data: safeJson(row.data, {}), read: !!row.read }));
}

async function getUnreadCount(userId) {
  const row = await db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = false').get(userId);
  return row ? (row.c || row.count || 0) : 0;
}

async function markRead(id, userId) { await db.prepare('UPDATE notifications SET read = true WHERE id = ? AND user_id = ?').run(id, userId); }

async function markAllRead(userId) { await db.prepare('UPDATE notifications SET read = true WHERE user_id = ? AND read = false').run(userId); }

async function cleanup(userId) { await db.prepare("DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100)").run(userId, userId); }

module.exports = { setIO, notify, notifyMany, getNotifications, getUnreadCount, markRead, markAllRead, cleanup };
