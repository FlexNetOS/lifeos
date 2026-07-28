use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::path::Path;
use uuid::Uuid;

use super::StorageError;

/// A row from the canonical `lifeos_security.identity` table.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AccountRow {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub password_hash: String,
    /// Unix timestamp seconds, projected from the canonical timestamptz.
    pub created_at: i64,
    /// Unix timestamp seconds, projected from the canonical timestamptz.
    pub updated_at: i64,
}

const ACCOUNT_COLUMNS: &str = "identity_id AS id, subject_key AS email,
    attributes->>'display_name' AS display_name,
    attributes->>'password_hash' AS password_hash,
    coalesce((attributes->>'created_at')::BIGINT,
             EXTRACT(EPOCH FROM active_from)::BIGINT) AS created_at,
    coalesce((attributes->>'created_at')::BIGINT,
             EXTRACT(EPOCH FROM coalesce(active_until, active_from))::BIGINT) AS updated_at";

/// Insert a new account and return the inserted row.
pub async fn insert(
    pool: &PgPool,
    email: &str,
    display_name: &str,
    password_hash: &str,
) -> Result<AccountRow, StorageError> {
    let raw = serde_json::json!({
        "email": email,
        "display_name": display_name,
        "password_hash": password_hash,
        "created_at": chrono::Utc::now().timestamp(),
    });
    let identity_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT lifeos_security.register_identity(
           'human', $1, $2, convert_to($3::text, 'UTF8')
         )",
    )
    .bind(email)
    .bind(&raw)
    .bind(raw.to_string())
    .fetch_one(pool)
    .await?;
    get_by_id(pool, identity_id)
        .await?
        .ok_or_else(|| StorageError::Sqlx(sqlx::Error::RowNotFound))
}

