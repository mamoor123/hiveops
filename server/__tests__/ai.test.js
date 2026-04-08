const request = require('supertest');
const { createTestApp, createAdminUser, createTestUser, cleanup, db } = require('./helpers/test-helper');

let app;
let admin;
let departmentId;
let agentId;

beforeAll(() => {
  app = createTestApp();
  admin = createAdminUser();

  // Create a department
  const dept = db.prepare(
    "INSERT INTO departments (name, description, icon, color) VALUES ('Test Dept', 'Test', '🧪', '#000')"
  ).run();
  departmentId = dept.lastInsertRowid;

  // Create an agent
  const agent = db.prepare(
    "INSERT INTO agents (name, role, department_id, system_prompt, model, status) VALUES ('TestBot', 'Assistant', ?, 'You are a helpful assistant.', 'gpt-4', 'active')"
  ).run(departmentId);
  agentId = agent.lastInsertRowid;
});

afterAll(() => {
  cleanup();
});

describe('AI Agent Chat', () => {
  test('chats with agent (simulated response)', async () => {
    const res = await request(app)
      .post(`/api/ai/chat/${agentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ message: 'Hello agent', channel: 'general' });

    expect(res.status).toBe(200);
    expect(res.body.userMessage).toBeDefined();
    expect(res.body.userMessage.content).toBe('Hello agent');
    expect(res.body.agentResponse).toBeDefined();
    expect(typeof res.body.agentResponse).toBe('string');
    expect(res.body.agentResponse.length).toBeGreaterThan(0);
  });

  test('rejects chat without message', async () => {
    const res = await request(app)
      .post(`/api/ai/chat/${agentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ channel: 'general' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/message/i);
  });

  test('rejects chat with non-existent agent', async () => {
    const res = await request(app)
      .post('/api/ai/chat/99999')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ message: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('agent response is stored in messages', async () => {
    await request(app)
      .post(`/api/ai/chat/${agentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ message: 'Store this', channel: 'test-channel' });

    const res = await request(app)
      .get('/api/ai/messages/test-channel')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2); // user message + agent response
  });
});

describe('AI Task Execution', () => {
  let taskId;

  test('executes a task assigned to an agent', async () => {
    // Create a task assigned to the agent
    const task = db.prepare(
      "INSERT INTO tasks (title, description, priority, assigned_agent_id, created_by) VALUES ('Test Execute', 'Do something', 'high', ?, ?)"
    ).run(agentId, admin.id);
    taskId = task.lastInsertRowid;

    const res = await request(app)
      .post(`/api/ai/execute/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.response).toBeDefined();
  });

  test('rejects execution of non-existent task', async () => {
    const res = await request(app)
      .post('/api/ai/execute/99999')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(400);
  });

  test('task comment is created with agent response', async () => {
    // Execute task first
    const task = db.prepare(
      "INSERT INTO tasks (title, assigned_agent_id, created_by) VALUES ('Comment Test', ?, ?)"
    ).run(agentId, admin.id);

    await request(app)
      .post(`/api/ai/execute/${task.lastInsertRowid}`)
      .set('Authorization', `Bearer ${admin.token}`);

    const comments = db.prepare(
      'SELECT * FROM task_comments WHERE task_id = ? AND agent_id = ?'
    ).all(task.lastInsertRowid, agentId);

    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].content.length).toBeGreaterThan(0);
  });
});

describe('AI Agent Delegation', () => {
  test('delegates between agents', async () => {
    // Create second agent
    const agent2 = db.prepare(
      "INSERT INTO agents (name, role, department_id, system_prompt, status) VALUES ('Bot2', 'Reviewer', ?, 'You review work.', 'active')"
    ).run(departmentId);

    const res = await request(app)
      .post('/api/ai/delegate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        fromAgentId: agentId,
        toAgentId: agent2.lastInsertRowid,
        message: 'Please review this task',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.from).toBeDefined();
    expect(res.body.to).toBeDefined();
    expect(res.body.response).toBeDefined();
  });

  test('rejects delegation with missing fields', async () => {
    const res = await request(app)
      .post('/api/ai/delegate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ fromAgentId: agentId });

    expect(res.status).toBe(400);
  });
});

describe('Agent Management', () => {
  test('lists agents', async () => {
    const res = await request(app)
      .get('/api/agents')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('admin can create agent', async () => {
    const res = await request(app)
      .post('/api/agents')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'New Bot',
        role: 'Helper',
        department_id: departmentId,
        system_prompt: 'Help users.',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Bot');
  });

  test('non-admin cannot create agent', async () => {
    const member = createTestUser();
    const res = await request(app)
      .post('/api/agents')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Nope', role: 'Nope', department_id: departmentId });

    expect(res.status).toBe(403);
  });
});
