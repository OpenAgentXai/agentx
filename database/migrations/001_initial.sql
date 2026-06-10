-- ============================================================================
-- AgentX Platform - Initial Database Migration
-- Migration: 001_initial.sql
-- Description: Creates all tables, custom types, constraints, and indexes
--              for the Agent Identity & Access Management system.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. CUSTOM ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TYPE agent_type AS ENUM ('autonomous', 'supervised', 'collaborative', 'restricted');

CREATE TYPE agent_status AS ENUM ('active', 'suspended', 'revoked', 'archived', 'pending_approval');

CREATE TYPE credential_type AS ENUM ('apikey', 'jwt', 'certificate');

CREATE TYPE policy_effect AS ENUM ('allow', 'deny');

CREATE TYPE assignment_target AS ENUM ('agent', 'group');

CREATE TYPE sandbox_mode AS ENUM ('production', 'dryrun', 'testing');

CREATE TYPE sandbox_status AS ENUM ('active', 'paused', 'terminated');

CREATE TYPE actor_type AS ENUM ('user', 'agent', 'system');

CREATE TYPE action_status AS ENUM ('success', 'failure', 'denied');

CREATE TYPE alert_condition_type AS ENUM (
    'high_error_rate',
    'unusual_activity',
    'permission_denied',
    'rate_limit_exceeded',
    'new_agent_created',
    'credential_rotation',
    'custom'
);

CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE channel_type AS ENUM ('direct', 'group', 'broadcast');

CREATE TYPE channel_visibility AS ENUM ('full', 'partial', 'agents_only');

CREATE TYPE channel_member_role AS ENUM ('owner', 'member', 'readonly');

CREATE TYPE message_type AS ENUM ('data', 'command', 'status', 'handoff', 'error');

-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 organizations
-- ----------------------------------------------------------------------------
CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.2 users
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    role            user_role    NOT NULL DEFAULT 'member',
    totp_secret     VARCHAR(255),
    totp_enabled    BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email           ON users(email);

-- ----------------------------------------------------------------------------
-- 3.3 agents
-- ----------------------------------------------------------------------------
CREATE TABLE agents (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id         UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                    VARCHAR(100)  NOT NULL,
    description             VARCHAR(500),
    agent_type              agent_type    NOT NULL DEFAULT 'restricted',
    status                  agent_status  NOT NULL DEFAULT 'pending_approval',
    owner_id                UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    metadata                JSONB         NOT NULL DEFAULT '{}'::jsonb,
    tags                    TEXT[]        NOT NULL DEFAULT '{}',
    max_requests_per_minute INTEGER       NOT NULL DEFAULT 60,
    max_requests_per_day    BIGINT        NOT NULL DEFAULT 10000,
    sandbox_id              UUID,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
    last_active_at          TIMESTAMPTZ
);

CREATE INDEX idx_agents_organization_status    ON agents(organization_id, status);
CREATE INDEX idx_agents_organization_type      ON agents(organization_id, agent_type);
CREATE INDEX idx_agents_owner_id               ON agents(owner_id);
CREATE INDEX idx_agents_sandbox_id             ON agents(sandbox_id);

-- ----------------------------------------------------------------------------
-- 3.4 agent_credentials
-- ----------------------------------------------------------------------------
CREATE TABLE agent_credentials (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id        UUID            NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    credential_type credential_type NOT NULL DEFAULT 'apikey',
    key_hash        VARCHAR(255)    NOT NULL,
    key_prefix      VARCHAR(12)     NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    rotated_from    UUID
);

CREATE INDEX idx_agent_credentials_agent_id     ON agent_credentials(agent_id);
CREATE INDEX idx_agent_credentials_key_prefix   ON agent_credentials(key_prefix);
CREATE INDEX idx_agent_credentials_rotated_from ON agent_credentials(rotated_from);

