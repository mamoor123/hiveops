const request = require('supertest');
const { createTestApp, createTestUser, createAdminUser, cleanup, db } = require('./helpers/test-helper');

let app;
let admin;
let member;

beforeAll(() => {
  app = createTestApp();
  admin = createAdminUser();
  member = createTestUser();
});

afterAll(() => {
  cleanup();
});

describe('Task CRUD', () => {
  let taskId;

  test('creates a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Test Task', description: 'A test task', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test Task');
    expect(res.body.priority).toBe('high');
    expect(res.body.status).toBe('pending');
    taskId = res.body.id;
  });

  test('rejects task without title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ description: 'No title' });

    expect(res.status).toBe(400);
  });

  test('lists tasks', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('filters tasks by priority', async () => {
    const res = await request(app)
      .get('/api/tasks?priority=high')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.every(t => t.priority === 'high')).toBe(true);
  });

  test('gets single task', async () => {
    const res = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(taskId);
    expect(res.body.title).toBe('Test Task');
  });

  test('returns 404 for non-existent task', async () => {
    const res = await request(app)
      .get('/api/tasks/99999')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(404);
  });

  test('updates a task', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'in_progress', priority: 'urgent' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.priority).toBe('urgent');
  });

  test('assigns task to user', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ assigned_to: member.id });

    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(member.id);
  });

  test('adds comment to task', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ content: 'This is a comment' });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].content).toBe('This is a comment');
  });

  test('rejects comment without content', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('marks task completed with timestamp', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completed_at).toBeTruthy();
  });

  test('deletes a task', async () => {
    // Create a task to delete
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'To Delete' });

    const res = await request(app)
      .delete(`/api/tasks/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('requires auth for all endpoints', async () => {
    const endpoints = [
      { method: 'get', path: '/api/tasks' },
      { method: 'post', path: '/api/tasks' },
      { method: 'get', path: '/api/tasks/1' },
      { method: 'put', path: '/api/tasks/1' },
      { method: 'delete', path: '/api/tasks/1' },
    ];

    for (const ep of endpoints) {
      const res = await request(app)[ep.method](ep.path);
      expect(res.status).toBe(401);
    }
  });
});
