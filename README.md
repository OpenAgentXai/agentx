# AgentX — AI Agent Identity & Access Management Platform

> Enterprise-grade identity, access control, and governance platform for autonomous AI agents.

AgentX solves the critical challenge of managing AI agent identities at scale: **Who is this agent? What can it do? What did it do? How do we control it?**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend                           │
│          Dashboard · Agents · Policies · Sandboxes              │
│          Groups · Audit · Collaboration · Settings              │
├──────────────────────┬──────────────────────────────────────────┤
│   Rust API (Axum)    │       Python Analytics (FastAPI)         │
│   • Auth (JWT/2FA)   │       • Anomaly Detection (IF/Z-score)  │
│   • Agent CRUD       │       • Behavior Analysis               │
│   • ABAC Policies    │       • Report Generation               │
│   • Sandboxing       │       • Real-time Risk Scoring          │
│   • Credentials      │                                         │
│   • Audit Logging    │                                         │
│   • WebSocket Live   │                                         │
├──────────────────────┴──────────────────────────────────────────┤
│  PostgreSQL 16          │  Redis 7                              │
│  • 16 tables            │  • Sessions & Rate Limiting           │
│  • 17 enum types        │  • Policy Cache                       │
│  • 31 indexes           │  • Token Blacklisting                 │
│  • Auto-updated_at      │  • Real-time Pub/Sub                  │
└─────────────────────────┴───────────────────────────────────────┘
```

## Features

### Agent Identity Lifecycle
- **Create** agents with types: Autonomous, Supervised, Collaborative, Restricted
- **Manage** through states: Active → Suspended → Revoked → Archived
- **Monitor** with real-time metrics, activity logs, and anomaly detection
- **Group** agents for batch policy assignment

### Attribute-Based Access Control (ABAC)
- **Policies** with Allow/Deny effects, resource patterns, action lists
- **Conditions** — IP ranges, time windows, custom attributes
- **Priority-based** evaluation with deny-overrides
- **Simulator** — test policies before deployment
- **Assignments** to individual agents or groups

### Credential Management
- **API Keys** — secure generation with Argon2 hashing
- **JWT Tokens** — access + refresh with automatic rotation
- **Certificates** — support for mTLS authentication
- **Rotation** — zero-downtime credential rotation
- **Expiration** — configurable TTL with auto-revocation

### Sandboxing & Isolation
- **Resource Limits** — CPU, memory, storage, network bandwidth
- **Network Policies** — allowed hosts/ports, egress filtering
- **Dry-Run Mode** — test agent actions without side effects
- **Snapshots** — save and restore sandbox states
- **Metrics** — real-time resource usage monitoring

### Security & Audit
- **Comprehensive Audit Log** — every action recorded with actor, resource, status
- **Alert Rules** — threshold, anomaly, and pattern-based alerts
- **Export** — JSON/CSV export for compliance
- **2FA** — TOTP-based two-factor authentication
- **Rate Limiting** — per-IP and per-agent sliding window

### AI-Powered Analytics
- **Anomaly Detection** — Isolation Forest + statistical methods
- **Behavior Profiling** — learn normal patterns per agent
- **Risk Scoring** — real-time risk assessment on every action
- **Reports** — automated daily/weekly/monthly analytics

### Inter-Agent Collaboration
- **Channels** — direct, group, and broadcast communication
- **Messages** — text, commands, data exchange, handoff
- **Visibility** — public, private, restricted channels
- **Handoff Protocol** — structured agent-to-agent task delegation

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | React SPA with SSR |
| UI | Tailwind CSS + Recharts | Responsive design + data viz |
| State | Zustand + React Query | Client state + server cache |
| API | Rust (Axum) | High-performance REST + WebSocket |
| Analytics | Python (FastAPI) | ML-powered anomaly detection |
| Database | PostgreSQL 16 | Primary data store |
| Cache | Redis 7 | Sessions, rate limiting, pub/sub |
| Auth | JWT + Argon2 + AES-256-GCM | Authentication + encryption |
| Infra | Docker Compose | Container orchestration |
| CI/CD | GitHub Actions | Automated testing + deployment |

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Make (optional)

### Launch

```bash
# Clone the repository
git clone https://github.com/your-org/agentx.git
cd agentx

# Copy environment variables
cp .env.example .env

# Start all services
make dev

# Or without Make:
docker compose -f infra/docker-compose.yml up --build
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Rust API | http://localhost:8080 |
| Python Analytics | http://localhost:8081 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Demo Credentials

```
Email: admin@agentx.dev
Password: AgentX2024!
```

### Database Setup

```bash
# Run migrations
make migrate

# Seed demo data
make seed

# Or reset everything
make db-reset
```

## Project Structure

