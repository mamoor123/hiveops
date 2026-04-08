'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function DepartmentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedDept, setExpandedDept] = useState(null);
  const [deptDetail, setDeptDetail] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', icon: '🏢', color: '#6366f1' });

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    api.getDepartments().then(setDepartments).catch(console.error);
  }, [user]);

  const handleCreate = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    try {
      const dept = await api.createDepartment(form);
      setDepartments([...departments, { ...dept, member_count: 0, agent_count: 0, active_tasks: 0 }]);
      setShowForm(false);
      setForm({ name: '', description: '', icon: '🏢', color: '#6366f1' });
      toast.success('Department created');
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this department?')) return;
    await api.deleteDepartment(id);
    setDepartments(departments.filter(d => d.id !== id));
    toast.success('Department deleted');
  };

  const openDetail = async (id) => {
    if (expandedDept === id) { setExpandedDept(null); setDeptDetail(null); return; }
    setExpandedDept(id);
    try {
      const detail = await api.getDepartment(id);
      setDeptDetail(detail);
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Departments</h2>
        {user?.role === 'admin' && (
          <button className="btn" onClick={() => setShowForm(!showForm)}>+ New Department</button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name</label>
            <input placeholder="Engineering" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ flex: 2, minWidth: 300 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Description</label>
            <input placeholder="What this department does" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ width: 60 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Icon</label>
            <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} />
          </div>
          <button onClick={handleCreate} className="btn">Create</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {departments.map(d => (
          <div key={d.id}>
            <div className="card" style={{ borderLeft: `3px solid ${d.color}`, cursor: 'pointer' }}
              onClick={() => openDetail(d.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{d.icon} {d.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {expandedDept === d.id ? '▼' : '▶'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{d.description}</p>
                </div>
                {user?.role === 'admin' && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-muted)' }}>✕</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>👥 {d.member_count} members</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>🤖 {d.agent_count} agents</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📋 {d.active_tasks} tasks</span>
              </div>
            </div>

            {/* Expanded detail */}
            {expandedDept === d.id && deptDetail && (
              <div style={{ margin: '4px 0 4px 16px', padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                {/* Members */}
                {deptDetail.members?.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Members</h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {deptDetail.members.map(m => (
                        <span key={m.id} style={{
                          background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 6,
                          fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          👤 {m.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({m.role})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Agents */}
                {deptDetail.agents?.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Agents</h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {deptDetail.agents.map(a => (
                        <span key={a.id} style={{
                          background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 6,
                          fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          {a.status === 'active' ? '🟢' : '🟡'} {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Recent tasks */}
                {deptDetail.tasks?.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Tasks ({deptDetail.tasks.length})</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {deptDetail.tasks.slice(0, 5).map(t => (
                        <div key={t.id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 6, fontSize: '0.8rem',
                        }}>
                          <span>{t.title}</span>
                          <span className={`badge badge-${t.status}`} style={{ fontSize: '0.7rem' }}>{t.status.replace('_', ' ')}</span>
                        </div>
                      ))}
                      {deptDetail.tasks.length > 5 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 8px' }}>
                          +{deptDetail.tasks.length - 5} more tasks
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {(!deptDetail.members?.length && !deptDetail.agents?.length && !deptDetail.tasks?.length) && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                    Empty department — add members, agents, or tasks to get started
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
