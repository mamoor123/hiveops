'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({ name: '', email: '', department_id: '' });
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm: '' });
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);

  // Admin state
  const [sysStatus, setSysStatus] = useState(null);
  const [llmTest, setLlmTest] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    name: '', description: '', type: 'daily', time: '09:00',
    intervalMinutes: 60, agent_id: '', department_id: '', priority: 'medium',
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    setProfile({ name: user.name, email: user.email, department_id: user.department_id || '' });
    api.getDepartments().then(setDepartments).catch(() => {});
    if (isAdmin) {
      api.getUsers().then(setUsers).catch(() => {});
      api.getSystemStatus().then(setSysStatus).catch(() => {});
      api.getSchedules().then(setSchedules).catch(() => {});
    }
  }, [user]);

  const saveProfile = async () => {
    if (!profile.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.updateProfile({ name: profile.name, department_id: profile.department_id || null });
      toast.success('Profile updated');
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  const changePassword = async () => {
    if (!password.current_password || !password.new_password) { toast.error('All fields required'); return; }
    if (password.new_password.length < 8) { toast.error('Min 8 characters'); return; }
    if (password.new_password !== password.confirm) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      await api.changePassword({ current_password: password.current_password, new_password: password.new_password });
      setPassword({ current_password: '', new_password: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  const updateRole = async (userId, role) => {
    try {
      await api.updateUserRole(userId, role);
      setUsers(users.map(u => u.id === userId ? { ...u, role } : u));
      toast.success('Role updated');
    } catch (err) { toast.error(err.message); }
  };

  const testLLMConnection = async () => {
    setLlmTest(null);
    try {
      const result = await api.testLLM();
      setLlmTest(result);
      if (result.success) toast.success('LLM connection OK');
      else toast.error(result.message);
    } catch (err) {
      setLlmTest({ success: false, message: err.message });
      toast.error('Connection test failed');
    }
  };

  const toggleExecLoop = async () => {
    try {
      const status = await api.toggleExecutionLoop();
      setSysStatus(prev => ({ ...prev, executionLoop: status }));
      toast.success(`Execution loop ${status.running ? 'started' : 'stopped'}`);
    } catch (err) { toast.error(err.message); }
  };

  const runExecLoop = async () => {
    try {
      await api.runExecutionLoop();
      toast.success('Execution cycle triggered');
    } catch (err) { toast.error(err.message); }
  };

  const createSchedule = async () => {
    if (!scheduleForm.name) { toast.error('Name required'); return; }
    try {
      const s = await api.createSchedule(scheduleForm);
      setSchedules([...schedules, s]);
      setShowScheduleForm(false);
      setScheduleForm({ name: '', description: '', type: 'daily', time: '09:00', intervalMinutes: 60, agent_id: '', department_id: '', priority: 'medium' });
      toast.success('Schedule created');
    } catch (err) { toast.error(err.message); }
  };

  const toggleScheduleItem = async (id) => {
    try {
      const updated = await api.toggleSchedule(id);
      setSchedules(schedules.map(s => s.id === id ? updated : s));
      toast.success(`Schedule ${updated.enabled ? 'enabled' : 'paused'}`);
    } catch (err) { toast.error(err.message); }
  };

  const deleteScheduleItem = async (id) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await api.deleteSchedule(id);
      setSchedules(schedules.filter(s => s.id !== id));
      toast.success('Schedule deleted');
    } catch (err) { toast.error(err.message); }
  };

  const tabs = [
    { id: 'profile', label: '👤 Profile' },
    { id: 'security', label: '🔒 Security' },
    ...(isAdmin ? [
      { id: 'team', label: '👥 Team' },
      { id: 'system', label: '🖥️ System' },
      { id: 'scheduler', label: '⏰ Scheduler' },
    ] : []),
    { id: 'about', label: 'ℹ️ About' },
  ];

  const formatUptime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatMemory = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>⚙️ Settings</h2>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {/* Tabs */}
        <div style={{ width: 180, flexShrink: 0 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: activeTab === tab.id ? '#1e1b4b' : 'transparent',
              border: 'none', borderRadius: 8, padding: '8px 12px',
              color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.85rem', marginBottom: 4,
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {activeTab === 'profile' && (
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Profile</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 400 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name</label>
                  <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Email</label>
                  <input value={profile.email} disabled style={{ opacity: 0.6 }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Department</label>
                  <select value={profile.department_id} onChange={e => setProfile({ ...profile, department_id: e.target.value })}>
                    <option value="">No department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
                  </select>
                </div>
                <button onClick={saveProfile} disabled={saving} className="btn" style={{ alignSelf: 'flex-start' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Change Password</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 400 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Current Password</label>
                  <input type="password" value={password.current_password} onChange={e => setPassword({ ...password, current_password: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>New Password</label>
                  <input type="password" value={password.new_password} onChange={e => setPassword({ ...password, new_password: e.target.value })} />
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Min 8 characters</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Confirm</label>
                  <input type="password" value={password.confirm} onChange={e => setPassword({ ...password, confirm: e.target.value })} />
                </div>
                <button onClick={changePassword} disabled={saving} className="btn" style={{ alignSelf: 'flex-start' }}>
                  {saving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'team' && isAdmin && (
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Team Members</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {users.map(u => (
                  <div key={u.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8,
                  }}>
                    <div>
                      <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{u.name}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</p>
                    </div>
                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                      style={{ width: 'auto', fontSize: '0.8rem' }}>
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'system' && isAdmin && sysStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* LLM Config */}
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>🤖 LLM Configuration</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status</span>
                    <span style={{ color: sysStatus.llm.configured ? '#4ade80' : '#f59e0b' }}>
                      {sysStatus.llm.configured ? '🟢 Connected' : '🟡 Simulated (no API key)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Endpoint</span>
                    <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sysStatus.llm.url}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Model</span>
                    <span>{sysStatus.llm.model}</span>
                  </div>
                </div>
                <button onClick={testLLMConnection} className="btn" style={{ fontSize: '0.8rem' }}>
                  🔌 Test Connection
                </button>
                {llmTest && (
                  <div style={{
                    marginTop: '8px', padding: '8px', borderRadius: 6, fontSize: '0.8rem',
                    background: llmTest.success ? '#052e16' : '#450a0a',
                    color: llmTest.success ? '#4ade80' : '#f87171',
                  }}>
                    {llmTest.success ? '✅ ' : '❌ '}{llmTest.message}
                    {llmTest.response && <p style={{ marginTop: 4, opacity: 0.8 }}>{llmTest.response}</p>}
                  </div>
                )}
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  To connect a real LLM, set LLM_API_KEY, LLM_API_URL, and DEFAULT_MODEL in your .env file.
                </p>
              </div>

              {/* Server Status */}
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>🖥️ Server Status</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Uptime</span>
                    <span>{formatUptime(sysStatus.server.uptime)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Node.js</span>
                    <span>{sysStatus.server.nodeVersion}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Memory (RSS)</span>
                    <span>{formatMemory(sysStatus.server.memoryUsage.rss)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Heap Used</span>
                    <span>{formatMemory(sysStatus.server.memoryUsage.heapUsed)}</span>
                  </div>
                </div>
              </div>

              {/* Execution Loop */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>⚡ Auto-Execution Loop</h3>
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
                    background: sysStatus.executionLoop.running ? '#052e16' : '#450a0a',
                    color: sysStatus.executionLoop.running ? '#4ade80' : '#f87171',
                  }}>
                    {sysStatus.executionLoop.running ? 'RUNNING' : 'STOPPED'}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Automatically executes tasks assigned to active agents. Checks every 30 seconds, max 3 concurrent executions.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={toggleExecLoop} className={sysStatus.executionLoop.running ? 'btn btn-danger' : 'btn'}>
                    {sysStatus.executionLoop.running ? '⏹ Stop' : '▶ Start'} Loop
                  </button>
                  <button onClick={runExecLoop} className="btn btn-ghost">
                    ⚡ Run Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scheduler' && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>⏰ Scheduled Tasks</h3>
                <button onClick={() => setShowScheduleForm(!showScheduleForm)} className="btn" style={{ fontSize: '0.8rem' }}>
                  + New Schedule
                </button>
              </div>

              {showScheduleForm && (
                <div className="card">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name *</label>
                      <input placeholder="Daily report" value={scheduleForm.name} onChange={e => setScheduleForm({ ...scheduleForm, name: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Schedule Type</label>
                      <select value={scheduleForm.type} onChange={e => setScheduleForm({ ...scheduleForm, type: e.target.value })}>
                        <option value="daily">Daily (at specific time)</option>
                        <option value="weekly">Weekly (day + time)</option>
                        <option value="interval">Every N minutes</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    {scheduleForm.type !== 'interval' && (
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Time</label>
                        <input type="time" value={scheduleForm.time} onChange={e => setScheduleForm({ ...scheduleForm, time: e.target.value })} />
                      </div>
                    )}
                    {scheduleForm.type === 'interval' && (
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Interval (minutes)</label>
                        <input type="number" value={scheduleForm.intervalMinutes} onChange={e => setScheduleForm({ ...scheduleForm, intervalMinutes: parseInt(e.target.value) || 60 })} />
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Agent</label>
                      <select value={scheduleForm.agent_id} onChange={e => setScheduleForm({ ...scheduleForm, agent_id: e.target.value })}>
                        <option value="">No agent</option>
                        {/* Will load agents here */}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Priority</label>
                      <select value={scheduleForm.priority} onChange={e => setScheduleForm({ ...scheduleForm, priority: e.target.value })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={createSchedule} className="btn">Create Schedule</button>
                    <button onClick={() => setShowScheduleForm(false)} className="btn btn-ghost">Cancel</button>
                  </div>
                </div>
              )}

              {schedules.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ fontSize: '2rem', marginBottom: '8px' }}>⏰</p>
                  <p style={{ color: 'var(--text-muted)' }}>No scheduled tasks yet. Create one to automate recurring work.</p>
                </div>
              ) : (
                schedules.map(s => (
                  <div key={s.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: s.enabled ? '#4ade80' : '#6b7280', display: 'inline-block',
                          }} />
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{s.name}</h4>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.type}</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {s.type === 'interval' ? `Every ${s.intervalMinutes} min` : `At ${s.time}`}
                          {s.type === 'weekly' && ` (weekday)`}
                          {s.nextRun && ` · Next: ${new Date(s.nextRun).toLocaleString()}`}
                          {s.runCount > 0 && ` · ${s.runCount} runs`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => toggleScheduleItem(s.id)} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                          {s.enabled ? '⏸ Pause' : '▶ Enable'}
                        </button>
                        <button onClick={() => deleteScheduleItem(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>About Company OS</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  ['Version', '0.2.0'],
                  ['Backend', 'Node.js + Express + SQLite'],
                  ['Frontend', 'Next.js 14 + React + Tailwind'],
                  ['Real-time', 'Socket.IO'],
                  ['AI Engine', 'OpenAI-compatible API'],
                  ['Auth', 'JWT + bcrypt + rate limiting'],
                  ['Deployment', 'Docker + docker-compose'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    AI-Powered Company Operating System — automate and manage entire business operations through intelligent AI agents.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
