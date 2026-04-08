const db = require('../config/db');

// Seed on load — use try/catch since PG may not have tables yet at module load time
try {
  const row = db.prepare('SELECT COUNT(*) as c FROM workflows').get();
  // For SQLite, .get() is sync. For PG, it returns a Promise — handle both.
  const seedWorkflows = (countResult) => {
    const count = countResult && (countResult.c !== undefined ? countResult.c : (countResult.count !== undefined ? countResult.count : 0));
    if (count === 0) {
      const defaults = [
        { name: 'Auto-assign urgent tasks', description: 'Notify manager on urgent task creation', trigger: 'task_created', conditions: JSON.stringify([{ field: 'priority', operator: 'equals', value: 'urgent' }]), actions: JSON.stringify([{ type: 'notify', target: 'department_manager', message: 'Urgent task created' }]), enabled: true, runs: 3, last_run: new Date(Date.now() - 3600000).toISOString() },
        { name: 'Escalate overdue tasks', description: 'Escalate tasks past due date', trigger: 'schedule_daily', conditions: JSON.stringify([{ field: 'due_date', operator: 'past_due' }]), actions: JSON.stringify([{ type: 'notify', target: 'admin', message: 'Task overdue' }, { type: 'update_task', field: 'status', value: 'blocked' }]), enabled: true, runs: 12, last_run: new Date(Date.now() - 86400000).toISOString() },
        { name: 'Welcome new team members', description: 'Welcome message on registration', trigger: 'user_registered', conditions: JSON.stringify([]), actions: JSON.stringify([{ type: 'send_message', channel: 'general', message: 'Welcome {{user.name}} to the team! 🎉' }]), enabled: true, runs: 1, last_run: new Date(Date.now() - 36000000).toISOString() },
      ];
      const insert = db.prepare('INSERT INTO workflows (name, description, "trigger", conditions, actions, enabled, runs, last_run) VALUES (@name, @description, @trigger, @conditions, @actions, @enabled, @runs, @last_run)');
      for (const wf of defaults) insert.run(wf);
      console.log('✅ Seeded default workflows');
    }
  };
  // Handle both sync (SQLite) and async (PG) .get() results
  if (row && typeof row.then === 'function') {
    row.then(seedWorkflows).catch(() => {});
  } else {
    seedWorkflows(row);
  }
} catch (e) { /* Table may not exist yet */ }

function safeJsonParse(val, fallback = []) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val; // PG JSONB returns objects directly
  try { return JSON.parse(val); } catch { return fallback; }
}

function rowToWorkflow(row) {
  if (!row) return null;
  return { ...row, conditions: safeJsonParse(row.conditions, []), actions: safeJsonParse(row.actions, []), enabled: !!row.enabled };
}

async function getWorkflows() {
  const rows = await db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all();
  return rows.map(rowToWorkflow);
}

