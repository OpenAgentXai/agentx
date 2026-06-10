use axum::{
    extract::{Request, State},
    http::header::AUTHORIZATION,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use std::sync::Arc;

use crate::models::user::{Claims, TokenType, UserRole};
use crate::utils::errors::AppError;
use crate::AppState;

/// Extract and validate JWT from Authorization header
pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing authorization header".into()))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| AppError::Unauthorized("Invalid authorization format. Use: Bearer <token>".into()))?;

    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => {
            AppError::Unauthorized("Token expired".into())
        }
        _ => AppError::Unauthorized(format!("Invalid token: {}", e)),
    })?
    .claims;

    if claims.token_type != TokenType::Access {
        return Err(AppError::Unauthorized("Invalid token type".into()));
    }

    // Check if token is blacklisted (logged out)
    let blacklisted: bool = redis::cmd("EXISTS")
        .arg(format!("blacklist:{}", token))
        .query_async(&mut state.redis.clone())
        .await
        .unwrap_or(false);

    if blacklisted {
        return Err(AppError::Unauthorized("Token has been revoked".into()));
    }

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

/// Require admin or owner role
pub async fn require_admin(
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("No auth context".into()))?;

    match claims.role {
        UserRole::Admin | UserRole::Owner => Ok(next.run(req).await),
        _ => Err(AppError::Forbidden("Admin access required".into())),
    }
}

/// Require owner role
pub async fn require_owner(
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("No auth context".into()))?;

    match claims.role {
        UserRole::Owner => Ok(next.run(req).await),
        _ => Err(AppError::Forbidden("Owner access required".into())),
    }
}

/// Extract claims from request extensions (use after require_auth middleware)
pub fn get_claims(req: &Request) -> Result<&Claims, AppError> {
    req.extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("No auth context".into()))
}

/// Validate agent API key from X-Agent-Key header
pub async fn require_agent_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let api_key = req
        .headers()
        .get("X-Agent-Key")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing X-Agent-Key header".into()))?;

    // Look up agent by key prefix and verify full key
    let key_prefix = if api_key.len() > 12 {
        &api_key[..12]
    } else {
        api_key
    };

    let credential = sqlx::query_as::<_, (uuid::Uuid, uuid::Uuid, String)>(
        "SELECT c.id, c.agent_id, c.key_hash FROM agent_credentials c
         JOIN agents a ON c.agent_id = a.id
         WHERE c.key_prefix = $1
         AND c.is_active = true
         AND a.status = 'active'
         AND (c.expires_at IS NULL OR c.expires_at > NOW())"
    )
    .bind(key_prefix)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid or expired API key".into()))?;

    // Verify the full key hash
    let valid = crate::utils::crypto::verify_password(api_key, &credential.2)
        .unwrap_or(false);

    if !valid {
        return Err(AppError::Unauthorized("Invalid API key".into()));
    }

    // Update last_used_at
    sqlx::query("UPDATE agent_credentials SET last_used_at = NOW() WHERE id = $1")
        .bind(credential.0)
        .execute(&state.db)
        .await
        .ok();

    // Store agent_id in request extensions
    req.extensions_mut().insert(AgentContext {
        credential_id: credential.0,
        agent_id: credential.1,
    });

    Ok(next.run(req).await)
}

#[derive(Debug, Clone)]
pub struct AgentContext {
    pub credential_id: uuid::Uuid,
    pub agent_id: uuid::Uuid,
}
