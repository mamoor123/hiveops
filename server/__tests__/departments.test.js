const request = require('supertest');
const { createTestApp, createAdminUser, createTestUser, cleanup, db, seedDefaults } = require('./helpers/test-helper');

let app;
let admin;
let member;

beforeAll(() => {
  app = createTestApp();
  seedDefaults();
  admin = createAdminUser();
  member = createTestUser();
});

afterAll(() => {
  cleanup();
});

describe('Department CRUD', () => {
  let deptId;

  test('lists departments (includes seeded defaults)', async () => {
    const res = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(6); // 6 seeded defaults
  });

  test('admin can create department', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'R&D', description: 'Research and development', icon: '🔬', color: '#06b6d4' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('R&D');
    deptId = res.body.id;
  });

  test('non-admin cannot create department', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });

  test('gets department detail with arrays', async () => {
    const res = await request(app)
      .get(`/api/departments/${deptId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('R&D');
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });

  test('updates department', async () => {
    const res = await request(app)
      .put(`/api/departments/${deptId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated description');
  });

  test('admin can delete department', async () => {
    // Create temp dept
    const temp = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Temp Dept' });

    const res = await request(app)
      .delete(`/api/departments/${temp.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Knowledge Base', () => {
  let articleId;

  test('creates an article', async () => {
    const res = await request(app)
      .post('/api/knowledge')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Getting Started Guide',
        content: 'Welcome to Company OS. Here is how to get started...',
        category: 'guide',
        tags: ['onboarding', 'guide'],
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Getting Started Guide');
    articleId = res.body.id;
  });

  test('lists articles', async () => {
    const res = await request(app)
      .get('/api/knowledge')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('gets single article', async () => {
    const res = await request(app)
      .get(`/api/knowledge/${articleId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Getting Started Guide');
  });

  test('searches articles', async () => {
    const res = await request(app)
      .post('/api/knowledge/search')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ query: 'getting started' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('updates article', async () => {
    const res = await request(app)
      .put(`/api/knowledge/${articleId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Updated Guide' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Guide');
  });

  test('deletes article', async () => {
    const temp = await request(app)
      .post('/api/knowledge')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Temp Article', content: 'Content' });

    const res = await request(app)
      .delete(`/api/knowledge/${temp.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Email', () => {
  test('lists inbox emails (includes seeded data)', async () => {
    const res = await request(app)
      .get('/api/email/inbox')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('sends an email', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ to: 'someone@example.com', subject: 'Test Email', body: 'Hello!' });

    expect(res.status).toBe(201);
    expect(res.body.subject).toBe('Test Email');
  });

  test('saves a draft', async () => {
    const res = await request(app)
      .post('/api/email/draft')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ subject: 'Draft email' });

    expect(res.status).toBe(201);
    expect(res.body.folder).toBe('drafts');
  });

  test('gets email stats', async () => {
    const res = await request(app)
      .get('/api/email/meta/stats')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.inbox).toBeDefined();
    expect(res.body.sent).toBeDefined();
    expect(res.body.drafts).toBeDefined();
  });

  test('toggles star on email', async () => {
    const inbox = await request(app)
      .get('/api/email/inbox')
      .set('Authorization', `Bearer ${admin.token}`);

    if (inbox.body.length > 0) {
      const emailId = inbox.body[0].id;
      const wasStarred = inbox.body[0].starred;

      const res = await request(app)
        .post(`/api/email/${emailId}/star`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.starred).toBe(!wasStarred);
    }
  });

  test('generates AI reply draft', async () => {
    const inbox = await request(app)
      .get('/api/email/inbox')
      .set('Authorization', `Bearer ${admin.token}`);

    if (inbox.body.length > 0) {
      const res = await request(app)
        .post(`/api/email/${inbox.body[0].id}/draft-reply`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.reply).toBeDefined();
      expect(typeof res.body.reply).toBe('string');
    }
  });
});
