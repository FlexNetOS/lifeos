use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::StorageError;

/// A database-issued network-control request. The executor receives this only
/// after `start_network_plan` has atomically moved it out of `queued`.
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct NetworkPlan {
    pub plan_id: Uuid,
    pub tenant_id: Uuid,
    pub operation: String,
    pub request: Value,
    pub rollback_request: Value,
}

/// Submit a netctl argv request under the active envctl task binding. The
/// database checks the grant, task, branch, and unexpired lease; Rust only
/// forwards the validated envelope and never writes the tables directly.
pub async fn submit_plan(
    pool: &PgPool,
    task_id: Uuid,
    lease_id: Uuid,
    branch_id: Uuid,
    request: Value,
    rollback_request: Value,
    idempotency_key: &str,
) -> Result<Uuid, StorageError> {
    if task_id.is_nil()
        || lease_id.is_nil()
        || branch_id.is_nil()
        || !request.is_object()
        || !rollback_request.is_object()
        || request.get("argv").and_then(Value::as_array).is_none()
        || rollback_request
            .get("argv")
            .and_then(Value::as_array)
            .is_none()
        || idempotency_key.trim().is_empty()
    {
        return Err(StorageError::InvalidNetworkPlan);
    }

    sqlx::query_scalar("SELECT lifeos_coord.submit_network_plan($1, $2, $3, 'netctl', $4, $5, $6)")
        .bind(task_id)
        .bind(lease_id)
        .bind(branch_id)
        .bind(request)
        .bind(rollback_request)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

/// Claim one queued plan for the external network-control executor.
pub async fn start_plan(pool: &PgPool, plan_id: Uuid) -> Result<NetworkPlan, StorageError> {
    if plan_id.is_nil() {
        return Err(StorageError::InvalidNetworkPlan);
    }

    sqlx::query_as("SELECT * FROM lifeos_coord.start_network_plan($1)")
        .bind(plan_id)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

/// Record the complete netctl result and optional rollback result, then close
/// the durable plan. Raw JSON is retained by the database procedure.
pub async fn record_effect(
    pool: &PgPool,
    plan_id: Uuid,
    status: &str,
    exit_code: Option<i32>,
    effect: Value,
    rollback_effect: Option<Value>,
    idempotency_key: &str,
) -> Result<Uuid, StorageError> {
    if plan_id.is_nil()
        || !matches!(status, "succeeded" | "failed" | "rolled_back")
        || !effect.is_object()
        || rollback_effect
            .as_ref()
            .is_some_and(|value| !value.is_object())
        || idempotency_key.trim().is_empty()
    {
        return Err(StorageError::InvalidNetworkPlan);
    }

    sqlx::query_scalar("SELECT lifeos_coord.record_network_effect($1, $2, $3, $4, $5, $6)")
        .bind(plan_id)
        .bind(status)
        .bind(exit_code)
        .bind(effect)
        .bind(rollback_effect)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}
