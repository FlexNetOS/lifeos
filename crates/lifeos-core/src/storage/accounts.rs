use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::Path;

use super::StorageError;

/// A row from the `accounts` table.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AccountRow {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    pub password_hash: String,
    /// Unix timestamp seconds.
    pub created_at: i64,
    /// Unix timestamp seconds.
    pub updated_at: i64,
}

/// Insert a new account and return the inserted row.
///
/// Maps a UNIQUE violation on `email` to `StorageError::DuplicateEmail`.
pub async fn insert(
    pool: &SqlitePool,
    email: &str,
    display_name: &str,
    password_hash: &str,
) -> Result<AccountRow, StorageError> {
    let now = Utc::now().timestamp();
    let row = sqlx::query_as::<_, AccountRow>(
        "INSERT INTO accounts (email, display_name, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *",
    )
    .bind(email)
    .bind(display_name)
    .bind(password_hash)
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Look up an account by email (case-sensitive, matches the UNIQUE index).
pub async fn get_by_email(
    pool: &SqlitePool,
    email: &str,
) -> Result<Option<AccountRow>, StorageError> {
    let row = sqlx::query_as::<_, AccountRow>(
        "SELECT id, email, display_name, password_hash, created_at, updated_at
         FROM accounts WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Return the first (and typically only) account. Used by auth commands that
/// operate on the single local account without knowing its email in advance.
pub async fn get_first(pool: &SqlitePool) -> Result<Option<AccountRow>, StorageError> {
    let row = sqlx::query_as::<_, AccountRow>(
        "SELECT id, email, display_name, password_hash, created_at, updated_at
         FROM accounts LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Update the password hash for an account and bump `updated_at`.
pub async fn update_password(
    pool: &SqlitePool,
    id: i64,
    new_hash: &str,
) -> Result<(), StorageError> {
    let now = Utc::now().timestamp();
    sqlx::query("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(new_hash)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Delete all accounts. Returns the number of rows removed.
/// Called by `auth_reset_vault` to wipe the local credential store.
pub async fn delete_all(pool: &SqlitePool) -> Result<u64, StorageError> {
    let result = sqlx::query("DELETE FROM accounts").execute(pool).await?;
    Ok(result.rows_affected())
}

// ---------------------------------------------------------------------------
// JSON migration helpers
// ---------------------------------------------------------------------------

/// Outcome of a `migrate_from_json` call.
#[derive(Debug, PartialEq, Eq)]
pub enum MigrateOutcome {
    /// Account was successfully migrated from the JSON file.
    Migrated,
    /// The `accounts` table already had rows — nothing was done.
    AlreadyMigrated,
    /// No `account.json` file was found — nothing was done.
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

/// One-time migration: if the `accounts` table is empty and
/// `<app_data_dir>/account.json` exists, parse it and INSERT the account, then
/// rename the JSON file to `account.json.migrated-<RFC3339-UTC>` (colons
/// replaced with hyphens for cross-platform filename safety).
///
/// Runs inside a transaction so a parse/insert failure leaves both the DB and
/// filesystem untouched.
pub async fn migrate_from_json(
    pool: &SqlitePool,
    app_data_dir: &Path,
) -> Result<MigrateOutcome, MigrateError> {
    // Guard: non-empty table means migration already ran.
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM accounts")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(MigrateOutcome::AlreadyMigrated);
    }

    let json_path = app_data_dir.join("account.json");
    if !json_path.exists() {
        return Ok(MigrateOutcome::NoSource);
    }

    let raw = std::fs::read_to_string(&json_path)?;
    let legacy: LegacyAccountJson =
        serde_json::from_str(&raw).map_err(|_| MigrateError::CorruptJson)?;

    // Parse "epoch:<n>" to recover a Unix timestamp for `created_at`.
    let created_ts = legacy
        .created_at
        .strip_prefix("epoch:")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| Utc::now().timestamp());
    let now = Utc::now().timestamp();

    // Wrap insert in a transaction: failure leaves both DB and file untouched.
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO accounts (email, display_name, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&legacy.email)
    .bind(&legacy.display_name)
    .bind(&legacy.password_hash)
    .bind(created_ts)
    .bind(now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // Archive the JSON file: colons → hyphens for cross-platform safety.
    let ts = Utc::now().format("%Y-%m-%dT%H-%M-%SZ").to_string();
    let archive_name = format!("account.json.migrated-{ts}");
    std::fs::rename(&json_path, app_data_dir.join(&archive_name))?;

    Ok(MigrateOutcome::Migrated)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use std::fs;
    use tempfile::tempdir;

    async fn setup() -> Storage {
        let s = Storage::new_in_memory().await.unwrap();
        s.migrate().await.unwrap();
        s
    }

    #[tokio::test]
    async fn round_trip() {
        let s = setup().await;
        let pool = s.pool();

        let row = insert(pool, "alex@lifeos.ai", "Alex", "hash1")
            .await
            .unwrap();
        assert_eq!(row.email, "alex@lifeos.ai");
        assert_eq!(row.display_name, "Alex");
        assert!(row.updated_at >= row.created_at);

        // get_by_email
        let found = get_by_email(pool, "alex@lifeos.ai").await.unwrap().unwrap();
        assert_eq!(found.id, row.id);

        // update_password bumps updated_at
        // Sleep 1s is too slow for tests; just verify the call succeeds and
        // the hash changed.
        update_password(pool, row.id, "newhash").await.unwrap();
        let updated = get_by_email(pool, "alex@lifeos.ai").await.unwrap().unwrap();
        assert_eq!(updated.password_hash, "newhash");

        // duplicate email returns DuplicateEmail
        let err = insert(pool, "alex@lifeos.ai", "Alex2", "hash2")
            .await
            .unwrap_err();
        assert!(matches!(err, StorageError::DuplicateEmail));
    }

    #[tokio::test]
    async fn migrate_from_json_test() {
        let s = setup().await;
        let pool = s.pool();
        let dir = tempdir().unwrap();

        // No JSON → NoSource
        let outcome = migrate_from_json(pool, dir.path()).await.unwrap();
        assert_eq!(outcome, MigrateOutcome::NoSource);

        // Write a valid account.json
        let json = r#"{"email":"j@x.com","display_name":"J","password_hash":"ph","created_at":"epoch:1000000"}"#;
        fs::write(dir.path().join("account.json"), json).unwrap();

        let outcome = migrate_from_json(pool, dir.path()).await.unwrap();
        assert_eq!(outcome, MigrateOutcome::Migrated);

        // Verify row inserted
        let row = get_by_email(pool, "j@x.com").await.unwrap().unwrap();
        assert_eq!(row.created_at, 1000000);

        // Archive file exists; JSON file removed
        let entries: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(entries
            .iter()
            .any(|n| n.starts_with("account.json.migrated-")));
        assert!(!dir.path().join("account.json").exists());

        // Second call → AlreadyMigrated
        let outcome = migrate_from_json(pool, dir.path()).await.unwrap();
        assert_eq!(outcome, MigrateOutcome::AlreadyMigrated);

        // Corrupt JSON → CorruptJson; file left in place
        let bad_path = dir.path().join("account.json");
        fs::write(&bad_path, b"not json at all").unwrap();
        // Insert a new DB to be empty for the corrupt-JSON test
        let s2 = Storage::new_in_memory().await.unwrap();
        s2.migrate().await.unwrap();
        let err = migrate_from_json(s2.pool(), dir.path()).await.unwrap_err();
        assert!(matches!(err, MigrateError::CorruptJson));
        assert!(bad_path.exists(), "corrupt JSON must be left in place");
    }
}
