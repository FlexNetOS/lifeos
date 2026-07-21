use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::path::Path;

use super::StorageError;

/// Read a durable JSON projection. Missing projections intentionally return an
/// empty object so first-run frontend behavior stays stable.
pub async fn read(pool: &PgPool, key: &str) -> Result<String, StorageError> {
    let payload = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT payload_json FROM lifeos_runtime.projection WHERE projection_key = $1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await?;
    Ok(payload.unwrap_or_else(|| serde_json::json!({})).to_string())
}

/// Atomically write a durable JSON projection and advance its generation.
pub async fn write(pool: &PgPool, key: &str, payload: &str) -> Result<(), StorageError> {
    let value: serde_json::Value =
        serde_json::from_str(payload).map_err(|_| StorageError::InvalidProjectionJson)?;
    sqlx::query(
        "INSERT INTO lifeos_runtime.projection (projection_key, payload_json, generation, updated_at)
         VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (projection_key) DO UPDATE SET
           payload_json = EXCLUDED.payload_json,
           generation = lifeos_runtime.projection.generation + 1,
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

/// Outcome of a one-time app-data JSON projection import.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LegacyProjectionOutcome {
    /// The legacy source file was not present.
    NoSource,
    /// The legacy source was archived into PostgreSQL and supplied the initial
    /// canonical projection value.
    Migrated,
    /// PostgreSQL already had a newer canonical value; the source was archived
    /// and retired without overwriting that value.
    CanonicalValueRetained,
}

/// Migrate a legacy app-data JSON file into the canonical projection table.
/// The exact source bytes are retained in `lifeos_blob.object` before the file
/// is removed. A pre-existing PostgreSQL projection wins deterministically;
/// the old value remains recoverable from the captured raw object.
pub async fn migrate_from_json_file(
    pool: &PgPool,
    app_data_dir: &Path,
    file_name: &str,
    projection_key: &str,
) -> Result<LegacyProjectionOutcome, StorageError> {
    let path = app_data_dir.join(file_name);
    if !path.is_file() {
        return Ok(LegacyProjectionOutcome::NoSource);
    }

    let bytes = std::fs::read(&path)?;
    let payload = std::str::from_utf8(&bytes).map_err(|_| StorageError::InvalidProjectionJson)?;
    let value: serde_json::Value =
        serde_json::from_str(payload).map_err(|_| StorageError::InvalidProjectionJson)?;
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    let source_kind = format!("legacy-projection-json:{file_name}");

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO lifeos_blob.object (sha256, byte_length, raw_bytes, source_kind)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (sha256) DO NOTHING",
    )
    .bind(sha256)
    .bind(bytes.len() as i64)
    .bind(&bytes)
    .bind(source_kind)
    .execute(&mut *tx)
    .await?;
    let result = sqlx::query(
        "INSERT INTO lifeos_runtime.projection
           (projection_key, payload_json, generation, updated_at)
         VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (projection_key) DO NOTHING",
    )
    .bind(projection_key)
    .bind(value)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    std::fs::remove_file(path)?;

    if result.rows_affected() == 1 {
        Ok(LegacyProjectionOutcome::Migrated)
    } else {
        Ok(LegacyProjectionOutcome::CanonicalValueRetained)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use serial_test::serial;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn projection_roundtrip_and_validation() {
        let storage = Storage::new_for_test().await.unwrap();
        assert_eq!(read(storage.pool(), "ui-state").await.unwrap(), "{}");
        write(storage.pool(), "ui-state", r#"{"activeId":"home"}"#)
            .await
            .unwrap();
        assert_eq!(
            read(storage.pool(), "ui-state").await.unwrap(),
            r#"{"activeId":"home"}"#
        );
        assert!(matches!(
            write(storage.pool(), "ui-state", "not-json").await,
            Err(StorageError::InvalidProjectionJson)
        ));
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn legacy_json_import_archives_and_does_not_overwrite_canonical_state() {
        let storage = Storage::new_for_test().await.unwrap();
        let dir = tempdir().unwrap();
        let ui_path = dir.path().join("ui-state.json");
        fs::write(&ui_path, r#"{"activeId":"home"}"#).unwrap();
        assert_eq!(
            migrate_from_json_file(storage.pool(), dir.path(), "ui-state.json", "ui-state")
                .await
                .unwrap(),
            LegacyProjectionOutcome::Migrated
        );
        assert!(!ui_path.exists());
        assert_eq!(
            read(storage.pool(), "ui-state").await.unwrap(),
            r#"{"activeId":"home"}"#
        );

        write(storage.pool(), "ui-state", r#"{"activeId":"canonical"}"#)
            .await
            .unwrap();
        fs::write(&ui_path, r#"{"activeId":"legacy"}"#).unwrap();
        assert_eq!(
            migrate_from_json_file(storage.pool(), dir.path(), "ui-state.json", "ui-state")
                .await
                .unwrap(),
            LegacyProjectionOutcome::CanonicalValueRetained
        );
        assert_eq!(
            read(storage.pool(), "ui-state").await.unwrap(),
            r#"{"activeId":"canonical"}"#
        );
        let archived: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM lifeos_blob.object
             WHERE source_kind = 'legacy-projection-json:ui-state.json'",
        )
        .fetch_one(storage.pool())
        .await
        .unwrap();
        assert_eq!(archived, 2);
    }
}
