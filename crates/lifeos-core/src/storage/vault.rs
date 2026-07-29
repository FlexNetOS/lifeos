use sqlx::PgPool;

use crate::types::VaultEntry;

use super::StorageError;

/// List vault metadata without selecting ciphertext or any secret payload.
pub async fn list(pool: &PgPool) -> Result<Vec<VaultEntry>, StorageError> {
    let rows: Vec<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, label, kind, masked_preview, last_rotated
         FROM lifeos_security.list_vault_entries()",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(id, label, kind, masked_preview, last_rotated)| VaultEntry {
                id,
                label,
                kind,
                masked_preview,
                last_rotated,
            },
        )
        .collect())
}
