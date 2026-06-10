use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgentCredential {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub credential_type: CredentialType,
    pub key_hash: String,
    pub key_prefix: String,
    pub name: String,
    pub is_active: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub rotated_from: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "credential_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum CredentialType {
    ApiKey,
    Jwt,
    Certificate,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateCredentialRequest {
    #[validate(length(min = 1, max = 100, message = "Credential name is required"))]
    pub name: String,
    pub credential_type: CredentialType,
    pub expires_in_days: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct CreateCredentialResponse {
    pub id: Uuid,
    pub name: String,
    pub credential_type: CredentialType,
    pub key: String, // Only returned once at creation
    pub key_prefix: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct CredentialPublic {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub credential_type: CredentialType,
    pub key_prefix: String,
    pub name: String,
    pub is_active: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl From<AgentCredential> for CredentialPublic {
    fn from(c: AgentCredential) -> Self {
        Self {
            id: c.id,
            agent_id: c.agent_id,
            credential_type: c.credential_type,
            key_prefix: c.key_prefix,
            name: c.name,
            is_active: c.is_active,
            expires_at: c.expires_at,
            last_used_at: c.last_used_at,
            created_at: c.created_at,
        }
    }
}
