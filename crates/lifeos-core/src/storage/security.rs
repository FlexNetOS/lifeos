//! Canonical Secret Engine registration boundary.
//!
//! This module accepts ciphertext only. Secret minting, authorization, relay,
//! rotation, and revocation remain in the database's guarded S16 procedures;
//! callers receive identifiers and never plaintext through this API.

use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::StorageError;

#[derive(Debug, Clone, Serialize)]
pub struct SecretObjectRegistration {
    pub secret_object_id: Uuid,
    pub ciphertext_object_id: Uuid,
}

/// Capture encrypted bytes and register their non-secret scope in the
/// canonical security catalog. The bytes are content-addressed before the
/// catalog row is created, so retries are idempotent and auditable.
pub async fn register_ciphertext(
    pool: &PgPool,
    secret_key: &str,
    target_scope: Value,
    purpose_scope: &[String],
    ciphertext: &[u8],
) -> Result<SecretObjectRegistration, StorageError> {
    if secret_key.trim().is_empty() || ciphertext.is_empty() || purpose_scope.is_empty() {
        return Err(StorageError::InvalidSecretRegistration);
    }
    let mut tx = pool.begin().await?;
    let tenant: Uuid = sqlx::query_scalar("SELECT lifeos_security.current_tenant()")
        .fetch_one(&mut *tx)
        .await?;
    let ciphertext_object_id: Uuid = sqlx::query_scalar(
        "SELECT lifeos_blob.store_bytes(
           $1, $2, 'application/octet-stream', $3, 'secret-ciphertext', NULL)",
    )
    .bind(tenant)
    .bind(ciphertext)
    .bind(serde_json::json!({
        "producer": "lifeos-secret-engine",
        "secret_key": secret_key,
        "representation": "encrypted-ciphertext",
    }))
    .fetch_one(&mut *tx)
    .await?;
    let secret_object_id: Uuid =
        sqlx::query_scalar("SELECT lifeos_security.register_secret_object($1, $2, $3, $4)")
            .bind(secret_key.trim())
            .bind(target_scope)
            .bind(purpose_scope)
            .bind(ciphertext_object_id)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(SecretObjectRegistration {
        secret_object_id,
        ciphertext_object_id,
    })
}
