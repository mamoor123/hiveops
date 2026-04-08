const request = require('supertest');
const { createTestApp, createTestUser, createAdminUser, cleanup } = require('./helpers/test-helper');

let app;

beforeAll(() => {
  app = createTestApp();
});

afterAll(() => {
  cleanup();
});

describe('POST /api/auth/register', () => {
  test('registers a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'newuser@test.com', password: 'Password123!', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('newuser@test.com');
    expect(res.body.user.name).toBe('New User');
    expect(res.body.user.role).toBe('member');
  });

  test('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@test.com', password: 'Password123!', name: 'First' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@test.com', password: 'Password123!', name: 'Second' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('rejects weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@test.com', password: 'short', name: 'Weak' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  test('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'Password123!', name: 'Bad Email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email format/i);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'no-name@test.com', password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with valid credentials', async () => {
    // Register first
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login-test@test.com', password: 'Password123!', name: 'Login Test' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login-test@test.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login-test@test.com');
  });

  test('rejects wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'wrong-pw@test.com', password: 'Password123!', name: 'Wrong PW' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong-pw@test.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  test('rejects non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.com', password: 'Password123!' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns current user with valid token', async () => {
    const user = createTestUser();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
  });

  test('rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/profile', () => {
  test('updates user name', async () => {
    const user = createTestUser();
    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });
});

describe('POST /api/auth/change-password', () => {
  test('changes password with correct current password', async () => {
    const res1 = await request(app)
      .post('/api/auth/register')
      .send({ email: 'pw-change@test.com', password: 'OldPass123!', name: 'PW Change' });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${res1.body.token}`)
      .send({ current_password: 'OldPass123!', new_password: 'NewPass456!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify new password works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pw-change@test.com', password: 'NewPass456!' });
    expect(loginRes.status).toBe(200);
  });

  test('rejects wrong current password', async () => {
    const user = await request(app)
      .post('/api/auth/register')
      .send({ email: 'pw-wrong@test.com', password: 'Correct123!', name: 'PW Wrong' });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${user.body.token}`)
      .send({ current_password: 'WrongPass!', new_password: 'NewPass456!' });

    expect(res.status).toBe(401);
  });
});
