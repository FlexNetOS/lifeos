pub mod accounts;
pub mod branches;
pub mod coordination;
pub mod error;
#[cfg(feature = "legacy-sqlite-import")]
pub mod legacy_sqlite;
pub mod logs;
pub mod mempalace;
pub mod network;
pub mod routing;
pub mod ruvector;
pub mod security;
pub mod seed_vault;
pub mod state;
pub mod tasks;
pub mod vault;

pub use error::StorageError;

use serde::Serialize;
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    PgPool,
};
use std::str::FromStr;
use uuid::Uuid;

/// The envctl-issued authority needed to bind one PostgreSQL connection to a
/// tenant. Binding is connection-local because the database records the
/// backend PID and expiry in `lifeos_security.backend_binding`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeContext {
    pub tenant_id: Uuid,
    pub identity_id: Uuid,
    pub grant_id: Uuid,
    pub binding_bytes: Vec<u8>,
    pub task_grant_id: Option<Uuid>,
    pub task_lease_id: Option<Uuid>,
    pub task_binding_object_id: Option<Uuid>,
}

impl RuntimeContext {
    /// Read the context delivered by envctl. The binding is intentionally raw
    /// UTF-8 JSON bytes: the database validates its exact tenant, identity,
    /// grant, purpose, and provenance before creating a backend binding.
    pub fn from_env() -> Result<Self, StorageError> {
        let read =
            |name: &str| std::env::var(name).map_err(|_| StorageError::MissingRuntimeContext);
        let parse_uuid = |name: &str, value: String| {
            Uuid::parse_str(&value)
                .map_err(|error| StorageError::InvalidRuntimeContext(format!("{name}: {error}")))
        };
        let binding = read("LIFEOS_RUNTIME_BINDING_JSON")?.into_bytes();
        if binding.is_empty() {
            return Err(StorageError::InvalidRuntimeContext(
                "LIFEOS_RUNTIME_BINDING_JSON is empty".into(),
            ));
        }
        Ok(Self {
            tenant_id: parse_uuid(
                "LIFEOS_RUNTIME_TENANT_ID",
                read("LIFEOS_RUNTIME_TENANT_ID")?,
            )?,
            identity_id: parse_uuid(
                "LIFEOS_RUNTIME_IDENTITY_ID",
                read("LIFEOS_RUNTIME_IDENTITY_ID")?,
            )?,
            grant_id: parse_uuid("LIFEOS_RUNTIME_GRANT_ID", read("LIFEOS_RUNTIME_GRANT_ID")?)?,
            binding_bytes: binding,
            task_grant_id: optional_runtime_uuid("LIFEOS_RUNTIME_TASK_GRANT_ID")?,
            task_lease_id: optional_runtime_uuid("LIFEOS_RUNTIME_TASK_LEASE_ID")?,
            task_binding_object_id: optional_runtime_uuid("LIFEOS_RUNTIME_TASK_BINDING_OBJECT_ID")?,
        })
    }
}

fn optional_runtime_uuid(name: &str) -> Result<Option<Uuid>, StorageError> {
    match std::env::var(name) {
        Ok(value) => Uuid::parse_str(&value)
            .map(Some)
            .map_err(|error| StorageError::InvalidRuntimeContext(format!("{name}: {error}"))),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(StorageError::InvalidRuntimeContext(format!(
            "{name}: {error}"
        ))),
    }
}

