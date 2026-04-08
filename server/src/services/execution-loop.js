/**
 * Agent Execution Loop
 * 
 * Periodically scans for tasks assigned to agents and auto-executes them.
 * Runs as a background service with configurable interval.
 */

const db = require('../config/db');
const { executeTask } = require('./ai-engine');
const notificationService = require('./notifications');

let running = false;
let intervalId = null;
const EXECUTION_INTERVAL = 30 * 1000; // Check every 30 seconds
const MAX_CONCURRENT = 3;
let activeExecutions = 0;

/**
 * Start the execution loop
 */
function start() {
  if (intervalId) return;
  console.log('🤖 Agent execution loop started');
  tick(); // Run immediately
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
 * Single tick: find and execute pending agent tasks
 */
async function tick() {
  if (running || activeExecutions >= MAX_CONCURRENT) return;
  running = true;

  try {
    // Find tasks assigned to agents that are pending
    const tasks = db.prepare(`
      SELECT t.id, t.title, t.assigned_agent_id, t.created_by,
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

    for (const task of tasks) {
      if (activeExecutions >= MAX_CONCURRENT) break;
      executeTaskAsync(task);
    }
  } catch (err) {
    console.error('Execution loop error:', err.message);
  } finally {
    running = false;
  }
}

/**
 * Execute a task asynchronously
 */
async function executeTaskAsync(task) {
  activeExecutions++;
  console.log(`🤖 Auto-executing task #${task.id}: "${task.title}" with agent ${task.agent_name}`);

  try {
    const result = await executeTask(task.id);

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
    console.error(`Failed to execute task #${task.id}:`, err.message);

    // Mark as blocked on failure
    db.prepare("UPDATE tasks SET status = 'blocked', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);

    if (task.created_by) {
      notificationService.notify({
        userId: task.created_by,
        type: 'system',
        title: 'Task execution failed',
        body: `"${task.title}" — ${err.message}`,
        link: '/tasks',
        data: { taskId: task.id },
      });
    }
  } finally {
    activeExecutions--;
  }
}

/**
 * Get loop status
 */
function getStatus() {
  return {
    running: intervalId !== null,
    activeExecutions,
    intervalMs: EXECUTION_INTERVAL,
  };
}

module.exports = { start, stop, getStatus, tick };
