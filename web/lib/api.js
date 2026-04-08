/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/api/auth/me'),
  getUsers: () => request('/api/auth'),
  updateProfile: (data) => request('/api/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: (data) => request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  updateUserRole: (id, role) => request(`/api/auth/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),

  // Uploads
  uploadFile: async (file, taskId = null) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const formData = new FormData();
    formData.append('file', file);
    if (taskId) formData.append('task_id', taskId);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const res = await fetch(`${API_URL}/api/uploads`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },
  getTaskUploads: (taskId) => request(`/api/uploads/task/${taskId}`),
  deleteUpload: (id) => request(`/api/uploads/${id}`, { method: 'DELETE' }),
  getUploadUrl: (id) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    return `${API_URL}/api/uploads/${id}/download?token=${token}`;
  },

  // System (admin)
  getSystemStatus: () => request('/api/system/status'),
  testLLM: (data) => request('/api/system/test-llm', { method: 'POST', body: JSON.stringify(data || {}) }),
  toggleExecutionLoop: () => request('/api/system/execution-loop/toggle', { method: 'POST' }),
  runExecutionLoop: () => request('/api/system/execution-loop/run', { method: 'POST' }),
  getSchedules: () => request('/api/system/schedules'),
  createSchedule: (data) => request('/api/system/schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateSchedule: (id, data) => request(`/api/system/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSchedule: (id) => request(`/api/system/schedules/${id}`, { method: 'DELETE' }),
  toggleSchedule: (id) => request(`/api/system/schedules/${id}/toggle`, { method: 'POST' }),

  // Dashboard
  getDashboard: () => request('/api/dashboard'),
  getActivity: (days = 7) => request(`/api/dashboard/activity?days=${days}`),

  // Departments
  getDepartments: () => request('/api/departments'),
  getDepartment: (id) => request(`/api/departments/${id}`),
  createDepartment: (data) => request('/api/departments', { method: 'POST', body: JSON.stringify(data) }),
  updateDepartment: (id, data) => request(`/api/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDepartment: (id) => request(`/api/departments/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/notifications${qs ? `?${qs}` : ''}`);
  },
  getUnreadCount: () => request('/api/notifications/unread-count'),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/api/notifications/read-all', { method: 'POST' }),

  // Tasks
  getTask: (id) => request(`/api/tasks/${id}`),
  getTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: (data) => request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  getTaskComments: (id) => request(`/api/tasks/${id}/comments`),
  addTaskComment: (id, content) => request(`/api/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),

  // Agents
  getAgents: () => request('/api/agents'),
  createAgent: (data) => request('/api/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id, data) => request(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (id) => request(`/api/agents/${id}`, { method: 'DELETE' }),

  // AI / Chat
  getMessages: (channel) => request(`/api/ai/messages/${channel}`),
  getChannels: () => request('/api/ai/channels'),
  executeTask: (taskId) => request(`/api/ai/execute/${taskId}`, { method: 'POST' }),
  chatWithAgent: (agentId, message, channel) => request(`/api/ai/chat/${agentId}`, { method: 'POST', body: JSON.stringify({ message, channel }) }),
  agentDelegate: (data) => request('/api/ai/delegate', { method: 'POST', body: JSON.stringify(data) }),

  // Knowledge Base
  getArticles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/knowledge${qs ? `?${qs}` : ''}`);
  },
  getArticle: (id) => request(`/api/knowledge/${id}`),
  createArticle: (data) => request('/api/knowledge', { method: 'POST', body: JSON.stringify(data) }),
  updateArticle: (id, data) => request(`/api/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArticle: (id) => request(`/api/knowledge/${id}`, { method: 'DELETE' }),
  searchKnowledge: (query, department_id, limit) => request('/api/knowledge/search', { method: 'POST', body: JSON.stringify({ query, department_id, limit }) }),
  getKnowledgeCategories: () => request('/api/knowledge/meta/categories'),

  // Email
  getEmails: (folder, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/email/${folder}${qs ? `?${qs}` : ''}`);
  },
  getEmail: (id) => request(`/api/email/item/${id}`),
  sendEmail: (data) => request('/api/email/send', { method: 'POST', body: JSON.stringify(data) }),
  saveDraft: (data) => request('/api/email/draft', { method: 'POST', body: JSON.stringify(data) }),
  starEmail: (id) => request(`/api/email/${id}/star`, { method: 'POST' }),
  moveEmail: (id, folder) => request(`/api/email/${id}/move`, { method: 'POST', body: JSON.stringify({ folder }) }),
  draftReply: (id, instructions) => request(`/api/email/${id}/draft-reply`, { method: 'POST', body: JSON.stringify({ instructions }) }),
  getEmailStats: () => request('/api/email/meta/stats'),

  // Workflows
  getWorkflows: () => request('/api/workflows'),
  getWorkflowStats: () => request('/api/workflows/stats'),
  getWorkflowLog: (limit) => request(`/api/workflows/log?limit=${limit || 20}`),
  createWorkflow: (data) => request('/api/workflows', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkflow: (id, data) => request(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleWorkflow: (id) => request(`/api/workflows/${id}/toggle`, { method: 'POST' }),
  deleteWorkflow: (id) => request(`/api/workflows/${id}`, { method: 'DELETE' }),
  triggerWorkflow: (trigger, context) => request(`/api/workflows/trigger/${trigger}`, { method: 'POST', body: JSON.stringify({ context }) }),
};
