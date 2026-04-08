const request = require('supertest');
const { createTestApp, createTestUser, createAdminUser, cleanup } = require('./helpers/test-helper');

let app;

beforeAll(() => { app = createTestApp(); });
afterAll(async () => { await cleanup(); });

describe('POST /api/auth/register', () => {
  test('registers a new user', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'newuser@test.com', password: 'Password123!', name: 'New User' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('newuser@test.com');
  });

  test('rejects duplicate email', async () => {
    await request(app).post('/api/auth/register').send({ email: 'dupe@test.com', password: 'Password123!', name: 'First' });
    const res = await request(app).post('/api/auth/register').send({ email: 'dupe@test.com', password: 'Password123!', name: 'Second' });
    expect(res.status).toBe(409);
  });

  test('rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'weak@test.com', password: 'short', name: 'Weak' });
    expect(res.status).toBe(400);
  });

  test('rejects invalid email format', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'Password123!', name: 'Bad' });
    expect(res.status).toBe(400);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'no-name@test.com', password: 'Password123!' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with valid credentials', async () => {
    await request(app).post('/api/auth/register').send({ email: 'login-test@test.com', password: 'Password123!', name: 'Login Test' });
    const res = await request(app).post('/api/auth/login').send({ email: 'login-test@test.com', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send({ email: 'wrong-pw@test.com', password: 'Password123!', name: 'Wrong PW' });
    const res = await request(app).post('/api/auth/login').send({ email: 'wrong-pw@test.com', password: 'WrongPassword!' });
    expect(res.status).toBe(401);
  });

  test('rejects non-existent user', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'Password123!' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns current user with valid token', async () => {
    const user = await createTestUser();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
  });

  test('rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/profile', () => {
  test('updates user name', async () => {
    const user = await createTestUser();
    const res = await request(app).put('/api/auth/profile').set('Authorization', `Bearer ${user.token}`).send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });
});

describe('POST /api/auth/change-password', () => {
  test('changes password with correct current password', async () => {
    const reg = await request(app).post('/api/auth/register').send({ email: 'pw-change@test.com', password: 'OldPass123!', name: 'PW Change' });
    const res = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${reg.body.token}`).send({ current_password: 'OldPass123!', new_password: 'NewPass456!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects wrong current password', async () => {
    const user = await request(app).post('/api/auth/register').send({ email: 'pw-wrong@test.com', password: 'Correct123!', name: 'PW Wrong' });
    const res = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${user.body.token}`).send({ current_password: 'WrongPass!', new_password: 'NewPass456!' });
    expect(res.status).toBe(401);
  });
});
