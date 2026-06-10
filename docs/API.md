# AgentX API Documentation

## Base URL

```
Production:  https://api.agentx.dev
Development: http://localhost:8080
Analytics:   http://localhost:8081
```

## Authentication

All platform endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Agent API endpoints use an API key in the `X-Agent-Key` header:

```
X-Agent-Key: agx_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Platform API (`/api/v1`)

### Auth

#### POST /api/v1/auth/register

Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "organization_name": "Acme Corp"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "admin",
      "organization_id": "uuid"
    },
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "token_type": "Bearer",
    "expires_in": 900
  }
}
```

#### POST /api/v1/auth/login

Authenticate with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "user": { ... },
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "token_type": "Bearer",
    "expires_in": 900
  }
}
```

If 2FA is enabled, returns a pending token:
```json
{
  "status": "success",
  "data": {
    "requires_2fa": true,
    "pending_token": "eyJhbG..."
  }
}
```

#### POST /api/v1/auth/2fa/verify

Complete 2FA verification.

**Request:**
```json
{
  "pending_token": "eyJhbG...",
  "code": "123456"
}
```

#### POST /api/v1/auth/refresh

Refresh an expired access token.

**Request:**
```json
{
  "refresh_token": "eyJhbG..."
}
```

#### POST /api/v1/auth/logout

Invalidate the current token.

**Headers:** `Authorization: Bearer <token>`

#### POST /api/v1/auth/2fa/setup

Initialize TOTP 2FA setup.

**Response:**
```json
{
  "status": "success",
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qr_url": "otpauth://totp/AgentX:user@example.com?secret=..."
  }
}
```

---

### Agents

#### GET /api/v1/agents

List agents with pagination and filtering.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | int | Page number (default: 1) |
| per_page | int | Items per page (default: 20, max: 100) |
| search | string | Search by name or description |
| status | string | Filter by status |
| agent_type | string | Filter by type |

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "name": "Data Analyzer",
      "description": "Analyzes data pipelines",
      "agent_type": "autonomous",
      "status": "active",
      "tags": ["ml", "data"],
      "max_requests_per_minute": 60,
      "max_requests_per_day": 10000,
      "last_active_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
```

#### POST /api/v1/agents

Create a new agent.

**Request:**
```json
{
  "name": "Data Analyzer",
  "description": "Analyzes data pipelines",
  "agent_type": "autonomous",
  "tags": ["ml", "data"],
  "max_requests_per_minute": 60,
  "max_requests_per_day": 10000
}
```

**Agent Types:** `autonomous`, `supervised`, `collaborative`, `restricted`

#### GET /api/v1/agents/:id

Get agent details including metrics summary.

#### PUT /api/v1/agents/:id

Update agent properties.

**Request (partial update):**
```json
{
  "description": "Updated description",
  "tags": ["ml", "data", "production"],
  "max_requests_per_minute": 120
}
```

#### DELETE /api/v1/agents/:id

Delete an agent (must be revoked or archived first).

#### POST /api/v1/agents/:id/suspend

Temporarily suspend an agent.

#### POST /api/v1/agents/:id/activate

Re-activate a suspended agent.

#### POST /api/v1/agents/:id/revoke

Permanently revoke an agent's access.

#### GET /api/v1/agents/:id/activity

Get recent audit log entries for this agent.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | int | Page number |
| per_page | int | Items per page |

#### GET /api/v1/agents/:id/metrics

Get agent performance metrics.

**Response:**
```json
{
  "status": "success",
  "data": {
    "requests_today": 1234,
    "requests_week": 8765,
    "error_rate": 2.3,
    "avg_response_ms": 45,
    "hourly_activity": [
      { "hour": 0, "requests": 12, "errors": 0 },
      { "hour": 1, "requests": 8, "errors": 1 }
    ],
    "daily_activity": [
      { "date": "2024-01-15", "requests": 450, "errors": 12 }
    ]
  }
}
```

---

### Credentials

#### GET /api/v1/agents/:id/credentials

List all credentials for an agent (keys are never returned after creation).

#### POST /api/v1/agents/:id/credentials

Create a new credential. **The API key is only returned in this response.**

