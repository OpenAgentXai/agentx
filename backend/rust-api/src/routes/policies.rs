use axum::{
    extract::{Path, Query, State},
    Json,
};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::models::policy::*;
use crate::models::user::Claims;
use crate::utils::{errors::AppError, response};
use crate::AppState;

pub async fn list_policies(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let policies = sqlx::query_as::<_, Policy>(
        "SELECT * FROM policies WHERE organization_id = $1 ORDER BY priority ASC, created_at DESC"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(policies))
}

pub async fn create_policy(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Json(req): Json<CreatePolicyRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let policy_id = Uuid::new_v4();
    let priority = req.priority.unwrap_or(100);
    let conditions = req.conditions.unwrap_or(serde_json::json!({}));

    let policy = sqlx::query_as::<_, Policy>(
        "INSERT INTO policies (id, organization_id, name, description, effect,
         resources, actions, conditions, priority, is_active, created_by,
         created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, NOW(), NOW())
         RETURNING *"
    )
    .bind(policy_id)
    .bind(claims.org)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.effect)
    .bind(serde_json::json!(req.resources))
    .bind(serde_json::json!(req.actions))
    .bind(&conditions)
    .bind(priority)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "create_policy", "policy", Some(policy_id),
        serde_json::json!({"name": req.name, "effect": req.effect}),
    ).await;

    Ok(response::success(policy))
}

pub async fn get_policy(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let policy = sqlx::query_as::<_, Policy>(
        "SELECT * FROM policies WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Policy not found".into()))?;

    let assignments = sqlx::query_as::<_, PolicyAssignment>(
        "SELECT * FROM policy_assignments WHERE policy_id = $1"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(serde_json::json!({
        "policy": policy,
        "assignments": assignments,
    })))
}

pub async fn update_policy(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdatePolicyRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let existing = sqlx::query_as::<_, Policy>(
        "SELECT * FROM policies WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Policy not found".into()))?;

    let name = req.name.unwrap_or(existing.name);
    let description = req.description.or(existing.description);
    let effect = req.effect.unwrap_or(existing.effect);
    let resources = req.resources
        .map(|r| serde_json::json!(r))
        .unwrap_or(existing.resources);
    let actions = req.actions
        .map(|a| serde_json::json!(a))
        .unwrap_or(existing.actions);
    let conditions = req.conditions.unwrap_or(existing.conditions);
    let priority = req.priority.unwrap_or(existing.priority);
    let is_active = req.is_active.unwrap_or(existing.is_active);

    let policy = sqlx::query_as::<_, Policy>(
        "UPDATE policies SET name = $1, description = $2, effect = $3,
         resources = $4, actions = $5, conditions = $6, priority = $7,
         is_active = $8, updated_at = NOW()
         WHERE id = $9 RETURNING *"
    )
    .bind(&name)
    .bind(&description)
    .bind(&effect)
    .bind(&resources)
    .bind(&actions)
    .bind(&conditions)
    .bind(priority)
    .bind(is_active)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Invalidate cached policy evaluations
    let pattern = format!("policy_eval:*");
    let _: () = redis::cmd("DEL")
        .arg(&pattern)
        .query_async(&mut state.redis.clone())
        .await
        .unwrap_or(());

    Ok(response::success(policy))
}

pub async fn delete_policy(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Delete assignments first
    sqlx::query("DELETE FROM policy_assignments WHERE policy_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    let result = sqlx::query(
        "DELETE FROM policies WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Policy not found".into()));
    }

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "delete_policy", "policy", Some(id),
        serde_json::json!({}),
    ).await;

    Ok(response::message("Policy deleted successfully"))
}

