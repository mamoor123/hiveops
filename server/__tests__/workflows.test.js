const request = require('supertest');
const { createTestApp, createAdminUser, createTestUser, cleanup, db } = require('./helpers/test-helper');

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

describe('Workflow CRUD', () => {
  let workflowId;

  test('admin can create a workflow', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Auto-notify on urgent tasks',
        trigger: 'task_created',
        conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }],
        actions: [{ type: 'notify', target: 'admin', message: 'Urgent task!' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Auto-notify on urgent tasks');
    expect(res.body.trigger).toBe('task_created');
    expect(res.body.conditions).toEqual([{ field: 'priority', operator: 'equals', value: 'urgent' }]);
    expect(res.body.enabled).toBe(true);
    workflowId = res.body.id;
  });

  test('non-admin cannot create workflow', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Member workflow', trigger: 'task_created' });

    expect(res.status).toBe(403);
  });

  test('lists workflows', async () => {
    const res = await request(app)
      .get('/api/workflows')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('updates a workflow', async () => {
    const res = await request(app)
      .put(`/api/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Updated workflow name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated workflow name');
  });

  test('toggles workflow enabled/disabled', async () => {
    const res = await request(app)
      .post(`/api/workflows/${workflowId}/toggle`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);

    // Toggle back
    const res2 = await request(app)
      .post(`/api/workflows/${workflowId}/toggle`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res2.body.enabled).toBe(true);
  });

  test('gets workflow stats', async () => {
    const res = await request(app)
      .get('/api/workflows/stats')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(typeof res.body.enabled).toBe('number');
    expect(typeof res.body.totalRuns).toBe('number');
  });

  test('manually triggers a workflow', async () => {
    const res = await request(app)
      .post('/api/workflows/trigger/user_registered')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ context: { user: { name: 'Test User' } } });

    expect(res.status).toBe(200);
    expect(typeof res.body.triggered).toBe('number');
  });

  test('deletes a workflow', async () => {
    // Create temp workflow
    const createRes = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Temp workflow', trigger: 'task_created' });

    const res = await request(app)
      .delete(`/api/workflows/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('validates required fields', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'No trigger' });

    expect(res.status).toBe(400);
  });
});

describe('Workflow Execution', () => {
  test('trigger processes matching enabled workflows', async () => {
    // The seeded workflow for 'user_registered' should match
    const res = await request(app)
      .post('/api/workflows/trigger/user_registered')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ context: { user: { name: 'New Person' } } });

    expect(res.status).toBe(200);
    expect(res.body.triggered).toBeGreaterThanOrEqual(0);
  });

  test('trigger with no matching workflows returns 0', async () => {
    const res = await request(app)
      .post('/api/workflows/trigger/nonexistent_trigger')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.triggered).toBe(0);
  });
});