/// The canonical durable LifeOS storage handle. PostgreSQL/RuVector owns every
/// product record; redb is intentionally not represented here because it is a
/// separately supervised transient/projection tier.
#[derive(Clone)]
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
        Self::new_with_context(url, None).await
    }

    async fn new_with_context(
        url: &str,
        runtime_context: Option<RuntimeContext>,
    ) -> Result<Self, StorageError> {
        Self::new_with_context_and_pool_size(url, runtime_context, 10).await
    }

    async fn new_with_context_and_pool_size(
        url: &str,
        runtime_context: Option<RuntimeContext>,
        max_connections: u32,
    ) -> Result<Self, StorageError> {
        if !(url.starts_with("postgres://") || url.starts_with("postgresql://")) {
            return Err(StorageError::UnsupportedDatabaseUrl);
        }

        let options = PgConnectOptions::from_str(url).map_err(sqlx::Error::from)?;
        let mut pool_options = PgPoolOptions::new()
            .max_connections(max_connections)
            .min_connections(1);
        if let Some(context) = runtime_context {
            pool_options = pool_options.after_connect(move |connection, _meta| {
                let context = context.clone();
                Box::pin(async move {
                    sqlx::query(
                        "SELECT binding_id, session_nonce
                         FROM lifeos_security.bootstrap_envctl_context($1, $2, $3, $4)",
                    )
                    .bind(context.tenant_id)
                    .bind(context.identity_id)
                    .bind(context.grant_id)
                    .bind(context.binding_bytes)
                    .fetch_one(&mut *connection)
                    .await?;
                    if let (Some(task_grant_id), Some(task_lease_id), Some(binding_object_id)) = (
                        context.task_grant_id,
                        context.task_lease_id,
                        context.task_binding_object_id,
                    ) {
                        sqlx::query(
                            "SELECT lifeos_security.bind_runtime_context($1, $2, $3, $4, $5)",
                        )
                        .bind(context.tenant_id)
                        .bind(context.identity_id)
                        .bind(task_grant_id)
                        .bind(task_lease_id)
                        .bind(binding_object_id)
                        .fetch_one(&mut *connection)
                        .await?;
                    }
                    Ok(())
                })
            });
        }
        let pool = pool_options
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
        // Migrations create the envctl binding function itself. Bootstrap the
        // schema through an unbound connection, then reopen the pool with the
        // connection hook that binds every application connection.
        let bootstrap = Self::new(&url).await?;
        bootstrap.migrate().await?;
        let context = RuntimeContext::from_env()?;
        Self::new_with_context(&url, Some(context)).await
    }

    /// Run embedded PostgreSQL migrations. Idempotent: sqlx records applied
    /// versions in `_sqlx_migrations` inside the canonical database.
    pub async fn migrate(&self) -> Result<MigrateReport, StorageError> {
        migrate_pool(self.pool.clone()).await
    }
}

