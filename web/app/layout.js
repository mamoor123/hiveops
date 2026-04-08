/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import './globals.css';
import { AuthProvider, useAuth } from '../lib/auth';
import { ToastProvider } from '../components/Toast';
import NotificationBell from '../components/NotificationBell';
import CommandPalette from '../components/CommandPalette';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function SocketConnector() {
  const { user } = useAuth();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    // Forward notification events to window for components to listen
    socket.on('notification', (n) => {
      window.dispatchEvent(new CustomEvent('notification', { detail: n }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return null;
}

function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/departments', label: 'Departments', icon: '🏢' },
    { href: '/tasks', label: 'Tasks', icon: '📋' },
    { href: '/agents', label: 'AI Agents', icon: '🤖' },
    { href: '/chat', label: 'Chat', icon: '💬' },
    { href: '/knowledge', label: 'Knowledge', icon: '📚' },
    { href: '/email', label: 'Email', icon: '📧' },
    { href: '/workflows', label: 'Workflows', icon: '⚡' },
    { href: '/analytics', label: 'Analytics', icon: '📈' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside style={{
      width: 240, minHeight: '100vh', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', padding: '1rem',
      display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0
    }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700 }}>🏢 Company OS</h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI-Powered Operations</p>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {nav.map(n => (
          <Link key={n.href} href={n.href} style={{
            padding: '0.5rem 0.75rem', borderRadius: 8, textDecoration: 'none',
            color: pathname.startsWith(n.href) ? '#fff' : 'var(--text-muted)',
            background: pathname.startsWith(n.href) ? '#1e1b4b' : 'transparent',
            fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <span>{n.icon}</span> {n.label}
          </Link>
        ))}
        <div style={{ padding: '0.5rem 0.75rem', marginTop: '8px' }}>
          <kbd style={{
            background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4,
            fontSize: '0.7rem', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}>⌘K</kbd>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>Search</span>
        </div>
      </nav>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <p style={{ fontSize: '0.8rem', marginBottom: '2px' }}>{user.name}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{user.role}</p>
          </div>
          <NotificationBell />
        </div>
        <button onClick={logout} className="btn btn-ghost" style={{ width: '100%', fontSize: '0.8rem' }}>
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function AppShell({ children }) {
  const { user } = useAuth();

  if (!user) return children;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: 240, padding: '2rem', minHeight: '100vh' }}>
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <SocketConnector />
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
