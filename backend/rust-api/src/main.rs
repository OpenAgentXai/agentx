use axum::{
    extract::State,
    http::{HeaderValue, Method},
    routing::{get, post, put, delete},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod models;
mod routes;
mod middleware;
mod utils;

pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub jwt_secret: String,
    pub encryption_key: Vec<u8>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "agentx_api=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://agentx:agentx@localhost:5432/agentx".into());

    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://localhost:6379".into());

    const DEV_JWT_SECRET: &str = "agentx-dev-secret-change-in-production";
    const DEV_ENCRYPTION_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| DEV_JWT_SECRET.into());

    let encryption_key_hex = std::env::var("ENCRYPTION_KEY")
        .unwrap_or_else(|_| DEV_ENCRYPTION_KEY.into());

    // Release builds must never run with the dev fallback secrets
    if !cfg!(debug_assertions)
        && (jwt_secret == DEV_JWT_SECRET || encryption_key_hex == DEV_ENCRYPTION_KEY)
    {
        anyhow::bail!("JWT_SECRET and ENCRYPTION_KEY must be set in production");
    }

    let encryption_key = hex::decode(&encryption_key_hex)
        .unwrap_or_else(|_| encryption_key_hex.as_bytes().to_vec());

    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await?;

    sqlx::migrate!("../../database/migrations")
        .run(&db)
        .await?;

    let redis_client = redis::Client::open(redis_url)?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client).await?;

    let state = Arc::new(AppState {
        db,
        redis: redis_conn,
        jwt_secret,
        encryption_key,
    });

    let cors_origin = std::env::var("CORS_ORIGIN")
        .unwrap_or_else(|_| "http://localhost:3000".into());

    let cors = CorsLayer::new()
        .allow_origin(
            cors_origin
                .parse::<HeaderValue>()
                .expect("CORS_ORIGIN must be a valid origin URL"),
        )
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ])
        .allow_credentials(true);

    // Public routes — no JWT required
    let public_api = Router::new()
        .route("/auth/register", post(routes::auth::register))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/logout", post(routes::auth::logout))
        .route("/auth/refresh", post(routes::auth::refresh_token))
        .route("/auth/forgot-password", post(routes::auth::forgot_password))
        .route("/auth/reset-password", post(routes::auth::reset_password))
        .route("/auth/verify-2fa", post(routes::auth::verify_2fa))
        // WebSocket: browsers cannot send Authorization headers on upgrade
        .route("/dashboard/live", get(routes::dashboard::live_feed));

    // Protected routes — require_auth injects Claims
    let protected_api = Router::new()
        .route("/auth/setup-2fa", post(routes::auth::setup_2fa))
        // Agents
        .route("/agents", get(routes::agents::list_agents).post(routes::agents::create_agent))
        .route("/agents/:id", get(routes::agents::get_agent).put(routes::agents::update_agent).delete(routes::agents::delete_agent))
        .route("/agents/:id/suspend", post(routes::agents::suspend_agent))
        .route("/agents/:id/activate", post(routes::agents::activate_agent))
        .route("/agents/:id/revoke", post(routes::agents::revoke_agent))
        .route("/agents/:id/activity", get(routes::agents::get_agent_activity))
        .route("/agents/:id/metrics", get(routes::agents::get_agent_metrics))
        // Credentials
        .route("/agents/:id/credentials", get(routes::credentials::list_credentials).post(routes::credentials::create_credential))
        .route("/agents/:id/credentials/:cred_id", delete(routes::credentials::revoke_credential))
        .route("/agents/:id/credentials/:cred_id/rotate", post(routes::credentials::rotate_credential))
        // Groups
        .route("/groups", get(routes::groups::list_groups).post(routes::groups::create_group))
        .route("/groups/:id", get(routes::groups::get_group).put(routes::groups::update_group).delete(routes::groups::delete_group))
        .route("/groups/:id/agents", post(routes::groups::assign_agent))
        .route("/groups/:id/agents/:agent_id", delete(routes::groups::remove_agent))
        // Policies
        .route("/policies", get(routes::policies::list_policies).post(routes::policies::create_policy))
        .route("/policies/:id", get(routes::policies::get_policy).put(routes::policies::update_policy).delete(routes::policies::delete_policy))
        .route("/policies/simulate", post(routes::policies::simulate_policy))
        .route("/policies/:id/assign", post(routes::policies::assign_policy))
        .route("/policies/:id/assign/:target_id", delete(routes::policies::unassign_policy))
        // Sandboxes
        .route("/sandboxes", get(routes::sandboxes::list_sandboxes).post(routes::sandboxes::create_sandbox))
        .route("/sandboxes/:id", get(routes::sandboxes::get_sandbox).put(routes::sandboxes::update_sandbox).delete(routes::sandboxes::delete_sandbox))
        .route("/sandboxes/:id/snapshot", post(routes::sandboxes::create_snapshot))
        .route("/sandboxes/:id/restore/:snapshot_id", post(routes::sandboxes::restore_snapshot))
        .route("/sandboxes/:id/metrics", get(routes::sandboxes::get_sandbox_metrics))
        // Audit
        .route("/audit/logs", get(routes::audit::list_logs))
        .route("/audit/logs/:id", get(routes::audit::get_log))
        .route("/audit/export", get(routes::audit::export_logs))
        .route("/audit/alerts", get(routes::audit::list_alerts))
        .route("/audit/alerts/rules", post(routes::audit::create_alert_rule))
        // Dashboard
        .route("/dashboard/overview", get(routes::dashboard::overview))
        .route("/dashboard/metrics", get(routes::dashboard::metrics))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::require_auth,
        ));

    let platform_api = public_api.merge(protected_api);

    let agent_api = Router::new()
        .route("/authenticate", post(routes::agent_api::authenticate))
        .route("/permissions", get(routes::agent_api::check_permissions))
        .route("/action", post(routes::agent_api::declare_action))
        .route("/channel/:id/send", post(routes::agent_api::send_message))
        .route("/channel/:id/receive", get(routes::agent_api::receive_messages))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::require_agent_auth,
        ));

    let app = Router::new()
        .nest("/api/v1", platform_api)
        .nest("/agent/v1", agent_api)
        .route("/health", get(routes::health::health_check))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024)) // 10MB
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ))
        .with_state(state);

    let addr = std::env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("AgentX API listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