/// Look up an account by email (case-sensitive, matching the unique key).
pub async fn get_by_email(pool: &PgPool, email: &str) -> Result<Option<AccountRow>, StorageError> {
    let row = sqlx::query_as::<_, AccountRow>(&format!(
        "SELECT {ACCOUNT_COLUMNS}
         FROM lifeos_security.identity
         WHERE subject_kind = 'human' AND subject_key = $1
           AND active_until IS NULL"
    ))
    .bind(email)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Return the first (and typically only) account. Used by auth commands that
/// operate on the single local account without knowing its email in advance.
pub async fn get_first(pool: &PgPool) -> Result<Option<AccountRow>, StorageError> {
    let row = sqlx::query_as::<_, AccountRow>(&format!(
        "SELECT {ACCOUNT_COLUMNS}
         FROM lifeos_security.identity
         WHERE subject_kind = 'human' AND active_until IS NULL
         ORDER BY active_from LIMIT 1"
    ))
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Update the password hash and canonical update timestamp.
pub async fn update_password(pool: &PgPool, id: Uuid, new_hash: &str) -> Result<(), StorageError> {
    sqlx::query(
        "UPDATE lifeos_security.identity
         SET attributes = attributes || jsonb_build_object('password_hash', $1)
         WHERE identity_id = $2 AND subject_kind = 'human'
           AND active_until IS NULL",
    )
    .bind(new_hash)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Delete all accounts. Called only by the explicit vault-reset command.
pub async fn delete_all(pool: &PgPool) -> Result<u64, StorageError> {
    let result = sqlx::query(
        "UPDATE lifeos_security.identity
         SET active_until = CURRENT_TIMESTAMP
         WHERE subject_kind = 'human' AND active_until IS NULL",
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

async fn get_by_id(pool: &PgPool, id: Uuid) -> Result<Option<AccountRow>, StorageError> {
    Ok(sqlx::query_as::<_, AccountRow>(&format!(
        "SELECT {ACCOUNT_COLUMNS}
         FROM lifeos_security.identity
         WHERE identity_id = $1 AND subject_kind = 'human'
           AND active_until IS NULL"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

// ---------------------------------------------------------------------------
// Legacy JSON import
// ---------------------------------------------------------------------------

/// Outcome of a `migrate_from_json` call.
#[derive(Debug, PartialEq, Eq)]
pub enum MigrateOutcome {
    /// Account plus immutable original source bytes were migrated.
    Migrated,
    /// The identity table already had rows — nothing needed importing.
    AlreadyMigrated,
    /// No legacy `account.json` source file was found.
    NoSource,
}

/// Errors specific to the JSON migration path.
#[derive(Debug)]
pub enum MigrateError {
    CorruptJson,
    Io(std::io::Error),
    Sqlx(sqlx::Error),
}

impl std::fmt::Display for MigrateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CorruptJson => write!(f, "account.json is corrupt or has an unexpected shape"),
            Self::Io(e) => write!(f, "I/O error during JSON migration: {e}"),
            Self::Sqlx(e) => write!(f, "database error during JSON migration: {e}"),
        }
    }
}

impl std::error::Error for MigrateError {}

impl From<std::io::Error> for MigrateError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<sqlx::Error> for MigrateError {
    fn from(e: sqlx::Error) -> Self {
        Self::Sqlx(e)
    }
}

/// Shape of the legacy on-disk JSON file. Mirrors `lifeos_core::auth::AccountRecord`.
#[derive(Debug, Deserialize)]
struct LegacyAccountJson {
    email: String,
    display_name: String,
    password_hash: String,
    /// `"epoch:<unix_seconds>"` — informational only.
    created_at: String,
}

/// One-time migration of `<app_data_dir>/account.json`. The original bytes are
/// inserted into `lifeos_blob.object` in the same PostgreSQL transaction as
/// the identity. Only after commit is the legacy file removed, preventing a
/// second durable authority from surviving migration.
pub async fn migrate_from_json(
    pool: &PgPool,
    app_data_dir: &Path,
) -> Result<MigrateOutcome, MigrateError> {
    let json_path = app_data_dir.join("account.json");
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM lifeos_security.identity
         WHERE subject_kind = 'human' AND active_until IS NULL",
    )
    .fetch_one(pool)
    .await?;
    if count > 0 {
        retire_captured_legacy_source(pool, &json_path).await?;
        return Ok(MigrateOutcome::AlreadyMigrated);
    }
    if !json_path.exists() {
        return Ok(MigrateOutcome::NoSource);
    }

    let raw = std::fs::read(&json_path)?;
    let text = std::str::from_utf8(&raw).map_err(|_| MigrateError::CorruptJson)?;
    let legacy: LegacyAccountJson =
        serde_json::from_str(text).map_err(|_| MigrateError::CorruptJson)?;
    let created_ts = legacy
        .created_at
        .strip_prefix("epoch:")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| chrono::Utc::now().timestamp());
    let mut tx = pool.begin().await?;
    let attributes = serde_json::json!({
        "display_name": legacy.display_name,
        "password_hash": legacy.password_hash,
        "created_at": created_ts,
        "source": "legacy-account-json",
    });
    sqlx::query_scalar::<_, Uuid>(
        "SELECT lifeos_security.register_identity(
           'human', $1, $2, $3
         )",
    )
    .bind(&legacy.email)
    .bind(attributes)
    .bind(&raw)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;

    std::fs::remove_file(&json_path)?;
    Ok(MigrateOutcome::Migrated)
}

async fn retire_captured_legacy_source(
    pool: &PgPool,
    json_path: &Path,
) -> Result<(), MigrateError> {
    if !json_path.exists() {
        return Ok(());
    }
    let raw = std::fs::read(json_path)?;
    let captured = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
           SELECT 1 FROM lifeos_blob.object
           WHERE sha256 = extensions.digest($1, 'sha256')
             AND bytes_inline = $1
         )",
    )
    .bind(&raw)
    .fetch_one(pool)
    .await?;
    if !captured {
        return Err(MigrateError::Sqlx(sqlx::Error::Protocol(
            "legacy account source exists but is not captured in PostgreSQL".into(),
        )));
    }
    std::fs::remove_file(json_path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use serial_test::serial;
    use std::fs;
    use tempfile::tempdir;

    async fn setup() -> Storage {
        Storage::new_for_test().await.unwrap()
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn round_trip() {
        let storage = setup().await;
        let pool = storage.pool();
        let row = insert(pool, "alex@lifeos.ai", "Alex", "hash1")
            .await
            .unwrap();
        assert_eq!(row.email, "alex@lifeos.ai");
        assert_eq!(row.display_name, "Alex");
        assert!(row.updated_at >= row.created_at);

        let found = get_by_email(pool, "alex@lifeos.ai").await.unwrap().unwrap();
        assert_eq!(found.id, row.id);
        update_password(pool, row.id, "newhash").await.unwrap();
        let updated = get_by_email(pool, "alex@lifeos.ai").await.unwrap().unwrap();
        assert_eq!(updated.password_hash, "newhash");

        let err = insert(pool, "alex@lifeos.ai", "Alex2", "hash2")
            .await
            .unwrap_err();
        assert!(matches!(err, StorageError::DuplicateEmail));
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn migrate_from_json_captures_original_bytes_and_retires_file() {
        let storage = setup().await;
        let pool = storage.pool();
        let dir = tempdir().unwrap();
        assert_eq!(
            migrate_from_json(pool, dir.path()).await.unwrap(),
            MigrateOutcome::NoSource
        );

        let json = br#"{"email":"j@x.com","display_name":"J","password_hash":"ph","created_at":"epoch:1000000"}"#;
        fs::write(dir.path().join("account.json"), json).unwrap();
        assert_eq!(
            migrate_from_json(pool, dir.path()).await.unwrap(),
            MigrateOutcome::Migrated
        );
        let row = get_by_email(pool, "j@x.com").await.unwrap().unwrap();
        assert_eq!(row.created_at, 1_000_000);
        assert!(!dir.path().join("account.json").exists());

        let captured: (i64, Vec<u8>) = sqlx::query_as(
            "SELECT byte_length, bytes_inline FROM lifeos_blob.object
             WHERE provenance->>'source' = $1",
        )
        .bind("legacy-account-json")
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(captured.0, json.len() as i64);
        assert_eq!(captured.1, json);
        assert_eq!(
            migrate_from_json(pool, dir.path()).await.unwrap(),
            MigrateOutcome::AlreadyMigrated
        );
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn corrupt_json_is_not_deleted() {
        let storage = setup().await;
        let dir = tempdir().unwrap();
        let bad_path = dir.path().join("account.json");
        fs::write(&bad_path, b"not json at all").unwrap();
        assert!(matches!(
            migrate_from_json(storage.pool(), dir.path()).await,
            Err(MigrateError::CorruptJson)
        ));
        assert!(bad_path.exists());
    }
}
