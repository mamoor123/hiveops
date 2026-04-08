'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';
import TaskDetailModal from '../../components/TaskDetailModal';

export default function TasksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState({ status: '', priority: '' });
  const [selectedTask, setSelectedTask] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', department_id: '',
    assigned_to: '', assigned_agent_id: '', due_date: ''
  });

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadData();
  }, [user, filter]);

  const loadData = async () => {
    try {
      const params = {};
      if (filter.status) params.status = filter.status;
      if (filter.priority) params.priority = filter.priority;
      const [t, d, a, u] = await Promise.all([
        api.getTasks(params),
        api.getDepartments(),
        api.getAgents(),
        api.getUsers()
      ]);
      setTasks(t);
      setDepartments(d);
      setAgents(a);
      setUsers(u);
    } catch (err) { console.error(err); }
  };

  const handleCreate = async () => {
    try {
      const data = { ...form };
      if (!data.department_id) delete data.department_id;
      if (!data.assigned_to) delete data.assigned_to;
      if (!data.assigned_agent_id) delete data.assigned_agent_id;
      if (!data.due_date) delete data.due_date;
      await api.createTask(data);
      setShowForm(false);
      setForm({ title: '', description: '', priority: 'medium', department_id: '', assigned_to: '', assigned_agent_id: '', due_date: '' });
      loadData();
      toast.success('Task created');
    } catch (err) { toast.error(err.message); }
  };

  const updateStatus = async (id, status) => {
    await api.updateTask(id, { status });
    loadData();
    toast.success(`Task marked as ${status.replace('_', ' ')}`);
  };

  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return;
    await api.deleteTask(id);
    setTasks(tasks.filter(t => t.id !== id));
    toast.success('Task deleted');
  };

  const executeTask = async (id) => {
    try {
      await api.executeTask(id);
      loadData();
      toast.success('Task executed — check comments for agent response');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Tasks</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} style={{ width: 'auto' }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
          </select>
          <select value={filter.priority} onChange={e => setFilter({ ...filter, priority: e.target.value })} style={{ width: 'auto' }}>
            <option value="">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button className="btn" onClick={() => setShowForm(!showForm)}>+ New Task</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Title *</label>
              <input placeholder="What needs to be done" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Department</label>
              <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Description</label>
            <textarea placeholder="Details about the task" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Assign To</label>
              <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>AI Agent</label>
              <select value={form.assigned_agent_id} onChange={e => setForm({ ...form, assigned_agent_id: e.target.value })}>
                <option value="">No agent</option>
                {agents.map(a => <option key={a.id} value={a.id}>🤖 {a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button type="button" onClick={handleCreate} className="btn">Create Task</button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tasks.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</p>
            <p style={{ color: 'var(--text-muted)' }}>No tasks yet. Create one to get started!</p>
          </div>
        ) : (
          tasks.map(t => (
            <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={(e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') setSelectedTask(t.id); }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t.title}</h4>
                  <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                  <span className={`badge badge-${t.status}`}>{t.status.replace('_', ' ')}</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t.department_icon} {t.department_name || 'No dept'} · 👤 {t.assignee_name || 'Unassigned'}
                  {t.agent_name && ` · 🤖 ${t.agent_name}`}
                  {t.due_date && ` · 📅 ${new Date(t.due_date).toLocaleDateString()}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                {t.agent_name && t.status !== 'completed' && (
                  <button onClick={() => executeTask(t.id)} className="btn" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                    ▶ Execute
                  </button>
                )}
                {t.status !== 'completed' && (
                  <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                    style={{ width: 'auto', fontSize: '0.8rem', padding: '4px 8px' }}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="completed">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                )}
                <button onClick={() => deleteTask(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedTask && (
        <TaskDetailModal
          taskId={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}
