use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::models::sandbox::*;
use crate::models::user::Claims;
use crate::utils::{errors::AppError, response};
use crate::AppState;

pub async fn list_sandboxes(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sandboxes = sqlx::query_as::<_, Sandbox>(
        "SELECT * FROM sandboxes WHERE organization_id = $1 ORDER BY created_at DESC"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(sandboxes))
}

pub async fn create_sandbox(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Json(req): Json<CreateSandboxRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    // If agent_id provided, verify it belongs to org
    if let Some(agent_id) = req.agent_id {
        sqlx::query("SELECT id FROM agents WHERE id = $1 AND organization_id = $2")
            .bind(agent_id)
            .bind(claims.org)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;
    }

    let sandbox_id = Uuid::new_v4();
    let mode = req.mode.unwrap_or(SandboxMode::Production);
    let resource_limits = serde_json::to_value(req.resource_limits.unwrap_or_default())
        .unwrap_or(serde_json::json!({}));
    let data_scopes = serde_json::to_value(req.allowed_data_scopes.unwrap_or_default())
        .unwrap_or(serde_json::json!([]));
    let network_policy = serde_json::to_value(req.network_policy.unwrap_or_default())
        .unwrap_or(serde_json::json!({}));

    let sandbox = sqlx::query_as::<_, Sandbox>(
        "INSERT INTO sandboxes (id, organization_id, name, description, agent_id, mode,
         status, resource_limits, allowed_data_scopes, network_policy, created_by,
         created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, NOW(), NOW())
         RETURNING *"
    )
    .bind(sandbox_id)
    .bind(claims.org)
    .bind(&req.name)
    .bind(&req.description)
    .bind(req.agent_id)
    .bind(&mode)
    .bind(&resource_limits)
    .bind(&data_scopes)
    .bind(&network_policy)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    // Link sandbox to agent if specified
    if let Some(agent_id) = req.agent_id {
        sqlx::query("UPDATE agents SET sandbox_id = $1, updated_at = NOW() WHERE id = $2")
            .bind(sandbox_id)
            .bind(agent_id)
            .execute(&state.db)
            .await?;
    }

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "create_sandbox", "sandbox", Some(sandbox_id),
        serde_json::json!({"name": req.name, "mode": mode}),
    ).await;

    Ok(response::success(sandbox))
}

pub async fn get_sandbox(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sandbox = sqlx::query_as::<_, Sandbox>(
        "SELECT * FROM sandboxes WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Sandbox not found".into()))?;

    let snapshots = sqlx::query_as::<_, SandboxSnapshot>(
        "SELECT * FROM sandbox_snapshots WHERE sandbox_id = $1 ORDER BY created_at DESC"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(serde_json::json!({
        "sandbox": sandbox,
        "snapshots": snapshots,
    })))
}

pub async fn update_sandbox(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateSandboxRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let existing = sqlx::query_as::<_, Sandbox>(
        "SELECT * FROM sandboxes WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Sandbox not found".into()))?;

    let name = req.name.unwrap_or(existing.name);
    let description = req.description.or(existing.description);
    let mode = req.mode.unwrap_or(existing.mode);
    let resource_limits = req.resource_limits
        .map(|r| serde_json::to_value(r).unwrap_or(serde_json::json!({})))
        .unwrap_or(existing.resource_limits);
    let data_scopes = req.allowed_data_scopes
        .map(|d| serde_json::to_value(d).unwrap_or(serde_json::json!([])))
        .unwrap_or(existing.allowed_data_scopes);
    let network_policy = req.network_policy
        .map(|n| serde_json::to_value(n).unwrap_or(serde_json::json!({})))
        .unwrap_or(existing.network_policy);

    let sandbox = sqlx::query_as::<_, Sandbox>(
        "UPDATE sandboxes SET name = $1, description = $2, mode = $3,
         resource_limits = $4, allowed_data_scopes = $5, network_policy = $6,
         updated_at = NOW()
         WHERE id = $7 RETURNING *"
    )
    .bind(&name)
    .bind(&description)
    .bind(&mode)
    .bind(&resource_limits)
    .bind(&data_scopes)
    .bind(&network_policy)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    Ok(response::success(sandbox))
}

