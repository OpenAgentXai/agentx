use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::models::user::*;
use crate::utils::{crypto, errors::AppError, response};
use crate::AppState;

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    // Check if email already exists
    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_one(&state.db)
        .await?;

    if existing > 0 {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let password_hash = crypto::hash_password(&req.password)?;
    let user_id = Uuid::new_v4();
    let org_id = Uuid::new_v4();

    // Create organization
    sqlx::query(
        "INSERT INTO organizations (id, name, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())"
    )
    .bind(org_id)
    .bind(&req.organization_name)
    .execute(&state.db)
    .await?;

    // Create user
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (id, organization_id, email, password_hash, name, role, totp_enabled, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'owner', false, true, NOW(), NOW())
         RETURNING *"
    )
    .bind(user_id)
    .bind(org_id)
    .bind(&req.email)
    .bind(&password_hash)
    .bind(&req.name)
    .fetch_one(&state.db)
    .await?;

    let (access_token, refresh_token) = generate_tokens(&state, &user)?;

    crate::middleware::audit::log_user_action(
        &state.db, org_id, user_id, &user.name,
        "register", "user", Some(user_id),
        serde_json::json!({"email": req.email}),
    ).await;

    Ok(response::success(AuthResponse {
        access_token,
        refresh_token,
        user: UserPublic::from(user),
        requires_2fa: false,
    }))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1 AND is_active = true"
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid email or password".into()))?;

    let valid = crypto::verify_password(&req.password, &user.password_hash)?;
    if !valid {
        return Err(AppError::Unauthorized("Invalid email or password".into()));
    }

    // Check 2FA
    if user.totp_enabled {
        if let Some(code) = &req.totp_code {
            // Verify TOTP code
            if let Some(secret) = &user.totp_secret {
                let totp = totp_rs::TOTP::new(
                    totp_rs::Algorithm::SHA1,
                    6,
                    1,
                    30,
                    secret.as_bytes().to_vec(),
                    Some("AgentX".to_string()),
                    user.email.clone(),
                ).map_err(|e| AppError::Internal(format!("TOTP error: {}", e)))?;

                if !totp.check_current(code).unwrap_or(false) {
                    return Err(AppError::Unauthorized("Invalid 2FA code".into()));
                }
            }
        } else {
            // Return temp token requiring 2FA
            let temp_token = generate_2fa_pending_token(&state, &user)?;
            return Ok(response::success(AuthResponse {
                access_token: temp_token,
                refresh_token: String::new(),
                user: UserPublic::from(user),
                requires_2fa: true,
            }));
        }
    }

    let (access_token, refresh_token) = generate_tokens(&state, &user)?;

    crate::middleware::audit::log_user_action(
        &state.db, user.organization_id, user.id, &user.name,
        "login", "user", Some(user.id),
        serde_json::json!({}),
    ).await;

    Ok(response::success(AuthResponse {
        access_token,
        refresh_token,
        user: UserPublic::from(user),
        requires_2fa: false,
    }))
}

pub async fn logout(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    if let Some(auth) = headers.get("Authorization").and_then(|h| h.to_str().ok()) {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            // Blacklist the token in Redis (TTL = token remaining lifetime)
            let _: () = redis::cmd("SET")
                .arg(format!("blacklist:{}", token))
                .arg("1")
                .arg("EX")
                .arg(3600) // 1 hour (access token lifetime)
                .query_async(&mut state.redis.clone())
                .await
                .unwrap_or(());
        }
    }
    Ok(response::message("Logged out successfully"))
}

pub async fn refresh_token(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let claims = jsonwebtoken::decode::<Claims>(
        &req.refresh_token,
        &jsonwebtoken::DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &jsonwebtoken::Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized("Invalid refresh token".into()))?
    .claims;

    if claims.token_type != TokenType::Refresh {
        return Err(AppError::Unauthorized("Not a refresh token".into()));
    }

    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE id = $1 AND is_active = true"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

    let (access_token, refresh_token) = generate_tokens(&state, &user)?;

    Ok(response::success(serde_json::json!({
        "access_token": access_token,
        "refresh_token": refresh_token,
    })))
}

pub async fn forgot_password(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ForgotPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Always return success to prevent email enumeration
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1"
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?;

    if let Some(user) = user {
        let token = crypto::generate_token(32);
        let _: () = redis::cmd("SET")
            .arg(format!("reset:{}", token))
            .arg(user.id.to_string())
            .arg("EX")
            .arg(3600) // 1 hour expiry
            .query_async(&mut state.redis.clone())
            .await?;

        // In production: send email with reset link
        tracing::info!(
            user_id = %user.id,
            "Password reset token generated: {}",
            token
        );
    }

    Ok(response::message("If the email exists, a reset link has been sent"))
}

