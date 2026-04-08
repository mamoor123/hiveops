/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState({ labels: [], created: [], completed: [] });

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    Promise.all([
      api.getDashboard(),
      api.getDepartments(),
      api.getTasks(),
      api.getActivity(7),
    ]).then(([d, dep, t, act]) => {
      setDashboard(d);
      setDepartments(dep);
      setTasks(t);
      setActivity(act);
    }).catch(console.error);
  }, [user]);

  if (!dashboard) return <p style={{ color: 'var(--text-muted)' }}>Loading analytics...</p>;

  // Task completion rate
  const total = dashboard.tasks.total || 1;
  const completionRate = Math.round((dashboard.tasks.completed / total) * 100);

  // Tasks by status for bar chart
  const statusData = [
    { label: 'Pending', count: dashboard.tasks.pending, color: '#94a3b8' },
    { label: 'In Progress', count: dashboard.tasks.in_progress, color: '#60a5fa' },
    { label: 'Review', count: tasks.filter(t => t.status === 'review').length, color: '#a78bfa' },
    { label: 'Completed', count: dashboard.tasks.completed, color: '#4ade80' },
    { label: 'Blocked', count: tasks.filter(t => t.status === 'blocked').length, color: '#f87171' },
  ];

  // Tasks by priority
  const priorityData = [
    { label: 'Urgent', count: tasks.filter(t => t.priority === 'urgent').length, color: '#f87171' },
    { label: 'High', count: tasks.filter(t => t.priority === 'high').length, color: '#fb923c' },
    { label: 'Medium', count: tasks.filter(t => t.priority === 'medium').length, color: '#94a3b8' },
    { label: 'Low', count: tasks.filter(t => t.priority === 'low').length, color: '#4ade80' },
  ];

  // Tasks per department
  const deptTasks = departments.map(d => ({
    name: d.name,
    icon: d.icon,
    tasks: tasks.filter(t => t.department_id === d.id).length,
    completed: tasks.filter(t => t.department_id === d.id && t.status === 'completed').length,
    color: d.color,
  })).sort((a, b) => b.tasks - a.tasks);

  const maxDeptTasks = Math.max(...deptTasks.map(d => d.tasks), 1);

  // Activity (real data from API)
  const activityDays = activity.labels;
  const activityData = activity.created;
  const maxActivity = Math.max(...activityData, 1);

  // Donut chart component
  const DonutChart = ({ value, max, color, size = 120, label }) => {
    const pct = max > 0 ? value / max : 0;
    const r = (size - 12) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - pct);

    return (
      <div style={{ textAlign: 'center' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e1b4b" strokeWidth="10" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{ marginTop: '-75px', position: 'relative' }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}%</p>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</p>
        </div>
      </div>
    );
  };

  // Bar chart component
  const BarChart = ({ data, maxVal }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 80, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>{d.label}</span>
          <div style={{ flex: 1, height: 24, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: d.color, borderRadius: 4,
              width: `${maxVal > 0 ? (d.count / maxVal) * 100 : 0}%`,
              transition: 'width 0.5s ease', display: 'flex', alignItems: 'center', paddingLeft: 8
            }}>
              {d.count > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>{d.count}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Mini area chart for activity
  const AreaChart = ({ data, labels }) => {
    const w = 500, h = 120, pad = 30;
    const max = Math.max(...data, 1);
    const stepX = (w - pad * 2) / (data.length - 1);

    const points = data.map((v, i) => ({
      x: pad + i * stepX,
      y: h - pad - (v / max) * (h - pad * 2),
    }));

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const area = `${line} L ${points[points.length-1].x} ${h - pad} L ${pad} ${h - pad} Z`;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: w }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 1, 2, 3].map(i => (
          <line key={i} x1={pad} y1={pad + i * ((h - pad * 2) / 3)} x2={w - pad} y2={pad + i * ((h - pad * 2) / 3)}
            stroke="#1e1b4b" strokeWidth="1" />
        ))}
        {/* Area fill */}
        <path d={area} fill="url(#areaGrad)" />
        {/* Line */}
        <path d={line} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#6366f1" />
            <text x={p.x} y={h - 8} textAnchor="middle" fontSize="10" fill="#8888a0">{labels[i]}</text>
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fill="#e4e4ed" fontWeight="600">{data[i]}</text>
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>📈 Analytics</h2>

      {/* Top row: Donut charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <DonutChart value={completionRate} max={100} color="#4ade80" label="Completion" />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <DonutChart value={Math.round((dashboard.agents_by_status.active / Math.max(dashboard.agents, 1)) * 100)} max={100} color="#60a5fa" label="Agents Active" />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <DonutChart value={dashboard.tasks.urgent} max={Math.max(total, 1)} color="#f87171" label="Urgent Tasks" />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <DonutChart value={dashboard.departments} max={10} color="#a78bfa" label="Departments" />
        </div>
      </div>

      {/* Middle row: Bar charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Tasks by Status</h3>
          <BarChart data={statusData} maxVal={Math.max(...statusData.map(d => d.count), 1)} />
        </div>
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Tasks by Priority</h3>
          <BarChart data={priorityData} maxVal={Math.max(...priorityData.map(d => d.count), 1)} />
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Activity chart */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Weekly Activity</h3>
          <AreaChart data={activityData} labels={activityDays} />
        </div>

        {/* Department breakdown */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Tasks by Department</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {deptTasks.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem' }}>{d.icon}</span>
                <span style={{ width: 100, fontSize: '0.8rem' }}>{d.name}</span>
                <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: d.color, borderRadius: 4,
                    width: `${(d.tasks / maxDeptTasks) * 100}%`,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, width: 40, textAlign: 'right' }}>
                  {d.tasks}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
