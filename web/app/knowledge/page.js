'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';

export default function KnowledgePage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [articles, setArticles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState({ department_id: '', category: '', search: '' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewingArticle, setViewingArticle] = useState(null);
  const [form, setForm] = useState({
    title: '', content: '', department_id: '', category: 'general', tags: ''
  });

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadData();
  }, [user, filter]);

  const loadData = async () => {
    try {
      const params = {};
      if (filter.department_id) params.department_id = filter.department_id;
      if (filter.category) params.category = filter.category;
      if (filter.search) params.search = filter.search;

      const [a, d, c] = await Promise.all([
        api.getArticles(params),
        api.getDepartments(),
        api.getKnowledgeCategories().catch(() => [])
      ]);
      setArticles(a);
      setDepartments(d);
      setCategories(c);
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    if (!form.title || !form.content) { toast.error('Title and content required'); return; }
    try {
      const data = {
        ...form,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        department_id: form.department_id || null,
      };
      if (editingId) {
        await api.updateArticle(editingId, data);
        toast.success('Article updated');
      } else {
        await api.createArticle(data);
        toast.success('Article published');
      }
      resetForm();
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  const handleEdit = (article) => {
    setForm({
      title: article.title,
      content: article.content,
      department_id: article.department_id || '',
      category: article.category || 'general',
      tags: JSON.parse(article.tags || '[]').join(', '),
    });
    setEditingId(article.id);
    setShowForm(true);
    setViewingArticle(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this article?')) return;
    await api.deleteArticle(id);
    setArticles(articles.filter(a => a.id !== id));
    setViewingArticle(null);
    toast.success('Article deleted');
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ title: '', content: '', department_id: '', category: 'general', tags: '' });
  };

  const viewArticle = async (id) => {
    const article = await api.getArticle(id);
    setViewingArticle(article);
  };

  const categoryColors = {
    general: '#6366f1', guide: '#10b981', policy: '#f59e0b',
    training: '#ec4899', reference: '#8b5cf6', process: '#06b6d4',
  };

  // Article viewer modal
  if (viewingArticle) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button onClick={() => setViewingArticle(null)} className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>
            ← Back to Knowledge Base
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleEdit(viewingArticle)} className="btn btn-ghost">Edit</button>
            <button onClick={() => handleDelete(viewingArticle.id)} className="btn btn-danger">Delete</button>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 800 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            {viewingArticle.department_icon && <span>{viewingArticle.department_icon}</span>}
            <span className="badge" style={{
              background: (categoryColors[viewingArticle.category] || '#6366f1') + '22',
              color: categoryColors[viewingArticle.category] || '#6366f1'
            }}>
              {viewingArticle.category}
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>{viewingArticle.title}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            By {viewingArticle.author_name || 'Unknown'} · {viewingArticle.department_name || 'All departments'} · Updated {new Date(viewingArticle.updated_at).toLocaleDateString()}
          </p>
          <div style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {viewingArticle.content}
          </div>
          {JSON.parse(viewingArticle.tags || '[]').length > 0 && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {JSON.parse(viewingArticle.tags).map(tag => (
                <span key={tag} style={{
                  background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4,
                  fontSize: '0.75rem', color: 'var(--text-muted)'
                }}>#{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>📚 Knowledge Base</h2>
        <button className="btn" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          + New Article
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input placeholder="🔍 Search articles..." value={filter.search}
          onChange={e => setFilter({ ...filter, search: e.target.value })}
          style={{ width: 250 }} />
        <select value={filter.department_id} onChange={e => setFilter({ ...filter, department_id: e.target.value })} style={{ width: 'auto' }}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
        </select>
        <select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })} style={{ width: 'auto' }}>
          <option value="">All Categories</option>
          <option value="general">General</option>
          <option value="guide">Guide</option>
          <option value="policy">Policy</option>
          <option value="training">Training</option>
          <option value="reference">Reference</option>
          <option value="process">Process</option>
        </select>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
            {editingId ? 'Edit Article' : 'New Article'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Title *</label>
              <input placeholder="Article title" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Department</label>
              <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                <option value="">All departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="general">General</option>
                <option value="guide">Guide</option>
                <option value="policy">Policy</option>
                <option value="training">Training</option>
                <option value="reference">Reference</option>
                <option value="process">Process</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Content *</label>
            <textarea placeholder="Write your article content here..."
              value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
              rows={8} style={{ fontFamily: 'inherit' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Tags (comma-separated)</label>
            <input placeholder="marketing, strategy, q2" value={form.tags}
              onChange={e => setForm({ ...form, tags: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} className="btn">{editingId ? 'Save Changes' : 'Publish'}</button>
            <button onClick={resetForm} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Articles Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {articles.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', gridColumn: '1 / -1' }}>
            <p style={{ fontSize: '2rem', marginBottom: '8px' }}>📚</p>
            <p style={{ color: 'var(--text-muted)' }}>
              {filter.search || filter.department_id || filter.category
                ? 'No articles match your filters.'
                : 'No articles yet. Create the first one!'}
            </p>
          </div>
        ) : (
          articles.map(a => (
            <div key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => viewArticle(a.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span className="badge" style={{
                  background: (categoryColors[a.category] || '#6366f1') + '22',
                  color: categoryColors[a.category] || '#6366f1'
                }}>
                  {a.category}
                </span>
                {a.department_icon && <span>{a.department_icon}</span>}
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>{a.title}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {a.content.slice(0, 120)}{a.content.length > 120 ? '...' : ''}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {a.author_name || 'Unknown'} · {a.department_name || 'All'}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {new Date(a.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
