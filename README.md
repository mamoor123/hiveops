# 🏢 Company OS

AI-Powered Company Operating System — automate and manage entire business operations through intelligent AI agents.

A fully-featured web application with real-time notifications, task management, AI agent execution, knowledge base, email, workflow automation, analytics, file uploads, and an admin system panel.

## What's New in v0.3.0 (Production Hardening)

- **Testing** — 68 Jest + Supertest tests across 5 test suites (auth, tasks, workflows, AI, departments/knowledge/email)
- **Database Migrations** — Versioned migration system with performance indexes (30+ indexes), retry fields, scheduled tasks table
- **Error Recovery** — Retry with exponential backoff, dead letter queue after max retries, task execution timeouts
- **Graceful Shutdown** — SIGTERM/SIGINT handlers cleanly stop HTTP, Socket.IO, background services, and DB
- **Real Email** — Nodemailer SMTP outbound + ImapFlow IMAP inbound polling, falls back to SQLite-only when unconfigured
- **Persistent Scheduler** — Schedules stored in DB (survives restarts), no more in-memory Map
- **DB Hardening** — WAL mode + busy_timeout + 64MB cache + memory-mapped I/O + configurable pragma

## Architecture

```
company-os/
├── server/                          # Express API + Socket.IO + SQLite
│   ├── __tests__/                   # Jest test suite
│   │   ├── helpers/test-helper.js   # Isolated test app + DB
│   │   ├── auth.test.js             # 14 auth tests
│   │   ├── tasks.test.js            # 13 task tests
│   │   ├── workflows.test.js        # 11 workflow tests
│   │   ├── ai.test.js               # 12 AI/agent tests
│   │   └── departments.test.js      # 18 dept/knowledge/email tests
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                # SQLite connection (WAL + pragmas)
│   │   │   └── migrate.js           # Versioned migration runner
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT auth + role-based access
│   │   │   ├── rateLimit.js         # Auth endpoint rate limiting
│   │   │   └── validate.js          # Input validation & sanitization
│   │   ├── routes/
│   │   │   ├── auth.js              # Register, login, profile, password, roles
│   │   │   ├── departments.js       # Department CRUD
│   │   │   ├── tasks.js             # Tasks + comments + notifications
│   │   │   ├── agents.js            # AI agent management
│   │   │   ├── dashboard.js         # Stats + activity data
│   │   │   ├── ai.js                # AI chat + execution + delegation
│   │   │   ├── knowledge.js         # Knowledge base CRUD + search
│   │   │   ├── email.js             # Email read/send/AI draft (SMTP/IMAP)
│   │   │   ├── workflows.js         # Workflow CRUD + triggers
│   │   │   ├── notifications.js     # Notification API
│   │   │   ├── uploads.js           # File upload/download
│   │   │   └── system.js            # Admin: LLM config, execution loop, scheduler
│   │   ├── services/
│   │   │   ├── ai-engine.js         # LLM integration (OpenAI-compatible)
│   │   │   ├── email-real.js        # Email service (SMTP + IMAP + SQLite)
│   │   │   ├── workflows.js         # Workflow engine (SQLite-backed)
│   │   │   ├── notifications.js     # Notification broadcast via Socket.IO
│   │   │   ├── execution-loop.js    # Auto task execution (retry + backoff + DLQ)
│   │   │   └── scheduler.js         # Cron scheduler (DB-persisted)
│   │   └── index.js                 # Entry point + Socket.IO + graceful shutdown
│   ├── jest.config.js
│   ├── Dockerfile
│   └── package.json
├── web/                             # Next.js 14 frontend
│   ├── app/                         # 12 pages (App Router)
│   ├── components/                  # 5 shared components
│   ├── lib/                         # API client + auth context
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — JWT_SECRET is required
# Generate one: openssl rand -base64 32
```

### 2. Development (without Docker)

```bash
# Install dependencies
cd server && npm install && cd ..
cd web && npm install && cd ..

# Run migrations (creates DB + tables + indexes)
cd server && npm run migrate

# Run server (terminal 1)
cd server && JWT_SECRET=your-secret npm run dev

# Run web (terminal 2)
cd web && npm run dev
```

### 3. Production (Docker)

```bash
JWT_SECRET=your-secret docker-compose up --build
```

### Access
- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001
- **Health check:** http://localhost:3001/api/health

## Testing

```bash
# Run all tests (68 tests)
cd server && npm test

# Run with coverage
cd server && npm run test:coverage

# Watch mode
cd server && npm run test:watch
```

**Test coverage:**
- `auth.test.js` — Registration, login, profile, password change, token validation (14 tests)
- `tasks.test.js` — CRUD, filtering, comments, completion, deletion (13 tests)
- `workflows.test.js` — CRUD, toggle, stats, manual triggers (11 tests)
- `ai.test.js` — Agent chat, task execution, delegation, agent management (12 tests)
- `departments.test.js` — Departments, knowledge base, email (18 tests)

## Error Recovery

The execution loop includes production-grade error handling:

