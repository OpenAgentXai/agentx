use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub actor_type: ActorType,
    pub actor_id: Uuid,
    pub actor_name: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<Uuid>,
    pub details: serde_json::Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub status: ActionStatus,
    pub error_message: Option<String>,
    pub duration_ms: Option<i32>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "actor_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ActorType {
    User,
    Agent,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "action_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ActionStatus {
    Success,
    Failure,
    Denied,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    pub page: Option<i32>,
    pub per_page: Option<i32>,
    pub actor_type: Option<ActorType>,
    pub actor_id: Option<Uuid>,
    pub action: Option<String>,
    pub resource_type: Option<String>,
    pub status: Option<ActionStatus>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub search: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuditLogListResponse {
    pub logs: Vec<AuditLog>,
    pub total: i64,
    pub page: i32,
    pub per_page: i32,
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub format: Option<ExportFormat>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub actor_type: Option<ActorType>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Json,
    Csv,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AlertRule {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub condition_type: AlertConditionType,
    pub condition_config: serde_json::Value,
    pub severity: AlertSeverity,
    pub is_active: bool,
    pub notify_channels: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "alert_condition_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum AlertConditionType {
    HighErrorRate,
    UnusualActivity,
    PermissionDenied,
    RateLimitExceeded,
    NewAgentCreated,
    CredentialRotation,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "alert_severity", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Alert {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub rule_id: Uuid,
    pub severity: AlertSeverity,
    pub title: String,
    pub message: String,
    pub details: serde_json::Value,
    pub is_resolved: bool,
    pub resolved_by: Option<Uuid>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAlertRuleRequest {
    pub name: String,
    pub description: Option<String>,
    pub condition_type: AlertConditionType,
    pub condition_config: serde_json::Value,
    pub severity: AlertSeverity,
    pub notify_channels: Option<serde_json::Value>,
}
