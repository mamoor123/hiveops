'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function AgentEditModal({ agent, departments, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', role: '', department_id: '', system_prompt: '', model: 'gpt-4', status: 'active',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setForm({
        name: agent.name || '',
        role: agent.role || '',
        department_id: agent.department_id?.toString() || '',
        system_prompt: agent.system_prompt || '',
        model: agent.model || 'gpt-4',
        status: agent.status || 'active',
      });
    }
  }, [agent]);

  const handleSave = async () => {
    if (!form.name || !form.role) return;
    setSaving(true);
    try {
      await api.updateAgent(agent.id, {
        ...form,
        department_id: parseInt(form.department_id),
      });
      onSaved();
      onClose();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  if (!agent) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, width: 560, maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Edit Agent</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Role *</label>
            <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Department</label>
            <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
              {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Model</label>
            <select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}>
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="claude-3-opus">Claude 3 Opus</option>
              <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              <option value="llama-3">Llama 3</option>
              <option value="mistral">Mistral</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="active">🟢 Active</option>
              <option value="paused">🟡 Paused</option>
              <option value="offline">🔴 Offline</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>System Prompt</label>
          <textarea
            value={form.system_prompt}
            onChange={e => setForm({ ...form, system_prompt: e.target.value })}
            rows={6}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
            placeholder="Define the agent's behavior, personality, and capabilities..."
          />
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {form.system_prompt.length} characters
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleSave} disabled={saving} className="btn">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}