**Request:**
```json
{
  "name": "Production Key",
  "credential_type": "api_key",
  "expires_in_days": 90
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Production Key",
    "credential_type": "api_key",
    "key": "agx_abc123def456ghi789...",
    "key_prefix": "agx_abc1",
    "expires_at": "2024-04-15T00:00:00Z",
    "created_at": "2024-01-15T00:00:00Z"
  }
}
```

**Credential Types:** `api_key`, `jwt`, `certificate`

#### POST /api/v1/agents/:id/credentials/:cid/revoke

Revoke a credential (immediate effect).

#### POST /api/v1/agents/:id/credentials/:cid/rotate

Rotate a credential atomically. Creates a new credential, revokes the old one, and returns the new key.

---

### Policies

#### GET /api/v1/policies

List all policies for the organization.

#### POST /api/v1/policies

Create a new ABAC policy.

**Request:**
```json
{
  "name": "Allow Data Read",
  "description": "Allow reading data resources",
  "effect": "allow",
  "resources": ["api:data:*", "api:reports:read"],
  "actions": ["read", "list"],
  "conditions": {
    "ip_range": "10.0.0.0/8",
    "time_window": "09:00-17:00"
  },
  "priority": 10
}
```

#### PUT /api/v1/policies/:id

Update policy (partial update supported).

#### DELETE /api/v1/policies/:id

Delete a policy.

#### POST /api/v1/policies/simulate

Test policy evaluation without side effects.

**Request:**
```json
{
  "agent_id": "uuid",
  "resource": "api:users:read",
  "action": "read",
  "context": {
    "ip": "10.0.1.50",
    "time": "14:30"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "allowed": true,
    "effective_effect": "allow",
    "matching_policies": [
      {
        "policy_id": "uuid",
        "policy_name": "Allow Data Read",
        "effect": "allow",
        "priority": 10,
        "matched_resource": "api:users:*",
        "matched_action": "read"
      }
    ],
    "reason": "Allowed by policy 'Allow Data Read' (priority 10)"
  }
}
```

#### POST /api/v1/policies/:id/assign

Assign a policy to an agent or group.

**Request:**
```json
{
  "target_type": "agent",
  "target_id": "uuid"
}
```

#### DELETE /api/v1/policies/:id/assign/:target_id

Remove a policy assignment.

---

### Groups

#### GET /api/v1/groups

List groups with member counts.

#### POST /api/v1/groups

Create a new agent group.

**Request:**
```json
{
  "name": "ML Agents",
  "description": "Machine learning pipeline agents"
}
```

#### GET /api/v1/groups/:id

Get group details with member list.

#### PUT /api/v1/groups/:id

Update group.

#### DELETE /api/v1/groups/:id

Delete group (removes all memberships).

#### POST /api/v1/groups/:id/agents

Add an agent to the group.

**Request:**
```json
{
  "agent_id": "uuid"
}
```

#### DELETE /api/v1/groups/:id/agents/:aid

Remove an agent from the group.

---

### Sandboxes

#### GET /api/v1/sandboxes

List sandboxes.

#### POST /api/v1/sandboxes

Create a sandbox environment.

**Request:**
```json
{
  "name": "ML Sandbox",
  "agent_id": "uuid",
  "mode": "strict",
  "resource_limits": {
    "max_cpu_percent": 50,
    "max_memory_mb": 512,
    "max_storage_mb": 1024,
    "max_network_bandwidth_mbps": 100
  },
  "network_policy": {
    "allowed_hosts": ["api.example.com"],
    "allowed_ports": [443, 8080],
    "allow_internet": false
  }
}
```

**Sandbox Modes:** `permissive`, `standard`, `strict`, `dry_run`

#### POST /api/v1/sandboxes/:id/snapshots

Create a snapshot of the current sandbox state.

#### POST /api/v1/sandboxes/:id/restore/:sid

Restore sandbox to a snapshot.

#### GET /api/v1/sandboxes/:id/metrics

Get real-time resource usage metrics.

---

### Audit

#### GET /api/v1/audit

Query audit logs with filtering.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | int | Page number |
| per_page | int | Items per page |
| actor_id | uuid | Filter by actor |
| actor_type | string | `user` or `agent` |
| action | string | Filter by action |
| resource_type | string | Filter by resource type |
| status | string | `success`, `failure`, `denied` |
| start_date | datetime | Start of date range |
| end_date | datetime | End of date range |

#### GET /api/v1/audit/export

