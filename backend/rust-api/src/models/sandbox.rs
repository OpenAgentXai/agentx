use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Sandbox {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub agent_id: Option<Uuid>,
    pub mode: SandboxMode,
    pub status: SandboxStatus,
    pub resource_limits: serde_json::Value,
    pub allowed_data_scopes: serde_json::Value,
    pub network_policy: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "sandbox_mode", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum SandboxMode {
    Production,
    DryRun,
    Testing,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "sandbox_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum SandboxStatus {
    Active,
    Paused,
    Terminated,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SandboxSnapshot {
    pub id: Uuid,
    pub sandbox_id: Uuid,
    pub name: String,
    pub state_data: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateSandboxRequest {
    #[validate(length(min = 1, max = 100, message = "Sandbox name is required"))]
    pub name: String,
    #[validate(length(max = 500))]
    pub description: Option<String>,
    pub agent_id: Option<Uuid>,
    pub mode: Option<SandboxMode>,
    pub resource_limits: Option<ResourceLimits>,
    pub allowed_data_scopes: Option<Vec<String>>,
    pub network_policy: Option<NetworkPolicy>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResourceLimits {
    pub max_requests_per_minute: i32,
    pub max_memory_mb: i32,
    pub max_cpu_percent: f32,
    pub max_storage_mb: i64,
    pub max_concurrent_operations: i32,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_requests_per_minute: 60,
            max_memory_mb: 256,
            max_cpu_percent: 25.0,
            max_storage_mb: 1024,
            max_concurrent_operations: 5,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkPolicy {
    pub allow_outbound: bool,
    pub allowed_hosts: Vec<String>,
    pub blocked_hosts: Vec<String>,
    pub max_bandwidth_kbps: i32,
}

impl Default for NetworkPolicy {
    fn default() -> Self {
        Self {
            allow_outbound: false,
            allowed_hosts: vec![],
            blocked_hosts: vec![],
            max_bandwidth_kbps: 1024,
        }
    }
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateSandboxRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub mode: Option<SandboxMode>,
    pub resource_limits: Option<ResourceLimits>,
    pub allowed_data_scopes: Option<Vec<String>>,
    pub network_policy: Option<NetworkPolicy>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateSnapshotRequest {
    #[validate(length(min = 1, max = 100, message = "Snapshot name is required"))]
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct SandboxMetrics {
    pub sandbox_id: Uuid,
    pub current_memory_mb: f64,
    pub current_cpu_percent: f32,
    pub current_storage_mb: f64,
    pub requests_last_minute: i32,
    pub active_operations: i32,
    pub uptime_seconds: i64,
    pub total_requests: i64,
    pub total_errors: i64,
}
