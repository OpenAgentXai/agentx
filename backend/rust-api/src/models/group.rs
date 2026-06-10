use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgentGroup {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgentGroupMembership {
    pub id: Uuid,
    pub group_id: Uuid,
    pub agent_id: Uuid,
    pub added_at: DateTime<Utc>,
    pub added_by: Uuid,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateGroupRequest {
    #[validate(length(min = 1, max = 100, message = "Group name is required"))]
    pub name: String,
    #[validate(length(max = 500))]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateGroupRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    #[validate(length(max = 500))]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AssignAgentRequest {
    pub agent_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct GroupWithMembers {
    #[serde(flatten)]
    pub group: AgentGroup,
    pub member_count: i64,
    pub members: Vec<GroupMemberInfo>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct GroupMemberInfo {
    pub agent_id: Uuid,
    pub agent_name: String,
    pub agent_status: String,
    pub added_at: DateTime<Utc>,
}
