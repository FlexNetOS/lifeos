use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::StorageError;

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct WeaveAttempt {
    pub job_id: Uuid,
    pub attempt_id: Uuid,
    pub request: Value,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct RunnerJob {
    pub job_id: Uuid,
    pub request: Value,
}

fn valid_ids(task_id: Uuid, lease_id: Uuid, branch_id: Uuid) -> bool {
    !task_id.is_nil() && !lease_id.is_nil() && !branch_id.is_nil()
}

pub async fn submit_weave_job(
    pool: &PgPool,
    task_id: Uuid,
    lease_id: Uuid,
    branch_id: Uuid,
    request: Value,
    idempotency_key: &str,
) -> Result<Uuid, StorageError> {
    if !valid_ids(task_id, lease_id, branch_id)
        || !request.is_object()
        || idempotency_key.trim().is_empty()
    {
        return Err(StorageError::InvalidCoordinationEnvelope);
    }
    sqlx::query_scalar("SELECT lifeos_coord.submit_weave_job($1, $2, $3, $4, $5)")
        .bind(task_id)
        .bind(lease_id)
        .bind(branch_id)
        .bind(request)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

pub async fn start_weave_job(pool: &PgPool, job_id: Uuid) -> Result<WeaveAttempt, StorageError> {
    if job_id.is_nil() {
        return Err(StorageError::InvalidCoordinationEnvelope);
    }
    sqlx::query_as("SELECT * FROM lifeos_coord.start_weave_job($1)")
        .bind(job_id)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

pub async fn record_weave_attempt(
    pool: &PgPool,
    job_id: Uuid,
    attempt_id: Uuid,
    status: &str,
    result: Value,
    idempotency_key: &str,
) -> Result<Uuid, StorageError> {
    if job_id.is_nil()
        || attempt_id.is_nil()
        || !matches!(status, "succeeded" | "failed" | "cancelled")
        || !result.is_object()
        || idempotency_key.trim().is_empty()
    {
        return Err(StorageError::InvalidCoordinationEnvelope);
    }
    sqlx::query_scalar("SELECT lifeos_coord.record_weave_attempt($1, $2, $3, $4, $5)")
        .bind(job_id)
        .bind(attempt_id)
        .bind(status)
        .bind(result)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

pub async fn submit_runner_job(
    pool: &PgPool,
    task_id: Uuid,
    lease_id: Uuid,
    branch_id: Uuid,
    request: Value,
    idempotency_key: &str,
) -> Result<Uuid, StorageError> {
    if !valid_ids(task_id, lease_id, branch_id)
        || !request.is_object()
        || idempotency_key.trim().is_empty()
    {
        return Err(StorageError::InvalidCoordinationEnvelope);
    }
    sqlx::query_scalar("SELECT lifeos_coord.submit_runner_job($1, $2, $3, $4, $5)")
        .bind(task_id)
        .bind(lease_id)
        .bind(branch_id)
        .bind(request)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

pub async fn start_runner_job(pool: &PgPool, job_id: Uuid) -> Result<RunnerJob, StorageError> {
    if job_id.is_nil() {
        return Err(StorageError::InvalidCoordinationEnvelope);
    }
    sqlx::query_as("SELECT * FROM lifeos_coord.start_runner_job($1)")
        .bind(job_id)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

pub async fn record_runner_receipt(
    pool: &PgPool,
    job_id: Uuid,
    status: &str,
    result: Value,
    idempotency_key: &str,
) -> Result<Uuid, StorageError> {
    if job_id.is_nil()
        || !matches!(status, "succeeded" | "failed" | "cancelled")
        || !result.is_object()
        || idempotency_key.trim().is_empty()
    {
        return Err(StorageError::InvalidCoordinationEnvelope);
    }
    sqlx::query_scalar("SELECT lifeos_coord.record_runner_receipt($1, $2, $3, $4)")
        .bind(job_id)
        .bind(status)
        .bind(result)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}
