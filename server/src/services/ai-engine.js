/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

const db = require('../config/db');

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gpt-4';

async function callLLM(systemPrompt, userMessage, model = DEFAULT_MODEL, options = {}) {
  const apiKey = options.apiKey || LLM_API_KEY;
  const apiUrl = options.apiUrl || LLM_API_URL;
  if (!apiKey) return simulateResponse(systemPrompt, userMessage, model);
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: options.temperature || 0.7, max_tokens: options.maxTokens || 2000 }),
    });
    if (!response.ok) { const err = await response.text(); throw new Error(`LLM API error: ${response.status} - ${err}`); }
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('LLM call failed:', error.message);
    return `[Agent Error] Failed to generate response: ${error.message}`;
  }
}

function simulateResponse(systemPrompt, userMessage, model) {
  const agentRole = systemPrompt.split('\n')[0] || 'AI Agent';
  const timestamp = new Date().toISOString();
  return `🤖 **Agent Response** (simulated — no API key configured)\n\n**Task Analysis:**\nI've reviewed the task: "${userMessage.slice(0, 200)}..."\n\n**Approach:**\nBased on my role as ${agentRole.slice(0, 100)}, here's my recommended approach:\n\n1. **Research & Analysis** — Gather relevant data and context\n2. **Strategy Development** — Create actionable plan based on findings\n3. **Execution** — Implement the plan with measurable milestones\n4. **Review & Optimize** — Monitor results and iterate\n\n---\n*To enable real AI responses, set LLM_API_KEY and LLM_API_URL environment variables.*\n*Model: ${model} | Generated: ${timestamp}*`;
}

async function executeTask(taskId) {
  const task = await db.prepare(`SELECT t.*, a.name as agent_name, a.system_prompt, a.model, a.department_id as agent_dept_id FROM tasks t JOIN agents a ON t.assigned_agent_id = a.id WHERE t.id = ?`).get(taskId);
  if (!task) throw new Error('Task not found');
  if (!task.assigned_agent_id) throw new Error('Task has no assigned agent');

  const contextParts = [`Task: ${task.title}`, task.description ? `Description: ${task.description}` : '', `Priority: ${task.priority}`, `Status: ${task.status}`].filter(Boolean);

  if (task.department_id) {
    const dept = await db.prepare('SELECT * FROM departments WHERE id = ?').get(task.department_id);
    if (dept) contextParts.push(`Department: ${dept.name} — ${dept.description}`);
  }

  const comments = await db.prepare(`SELECT c.*, u.name as user_name, a.name as agent_name FROM task_comments c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN agents a ON c.agent_id = a.id WHERE c.task_id = ? ORDER BY c.created_at DESC LIMIT 5`).all(taskId);
  if (comments.length > 0) {
    contextParts.push('\nRecent context:');
    comments.reverse().forEach(c => { contextParts.push(`- ${c.user_name || c.agent_name || 'Unknown'}: ${c.content.slice(0, 200)}`); });
  }

  console.log(`🤖 Agent "${task.agent_name}" executing task #${taskId}: ${task.title}`);
  await db.prepare("UPDATE tasks SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);

  const response = await callLLM(task.system_prompt, contextParts.join('\n'), task.model);
  await db.prepare('INSERT INTO task_comments (task_id, agent_id, content) VALUES (?, ?, ?)').run(taskId, task.assigned_agent_id, response);
  await db.prepare("UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);

  return { taskId, agentId: task.assigned_agent_id, agentName: task.agent_name, response };
}

async function chatWithAgent(agentId, userMessage, channel = 'general') {
  const agent = await db.prepare('SELECT a.*, d.name as department_name FROM agents a LEFT JOIN departments d ON a.department_id = d.id WHERE a.id = ?').get(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.status !== 'active') return 'Agent is currently paused or offline.';

  const recentMessages = await db.prepare('SELECT * FROM messages WHERE channel = ? ORDER BY created_at DESC LIMIT 10').all(channel);
  let contextMessage = userMessage;
  if (recentMessages.length > 0) {
    const history = recentMessages.reverse().map(m => `${m.sender_type === 'agent' ? 'Agent' : 'User'}: ${m.content.slice(0, 200)}`).join('\n');
    contextMessage = `Recent conversation:\n${history}\n\nNew message:\n${userMessage}`;
  }

  const response = await callLLM(agent.system_prompt, contextMessage, agent.model);
  await db.prepare("INSERT INTO messages (channel, sender_type, sender_id, content) VALUES (?, 'agent', ?, ?)").run(channel, agentId, response);
  return response;
}

async function agentDelegate(fromAgentId, toAgentId, message, taskId = null) {
  const fromAgent = await db.prepare('SELECT * FROM agents WHERE id = ?').get(fromAgentId);
  const toAgent = await db.prepare('SELECT * FROM agents WHERE id = ?').get(toAgentId);
  if (!fromAgent || !toAgent) throw new Error('Agent not found');

  const response = await callLLM(`${toAgent.system_prompt}\n\nContext: You received a delegation from ${fromAgent.name} (${fromAgent.role}).`, `Delegation from ${fromAgent.name}:\n${message}`, toAgent.model);

  if (taskId) {
    await db.prepare('INSERT INTO task_comments (task_id, agent_id, content) VALUES (?, ?, ?)').run(taskId, fromAgentId, `📤 Delegated to ${toAgent.name}: ${message}`);
    await db.prepare('INSERT INTO task_comments (task_id, agent_id, content) VALUES (?, ?, ?)').run(taskId, toAgentId, `📥 Response from ${toAgent.name}: ${response}`);
  }

  return { from: fromAgent.name, to: toAgent.name, delegation: message, response };
}

module.exports = { callLLM, executeTask, chatWithAgent, agentDelegate };