- **Retry with exponential backoff** — Failed tasks retry up to 3 times with delays of 10s, 20s, 40s
- **Dead letter queue** — Tasks that exhaust retries are marked as permanently failed with error details
- **Execution timeout** — Each task execution has a configurable timeout (default 2 minutes)
- **Graceful degradation** — LLM failures don't crash the server; tasks are retried or dead-lettered
- **Notification on failure** — Task creators are notified of retries and dead-lettering

## Database Migrations

Schema is managed through versioned migrations in `src/config/migrate.js`:

| Migration | Description |
|-----------|-------------|
| v1 | Initial schema (12 tables) |
| v2 | Performance indexes (30+ indexes on common queries) |
| v3 | Task retry fields (retry_count, max_retries, last_error, timeout) |
| v4 | scheduled_tasks table (DB-persisted cron) |
| v5 | Email IMAP fields (message_id, uid) |

```bash
# Run migrations manually
cd server && npm run migrate

# Migrations run automatically on server startup
```

## Real Email (SMTP + IMAP)

When SMTP is configured, emails are sent via real mail servers:

```bash
# .env — Outbound (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# .env — Inbound (IMAP polling)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASS=your-app-password
IMAP_POLL_INTERVAL_MS=60000
```

Without SMTP/IMAP config, email falls back to SQLite-only (stored locally, no real sending).

## Features

### 🔐 Security
- JWT authentication with required secret (no default fallback)
- bcrypt password hashing (10 rounds)
- Role-based access control (admin, manager, member)
- Auth rate limiting (20 attempts per 15 minutes)
- Configurable CORS origin
- Input validation and sanitization middleware
- Dangerous file type blocking on uploads
- Global error handler
- Helmet HTTP security headers

### 🏢 Departments
- CRUD with name, description, icon, color
- Expandable detail view: members, agents, tasks
- Member count, agent count, active task stats
- Admin-only creation and deletion

### 📋 Tasks
- Full CRUD with priority (urgent/high/medium/low) and status (pending/in_progress/review/completed/blocked)
- Assign to users or AI agents
- Due dates with overdue detection
- Retry tracking with exponential backoff
- Task detail modal with:
  - Inline status changes
  - Comment/activity feed
  - File attachments (upload, download, delete)
- Notifications on assignment, completion, and comments

### 🤖 AI Agents
- Per-department agent configuration
- System prompt editor with character count
- Model selection (GPT-4, Claude, Llama, Mistral, etc.)
- Status management (active/paused/offline)
- Task execution with context (task details, comments, department)
- Agent-to-agent delegation
- Graceful fallback to simulated responses when no API key

### ⚡ Auto-Execution Loop
- Background service checks every 30 seconds
- Auto-executes tasks assigned to active agents
- Priority-ordered (urgent first)
- Max 3 concurrent executions
- Retry with exponential backoff (10s, 20s, 40s)
- Dead letter queue after max retries
- Execution timeout (configurable, default 2min)
- Auto-notifies on completion, failure, retry, and dead-letter
- Admin start/stop toggle + manual run trigger
- Detailed execution stats (total, succeeded, failed, retried, dead-lettered)

### ⏰ Cron Scheduler
- DB-persisted (survives restarts)
- Three schedule types: daily, weekly, interval
- Per-schedule agent assignment and priority
- Auto-calculates next run time
- Full CRUD via admin Settings panel

### 💬 Real-Time Chat
- Socket.IO-powered with typing indicators
- Channel-based (general, custom channels)
- Direct agent chat with AI responses
- Message history persistence
- Agent selection sidebar

### 📚 Knowledge Base
- Article CRUD with rich content
- Department and category filtering
- Full-text search
- Tags system
- Category colors (general, guide, policy, training, reference, process)

### 📧 Email
- Inbox, Sent, Drafts, Starred folders
- Compose and reply (via SMTP when configured)
- AI-generated draft replies (uses LLM when configured)
- Search across emails
- Label system, star toggle
- IMAP inbound polling (when configured)

### ⚡ Workflow Engine
- Trigger-based automation (task_created, task_completed, schedule_daily, user_registered, etc.)
- Configurable conditions (equals, contains, greater_than, past_due, exists)
- Action types: notify, update_task, send_message, create_task
- Enable/disable toggle
- Execution log with history
- SQLite-persisted (not in-memory)

### 📈 Analytics, 🔔 Notifications, 🔍 Command Palette, 📎 File Uploads, ⚙️ Admin Panel
(See original README for details on these features)

## Database Schema (13 Tables)

| Table | Description |
|-------|-------------|
| `users` | Authentication, roles, profiles |
| `departments` | Organizational units |
| `agents` | AI agent configurations |
| `tasks` | Task management with assignments + retry tracking |
| `task_comments` | Task activity and agent responses |
| `messages` | Chat message history |
| `knowledge_base` | Articles and documentation |
| `workflows` | Automation rules |
| `workflow_logs` | Execution history |
| `emails` | Email storage (SQLite + IMAP fields) |
| `notifications` | User notifications |
| `uploads` | File attachment metadata |
| `scheduled_tasks` | DB-persisted cron schedules |
| `schema_migrations` | Migration version tracking |

