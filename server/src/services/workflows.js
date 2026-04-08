/**
 * Workflow Engine (SQLite-backed)
 *
 * Automates task assignment, escalation, and notifications
 * based on configurable triggers and rules.
 */

const db = require('../config/db');

/**
 * Seed default workflows if none exist
 */
function seedWorkflows() {
  const count = db.prepare('SELECT COUNT(*) as c FROM workflows').get().c;
  if (count > 0) return;

  const defaults = [
    {
      name: 'Auto-assign urgent tasks to department manager',
      description: 'When a task is created with urgent priority, notify the department manager',
      trigger: 'task_created',
      conditions: JSON.stringify([{ field: 'priority', operator: 'equals', value: 'urgent' }]),
      actions: JSON.stringify([{ type: 'notify', target: 'department_manager', message: 'Urgent task created: {{task.title}}' }]),
      enabled: 1, runs: 3, last_run: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      name: 'Escalate overdue tasks',
      description: 'When a task is past its due date, escalate to admin and mark as blocked',
      trigger: 'schedule_daily',
      conditions: JSON.stringify([{ field: 'due_date', operator: 'past_due' }]),
      actions: JSON.stringify([
        { type: 'notify', target: 'admin', message: 'Task overdue: {{task.title}}' },
        { type: 'update_task', field: 'status', value: 'blocked' },
      ]),
      enabled: 1, runs: 12, last_run: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      name: 'Auto-execute marketing agent tasks',
      description: 'Automatically execute tasks assigned to marketing agent',
      trigger: 'task_assigned_to_agent',
      conditions: JSON.stringify([{ field: 'department', operator: 'equals', value: 'Marketing' }]),
      actions: JSON.stringify([{ type: 'execute_agent', delay: '5m' }]),
      enabled: 0, runs: 0, last_run: null,
    },
    {
      name: 'Welcome new team members',
      description: 'Send welcome message when a new user registers',
      trigger: 'user_registered',
      conditions: JSON.stringify([]),
      actions: JSON.stringify([
        { type: 'send_message', channel: 'general', message: 'Welcome {{user.name}} to the team! 🎉' },
      ]),
      enabled: 1, runs: 1, last_run: new Date(Date.now() - 36000000).toISOString(),
    },
  ];

  const insert = db.prepare(`
    INSERT INTO workflows (name, description, trigger, conditions, actions, enabled, runs, last_run)
    VALUES (@name, @description, @trigger, @conditions, @actions, @enabled, @runs, @last_run)
  `);

  for (const wf of defaults) {
    insert.run(wf);
  }
  console.log('✅ Seeded default workflows');
}

seedWorkflows();

function rowToWorkflow(row) {
  if (!row) return null;
  return {
    ...row,
    conditions: JSON.parse(row.conditions || '[]'),
    actions: JSON.parse(row.actions || '[]'),
    enabled: !!row.enabled,
  };
}

function getWorkflows() {
  return db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all().map(rowToWorkflow);
}