async function createWorkflow(data, userId) {
  const result = await db.prepare('INSERT INTO workflows (name, description, "trigger", conditions, actions, enabled, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(data.name, data.description || '', data.trigger, JSON.stringify(data.conditions || []), JSON.stringify(data.actions || []), data.enabled !== false, userId || null);
  const row = await db.prepare('SELECT * FROM workflows WHERE id = ?').get(result.lastInsertRowid);
  return rowToWorkflow(row);
}

async function updateWorkflow(id, data) {
  const wf = await db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (!wf) return null;
  const updates = [];
  const params = [];
  if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
  if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
  if (data.trigger !== undefined) { updates.push('"trigger" = ?'); params.push(data.trigger); }
  if (data.conditions !== undefined) { updates.push('conditions = ?'); params.push(JSON.stringify(data.conditions)); }
  if (data.actions !== undefined) { updates.push('actions = ?'); params.push(JSON.stringify(data.actions)); }
  if (data.enabled !== undefined) { updates.push('enabled = ?'); params.push(data.enabled); }
  if (updates.length === 0) return rowToWorkflow(wf);
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  await db.prepare(`UPDATE workflows SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const row = await db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  return rowToWorkflow(row);
}

async function deleteWorkflow(id) { await db.prepare('DELETE FROM workflows WHERE id = ?').run(id); return true; }

async function toggleWorkflow(id) {
  await db.prepare('UPDATE workflows SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  const row = await db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  return rowToWorkflow(row);
}

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

async function executeActions(actions, context) {
  const results = [];
  for (const action of actions) {
    try {
      let message = action.message || '';
      message = message.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_, obj, field) => context[obj]?.[field] || `[${obj}.${field}]`);
      switch (action.type) {
        case 'notify': results.push({ type: 'notify', target: action.target, message, success: true }); break;
        case 'update_task':
          if (context.taskId) { await db.prepare(`UPDATE tasks SET ${action.field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(action.value, context.taskId); results.push({ type: 'update_task', field: action.field, value: action.value, success: true }); } break;
        case 'send_message': await db.prepare("INSERT INTO messages (channel, sender_type, sender_id, content) VALUES (?, 'agent', 0, ?)").run(action.channel || 'general', message); results.push({ type: 'send_message', channel: action.channel, success: true }); break;
        case 'create_task': await db.prepare("INSERT INTO tasks (title, description, priority, department_id, created_by) VALUES (?, ?, ?, ?, 1)").run(message, action.description || '', action.priority || 'medium', action.department_id || null); results.push({ type: 'create_task', success: true }); break;
        default: results.push({ type: action.type, success: false, error: 'Unknown action' });
      }
    } catch (err) { results.push({ type: action.type, success: false, error: err.message }); }
  }
  return results;
}

async function processTrigger(triggerName, context = {}) {
  const rows = await db.prepare('SELECT * FROM workflows WHERE enabled = true AND "trigger" = ?').all(triggerName);
  const matchedWorkflows = rows.map(rowToWorkflow);
  const results = [];
  for (const wf of matchedWorkflows) {
    if (evaluateConditions(wf.conditions, context)) {
      const actionResults = await executeActions(wf.actions, context);
      await db.prepare('UPDATE workflows SET runs = runs + 1, last_run = CURRENT_TIMESTAMP WHERE id = ?').run(wf.id);
      await db.prepare('INSERT INTO workflow_logs (workflow_id, "trigger", context, results) VALUES (?, ?, ?, ?)').run(wf.id, triggerName, JSON.stringify(context), JSON.stringify(actionResults));
      results.push({ workflowId: wf.id, workflowName: wf.name, trigger: triggerName, actions: actionResults });
    }
  }
  const logCountRow = await db.prepare('SELECT COUNT(*) as c FROM workflow_logs').get();
  const logCount = logCountRow ? (logCountRow.c || logCountRow.count || 0) : 0;
  if (logCount > 1000) await db.prepare('DELETE FROM workflow_logs WHERE id IN (SELECT id FROM workflow_logs ORDER BY created_at ASC LIMIT ?)').run(logCount - 1000);
  return results;
}

async function getExecutionLog(limit = 20) {
  const rows = await db.prepare('SELECT wl.*, w.name as workflow_name FROM workflow_logs wl LEFT JOIN workflows w ON wl.workflow_id = w.id ORDER BY wl.created_at DESC LIMIT ?').all(limit);
  return rows.map(row => ({ ...row, context: safeJsonParse(row.context, {}), results: safeJsonParse(row.results, []) }));
}

async function getWorkflowStats() {
  const totalRow = await db.prepare('SELECT COUNT(*) as c FROM workflows').get();
  const total = totalRow ? (totalRow.c || totalRow.count || 0) : 0;
  const enabledRow = await db.prepare('SELECT COUNT(*) as c FROM workflows WHERE enabled = true').get();
  const enabled = enabledRow ? (enabledRow.c || enabledRow.count || 0) : 0;
  const runsRow = await db.prepare('SELECT COALESCE(SUM(runs), 0) as s FROM workflows').get();
  const totalRuns = runsRow ? (runsRow.s || runsRow.sum || 0) : 0;
  return { total, enabled, disabled: total - enabled, totalRuns, recentExecutions: await getExecutionLog(5) };
}

module.exports = { getWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow, processTrigger, getExecutionLog, getWorkflowStats };