```
agentx/
├── backend/
│   ├── rust-api/                    # Rust API server
│   │   ├── src/
│   │   │   ├── main.rs             # Application entry point
│   │   │   ├── models/             # Data models & request schemas
│   │   │   │   ├── user.rs         # User, Auth, JWT Claims
│   │   │   │   ├── agent.rs        # Agent, AgentType, AgentStatus
│   │   │   │   ├── credential.rs   # Credentials, rotation
│   │   │   │   ├── group.rs        # Agent groups, membership
│   │   │   │   ├── policy.rs       # ABAC policies, simulation
│   │   │   │   ├── sandbox.rs      # Sandbox, snapshots, limits
│   │   │   │   ├── audit.rs        # Audit logs, alerts
│   │   │   │   └── channel.rs      # Collaboration channels
│   │   │   ├── routes/             # API route handlers
│   │   │   │   ├── auth.rs         # Register, login, 2FA, tokens
│   │   │   │   ├── agents.rs       # Agent CRUD + lifecycle
│   │   │   │   ├── credentials.rs  # Credential management
│   │   │   │   ├── groups.rs       # Group management
│   │   │   │   ├── policies.rs     # Policy CRUD + simulate
│   │   │   │   ├── sandboxes.rs    # Sandbox management
│   │   │   │   ├── audit.rs        # Audit log queries
│   │   │   │   ├── dashboard.rs    # Stats + WebSocket live feed
│   │   │   │   ├── agent_api.rs    # Agent-facing API
│   │   │   │   └── health.rs       # Health check
│   │   │   ├── middleware/         # Request middleware
│   │   │   │   ├── auth.rs         # JWT + API key validation
│   │   │   │   ├── rate_limit.rs   # Redis sliding window
│   │   │   │   └── audit.rs        # Automatic audit logging
│   │   │   └── utils/             # Shared utilities
│   │   │       ├── crypto.rs       # Argon2, AES-256-GCM, keys
│   │   │       ├── errors.rs       # Error types + responses
│   │   │       └── response.rs     # Response helpers
│   │   └── Cargo.toml
│   └── python-services/            # Python analytics
│       ├── app/
│       │   ├── main.py             # FastAPI application
│       │   ├── models/schemas.py   # Pydantic models
│       │   └── services/
│       │       ├── database.py     # Database connection
│       │       ├── anomaly_detector.py  # ML anomaly detection
│       │       ├── behavior_analyzer.py # Agent behavior profiling
│       │       └── report_generator.py  # Analytics reports
│       └── requirements.txt
├── frontend/                       # Next.js application
│   ├── src/
│   │   ├── app/                   # Pages (App Router)
│   │   │   ├── dashboard/         # Main dashboard
│   │   │   ├── agents/            # Agent list + detail
│   │   │   ├── policies/          # Policy management
│   │   │   ├── sandboxes/         # Sandbox management
│   │   │   ├── groups/            # Group management
│   │   │   ├── audit/             # Audit log viewer
│   │   │   ├── collaboration/     # Agent collaboration
│   │   │   ├── settings/          # Org settings
│   │   │   ├── login/             # Auth pages
│   │   │   └── register/
│   │   ├── components/
│   │   │   ├── ui/                # Reusable UI components
│   │   │   └── layout/            # Layout components
│   │   ├── hooks/                 # React Query hooks
│   │   ├── stores/                # Zustand stores
│   │   └── lib/                   # Utilities + API client
│   ├── package.json
│   └── tailwind.config.ts
├── database/
│   ├── migrations/001_initial.sql  # Schema + indexes
│   └── seeds/001_demo.sql          # Demo data
├── infra/
│   ├── docker-compose.yml          # All services
│   ├── Dockerfile.rust             # Multi-stage Rust build
│   ├── Dockerfile.python           # Python service
│   ├── Dockerfile.frontend         # Multi-stage Next.js build
│   └── .github/workflows/ci.yml    # GitHub Actions CI/CD
├── docs/
│   └── API.md                      # API documentation
├── .env.example                    # Environment template
├── Makefile                        # Development commands
└── README.md                       # This file
```

## API Overview

### Authentication
```
POST   /api/v1/auth/register          # Create account
POST   /api/v1/auth/login             # Login (returns JWT)
POST   /api/v1/auth/logout            # Logout (blacklists token)
POST   /api/v1/auth/refresh           # Refresh access token
POST   /api/v1/auth/2fa/setup         # Enable 2FA (TOTP)
POST   /api/v1/auth/2fa/verify        # Verify 2FA code
```

### Agents
```
GET    /api/v1/agents                  # List agents (paginated)
POST   /api/v1/agents                  # Create agent
GET    /api/v1/agents/:id              # Get agent details
PUT    /api/v1/agents/:id              # Update agent
DELETE /api/v1/agents/:id              # Delete agent
POST   /api/v1/agents/:id/suspend      # Suspend agent
POST   /api/v1/agents/:id/activate     # Activate agent
POST   /api/v1/agents/:id/revoke       # Revoke agent
GET    /api/v1/agents/:id/activity     # Agent activity log
GET    /api/v1/agents/:id/metrics      # Agent metrics
```