pub async fn reset_password(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    req.validate()?;

    let user_id_str: String = redis::cmd("GET")
        .arg(format!("reset:{}", req.token))
        .query_async(&mut state.redis.clone())
        .await
        .map_err(|_| AppError::BadRequest("Invalid or expired reset token".into()))?;

    let user_id: Uuid = user_id_str
        .parse()
        .map_err(|_| AppError::Internal("Invalid stored user ID".into()))?;

    let password_hash = crypto::hash_password(&req.new_password)?;

    sqlx::query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2")
        .bind(&password_hash)
        .bind(user_id)
        .execute(&state.db)
        .await?;

    // Invalidate the reset token
    let _: () = redis::cmd("DEL")
        .arg(format!("reset:{}", req.token))
        .query_async(&mut state.redis.clone())
        .await?;

    Ok(response::message("Password reset successfully"))
}

pub async fn setup_2fa(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    let secret = totp_rs::Secret::generate_secret();
    let totp = totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_bytes().unwrap(),
        Some("AgentX".to_string()),
        user.email.clone(),
    ).map_err(|e| AppError::Internal(format!("TOTP error: {}", e)))?;

    let secret_base32 = secret.to_encoded().to_string();
    let otpauth_url = totp.get_url();

    // Store secret temporarily in Redis until verification
    let _: () = redis::cmd("SET")
        .arg(format!("2fa_setup:{}", user.id))
        .arg(&secret_base32)
        .arg("EX")
        .arg(600) // 10 minutes
        .query_async(&mut state.redis.clone())
        .await?;

    Ok(response::success(Setup2FAResponse {
        secret: secret_base32,
        otpauth_url,
        qr_code_base64: String::new(), // QR generation handled by frontend
    }))
}

pub async fn verify_2fa(
    State(state): State<Arc<AppState>>,
    Json(req): Json<Verify2FARequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Case 1: Verifying 2FA during login (temp_token provided)
    let claims = jsonwebtoken::decode::<Claims>(
        &req.temp_token,
        &jsonwebtoken::DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &jsonwebtoken::Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized("Invalid token".into()))?
    .claims;

    if claims.token_type == TokenType::TwoFactorPending {
        // Verify the TOTP code during login
        let user = sqlx::query_as::<_, User>(
            "SELECT * FROM users WHERE id = $1"
        )
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;

        if let Some(secret) = &user.totp_secret {
            let totp = totp_rs::TOTP::new(
                totp_rs::Algorithm::SHA1,
                6,
                1,
                30,
                secret.as_bytes().to_vec(),
                Some("AgentX".to_string()),
                user.email.clone(),
            ).map_err(|e| AppError::Internal(format!("TOTP error: {}", e)))?;

            if !totp.check_current(&req.code).unwrap_or(false) {
                return Err(AppError::Unauthorized("Invalid 2FA code".into()));
            }
        }

        let (access_token, refresh_token) = generate_tokens(&state, &user)?;
        return Ok(response::success(AuthResponse {
            access_token,
            refresh_token,
            user: UserPublic::from(user),
            requires_2fa: false,
        }));
    }

    // Case 2: Setting up 2FA (access token provided)
    let secret: String = redis::cmd("GET")
        .arg(format!("2fa_setup:{}", claims.sub))
        .query_async(&mut state.redis.clone())
        .await
        .map_err(|_| AppError::BadRequest("No 2FA setup in progress".into()))?;

    let totp = totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        6,
        1,
        30,
        secret.as_bytes().to_vec(),
        Some("AgentX".to_string()),
        claims.sub.to_string(),
    ).map_err(|e| AppError::Internal(format!("TOTP error: {}", e)))?;

    if !totp.check_current(&req.code).unwrap_or(false) {
        return Err(AppError::Unauthorized("Invalid 2FA code".into()));
    }

    // Save secret and enable 2FA
    sqlx::query(
        "UPDATE users SET totp_secret = $1, totp_enabled = true, updated_at = NOW() WHERE id = $2"
    )
    .bind(&secret)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    // Clean up Redis
    let _: () = redis::cmd("DEL")
        .arg(format!("2fa_setup:{}", claims.sub))
        .query_async(&mut state.redis.clone())
        .await?;

    Ok(response::message("2FA enabled successfully"))
}

// Helper functions

fn generate_tokens(state: &AppState, user: &User) -> Result<(String, String), AppError> {
    let now = Utc::now();

    let access_claims = Claims {
        sub: user.id,
        org: user.organization_id,
        role: user.role.clone(),
        exp: (now + Duration::hours(1)).timestamp(),
        iat: now.timestamp(),
        token_type: TokenType::Access,
    };

    let refresh_claims = Claims {
        sub: user.id,
        org: user.organization_id,
        role: user.role.clone(),
        exp: (now + Duration::days(30)).timestamp(),
        iat: now.timestamp(),
        token_type: TokenType::Refresh,
    };

    let access_token = encode(
        &Header::default(),
        &access_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )?;

    let refresh_token = encode(
        &Header::default(),
        &refresh_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )?;

    Ok((access_token, refresh_token))
}

fn generate_2fa_pending_token(state: &AppState, user: &User) -> Result<String, AppError> {
    let now = Utc::now();
    let claims = Claims {
        sub: user.id,
        org: user.organization_id,
        role: user.role.clone(),
        exp: (now + Duration::minutes(5)).timestamp(),
        iat: now.timestamp(),
        token_type: TokenType::TwoFactorPending,
    };

    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )?)
}
