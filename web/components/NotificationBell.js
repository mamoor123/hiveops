/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!user) return;
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Listen for socket notifications (via window event from layout)
  useEffect(() => {
    const handler = (e) => {
      const n = e.detail;
      setUnread(prev => prev + 1);
      setNotifications(prev => [n, ...prev].slice(0, 20));
    };
    window.addEventListener('notification', handler);
    return () => window.removeEventListener('notification', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadUnread = async () => {
    try {
      const res = await api.getUnreadCount();
      setUnread(res.count);
    } catch {}
  };

  const toggle = async () => {
    if (!open) {
      try {
        const data = await api.getNotifications({ limit: 20 });
        setNotifications(data);
      } catch {}
    }
    setOpen(!open);
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnread(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const markRead = async (n) => {
    if (!n.read) {
      try { await api.markNotificationRead(n.id); } catch {}
      setUnread(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
  };

  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const typeIcons = {
    task_assigned: '📋',
    task_completed: '✅',
    task_comment: '💬',
    agent_response: '🤖',
    workflow_triggered: '⚡',
    mention: '@',
    system: 'ℹ️',
  };

  if (!user) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={toggle} style={{
        background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem',
        position: 'relative', padding: 4, color: 'var(--text)',
      }}>
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -4, background: '#ef4444',
            color: '#fff', fontSize: '0.6rem', fontWeight: 700, borderRadius: 10,
            padding: '1px 5px', minWidth: 16, textAlign: 'center',
            lineHeight: '14px',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 360, maxHeight: 440, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden',
          zIndex: 100,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Notifications</h3>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                background: 'none', border: 'none', color: '#6366f1',
                cursor: 'pointer', fontSize: '0.75rem',
              }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight: 380, overflow: 'auto' }}>
            {notifications.length === 0 ? (
              <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No notifications
              </p>
            ) : (
              notifications.map(n => (
                <div key={n.id} onClick={() => markRead(n)} style={{
                  padding: '10px 16px', borderBottom: '1px solid var(--border)',
                  background: n.read ? 'transparent' : 'rgba(99,102,241,0.06)',
                  cursor: 'pointer', display: 'flex', gap: 10,
                }}>
                  <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 2 }}>
                    {typeIcons[n.type] || '📌'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: n.read ? 400 : 600, marginBottom: 2 }}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.body}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {timeAgo(n.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