### Credentials
```
GET    /api/v1/agents/:id/credentials          # List credentials
POST   /api/v1/agents/:id/credentials          # Create (key returned once)
POST   /api/v1/agents/:id/credentials/:cid/revoke   # Revoke
POST   /api/v1/agents/:id/credentials/:cid/rotate   # Rotate (atomic)
```

### Policies
```
GET    /api/v1/policies                # List policies
POST   /api/v1/policies                # Create policy
GET    /api/v1/policies/:id            # Get policy
PUT    /api/v1/policies/:id            # Update policy
DELETE /api/v1/policies/:id            # Delete policy
POST   /api/v1/policies/simulate       # Simulate policy evaluation
POST   /api/v1/policies/:id/assign     # Assign to agent/group
DELETE /api/v1/policies/:id/assign/:tid # Unassign
```

### Groups
```
GET    /api/v1/groups                  # List groups
POST   /api/v1/groups                  # Create group
GET    /api/v1/groups/:id              # Get group + members
PUT    /api/v1/groups/:id              # Update group
DELETE /api/v1/groups/:id              # Delete group
POST   /api/v1/groups/:id/agents       # Add agent to group
DELETE /api/v1/groups/:id/agents/:aid   # Remove agent
```

### Sandboxes
```
GET    /api/v1/sandboxes               # List sandboxes
POST   /api/v1/sandboxes               # Create sandbox
GET    /api/v1/sandboxes/:id           # Get sandbox
PUT    /api/v1/sandboxes/:id           # Update sandbox
DELETE /api/v1/sandboxes/:id           # Delete sandbox
POST   /api/v1/sandboxes/:id/snapshots # Create snapshot
POST   /api/v1/sandboxes/:id/restore/:sid # Restore from snapshot
GET    /api/v1/sandboxes/:id/metrics   # Resource usage
```

### Audit
```
GET    /api/v1/audit                   # List audit logs
GET    /api/v1/audit/:id               # Get log detail
GET    /api/v1/audit/export            # Export (JSON/CSV)
GET    /api/v1/audit/alerts            # List alerts
POST   /api/v1/audit/alerts/rules      # Create alert rule
```

### Dashboard
```
GET    /api/v1/dashboard/overview      # Stats summary
GET    /api/v1/dashboard/metrics       # Charts data
WS     /api/v1/dashboard/live          # WebSocket live feed
```

### Agent API (for agents themselves)
```
POST   /agent/v1/authenticate          # Agent auth via API key
POST   /agent/v1/permissions/check     # Check permissions
POST   /agent/v1/actions/declare       # Declare action (+ dry-run)
POST   /agent/v1/messages/send         # Send message
GET    /agent/v1/messages              # Receive messages
```

### Analytics (Python service)
```
GET    /analytics/anomalies/:org_id    # Get anomalies
GET    /analytics/behavior/:agent_id   # Behavior profile
POST   /analytics/detect               # Real-time detection
GET    /analytics/reports/:org_id      # Generate report
```

## Security Model

### Authentication Flow
1. User registers with email/password (Argon2 hashed)
2. Login returns JWT access token (15min) + refresh token (7d)
3. Optional 2FA via TOTP (Google Authenticator compatible)
4. Agents authenticate via API keys (prefix-based lookup + full hash verify)

### Authorization (ABAC)
1. Agent declares an action with resource + action + context
2. Policy engine fetches all applicable policies (direct + group assignments)
3. Policies evaluated by priority (highest first)
4. **Deny-overrides**: any matching Deny policy blocks the action
5. If no Deny matches and at least one Allow matches → permitted
6. Default deny if no policies match

### Encryption
- **Passwords**: Argon2id with per-user salt
- **API Keys**: SHA-256 hash stored, raw key returned once at creation
- **Sensitive Data**: AES-256-GCM with random nonce per encryption
- **Tokens**: RS256 JWT with configurable expiration

## Development

### Local Development (without Docker)

```bash
# Rust API
cd backend/rust-api
cargo run

# Python Analytics
cd backend/python-services
pip install -r requirements.txt
uvicorn app.main:app --port 8081

# Frontend
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
make test          # All tests
make test-rust     # Rust unit + integration tests
make test-python   # Python tests
make test-frontend # Frontend tests
```

### Linting

```bash
make lint          # All linters
```

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — JWT signing secret (min 32 chars)
- `ENCRYPTION_KEY` — AES-256 key (hex-encoded, 64 chars)
- `RUST_LOG` — Logging level (info, debug, trace)

## License

MIT License. See LICENSE for details.

---

Built with Rust, Python, Next.js, PostgreSQL, and Redis.
