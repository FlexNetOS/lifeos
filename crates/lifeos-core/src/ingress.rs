//! Typed CodeDB ingress envelope validation.
//!
//! The shell accepts a complete raw-byte payload plus its typed projection,
//! validates the database-bound lineage fields, and hands the envelope to the
//! redb owner. Durable PostgreSQL materialization remains envctl-owned.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

pub const CODEDB_INGEST_SCHEMA: &str = "codedb.ingest-envelope.v1";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeDbIngestEnvelope {
    pub schema_version: String,
    pub idempotency_key: String,
    pub raw_bytes: Vec<u8>,
    pub typed_payload: Value,
    pub context: IngestContext,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestContext {
    pub tenant_id: String,
    pub identity_id: String,
    pub session_id: String,
    pub branch_id: String,
    pub source_sequence: u64,
    pub redb_transaction_id: String,
    pub witness_chain_id: String,
    pub signature: String,
    #[serde(default)]
    pub envctl_execution_id: Option<String>,
    #[serde(default)]
    pub verification_object_id: Option<String>,
    #[serde(default)]
    pub authorization: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IngressError(pub String);

impl std::fmt::Display for IngressError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for IngressError {}

impl CodeDbIngestEnvelope {
    pub fn validate(&self) -> Result<(), IngressError> {
        if self.schema_version != CODEDB_INGEST_SCHEMA {
            return Err(IngressError(format!(
                "unsupported CodeDB envelope schema: {}",
                self.schema_version
            )));
        }
        if self.idempotency_key.is_empty() || self.idempotency_key.len() > 256 {
            return Err(IngressError(
                "idempotency_key must contain 1..=256 bytes".into(),
            ));
        }
        if !self.typed_payload.is_object() && !self.typed_payload.is_array() {
            return Err(IngressError(
                "typed_payload must be a record, list, or table JSON value".into(),
            ));
        }

        for (field, value) in [
            ("tenant_id", &self.context.tenant_id),
            ("identity_id", &self.context.identity_id),
            ("session_id", &self.context.session_id),
            ("branch_id", &self.context.branch_id),
            ("witness_chain_id", &self.context.witness_chain_id),
        ] {
            Uuid::parse_str(value)
                .map_err(|error| IngressError(format!("context.{field}: {error}")))?;
        }
        if self.context.source_sequence == 0 {
            return Err(IngressError(
                "context.source_sequence must be greater than zero".into(),
            ));
        }
        for (field, value) in [
            ("redb_transaction_id", &self.context.redb_transaction_id),
            ("signature", &self.context.signature),
        ] {
            validate_hex(field, value)?;
        }
        if !self.context.authorization.is_object() && !self.context.authorization.is_null() {
            return Err(IngressError(
                "context.authorization must be a JSON object".into(),
            ));
        }
        Ok(())
    }

    /// Render the context with the snake_case keys consumed by the canonical
    /// `lifeos_runtime.ingest_event` procedure.
    pub fn database_context(&self) -> Value {
        json!({
            "tenant_id": self.context.tenant_id,
            "identity_id": self.context.identity_id,
            "session_id": self.context.session_id,
            "branch_id": self.context.branch_id,
            "source_sequence": self.context.source_sequence,
            "redb_transaction_id": self.context.redb_transaction_id,
            "witness_chain_id": self.context.witness_chain_id,
            "signature": self.context.signature,
            "envctl_execution_id": self.context.envctl_execution_id,
            "verification_object_id": self.context.verification_object_id,
            "authorization": self.context.authorization,
            "idempotency_key": self.idempotency_key,
        })
    }
}

fn validate_hex(field: &str, value: &str) -> Result<(), IngressError> {
    if value.is_empty()
        || value.len() % 2 != 0
        || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(IngressError(format!(
            "context.{field} must be a non-empty even-length hexadecimal string"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope() -> CodeDbIngestEnvelope {
        CodeDbIngestEnvelope {
            schema_version: CODEDB_INGEST_SCHEMA.into(),
            idempotency_key: "redb:7:abc".into(),
            raw_bytes: vec![0, 255, 10],
            typed_payload: json!([{"path": "README.md", "kind": "file"}]),
            context: IngestContext {
                tenant_id: "00000000-0000-4000-8000-000000000001".into(),
                identity_id: "00000000-0000-4000-8000-000000000002".into(),
                session_id: "00000000-0000-4000-8000-000000000003".into(),
                branch_id: "00000000-0000-4000-8000-000000000004".into(),
                source_sequence: 7,
                redb_transaction_id: "aabb".into(),
                witness_chain_id: "00000000-0000-4000-8000-000000000005".into(),
                signature: "deadbeef".into(),
                envctl_execution_id: None,
                verification_object_id: None,
                authorization: json!({"action": "ingest"}),
            },
        }
    }

    #[test]
    fn validates_record_list_and_preserves_raw_bytes() {
        let value = envelope();
        value.validate().unwrap();
        assert_eq!(value.raw_bytes, vec![0, 255, 10]);
        assert_eq!(value.database_context()["source_sequence"], 7);
    }

    #[test]
    fn rejects_wrong_schema_and_malformed_lineage() {
        let mut value = envelope();
        value.schema_version = "codedb.ingest-envelope.v0".into();
        assert!(value.validate().is_err());

        let mut value = envelope();
        value.context.signature = "not-hex".into();
        assert!(value.validate().is_err());
    }
}
