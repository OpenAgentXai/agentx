-- ============================================================================
-- AgentX Platform - Demo Seed Data
-- Seed: 001_demo.sql
-- Description: Populates the database with representative demo data for
--              development and testing purposes.
-- ============================================================================
-- NOTE: The password hash below is a bcrypt hash of the string "AdminPass123!"
--       generated with cost factor 12.  Replace it in production.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ORGANIZATION
-- ============================================================================

INSERT INTO organizations (id, name, created_at, updated_at)
VALUES (
    'a0000000-0000-4000-8000-000000000001',
    'AgentX Demo Corp',
    '2025-01-15 09:00:00+00',
    '2025-01-15 09:00:00+00'
);

-- ============================================================================
-- 2. USERS
-- ============================================================================

-- Owner / admin user
INSERT INTO users (id, organization_id, email, password_hash, name, role, totp_enabled, is_active, created_at, updated_at)
VALUES (
    'b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'admin@agentx.dev',
    '$argon2id$v=19$m=65536,t=3,p=4$jmyHYDhTR8sTyoM0a/Mu8Q$vF/WNrETtV9nttzJ3JZBYCnjNBJ9OsaqlD9J7k5IwVg',
    'Platform Admin',
    'owner',
    FALSE,
    TRUE,
    '2025-01-15 09:00:00+00',
    '2025-01-15 09:00:00+00'
);

-- ============================================================================
-- 3. SANDBOX
-- ============================================================================

INSERT INTO sandboxes (id, organization_id, name, description, agent_id, mode, status, resource_limits, allowed_data_scopes, network_policy, created_by, created_at, updated_at)
VALUES (
    'e0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'Development Sandbox',
    'Shared sandbox for testing and development of new agents',
    NULL,
    'testing',
    'active',
    '{"max_requests_per_minute": 60, "max_memory_mb": 256, "max_cpu_percent": 25.0, "max_storage_mb": 1024, "max_concurrent_operations": 5}',
    '["public_data", "test_data"]',
    '{"allow_outbound": false, "allowed_hosts": ["api.internal.agentx.dev"], "blocked_hosts": [], "max_bandwidth_kbps": 1024}',
    'b0000000-0000-4000-8000-000000000001',
    '2025-01-15 10:00:00+00',
    '2025-01-15 10:00:00+00'
);

-- ============================================================================
-- 4. AGENTS
-- ============================================================================

-- Agent 1: Autonomous data-pipeline agent
INSERT INTO agents (id, organization_id, name, description, agent_type, status, owner_id, metadata, tags, max_requests_per_minute, max_requests_per_day, sandbox_id, created_at, updated_at, last_active_at)
VALUES (
    'c0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'DataPipeline-Agent',
    'Autonomous agent responsible for ETL workflows and data synchronisation',
    'autonomous',
    'active',
    'b0000000-0000-4000-8000-000000000001',
    '{"version": "2.1.0", "runtime": "python-3.12", "capabilities": ["read_database", "write_database", "call_api"]}',
    '{etl,data,production}',
    120,
    50000,
    NULL,
    '2025-01-16 08:00:00+00',
    '2025-02-01 14:30:00+00',
    '2025-02-15 11:22:00+00'
);

-- Agent 2: Supervised customer-support agent
INSERT INTO agents (id, organization_id, name, description, agent_type, status, owner_id, metadata, tags, max_requests_per_minute, max_requests_per_day, sandbox_id, created_at, updated_at, last_active_at)
VALUES (
    'c0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'Support-Agent',
    'Supervised agent that handles tier-1 customer support tickets with human escalation',
    'supervised',
    'active',
    'b0000000-0000-4000-8000-000000000001',
    '{"version": "1.4.2", "runtime": "node-20", "capabilities": ["read_tickets", "respond_tickets", "escalate"]}',
    '{support,customer,supervised}',
    60,
    20000,
    NULL,
    '2025-01-20 10:00:00+00',
    '2025-02-10 16:00:00+00',
    '2025-02-15 09:45:00+00'
);

-- Agent 3: Restricted monitoring agent running in the sandbox
INSERT INTO agents (id, organization_id, name, description, agent_type, status, owner_id, metadata, tags, max_requests_per_minute, max_requests_per_day, sandbox_id, created_at, updated_at, last_active_at)
VALUES (
    'c0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'Monitor-Agent',
    'Restricted agent that collects system metrics and reports anomalies',
    'restricted',
    'active',
    'b0000000-0000-4000-8000-000000000001',
    '{"version": "0.9.0", "runtime": "rust-1.77", "capabilities": ["read_metrics"]}',
    '{monitoring,metrics,sandbox}',
    30,
    5000,
    'e0000000-0000-4000-8000-000000000001',
    '2025-02-01 12:00:00+00',
    '2025-02-14 08:00:00+00',
    '2025-02-15 12:00:00+00'
);

