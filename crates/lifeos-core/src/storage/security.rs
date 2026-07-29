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

/// Mint a new encrypted secret version. The database checks the active
/// `mint-secret` grant before accepting the version and records the mint event
/// against the generated canonical metadata object.
pub async fn mint_secret(
    pool: &PgPool,
    secret_object_id: Uuid,
    ciphertext_object_id: Uuid,
    wrapping_key_ref: &str,
    algorithm: &str,
    nonce: &[u8],
) -> Result<Uuid, StorageError> {
    if secret_object_id.is_nil()
        || ciphertext_object_id.is_nil()
        || wrapping_key_ref.trim().is_empty()
        || algorithm.trim().is_empty()
        || nonce.is_empty()
    {
        return Err(StorageError::InvalidSecretRegistration);
    }
    let mut tx = pool.begin().await?;
    let tenant: Uuid = sqlx::query_scalar("SELECT lifeos_security.current_tenant()")
        .fetch_one(&mut *tx)
        .await?;
    let mint_object: Uuid =
        sqlx::query_scalar("SELECT lifeos_blob.store_generated_object($1, $2, $3)")
            .bind(tenant)
            .bind(serde_json::json!({
                "secret_object_id": secret_object_id,
                "ciphertext_object_id": ciphertext_object_id,
                "algorithm": algorithm,
                "nonce_length": nonce.len(),
            }))
            .bind(serde_json::json!({"producer": "lifeos-secret-mint"}))
            .fetch_one(&mut *tx)
            .await?;
    let version_id: Uuid =
        sqlx::query_scalar("SELECT lifeos_security.mint_secret($1, $2, $3, $4, $5, $6)")
            .bind(secret_object_id)
            .bind(ciphertext_object_id)
            .bind(wrapping_key_ref)
            .bind(algorithm)
            .bind(nonce)
            .bind(mint_object)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(version_id)
}

/// Ask the database broker to authorize an already-bound secret request.
pub async fn authorize_secret(
    pool: &PgPool,
    identity_id: Uuid,
    task_id: Uuid,
    lease_id: Uuid,
    secret_object_id: Uuid,
    purpose: &str,
) -> Result<Uuid, StorageError> {
    if identity_id.is_nil()
        || task_id.is_nil()
        || lease_id.is_nil()
        || secret_object_id.is_nil()
        || purpose.trim().is_empty()
    {
        return Err(StorageError::InvalidSecretRegistration);
    }
    sqlx::query_scalar("SELECT lifeos_security.authorize_secret($1, $2, $3, $4, $5)")
        .bind(identity_id)
        .bind(task_id)
        .bind(lease_id)
        .bind(secret_object_id)
        .bind(purpose)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

/// Relay a secret version to the authorized target. Only the lease identifier
/// is returned; ciphertext/plaintext never crosses this application API.
pub async fn relay_secret(
    pool: &PgPool,
    secret_version_id: Uuid,
    grant_id: Uuid,
    task_lease_id: Uuid,
    target_identity_id: Uuid,
    purpose: &str,
    relay_nonce: &[u8],
) -> Result<Uuid, StorageError> {
    if secret_version_id.is_nil()
        || grant_id.is_nil()
        || task_lease_id.is_nil()
        || target_identity_id.is_nil()
        || purpose.trim().is_empty()
        || relay_nonce.is_empty()
    {
        return Err(StorageError::InvalidSecretRegistration);
    }
    let mut tx = pool.begin().await?;
    let tenant: Uuid = sqlx::query_scalar("SELECT lifeos_security.current_tenant()")
        .fetch_one(&mut *tx)
        .await?;
    let relay_object: Uuid =
        sqlx::query_scalar("SELECT lifeos_blob.store_generated_object($1, $2, $3)")
            .bind(tenant)
            .bind(serde_json::json!({
                "secret_version_id": secret_version_id,
                "grant_id": grant_id,
                "task_lease_id": task_lease_id,
                "target_identity_id": target_identity_id,
                "purpose": purpose,
                "nonce_length": relay_nonce.len(),
            }))
            .bind(serde_json::json!({"producer": "lifeos-secret-relay"}))
            .fetch_one(&mut *tx)
            .await?;
    let secret_lease_id: Uuid =
        sqlx::query_scalar("SELECT lifeos_security.relay_secret($1, $2, $3, $4, $5, $6, $7)")
            .bind(secret_version_id)
            .bind(grant_id)
            .bind(task_lease_id)
            .bind(target_identity_id)
            .bind(purpose)
            .bind(relay_nonce)
            .bind(relay_object)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(secret_lease_id)
}

/// Rotate a secret through the guarded database procedure.
pub async fn rotate_secret(
    pool: &PgPool,
    secret_object_id: Uuid,
    ciphertext_object_id: Uuid,
    wrapping_key_ref: &str,
    algorithm: &str,
    nonce: &[u8],
) -> Result<Uuid, StorageError> {
    if secret_object_id.is_nil()
        || ciphertext_object_id.is_nil()
        || wrapping_key_ref.trim().is_empty()
        || algorithm.trim().is_empty()
        || nonce.is_empty()
    {
        return Err(StorageError::InvalidSecretRegistration);
    }
    let mut tx = pool.begin().await?;
    let tenant: Uuid = sqlx::query_scalar("SELECT lifeos_security.current_tenant()")
        .fetch_one(&mut *tx)
        .await?;
    let rotation_object: Uuid =
        sqlx::query_scalar("SELECT lifeos_blob.store_generated_object($1, $2, $3)")
            .bind(tenant)
            .bind(serde_json::json!({
                "secret_object_id": secret_object_id,
                "ciphertext_object_id": ciphertext_object_id,
                "algorithm": algorithm,
                "nonce_length": nonce.len(),
            }))
            .bind(serde_json::json!({"producer": "lifeos-secret-rotation"}))
            .fetch_one(&mut *tx)
            .await?;
    let version_id: Uuid =
        sqlx::query_scalar("SELECT lifeos_security.rotate_secret($1, $2, $3, $4, $5, $6)")
            .bind(secret_object_id)
            .bind(ciphertext_object_id)
            .bind(wrapping_key_ref)
            .bind(algorithm)
            .bind(nonce)
            .bind(rotation_object)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(version_id)
}

/// Revoke all grants and relays for a secret object and append the revocation
/// event through the guarded database procedure.
pub async fn revoke_secret(
    pool: &PgPool,
    secret_object_id: Uuid,
    reason: &str,
) -> Result<Uuid, StorageError> {
    if secret_object_id.is_nil() || reason.trim().is_empty() {
        return Err(StorageError::InvalidSecretRegistration);
    }
    let mut tx = pool.begin().await?;
    let tenant: Uuid = sqlx::query_scalar("SELECT lifeos_security.current_tenant()")
        .fetch_one(&mut *tx)
        .await?;
    let revocation_object: Uuid =
        sqlx::query_scalar("SELECT lifeos_blob.store_generated_object($1, $2, $3)")
            .bind(tenant)
            .bind(serde_json::json!({
                "secret_object_id": secret_object_id,
                "reason": reason,
            }))
            .bind(serde_json::json!({"producer": "lifeos-secret-revocation"}))
            .fetch_one(&mut *tx)
            .await?;
    let revocation_id: Uuid =
        sqlx::query_scalar("SELECT lifeos_security.revoke_secret($1, $2, $3)")
            .bind(secret_object_id)
            .bind(reason)
            .bind(revocation_object)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(revocation_id)
}