## API Endpoints (50+)

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register (rate-limited) |
| POST | `/api/auth/login` | Login (rate-limited) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth` | List users |
| PUT | `/api/auth/profile` | Update profile |
| POST | `/api/auth/change-password` | Change password |
| PUT | `/api/auth/:id/role` | Update user role (admin) |

### Departments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/departments` | List with counts |
| POST | `/api/departments` | Create (admin) |
| GET | `/api/departments/:id` | Detail with members/agents/tasks |
| PUT | `/api/departments/:id` | Update (admin) |
| DELETE | `/api/departments/:id` | Delete (admin) |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List with filters |
| POST | `/api/tasks` | Create (+ notify assignee) |
| GET | `/api/tasks/:id` | Single task detail |
| PUT | `/api/tasks/:id` | Update (+ notify on status change) |
| DELETE | `/api/tasks/:id` | Delete |
| POST | `/api/tasks/:id/comments` | Add comment (+ notify) |
| GET | `/api/tasks/:id/comments` | Get comments |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List with department info |
| POST | `/api/agents` | Create (admin) |
| PUT | `/api/agents/:id` | Update (admin) |
| DELETE | `/api/agents/:id` | Delete (admin) |

### AI Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/execute/:taskId` | Execute task with agent |
| POST | `/api/ai/chat/:agentId` | Chat with agent |
| POST | `/api/ai/delegate` | Agent-to-agent delegation |
| GET | `/api/ai/messages/:channel` | Chat history |
| GET | `/api/ai/channels` | List channels |

### Knowledge Base
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/knowledge` | List with filters |
| POST | `/api/knowledge` | Create article |
| GET | `/api/knowledge/:id` | Single article |
| PUT | `/api/knowledge/:id` | Update article |
| DELETE | `/api/knowledge/:id` | Delete article |
| POST | `/api/knowledge/search` | Search articles |

### Email
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/email/:folder` | List by folder |
| GET | `/api/email/item/:id` | Single email |
| POST | `/api/email/send` | Send email (SMTP when configured) |
| POST | `/api/email/draft` | Save draft |
| POST | `/api/email/:id/star` | Toggle star |
| POST | `/api/email/:id/move` | Move to folder |
| POST | `/api/email/:id/draft-reply` | AI draft reply (LLM when configured) |
| GET | `/api/email/meta/health` | SMTP/IMAP status |

### Workflows
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows` | Create (admin) |
| PUT | `/api/workflows/:id` | Update (admin) |
| DELETE | `/api/workflows/:id` | Delete (admin) |
| POST | `/api/workflows/:id/toggle` | Enable/disable (admin) |
| POST | `/api/workflows/trigger/:trigger` | Manual trigger |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| POST | `/api/notifications/:id/read` | Mark read |
| POST | `/api/notifications/read-all` | Mark all read |

### Uploads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/uploads` | Upload file |
| GET | `/api/uploads/task/:taskId` | List task files |
| GET | `/api/uploads/:id/download` | Download file |
| DELETE | `/api/uploads/:id` | Delete file |

### System (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/status` | Server + LLM + loop status |
| POST | `/api/system/test-llm` | Test LLM connection |
| POST | `/api/system/execution-loop/toggle` | Start/stop auto-execution |
| POST | `/api/system/execution-loop/run` | Manual execution cycle |
| GET | `/api/system/schedules` | List schedules |
| POST | `/api/system/schedules` | Create schedule |
| PUT | `/api/system/schedules/:id` | Update schedule |
| DELETE | `/api/system/schedules/:id` | Delete schedule |
| POST | `/api/system/schedules/:id/toggle` | Toggle schedule |

## Environment Variables

```bash
# Required
JWT_SECRET=your-secret-here          # Generate: openssl rand -base64 32

# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DB_PATH=./data/company-os.db

# LLM (optional — simulated responses when not set)
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=sk-...
DEFAULT_MODEL=gpt-4

# SMTP (optional — outbound email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# IMAP (optional — inbound email polling)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=your-email@gmail.com
IMAP_PASS=your-app-password
IMAP_POLL_INTERVAL_MS=60000

# Frontend (web/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, SQLite (better-sqlite3) |
| Frontend | Next.js 14 (App Router), React 18 |
| Styling | Tailwind CSS, CSS custom properties |
| Real-time | Socket.IO (chat, notifications, typing) |
| Auth | JWT + bcrypt |
| Database | SQLite with WAL mode + migrations |
| AI Engine | OpenAI-compatible API (pluggable) |
| Email | Nodemailer (SMTP) + ImapFlow (IMAP) |
| File Upload | Multer |
| Testing | Jest + Supertest |
| Deployment | Docker, docker-compose |
| Security | Helmet, CORS, rate limiting, input validation |

## License

MIT