pub async fn delete_sandbox(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Unlink agents from this sandbox
    sqlx::query("UPDATE agents SET sandbox_id = NULL WHERE sandbox_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    // Delete snapshots
    sqlx::query("DELETE FROM sandbox_snapshots WHERE sandbox_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    let result = sqlx::query(
        "DELETE FROM sandboxes WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Sandbox not found".into()));
    }

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "delete_sandbox", "sandbox", Some(id),
        serde_json::json!({}),
    ).await;

    Ok(response::message("Sandbox deleted successfully"))
}

pub async fn create_snapshot(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<CreateSnapshotRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let sandbox = sqlx::query_as::<_, Sandbox>(
        "SELECT * FROM sandboxes WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Sandbox not found".into()))?;

    let snapshot = sqlx::query_as::<_, SandboxSnapshot>(
        "INSERT INTO sandbox_snapshots (id, sandbox_id, name, state_data, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(id)
    .bind(&req.name)
    .bind(&serde_json::json!({
        "resource_limits": sandbox.resource_limits,
        "allowed_data_scopes": sandbox.allowed_data_scopes,
        "network_policy": sandbox.network_policy,
        "mode": sandbox.mode,
    }))
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(response::success(snapshot))
}

pub async fn restore_snapshot(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path((id, snapshot_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify sandbox belongs to org
    sqlx::query("SELECT id FROM sandboxes WHERE id = $1 AND organization_id = $2")
        .bind(id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Sandbox not found".into()))?;

    let snapshot = sqlx::query_as::<_, SandboxSnapshot>(
        "SELECT * FROM sandbox_snapshots WHERE id = $1 AND sandbox_id = $2"
    )
    .bind(snapshot_id)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Snapshot not found".into()))?;

    // Restore sandbox state from snapshot
    let state_data = &snapshot.state_data;
    let resource_limits = state_data.get("resource_limits").cloned().unwrap_or(serde_json::json!({}));
    let data_scopes = state_data.get("allowed_data_scopes").cloned().unwrap_or(serde_json::json!([]));
    let network_policy = state_data.get("network_policy").cloned().unwrap_or(serde_json::json!({}));

    let sandbox = sqlx::query_as::<_, Sandbox>(
        "UPDATE sandboxes SET resource_limits = $1, allowed_data_scopes = $2,
         network_policy = $3, updated_at = NOW()
         WHERE id = $4 RETURNING *"
    )
    .bind(&resource_limits)
    .bind(&data_scopes)
    .bind(&network_policy)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "restore_snapshot", "sandbox", Some(id),
        serde_json::json!({"snapshot_id": snapshot_id, "snapshot_name": snapshot.name}),
    ).await;

    Ok(response::success(sandbox))
}

pub async fn get_sandbox_metrics(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sandbox = sqlx::query_as::<_, Sandbox>(
        "SELECT * FROM sandboxes WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Sandbox not found".into()))?;

    // Get request count from audit logs
    let total_requests = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs al
         JOIN agents a ON al.actor_id = a.id
         WHERE a.sandbox_id = $1"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let total_errors = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs al
         JOIN agents a ON al.actor_id = a.id
         WHERE a.sandbox_id = $1 AND al.status = 'failure'"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Get current minute request count from Redis
    let requests_key = format!("sandbox_rpm:{}", id);
    let requests_last_minute: i32 = redis::cmd("GET")
        .arg(&requests_key)
        .query_async::<_, i32>(&mut state.redis.clone())
        .await
        .unwrap_or(0);

    let metrics = SandboxMetrics {
        sandbox_id: id,
        current_memory_mb: 0.0,
        current_cpu_percent: 0.0,
        current_storage_mb: 0.0,
        requests_last_minute,
        active_operations: 0,
        uptime_seconds: (chrono::Utc::now() - sandbox.created_at).num_seconds(),
        total_requests,
        total_errors,
    };

    Ok(response::success(metrics))
}
