/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  const handleSubmit = async () => {
    if (!form.email || !form.password) { setError('Email and password required'); return; }
    if (isRegister && !form.name) { setError('Name required'); return; }
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(form.email, form.password, form.name);
      } else {
        await login(form.email, form.password);
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>🏢 Company OS</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            AI-Powered Business Operations
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isRegister && (
            <input placeholder="Full Name" value={form.name} onKeyDown={handleKeyDown}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          )}
          <input type="email" placeholder="Email" value={form.email} onKeyDown={handleKeyDown}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <input type="password" placeholder="Password" value={form.password} onKeyDown={handleKeyDown}
            onChange={e => setForm({ ...form, password: e.target.value })} />

          {error && <p style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</p>}

          <button onClick={handleSubmit} disabled={loading} className="btn" style={{ width: '100%', padding: '0.6rem' }}>
            {loading ? '...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.8rem' }}>
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}
