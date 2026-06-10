use axum::{
    extract::{Path, Query, State},
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::middleware::auth::AgentContext;
use crate::models::audit::{ActionStatus, ActorType};
use crate::models::channel::*;
use crate::utils::{errors::AppError, response};
use crate::AppState;

/// Agent authenticates with its API key and receives a session token
pub async fn authenticate(
    State(state): State<Arc<AppState>>,
    axum::Extension(agent_ctx): axum::Extension<AgentContext>,
) -> Result<Json<serde_json::Value>, AppError> {
    let agent = sqlx::query_as::<_, crate::models::agent::Agent>(
        "SELECT * FROM agents WHERE id = $1 AND status = 'active'"
    )
    .bind(agent_ctx.agent_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Agent not found or inactive".into()))?;

    // Update last_active_at
    sqlx::query("UPDATE agents SET last_active_at = NOW() WHERE id = $1")
        .bind(agent_ctx.agent_id)
        .execute(&state.db)
        .await?;

    // Generate agent session token (stored in Redis)
    let session_token = crate::utils::crypto::generate_token(32);
    let session_key = format!("agent_session:{}", session_token);

    let _: () = redis::cmd("SET")
        .arg(&session_key)
        .arg(agent_ctx.agent_id.to_string())
        .arg("EX")
        .arg(3600) // 1 hour session
        .query_async(&mut state.redis.clone())
        .await?;

    crate::middleware::audit::log_agent_action(
        &state.db, agent.organization_id, agent.id, &agent.name,
        "authenticate", "session", None,
        serde_json::json!({}),
        ActionStatus::Success, None, None,
    ).await;

    Ok(response::success(serde_json::json!({
        "session_token": session_token,
        "agent_id": agent.id,
        "agent_name": agent.name,
        "agent_type": agent.agent_type,
        "expires_in": 3600,
    })))
}

/// Agent checks its effective permissions
pub async fn check_permissions(
    State(state): State<Arc<AppState>>,
    axum::Extension(agent_ctx): axum::Extension<AgentContext>,
) -> Result<Json<serde_json::Value>, AppError> {
    let agent = sqlx::query_as::<_, crate::models::agent::Agent>(
        "SELECT * FROM agents WHERE id = $1"
    )
    .bind(agent_ctx.agent_id)
    .fetch_one(&state.db)
    .await?;

    // Get all policies assigned to this agent (directly or via groups)
    let policies = sqlx::query_as::<_, crate::models::policy::Policy>(
        "SELECT DISTINCT p.* FROM policies p
         LEFT JOIN policy_assignments pa ON p.id = pa.policy_id
         LEFT JOIN agent_group_memberships agm ON pa.target_id = agm.group_id
            AND pa.target_type = 'group'
         WHERE p.organization_id = $1
         AND p.is_active = true
         AND (
             (pa.target_type = 'agent' AND pa.target_id = $2)
             OR (pa.target_type = 'group' AND agm.agent_id = $2)
         )
         ORDER BY p.priority ASC"
    )
    .bind(agent.organization_id)
    .bind(agent_ctx.agent_id)
    .fetch_all(&state.db)
    .await?;

    // Build effective permissions summary
    let mut allowed_resources: Vec<String> = Vec::new();
    let mut allowed_actions: Vec<String> = Vec::new();
    let mut denied_resources: Vec<String> = Vec::new();

    for policy in &policies {
        let resources: Vec<String> = serde_json::from_value(policy.resources.clone()).unwrap_or_default();
        let actions: Vec<String> = serde_json::from_value(policy.actions.clone()).unwrap_or_default();

        match policy.effect {
            crate::models::policy::PolicyEffect::Allow => {
                allowed_resources.extend(resources);
                allowed_actions.extend(actions);
            }
            crate::models::policy::PolicyEffect::Deny => {
                denied_resources.extend(resources);
            }
        }
    }

    allowed_resources.sort();
    allowed_resources.dedup();
    allowed_actions.sort();
    allowed_actions.dedup();
    denied_resources.sort();
    denied_resources.dedup();

    // Get sandbox info
    let sandbox = if let Some(sandbox_id) = agent.sandbox_id {
        sqlx::query_as::<_, crate::models::sandbox::Sandbox>(
            "SELECT * FROM sandboxes WHERE id = $1"
        )
        .bind(sandbox_id)
        .fetch_optional(&state.db)
        .await?
    } else {
        None
    };

    Ok(response::success(serde_json::json!({
        "agent_id": agent.id,
        "agent_name": agent.name,
        "status": agent.status,
        "permissions": {
            "allowed_resources": allowed_resources,
            "allowed_actions": allowed_actions,
            "denied_resources": denied_resources,
            "policy_count": policies.len(),
        },
        "rate_limits": {
            "max_requests_per_minute": agent.max_requests_per_minute,
            "max_requests_per_day": agent.max_requests_per_day,
        },
        "sandbox": sandbox.map(|s| serde_json::json!({
            "id": s.id,
            "name": s.name,
            "mode": s.mode,
            "resource_limits": s.resource_limits,
        })),
    })))
}

/// Agent declares an action it's about to perform (for audit + policy check)
pub async fn declare_action(
    State(state): State<Arc<AppState>>,
    axum::Extension(agent_ctx): axum::Extension<AgentContext>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let agent = sqlx::query_as::<_, crate::models::agent::Agent>(
        "SELECT * FROM agents WHERE id = $1 AND status = 'active'"
    )
    .bind(agent_ctx.agent_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Agent not active".into()))?;

    let action = body.get("action")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("'action' field required".into()))?;

    let resource = body.get("resource")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("'resource' field required".into()))?;

    let details = body.get("details").cloned().unwrap_or(serde_json::json!({}));

    // Check sandbox mode
    if let Some(sandbox_id) = agent.sandbox_id {
        let sandbox = sqlx::query_as::<_, crate::models::sandbox::Sandbox>(
            "SELECT * FROM sandboxes WHERE id = $1"
        )
        .bind(sandbox_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some(sandbox) = sandbox {
            if sandbox.mode == crate::models::sandbox::SandboxMode::DryRun {
                // In dry-run mode, log the action but don't execute
                crate::middleware::audit::log_agent_action(
                    &state.db, agent.organization_id, agent.id, &agent.name,
                    action, resource, None,
                    serde_json::json!({"details": details, "dry_run": true}),
                    ActionStatus::Success, None, None,
                ).await;

                return Ok(response::success(serde_json::json!({
                    "allowed": true,
                    "dry_run": true,
                    "message": "Action logged in dry-run mode (not executed)",
                })));
            }
        }
    }

    // Evaluate policies
    let policies = sqlx::query_as::<_, crate::models::policy::Policy>(
        "SELECT DISTINCT p.* FROM policies p
         LEFT JOIN policy_assignments pa ON p.id = pa.policy_id
         LEFT JOIN agent_group_memberships agm ON pa.target_id = agm.group_id
            AND pa.target_type = 'group'
         WHERE p.organization_id = $1
         AND p.is_active = true
         AND (
             (pa.target_type = 'agent' AND pa.target_id = $2)
             OR (pa.target_type = 'group' AND agm.agent_id = $2)
         )
         ORDER BY p.priority ASC"
    )
    .bind(agent.organization_id)
    .bind(agent.id)
    .fetch_all(&state.db)
    .await?;

    let mut allowed = false;
    let mut matched_policy: Option<String> = None;

    for policy in &policies {
        let resources: Vec<String> = serde_json::from_value(policy.resources.clone()).unwrap_or_default();
        let actions: Vec<String> = serde_json::from_value(policy.actions.clone()).unwrap_or_default();

        let resource_match = resources.iter().any(|r| {
            r == "*" || r == resource || (r.ends_with(":*") && resource.starts_with(&r[..r.len()-2]))
        });

        let action_match = actions.iter().any(|a| a == "*" || a == action);

        if resource_match && action_match {
            matched_policy = Some(policy.name.clone());
            allowed = policy.effect == crate::models::policy::PolicyEffect::Allow;
            break;
        }
    }

    let status = if allowed { ActionStatus::Success } else { ActionStatus::Denied };

    crate::middleware::audit::log_agent_action(
        &state.db, agent.organization_id, agent.id, &agent.name,
        action, resource, None,
        serde_json::json!({"details": details, "policy_matched": matched_policy}),
        status.clone(),
        if !allowed { Some("Permission denied by policy") } else { None },
        None,
    ).await;

    if !allowed {
        return Err(AppError::Forbidden(format!(
            "Agent '{}' is not allowed to perform '{}' on '{}'",
            agent.name, action, resource
        )));
    }

    Ok(response::success(serde_json::json!({
        "allowed": true,
        "action": action,
        "resource": resource,
        "policy_matched": matched_policy,
    })))
}

/// Agent sends a message to a channel
pub async fn send_message(
    State(state): State<Arc<AppState>>,
    axum::Extension(agent_ctx): axum::Extension<AgentContext>,
    Path(channel_id): Path<Uuid>,
    Json(req): Json<SendMessageRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify agent is a member of the channel
    let membership = sqlx::query_as::<_, ChannelMember>(
        "SELECT * FROM channel_members WHERE channel_id = $1 AND agent_id = $2"
    )
    .bind(channel_id)
    .bind(agent_ctx.agent_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Forbidden("Agent is not a member of this channel".into()))?;

    if membership.role == ChannelMemberRole::ReadOnly {
        return Err(AppError::Forbidden("Agent has read-only access to this channel".into()));
    }

    let message_type = req.message_type.unwrap_or(MessageType::Data);

    let message = sqlx::query_as::<_, ChannelMessage>(
        "INSERT INTO channel_messages (id, channel_id, sender_agent_id, content, message_type, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(channel_id)
    .bind(agent_ctx.agent_id)
    .bind(&req.content)
    .bind(&message_type)
    .fetch_one(&state.db)
    .await?;

    Ok(response::success(message))
}

/// Agent receives messages from a channel
pub async fn receive_messages(
    State(state): State<Arc<AppState>>,
    axum::Extension(agent_ctx): axum::Extension<AgentContext>,
    Path(channel_id): Path<Uuid>,
    Query(query): Query<ReceiveMessagesQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify agent is a member
    sqlx::query("SELECT id FROM channel_members WHERE channel_id = $1 AND agent_id = $2")
        .bind(channel_id)
        .bind(agent_ctx.agent_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Forbidden("Agent is not a member of this channel".into()))?;

    let limit = query.limit.unwrap_or(50).min(200);
    let since = query.since.unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::hours(24));

    let messages = sqlx::query_as::<_, ChannelMessage>(
        "SELECT * FROM channel_messages
         WHERE channel_id = $1 AND created_at > $2
         ORDER BY created_at ASC
         LIMIT $3"
    )
    .bind(channel_id)
    .bind(since)
    .bind(limit as i64)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(serde_json::json!({
        "channel_id": channel_id,
        "messages": messages,
        "count": messages.len(),
    })))
}
