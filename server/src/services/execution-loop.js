/**
 * Agent Execution Loop
 *
 * Periodically scans for tasks assigned to agents and auto-executes them.
 * Features:
 *   - Retry with exponential backoff on failure
 *   - Dead letter queue after max retries exceeded
 *   - Task execution timeout
 *   - Configurable concurrency
 *   - Detailed error tracking
 */

const db = require('../config/db');
const { executeTask } = require('./ai-engine');
const notificationService = require('./notifications');

let intervalId = null;
const EXECUTION_INTERVAL = 30 * 1000; // Check every 30 seconds
const MAX_CONCURRENT = 3;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const BACKOFF_BASE_MS = 10_000;     // 10 seconds base for backoff
const BACKOFF_MULTIPLIER = 2;

let activeExecutions = 0;
let stats = {
  totalExecuted: 0,
  totalSucceeded: 0,
  totalFailed: 0,
  totalRetried: 0,
  totalDeadLettered: 0,
  lastRunAt: null,
};

// Track retry timestamps per task for backoff
const retryTimestamps = new Map();

/**
 * Start the execution loop
 */
function start() {
  if (intervalId) return;
  console.log('🤖 Agent execution loop started');
  tick();
  intervalId = setInterval(tick, EXECUTION_INTERVAL);
}

/**
 * Stop the execution loop
 */
function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🤖 Agent execution loop stopped');
  }
}

/**
 * Calculate backoff delay: base * multiplier^retryCount
 */
function getBackoffDelay(retryCount) {
  return Math.min(BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, retryCount), 300_000); // Max 5 min
}

/**
 * Check if a task is eligible for retry (respects backoff)
 */
function isEligibleForRetry(task) {
  const lastAttempt = retryTimestamps.get(task.id);
  if (!lastAttempt) return true;

  const backoffMs = getBackoffDelay(task.retry_count || 0);
  return Date.now() - lastAttempt >= backoffMs;
}

/**
 * Single tick: find and execute pending agent tasks
 */
async function tick() {
  if (activeExecutions >= MAX_CONCURRENT) return;

  stats.lastRunAt = new Date().toISOString();

  try {
    // 1. Find fresh pending tasks
    const pendingTasks = db.prepare(`
      SELECT t.id, t.title, t.assigned_agent_id, t.created_by,
        t.retry_count, t.max_retries, t.last_error,
        a.name as agent_name, a.status as agent_status
      FROM tasks t
      JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.status = 'pending'
        AND a.status = 'active'
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        t.created_at ASC
      LIMIT ?
    `).all(MAX_CONCURRENT - activeExecutions);

    // 2. Find failed tasks eligible for retry
    const retryTasks = db.prepare(`
      SELECT t.id, t.title, t.assigned_agent_id, t.created_by,
        t.retry_count, t.max_retries, t.last_error,
        a.name as agent_name, a.status as agent_status
      FROM tasks t
      JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.status = 'blocked'
        AND t.retry_count < t.max_retries
        AND a.status = 'active'
      ORDER BY t.updated_at ASC
      LIMIT ?
    `).all(MAX_CONCURRENT - activeExecutions);

    // Execute pending tasks
    for (const task of pendingTasks) {
      if (activeExecutions >= MAX_CONCURRENT) break;
      executeTaskAsync(task, false);
    }

    // Execute retry-eligible tasks
    for (const task of retryTasks) {
      if (activeExecutions >= MAX_CONCURRENT) break;
      if (!isEligibleForRetry(task)) continue;
      executeTaskAsync(task, true);
    }

  } catch (err) {
    console.error('Execution loop tick error:', err.message);
  }
}

/**
 * Execute a task with timeout, retry tracking, and dead letter queue
 */
async function executeTaskAsync(task, isRetry) {
  activeExecutions++;
  stats.totalExecuted++;
  if (isRetry) stats.totalRetried++;

  const timeoutMs = task.execution_timeout_ms || DEFAULT_TIMEOUT_MS;
  const retryCount = task.retry_count || 0;

  console.log(
    `🤖 ${isRetry ? 'Retrying' : 'Executing'} task #${task.id}` +
    `${isRetry ? ` (attempt ${retryCount + 1}/${task.max_retries})` : ''}` +
    `: "${task.title}" via ${task.agent_name}`
  );

  retryTimestamps.set(task.id, Date.now());

  try {
    // Execute with timeout
    const result = await withTimeout(
      executeTask(task.id),
      timeoutMs,
      `Task execution timed out after ${timeoutMs / 1000}s`
    );

    stats.totalSucceeded++;

    // Clear retry tracking on success
    retryTimestamps.delete(task.id);
    db.prepare(`
      UPDATE tasks SET retry_count = 0, last_error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(task.id);

    // Notify task creator
    if (task.created_by) {
      notificationService.notify({
        userId: task.created_by,
        type: 'agent_response',
        title: 'Agent completed task',
        body: `${task.agent_name} finished: "${task.title}"`,
        link: '/tasks',
        data: { taskId: task.id, agentId: task.assigned_agent_id },
      });
    }

  } catch (err) {
    const newRetryCount = retryCount + 1;
    const maxRetries = task.max_retries || DEFAULT_MAX_RETRIES;

    if (newRetryCount >= maxRetries) {
      // Dead letter: mark as permanently failed
      stats.totalDeadLettered++;
      console.error(
        `💀 Task #${task.id} dead-lettered after ${newRetryCount} attempts: ${err.message}`
      );

      db.prepare(`
        UPDATE tasks SET status = 'blocked', retry_count = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newRetryCount, err.message, task.id);

      retryTimestamps.delete(task.id);

      if (task.created_by) {
        notificationService.notify({
          userId: task.created_by,
          type: 'system',
          title: 'Task permanently failed',
          body: `"${task.title}" — Failed after ${newRetryCount} attempts: ${err.message}`,
          link: '/tasks',
          data: { taskId: task.id, deadLettered: true },
        });
      }
    } else {
      // Mark for retry with backoff
      stats.totalFailed++;
      const backoffSec = getBackoffDelay(newRetryCount) / 1000;
      console.warn(
        `⚠️ Task #${task.id} failed (attempt ${newRetryCount}/${maxRetries}), ` +
        `retrying in ${backoffSec}s: ${err.message}`
      );

      db.prepare(`
        UPDATE tasks SET retry_count = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newRetryCount, err.message, task.id);

      if (task.created_by) {
        notificationService.notify({
          userId: task.created_by,
          type: 'system',
          title: 'Task failed — will retry',
          body: `"${task.title}" — Attempt ${newRetryCount}/${maxRetries}: ${err.message}`,
          link: '/tasks',
          data: { taskId: task.id, willRetry: true, retryIn: backoffSec },
        });
      }
    }

  } finally {
    activeExecutions--;
  }
}

/**
 * Promise with timeout
 */
function withTimeout(promise, ms, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(errorMessage)), ms);
      // Don't hold process open for the timer
      if (timer.unref) timer.unref();
    }),
  ]);
}

/**
 * Manually trigger a single tick (for admin use)
 */
async function triggerNow() {
  await tick();
  return getStats();
}

/**
 * Get loop status and stats
 */
function getStats() {
  return {
    running: intervalId !== null,
    activeExecutions,
    intervalMs: EXECUTION_INTERVAL,
    stats,
  };
}

module.exports = {
  start,
  stop,
  getStatus: getStats,
  tick,
  triggerNow,
};
