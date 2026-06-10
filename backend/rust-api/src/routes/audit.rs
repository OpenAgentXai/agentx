use axum::{
    extract::{Path, Query, State},
    http::header,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::audit::*;
use crate::models::user::Claims;
use crate::utils::{errors::AppError, response};
use crate::AppState;

pub async fn list_logs(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Query(query): Query<AuditLogQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let (page, per_page, offset) = response::normalize_pagination(query.page, query.per_page);

    let logs = sqlx::query_as::<_, AuditLog>(
        "SELECT * FROM audit_logs WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3"
    )
    .bind(claims.org)
    .bind(per_page as i64)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs WHERE organization_id = $1"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    Ok(response::paginated(logs, total, page, per_page))
}

pub async fn get_log(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let log = sqlx::query_as::<_, AuditLog>(
        "SELECT * FROM audit_logs WHERE id = $1 AND organization_id = $2"
    )
    .bind(id)
    .bind(claims.org)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Audit log not found".into()))?;

    Ok(response::success(log))
}

pub async fn export_logs(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Query(query): Query<ExportQuery>,
) -> Result<impl IntoResponse, AppError> {
    let from = query.from.unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::days(30));
    let to = query.to.unwrap_or_else(chrono::Utc::now);

    let logs = sqlx::query_as::<_, AuditLog>(
        "SELECT * FROM audit_logs
         WHERE organization_id = $1
         AND created_at >= $2 AND created_at <= $3
         ORDER BY created_at DESC
         LIMIT 10000"
    )
    .bind(claims.org)
    .bind(from)
    .bind(to)
    .fetch_all(&state.db)
    .await?;

    let format = query.format.unwrap_or(ExportFormat::Json);

    match format {
        ExportFormat::Json => {
            let json_data = serde_json::to_string_pretty(&logs)
                .map_err(|e| AppError::Internal(format!("JSON serialization error: {}", e)))?;

            Ok((
                [
                    (header::CONTENT_TYPE, "application/json"),
                    (header::CONTENT_DISPOSITION, "attachment; filename=\"audit_logs.json\""),
                ],
                json_data,
            ))
        }
        ExportFormat::Csv => {
            let mut csv = String::from("id,actor_type,actor_id,actor_name,action,resource_type,resource_id,status,created_at\n");
            for log in &logs {
                csv.push_str(&format!(
                    "{},{:?},{},{},{},{},{:?},{:?},{}\n",
                    log.id, log.actor_type, log.actor_id, log.actor_name,
                    log.action, log.resource_type, log.resource_id,
                    log.status, log.created_at
                ));
            }

            Ok((
                [
                    (header::CONTENT_TYPE, "text/csv"),
                    (header::CONTENT_DISPOSITION, "attachment; filename=\"audit_logs.csv\""),
                ],
                csv,
            ))
        }
    }
}

pub async fn list_alerts(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let alerts = sqlx::query_as::<_, Alert>(
        "SELECT * FROM alerts WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 100"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    let rules = sqlx::query_as::<_, AlertRule>(
        "SELECT * FROM alert_rules WHERE organization_id = $1 ORDER BY created_at DESC"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(serde_json::json!({
        "alerts": alerts,
        "rules": rules,
    })))
}

pub async fn create_alert_rule(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Json(req): Json<CreateAlertRuleRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let rule_id = Uuid::new_v4();
    let notify_channels = req.notify_channels.unwrap_or(serde_json::json!(["dashboard"]));

    let rule = sqlx::query_as::<_, AlertRule>(
        "INSERT INTO alert_rules (id, organization_id, name, description,
         condition_type, condition_config, severity, is_active,
         notify_channels, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, NOW(), NOW())
         RETURNING *"
    )
    .bind(rule_id)
    .bind(claims.org)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.condition_type)
    .bind(&req.condition_config)
    .bind(&req.severity)
    .bind(&notify_channels)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    crate::middleware::audit::log_user_action(
        &state.db, claims.org, claims.sub, "user",
        "create_alert_rule", "alert_rule", Some(rule_id),
        serde_json::json!({"name": req.name, "severity": req.severity}),
    ).await;

    Ok(response::success(rule))
}
