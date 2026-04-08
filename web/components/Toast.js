/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
  };

  const colors = {
    success: { bg: '#052e16', border: '#4ade80', text: '#4ade80', icon: '✓' },
    error: { bg: '#450a0a', border: '#f87171', text: '#f87171', icon: '✕' },
    info: { bg: '#172554', border: '#60a5fa', text: '#60a5fa', icon: 'ℹ' },
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => {
          const c = colors[t.type];
          return (
            <div key={t.id} onClick={() => removeToast(t.id)} style={{
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: '10px 16px', minWidth: 280, maxWidth: 420,
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              animation: 'slideIn 0.2s ease-out',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}>
              <span style={{ color: c.text, fontWeight: 700, fontSize: '0.9rem' }}>{c.icon}</span>
              <span style={{ color: '#e4e4ed', fontSize: '0.85rem' }}>{t.message}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
