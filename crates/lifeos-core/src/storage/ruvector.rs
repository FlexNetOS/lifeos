use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::StorageError;

/// A row from `ruvector_vectors`.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VectorRow {
    pub id: String,
    pub collection: String,
    pub dim: i64,
    pub vector: Vec<u8>,
    pub metadata_json: Option<String>,
    pub last_synced_at: i64,
}

/// A row from `ruvector_gnn_cache`.
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
///
/// Returns `StorageError::InvalidVectorBytes` when the slice length is not a
/// multiple of 4.
pub fn decode_vector(b: &[u8]) -> Result<Vec<f32>, StorageError> {
    if b.len() % 4 != 0 {
        return Err(StorageError::InvalidVectorBytes);
    }
    Ok(b.chunks_exact(4)
        .map(|c| f32::from_le_bytes(c.try_into().unwrap()))
        .collect())
}

pub async fn upsert_vector(
    pool: &SqlitePool,
    id: &str,
    collection: &str,
    dim: i64,
    vector_bytes: &[u8],
    metadata_json: Option<&str>,
    last_synced_at: i64,
) -> Result<(), StorageError> {
    // Belt-and-braces Rust-side guard before hitting the DB CHECK constraint.
    if vector_bytes.len() as i64 != dim * 4 {
        return Err(StorageError::VectorLengthMismatch);
    }

    sqlx::query(
        "INSERT INTO ruvector_vectors (id, collection, dim, vector, metadata_json, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           collection = excluded.collection,
           dim = excluded.dim,
           vector = excluded.vector,
           metadata_json = excluded.metadata_json,
           last_synced_at = excluded.last_synced_at",
    )
    .bind(id)
    .bind(collection)
    .bind(dim)
    .bind(vector_bytes)
    .bind(metadata_json)
    .bind(last_synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_vector(pool: &SqlitePool, id: &str) -> Result<Option<VectorRow>, StorageError> {
    let row = sqlx::query_as::<_, VectorRow>(
        "SELECT id, collection, dim, vector, metadata_json, last_synced_at
         FROM ruvector_vectors WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_by_collection(
    pool: &SqlitePool,
    collection: &str,
) -> Result<Vec<VectorRow>, StorageError> {
    let rows = sqlx::query_as::<_, VectorRow>(
        "SELECT id, collection, dim, vector, metadata_json, last_synced_at
         FROM ruvector_vectors WHERE collection = ?",
    )
    .bind(collection)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn upsert_gnn(
    pool: &SqlitePool,
    cache_key: &str,
    payload: &[u8],
    computed_at: i64,
) -> Result<(), StorageError> {
    sqlx::query(
        "INSERT INTO ruvector_gnn_cache (cache_key, payload, computed_at)
         VALUES (?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           payload = excluded.payload,
           computed_at = excluded.computed_at",
    )
    .bind(cache_key)
    .bind(payload)
    .bind(computed_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_gnn(
    pool: &SqlitePool,
    cache_key: &str,
) -> Result<Option<GnnCacheRow>, StorageError> {
    let row = sqlx::query_as::<_, GnnCacheRow>(
        "SELECT cache_key, payload, computed_at FROM ruvector_gnn_cache WHERE cache_key = ?",
    )
    .bind(cache_key)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn clear_collection(pool: &SqlitePool, name: &str) -> Result<(), StorageError> {
    sqlx::query("DELETE FROM ruvector_vectors WHERE collection = ?")
        .bind(name)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn clear_gnn_cache(pool: &SqlitePool) -> Result<(), StorageError> {
    sqlx::query("DELETE FROM ruvector_gnn_cache")
        .execute(pool)
        .await?;
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
    async fn vector_roundtrip() {
        let s = setup().await;
        let pool = s.pool();

        // Hand-rolled property loop covering special f32 values.
        let cases: &[&[f32]] = &[
            &[1.0, 2.0, 3.0],
            &[f32::NAN, f32::INFINITY, f32::NEG_INFINITY],
            &[f32::MIN_POSITIVE, f32::MAX, -0.0_f32, 0.0_f32],
            &[f32::from_bits(0x0000_0001)], // smallest positive subnormal
        ];

        for (i, &floats) in cases.iter().enumerate() {
            let encoded = encode_vector(floats);
            let decoded = decode_vector(&encoded).unwrap();
            assert_eq!(floats.len(), decoded.len());
            // Bit-for-bit equality (NaN-safe).
            for (a, b) in floats.iter().zip(&decoded) {
                assert_eq!(a.to_bits(), b.to_bits(), "case {i}: bit mismatch");
            }

            // Round-trip through DB.
            let id = format!("v{i}");
            let dim = floats.len() as i64;
            upsert_vector(pool, &id, "test", dim, &encoded, None, 0)
                .await
                .unwrap();
            let row = get_vector(pool, &id).await.unwrap().unwrap();
            let back = decode_vector(&row.vector).unwrap();
            for (a, b) in floats.iter().zip(&back) {
                assert_eq!(a.to_bits(), b.to_bits(), "db round-trip case {i}");
            }
        }
    }

    #[tokio::test]
    async fn check_constraints() {
        let s = setup().await;
        let pool = s.pool();

        // Rust-side guard: mismatch between declared dim and byte length.
        let three_floats = encode_vector(&[1.0, 2.0, 3.0]);
        let err = upsert_vector(pool, "bad", "test", 4, &three_floats, None, 0)
            .await
            .unwrap_err();
        assert!(matches!(err, StorageError::VectorLengthMismatch));

        // Raw sqlx: dim = 0 rejected by CHECK constraint.
        let raw_err = sqlx::query(
            "INSERT INTO ruvector_vectors (id, collection, dim, vector, last_synced_at)
             VALUES ('x', 'c', 0, X'', 0)",
        )
        .execute(pool)
        .await;
        assert!(raw_err.is_err(), "dim=0 should violate CHECK constraint");

        // decode_vector: odd byte length.
        let err = decode_vector(&[0u8, 1u8, 2u8]).unwrap_err();
        assert!(matches!(err, StorageError::InvalidVectorBytes));
    }

    #[tokio::test]
    async fn gnn_cache_roundtrip() {
        let s = setup().await;
        let pool = s.pool();

        upsert_gnn(pool, "key1", b"payload", 1000).await.unwrap();
        let row = get_gnn(pool, "key1").await.unwrap().unwrap();
        assert_eq!(row.payload, b"payload");
        assert_eq!(row.computed_at, 1000);

        // Upsert overwrites.
        upsert_gnn(pool, "key1", b"new_payload", 2000).await.unwrap();
        let row = get_gnn(pool, "key1").await.unwrap().unwrap();
        assert_eq!(row.payload, b"new_payload");

        clear_gnn_cache(pool).await.unwrap();
        let row = get_gnn(pool, "key1").await.unwrap();
        assert!(row.is_none());
    }
}
