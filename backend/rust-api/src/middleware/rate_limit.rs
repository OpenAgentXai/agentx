use axum::{
    extract::{ConnectInfo, Request, State},
    middleware::Next,
    response::Response,
};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::utils::errors::AppError;
use crate::AppState;

/// Rate limit middleware using Redis sliding window
pub async fn rate_limit(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let ip = req
        .headers()
        .get("X-Forwarded-For")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("unknown").trim().to_string())
        .unwrap_or_else(|| {
            req.extensions()
                .get::<ConnectInfo<SocketAddr>>()
                .map(|ci| ci.0.ip().to_string())
                .unwrap_or_else(|| "unknown".into())
        });

    let key = format!("rate_limit:{}:{}", ip, chrono::Utc::now().format("%Y%m%d%H%M"));
    let mut conn = state.redis.clone();

    let count: i64 = redis::cmd("INCR")
        .arg(&key)
        .query_async(&mut conn)
        .await
        .unwrap_or(0);

    if count == 1 {
        // Set expiry on first request in this window
        let _: () = redis::cmd("EXPIRE")
            .arg(&key)
            .arg(60)
            .query_async(&mut conn)
            .await
            .unwrap_or(());
    }

    let max_requests: i64 = std::env::var("RATE_LIMIT_PER_MINUTE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);

    if count > max_requests {
        return Err(AppError::RateLimited);
    }

    let mut response = next.run(req).await;

    // Add rate limit headers
    response.headers_mut().insert(
        "X-RateLimit-Limit",
        max_requests.to_string().parse().unwrap(),
    );
    response.headers_mut().insert(
        "X-RateLimit-Remaining",
        (max_requests - count).max(0).to_string().parse().unwrap(),
    );

    Ok(response)
}

/// Rate limit for agent API (per agent, stricter)
pub async fn agent_rate_limit(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    if let Some(agent_ctx) = req.extensions().get::<super::auth::AgentContext>() {
        let agent_id = agent_ctx.agent_id;
        let key = format!(
            "agent_rate:{}:{}",
            agent_id,
            chrono::Utc::now().format("%Y%m%d%H%M")
        );
        let mut conn = state.redis.clone();

        let count: i64 = redis::cmd("INCR")
            .arg(&key)
            .query_async(&mut conn)
            .await
            .unwrap_or(0);

        if count == 1 {
            let _: () = redis::cmd("EXPIRE")
                .arg(&key)
                .arg(60)
                .query_async(&mut conn)
                .await
                .unwrap_or(());
        }

        // Get agent-specific rate limit from DB (cached in Redis)
        let cache_key = format!("agent_limit:{}", agent_id);
        let limit: i64 = redis::cmd("GET")
            .arg(&cache_key)
            .query_async::<_, i64>(&mut conn)
            .await
            .unwrap_or(60); // Default 60 rpm

        if count > limit {
            // Log rate limit event
            tracing::warn!(agent_id = %agent_id, "Agent rate limited");
            return Err(AppError::RateLimited);
        }
    }

    Ok(next.run(req).await)
}
