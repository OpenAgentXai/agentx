use axum::{extract::{Path, State}, Json};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::models::group::*;
use crate::models::user::Claims;
use crate::utils::{errors::AppError, response};
use crate::AppState;

/// List all groups for the authenticated user's organization, including member counts.
pub async fn list_groups(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let rows = sqlx::query_as::<_, AgentGroup>(
        "SELECT g.*
         FROM agent_groups g
         WHERE g.organization_id = $1
         ORDER BY g.created_at DESC",
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    let mut groups: Vec<serde_json::Value> = Vec::with_capacity(rows.len());

    for group in rows {
        let member_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM agent_group_memberships WHERE group_id = $1",
        )
        .bind(group.id)
        .fetch_one(&state.db)
        .await?;

        groups.push(serde_json::json!({
            "id": group.id,
            "organization_id": group.organization_id,
            "name": group.name,
            "description": group.description,
            "member_count": member_count,
            "created_at": group.created_at,
            "updated_at": group.updated_at,
        }));
    }

    Ok(response::success(groups))
}

/// Create a new agent group within the authenticated user's organization.
pub async fn create_group(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let group_id = Uuid::new_v4();

    let group = sqlx::query_as::<_, AgentGroup>(
        "INSERT INTO agent_groups (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *",
    )
    .bind(group_id)
    .bind(claims.org)
    .bind(&req.name)
    .bind(&req.description)
    .fetch_one(&state.db)
    .await?;

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "create_group",
        "group",
        Some(group_id),
        serde_json::json!({"name": req.name}),
    )
    .await;

    Ok(response::success(group))
}

/// Get a single group by ID, including full member details.
pub async fn get_group(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let group = sqlx::query_as::<_, AgentGroup>(
        "SELECT * FROM agent_groups WHERE id = $1 AND organization_id = $2",
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Group not found".into()))?;

    let member_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM agent_group_memberships WHERE group_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    let members = sqlx::query_as::<_, GroupMemberInfo>(
        "SELECT m.agent_id, a.name AS agent_name, a.status AS agent_status, m.added_at
         FROM agent_group_memberships m
         JOIN agents a ON a.id = m.agent_id
         WHERE m.group_id = $1
         ORDER BY m.added_at DESC",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let result = GroupWithMembers {
        group,
        member_count,
        members,
    };

    Ok(response::success(result))
}

/// Update a group's name and/or description.
pub async fn update_group(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let existing = sqlx::query_as::<_, AgentGroup>(
        "SELECT * FROM agent_groups WHERE id = $1 AND organization_id = $2",
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Group not found".into()))?;

    let name = req.name.unwrap_or(existing.name);
    let description = req.description.or(existing.description);

    let group = sqlx::query_as::<_, AgentGroup>(
        "UPDATE agent_groups SET name = $1, description = $2, updated_at = NOW()
         WHERE id = $3 AND organization_id = $4
         RETURNING *",
    )
    .bind(&name)
    .bind(&description)
    .bind(id)
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "update_group",
        "group",
        Some(id),
        serde_json::json!({"name": name}),
    )
    .await;

    Ok(response::success(group))
}

/// Delete a group and all its membership records.
pub async fn delete_group(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Remove all memberships first to keep referential integrity clean
    sqlx::query("DELETE FROM agent_group_memberships WHERE group_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    let result = sqlx::query(
        "DELETE FROM agent_groups WHERE id = $1 AND organization_id = $2",
    )
    .bind(id)
    .bind(claims.org)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Group not found".into()));
    }

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "delete_group",
        "group",
        Some(id),
        serde_json::json!({}),
    )
    .await;

    Ok(response::message("Group deleted successfully"))
}

/// Assign an agent to a group. The agent must belong to the same organization.
pub async fn assign_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<AssignAgentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify the group exists and belongs to the caller's organization
    sqlx::query("SELECT id FROM agent_groups WHERE id = $1 AND organization_id = $2")
        .bind(id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Group not found".into()))?;

    // Verify the agent exists and belongs to the same organization
    sqlx::query("SELECT id FROM agents WHERE id = $1 AND organization_id = $2")
        .bind(req.agent_id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;

    // Check for duplicate membership
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM agent_group_memberships WHERE group_id = $1 AND agent_id = $2",
    )
    .bind(id)
    .bind(req.agent_id)
    .fetch_one(&state.db)
    .await?;

    if existing > 0 {
        return Err(AppError::Conflict("Agent is already a member of this group".into()));
    }

    let membership = sqlx::query_as::<_, AgentGroupMembership>(
        "INSERT INTO agent_group_memberships (id, group_id, agent_id, added_at, added_by)
         VALUES ($1, $2, $3, NOW(), $4)
         RETURNING *",
    )
    .bind(Uuid::new_v4())
    .bind(id)
    .bind(req.agent_id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "assign_agent_to_group",
        "group",
        Some(id),
        serde_json::json!({"agent_id": req.agent_id}),
    )
    .await;

    Ok(response::success(membership))
}

/// Remove an agent from a group.
pub async fn remove_agent(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path((id, agent_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify the group belongs to the caller's organization
    sqlx::query("SELECT id FROM agent_groups WHERE id = $1 AND organization_id = $2")
        .bind(id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Group not found".into()))?;

    let result = sqlx::query(
        "DELETE FROM agent_group_memberships WHERE group_id = $1 AND agent_id = $2",
    )
    .bind(id)
    .bind(agent_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Agent is not a member of this group".into()));
    }

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "remove_agent_from_group",
        "group",
        Some(id),
        serde_json::json!({"agent_id": agent_id}),
    )
    .await;

    Ok(response::message("Agent removed from group successfully"))
}
