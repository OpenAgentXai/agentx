use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Channel {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub channel_type: ChannelType,
    pub visibility: ChannelVisibility,
    pub is_active: bool,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "channel_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Direct,
    Group,
    Broadcast,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "channel_visibility", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ChannelVisibility {
    Full,
    Partial,
    AgentsOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ChannelMember {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub agent_id: Uuid,
    pub role: ChannelMemberRole,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "channel_member_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ChannelMemberRole {
    Owner,
    Member,
    ReadOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ChannelMessage {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub sender_agent_id: Uuid,
    pub content: serde_json::Value,
    pub message_type: MessageType,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "message_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MessageType {
    Data,
    Command,
    Status,
    Handoff,
    Error,
}

#[derive(Debug, Deserialize, Validate)]
pub struct SendMessageRequest {
    pub content: serde_json::Value,
    pub message_type: Option<MessageType>,
}

#[derive(Debug, Deserialize)]
pub struct ReceiveMessagesQuery {
    pub since: Option<DateTime<Utc>>,
    pub limit: Option<i32>,
}
