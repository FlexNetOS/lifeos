use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use super::StorageError;

/// A row from the canonical semantic embedding projection. `vector` retains
/// exact source bytes; the database also holds a RuVector value for finite
/// coordinates so semantic queries use the extension instead of a sidecar.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VectorRow {
    pub id: String,
    pub collection: String,
    pub dim: i64,
    pub vector: Vec<u8>,
    pub metadata_json: Option<String>,
    pub last_synced_at: i64,
}

/// A durable cache receipt. The hot cache itself belongs to the redb owner;
/// this table retains its reconstructable canonical counterpart.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GnnCacheRow {
    pub cache_key: String,
    pub payload: Vec<u8>,
    pub computed_at: i64,
}

/// Encode a `&[f32]` as a little-endian byte vector.
pub fn encode_vector(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Decode a little-endian byte slice back into `Vec<f32>`.
pub fn decode_vector(b: &[u8]) -> Result<Vec<f32>, StorageError> {
    if b.len() % 4 != 0 {
        return Err(StorageError::InvalidVectorBytes);
    }
    Ok(b.chunks_exact(4)
        .map(|c| f32::from_le_bytes(c.try_into().expect("four-byte chunks")))
        .collect())
}

pub(crate) fn ruvector_literal(vector_bytes: &[u8]) -> Result<Option<String>, StorageError> {
    let values = decode_vector(vector_bytes)?;
    if values.iter().any(|value| !value.is_finite()) {
        return Ok(None);
    }
    Ok(Some(format!(
        "[{}]",
        values
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(",")
    )))
}

fn metadata(value: Option<&str>) -> Result<Option<serde_json::Value>, StorageError> {
    value
        .map(|raw| serde_json::from_str(raw).map_err(|_| StorageError::InvalidProjectionJson))
        .transpose()
}

pub async fn upsert_vector(
    pool: &PgPool,
    id: &str,
    collection: &str,
    dim: i64,
    vector_bytes: &[u8],
    metadata_json: Option<&str>,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    if vector_bytes.len() as i64 != dim * 4 {
        return Err(StorageError::VectorLengthMismatch);
    }
    let embedding = ruvector_literal(vector_bytes)?;
    let metadata = metadata(metadata_json)?.unwrap_or_else(|| serde_json::json!({}));
    if let Some(embedding) = embedding {
        sqlx::query_scalar::<_, uuid::Uuid>(
            "SELECT lifeos_semantic.append_embedding_projection(
               $1, $2, $3, $4, $5, $6, $7, false)",
        )
        .bind(id)
        .bind(collection)
        .bind(dim as i32)
        .bind(vector_bytes)
        .bind(embedding)
        .bind(metadata)
        .bind(last_synced_at)
        .fetch_one(pool)
        .await?;
    } else {
        let payload = serde_json::json!({
            "logical_key": format!("embedding:{id}"),
            "logical_id": id,
            "collection": collection,
            "dimension": dim,
            "last_synced_at": last_synced_at,
            "non_finite": true,
            "tombstone": false,
            "metadata": metadata,
        });
        sqlx::query(
            "SELECT lifeos_agentdb.append_projection_record(
               'lifeos_agentdb.exp_nodes'::regclass,
               'embedding-diagnostic', $1, $2, $3)",
        )
        .bind(format!("embedding:{id}"))
        .bind(payload)
        .bind(vector_bytes)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn get_vector(pool: &PgPool, id: &str) -> Result<Option<VectorRow>, StorageError> {
    let row = sqlx::query_as::<_, VectorRow>(
        "SELECT metadata->>'logical_id' AS id,
           metadata->>'collection' AS collection,
           dimension::BIGINT AS dim,
           lifeos_blob.load_object_bytes(source_object_id) AS vector,
           (metadata->'user_metadata')::text AS metadata_json,
           (metadata->>'last_synced_at')::BIGINT AS last_synced_at
         FROM lifeos_semantic.embedding
         WHERE tenant_id = lifeos_security.current_tenant()
           AND metadata->>'logical_id' = $1
           AND coalesce((metadata->>'retired')::boolean, false) = false
         ORDER BY generation DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    if row.is_some() {
        return Ok(row);
    }
    Ok(sqlx::query_as::<_, VectorRow>(
        "SELECT typed_payload->>'logical_id' AS id,
           typed_payload->>'collection' AS collection,
           (typed_payload->>'dimension')::BIGINT AS dim,
           lifeos_blob.load_object_bytes(raw_object_id) AS vector,
           (typed_payload->'metadata')::text AS metadata_json,
           (typed_payload->>'last_synced_at')::BIGINT AS last_synced_at
         FROM lifeos_agentdb.exp_nodes
         WHERE tenant_id = lifeos_security.current_tenant()
           AND record_kind = 'embedding-diagnostic'
           AND typed_payload->>'logical_id' = $1
           AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
         ORDER BY sequence DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

pub async fn list_by_collection(
    pool: &PgPool,
    collection: &str,
) -> Result<Vec<VectorRow>, StorageError> {
    let rows = sqlx::query_as::<_, VectorRow>(
        "SELECT metadata->>'logical_id' AS id,
           metadata->>'collection' AS collection,
           dimension::BIGINT AS dim,
           lifeos_blob.load_object_bytes(source_object_id) AS vector,
           (metadata->'user_metadata')::text AS metadata_json,
           (metadata->>'last_synced_at')::BIGINT AS last_synced_at
         FROM lifeos_semantic.embedding e
         WHERE tenant_id = lifeos_security.current_tenant()
           AND metadata->>'collection' = $1
           AND coalesce((metadata->>'retired')::boolean, false) = false
           AND generation = (
             SELECT max(latest.generation)
             FROM lifeos_semantic.embedding latest
             WHERE latest.tenant_id = e.tenant_id
               AND latest.metadata->>'logical_id' = e.metadata->>'logical_id')
         ORDER BY id",
    )
    .bind(collection)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn upsert_gnn(
    pool: &PgPool,
    cache_key: &str,
    payload: &[u8],
    computed_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "SELECT lifeos_agentdb.append_projection_record(
           'lifeos_agentdb.exp_nodes'::regclass, 'gnn-cache', $1,
           jsonb_build_object(
             'logical_key', $1,
             'payload_base64', encode($2, 'base64'),
             'computed_at', $3,
             'tombstone', false), $2)",
    )
    .bind(cache_key)
    .bind(payload)
    .bind(computed_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_gnn(pool: &PgPool, cache_key: &str) -> Result<Option<GnnCacheRow>, StorageError> {
    let row = sqlx::query_as::<_, GnnCacheRow>(
        "SELECT typed_payload->>'logical_key' AS cache_key,
           decode(typed_payload->>'payload_base64', 'base64') AS payload,
           (typed_payload->>'computed_at')::BIGINT AS computed_at
         FROM lifeos_agentdb.exp_nodes
         WHERE tenant_id = lifeos_security.current_tenant()
           AND record_kind = 'gnn-cache'
           AND typed_payload->>'logical_key' = $1
           AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
         ORDER BY sequence DESC LIMIT 1",
    )
    .bind(cache_key)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn clear_collection(pool: &PgPool, name: &str) -> Result<(), StorageError> {
    sqlx::query("SELECT lifeos_semantic.retire_embedding_collection($1)")
        .bind(name)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn clear_gnn_cache(pool: &PgPool) -> Result<(), StorageError> {
    sqlx::query("SELECT lifeos_agentdb.clear_projection_kind('gnn-cache')")
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
    async fn vector_roundtrip_preserves_bytes_and_projects_finite_values() {
        let storage = Storage::new_for_test().await.unwrap();
        let pool = storage.pool();
        let cases: &[&[f32]] = &[
            &[1.0, 2.0, 3.0],
            &[f32::NAN, f32::INFINITY, f32::NEG_INFINITY],
            &[f32::MIN_POSITIVE, f32::MAX, -0.0_f32, 0.0_f32],
            &[f32::from_bits(0x0000_0001)],
        ];

        for (index, &floats) in cases.iter().enumerate() {
            let encoded = encode_vector(floats);
            let decoded = decode_vector(&encoded).unwrap();
            assert_eq!(floats.len(), decoded.len());
            for (a, b) in floats.iter().zip(&decoded) {
                assert_eq!(a.to_bits(), b.to_bits(), "case {index}: bit mismatch");
            }
            let id = format!("v{index}");
            upsert_vector(pool, &id, "test", floats.len() as i64, &encoded, None, 0)
                .await
                .unwrap();
            let row = get_vector(pool, &id).await.unwrap().unwrap();
            let back = decode_vector(&row.vector).unwrap();
            for (a, b) in floats.iter().zip(&back) {
                assert_eq!(a.to_bits(), b.to_bits(), "db round-trip case {index}");
            }
        }

        let projected: Option<String> = sqlx::query_scalar(
            "SELECT embedding::text FROM lifeos_semantic.embedding WHERE id = $1",
        )
        .bind("v0")
        .fetch_one(pool)
        .await
        .unwrap();
        assert!(projected.is_some());
        let non_finite: Option<String> = sqlx::query_scalar(
            "SELECT embedding::text FROM lifeos_semantic.embedding WHERE id = $1",
        )
        .bind("v1")
        .fetch_one(pool)
        .await
        .unwrap();
        assert!(non_finite.is_none());
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn constraints_and_gnn_receipts() {
        let storage = Storage::new_for_test().await.unwrap();
        let pool = storage.pool();
        let three_floats = encode_vector(&[1.0, 2.0, 3.0]);
        assert!(matches!(
            upsert_vector(pool, "bad", "test", 4, &three_floats, None, 0).await,
            Err(StorageError::VectorLengthMismatch)
        ));
        let raw_err = sqlx::query(
            "INSERT INTO lifeos_semantic.embedding
               (id, collection, dim, raw_vector, last_synced_at)
             VALUES ($1, $2, 0, $3, to_timestamp(0))",
        )
        .bind("x")
        .bind("c")
        .bind(Vec::<u8>::new())
        .execute(pool)
        .await;
        assert!(raw_err.is_err(), "dim=0 should violate CHECK constraint");
        assert!(matches!(
            decode_vector(&[0u8, 1u8, 2u8]),
            Err(StorageError::InvalidVectorBytes)
        ));

        upsert_gnn(pool, "key1", b"payload", 1000).await.unwrap();
        assert_eq!(
            get_gnn(pool, "key1").await.unwrap().unwrap().payload,
            b"payload"
        );
        upsert_gnn(pool, "key1", b"new_payload", 2000)
            .await
            .unwrap();
        assert_eq!(
            get_gnn(pool, "key1").await.unwrap().unwrap().payload,
            b"new_payload"
        );
        clear_gnn_cache(pool).await.unwrap();
        assert!(get_gnn(pool, "key1").await.unwrap().is_none());
    }
}