function createWorkflow(data, userId) {
  const result = db.prepare(`
    INSERT INTO workflows (name, description, trigger, conditions, actions, enabled, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.description || '',
    data.trigger,
    JSON.stringify(data.conditions || []),
    JSON.stringify(data.actions || []),
    data.enabled !== false ? 1 : 0,
    userId || null,
  );
  return rowToWorkflow(db.prepare('SELECT * FROM workflows WHERE id = ?').get(result.lastInsertRowid));
}

function updateWorkflow(id, data) {
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (!wf) return null;

  const updates = [];
  const params = [];

  if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
  if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
  if (data.trigger !== undefined) { updates.push('trigger = ?'); params.push(data.trigger); }
  if (data.conditions !== undefined) { updates.push('conditions = ?'); params.push(JSON.stringify(data.conditions)); }
  if (data.actions !== undefined) { updates.push('actions = ?'); params.push(JSON.stringify(data.actions)); }
  if (data.enabled !== undefined) { updates.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }

  if (updates.length === 0) return rowToWorkflow(wf);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  db.prepare(`UPDATE workflows SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return rowToWorkflow(db.prepare('SELECT * FROM workflows WHERE id = ?').get(id));
}

function deleteWorkflow(id) {
  db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
  return true;
}

function toggleWorkflow(id) {
  db.prepare('UPDATE workflows SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  return rowToWorkflow(db.prepare('SELECT * FROM workflows WHERE id = ?').get(id));
}

/**
 * Evaluate conditions against context
 */
function evaluateConditions(conditions, context) {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every(cond => {
    const value = context[cond.field];
    switch (cond.operator) {
      case 'equals': return value === cond.value;
      case 'not_equals': return value !== cond.value;
      case 'contains': return String(value).includes(cond.value);
      case 'greater_than': return Number(value) > Number(cond.value);
      case 'less_than': return Number(value) < Number(cond.value);
      case 'past_due': return value && new Date(value) < new Date();
      case 'exists': return value !== null && value !== undefined;
      default: return false;
    }
  });
}

/**
 * Execute actions
 */
function executeActions(actions, context) {
  const results = [];

  for (const action of actions) {
    try {
      let message = action.message || '';
      message = message.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_, obj, field) => {
        return context[obj]?.[field] || `[${obj}.${field}]`;
      });

      switch (action.type) {
        case 'notify':
          results.push({ type: 'notify', target: action.target, message, success: true });
          break;
        case 'update_task':
          if (context.taskId) {
            db.prepare(`UPDATE tasks SET ${action.field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(action.value, context.taskId);
            results.push({ type: 'update_task', field: action.field, value: action.value, success: true });
          }
          break;
        case 'send_message':
          db.prepare("INSERT INTO messages (channel, sender_type, sender_id, content) VALUES (?, 'agent', 0, ?)")
            .run(action.channel || 'general', message);
          results.push({ type: 'send_message', channel: action.channel, success: true });
          break;
        case 'create_task':
          db.prepare("INSERT INTO tasks (title, description, priority, department_id, created_by) VALUES (?, ?, ?, ?, 1)")
            .run(message, action.description || '', action.priority || 'medium', action.department_id || null);
          results.push({ type: 'create_task', success: true });
          break;
        default:
          results.push({ type: action.type, success: false, error: 'Unknown action' });
      }
    } catch (err) {
      results.push({ type: action.type, success: false, error: err.message });
    }
  }

  return results;
}

/**
 * Process a trigger event
 */
function processTrigger(triggerName, context = {}) {
  const matchedWorkflows = db.prepare(
    'SELECT * FROM workflows WHERE enabled = 1 AND trigger = ?'
  ).all(triggerName).map(rowToWorkflow);

  const results = [];

  for (const wf of matchedWorkflows) {
    if (evaluateConditions(wf.conditions, context)) {
      const actionResults = executeActions(wf.actions, context);

      // Increment run count and update last_run
      db.prepare('UPDATE workflows SET runs = runs + 1, last_run = CURRENT_TIMESTAMP WHERE id = ?').run(wf.id);

      // Log execution
      db.prepare(`
        INSERT INTO workflow_logs (workflow_id, trigger, context, results)
        VALUES (?, ?, ?, ?)
      `).run(wf.id, triggerName, JSON.stringify(context), JSON.stringify(actionResults));

      results.push({
        workflowId: wf.id,
        workflowName: wf.name,
        trigger: triggerName,
        actions: actionResults,
      });
    }
  }

  // Keep log table manageable (max 1000 entries)
  const logCount = db.prepare('SELECT COUNT(*) as c FROM workflow_logs').get().c;
  if (logCount > 1000) {
    db.prepare(`
      DELETE FROM workflow_logs WHERE id IN (
        SELECT id FROM workflow_logs ORDER BY created_at ASC LIMIT ?
      )
    `).run(logCount - 1000);
  }

  return results;
}

function getExecutionLog(limit = 20) {
  return db.prepare(`
    SELECT wl.*, w.name as workflow_name
    FROM workflow_logs wl
    LEFT JOIN workflows w ON wl.workflow_id = w.id
    ORDER BY wl.created_at DESC
    LIMIT ?
  `).all(limit).map(row => ({
    ...row,
    context: JSON.parse(row.context || '{}'),
    results: JSON.parse(row.results || '[]'),
  }));
}

function getWorkflowStats() {
  const total = db.prepare('SELECT COUNT(*) as c FROM workflows').get().c;
  const enabled = db.prepare('SELECT COUNT(*) as c FROM workflows WHERE enabled = 1').get().c;
  const totalRuns = db.prepare('SELECT COALESCE(SUM(runs), 0) as s FROM workflows').get().s;

  return {
    total,
    enabled,
    disabled: total - enabled,
    totalRuns,
    recentExecutions: getExecutionLog(5),
  };
}

module.exports = {
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  toggleWorkflow,
  processTrigger,
  getExecutionLog,
  getWorkflowStats,
};
