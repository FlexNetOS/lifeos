use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use super::StorageError;

/// A row from the AgentDB-owned experience-node projection.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Node {
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub payload_json: String,
    pub last_synced_at: i64,
}

/// A row from the AgentDB-owned experience-edge projection.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Edge {
    pub from_id: String,
    pub to_id: String,
    pub kind: String,
    pub payload_json: String,
    pub last_synced_at: i64,
}

/// A durable note projection used by the existing mempalace drawer UI.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Drawer {
    pub id: String,
    pub name: String,
    pub payload_json: String,
    pub last_synced_at: i64,
}

fn payload(value: &str) -> Result<serde_json::Value, StorageError> {
    serde_json::from_str(value).map_err(|_| StorageError::InvalidProjectionJson)
}

pub async fn upsert_node(
    pool: &PgPool,
    id: &str,
    kind: &str,
    label: Option<&str>,
    payload_json: &str,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "INSERT INTO lifeos_agentdb.exp_nodes (id, kind, label, payload_json, last_synced_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5))
         ON CONFLICT (id) DO UPDATE SET
           kind = EXCLUDED.kind,
           label = EXCLUDED.label,
           payload_json = EXCLUDED.payload_json,
           last_synced_at = EXCLUDED.last_synced_at",
    )
    .bind(id)
    .bind(kind)
    .bind(label)
    .bind(payload(payload_json)?)
    .bind(last_synced_at as f64)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_node(pool: &PgPool, id: &str) -> Result<Option<Node>, StorageError> {
    let row = sqlx::query_as::<_, Node>(
        "SELECT id, kind, label, payload_json::text AS payload_json,
           EXTRACT(EPOCH FROM last_synced_at)::BIGINT AS last_synced_at
         FROM lifeos_agentdb.exp_nodes WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn upsert_edge(
    pool: &PgPool,
    from_id: &str,
    to_id: &str,
    kind: &str,
    payload_json: &str,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "INSERT INTO lifeos_agentdb.exp_edges (from_id, to_id, kind, payload_json, last_synced_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5))
         ON CONFLICT (from_id, to_id, kind) DO UPDATE SET
           payload_json = EXCLUDED.payload_json,
           last_synced_at = EXCLUDED.last_synced_at",
    )
    .bind(from_id)
    .bind(to_id)
    .bind(kind)
    .bind(payload(payload_json)?)
    .bind(last_synced_at as f64)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_edge(
    pool: &PgPool,
    from_id: &str,
    to_id: &str,
    kind: &str,
) -> Result<Option<Edge>, StorageError> {
    let row = sqlx::query_as::<_, Edge>(
        "SELECT from_id, to_id, kind, payload_json::text AS payload_json,
           EXTRACT(EPOCH FROM last_synced_at)::BIGINT AS last_synced_at
         FROM lifeos_agentdb.exp_edges
         WHERE from_id = $1 AND to_id = $2 AND kind = $3",
    )
    .bind(from_id)
    .bind(to_id)
    .bind(kind)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn upsert_drawer(
    pool: &PgPool,
    id: &str,
    name: &str,
    payload_json: &str,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "INSERT INTO lifeos_agentdb.notes (id, name, payload_json, last_synced_at)
         VALUES ($1, $2, $3, to_timestamp($4))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           payload_json = EXCLUDED.payload_json,
           last_synced_at = EXCLUDED.last_synced_at",
    )
    .bind(id)
    .bind(name)
    .bind(payload(payload_json)?)
    .bind(last_synced_at as f64)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_drawer(pool: &PgPool, id: &str) -> Result<Option<Drawer>, StorageError> {
    let row = sqlx::query_as::<_, Drawer>(
        "SELECT id, name, payload_json::text AS payload_json,
           EXTRACT(EPOCH FROM last_synced_at)::BIGINT AS last_synced_at
         FROM lifeos_agentdb.notes WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Delete all mempalace projections in dependency order within one PostgreSQL
/// transaction. Canonical raw source objects remain untouched.
pub async fn clear(pool: &PgPool) -> Result<(), StorageError> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM lifeos_agentdb.exp_edges")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM lifeos_agentdb.exp_nodes")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM lifeos_agentdb.notes")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use serial_test::serial;

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn edge_fk_and_projection_roundtrip() {
        let storage = Storage::new_for_test().await.unwrap();
        let pool = storage.pool();
        upsert_node(pool, "n1", "concept", Some("Node 1"), "{}", 0)
            .await
            .unwrap();
        upsert_node(pool, "n2", "concept", Some("Node 2"), "{}", 0)
            .await
            .unwrap();
        upsert_edge(pool, "n1", "n2", "related", "{}", 0)
            .await
            .unwrap();
        assert!(get_edge(pool, "n1", "n2", "related")
            .await
            .unwrap()
            .is_some());
        let err = upsert_edge(pool, "n1", "missing", "related", "{}", 0)
            .await
            .unwrap_err();
        assert!(matches!(err, StorageError::ForeignKeyViolation));

        upsert_drawer(pool, "drawer", "Notes", r#"{"a":1}"#, 10)
            .await
            .unwrap();
        assert_eq!(
            get_drawer(pool, "drawer").await.unwrap().unwrap().name,
            "Notes"
        );
        clear(pool).await.unwrap();
        assert!(get_node(pool, "n1").await.unwrap().is_none());
    }
}
