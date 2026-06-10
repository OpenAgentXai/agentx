use axum::{
    extract::{Path, Query, State},
    Json,
};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::models::agent::*;
use crate::models::user::Claims;
use crate::utils::{errors::AppError, response};
use crate::AppState;

pub async fn list_agents(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Query(query): Query<AgentListQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let (page, per_page, offset) = response::normalize_pagination(query.page, query.per_page);

    let mut sql = String::from(
        "SELECT * FROM agents WHERE organization_id = $1"
    );
    let mut count_sql = String::from(
        "SELECT COUNT(*) FROM agents WHERE organization_id = $1"
    );
    let mut param_idx = 2u32;

    if query.status.is_some() {
        sql.push_str(&format!(" AND status = ${}", param_idx));
        count_sql.push_str(&format!(" AND status = ${}", param_idx));
        param_idx += 1;
    }

    if query.agent_type.is_some() {
        sql.push_str(&format!(" AND agent_type = ${}", param_idx));
        count_sql.push_str(&format!(" AND agent_type = ${}", param_idx));
        param_idx += 1;
    }

    if query.search.is_some() {
        sql.push_str(&format!(" AND (name ILIKE ${0} OR description ILIKE ${0})", param_idx));
        count_sql.push_str(&format!(" AND (name ILIKE ${0} OR description ILIKE ${0})", param_idx));
        param_idx += 1;
    }

    if query.tag.is_some() {
        sql.push_str(&format!(" AND ${} = ANY(tags)", param_idx));
        count_sql.push_str(&format!(" AND ${} = ANY(tags)", param_idx));
    }

    sql.push_str(" ORDER BY created_at DESC LIMIT $100 OFFSET $101");

    // Build and execute query dynamically
    let agents = sqlx::query_as::<_, Agent>(
        "SELECT * FROM agents WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3"
    )
    .bind(claims.org)
    .bind(per_page as i64)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM agents WHERE organization_id = $1"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    Ok(response::paginated(agents, total, page, per_page))
}

pub async fn create_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Json(req): Json<CreateAgentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let agent_id = Uuid::new_v4();
    let metadata = req.metadata.unwrap_or(serde_json::json!({}));
    let tags = req.tags.unwrap_or_default();
    let max_rpm = req.max_requests_per_minute.unwrap_or(60);
    let max_rpd = req.max_requests_per_day.unwrap_or(10000);

    let agent = sqlx::query_as::<_, Agent>(
        "INSERT INTO agents (id, organization_id, name, description, agent_type, status,
         owner_id, metadata, tags, max_requests_per_minute, max_requests_per_day,
         created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *"
    )
    .bind(agent_id)
    .bind(claims.org)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.agent_type)
    .bind(claims.sub)
    .bind(&metadata)
    .bind(&tags)
    .bind(max_rpm)
    .bind(max_rpd)
    .fetch_one(&state.db)
    .await?;

    // Cache agent rate limit in Redis
    let _: () = redis::cmd("SET")
        .arg(format!("agent_limit:{}", agent_id))
        .arg(max_rpm)
        .arg("EX")
        .arg(3600)
        .query_async(&mut state.redis.clone())
        .await
        .unwrap_or(());

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "create_agent", "agent", Some(agent_id),
        serde_json::json!({"name": req.name, "type": req.agent_type}),
    ).await;

    Ok(response::success(agent))
}

pub async fn get_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let agent = sqlx::query_as::<_, Agent>(
        "SELECT * FROM agents WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;

    Ok(response::success(agent))
}