-- ----------------------------------------------------------------------------
-- 3.5 agent_groups
-- ----------------------------------------------------------------------------
CREATE TABLE agent_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(500),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_groups_organization_id ON agent_groups(organization_id);

-- ----------------------------------------------------------------------------
-- 3.6 agent_group_memberships
-- ----------------------------------------------------------------------------
CREATE TABLE agent_group_memberships (
    id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID        NOT NULL REFERENCES agent_groups(id) ON DELETE CASCADE,
    agent_id UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT uq_agent_group_membership UNIQUE (group_id, agent_id)
);

CREATE INDEX idx_agent_group_memberships_group_id ON agent_group_memberships(group_id);
CREATE INDEX idx_agent_group_memberships_agent_id ON agent_group_memberships(agent_id);
CREATE INDEX idx_agent_group_memberships_added_by ON agent_group_memberships(added_by);

-- ----------------------------------------------------------------------------
-- 3.7 policies
-- ----------------------------------------------------------------------------
CREATE TABLE policies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(100)  NOT NULL,
    description     VARCHAR(500),
    effect          policy_effect NOT NULL,
    resources       JSONB         NOT NULL DEFAULT '[]'::jsonb,
    actions         JSONB         NOT NULL DEFAULT '[]'::jsonb,
    conditions      JSONB         NOT NULL DEFAULT '{}'::jsonb,
    priority        INTEGER       NOT NULL DEFAULT 0,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_policies_organization_active_priority ON policies(organization_id, is_active, priority);
CREATE INDEX idx_policies_created_by                   ON policies(created_by);

-- ----------------------------------------------------------------------------
-- 3.8 policy_assignments
-- ----------------------------------------------------------------------------
CREATE TABLE policy_assignments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id   UUID              NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    target_type assignment_target NOT NULL,
    target_id   UUID              NOT NULL,
    assigned_by UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_policy_assignments_policy_target ON policy_assignments(policy_id, target_type, target_id);
CREATE INDEX idx_policy_assignments_target        ON policy_assignments(target_type, target_id);
CREATE INDEX idx_policy_assignments_assigned_by   ON policy_assignments(assigned_by);

-- ----------------------------------------------------------------------------
-- 3.9 sandboxes
-- ----------------------------------------------------------------------------
CREATE TABLE sandboxes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                VARCHAR(100)   NOT NULL,
    description         VARCHAR(500),
    agent_id            UUID           REFERENCES agents(id) ON DELETE SET NULL,
    mode                sandbox_mode   NOT NULL DEFAULT 'testing',
    status              sandbox_status NOT NULL DEFAULT 'active',
    resource_limits     JSONB          NOT NULL DEFAULT '{}'::jsonb,
    allowed_data_scopes JSONB          NOT NULL DEFAULT '[]'::jsonb,
    network_policy      JSONB          NOT NULL DEFAULT '{}'::jsonb,
    created_by          UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_sandboxes_organization_id ON sandboxes(organization_id);
CREATE INDEX idx_sandboxes_agent_id        ON sandboxes(agent_id);
CREATE INDEX idx_sandboxes_created_by      ON sandboxes(created_by);

