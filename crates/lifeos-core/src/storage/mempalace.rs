use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::StorageError;

/// A row from `mempalace_nodes`.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Node {
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub payload_json: String,
    pub last_synced_at: i64,
}

/// A row from `mempalace_edges`.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Edge {
    pub from_id: String,
    pub to_id: String,
    pub kind: String,
    pub payload_json: String,
    pub last_synced_at: i64,
}

/// A row from `mempalace_drawers`.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Drawer {
    pub id: String,
    pub name: String,
    pub payload_json: String,
    pub last_synced_at: i64,
}

pub async fn upsert_node(
    pool: &SqlitePool,
    id: &str,
    kind: &str,
    label: Option<&str>,
    payload_json: &str,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "INSERT INTO mempalace_nodes (id, kind, label, payload_json, last_synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           label = excluded.label,
           payload_json = excluded.payload_json,
           last_synced_at = excluded.last_synced_at",
    )
    .bind(id)
    .bind(kind)
    .bind(label)
    .bind(payload_json)
    .bind(last_synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_node(pool: &SqlitePool, id: &str) -> Result<Option<Node>, StorageError> {
    let row = sqlx::query_as::<_, Node>(
        "SELECT id, kind, label, payload_json, last_synced_at FROM mempalace_nodes WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn upsert_edge(
    pool: &SqlitePool,
    from_id: &str,
    to_id: &str,
    kind: &str,
    payload_json: &str,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "INSERT INTO mempalace_edges (from_id, to_id, kind, payload_json, last_synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(from_id, to_id, kind) DO UPDATE SET
           payload_json = excluded.payload_json,
           last_synced_at = excluded.last_synced_at",
    )
    .bind(from_id)
    .bind(to_id)
    .bind(kind)
    .bind(payload_json)
    .bind(last_synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_edge(
    pool: &SqlitePool,
    from_id: &str,
    to_id: &str,
    kind: &str,
) -> Result<Option<Edge>, StorageError> {
    let row = sqlx::query_as::<_, Edge>(
        "SELECT from_id, to_id, kind, payload_json, last_synced_at
         FROM mempalace_edges WHERE from_id = ? AND to_id = ? AND kind = ?",
    )
    .bind(from_id)
    .bind(to_id)
    .bind(kind)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn upsert_drawer(
    pool: &SqlitePool,
    id: &str,
    name: &str,
    payload_json: &str,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "INSERT INTO mempalace_drawers (id, name, payload_json, last_synced_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           payload_json = excluded.payload_json,
           last_synced_at = excluded.last_synced_at",
    )
    .bind(id)
    .bind(name)
    .bind(payload_json)
    .bind(last_synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_drawer(pool: &SqlitePool, id: &str) -> Result<Option<Drawer>, StorageError> {
    let row = sqlx::query_as::<_, Drawer>(
        "SELECT id, name, payload_json, last_synced_at FROM mempalace_drawers WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Delete all mempalace data in dependency order (edges first, then nodes,
/// then drawers) within a single transaction.
pub async fn clear(pool: &SqlitePool) -> Result<(), StorageError> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM mempalace_edges")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM mempalace_nodes")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM mempalace_drawers")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;

    async fn setup() -> Storage {
        let s = Storage::new_in_memory().await.unwrap();
        s.migrate().await.unwrap();
        s
    }

    #[tokio::test]
    async fn edge_fk() {
        let s = setup().await;
        let pool = s.pool();

        // Two nodes required before an edge can be inserted.
        upsert_node(pool, "n1", "concept", Some("Node 1"), "{}", 0)
            .await
            .unwrap();
        upsert_node(pool, "n2", "concept", Some("Node 2"), "{}", 0)
            .await
            .unwrap();

        // Valid edge.
        upsert_edge(pool, "n1", "n2", "related", "{}", 0)
            .await
            .unwrap();
        let e = get_edge(pool, "n1", "n2", "related").await.unwrap();
        assert!(e.is_some());

        // Edge referencing missing node → ForeignKeyViolation.
        let err = upsert_edge(pool, "n1", "missing", "related", "{}", 0)
            .await
            .unwrap_err();
        assert!(matches!(err, StorageError::ForeignKeyViolation));

        // Cascade: deleting a node removes incident edges.
        sqlx::query("DELETE FROM mempalace_nodes WHERE id = 'n1'")
            .execute(pool)
            .await
            .unwrap();
        let e = get_edge(pool, "n1", "n2", "related").await.unwrap();
        assert!(e.is_none(), "edge should be cascade-deleted");
    }
}
