const request = require('supertest');
const { createTestApp, createAdminUser, createTestUser, cleanup } = require('./helpers/test-helper');

let app;
let admin;
let member;

beforeAll(async () => {
  app = createTestApp();
  admin = await createAdminUser();
  member = await createTestUser();
});
afterAll(async () => { await cleanup(); });

describe('Workflow CRUD', () => {
  let workflowId;

  test('admin can create a workflow', async () => {
    const res = await request(app).post('/api/workflows').set('Authorization', `Bearer ${admin.token}`).send({
      name: 'Auto-notify on urgent tasks', trigger: 'task_created',
      conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }],
      actions: [{ type: 'notify', target: 'admin', message: 'Urgent task!' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Auto-notify on urgent tasks');
    workflowId = res.body.id;
  });

  test('non-admin cannot create workflow', async () => {
    const res = await request(app).post('/api/workflows').set('Authorization', `Bearer ${member.token}`).send({ name: 'Nope', trigger: 'task_created' });
    expect(res.status).toBe(403);
  });

  test('lists workflows', async () => {
    const res = await request(app).get('/api/workflows').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('updates a workflow', async () => {
    const res = await request(app).put(`/api/workflows/${workflowId}`).set('Authorization', `Bearer ${admin.token}`).send({ name: 'Updated name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated name');
  });

  test('toggles workflow', async () => {
    const res = await request(app).post(`/api/workflows/${workflowId}/toggle`).set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  test('gets workflow stats', async () => {
    const res = await request(app).get('/api/workflows/stats').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
  });

  test('manually triggers a workflow', async () => {
    const res = await request(app).post('/api/workflows/trigger/user_registered').set('Authorization', `Bearer ${admin.token}`).send({ context: { user: { name: 'Test' } } });
    expect(res.status).toBe(200);
  });

  test('validates required fields', async () => {
    const res = await request(app).post('/api/workflows').set('Authorization', `Bearer ${admin.token}`).send({ name: 'No trigger' });
    expect(res.status).toBe(400);
  });
});
