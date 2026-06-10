use axum::{extract::{Path, State}, Json};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::models::credential::*;
use crate::models::user::Claims;
use crate::utils::{crypto, errors::AppError, response};
use crate::AppState;

/// Verify that an agent exists and belongs to the caller's organization.
/// Returns the agent name for use in audit logs.
async fn verify_agent_ownership(
    db: &sqlx::PgPool,
    agent_id: Uuid,
    org_id: Uuid,
) -> Result<String, AppError> {
    let row = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM agents WHERE id = $1 AND organization_id = $2"
    )
    .bind(agent_id)
    .bind(org_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;

    Ok(row.0)
}

/// GET /agents/:id/credentials
///
/// List all credentials for an agent. Returns public credential data only
/// (key_hash is never exposed).
pub async fn list_credentials(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify the agent belongs to the caller's organization
    verify_agent_ownership(&state.db, id, claims.org).await?;

    let credentials = sqlx::query_as::<_, AgentCredential>(
        "SELECT * FROM agent_credentials
         WHERE agent_id = $1
         ORDER BY created_at DESC"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let public: Vec<CredentialPublic> = credentials.into_iter().map(Into::into).collect();

    Ok(response::success(public))
}

/// POST /agents/:id/credentials
///
/// Generate a new API key, JWT, or certificate for an agent. The raw key is
/// returned exactly once in the response; only the hash is stored.
pub async fn create_credential(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<CreateCredentialRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    // Verify the agent belongs to the caller's organization
    let agent_name = verify_agent_ownership(&state.db, id, claims.org).await?;

    // Enforce a reasonable upper limit on active credentials per agent
    let active_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM agent_credentials
         WHERE agent_id = $1 AND is_active = true"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    if active_count >= 10 {
        return Err(AppError::BadRequest(
            "Maximum of 10 active credentials per agent. Revoke an existing credential first.".into(),
        ));
    }

    // Generate the raw key, its display prefix, and its storage hash
    let raw_key = crypto::generate_api_key();
    let key_prefix = crypto::api_key_prefix(&raw_key);
    let key_hash = crypto::hash_api_key(&raw_key);

    // Calculate optional expiry
    let expires_at = req.expires_in_days.map(|days| {
        if days <= 0 {
            chrono::Utc::now() + chrono::Duration::days(365)
        } else {
            chrono::Utc::now() + chrono::Duration::days(days as i64)
        }
    });

    let cred_id = Uuid::new_v4();

    let credential = sqlx::query_as::<_, AgentCredential>(
        "INSERT INTO agent_credentials
         (id, agent_id, credential_type, key_hash, key_prefix, name, is_active,
          expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW())
         RETURNING *"
    )
    .bind(cred_id)
    .bind(id)
    .bind(&req.credential_type)
    .bind(&key_hash)
    .bind(&key_prefix)
    .bind(&req.name)
    .bind(expires_at)
    .fetch_one(&state.db)
    .await?;

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "create_credential",
        "credential",
        Some(cred_id),
        serde_json::json!({
            "agent_id": id,
            "agent_name": agent_name,
            "credential_name": req.name,
            "credential_type": req.credential_type,
            "expires_at": expires_at,
        }),
    )
    .await;

    // Return the raw key exactly once -- it will never be retrievable again
    let response = CreateCredentialResponse {
        id: credential.id,
        name: credential.name,
        credential_type: credential.credential_type,
        key: raw_key,
        key_prefix: credential.key_prefix,
        expires_at: credential.expires_at,
        created_at: credential.created_at,
    };

    Ok(response::success(response))
}

/// DELETE /agents/:id/credentials/:cred_id
///
/// Revoke (deactivate) a credential. The credential row is kept for audit
/// history but can no longer be used for authentication.
pub async fn revoke_credential(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path((id, cred_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify the agent belongs to the caller's organization
    let agent_name = verify_agent_ownership(&state.db, id, claims.org).await?;

    // Revoke the credential, ensuring it belongs to the correct agent
    let credential = sqlx::query_as::<_, AgentCredential>(
        "UPDATE agent_credentials
         SET is_active = false
         WHERE id = $1 AND agent_id = $2 AND is_active = true
         RETURNING *"
    )
    .bind(cred_id)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| {
        AppError::NotFound("Credential not found or already revoked".into())
    })?;

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "revoke_credential",
        "credential",
        Some(cred_id),
        serde_json::json!({
            "agent_id": id,
            "agent_name": agent_name,
            "credential_name": credential.name,
            "credential_type": credential.credential_type,
        }),
    )
    .await;

    let public: CredentialPublic = credential.into();
    Ok(response::success(public))
}

/// POST /agents/:id/credentials/:cred_id/rotate
///
/// Atomically revoke an existing credential and issue a new one of the same
/// type and name. The new credential carries a `rotated_from` reference back
/// to the old one for traceability. The raw key for the new credential is
/// returned exactly once.
pub async fn rotate_credential(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
    Path((id, cred_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify the agent belongs to the caller's organization
    let agent_name = verify_agent_ownership(&state.db, id, claims.org).await?;

    // Begin a transaction so the revoke + create are atomic
    let mut tx = state.db.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {}", e))
    })?;

    // 1. Revoke the old credential
    let old_credential = sqlx::query_as::<_, AgentCredential>(
        "UPDATE agent_credentials
         SET is_active = false
         WHERE id = $1 AND agent_id = $2 AND is_active = true
         RETURNING *"
    )
    .bind(cred_id)
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| {
        AppError::NotFound("Credential not found or already revoked".into())
    })?;

    // 2. Generate the new key material
    let raw_key = crypto::generate_api_key();
    let key_prefix = crypto::api_key_prefix(&raw_key);
    let key_hash = crypto::hash_api_key(&raw_key);

    // Preserve the original expiry window relative to now if one was set
    let expires_at = old_credential.expires_at.map(|old_exp| {
        let remaining = old_exp - old_credential.created_at;
        chrono::Utc::now() + remaining
    });

    let new_cred_id = Uuid::new_v4();

    // 3. Insert the replacement credential with a back-reference
    let new_credential = sqlx::query_as::<_, AgentCredential>(
        "INSERT INTO agent_credentials
         (id, agent_id, credential_type, key_hash, key_prefix, name, is_active,
          expires_at, rotated_from, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, NOW())
         RETURNING *"
    )
    .bind(new_cred_id)
    .bind(id)
    .bind(&old_credential.credential_type)
    .bind(&key_hash)
    .bind(&key_prefix)
    .bind(&old_credential.name)
    .bind(expires_at)
    .bind(cred_id)
    .fetch_one(&mut *tx)
    .await?;

    // Commit the transaction
    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {}", e))
    })?;

    crate::middleware::audit::log_user_action(
        &state.db,
        claims.org,
        claims.sub,
        "user",
        "rotate_credential",
        "credential",
        Some(new_cred_id),
        serde_json::json!({
            "agent_id": id,
            "agent_name": agent_name,
            "credential_name": old_credential.name,
            "credential_type": old_credential.credential_type,
            "old_credential_id": cred_id,
            "new_credential_id": new_cred_id,
        }),
    )
    .await;

    // Return the raw key exactly once
    let response = CreateCredentialResponse {
        id: new_credential.id,
        name: new_credential.name,
        credential_type: new_credential.credential_type,
        key: raw_key,
        key_prefix: new_credential.key_prefix,
        expires_at: new_credential.expires_at,
        created_at: new_credential.created_at,
    };

    Ok(response::success(response))
}