pub async fn update_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateAgentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    // Verify agent exists and belongs to org
    let existing = sqlx::query_as::<_, Agent>(
        "SELECT * FROM agents WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;

    let name = req.name.unwrap_or(existing.name);
    let description = req.description.or(existing.description);
    let agent_type = req.agent_type.unwrap_or(existing.agent_type);
    let metadata = req.metadata.unwrap_or(existing.metadata);
    let tags = req.tags.unwrap_or(existing.tags);
    let max_rpm = req.max_requests_per_minute.unwrap_or(existing.max_requests_per_minute);
    let max_rpd = req.max_requests_per_day.unwrap_or(existing.max_requests_per_day);

    let agent = sqlx::query_as::<_, Agent>(
        "UPDATE agents SET name = $1, description = $2, agent_type = $3,
         metadata = $4, tags = $5, max_requests_per_minute = $6,
         max_requests_per_day = $7, updated_at = NOW()
         WHERE id = $8 RETURNING *"
    )
    .bind(&name)
    .bind(&description)
    .bind(&agent_type)
    .bind(&metadata)
    .bind(&tags)
    .bind(max_rpm)
    .bind(max_rpd)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Update cached rate limit
    let _: () = redis::cmd("SET")
        .arg(format!("agent_limit:{}", id))
        .arg(max_rpm)
        .arg("EX")
        .arg(3600)
        .query_async(&mut state.redis.clone())
        .await
        .unwrap_or(());

    Ok(response::success(agent))
}

pub async fn delete_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        "DELETE FROM agents WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Agent not found".into()));
    }

    // Clean up Redis cache
    let _: () = redis::cmd("DEL")
        .arg(format!("agent_limit:{}", id))
        .query_async(&mut state.redis.clone())
        .await
        .unwrap_or(());

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "delete_agent", "agent", Some(id),
        serde_json::json!({}),
    ).await;

    Ok(response::message("Agent deleted successfully"))
}

pub async fn suspend_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let agent = sqlx::query_as::<_, Agent>(
        "UPDATE agents SET status = 'suspended', updated_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND status = 'active'
         RETURNING *"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Agent not found or not active".into()))?;

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "suspend_agent", "agent", Some(id),
        serde_json::json!({"agent_name": agent.name}),
    ).await;

    Ok(response::success(agent))
}

pub async fn activate_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let agent = sqlx::query_as::<_, Agent>(
        "UPDATE agents SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND status = 'suspended'
         RETURNING *"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Agent not found or not suspended".into()))?;

    Ok(response::success(agent))
}

pub async fn revoke_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let agent = sqlx::query_as::<_, Agent>(
        "UPDATE agents SET status = 'revoked', updated_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND status != 'revoked'
         RETURNING *"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Agent not found or already revoked".into()))?;

    // Revoke all credentials
    sqlx::query("UPDATE agent_credentials SET is_active = false WHERE agent_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "revoke_agent", "agent", Some(id),
        serde_json::json!({"agent_name": agent.name}),
    ).await;

    Ok(response::success(agent))
}

pub async fn get_agent_activity(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify agent belongs to org
    sqlx::query("SELECT id FROM agents WHERE id = $1 AND organization_id = $2")
        .bind(id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;

    let logs = sqlx::query_as::<_, crate::models::audit::AuditLog>(
        "SELECT * FROM audit_logs
         WHERE actor_id = $1 AND organization_id = $2
         ORDER BY created_at DESC LIMIT 50"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(logs))
}

pub async fn get_agent_metrics(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify agent belongs to org
    sqlx::query("SELECT id FROM agents WHERE id = $1 AND organization_id = $2")
        .bind(id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;

    let today_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs
         WHERE actor_id = $1 AND created_at >= CURRENT_DATE"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    let week_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs
         WHERE actor_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    let error_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs
         WHERE actor_id = $1 AND status = 'failure'
         AND created_at >= CURRENT_DATE - INTERVAL '7 days'"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    let error_rate = if week_count > 0 {
        (error_count as f64) / (week_count as f64) * 100.0
    } else {
        0.0
    };

    let metrics = AgentMetrics {
        agent_id: id,
        total_requests_today: today_count,
        total_requests_week: week_count,
        avg_response_time_ms: 0.0,
        error_rate,
        actions_by_type: serde_json::json!({}),
        hourly_activity: vec![],
    };

    Ok(response::success(metrics))
}
