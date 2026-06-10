use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use tokio::time::{interval, Duration};

use crate::models::user::Claims;
use crate::utils::{errors::AppError, response};
use crate::AppState;

pub async fn overview(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let total_agents = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM agents WHERE organization_id = $1"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let active_agents = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM agents WHERE organization_id = $1 AND status = 'active'"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let suspended_agents = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM agents WHERE organization_id = $1 AND status = 'suspended'"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let total_policies = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM policies WHERE organization_id = $1"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let total_sandboxes = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM sandboxes WHERE organization_id = $1"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let requests_today = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs
         WHERE organization_id = $1 AND created_at >= CURRENT_DATE"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let errors_today = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM audit_logs
         WHERE organization_id = $1 AND status = 'failure'
         AND created_at >= CURRENT_DATE"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let active_alerts = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM alerts
         WHERE organization_id = $1 AND is_resolved = false"
    )
    .bind(claims.org)
    .fetch_one(&state.db)
    .await?;

    let recent_activity = sqlx::query_as::<_, crate::models::audit::AuditLog>(
        "SELECT * FROM audit_logs
         WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 10"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    Ok(response::success(serde_json::json!({
        "agents": {
            "total": total_agents,
            "active": active_agents,
            "suspended": suspended_agents,
        },
        "policies": {
            "total": total_policies,
        },
        "sandboxes": {
            "total": total_sandboxes,
        },
        "activity": {
            "requests_today": requests_today,
            "errors_today": errors_today,
            "error_rate": if requests_today > 0 {
                (errors_today as f64 / requests_today as f64 * 100.0)
            } else { 0.0 },
        },
        "alerts": {
            "active": active_alerts,
        },
        "recent_activity": recent_activity,
    })))
}

pub async fn metrics(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Hourly activity for the last 24 hours
    let hourly = sqlx::query_as::<_, (i32, i64, i64)>(
        "SELECT
            EXTRACT(HOUR FROM created_at)::int as hour,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'failure') as errors
         FROM audit_logs
         WHERE organization_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hour"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    let hourly_data: Vec<serde_json::Value> = hourly.iter().map(|(hour, total, errors)| {
        serde_json::json!({
            "hour": hour,
            "requests": total,
            "errors": errors,
        })
    }).collect();

    // Top agents by activity
    let top_agents = sqlx::query_as::<_, (uuid::Uuid, String, i64)>(
        "SELECT al.actor_id, a.name, COUNT(*) as count
         FROM audit_logs al
         JOIN agents a ON al.actor_id = a.id
         WHERE al.organization_id = $1
         AND al.actor_type = 'agent'
         AND al.created_at >= CURRENT_DATE
         GROUP BY al.actor_id, a.name
         ORDER BY count DESC
         LIMIT 10"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    let top_agents_data: Vec<serde_json::Value> = top_agents.iter().map(|(id, name, count)| {
        serde_json::json!({
            "agent_id": id,
            "agent_name": name,
            "request_count": count,
        })
    }).collect();

    // Actions distribution
    let action_distribution = sqlx::query_as::<_, (String, i64)>(
        "SELECT action, COUNT(*) as count
         FROM audit_logs
         WHERE organization_id = $1
         AND created_at >= CURRENT_DATE
         GROUP BY action
         ORDER BY count DESC
         LIMIT 20"
    )
    .bind(claims.org)
    .fetch_all(&state.db)
    .await?;

    let actions_data: Vec<serde_json::Value> = action_distribution.iter().map(|(action, count)| {
        serde_json::json!({
            "action": action,
            "count": count,
        })
    }).collect();

    Ok(response::success(serde_json::json!({
        "hourly_activity": hourly_data,
        "top_agents": top_agents_data,
        "action_distribution": actions_data,
    })))
}

pub async fn live_feed(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_live_feed(socket, state))
}

async fn handle_live_feed(mut socket: WebSocket, state: Arc<AppState>) {
    let mut ticker = interval(Duration::from_secs(2));
    let mut last_id: Option<uuid::Uuid> = None;

    loop {
        ticker.tick().await;

        let query = if let Some(ref lid) = last_id {
            sqlx::query_as::<_, crate::models::audit::AuditLog>(
                "SELECT * FROM audit_logs WHERE created_at > (
                    SELECT created_at FROM audit_logs WHERE id = $1
                ) ORDER BY created_at ASC LIMIT 10"
            )
            .bind(lid)
            .fetch_all(&state.db)
            .await
        } else {
            sqlx::query_as::<_, crate::models::audit::AuditLog>(
                "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5"
            )
            .fetch_all(&state.db)
            .await
        };

        match query {
            Ok(logs) => {
                if let Some(last) = logs.last() {
                    last_id = Some(last.id);
                }

                if !logs.is_empty() {
                    let payload = serde_json::json!({
                        "type": "audit_events",
                        "data": logs,
                    });

                    if socket
                        .send(Message::Text(payload.to_string().into()))
                        .await
                        .is_err()
                    {
                        break; // Client disconnected
                    }
                }
            }
            Err(e) => {
                tracing::error!("Live feed DB error: {}", e);
            }
        }

        // Check for client messages (ping/pong/close)
        if let Ok(Some(msg)) = tokio::time::timeout(
            Duration::from_millis(100),
            socket.recv(),
        ).await {
            match msg {
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {}
            }
        }
    }
}
