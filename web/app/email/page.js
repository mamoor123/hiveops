'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function EmailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [folder, setFolder] = useState('inbox');
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [aiReply, setAiReply] = useState('');

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadEmails();
    api.getEmailStats().then(setStats).catch(() => {});
  }, [user, folder, search]);

  const loadEmails = async () => {
    const params = {};
    if (search) params.search = search;
    const e = await api.getEmails(folder, params).catch(() => []);
    setEmails(e);
  };

  const openEmail = async (id) => {
    const email = await api.getEmail(id);
    setSelectedEmail(email);
    setAiReply('');
    loadEmails();
  };

  const handleStar = async (id, e) => {
    e.stopPropagation();
    await api.starEmail(id);
    loadEmails();
  };

  const handleSend = async () => {
    if (!compose.to || !compose.subject) { toast.error('To and Subject required'); return; }
    await api.sendEmail(compose);
    setShowCompose(false);
    setCompose({ to: '', subject: '', body: '' });
    toast.success('Email sent!');
    loadEmails();
    api.getEmailStats().then(setStats).catch(() => {});
  };

  const handleAiReply = async () => {
    if (!selectedEmail) return;
    const { reply } = await api.draftReply(selectedEmail.id);
    setAiReply(reply);
  };

  const handleReply = () => {
    if (!selectedEmail) return;
    setCompose({
      to: selectedEmail.from,
      subject: selectedEmail.subject,
      body: aiReply || `\n\n---\nOn ${new Date(selectedEmail.date).toLocaleString()}, ${selectedEmail.from} wrote:\n> ${selectedEmail.body.split('\n').join('\n> ')}`,
    });
    setShowCompose(true);
  };

  const folders = [
    { id: 'inbox', label: 'Inbox', icon: '📥', count: stats.unread },
    { id: 'sent', label: 'Sent', icon: '📤' },
    { id: 'drafts', label: 'Drafts', icon: '📝', count: stats.drafts },
    { id: 'starred', label: 'Starred', icon: '⭐', count: stats.starred },
  ];

  const formatDate = (d) => {
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 4rem)' }}>
      {/* Sidebar */}
      <div style={{ width: 200, borderRight: '1px solid var(--border)', padding: '1rem', flexShrink: 0 }}>
        <button className="btn" style={{ width: '100%', marginBottom: '1rem' }} onClick={() => setShowCompose(true)}>
          ✏️ Compose
        </button>
        {folders.map(f => (
          <button key={f.id} onClick={() => { setFolder(f.id); setSelectedEmail(null); }}
            style={{
              display: 'flex', justifyContent: 'space-between', width: '100%',
              background: folder === f.id ? '#1e1b4b' : 'transparent',
              border: 'none', borderRadius: 6, padding: '8px 10px',
              color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '2px'
            }}>
            <span>{f.icon} {f.label}</span>
            {f.count > 0 && <span style={{ color: '#6366f1', fontWeight: 600 }}>{f.count}</span>}
          </button>
        ))}
      </div>

      {/* Email List */}
      <div style={{ width: 350, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
          <input placeholder="🔍 Search emails..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {emails.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No emails in {folder}
            </div>
          ) : (
            emails.map(email => (
              <div key={email.id} onClick={() => openEmail(email.id)}
                style={{
                  padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: selectedEmail?.id === email.id ? '#1e1b4b' : (!email.read ? 'rgba(99,102,241,0.05)' : 'transparent'),
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontWeight: !email.read ? 700 : 400, fontSize: '0.85rem' }}>
                    {folder === 'sent' ? email.to : email.from.split('@')[0]}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span onClick={(e) => handleStar(email.id, e)} style={{ cursor: 'pointer', fontSize: '0.8rem' }}>
                      {email.starred ? '⭐' : '☆'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(email.date)}</span>
                  </div>
                </div>
                <div style={{ fontWeight: !email.read ? 600 : 400, fontSize: '0.85rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.subject}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.body.slice(0, 80)}
                </div>
                {email.labels.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    {email.labels.map(l => (
                      <span key={l} style={{ background: '#1e1b4b', padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem', color: '#a78bfa' }}>{l}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Email View / Compose */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {showCompose ? (
          <div style={{ padding: '1.5rem', flex: 1 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              {compose.to.startsWith('Re:') || aiReply ? '↩️ Reply' : '✏️ New Email'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="To" value={compose.to} onChange={e => setCompose({ ...compose, to: e.target.value })} />
              <input placeholder="Subject" value={compose.subject} onChange={e => setCompose({ ...compose, subject: e.target.value })} />
              <textarea placeholder="Write your message..." value={compose.body}
                onChange={e => setCompose({ ...compose, body: e.target.value })}
                rows={12} style={{ fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSend} className="btn">Send</button>
                <button onClick={() => setShowCompose(false)} className="btn btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        ) : selectedEmail ? (
          <div style={{ padding: '1.5rem', flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>{selectedEmail.subject}</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  From: {selectedEmail.from} → {selectedEmail.to} · {new Date(selectedEmail.date).toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleReply} className="btn btn-ghost" style={{ fontSize: '0.8rem' }}>↩️ Reply</button>
                <button onClick={handleAiReply} className="btn" style={{ fontSize: '0.8rem' }}>🤖 AI Reply</button>
              </div>
            </div>
            <div className="card" style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {selectedEmail.body}
            </div>
            {aiReply && (
              <div className="card" style={{ marginTop: '1rem', borderLeft: '3px solid #6366f1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>🤖 AI Draft Reply</span>
                  <button onClick={() => { setCompose({ to: selectedEmail.from, subject: selectedEmail.subject, body: aiReply }); setShowCompose(true); setAiReply(''); }}
                    className="btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Use This</button>
                </div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
                  {aiReply}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select an email to read
          </div>
        )}
      </div>
    </div>
  );
}
