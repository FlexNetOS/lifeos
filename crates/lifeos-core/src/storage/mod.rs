pub mod accounts;
pub mod error;
#[cfg(feature = "legacy-sqlite-import")]
pub mod legacy_sqlite;
pub mod mempalace;
pub mod ruvector;
pub mod state;

pub use error::StorageError;

use serde::Serialize;
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    PgPool,
};
use std::str::FromStr;

/// The canonical durable LifeOS storage handle. PostgreSQL/RuVector owns every
/// product record; redb is intentionally not represented here because it is a
/// separately supervised transient/projection tier.
pub struct Storage {
    pool: PgPool,
    database_id: String,
}

/// Returned by `db_health` to the frontend. `database_id` is redacted and can
/// never expose a connection password or query-string credential.
#[derive(Debug, Serialize)]
pub struct DbHealth {
    /// `"ok"` when all embedded migrations are present and RuVector is in the
    /// dedicated `extensions` namespace; otherwise the command returns an error.
    pub status: &'static str,
    pub database_id: String,
    pub applied_migrations: u32,
    pub last_migration_version: i64,
    pub ruvector_extension_version: String,
    /// Bump this when the durable wire format changes (not just additions).
    pub schema_version: &'static str,
}

/// Returned by `db_migrate` to the frontend.
#[derive(Debug, Serialize)]
pub struct MigrateReport {
    pub applied: u32,
    pub total: u32,
}

impl Storage {
    /// Open a PostgreSQL/RuVector database. SQLite is deliberately rejected:
    /// it is not a canonical durable product-data tier in LifeOS.
    pub async fn new(url: &str) -> Result<Self, StorageError> {
        if !(url.starts_with("postgres://") || url.starts_with("postgresql://")) {
            return Err(StorageError::UnsupportedDatabaseUrl);
        }

        let options = PgConnectOptions::from_str(url).map_err(sqlx::Error::from)?;
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .min_connections(1)
            .connect_with(options)
            .await
            .map_err(sqlx::Error::from)?;

        Ok(Self {
            pool,
            database_id: redact_database_url(url),
        })
    }

    /// Resolve the runtime connection only from the database bridge surface.
    /// The value is intentionally not read from a file or a frontend argument.
    pub async fn from_runtime_env() -> Result<Self, StorageError> {
        let url =
            std::env::var("LIFEOS_DATABASE_URL").map_err(|_| StorageError::MissingDatabaseUrl)?;
        Self::new(&url).await
    }

    /// Run embedded PostgreSQL migrations. Idempotent: sqlx records applied
    /// versions in `_sqlx_migrations` inside the canonical database.
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

    /// Verify that the database is a valid canonical durable store, rather
    /// than merely a reachable PostgreSQL server.
    pub async fn verify_required_extensions(&self) -> Result<String, StorageError> {
        let version = sqlx::query_scalar::<_, String>(
            "SELECT e.extversion
             FROM pg_extension e
             JOIN pg_namespace n ON n.oid = e.extnamespace
             WHERE e.extname = $1 AND n.nspname = $2",
        )
        .bind("ruvector")
        .bind("extensions")
        .fetch_optional(&self.pool)
        .await?
        .ok_or(StorageError::RequiredExtension)?;

        Ok(version)
    }

    /// Liveness + migration + extension placement check.
    pub async fn health(&self) -> Result<DbHealth, StorageError> {
        let rows: Vec<(i64,)> =
            sqlx::query_as("SELECT version FROM _sqlx_migrations ORDER BY version")
                .fetch_all(&self.pool)
                .await?;
        let applied = rows.len() as u32;
        let last_migration_version = rows.last().map(|(v,)| *v).unwrap_or(0);
        let embedded_count = sqlx::migrate!("./migrations").migrations.len() as u32;
        if applied < embedded_count {
            return Err(StorageError::IncompleteMigrations {
                applied,
                expected: embedded_count,
            });
        }

        let ruvector_extension_version = self.verify_required_extensions().await?;
        Ok(DbHealth {
            status: "ok",
            database_id: self.database_id.clone(),
            applied_migrations: applied,
            last_migration_version,
            ruvector_extension_version,
            schema_version: "2",
        })
    }

    /// Expose the PostgreSQL pool to repository-owned storage modules only.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    #[cfg(test)]
    pub async fn new_for_test() -> Result<Self, StorageError> {
        let url = std::env::var("LIFEOS_TEST_DATABASE_URL")
            .map_err(|_| StorageError::MissingTestDatabaseUrl)?;
        let storage = Self::new(&url).await?;
        storage.migrate().await?;
        storage.verify_required_extensions().await?;
        storage.reset_for_test().await?;
        Ok(storage)
    }

    #[cfg(test)]
    async fn reset_for_test(&self) -> Result<(), StorageError> {
        sqlx::query(
            "TRUNCATE TABLE
               lifeos_semantic.gnn_cache,
               lifeos_semantic.embedding,
               lifeos_agentdb.exp_edges,
               lifeos_agentdb.exp_nodes,
               lifeos_agentdb.notes,
               lifeos_runtime.projection,
               lifeos_security.identity,
               lifeos_blob.object
             RESTART IDENTITY CASCADE",
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

fn redact_database_url(url: &str) -> String {
    let (scheme, remainder) = url.split_once("://").unwrap_or(("postgresql", url));
    let without_query = remainder.split('?').next().unwrap_or(remainder);
    let authority_and_path = without_query
        .split_once('@')
        .map(|(_, value)| value)
        .unwrap_or(without_query);
    format!("{scheme}://{authority_and_path}")
}

#[cfg(test)]
mod tests {
    use super::{redact_database_url, Storage, StorageError};

    #[test]
    fn redacts_user_and_password() {
        assert_eq!(
            redact_database_url("postgresql://user:secret@db.example:5432/lifeos?sslmode=require"),
            "postgresql://db.example:5432/lifeos"
        );
    }

    #[tokio::test]
    async fn rejects_non_postgresql_urls_before_connecting() {
        assert!(matches!(
            Storage::new("sqlite::memory:").await,
            Err(StorageError::UnsupportedDatabaseUrl)
        ));
    }
}
