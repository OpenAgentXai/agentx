use axum::{extract::State, Json};
use serde_json::json;
use std::sync::Arc;

use crate::AppState;

pub async fn health_check(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .is_ok();

    let redis_ok: bool = redis::cmd("PING")
        .query_async::<_, String>(&mut state.redis.clone())
        .await
        .map(|r| r == "PONG")
        .unwrap_or(false);

    let status = if db_ok && redis_ok { "healthy" } else { "degraded" };

    Json(json!({
        "status": status,
        "version": env!("CARGO_PKG_VERSION"),
        "services": {
            "database": if db_ok { "up" } else { "down" },
            "redis": if redis_ok { "up" } else { "down" },
        }
    }))
}
