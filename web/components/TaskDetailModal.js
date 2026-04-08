/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function TaskDetailModal({ taskId, onClose, onUpdate }) {
  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    Promise.all([
      api.getTask(taskId),
      api.getTaskComments(taskId),
      api.getTaskUploads(taskId).catch(() => []),
    ]).then(([t, c, u]) => {
      setTask(t);
      setComments(c);
      setUploads(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [taskId]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    try {
      const updated = await api.addTaskComment(taskId, newComment.trim());
      setComments(updated);
      setNewComment('');
    } catch (err) { console.error(err); }
  };

  const updateStatus = async (status) => {
    try {
      const updated = await api.updateTask(taskId, { status });
      setTask(updated);
      if (onUpdate) onUpdate();
    } catch (err) { console.error(err); }
  };

  const executeTask = async () => {
    try {
      await api.executeTask(taskId);
      // Reload comments to see agent response
      const c = await api.getTaskComments(taskId);
      setComments(c);
    } catch (err) { console.error(err); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await api.uploadFile(file, taskId);
      setUploads(prev => [uploaded, ...prev]);
    } catch (err) { console.error(err); }
    setUploading(false);
    e.target.value = '';
  };

  const handleDeleteUpload = async (id) => {
    if (!confirm('Delete this file?')) return;
    try {
      await api.deleteUpload(id);
      setUploads(prev => prev.filter(u => u.id !== id));
    } catch (err) { console.error(err); }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!taskId) return null;

  const priorityColors = {
    urgent: '#f87171', high: '#fb923c', medium: '#94a3b8', low: '#4ade80',
  };

  const statusColors = {
    pending: '#94a3b8', in_progress: '#60a5fa', review: '#a78bfa',
    completed: '#4ade80', blocked: '#f87171',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, width: 640, maxHeight: '85vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
        }}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : task ? (
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>#{task.id}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                  background: priorityColors[task.priority] + '22', color: priorityColors[task.priority],
                }}>
                  {task.priority}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                  background: statusColors[task.status] + '22', color: statusColors[task.status],
                }}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{task.title}</h2>
              {task.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                  {task.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                {task.department_name && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {task.department_icon} {task.department_name}
                  </span>
                )}
                {task.assignee_name && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    👤 {task.assignee_name}
                  </span>
                )}
                {task.agent_name && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    🤖 {task.agent_name}
                  </span>
                )}
                {task.due_date && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    📅 {new Date(task.due_date).toLocaleDateString()}
                  </span>
                )}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  by {task.creator_name}
                </span>
              </div>
            </div>
          ) : null}
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.2rem', padding: 4,
          }}>✕</button>
        </div>

        {/* Actions bar */}
        {task && !loading && (
          <div style={{
            display: 'flex', gap: 8, padding: '12px 24px',
            borderBottom: '1px solid var(--border)',
          }}>
            {['pending', 'in_progress', 'review', 'completed', 'blocked'].map(s => (
              <button key={s} onClick={() => updateStatus(s)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer',
                border: task.status === s ? `1px solid ${statusColors[s]}` : '1px solid var(--border)',
                background: task.status === s ? statusColors[s] + '22' : 'transparent',
                color: task.status === s ? statusColors[s] : 'var(--text-muted)',
                fontWeight: task.status === s ? 600 : 400,
              }}>
                {s.replace('_', ' ')}
              </button>
            ))}
            {task.agent_name && task.status !== 'completed' && (
              <button onClick={executeTask} className="btn" style={{
                padding: '4px 12px', fontSize: '0.75rem', marginLeft: 'auto',
              }}>
                ▶ Execute
              </button>
            )}
          </div>
        )}

        {/* Comments & Attachments */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          {/* Attachments */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Attachments ({uploads.length})
              </h3>
              <label style={{
                fontSize: '0.75rem', color: '#6366f1', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {uploading ? 'Uploading...' : '📎 Add file'}
                <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
              </label>
            </div>
            {uploads.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {uploads.map(u => (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 6,
                    fontSize: '0.75rem',
                  }}>
                    <a href={api.getUploadUrl(u.id)} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#6366f1', textDecoration: 'none', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📎 {u.original_name}
                    </a>
                    <span style={{ color: 'var(--text-muted)' }}>{formatSize(u.size)}</span>
                    <button onClick={() => handleDeleteUpload(u.id)} style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: '0.7rem', padding: 0,
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' }}>
            Activity ({comments.length})
          </h3>
          {comments.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0' }}>
              No activity yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {comments.map(c => (
                <div key={c.id} style={{
                  display: 'flex', gap: 10,
                  background: c.agent_name ? 'rgba(99,102,241,0.05)' : 'var(--surface-2)',
                  padding: 10, borderRadius: 8,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: c.agent_name ? '#4f46e5' : '#374151',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem',
                  }}>
                    {c.agent_name ? '🤖' : '👤'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {c.user_name || c.agent_name || 'Unknown'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {c.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comment input */}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8,
        }}>
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
            placeholder="Add a comment..."
            style={{ flex: 1 }}
          />
          <button onClick={addComment} className="btn" style={{ padding: '0.5rem 1rem' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
