<div align="center">

# HiveOps

### The self-hosted ops platform where AI agents actually do work.

**Tasks. Email. Workflows. Knowledge Base. One Docker container you own.**

[![CI](https://github.com/mamoor123/hiveops/actions/workflows/ci.yml/badge.svg)](https://github.com/mamoor123/hiveops/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-58%20passing-brightgreen)]()
[![Docker](https://img.shields.io/badge/docker-compose-blue)]()
[![Node](https://img.shields.io/badge/node-18+%20-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()

[Quick Start](#-quick-start-60-seconds) · [What It Does](#-what-it-does) · [Why HiveOps](#-why-hiveops) · [Architecture](#-architecture) · [API](#-api) · [Contributing](#-contributing)

</div>

---

## The Problem

You're paying for Trello + Notion + Gmail + Zapier + a chatbot tool.
Five tabs. Five bills. Five places where context goes to die.

**HiveOps replaces all of them with one thing you run yourself.**

> Stop renting your tools. Start owning them.

---

## What It Does

**AI Agents that execute, not just chat.**
Give each department an agent. Assign tasks. They run them — with retries, error handling, and dead letter queues. Not a chatbot. An actual worker.

**Workflow automation — no Zapier tax.**
Triggers (task created, schedule, user signup) meet conditions (priority, due date, field values) meet actions (notify, update, create tasks, send messages). Build your ops logic once.

**Real email — SMTP + IMAP.**
Inbox, sent, drafts, starred. AI drafts replies. IMAP polls for new mail. Not a mock. Real email.

**Everything else you need.**
Task management. Knowledge base. Real-time notifications via Socket.IO. JWT auth with role-based access. Dashboard with live stats.

---

## Why HiveOps

| | SaaS tools | HiveOps |
|---|---|---|
| **Cost** | $50-500/mo per tool | Free. Forever. |
| **Data** | Their servers | Your servers |
| **AI** | Separate subscription | Built-in agents |
| **Automation** | Zapier at $30+/mo | Included |
| **Setup** | Sign up, configure, integrate | `docker-compose up` |

**You own the code. You own the data. You own the infrastructure.**

---

## Quick Start (60 seconds)

```bash
git clone https://github.com/mamoor123/hiveops.git && cd hiveops
cp .env.example .env

# Generate a secret
openssl rand -base64 32   # paste into .env as JWT_SECRET

# Launch everything
docker-compose up --build
```

| Service | URL |
|---------|-----|
| **Dashboard** | http://localhost:3000 |
| **API** | http://localhost:3001 |
| **Health** | http://localhost:3001/api/health |

That's it. Postgres + API + Frontend. One command.

---

## Features

### AI Agents
- Per-department agents with custom system prompts
- Auto-execution loop: pending → execute → retry (3x, exponential backoff) → dead letter queue
- Agent-to-agent delegation for complex workflows
- Simulated fallback when no LLM API key configured
- Works with any OpenAI-compatible API (OpenAI, Ollama, local models)

### Task Management
- Priority levels: urgent, high, medium, low
- Status tracking: pending, in_progress, review, completed, blocked
- Assign to users or AI agents
- Comments, file attachments, due dates
- Retry tracking with error history

### Workflow Engine
- **Triggers:** task_created, task_completed, task_updated, user_registered, schedule_daily
- **Conditions:** equals, not_equals, contains, greater_than, less_than, past_due, exists
- **Actions:** notify user/manager/admin, update task fields, send channel message, create new task
- Execution logs with context snapshots

### Real-Time Chat
- Socket.IO with typing indicators
- Channel-based (general, department channels)
- Direct agent chat with message persistence

### Email System
- Full inbox / sent / drafts / starred
- AI-powered draft replies (LLM integration)
- IMAP inbound polling with auto-notifications
- SMTP outbound (Gmail, custom SMTP)
- Labels and search

### Knowledge Base
- Full-text search across articles
- Category-based organization
- CRUD with rich content support

### Scheduler
- Cron-based task execution (interval, daily, weekly)
- Auto-creates tasks and triggers agent execution
- Enable/disable per schedule

---

## Architecture

```
hiveops/
├── server/                       # Node.js + Express
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js             # Dual SQLite/PostgreSQL adapter
│   │   │   ├── logger.js         # Pino structured logging
│   │   │   └── migrate.js        # Versioned migrations
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT + role-based access
│   │   │   ├── rateLimit.js      # Brute-force protection
│   │   │   └── validate.js       # Input sanitization
│   │   ├── routes/               # 12 API route modules
│   │   └── services/
│   │       ├── ai-engine.js      # LLM integration
│   │       ├── email-real.js     # SMTP + IMAP
│   │       ├── execution-loop.js # Retry + backoff + DLQ
│   │       ├── scheduler.js      # DB-persisted cron
│   │       ├── workflows.js      # Rule engine
│   │       └── notifications.js  # Socket.IO broadcast
│   └── __tests__/                # 58 tests (Jest + Supertest)
│
├── web/                          # Next.js 14 (App Router)
│   ├── app/                      # 12 pages
│   ├── components/               # Shared UI
│   └── lib/                      # API client + auth
│
└── docker-compose.yml            # Postgres 16 + API + Web
```

### Database

Same API, two backends. Switch with one env var.

```javascript
const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const tasks = await db.prepare('SELECT * FROM tasks WHERE status = ?').all('pending');
```

| Mode | When | Best for |
|------|------|----------|
| SQLite | Default | Local dev, prototyping, <10 users |
| PostgreSQL | `DATABASE_URL` set | Production, scale, JSONB queries |

**14 tables:** users, departments, agents, tasks, task_comments, messages, knowledge_base, workflows, workflow_logs, emails, notifications, uploads, scheduled_tasks, schema_migrations

### Error Recovery

```
Task fails → retry (10s) → retry (20s) → retry (40s) → dead letter queue
                                                    ↓
                                            notify task creator
```

---

## Testing

```bash
cd server && npm test              # 58 tests
cd server && npm run test:coverage # with coverage
```

| Suite | Tests | Covers |
|-------|-------|--------|
| auth | 14 | Register, login, profile, password, tokens |
| tasks | 13 | CRUD, filters, comments, completion |
| workflows | 8 | CRUD, toggle, triggers, validation |
| ai | 11 | Chat, execution, delegation, agents |
| departments | 12 | Departments, knowledge, email |

---

## API

<details>
<summary><b>Auth</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/auth/me` | Current user profile |
| PUT | `/api/auth/profile` | Update profile |
| POST | `/api/auth/change-password` | Change password |

</details>

<details>
<summary><b>Tasks</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (filterable) |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/:id` | Task detail |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/:id/comments` | Add comment |

</details>

<details>
<summary><b>AI Agents</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create agent (admin) |
| POST | `/api/ai/chat/:agentId` | Chat with agent |
| POST | `/api/ai/execute/:taskId` | Execute task via agent |
| POST | `/api/ai/delegate` | Agent-to-agent delegation |

</details>

<details>
<summary><b>Workflows</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows` | Create workflow (admin) |
| PUT | `/api/workflows/:id` | Update workflow |
| POST | `/api/workflows/:id/toggle` | Enable/disable |
| GET | `/api/workflows/logs` | Execution history |

</details>

<details>
<summary><b>Email</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/email/folder/:folder` | List emails by folder |
| POST | `/api/email/send` | Send email |
| POST | `/api/email/:id/read` | Mark as read |
| POST | `/api/email/:id/star` | Toggle star |

</details>

<details>
<summary><b>Knowledge, Departments, Notifications</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/knowledge` | List articles |
| POST | `/api/knowledge/search` | Search articles |
| GET | `/api/departments` | List departments |
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Unread count |

</details>

---

## Environment Variables

<details>
<summary><b>Full reference</b></summary>

```bash
# Required
JWT_SECRET=your-secret-here

# Server
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000

# Database (pick one)
DB_PATH=./data/hiveops.db                              # SQLite
DATABASE_URL=postgres://user:pass@host:5432/hiveops    # PostgreSQL

# AI / LLM (any OpenAI-compatible API)
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=sk-...
DEFAULT_MODEL=gpt-4

# SMTP (outbound email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=you@gmail.com

# IMAP (inbound email)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=you@gmail.com
IMAP_PASS=your-app-password

# Logging
LOG_LEVEL=info

# Docker / PostgreSQL
POSTGRES_USER=hiveops
POSTGRES_PASSWORD=changeme
POSTGRES_DB=hiveops
```

</details>

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express |
| Frontend | Next.js 14, React 18, Tailwind |
| Database | SQLite / PostgreSQL 16 |
| Real-time | Socket.IO |
| Auth | JWT + bcrypt |
| AI | OpenAI-compatible API |
| Email | Nodemailer + ImapFlow |
| Testing | Jest + Supertest |
| Deploy | Docker, docker-compose |

---

## Roadmap

- [ ] Mobile-friendly responsive UI
- [ ] File upload management
- [ ] Calendar view for tasks
- [ ] Webhook integrations
- [ ] Multi-tenant support
- [ ] SSO (SAML/OIDC)

---

## Contributing

```bash
# Fork, clone, branch
git clone https://github.com/mamoor123/hiveops.git
git checkout -b feature/your-idea

# Test your changes
cd server && npm test

# Push and open a PR
```

All contributions welcome — features, bug fixes, docs, ideas.

---

<div align="center">

**If HiveOps saves you money, star the repo.**

[![Star](https://img.shields.io/github/stars/mamoor123/hiveops?style=social)](https://github.com/mamoor123/hiveops)

Made by [mamoor123](https://github.com/mamoor123)

</div>
