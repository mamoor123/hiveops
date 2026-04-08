const db = require('../config/db');
const { executeTask } = require('./ai-engine');
const notificationService = require('./notifications');

let checkInterval = null;
const CHECK_INTERVAL_MS = 60 * 1000;

function start() {
  if (checkInterval) return;
  console.log('⏰ Cron scheduler started');
  checkInterval = setInterval(checkSchedules, CHECK_INTERVAL_MS);
  checkSchedules();
}

function stop() {
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; console.log('⏰ Cron scheduler stopped'); }
}

async function checkSchedules() {
  const now = new Date().toISOString();
  let schedules;
  try { schedules = await db.prepare('SELECT * FROM scheduled_tasks WHERE enabled = 1 AND (next_run IS NULL OR next_run <= ?)').all(now); } catch (err) { if (err.message.includes('no such table')) return; throw err; }
  for (const schedule of schedules) {
    try { await executeSchedule(schedule); } catch (err) { console.error(`⏰ Schedule "${schedule.name}" failed:`, err.message); }
    const nextRun = calculateNextRun(schedule);
    await db.prepare('UPDATE scheduled_tasks SET run_count = run_count + 1, last_run = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(now, nextRun, schedule.id);
  }
}

async function executeSchedule(schedule) {
  console.log(`⏰ Running scheduled task: "${schedule.name}"`);
  const result = await db.prepare("INSERT INTO tasks (title, description, priority, department_id, assigned_agent_id, created_by, status) VALUES (?, ?, ?, ?, ?, 1, 'pending')").run(schedule.name, schedule.description || `Scheduled: ${schedule.name}`, schedule.priority || 'medium', schedule.department_id || null, schedule.agent_id || null);
  if (schedule.agent_id) { try { await executeTask(result.lastInsertRowid); } catch (err) { console.error(`⏰ Scheduled task execution failed:`, err.message); } }
  notificationService.notify({ userId: 1, type: 'workflow_triggered', title: 'Scheduled task executed', body: `"${schedule.name}" ran`, link: '/settings', data: { scheduleId: schedule.id } });
}

function calculateNextRun(schedule) {
  const now = new Date();
  switch (schedule.type) {
    case 'interval': return new Date(now.getTime() + (schedule.interval_minutes || 60) * 60 * 1000).toISOString();
    case 'daily': { const [h, m] = (schedule.time || '09:00').split(':').map(Number); const next = new Date(now); next.setHours(h, m, 0, 0); if (next <= now) next.setDate(next.getDate() + 1); return next.toISOString(); }
    case 'weekly': { const dayOfWeek = schedule.day_of_week ?? 1; const [h2, m2] = (schedule.time || '09:00').split(':').map(Number); const next = new Date(now); next.setHours(h2, m2, 0, 0); const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7; next.setDate(next.getDate() + daysUntil); if (next <= now) next.setDate(next.getDate() + 7); return next.toISOString(); }
    default: return new Date(now.getTime() + 3600000).toISOString();
  }
}

function createSchedule(data) {
  const nextRun = calculateNextRun(data);
  const result = db.prepare('INSERT INTO scheduled_tasks (name, description, type, time, day_of_week, interval_minutes, agent_id, department_id, priority, next_run) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(data.name, data.description || '', data.type || 'daily', data.time || '09:00', data.dayOfWeek ?? data.day_of_week ?? null, data.intervalMinutes ?? data.interval_minutes ?? null, data.agent_id || null, data.department_id || null, data.priority || 'medium', nextRun);
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(result.lastInsertRowid);
}

function updateSchedule(id, data) {
  const existing = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
  if (!existing) return null;
  const updates = [];
  const params = [];
  const fieldMap = { name: 'name', description: 'description', type: 'type', time: 'time', dayOfWeek: 'day_of_week', day_of_week: 'day_of_week', intervalMinutes: 'interval_minutes', interval_minutes: 'interval_minutes', agent_id: 'agent_id', department_id: 'department_id', priority: 'priority', enabled: 'enabled' };
  for (const [inputKey, dbKey] of Object.entries(fieldMap)) { if (data[inputKey] !== undefined) { updates.push(`${dbKey} = ?`); params.push(data[inputKey]); } }
  if (updates.length === 0) return existing;
  if (data.type || data.time || data.dayOfWeek || data.day_of_week || data.intervalMinutes || data.interval_minutes) { updates.push('next_run = ?'); params.push(calculateNextRun({ ...existing, ...data })); }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  db.prepare(`UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
}

function deleteSchedule(id) { db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id); return true; }

function toggleSchedule(id) {
  const schedule = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
  if (!schedule) return null;
  const newEnabled = schedule.enabled ? 0 : 1;
  const nextRun = newEnabled ? calculateNextRun(schedule) : null;
  db.prepare('UPDATE scheduled_tasks SET enabled = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newEnabled, nextRun, id);
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
}

function getSchedules() { try { return db.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC').all(); } catch (err) { if (err.message.includes('no such table')) return []; throw err; } }

function getStatus() {
  let totalSchedules = 0, enabledSchedules = 0;
  try { totalSchedules = db.prepare('SELECT COUNT(*) as c FROM scheduled_tasks').get().c; enabledSchedules = db.prepare('SELECT COUNT(*) as c FROM scheduled_tasks WHERE enabled = 1').get().c; } catch {}
  return { running: checkInterval !== null, totalSchedules, enabledSchedules };
}

module.exports = { start, stop, getStatus, createSchedule, updateSchedule, deleteSchedule, toggleSchedule, getSchedules };