async fn migrate_pool(pool: PgPool) -> Result<MigrateReport, StorageError> {
    let mut connection = pool.acquire().await?;
    let (public_ledger, runtime_ledger): (bool, bool) = sqlx::query_as(
        "SELECT
               to_regclass('public._sqlx_migrations') IS NOT NULL,
               to_regclass('lifeos_runtime._sqlx_migrations') IS NOT NULL",
    )
    .fetch_one(&mut *connection)
    .await?;
    if public_ledger && runtime_ledger {
        return Err(StorageError::Sqlx(sqlx::Error::Protocol(
            "ambiguous SQLx migration ledgers in public and lifeos_runtime".into(),
        )));
    }
    if public_ledger {
        sqlx::query("ALTER TABLE public._sqlx_migrations SET SCHEMA lifeos_runtime")
            .execute(&mut *connection)
            .await?;
    }
    sqlx::query("SET search_path TO lifeos_runtime, extensions, pg_catalog")
        .execute(&mut *connection)
        .await?;

    // Run on a fresh canonical connection. The connection used for the
    // ledger relocation/search-path bootstrap can retain session state from
    // that pre-migration work; migrations must execute against a clean
    // session whose ledger is explicitly the runtime ledger.
    connection.close().await?;
    let mut connection = pool.acquire().await?;
    sqlx::query("SET search_path TO lifeos_runtime, extensions, pg_catalog")
        .execute(&mut *connection)
        .await?;

    sqlx::migrate!("./migrations")
        .run_direct(&mut *connection)
        .await
        .map_err(|e| StorageError::Sqlx(sqlx::Error::Protocol(e.to_string())))?;

    let embedded = sqlx::migrate!("./migrations");
    let (applied_after_run,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM lifeos_runtime._sqlx_migrations")
            .fetch_one(&mut *connection)
            .await?;
    if applied_after_run < embedded.migrations.len() as i64 {
        connection.close().await?;
        let mut retry_connection = pool.acquire().await?;
        sqlx::query("SET search_path TO lifeos_runtime, extensions, pg_catalog")
            .execute(&mut *retry_connection)
            .await?;
        embedded
            .run_direct(&mut *retry_connection)
            .await
            .map_err(|e| StorageError::Sqlx(sqlx::Error::Protocol(e.to_string())))?;
        connection = retry_connection;
    }

    let (applied,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM lifeos_runtime._sqlx_migrations")
        .fetch_one(&mut *connection)
        .await?;
    let total = sqlx::migrate!("./migrations").migrations.len() as u32;

    Ok(MigrateReport {
        applied: applied as u32,
        total,
    })
}

impl Storage {
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
            sqlx::query_as("SELECT version FROM lifeos_runtime._sqlx_migrations ORDER BY version")
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
            schema_version: "3",
        })
    }

    /// Expose the PostgreSQL pool to repository-owned storage modules only.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Acquire a connection and bind it through the database-owned envctl
    /// security boundary. Callers must use the returned connection for all
    /// tenant-scoped work; a different pool connection has no tenant context.
    pub async fn bind_runtime_context(
        &self,
        context: &RuntimeContext,
    ) -> Result<sqlx::pool::PoolConnection<sqlx::Postgres>, StorageError> {
        let mut connection = self.pool.acquire().await?;
        sqlx::query(
            "SELECT binding_id, session_nonce
             FROM lifeos_security.bootstrap_envctl_context($1, $2, $3, $4)",
        )
        .bind(context.tenant_id)
        .bind(context.identity_id)
        .bind(context.grant_id)
        .bind(&context.binding_bytes)
        .fetch_one(&mut *connection)
        .await?;
        Ok(connection)
    }

    #[cfg(test)]
    pub async fn new_for_test() -> Result<Self, StorageError> {
        let url = std::env::var("LIFEOS_TEST_DATABASE_URL")
            .map_err(|_| StorageError::MissingTestDatabaseUrl)?;
        let bootstrap = Self::new(&url).await?;
        bootstrap.migrate().await?;
        bootstrap.pool.close().await;
        let context = RuntimeContext {
            tenant_id: uuid::uuid!("00000000-0000-4000-8000-000000000001"),
            identity_id: uuid::uuid!("00000000-0000-4000-8000-000000000002"),
            grant_id: uuid::uuid!("00000000-0000-4000-8000-000000000003"),
            binding_bytes: br#"{"tenant_id":"00000000-0000-4000-8000-000000000001","identity_id":"00000000-0000-4000-8000-000000000002","grant_id":"00000000-0000-4000-8000-000000000003","purpose":"envctl-session-binding"}"#.to_vec(),
            task_grant_id: None,
            task_lease_id: None,
            task_binding_object_id: None,
        };
        let storage = Self::new_with_context_and_pool_size(&url, Some(context), 1).await?;
        storage.reset_for_test().await?;
        Ok(storage)
    }

    #[cfg(test)]
    async fn reset_for_test(&self) -> Result<(), StorageError> {
        sqlx::query(
            "DELETE FROM lifeos_security.identity
             WHERE subject_kind = 'human'",
        )
        .execute(&self.pool)
        .await?;
        sqlx::query("SELECT lifeos_semantic.retire_embedding_collection('test')")
            .execute(&self.pool)
            .await?;
        for table in [
            "lifeos_agentdb.exp_edges",
            "lifeos_agentdb.exp_nodes",
            "lifeos_runtime.ui_projection",
        ] {
            sqlx::query(&format!("TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"))
                .execute(&self.pool)
                .await?;
        }
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
    use super::{redact_database_url, RuntimeContext, Storage, StorageError};
    use uuid::Uuid;

    #[test]
    fn redacts_user_and_password() {
        assert_eq!(
            redact_database_url("postgresql://user:secret@db.example:5432/lifeos?sslmode=require"),
            "postgresql://db.example:5432/lifeos"
        );
    }

    #[test]
    fn runtime_context_preserves_envctl_binding_bytes() {
        let context = RuntimeContext {
            tenant_id: uuid::uuid!("00000000-0000-4000-8000-000000000001"),
            identity_id: uuid::uuid!("00000000-0000-4000-8000-000000000002"),
            grant_id: uuid::uuid!("00000000-0000-4000-8000-000000000003"),
            binding_bytes: br#"{"purpose":"envctl-session-binding"}"#.to_vec(),
            task_grant_id: None,
            task_lease_id: None,
            task_binding_object_id: None,
        };
        assert_eq!(
            context.binding_bytes,
            br#"{"purpose":"envctl-session-binding"}"#
        );
    }

    #[tokio::test]
    #[ignore = "requires a live PostgreSQL database and envctl-issued context"]
    async fn runtime_context_binds_a_live_postgres_connection() {
        let url = std::env::var("LIFEOS_DATABASE_URL").unwrap();
        let storage = Storage::new(&url).await.unwrap();
        let context = RuntimeContext::from_env().unwrap();
        let mut connection = storage.bind_runtime_context(&context).await.unwrap();
        let tenant: Uuid = sqlx::query_scalar("SELECT lifeos_security.current_tenant()")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        assert_eq!(tenant, context.tenant_id);
    }

    #[tokio::test]
    async fn rejects_non_postgresql_urls_before_connecting() {
        assert!(matches!(
            Storage::new("sqlite::memory:").await,
            Err(StorageError::UnsupportedDatabaseUrl)
        ));
    }
}
