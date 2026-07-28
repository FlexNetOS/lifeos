use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::StorageError;

/// Append one raw execution stream frame through the canonical PostgreSQL
/// procedure. The database stores the exact bytes, assigns the raw object
/// identity, and enforces tenant and sequence/offset validity.
pub async fn append_frame(
    pool: &PgPool,
    execution_id: Uuid,
    stream_name: &str,
    frame_no: i64,
    byte_offset: i64,
    frame: &[u8],
    context: Value,
) -> Result<Uuid, StorageError> {
    if execution_id.is_nil()
        || stream_name.trim().is_empty()
        || stream_name.len() > 64
        || frame_no < 0
        || byte_offset < 0
        || !context.is_object()
    {
        return Err(StorageError::InvalidLogFrame);
    }

    sqlx::query_scalar(
        "SELECT lifeos_runtime.append_log_frame($1, $2, $3, $4, $5, $6)",
    )
    .bind(execution_id)
    .bind(stream_name)
    .bind(frame_no)
    .bind(byte_offset)
    .bind(frame)
    .bind(context)
    .fetch_one(pool)
    .await
    .map_err(StorageError::from)
}