pub async fn simulate_policy(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Json(req): Json<SimulatePolicyRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify agent belongs to org
    let agent = sqlx::query_as::<_, crate::models::agent::Agent>(
        "SELECT * FROM agents WHERE id = $1 AND organization_id = $2"
    )
    .bind(req.agent_id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;

    // Get all policies assigned to this agent (directly or via groups)
    let policies = sqlx::query_as::<_, Policy>(
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
    .bind(claims.org)
    .bind(req.agent_id)
    .fetch_all(&state.db)
    .await?;

    let mut matching_policies = Vec::new();
    let mut effective_effect = PolicyEffect::Deny; // Default deny
    let mut reason = String::from("No matching policy found — default deny");

    for policy in &policies {
        let resources: Vec<String> = serde_json::from_value(policy.resources.clone())
            .unwrap_or_default();
        let actions: Vec<String> = serde_json::from_value(policy.actions.clone())
            .unwrap_or_default();

        let resource_match = resources.iter().any(|r| {
            if r == "*" { return true; }
            if r.ends_with(":*") {
                let prefix = &r[..r.len() - 2];
                return req.resource.starts_with(prefix);
            }
            r == &req.resource
        });

        let action_match = actions.iter().any(|a| a == "*" || a == &req.action);

        if resource_match && action_match {
            matching_policies.push(PolicyMatch {
                policy_id: policy.id,
                policy_name: policy.name.clone(),
                effect: policy.effect.clone(),
                priority: policy.priority,
                matched_resource: req.resource.clone(),
                matched_action: req.action.clone(),
            });

            // First matching policy wins (ordered by priority)
            if matching_policies.len() == 1 {
                effective_effect = policy.effect.clone();
                reason = format!(
                    "Policy '{}' (priority {}) {} access",
                    policy.name,
                    policy.priority,
                    match policy.effect {
                        PolicyEffect::Allow => "allows",
                        PolicyEffect::Deny => "denies",
                    }
                );
            }
        }
    }

    let allowed = effective_effect == PolicyEffect::Allow;

    Ok(response::success(SimulatePolicyResponse {
        allowed,
        matching_policies,
        effective_effect,
        reason,
    }))
}

pub async fn assign_policy(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<AssignPolicyRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify policy belongs to org
    sqlx::query("SELECT id FROM policies WHERE id = $1 AND organization_id = $2")
        .bind(id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Policy not found".into()))?;

    // Verify target exists
    match req.target_type {
        AssignmentTarget::Agent => {
            sqlx::query("SELECT id FROM agents WHERE id = $1 AND organization_id = $2")
                .bind(req.target_id)
                .bind(claims.org)
                .fetch_optional(&state.db)
                .await?
                .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;
        }
        AssignmentTarget::Group => {
            sqlx::query("SELECT id FROM agent_groups WHERE id = $1 AND organization_id = $2")
                .bind(req.target_id)
                .bind(claims.org)
                .fetch_optional(&state.db)
                .await?
                .ok_or_else(|| AppError::NotFound("Group not found".into()))?;
        }
    }

    // Check for duplicate assignment
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM policy_assignments
         WHERE policy_id = $1 AND target_id = $2 AND target_type = $3"
    )
    .bind(id)
    .bind(req.target_id)
    .bind(&req.target_type)
    .fetch_one(&state.db)
    .await?;

    if existing > 0 {
        return Err(AppError::Conflict("Policy already assigned to this target".into()));
    }

    let assignment = sqlx::query_as::<_, PolicyAssignment>(
        "INSERT INTO policy_assignments (id, policy_id, target_type, target_id, assigned_by, assigned_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *"
    )
    .bind(Uuid::new_v4())
    .bind(id)
    .bind(&req.target_type)
    .bind(req.target_id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(response::success(assignment))
}

pub async fn unassign_policy(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path((id, target_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify policy belongs to org
    sqlx::query("SELECT id FROM policies WHERE id = $1 AND organization_id = $2")
        .bind(id)
        .bind(claims.org)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Policy not found".into()))?;

    let result = sqlx::query(
        "DELETE FROM policy_assignments WHERE policy_id = $1 AND target_id = $2"
    )
    .bind(id)
    .bind(target_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Assignment not found".into()));
    }

    Ok(response::message("Policy unassigned successfully"))
}