-- Now that sandboxes exists, add the FK from agents.sandbox_id -> sandboxes.id
ALTER TABLE agents
    ADD CONSTRAINT fk_agents_sandbox
    FOREIGN KEY (sandbox_id) REFERENCES sandboxes(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3.10 sandbox_snapshots
-- ----------------------------------------------------------------------------
CREATE TABLE sandbox_snapshots (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sandbox_id  UUID        NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    state_data  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_by  UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sandbox_snapshots_sandbox_id  ON sandbox_snapshots(sandbox_id);
CREATE INDEX idx_sandbox_snapshots_created_by  ON sandbox_snapshots(created_by);

-- ----------------------------------------------------------------------------
-- 3.11 channels
-- ----------------------------------------------------------------------------
CREATE TABLE channels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID               NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(100)       NOT NULL,
    description     VARCHAR(500),
    channel_type    channel_type       NOT NULL DEFAULT 'group',
    visibility      channel_visibility NOT NULL DEFAULT 'full',
    is_active       BOOLEAN            NOT NULL DEFAULT TRUE,
    created_by      UUID               NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX idx_channels_organization_id ON channels(organization_id);
CREATE INDEX idx_channels_created_by      ON channels(created_by);

-- ----------------------------------------------------------------------------
-- 3.12 channel_members
-- ----------------------------------------------------------------------------
CREATE TABLE channel_members (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID               NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    agent_id   UUID               NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role       channel_member_role NOT NULL DEFAULT 'member',
    joined_at  TIMESTAMPTZ        NOT NULL DEFAULT now(),

    CONSTRAINT uq_channel_member UNIQUE (channel_id, agent_id)
);

CREATE INDEX idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX idx_channel_members_agent_id   ON channel_members(agent_id);

-- ----------------------------------------------------------------------------
-- 3.13 channel_messages
-- ----------------------------------------------------------------------------
CREATE TABLE channel_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id      UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_agent_id UUID         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    message_type    message_type NOT NULL DEFAULT 'data',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_channel_messages_channel_created ON channel_messages(channel_id, created_at);
CREATE INDEX idx_channel_messages_sender          ON channel_messages(sender_agent_id);

-- ----------------------------------------------------------------------------
-- 3.14 audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_type      actor_type    NOT NULL,
    actor_id        UUID          NOT NULL,
    actor_name      VARCHAR(255)  NOT NULL,
    action          VARCHAR(255)  NOT NULL,
    resource_type   VARCHAR(100)  NOT NULL,
    resource_id     UUID,
    details         JSONB         NOT NULL DEFAULT '{}'::jsonb,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),
    status          action_status NOT NULL DEFAULT 'success',
    error_message   TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org_created           ON audit_logs(organization_id, created_at);
CREATE INDEX idx_audit_logs_actor_created          ON audit_logs(actor_id, created_at);
CREATE INDEX idx_audit_logs_org_actor_type_created ON audit_logs(organization_id, actor_type, created_at);
CREATE INDEX idx_audit_logs_org_status_created     ON audit_logs(organization_id, status, created_at);

-- ----------------------------------------------------------------------------
-- 3.15 alert_rules
-- ----------------------------------------------------------------------------
CREATE TABLE alert_rules (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id  UUID                 NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             VARCHAR(100)         NOT NULL,
    description      VARCHAR(500),
    condition_type   alert_condition_type NOT NULL,
    condition_config JSONB                NOT NULL DEFAULT '{}'::jsonb,
    severity         alert_severity       NOT NULL DEFAULT 'medium',
    is_active        BOOLEAN              NOT NULL DEFAULT TRUE,
    notify_channels  JSONB                NOT NULL DEFAULT '[]'::jsonb,
    created_by       UUID                 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ          NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_organization_id ON alert_rules(organization_id);
CREATE INDEX idx_alert_rules_created_by      ON alert_rules(created_by);

-- ----------------------------------------------------------------------------
-- 3.16 alerts
-- ----------------------------------------------------------------------------
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rule_id         UUID           NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    severity        alert_severity NOT NULL,
    title           VARCHAR(255)   NOT NULL,
    message         TEXT           NOT NULL,
    details         JSONB          NOT NULL DEFAULT '{}'::jsonb,
    is_resolved     BOOLEAN        NOT NULL DEFAULT FALSE,
    resolved_by     UUID           REFERENCES users(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_organization_id ON alerts(organization_id);
CREATE INDEX idx_alerts_rule_id         ON alerts(rule_id);
CREATE INDEX idx_alerts_resolved_by     ON alerts(resolved_by);

-- ============================================================================
-- 4. UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to all tables that have an updated_at column

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_groups
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON sandboxes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
