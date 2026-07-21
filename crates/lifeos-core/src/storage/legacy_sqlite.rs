//! One-way import for the pre-PostgreSQL LifeOS SQLite database.
//!
//! SQLite is never a post-cutover product-data authority. This module opens a
//! legacy file read-only, copies every supported record plus the exact source
//! bytes into PostgreSQL in one transaction, and only then removes the source
//! database and any WAL sidecars.

use sha2::{Digest, Sha256};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    PgPool, SqlitePool,
};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

use super::{ruvector, StorageError};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LegacySqliteImportReport {
    pub accounts: u64,
    pub nodes: u64,
    pub edges: u64,
    pub drawers: u64,
    pub vectors: u64,
    pub gnn_cache_entries: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LegacySqliteImportOutcome {
    NoSource,
    Migrated(LegacySqliteImportReport),
}

#[derive(Debug)]
pub enum LegacySqliteImportError {
    Io(std::io::Error),
    Sqlx(sqlx::Error),
    Storage(StorageError),
    InvalidJson { table: &'static str, key: String },
    InvalidVector { id: String },
    Conflict { table: &'static str, key: String },
}

impl std::fmt::Display for LegacySqliteImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "legacy SQLite I/O error: {error}"),
            Self::Sqlx(error) => write!(f, "legacy SQLite import database error: {error}"),
            Self::Storage(error) => write!(f, "legacy SQLite import storage error: {error}"),
            Self::InvalidJson { table, key } => {
                write!(f, "legacy SQLite {table} row {key} has invalid JSON")
            }
            Self::InvalidVector { id } => {
                write!(
                    f,
                    "legacy SQLite vector {id} has an invalid byte length or dimension"
                )
            }
            Self::Conflict { table, key } => write!(
                f,
                "legacy SQLite {table} row {key} conflicts with canonical PostgreSQL data"
            ),
        }
    }
}

impl std::error::Error for LegacySqliteImportError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sqlx(error) => Some(error),
            Self::Storage(error) => Some(error),
            Self::InvalidJson { .. } | Self::InvalidVector { .. } | Self::Conflict { .. } => None,
        }
    }
}

impl From<std::io::Error> for LegacySqliteImportError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<sqlx::Error> for LegacySqliteImportError {
    fn from(error: sqlx::Error) -> Self {
        Self::Sqlx(error)
    }
}

impl From<StorageError> for LegacySqliteImportError {
    fn from(error: StorageError) -> Self {
        Self::Storage(error)
    }
}

