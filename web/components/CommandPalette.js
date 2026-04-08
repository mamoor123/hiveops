'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ tasks: [], articles: [], agents: [] });
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('tasks');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const router = useRouter();

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery('');
      setResults({ tasks: [], articles: [], agents: [] });
      setActiveIndex(0);
    }
  }, [open]);

  // Search with debounce
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults({ tasks: [], articles: [], agents: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [tasks, articles, agents] = await Promise.all([
          api.getTasks().then(tasks =>
            tasks.filter(t =>
              t.title.toLowerCase().includes(query.toLowerCase()) ||
              (t.description || '').toLowerCase().includes(query.toLowerCase())
            ).slice(0, 5)
          ).catch(() => []),
          api.getArticles({ search: query }).then(a => a.slice(0, 5)).catch(() => []),
          api.getAgents().then(agents =>
            agents.filter(a =>
              a.name.toLowerCase().includes(query.toLowerCase()) ||
              a.role.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 5)
          ).catch(() => []),
        ]);
        setResults({ tasks, articles, agents });
      } catch { /* ignore */ }
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Flatten results for keyboard navigation
  const flatResults = [
    ...results.tasks.map(t => ({ type: 'task', data: t, label: t.title, sub: `${t.status} · ${t.priority}`, icon: '📋' })),
    ...results.articles.map(a => ({ type: 'article', data: a, label: a.title, sub: a.category, icon: '📚' })),
    ...results.agents.map(a => ({ type: 'agent', data: a, label: a.name, sub: a.role, icon: '🤖' })),
  ];

  const navigate = useCallback((item) => {
    setOpen(false);
    switch (item.type) {
      case 'task': router.push('/tasks'); break;
      case 'article': router.push('/knowledge'); break;
      case 'agent': router.push('/agents'); break;
    }
  }, [router]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatResults[activeIndex]) {
      navigate(flatResults[activeIndex]);
    }
  };

  if (!open) return null;

  return (
    <div onClick={() => setOpen(false)} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '15vh', zIndex: 2000, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, width: 560, maxHeight: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: '1.1rem' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, articles, agents..."
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.95rem', padding: 0 }}
          />
          <kbd style={{
            background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4,
            fontSize: '0.7rem', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}>ESC</kbd>
        </div>

        {/* Quick nav when no query */}
        {!query && (
          <div style={{ padding: '8px' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase', fontWeight: 600 }}>Quick Navigation</p>
            {[
              { label: 'Dashboard', icon: '📊', href: '/dashboard' },
              { label: 'Tasks', icon: '📋', href: '/tasks' },
              { label: 'Chat', icon: '💬', href: '/chat' },
              { label: 'Knowledge Base', icon: '📚', href: '/knowledge' },
              { label: 'Agents', icon: '🤖', href: '/agents' },
              { label: 'Workflows', icon: '⚡', href: '/workflows' },
            ].map(item => (
              <button key={item.href} onClick={() => { router.push(item.href); setOpen(false); }} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                background: 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px',
                color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left',
              }}>
                <span>{item.icon}</span> {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {query && (
          <div style={{ maxHeight: 380, overflow: 'auto', padding: '8px' }}>
            {loading && (
              <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Searching...
              </p>
            )}
            {!loading && flatResults.length === 0 && query.length >= 2 && (
              <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No results for "{query}"
              </p>
            )}
            {flatResults.map((item, i) => (
              <button key={`${item.type}-${item.data.id}`}
                onClick={() => navigate(item)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  background: i === activeIndex ? '#1e1b4b' : 'transparent',
                  border: 'none', borderRadius: 8, padding: '8px 10px',
                  color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left',
                }}>
                <span>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.sub}</div>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{item.type}</span>
              </button>
            ))}
          </div>
        )}

        {/* Footer hint */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, fontSize: '0.7rem', color: 'var(--text-muted)',
        }}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  );
}
