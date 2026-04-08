'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [recentNotifications, setRecentNotifications] = useState([]);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    Promise.all([
      api.getDashboard(),
      api.getNotifications({ limit: 5 }).catch(() => []),
    ]).then(([s, n]) => {
      setStats(s);
      setRecentNotifications(n);
    }).catch(console.error);
  }, [user]);

  if (!stats) return <p style={{ color: 'var(--text-muted)' }}>Loading dashboard...</p>;

  const StatCard = ({ icon, label, value, color }) => (
    <div className="card" style={{ flex: 1, minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</p>
        </div>
        <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      </div>
    </div>
  );

  const quickActions = [
    { icon: '📋', label: 'New Task', href: '/tasks' },
    { icon: '💬', label: 'Chat', href: '/chat' },
    { icon: '📚', label: 'Knowledge', href: '/knowledge' },
    { icon: '📧', label: 'Email', href: '/email' },
    { icon: '⚡', label: 'Workflows', href: '/workflows' },
    { icon: '📈', label: 'Analytics', href: '/analytics' },
  ];

  const typeIcons = {
    task_assigned: '📋', task_completed: '✅', task_comment: '💬',
    agent_response: '🤖', workflow_triggered: '⚡', mention: '@', system: 'ℹ️',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          Welcome back, {user.name} 👋
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatCard icon="🏢" label="Departments" value={stats.departments} />
        <StatCard icon="👥" label="Team Members" value={stats.users} />
        <StatCard icon="🤖" label="AI Agents" value={stats.agents} />
        <StatCard icon="📋" label="Active Tasks" value={stats.tasks.pending + stats.tasks.in_progress} />
        {stats.tasks.urgent > 0 && <StatCard icon="🔥" label="Urgent" value={stats.tasks.urgent} />}
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '10px', color: 'var(--text-muted)' }}>Quick Actions</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {quickActions.map(a => (
            <button key={a.href} onClick={() => router.push(a.href)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
              color: 'var(--text)', fontSize: '0.8rem', transition: 'border-color 0.15s',
            }}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Recent Tasks */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Recent Tasks</h3>
            <button onClick={() => router.push('/tasks')} style={{
              background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.8rem',
            }}>View all →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stats.recent_tasks.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No tasks yet. Create one to get started!</p>
            ) : (
              stats.recent_tasks.slice(0, 6).map(t => (
                <div key={t.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0.75rem', background: 'var(--surface-2)', borderRadius: 8
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t.department_icon} {t.department_name || 'Unassigned'} · {t.assignee_name || 'No assignee'}
                    </p>
                  </div>
                  <span className={`badge badge-${t.status}`}>{t.status.replace('_', ' ')}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Agent Status */}
          <div className="card">
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Agent Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem' }}>🟢 Active</span>
                <span style={{ fontWeight: 600 }}>{stats.agents_by_status.active}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem' }}>🟡 Paused</span>
                <span style={{ fontWeight: 600 }}>{stats.agents_by_status.paused}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem' }}>🔴 Offline</span>
                <span style={{ fontWeight: 600 }}>{stats.agents_by_status.offline}</span>
              </div>
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>Task Breakdown</h4>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span className="badge badge-pending">⏳ {stats.tasks.pending}</span>
                <span className="badge badge-in_progress">🔄 {stats.tasks.in_progress}</span>
                <span className="badge badge-completed">✅ {stats.tasks.completed}</span>
                {stats.tasks.urgent > 0 && <span className="badge badge-urgent">🔥 {stats.tasks.urgent}</span>}
              </div>
            </div>
          </div>

          {/* Recent Notifications */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Recent Activity</h3>
            </div>
            {recentNotifications.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No recent activity</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {recentNotifications.map(n => (
                  <div key={n.id} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    padding: '6px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: '0.9rem' }}>{typeIcons[n.type] || '📌'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: n.read ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.body}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