Export logs as JSON or CSV.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| format | string | `json` or `csv` |
| start_date | datetime | Required |
| end_date | datetime | Required |

#### GET /api/v1/audit/alerts

List triggered alerts.

#### POST /api/v1/audit/alerts/rules

Create an alert rule.

**Request:**
```json
{
  "name": "High Error Rate",
  "condition_type": "threshold",
  "severity": "high",
  "condition": {
    "metric": "error_rate",
    "operator": ">",
    "value": 10,
    "window_minutes": 60
  },
  "notification_channels": ["email", "webhook"]
}
```

---

### Dashboard

#### GET /api/v1/dashboard/overview

Get organization-wide statistics.

**Response:**
```json
{
  "status": "success",
  "data": {
    "total_agents": 42,
    "active_agents": 35,
    "total_requests_today": 12345,
    "total_requests_week": 87654,
    "error_rate": 1.2,
    "active_policies": 15,
    "active_sandboxes": 8,
    "pending_alerts": 3
  }
}
```

#### GET /api/v1/dashboard/metrics

Get chart data for the dashboard.

#### WS /api/v1/dashboard/live

WebSocket endpoint for real-time updates. Streams new audit log entries as they occur.

---

## Agent API (`/agent/v1`)

These endpoints are used by agents themselves to interact with the platform.

### POST /agent/v1/authenticate

Verify an API key and get agent information.

**Headers:** `X-Agent-Key: agx_...`

**Response:**
```json
{
  "status": "success",
  "data": {
    "agent_id": "uuid",
    "agent_name": "Data Analyzer",
    "agent_type": "autonomous",
    "status": "active"
  }
}
```

### POST /agent/v1/permissions/check

Check if the agent has permission for a specific action.

**Request:**
```json
{
  "resource": "api:users:read",
  "action": "read"
}
```

### POST /agent/v1/actions/declare

Declare an action the agent intends to perform.

**Request:**
```json
{
  "resource_type": "api",
  "resource_id": "users:123",
  "action": "update",
  "details": { "field": "email" },
  "dry_run": false
}
```

If the sandbox is in `dry_run` mode, the action is logged but not executed.

### POST /agent/v1/messages/send

Send a message to another agent or channel.

**Request:**
```json
{
  "channel_id": "uuid",
  "message_type": "text",
  "content": "Processing complete. 1500 records analyzed."
}
```

### GET /agent/v1/messages

Receive pending messages.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| channel_id | uuid | Filter by channel |
| since | datetime | Messages after this time |

---

## Analytics API (`/analytics`)

### GET /analytics/anomalies/:org_id

Detect anomalies in organization data.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| period | string | `daily`, `weekly`, `monthly` |

### GET /analytics/behavior/:agent_id

Get behavioral profile for an agent.

### POST /analytics/detect

Real-time anomaly detection for a single action.

**Request:**
```json
{
  "agent_id": "uuid",
  "action": "delete",
  "resource_type": "database",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

**Response:**
```json
{
  "is_anomalous": false,
  "risk_score": 0.23,
  "factors": ["action=delete: within normal range", "resource=database: common"],
  "recommendation": "allow"
}
```

### GET /analytics/reports/:org_id

Generate a comprehensive analytics report.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| type | string | `daily`, `weekly`, `monthly` |

---

## Error Responses

All errors follow this format:

```json
{
  "status": "error",
  "message": "Human-readable error description",
  "code": "ERROR_CODE"
}
```

**Common HTTP Status Codes:**
| Code | Meaning |
|------|---------|
| 400 | Bad Request — Invalid input |
| 401 | Unauthorized — Missing or invalid token |
| 403 | Forbidden — Insufficient permissions |
| 404 | Not Found — Resource doesn't exist |
| 409 | Conflict — Duplicate resource |
| 422 | Unprocessable — Validation failed |
| 429 | Too Many Requests — Rate limited |
| 500 | Internal Server Error |

## Rate Limiting

- **Per-IP:** 100 requests/minute for unauthenticated, 300 for authenticated
- **Per-Agent:** Configurable via `max_requests_per_minute` and `max_requests_per_day`
- Rate limit headers are included in every response:
  ```
  X-RateLimit-Limit: 300
  X-RateLimit-Remaining: 297
  X-RateLimit-Reset: 1705312800
  ```