#[derive(Debug, sqlx::FromRow)]
struct LegacyAccount {
    email: String,
    display_name: String,
    password_hash: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct LegacyNode {
    id: String,
    kind: String,
    label: Option<String>,
    payload_json: String,
    last_synced_at: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct LegacyEdge {
    from_id: String,
    to_id: String,
    kind: String,
    payload_json: String,
    last_synced_at: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct LegacyDrawer {
    id: String,
    name: String,
    payload_json: String,
    last_synced_at: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct LegacyVector {
    id: String,
    collection: String,
    dim: i64,
    vector: Vec<u8>,
    metadata_json: Option<String>,
    last_synced_at: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct LegacyGnnCache {
    cache_key: String,
    payload: Vec<u8>,
    computed_at: i64,
}

#[derive(Debug)]
struct LegacyData {
    accounts: Vec<LegacyAccount>,
    nodes: Vec<LegacyNode>,
    edges: Vec<LegacyEdge>,
    drawers: Vec<LegacyDrawer>,
    vectors: Vec<LegacyVector>,
    gnn_cache_entries: Vec<LegacyGnnCache>,
}

#[derive(Debug)]
struct SourceFile {
    path: PathBuf,
    source_kind: &'static str,
    bytes: Vec<u8>,
}

/// Import the historical Tauri app-data SQLite file. The function is
/// idempotent for equal rows; divergent rows deliberately fail and leave the
/// source untouched for explicit conflict resolution.
pub async fn migrate_from_sqlite(
    postgres: &PgPool,
    sqlite_path: &Path,
) -> Result<LegacySqliteImportOutcome, LegacySqliteImportError> {
    if !sqlite_path.is_file() {
        return Ok(LegacySqliteImportOutcome::NoSource);
    }

    let sqlite = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(sqlite_path)
                .read_only(true),
        )
        .await?;
    let data = read_legacy_data(&sqlite).await?;
    sqlite.close().await;

    let sources = read_source_files(sqlite_path)?;
    let report = LegacySqliteImportReport {
        accounts: data.accounts.len() as u64,
        nodes: data.nodes.len() as u64,
        edges: data.edges.len() as u64,
        drawers: data.drawers.len() as u64,
        vectors: data.vectors.len() as u64,
        gnn_cache_entries: data.gnn_cache_entries.len() as u64,
    };

    let mut tx = postgres.begin().await?;
    capture_source_files(&mut tx, &sources).await?;
    import_accounts(&mut tx, &data.accounts).await?;
    import_nodes(&mut tx, &data.nodes).await?;
    import_edges(&mut tx, &data.edges).await?;
    import_drawers(&mut tx, &data.drawers).await?;
    import_vectors(&mut tx, &data.vectors).await?;
    import_gnn_cache(&mut tx, &data.gnn_cache_entries).await?;
    tx.commit().await?;

    for source in sources {
        std::fs::remove_file(source.path)?;
    }

    Ok(LegacySqliteImportOutcome::Migrated(report))
}

async fn read_legacy_data(sqlite: &SqlitePool) -> Result<LegacyData, sqlx::Error> {
    Ok(LegacyData {
        accounts: sqlx::query_as(
            "SELECT email, display_name, password_hash, created_at, updated_at
             FROM accounts ORDER BY id",
        )
        .fetch_all(sqlite)
        .await?,
        nodes: sqlx::query_as(
            "SELECT id, kind, label, payload_json, last_synced_at
             FROM mempalace_nodes ORDER BY id",
        )
        .fetch_all(sqlite)
        .await?,
        edges: sqlx::query_as(
            "SELECT from_id, to_id, kind, payload_json, last_synced_at
             FROM mempalace_edges ORDER BY from_id, to_id, kind",
        )
        .fetch_all(sqlite)
        .await?,
        drawers: sqlx::query_as(
            "SELECT id, name, payload_json, last_synced_at
             FROM mempalace_drawers ORDER BY id",
        )
        .fetch_all(sqlite)
        .await?,
        vectors: sqlx::query_as(
            "SELECT id, collection, dim, vector, metadata_json, last_synced_at
             FROM ruvector_vectors ORDER BY id",
        )
        .fetch_all(sqlite)
        .await?,
        gnn_cache_entries: sqlx::query_as(
            "SELECT cache_key, payload, computed_at
             FROM ruvector_gnn_cache ORDER BY cache_key",
        )
        .fetch_all(sqlite)
        .await?,
    })
}

fn read_source_files(sqlite_path: &Path) -> Result<Vec<SourceFile>, std::io::Error> {
    let mut result = vec![SourceFile {
        path: sqlite_path.to_path_buf(),
        source_kind: "legacy-sqlite-database",
        bytes: std::fs::read(sqlite_path)?,
    }];
    for (suffix, source_kind) in [("-wal", "legacy-sqlite-wal"), ("-shm", "legacy-sqlite-shm")] {
        let mut sidecar = OsString::from(sqlite_path.as_os_str());
        sidecar.push(suffix);
        let path = PathBuf::from(sidecar);
        if path.is_file() {
            result.push(SourceFile {
                bytes: std::fs::read(&path)?,
                path,
                source_kind,
            });
        }
    }
    Ok(result)
}

async fn capture_source_files(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    sources: &[SourceFile],
) -> Result<(), sqlx::Error> {
    for source in sources {
        let sha256 = format!("{:x}", Sha256::digest(&source.bytes));
        sqlx::query(
            "INSERT INTO lifeos_blob.object (sha256, byte_length, raw_bytes, source_kind)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (sha256) DO NOTHING",
        )
        .bind(sha256)
        .bind(source.bytes.len() as i64)
        .bind(&source.bytes)
        .bind(source.source_kind)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn import_accounts(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    accounts: &[LegacyAccount],
) -> Result<(), LegacySqliteImportError> {
    for account in accounts {
        let existing: Option<(String, String, i64, i64)> = sqlx::query_as(
            "SELECT display_name, password_hash,
                    EXTRACT(EPOCH FROM created_at)::BIGINT,
                    EXTRACT(EPOCH FROM updated_at)::BIGINT
             FROM lifeos_security.identity WHERE email = $1",
        )
        .bind(&account.email)
        .fetch_optional(&mut **tx)
        .await?;
        match existing {
            Some((name, hash, created_at, updated_at))
                if name == account.display_name
                    && hash == account.password_hash
                    && created_at == account.created_at
                    && updated_at == account.updated_at => {}
            Some(_) => {
                return Err(LegacySqliteImportError::Conflict {
                    table: "accounts",
                    key: account.email.clone(),
                });
            }
            None => {
                sqlx::query(
                    "INSERT INTO lifeos_security.identity
                       (email, display_name, password_hash, created_at, updated_at)
                     VALUES ($1, $2, $3, to_timestamp($4), to_timestamp($5))",
                )
                .bind(&account.email)
                .bind(&account.display_name)
                .bind(&account.password_hash)
                .bind(account.created_at as f64)
                .bind(account.updated_at as f64)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

async fn import_nodes(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    nodes: &[LegacyNode],
) -> Result<(), LegacySqliteImportError> {
    for node in nodes {
        let payload = parse_json("mempalace_nodes", &node.id, &node.payload_json)?;
        let existing: Option<(String, Option<String>, bool, i64)> = sqlx::query_as(
            "SELECT kind, label, payload_json = $2,
                    EXTRACT(EPOCH FROM last_synced_at)::BIGINT
             FROM lifeos_agentdb.exp_nodes WHERE id = $1",
        )
        .bind(&node.id)
        .bind(&payload)
        .fetch_optional(&mut **tx)
        .await?;
        match existing {
            Some((kind, label, payload_equal, last_synced_at))
                if kind == node.kind
                    && label == node.label
                    && payload_equal
                    && last_synced_at == node.last_synced_at => {}
            Some(_) => {
                return Err(LegacySqliteImportError::Conflict {
                    table: "mempalace_nodes",
                    key: node.id.clone(),
                });
            }
            None => {
                sqlx::query(
                    "INSERT INTO lifeos_agentdb.exp_nodes
                       (id, kind, label, payload_json, last_synced_at)
                     VALUES ($1, $2, $3, $4, to_timestamp($5))",
                )
                .bind(&node.id)
                .bind(&node.kind)
                .bind(&node.label)
                .bind(payload)
                .bind(node.last_synced_at as f64)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

async fn import_edges(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    edges: &[LegacyEdge],
) -> Result<(), LegacySqliteImportError> {
    for edge in edges {
        let key = format!("{}:{}:{}", edge.from_id, edge.to_id, edge.kind);
        let payload = parse_json("mempalace_edges", &key, &edge.payload_json)?;
        let existing: Option<(bool, i64)> = sqlx::query_as(
            "SELECT payload_json = $4,
                    EXTRACT(EPOCH FROM last_synced_at)::BIGINT
             FROM lifeos_agentdb.exp_edges
             WHERE from_id = $1 AND to_id = $2 AND kind = $3",
        )
        .bind(&edge.from_id)
        .bind(&edge.to_id)
        .bind(&edge.kind)
        .bind(&payload)
        .fetch_optional(&mut **tx)
        .await?;
        match existing {
            Some((payload_equal, last_synced_at))
                if payload_equal && last_synced_at == edge.last_synced_at => {}
            Some(_) => {
                return Err(LegacySqliteImportError::Conflict {
                    table: "mempalace_edges",
                    key,
                });
            }
            None => {
                sqlx::query(
                    "INSERT INTO lifeos_agentdb.exp_edges
                       (from_id, to_id, kind, payload_json, last_synced_at)
                     VALUES ($1, $2, $3, $4, to_timestamp($5))",
                )
                .bind(&edge.from_id)
                .bind(&edge.to_id)
                .bind(&edge.kind)
                .bind(payload)
                .bind(edge.last_synced_at as f64)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

async fn import_drawers(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    drawers: &[LegacyDrawer],
) -> Result<(), LegacySqliteImportError> {
    for drawer in drawers {
        let payload = parse_json("mempalace_drawers", &drawer.id, &drawer.payload_json)?;
        let existing: Option<(String, bool, i64)> = sqlx::query_as(
            "SELECT name, payload_json = $2,
                    EXTRACT(EPOCH FROM last_synced_at)::BIGINT
             FROM lifeos_agentdb.notes WHERE id = $1",
        )
        .bind(&drawer.id)
        .bind(&payload)
        .fetch_optional(&mut **tx)
        .await?;
        match existing {
            Some((name, payload_equal, last_synced_at))
                if name == drawer.name
                    && payload_equal
                    && last_synced_at == drawer.last_synced_at => {}
            Some(_) => {
                return Err(LegacySqliteImportError::Conflict {
                    table: "mempalace_drawers",
                    key: drawer.id.clone(),
                });
            }
            None => {
                sqlx::query(
                    "INSERT INTO lifeos_agentdb.notes
                       (id, name, payload_json, last_synced_at)
                     VALUES ($1, $2, $3, to_timestamp($4))",
                )
                .bind(&drawer.id)
                .bind(&drawer.name)
                .bind(payload)
                .bind(drawer.last_synced_at as f64)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

async fn import_vectors(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    vectors: &[LegacyVector],
) -> Result<(), LegacySqliteImportError> {
    for vector in vectors {
        if vector.dim <= 0
            || vector.vector.len() as i64 != vector.dim * 4
            || ruvector::decode_vector(&vector.vector).is_err()
        {
            return Err(LegacySqliteImportError::InvalidVector {
                id: vector.id.clone(),
            });
        }
        let metadata = vector
            .metadata_json
            .as_deref()
            .map(|payload| parse_json("ruvector_vectors", &vector.id, payload))
            .transpose()?;
        let existing: Option<(String, i64, Vec<u8>, bool, i64)> = sqlx::query_as(
            "SELECT collection, dim::BIGINT, raw_vector,
                    metadata_json IS NOT DISTINCT FROM $2,
                    EXTRACT(EPOCH FROM last_synced_at)::BIGINT
             FROM lifeos_semantic.embedding WHERE id = $1",
        )
        .bind(&vector.id)
        .bind(&metadata)
        .fetch_optional(&mut **tx)
        .await?;
        match existing {
            Some((collection, dim, bytes, metadata_equal, last_synced_at))
                if collection == vector.collection
                    && dim == vector.dim
                    && bytes == vector.vector
                    && metadata_equal
                    && last_synced_at == vector.last_synced_at => {}
            Some(_) => {
                return Err(LegacySqliteImportError::Conflict {
                    table: "ruvector_vectors",
                    key: vector.id.clone(),
                });
            }
            None => {
                let embedding = ruvector::ruvector_literal(&vector.vector)?;
                sqlx::query(
                    "INSERT INTO lifeos_semantic.embedding
                       (id, collection, dim, raw_vector, embedding, metadata_json, last_synced_at)
                     VALUES ($1, $2, $3, $4, $5::extensions.ruvector, $6, to_timestamp($7))",
                )
                .bind(&vector.id)
                .bind(&vector.collection)
                .bind(vector.dim as i32)
                .bind(&vector.vector)
                .bind(embedding)
                .bind(metadata)
                .bind(vector.last_synced_at as f64)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

async fn import_gnn_cache(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    entries: &[LegacyGnnCache],
) -> Result<(), LegacySqliteImportError> {
    for entry in entries {
        let existing: Option<(Vec<u8>, i64)> = sqlx::query_as(
            "SELECT payload, EXTRACT(EPOCH FROM computed_at)::BIGINT
             FROM lifeos_semantic.gnn_cache WHERE cache_key = $1",
        )
        .bind(&entry.cache_key)
        .fetch_optional(&mut **tx)
        .await?;
        match existing {
            Some((payload, computed_at))
                if payload == entry.payload && computed_at == entry.computed_at => {}
            Some(_) => {
                return Err(LegacySqliteImportError::Conflict {
                    table: "ruvector_gnn_cache",
                    key: entry.cache_key.clone(),
                });
            }
            None => {
                sqlx::query(
                    "INSERT INTO lifeos_semantic.gnn_cache (cache_key, payload, computed_at)
                     VALUES ($1, $2, to_timestamp($3))",
                )
                .bind(&entry.cache_key)
                .bind(&entry.payload)
                .bind(entry.computed_at as f64)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

fn parse_json(
    table: &'static str,
    key: &str,
    payload: &str,
) -> Result<serde_json::Value, LegacySqliteImportError> {
    serde_json::from_str(payload).map_err(|_| LegacySqliteImportError::InvalidJson {
        table,
        key: key.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use serial_test::serial;
    use tempfile::tempdir;

    const LEGACY_SCHEMA: &[&str] = &[
        "CREATE TABLE accounts (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
        "CREATE TABLE mempalace_nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT, payload_json TEXT NOT NULL, last_synced_at INTEGER NOT NULL)",
        "CREATE TABLE mempalace_edges (from_id TEXT NOT NULL, to_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL, last_synced_at INTEGER NOT NULL, PRIMARY KEY (from_id, to_id, kind))",
        "CREATE TABLE mempalace_drawers (id TEXT PRIMARY KEY, name TEXT NOT NULL, payload_json TEXT NOT NULL, last_synced_at INTEGER NOT NULL)",
        "CREATE TABLE ruvector_vectors (id TEXT PRIMARY KEY, collection TEXT NOT NULL, dim INTEGER NOT NULL, vector BLOB NOT NULL, metadata_json TEXT, last_synced_at INTEGER NOT NULL)",
        "CREATE TABLE ruvector_gnn_cache (cache_key TEXT PRIMARY KEY, payload BLOB NOT NULL, computed_at INTEGER NOT NULL)",
    ];

    async fn seed_legacy(path: &Path, account_name: &str) {
        let sqlite = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        for statement in LEGACY_SCHEMA {
            sqlx::query(statement).execute(&sqlite).await.unwrap();
        }
        sqlx::query(
            "INSERT INTO accounts (email, display_name, password_hash, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind("alex@lifeos.ai")
        .bind(account_name)
        .bind("phc")
        .bind(100_i64)
        .bind(101_i64)
        .execute(&sqlite)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO mempalace_nodes (id, kind, label, payload_json, last_synced_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind("n1")
        .bind("concept")
        .bind("Node")
        .bind(r#"{"v":1}"#)
        .bind(102_i64)
        .execute(&sqlite)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO mempalace_edges (from_id, to_id, kind, payload_json, last_synced_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind("n1")
        .bind("n1")
        .bind("self")
        .bind(r#"{"v":2}"#)
        .bind(103_i64)
        .execute(&sqlite)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO mempalace_drawers (id, name, payload_json, last_synced_at)
             VALUES (?, ?, ?, ?)",
        )
        .bind("d1")
        .bind("Drawer")
        .bind(r#"{"v":3}"#)
        .bind(104_i64)
        .execute(&sqlite)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO ruvector_vectors (id, collection, dim, vector, metadata_json, last_synced_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind("v1")
        .bind("memory")
        .bind(2_i64)
        .bind(ruvector::encode_vector(&[1.0_f32, 2.0_f32]))
        .bind(r#"{"source":"legacy"}"#)
        .bind(105_i64)
        .execute(&sqlite)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO ruvector_gnn_cache (cache_key, payload, computed_at) VALUES (?, ?, ?)",
        )
        .bind("cache")
        .bind(b"payload".to_vec())
        .bind(106_i64)
        .execute(&sqlite)
        .await
        .unwrap();
        sqlite.close().await;
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn imports_every_legacy_table_and_retires_the_file_after_commit() {
        let storage = Storage::new_for_test().await.unwrap();
        let dir = tempdir().unwrap();
        let path = dir.path().join("lifeos.db");
        seed_legacy(&path, "Alex").await;

        let outcome = migrate_from_sqlite(storage.pool(), &path).await.unwrap();
        assert_eq!(
            outcome,
            LegacySqliteImportOutcome::Migrated(LegacySqliteImportReport {
                accounts: 1,
                nodes: 1,
                edges: 1,
                drawers: 1,
                vectors: 1,
                gnn_cache_entries: 1,
            })
        );
        assert!(!path.exists());
        for (table, expected) in [
            ("lifeos_security.identity", 1_i64),
            ("lifeos_agentdb.exp_nodes", 1),
            ("lifeos_agentdb.exp_edges", 1),
            ("lifeos_agentdb.notes", 1),
            ("lifeos_semantic.embedding", 1),
            ("lifeos_semantic.gnn_cache", 1),
        ] {
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(storage.pool())
                .await
                .unwrap();
            assert_eq!(count, expected, "{table}");
        }
        let archived: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM lifeos_blob.object WHERE source_kind = 'legacy-sqlite-database'",
        )
        .fetch_one(storage.pool())
        .await
        .unwrap();
        assert_eq!(archived, 1);
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn conflicting_source_is_not_retired() {
        let storage = Storage::new_for_test().await.unwrap();
        let dir = tempdir().unwrap();
        let path = dir.path().join("lifeos.db");
        seed_legacy(&path, "Legacy Alex").await;
        sqlx::query(
            "INSERT INTO lifeos_security.identity (email, display_name, password_hash)
             VALUES ($1, $2, $3)",
        )
        .bind("alex@lifeos.ai")
        .bind("Canonical Alex")
        .bind("different")
        .execute(storage.pool())
        .await
        .unwrap();

        assert!(matches!(
            migrate_from_sqlite(storage.pool(), &path).await,
            Err(LegacySqliteImportError::Conflict {
                table: "accounts",
                ..
            })
        ));
        assert!(path.exists());
    }
}
