use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::StorageError;

/// The database-issued lease returned to a worker. The capability token is
/// intentionally not serializable: it remains inside the worker boundary and
/// never crosses the Tauri/UI surface.
#[derive(Debug, sqlx::FromRow)]
pub struct TaskClaim {
    pub leased_task_id: Uuid,
    pub leased_lease_id: Uuid,
    pub leased_payload_object_id: Uuid,
    pub leased_branch_id: Uuid,
    pub leased_capability_token: Vec<u8>,
}

/// Claim the highest-priority tenant-scoped task whose requirements are met.
/// PostgreSQL issues the lease and capability token; Rust only transports the
/// opaque result to the worker that is already bound by envctl.
pub async fn claim(
    pool: &PgPool,
    worker: Uuid,
    capabilities: Value,
    lease_interval: &str,
) -> Result<Option<TaskClaim>, StorageError> {
    if worker.is_nil()
        || !capabilities.is_object()
        || lease_interval.trim().is_empty()
        || lease_interval.len() > 64
    {
        return Err(StorageError::InvalidTaskExecution);
    }

    sqlx::query_as::<_, TaskClaim>("SELECT * FROM lifeos_runtime.claim_task($1, $2, $3::interval)")
        .bind(worker)
        .bind(capabilities)
        .bind(lease_interval)
        .fetch_optional(pool)
        .await
        .map_err(StorageError::from)
}

/// Complete a running execution through the canonical database procedure.
/// The database verifies the active lease, tenant binding, raw-byte objects,
/// effects, and witness chain before recording the completion.
pub async fn complete(
    pool: &PgPool,
    execution_id: Uuid,
    result_objects: Value,
    effects: Value,
    witness: Value,
) -> Result<Uuid, StorageError> {
    if execution_id.is_nil()
        || !result_objects.is_array()
        || result_objects
            .as_array()
            .map_or(true, |items| items.is_empty())
        || !effects.is_array()
        || !witness.is_object()
    {
        return Err(StorageError::InvalidTaskExecution);
    }

    sqlx::query_scalar("SELECT lifeos_runtime.complete_execution($1, $2, $3, $4)")
        .bind(execution_id)
        .bind(result_objects)
        .bind(effects)
        .bind(witness)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}
