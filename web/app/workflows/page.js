'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function WorkflowsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [workflows, setWorkflows] = useState([]);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', trigger: 'task_created',
    conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }],
    actions: [{ type: 'notify', target: 'admin', message: 'Notification: {{task.title}}' }],
  });

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    const [w, s, l] = await Promise.all([
      api.getWorkflows(),
      api.getWorkflowStats(),
      api.getWorkflowLog(10),
    ]);
    setWorkflows(w);
    setStats(s);
    setLog(l);
  };

  const handleToggle = async (id) => {
    await api.toggleWorkflow(id);
    loadData();
    toast.success('Workflow toggled');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this workflow?')) return;
    await api.deleteWorkflow(id);
    loadData();
    toast.success('Workflow deleted');
  };

  const handleCreate = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    await api.createWorkflow(form);
    setShowForm(false);
    setForm({
      name: '', description: '', trigger: 'task_created',
      conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }],
      actions: [{ type: 'notify', target: 'admin', message: '' }],
    });
    loadData();
    toast.success('Workflow created');
  };

  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { field: 'priority', operator: 'equals', value: '' }] });
  };

  const addAction = () => {
    setForm({ ...form, actions: [...form.actions, { type: 'notify', target: 'admin', message: '' }] });
  };

  const triggerLabels = {
    task_created: '📋 Task Created',
    task_assigned_to_agent: '🤖 Task → Agent',
    task_completed: '✅ Task Completed',
    task_overdue: '⏰ Task Overdue',
    user_registered: '👤 User Registered',
    email_received: '📧 Email Received',
    schedule_daily: '📅 Daily Schedule',
  };

  const actionLabels = {
    notify: '🔔 Notify',
    update_task: '📝 Update Task',
    send_message: '💬 Send Message',
    create_task: '📋 Create Task',
    execute_agent: '🤖 Execute Agent',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>⚡ Workflows</h2>
        {user?.role === 'admin' && (
          <button className="btn" onClick={() => setShowForm(!showForm)}>+ New Workflow</button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ flex: 1 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Workflows</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total || 0}</p>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ade80' }}>{stats.enabled || 0}</p>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Runs</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalRuns || 0}</p>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>New Workflow</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name *</label>
              <input placeholder="Workflow name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Trigger *</label>
              <select value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })}>
                {Object.entries(triggerLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Description</label>
            <input placeholder="What does this workflow do?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Conditions */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Conditions</label>
              <button onClick={addCondition} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>+ Add</button>
            </div>
            {form.conditions.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                <input placeholder="Field" value={c.field} onChange={e => {
                  const conditions = [...form.conditions]; conditions[i].field = e.target.value;
                  setForm({ ...form, conditions });
                }} style={{ flex: 1 }} />
                <select value={c.operator} onChange={e => {
                  const conditions = [...form.conditions]; conditions[i].operator = e.target.value;
                  setForm({ ...form, conditions });
                }} style={{ width: 'auto' }}>
                  <option value="equals">equals</option>
                  <option value="not_equals">not equals</option>
                  <option value="contains">contains</option>
                  <option value="past_due">past due</option>
                  <option value="exists">exists</option>
                </select>
                <input placeholder="Value" value={c.value} onChange={e => {
                  const conditions = [...form.conditions]; conditions[i].value = e.target.value;
                  setForm({ ...form, conditions });
                }} style={{ flex: 1 }} />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actions</label>
              <button onClick={addAction} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>+ Add</button>
            </div>
            {form.actions.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                <select value={a.type} onChange={e => {
                  const actions = [...form.actions]; actions[i].type = e.target.value;
                  setForm({ ...form, actions });
                }} style={{ width: 'auto' }}>
                  {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input placeholder="Target" value={a.target || ''} onChange={e => {
                  const actions = [...form.actions]; actions[i].target = e.target.value;
                  setForm({ ...form, actions });
                }} style={{ flex: 1 }} />
                <input placeholder="Message template" value={a.message || ''} onChange={e => {
                  const actions = [...form.actions]; actions[i].message = e.target.value;
                  setForm({ ...form, actions });
                }} style={{ flex: 2 }} />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCreate} className="btn">Create Workflow</button>
            <button onClick={() => setShowForm(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Workflows List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '2rem' }}>
        {workflows.map(wf => (
          <div key={wf.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: wf.enabled ? '#4ade80' : '#6b7280', display: 'inline-block'
                }} />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{wf.name}</h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {triggerLabels[wf.trigger] || wf.trigger}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {wf.description} · {wf.runs} runs · {wf.conditions.length} conditions · {wf.actions.length} actions
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => handleToggle(wf.id)} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                {wf.enabled ? '⏸ Pause' : '▶ Enable'}
              </button>
              {user?.role === 'admin' && (
                <button onClick={() => handleDelete(wf.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Execution Log */}
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>📜 Recent Executions</h3>
      <div className="card">
        {log.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No workflow executions yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {log.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px', background: 'var(--surface-2)', borderRadius: 6
              }}>
                <div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>{entry.workflowName}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Trigger: {entry.trigger} · {entry.actions.filter(a => a.success).length}/{entry.actions.length} actions succeeded
                  </p>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
