use serde::{Deserialize, Serialize};
use serde_json::json;
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
    let typed = json!({
        "logical_key": id,
        "kind": kind,
        "label": label,
        "payload": payload(payload_json)?,
        "last_synced_at": last_synced_at,
        "tombstone": false,
    });
    sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT lifeos_agentdb.append_projection_record(
           'lifeos_agentdb.exp_nodes'::regclass, 'exp-node', $1, $2, convert_to($2::text, 'UTF8')
         )",
    )
    .bind(id)
    .bind(typed)
    .fetch_one(pool)
    .await?;
    Ok(())
}

pub async fn get_node(pool: &PgPool, id: &str) -> Result<Option<Node>, StorageError> {
    let row = sqlx::query_as::<_, Node>(
        "SELECT typed_payload->>'logical_key' AS id,
           typed_payload->>'kind' AS kind,
           typed_payload->>'label' AS label,
           (typed_payload->'payload')::text AS payload_json,
           coalesce((typed_payload->>'last_synced_at')::BIGINT,
                    EXTRACT(EPOCH FROM observed_at)::BIGINT) AS last_synced_at
         FROM lifeos_agentdb.exp_nodes
         WHERE tenant_id = lifeos_security.current_tenant()
           AND record_kind = 'exp-node'
           AND typed_payload->>'logical_key' = $1
           AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
         ORDER BY sequence DESC LIMIT 1",
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
    let source_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(
           SELECT 1 FROM lifeos_agentdb.exp_nodes
           WHERE tenant_id = lifeos_security.current_tenant()
             AND record_kind = 'exp-node'
             AND typed_payload->>'logical_key' = $1
             AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
         )",
    )
    .bind(from_id)
    .fetch_one(pool)
    .await?;
    let target_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(
           SELECT 1 FROM lifeos_agentdb.exp_nodes
           WHERE tenant_id = lifeos_security.current_tenant()
             AND record_kind = 'exp-node'
             AND typed_payload->>'logical_key' = $1
             AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
         )",
    )
    .bind(to_id)
    .fetch_one(pool)
    .await?;
    if !source_exists || !target_exists {
        return Err(StorageError::ForeignKeyViolation);
    }
    let logical_key = format!("{from_id}:{to_id}:{kind}");
    let typed = json!({
        "logical_key": logical_key,
        "from_id": from_id,
        "to_id": to_id,
        "kind": kind,
        "payload": payload(payload_json)?,
        "last_synced_at": last_synced_at,
        "tombstone": false,
    });
    sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT lifeos_agentdb.append_projection_record(
           'lifeos_agentdb.exp_edges'::regclass, 'exp-edge', $1, $2, convert_to($2::text, 'UTF8')
         )",
    )
    .bind(logical_key)
    .bind(typed)
    .fetch_one(pool)
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
        "SELECT typed_payload->>'from_id' AS from_id,
           typed_payload->>'to_id' AS to_id,
           typed_payload->>'kind' AS kind,
           (typed_payload->'payload')::text AS payload_json,
           coalesce((typed_payload->>'last_synced_at')::BIGINT,
                    EXTRACT(EPOCH FROM observed_at)::BIGINT) AS last_synced_at
         FROM lifeos_agentdb.exp_edges
         WHERE tenant_id = lifeos_security.current_tenant()
           AND record_kind = 'exp-edge'
           AND typed_payload->>'from_id' = $1
           AND typed_payload->>'to_id' = $2
           AND typed_payload->>'kind' = $3
           AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
         ORDER BY sequence DESC LIMIT 1",
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
    let typed = json!({
        "logical_key": id,
        "name": name,
        "payload": payload(payload_json)?,
        "last_synced_at": last_synced_at,
        "tombstone": false,
    });
    sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT lifeos_agentdb.append_projection_record(
           'lifeos_agentdb.exp_nodes'::regclass, 'note', $1, $2, convert_to($2::text, 'UTF8')
         )",
    )
    .bind(id)
    .bind(typed)
    .fetch_one(pool)
    .await?;
    Ok(())
}

pub async fn get_drawer(pool: &PgPool, id: &str) -> Result<Option<Drawer>, StorageError> {
    let row = sqlx::query_as::<_, Drawer>(
        "SELECT typed_payload->>'logical_key' AS id,
           typed_payload->>'name' AS name,
           (typed_payload->'payload')::text AS payload_json,
           coalesce((typed_payload->>'last_synced_at')::BIGINT,
                    EXTRACT(EPOCH FROM observed_at)::BIGINT) AS last_synced_at
         FROM lifeos_agentdb.exp_nodes
         WHERE tenant_id = lifeos_security.current_tenant()
           AND record_kind = 'note'
           AND typed_payload->>'logical_key' = $1
           AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
         ORDER BY sequence DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Delete all mempalace projections in dependency order within one PostgreSQL
/// transaction. Canonical raw source objects remain untouched.
pub async fn clear(pool: &PgPool) -> Result<(), StorageError> {
    sqlx::query(
        "SELECT lifeos_agentdb.clear_projection_kind(
           'lifeos_agentdb.exp_edges'::regclass, 'exp-edge')",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "SELECT lifeos_agentdb.clear_projection_kind(
           'lifeos_agentdb.exp_nodes'::regclass, 'exp-node')",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "SELECT lifeos_agentdb.clear_projection_kind(
           'lifeos_agentdb.exp_nodes'::regclass, 'note')",
    )
    .execute(pool)
    .await?;
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
