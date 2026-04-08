/**
 * Cron Scheduler
 * 
 * Manages scheduled/recurring agent tasks.
 * Tasks can be scheduled at specific times, intervals, or cron-like patterns.
 */

const db = require('../config/db');
const { executeTask } = require('./ai-engine');
const notificationService = require('./notifications');

// In-memory schedule storage (persisted to DB)
const schedules = new Map();
let scheduleIdCounter = 1;
let checkInterval = null;

/**
 * Seed default schedules from DB or defaults
 */
function seedSchedules() {
  const count = db.prepare('SELECT COUNT(*) as c FROM scheduled_tasks').get().c;
  if (count > 0) return;

  // No default schedules — users create them via UI
}

/**
 * Start the scheduler
 */
function start() {
  if (checkInterval) return;
  console.log('⏰ Cron scheduler started');
  // Check every minute
  checkInterval = setInterval(checkSchedules, 60 * 1000);
  checkSchedules(); // Run immediately
}

/**
 * Stop the scheduler
 */
function stop() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('⏰ Cron scheduler stopped');
  }
}

/**
 * Check and run due schedules
 */
async function checkSchedules() {
  const now = new Date();

  for (const [id, schedule] of schedules) {
    if (!schedule.enabled) continue;
    if (schedule.nextRun && new Date(schedule.nextRun) > now) continue;

    try {
      await executeSchedule(schedule);
    } catch (err) {
      console.error(`Schedule ${id} failed:`, err.message);
    }

    // Calculate next run
    schedule.lastRun = now.toISOString();
    schedule.runCount = (schedule.runCount || 0) + 1;
    schedule.nextRun = calculateNextRun(schedule).toISOString();
  }
}

/**
 * Execute a scheduled task
 */
async function executeSchedule(schedule) {
  console.log(`⏰ Running scheduled task: "${schedule.name}"`);

  // Create a task for the agent
  const result = db.prepare(`
    INSERT INTO tasks (title, description, priority, department_id, assigned_agent_id, created_by, status)
    VALUES (?, ?, ?, ?, ?, 1, 'pending')
  `).run(
    schedule.name,
    schedule.description || `Scheduled task: ${schedule.name}`,
    schedule.priority || 'medium',
    schedule.department_id || null,
    schedule.agent_id || null,
  );

  // If an agent is assigned, the execution loop will pick it up
  // If no agent, just log it
  if (schedule.agent_id) {
    // Immediately try to execute
    try {
      await executeTask(result.lastInsertRowid);
    } catch (err) {
      console.error(`Scheduled task execution failed:`, err.message);
    }
  }

  // Log the execution
  notificationService.notify({
    userId: 1, // admin
    type: 'workflow_triggered',
    title: 'Scheduled task executed',
    body: `"${schedule.name}" ran at ${new Date().toLocaleTimeString()}`,
    link: '/workflows',
    data: { scheduleId: schedule.id },
  });
}

/**
 * Calculate next run time based on schedule config
 */
function calculateNextRun(schedule) {
  const now = new Date();

  switch (schedule.type) {
    case 'interval': {
      // Every N minutes/hours
      const ms = (schedule.intervalMinutes || 60) * 60 * 1000;
      return new Date(now.getTime() + ms);
    }
    case 'daily': {
      // Same time every day
      const [h, m] = (schedule.time || '09:00').split(':').map(Number);
      const next = new Date(now);
      next.setHours(h, m, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }
    case 'weekly': {
      // Specific day of week
      const dayOfWeek = schedule.dayOfWeek || 1; // Monday
      const [h2, m2] = (schedule.time || '09:00').split(':').map(Number);
      const next = new Date(now);
      next.setHours(h2, m2, 0, 0);
      const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil);
      if (next <= now) next.setDate(next.getDate() + 7);
      return next;
    }
    default:
      return new Date(now.getTime() + 60 * 60 * 1000); // Default: 1 hour
  }
}

/**
 * Create a scheduled task
 */
function createSchedule(data) {
  const id = scheduleIdCounter++;
  const schedule = {
    id,
    name: data.name,
    description: data.description || '',
    type: data.type || 'daily',
    time: data.time || '09:00',
    dayOfWeek: data.dayOfWeek,
    intervalMinutes: data.intervalMinutes,
    agent_id: data.agent_id || null,
    department_id: data.department_id || null,
    priority: data.priority || 'medium',
    enabled: true,
    runCount: 0,
    lastRun: null,
    nextRun: calculateNextRun({ ...data, id }).toISOString(),
    createdAt: new Date().toISOString(),
  };
  schedules.set(id, schedule);
  return schedule;
}

/**
 * Update a schedule
 */
function updateSchedule(id, data) {
  const schedule = schedules.get(parseInt(id));
  if (!schedule) return null;
  Object.assign(schedule, data);
  if (data.type || data.time || data.dayOfWeek || data.intervalMinutes) {
    schedule.nextRun = calculateNextRun(schedule).toISOString();
  }
  return schedule;
}

/**
 * Delete a schedule
 */
function deleteSchedule(id) {
  schedules.delete(parseInt(id));
  return true;
}

/**
 * Toggle a schedule
 */
function toggleSchedule(id) {
  const schedule = schedules.get(parseInt(id));
  if (schedule) {
    schedule.enabled = !schedule.enabled;
    if (schedule.enabled) {
      schedule.nextRun = calculateNextRun(schedule).toISOString();
    }
  }
  return schedule;
}

/**
 * Get all schedules
 */
function getSchedules() {
  return Array.from(schedules.values());
}

/**
 * Get scheduler status
 */
function getStatus() {
  return {
    running: checkInterval !== null,
    totalSchedules: schedules.size,
    enabledSchedules: Array.from(schedules.values()).filter(s => s.enabled).length,
  };
}

module.exports = {
  start, stop, getStatus,
  createSchedule, updateSchedule, deleteSchedule, toggleSchedule,
  getSchedules,
};
