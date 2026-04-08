'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';
import AgentEditModal from '../../components/AgentEditModal';

export default function AgentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [agents, setAgents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', department_id: '', system_prompt: '', model: 'gpt-4' });

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [a, d] = await Promise.all([api.getAgents(), api.getDepartments()]);
      setAgents(a);
      setDepartments(d);
    } catch (err) { console.error(err); }
  };

  const handleCreate = async () => {
    try {
      const agent = await api.createAgent(form);
      setShowForm(false);
      setForm({ name: '', role: '', department_id: '', system_prompt: '', model: 'gpt-4' });
      loadData();
      toast.success('Agent created');
    } catch (err) { toast.error(err.message); }
  };

  const toggleStatus = async (agent) => {
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    await api.updateAgent(agent.id, { status: newStatus });
    setAgents(agents.map(a => a.id === agent.id ? { ...a, status: newStatus } : a));
    toast.success(`${agent.name} ${newStatus === 'active' ? 'activated' : 'paused'}`);
  };

  const deleteAgent = async (id) => {
    if (!confirm('Delete this agent?')) return;
    await api.deleteAgent(id);
    setAgents(agents.filter(a => a.id !== id));
    toast.success('Agent deleted');
  };

  const statusIcon = (s) => s === 'active' ? '🟢' : s === 'paused' ? '🟡' : '🔴';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>AI Agents</h2>
        {user?.role === 'admin' && (
          <button className="btn" onClick={() => setShowForm(!showForm)}>+ New Agent</button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name *</label>
              <input placeholder="e.g. Marketing Bot" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Role *</label>
              <input placeholder="e.g. Content Writer" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} required />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Department *</label>
              <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} required>
                <option value="">Select...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>System Prompt</label>
            <textarea placeholder="Define the agent's behavior, capabilities, and personality..."
              value={form.system_prompt} onChange={e => setForm({ ...form, system_prompt: e.target.value })} rows={3} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={handleCreate} className="btn">Create Agent</button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {agents.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', gridColumn: '1 / -1' }}>
            <p style={{ fontSize: '2rem', marginBottom: '8px' }}>🤖</p>
            <p style={{ color: 'var(--text-muted)' }}>No agents configured yet.</p>
          </div>
        ) : (
          agents.map(a => (
            <div key={a.id} className="card" style={{ cursor: user?.role === 'admin' ? 'pointer' : 'default' }}
              onClick={() => user?.role === 'admin' && setEditingAgent(a)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{statusIcon(a.status)} {a.name}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.role}</p>
                </div>
                {user?.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleStatus(a)} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
                      {a.status === 'active' ? 'Pause' : 'Activate'}
                    </button>
                    <button onClick={() => deleteAgent(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {a.department_icon} {a.department_name} · Model: {a.model}
              </div>
              {a.system_prompt && (
                <div style={{
                  fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--surface-2)',
                  padding: '8px', borderRadius: 6, marginTop: '4px',
                  maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {a.system_prompt}
                </div>
              )}
              {user?.role === 'admin' && (
                <p style={{ fontSize: '0.7rem', color: '#6366f1', marginTop: '8px' }}>Click to edit →</p>
              )}
            </div>
          ))
        )}
      </div>

      {editingAgent && (
        <AgentEditModal
          agent={editingAgent}
          departments={departments}
          onClose={() => setEditingAgent(null)}
          onSaved={() => { loadData(); toast.success('Agent updated'); }}
        />
      )}
    </div>
  );
}