-- Update the sandbox to reference the monitor agent
UPDATE sandboxes
SET agent_id = 'c0000000-0000-4000-8000-000000000003',
    updated_at = '2025-02-01 12:05:00+00'
WHERE id = 'e0000000-0000-4000-8000-000000000001';

-- ============================================================================
-- 5. AGENT CREDENTIALS
-- ============================================================================

-- API key for DataPipeline-Agent (prefix: axk_datapipe)
INSERT INTO agent_credentials (id, agent_id, credential_type, key_hash, key_prefix, name, is_active, expires_at, last_used_at, created_at, rotated_from)
VALUES (
    'cc000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'apikey',
    '$2b$12$placeholder.hashed.api.key.for.datapipeline.agent.000000000',
    'axk_datapipe',
    'DataPipeline Production Key',
    TRUE,
    '2025-07-16 08:00:00+00',
    '2025-02-15 11:22:00+00',
    '2025-01-16 08:30:00+00',
    NULL
);

-- API key for Support-Agent
INSERT INTO agent_credentials (id, agent_id, credential_type, key_hash, key_prefix, name, is_active, expires_at, last_used_at, created_at, rotated_from)
VALUES (
    'cc000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    'apikey',
    '$2b$12$placeholder.hashed.api.key.for.support.agent.0000000000000',
    'axk_support',
    'Support Agent Key',
    TRUE,
    '2025-07-20 10:00:00+00',
    '2025-02-15 09:45:00+00',
    '2025-01-20 10:30:00+00',
    NULL
);

-- API key for Monitor-Agent
INSERT INTO agent_credentials (id, agent_id, credential_type, key_hash, key_prefix, name, is_active, expires_at, last_used_at, created_at, rotated_from)
VALUES (
    'cc000000-0000-4000-8000-000000000003',
    'c0000000-0000-4000-8000-000000000003',
    'apikey',
    '$2b$12$placeholder.hashed.api.key.for.monitor.agent.0000000000000',
    'axk_monitor',
    'Monitor Agent Key',
    TRUE,
    '2025-08-01 12:00:00+00',
    '2025-02-15 12:00:00+00',
    '2025-02-01 12:10:00+00',
    NULL
);

-- ============================================================================
-- 6. AGENT GROUPS
-- ============================================================================

INSERT INTO agent_groups (id, organization_id, name, description, created_at, updated_at)
VALUES
(
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'Production Agents',
    'All agents that are approved for production workloads',
    '2025-01-17 09:00:00+00',
    '2025-01-17 09:00:00+00'
),
(
    'd0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'Monitoring & Observability',
    'Agents focused on system health, metrics collection, and alerting',
    '2025-02-01 13:00:00+00',
    '2025-02-01 13:00:00+00'
);

-- ============================================================================
-- 7. AGENT GROUP MEMBERSHIPS
-- ============================================================================

-- DataPipeline-Agent and Support-Agent are production agents
INSERT INTO agent_group_memberships (id, group_id, agent_id, added_at, added_by)
VALUES
(
    'da000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    '2025-01-17 09:05:00+00',
    'b0000000-0000-4000-8000-000000000001'
),
(
    'da000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002',
    '2025-01-20 10:05:00+00',
    'b0000000-0000-4000-8000-000000000001'
);

-- Monitor-Agent is in the observability group
INSERT INTO agent_group_memberships (id, group_id, agent_id, added_at, added_by)
VALUES (
    'da000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000003',
    '2025-02-01 13:05:00+00',
    'b0000000-0000-4000-8000-000000000001'
);

-- ============================================================================
-- 8. POLICIES
-- ============================================================================

-- Policy 1: Allow-all for autonomous (admin-level) agents
INSERT INTO policies (id, organization_id, name, description, effect, resources, actions, conditions, priority, is_active, created_by, created_at, updated_at)
VALUES (
    'f0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'Autonomous Full Access',
    'Grants full read/write/execute access to all resources for autonomous agents',
    'allow',
    '["*"]',
    '["read", "write", "execute", "delete"]',
    '{}',
    100,
    TRUE,
    'b0000000-0000-4000-8000-000000000001',
    '2025-01-15 11:00:00+00',
    '2025-01-15 11:00:00+00'
);

