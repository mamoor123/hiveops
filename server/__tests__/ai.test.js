const request = require('supertest');
const { createTestApp, createAdminUser, createTestUser, cleanup, db } = require('./helpers/test-helper');

let app;
let admin;
let departmentId;
let agentId;

beforeAll(async () => {
  app = createTestApp();
  admin = await createAdminUser();
  const dept = await db.prepare("INSERT INTO departments (name, description, icon, color) VALUES ('Test Dept', 'Test', '🧪', '#000')").run();
  departmentId = dept.lastInsertRowid;
  const agent = await db.prepare("INSERT INTO agents (name, role, department_id, system_prompt, model, status) VALUES ('TestBot', 'Assistant', ?, 'You are a helpful assistant.', 'gpt-4', 'active')").run(departmentId);
  agentId = agent.lastInsertRowid;
});
afterAll(async () => { await cleanup(); });

describe('AI Agent Chat', () => {
  test('chats with agent (simulated)', async () => {
    const res = await request(app).post(`/api/ai/chat/${agentId}`).set('Authorization', `Bearer ${admin.token}`).send({ message: 'Hello', channel: 'general' });
    expect(res.status).toBe(200);
    expect(res.body.userMessage).toBeDefined();
    expect(res.body.agentResponse).toBeDefined();
  });

  test('rejects chat without message', async () => {
    const res = await request(app).post(`/api/ai/chat/${agentId}`).set('Authorization', `Bearer ${admin.token}`).send({ channel: 'general' });
    expect(res.status).toBe(400);
  });

  test('rejects chat with non-existent agent', async () => {
    const res = await request(app).post('/api/ai/chat/99999').set('Authorization', `Bearer ${admin.token}`).send({ message: 'Hello' });
    expect(res.status).toBe(400);
  });

  test('agent response stored in messages', async () => {
    await request(app).post(`/api/ai/chat/${agentId}`).set('Authorization', `Bearer ${admin.token}`).send({ message: 'Store this', channel: 'test-ch' });
    const res = await request(app).get('/api/ai/messages/test-ch').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AI Task Execution', () => {
  test('executes task assigned to agent', async () => {
    const task = await db.prepare("INSERT INTO tasks (title, assigned_agent_id, created_by) VALUES ('Test Exec', ?, ?)").run(agentId, admin.id);
    const res = await request(app).post(`/api/ai/execute/${task.lastInsertRowid}`).set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects non-existent task', async () => {
    const res = await request(app).post('/api/ai/execute/99999').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });
});

describe('AI Agent Delegation', () => {
  test('delegates between agents', async () => {
    const agent2 = await db.prepare("INSERT INTO agents (name, role, department_id, system_prompt, status) VALUES ('Bot2', 'Reviewer', ?, 'Review.', 'active')").run(departmentId);
    const res = await request(app).post('/api/ai/delegate').set('Authorization', `Bearer ${admin.token}`).send({ fromAgentId: agentId, toAgentId: agent2.lastInsertRowid, message: 'Review this' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects missing fields', async () => {
    const res = await request(app).post('/api/ai/delegate').set('Authorization', `Bearer ${admin.token}`).send({ fromAgentId: agentId });
    expect(res.status).toBe(400);
  });
});

describe('Agent Management', () => {
  test('lists agents', async () => {
    const res = await request(app).get('/api/agents').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('admin can create agent', async () => {
    const res = await request(app).post('/api/agents').set('Authorization', `Bearer ${admin.token}`).send({ name: 'New Bot', role: 'Helper', department_id: departmentId, system_prompt: 'Help.' });
    expect(res.status).toBe(201);
  });

  test('non-admin cannot create', async () => {
    const member = await createTestUser();
    const res = await request(app).post('/api/agents').set('Authorization', `Bearer ${member.token}`).send({ name: 'Nope', role: 'Nope', department_id: departmentId });
    expect(res.status).toBe(403);
  });
});
