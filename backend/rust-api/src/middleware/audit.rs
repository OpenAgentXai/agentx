use sqlx::PgPool;
use uuid::Uuid;

use crate::models::audit::{ActorType, ActionStatus};

/// Record an audit log entry
pub async fn log_action(
    db: &PgPool,
    organization_id: Uuid,
    actor_type: ActorType,
    actor_id: Uuid,
    actor_name: &str,
    action: &str,
    resource_type: &str,
    resource_id: Option<Uuid>,
    details: serde_json::Value,
    ip_address: Option<&str>,
    user_agent: Option<&str>,
    status: ActionStatus,
    error_message: Option<&str>,
    duration_ms: Option<i32>,
) {
    let result = sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_type, actor_id, actor_name,
         action, resource_type, resource_id, details, ip_address, user_agent,
         status, error_message, duration_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())"
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(&actor_type)
    .bind(actor_id)
    .bind(actor_name)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(&details)
    .bind(ip_address)
    .bind(user_agent)
    .bind(&status)
    .bind(error_message)
    .bind(duration_ms)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::error!("Failed to write audit log: {}", e);
    }
}

/// Convenience: log a successful user action
pub async fn log_user_action(
    db: &PgPool,
    org_id: Uuid,
    user_id: Uuid,
    user_name: &str,
    action: &str,
    resource_type: &str,
    resource_id: Option<Uuid>,
    details: serde_json::Value,
) {
    log_action(
        db, org_id, ActorType::User, user_id, user_name,
        action, resource_type, resource_id, details,
        None, None, ActionStatus::Success, None, None,
    ).await;
}

/// Convenience: log an agent action
pub async fn log_agent_action(
    db: &PgPool,
    org_id: Uuid,
    agent_id: Uuid,
    agent_name: &str,
    action: &str,
    resource_type: &str,
    resource_id: Option<Uuid>,
    details: serde_json::Value,
    status: ActionStatus,
    error_message: Option<&str>,
    duration_ms: Option<i32>,
) {
    log_action(
        db, org_id, ActorType::Agent, agent_id, agent_name,
        action, resource_type, resource_id, details,
        None, None, status, error_message, duration_ms,
    ).await;
}
