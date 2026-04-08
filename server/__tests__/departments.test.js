const request = require('supertest');
const { createTestApp, createAdminUser, createTestUser, cleanup, db, seedDefaults } = require('./helpers/test-helper');

let app;
let admin;
let member;

beforeAll(async () => {
  app = createTestApp();
  await seedDefaults();
  admin = await createAdminUser();
  member = await createTestUser();
});
afterAll(async () => { await cleanup(); });

describe('Department CRUD', () => {
  let deptId;

  test('lists departments (includes seeded)', async () => {
    const res = await request(app).get('/api/departments').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });

  test('admin can create department', async () => {
    const res = await request(app).post('/api/departments').set('Authorization', `Bearer ${admin.token}`).send({ name: 'R&D', description: 'Research', icon: '🔬', color: '#06b6d4' });
    expect(res.status).toBe(201);
    deptId = res.body.id;
  });

  test('non-admin cannot create', async () => {
    const res = await request(app).post('/api/departments').set('Authorization', `Bearer ${member.token}`).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  test('gets department detail', async () => {
    const res = await request(app).get(`/api/departments/${deptId}`).set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  test('updates department', async () => {
    const res = await request(app).put(`/api/departments/${deptId}`).set('Authorization', `Bearer ${admin.token}`).send({ description: 'Updated' });
    expect(res.status).toBe(200);
  });

  test('deletes department', async () => {
    const temp = await request(app).post('/api/departments').set('Authorization', `Bearer ${admin.token}`).send({ name: 'Temp' });
    const res = await request(app).delete(`/api/departments/${temp.body.id}`).set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });
});

describe('Knowledge Base', () => {
  test('creates an article', async () => {
    const res = await request(app).post('/api/knowledge').set('Authorization', `Bearer ${admin.token}`).send({ title: 'Guide', content: 'Getting started...' });
    expect(res.status).toBe(201);
  });

  test('lists articles', async () => {
    const res = await request(app).get('/api/knowledge').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });

  test('searches articles', async () => {
    const res = await request(app).post('/api/knowledge/search').set('Authorization', `Bearer ${admin.token}`).send({ query: 'getting started' });
    expect(res.status).toBe(200);
  });
});

describe('Email', () => {
  test('lists inbox', async () => {
    const res = await request(app).get('/api/email/inbox').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });

  test('sends an email', async () => {
    const res = await request(app).post('/api/email/send').set('Authorization', `Bearer ${admin.token}`).send({ to: 'someone@example.com', subject: 'Test', body: 'Hello' });
    expect(res.status).toBe(201);
  });

  test('gets email stats', async () => {
    const res = await request(app).get('/api/email/meta/stats').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.inbox).toBe('number');
  });
});
