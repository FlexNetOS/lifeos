pub mod accounts;
pub mod error;
pub mod mempalace;
pub mod ruvector;

pub use error::StorageError;

use serde::Serialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::str::FromStr;

/// The managed storage handle. Holds a `SqlitePool` and the resolved DB path
/// string so `db_health` can surface it without extra state.
pub struct Storage {
    pool: SqlitePool,
    db_path: String,
}

/// Returned by `db_health` to the frontend.
#[derive(Debug, Serialize)]
pub struct DbHealth {
    /// `"ok"` when `applied_migrations == embedded_migration_count`, else `"degraded"`.
    pub status: &'static str,
    pub db_path: String,
    pub applied_migrations: u32,
    pub last_migration_version: i64,
    /// Bump this when the wire format of existing tables changes (not just additions).
    pub schema_version: &'static str,
}

/// Returned by `db_migrate` to the frontend.
#[derive(Debug, Serialize)]
pub struct MigrateReport {
    pub applied: u32,
    pub total: u32,
}

impl Storage {
    /// Open (or create) a SQLite database at `url`.
    ///
    /// Applies WAL, foreign-keys, and busy-timeout PRAGMAs on every new
    /// connection via `after_connect`. Callers must already be inside a Tokio
    /// context (the Tauri `.setup()` callback satisfies this).
    pub async fn new(url: &str) -> Result<Self, StorageError> {
        // Build connect options with PRAGMAs embedded so they fire before any
        // query — more reliable than `after_connect` for journal_mode=WAL.
        let opts = SqliteConnectOptions::from_str(url)
            .map_err(sqlx::Error::from)?
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .foreign_keys(true)
            .busy_timeout(std::time::Duration::from_millis(5000));

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .min_connections(1)
            .connect_with(opts)
            .await
            .map_err(sqlx::Error::from)?;

        Ok(Self {
            pool,
            db_path: url.to_string(),
        })
    }

    /// Convenience constructor for tests — uses an in-memory database.
    pub async fn new_in_memory() -> Result<Self, StorageError> {
        Self::new("sqlite::memory:").await
    }

    /// Run embedded migrations against the pool. Idempotent; sqlx tracks
    /// applied versions in `_sqlx_migrations`.
    pub async fn migrate(&self) -> Result<MigrateReport, StorageError> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| StorageError::Sqlx(sqlx::Error::Protocol(e.to_string())))?;

        let (applied,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM _sqlx_migrations")
            .fetch_one(&self.pool)
            .await?;

        let total = sqlx::migrate!("./migrations").migrations.len() as u32;

        Ok(MigrateReport {
            applied: applied as u32,
            total,
        })
    }

    /// Liveness + version check.  Reads `_sqlx_migrations` to count applied
    /// versions; compares against the embedded migration count to detect
    /// partial failure.
    pub async fn health(&self) -> Result<DbHealth, StorageError> {
        let rows: Vec<(i64,)> =
            sqlx::query_as("SELECT version FROM _sqlx_migrations ORDER BY version")
                .fetch_all(&self.pool)
                .await?;

        let applied = rows.len() as u32;
        let last_migration_version = rows.last().map(|(v,)| *v).unwrap_or(0);
        let embedded_count = sqlx::migrate!("./migrations").migrations.len() as u32;
        let status = if applied >= embedded_count {
            "ok"
        } else {
            "degraded"
        };

        Ok(DbHealth {
            status,
            db_path: self.db_path.clone(),
            applied_migrations: applied,
            last_migration_version,
            schema_version: "1",
        })
    }

    /// Expose the pool for sub-modules (`accounts`, `mempalace`, `ruvector`).
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
