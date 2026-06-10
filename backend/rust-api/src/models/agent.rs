use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Agent {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub agent_type: AgentType,
    pub status: AgentStatus,
    pub owner_id: Uuid,
    pub metadata: serde_json::Value,
    pub tags: Vec<String>,
    pub max_requests_per_minute: i32,
    pub max_requests_per_day: i64,
    pub sandbox_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_active_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "agent_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Autonomous,
    Supervised,
    Collaborative,
    Restricted,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "agent_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Active,
    Suspended,
    Revoked,
    Archived,
    PendingApproval,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateAgentRequest {
    #[validate(length(min = 1, max = 100, message = "Agent name is required"))]
    pub name: String,
    #[validate(length(max = 500))]
    pub description: Option<String>,
    pub agent_type: AgentType,
    pub metadata: Option<serde_json::Value>,
    pub tags: Option<Vec<String>>,
    #[validate(range(min = 1, max = 10000))]
    pub max_requests_per_minute: Option<i32>,
    #[validate(range(min = 1, max = 1000000))]
    pub max_requests_per_day: Option<i64>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateAgentRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    #[validate(length(max = 500))]
    pub description: Option<String>,
    pub agent_type: Option<AgentType>,
    pub metadata: Option<serde_json::Value>,
    pub tags: Option<Vec<String>>,
    pub max_requests_per_minute: Option<i32>,
    pub max_requests_per_day: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AgentListResponse {
    pub agents: Vec<Agent>,
    pub total: i64,
    pub page: i32,
    pub per_page: i32,
}

#[derive(Debug, Deserialize)]
pub struct AgentListQuery {
    pub page: Option<i32>,
    pub per_page: Option<i32>,
    pub status: Option<AgentStatus>,
    pub agent_type: Option<AgentType>,
    pub search: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentMetrics {
    pub agent_id: Uuid,
    pub total_requests_today: i64,
    pub total_requests_week: i64,
    pub avg_response_time_ms: f64,
    pub error_rate: f64,
    pub actions_by_type: serde_json::Value,
    pub hourly_activity: Vec<HourlyActivity>,
}

#[derive(Debug, Serialize)]
pub struct HourlyActivity {
    pub hour: i32,
    pub request_count: i64,
    pub error_count: i64,
}
