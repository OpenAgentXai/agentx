use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Policy {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub effect: PolicyEffect,
    pub resources: serde_json::Value,   // ["resource:read", "data:users:*"]
    pub actions: serde_json::Value,     // ["read", "write", "execute"]
    pub conditions: serde_json::Value,  // {"ip_range": "10.0.0.0/8", "time_window": "09:00-17:00"}
    pub priority: i32,
    pub is_active: bool,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "policy_effect", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PolicyEffect {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PolicyAssignment {
    pub id: Uuid,
    pub policy_id: Uuid,
    pub target_type: AssignmentTarget,
    pub target_id: Uuid,
    pub assigned_by: Uuid,
    pub assigned_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "assignment_target", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AssignmentTarget {
    Agent,
    Group,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreatePolicyRequest {
    #[validate(length(min = 1, max = 100, message = "Policy name is required"))]
    pub name: String,
    #[validate(length(max = 500))]
    pub description: Option<String>,
    pub effect: PolicyEffect,
    pub resources: Vec<String>,
    pub actions: Vec<String>,
    pub conditions: Option<serde_json::Value>,
    #[validate(range(min = 0, max = 1000))]
    pub priority: Option<i32>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdatePolicyRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub effect: Option<PolicyEffect>,
    pub resources: Option<Vec<String>>,
    pub actions: Option<Vec<String>>,
    pub conditions: Option<serde_json::Value>,
    pub priority: Option<i32>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct AssignPolicyRequest {
    pub target_type: AssignmentTarget,
    pub target_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct SimulatePolicyRequest {
    pub agent_id: Uuid,
    pub resource: String,
    pub action: String,
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct SimulatePolicyResponse {
    pub allowed: bool,
    pub matching_policies: Vec<PolicyMatch>,
    pub effective_effect: PolicyEffect,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct PolicyMatch {
    pub policy_id: Uuid,
    pub policy_name: String,
    pub effect: PolicyEffect,
    pub priority: i32,
    pub matched_resource: String,
    pub matched_action: String,
}