-- Policy 2: Read-only access
INSERT INTO policies (id, organization_id, name, description, effect, resources, actions, conditions, priority, is_active, created_by, created_at, updated_at)
VALUES (
    'f0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'Read-Only Access',
    'Permits read-only operations across all non-sensitive resources',
    'allow',
    '["data:public:*", "metrics:*", "config:read"]',
    '["read"]',
    '{"time_window": "00:00-23:59", "ip_range": "0.0.0.0/0"}',
    50,
    TRUE,
    'b0000000-0000-4000-8000-000000000001',
    '2025-01-15 11:30:00+00',
    '2025-01-15 11:30:00+00'
);

-- Policy 3: Deny access to sensitive resources
INSERT INTO policies (id, organization_id, name, description, effect, resources, actions, conditions, priority, is_active, created_by, created_at, updated_at)
VALUES (
    'f0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'Deny Sensitive Resources',
    'Explicitly denies access to PII, billing, and secret-management resources for all agents',
    'deny',
    '["data:pii:*", "billing:*", "secrets:*", "data:users:password_hash"]',
    '["read", "write", "execute", "delete"]',
    '{}',
    200,
    TRUE,
    'b0000000-0000-4000-8000-000000000001',
    '2025-01-15 12:00:00+00',
    '2025-01-15 12:00:00+00'
);

-- ============================================================================
-- 9. POLICY ASSIGNMENTS
-- ============================================================================

-- Assign "Autonomous Full Access" to DataPipeline-Agent directly
INSERT INTO policy_assignments (id, policy_id, target_type, target_id, assigned_by, assigned_at)
VALUES (
    'fa000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    'agent',
    'c0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    '2025-01-17 09:10:00+00'
);

-- Assign "Read-Only Access" to the Monitoring & Observability group
INSERT INTO policy_assignments (id, policy_id, target_type, target_id, assigned_by, assigned_at)
VALUES (
    'fa000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000002',
    'group',
    'd0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    '2025-02-01 13:10:00+00'
);

-- Assign "Deny Sensitive Resources" to the Production Agents group (higher priority overrides allows)
INSERT INTO policy_assignments (id, policy_id, target_type, target_id, assigned_by, assigned_at)
VALUES (
    'fa000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000003',
    'group',
    'd0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    '2025-01-17 09:15:00+00'
);

-- ============================================================================
-- 10. ALERT RULES
-- ============================================================================

INSERT INTO alert_rules (id, organization_id, name, description, condition_type, condition_config, severity, is_active, notify_channels, created_by, created_at, updated_at)
VALUES (
    'aa000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'High Error Rate Alert',
    'Fires when any agent exceeds a 5% error rate over a 15-minute window',
    'high_error_rate',
    '{"threshold_percent": 5.0, "window_minutes": 15, "min_requests": 50}',
    'high',
    TRUE,
    '["email:admin@agentx.dev", "slack:#ops-alerts"]',
    'b0000000-0000-4000-8000-000000000001',
    '2025-01-20 14:00:00+00',
    '2025-01-20 14:00:00+00'
);

-- ============================================================================
-- 11. SAMPLE AUDIT LOG ENTRIES
-- ============================================================================

INSERT INTO audit_logs (id, organization_id, actor_type, actor_id, actor_name, action, resource_type, resource_id, details, ip_address, user_agent, status, error_message, duration_ms, created_at)
VALUES
(
    'ab000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'user',
    'b0000000-0000-4000-8000-000000000001',
    'Platform Admin',
    'agent.create',
    'agent',
    'c0000000-0000-4000-8000-000000000001',
    '{"agent_name": "DataPipeline-Agent", "agent_type": "autonomous"}',
    '10.0.1.100',
    'Mozilla/5.0 AgentX-Dashboard/1.0',
    'success',
    NULL,
    42,
    '2025-01-16 08:00:00+00'
),
(
    'ab000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'agent',
    'c0000000-0000-4000-8000-000000000001',
    'DataPipeline-Agent',
    'data.read',
    'database',
    NULL,
    '{"table": "orders", "row_count": 1520}',
    '10.0.2.50',
    'AgentX-SDK/2.1.0',
    'success',
    NULL,
    128,
    '2025-02-15 11:20:00+00'
),
(
    'ab000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'agent',
    'c0000000-0000-4000-8000-000000000003',
    'Monitor-Agent',
    'secrets.read',
    'secrets',
    NULL,
    '{"attempted_secret": "db_password"}',
    '10.0.2.80',
    'AgentX-SDK/0.9.0',
    'denied',
    'Policy "Deny Sensitive Resources" denied access to secrets:*',
    3,
    '2025-02-15 12:01:00+00'
);

COMMIT;
