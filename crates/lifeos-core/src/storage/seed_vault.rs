use serde_json::Value;
use sqlx::PgPool;

use super::StorageError;

/// Register the active Seed Vault custody root without accepting seed bytes.
pub async fn register(
    pool: &PgPool,
    seed_digest: &[u8],
    custody_provider: &str,
    derivation_context: Value,
) -> Result<uuid::Uuid, StorageError> {
    Ok(
        sqlx::query_scalar("SELECT lifeos_security.register_seed_vault_root($1, $2, $3)")
            .bind(seed_digest)
            .bind(custody_provider)
            .bind(derivation_context)
            .fetch_one(pool)
            .await?,
    )
}
