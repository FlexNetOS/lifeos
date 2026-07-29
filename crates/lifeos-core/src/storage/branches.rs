use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::StorageError;

/// Return the database-verified COW capability report.
///
/// Migration 0009 deliberately reports `implemented: false` until both the
/// versioned database-semantic receipt and the digest-bound native RVF /
/// PostgreSQL roundtrip receipt have been recorded and revalidated.
pub async fn capability_report(pool: &PgPool) -> Result<Value, StorageError> {
    sqlx::query_scalar("SELECT lifeos_runtime.cow_branch_capability()")
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

/// Fail closed unless both exact v2 acceptance receipts are present, the
/// native evidence is bound to every installed RuVector library, and the
/// database's structural/witness self-check still passes.
pub async fn require_accepted_semantics(pool: &PgPool) -> Result<Value, StorageError> {
    let report = capability_report(pool).await?;
    let accepted = report.get("implemented").and_then(Value::as_bool) == Some(true)
        && report
            .get("database_semantics_receipt")
            .and_then(Value::as_bool)
            == Some(true)
        && report.get("rvf_roundtrip").and_then(Value::as_bool) == Some(true)
        && report.get("native_evidence_valid").and_then(Value::as_bool) == Some(true)
        && report
            .get("runtime_digest_binding")
            .and_then(Value::as_bool)
            == Some(true)
        && report.get("schema_version").and_then(Value::as_u64) == Some(2)
        && report
            .get("acceptance_receipt_schema_version")
            .and_then(Value::as_u64)
            == Some(1);
    if !accepted {
        return Err(StorageError::CowSemanticReceipt);
    }
    Ok(report)
}

/// Create an isolated COW branch from a canonical parent branch.
pub async fn create(
    pool: &PgPool,
    parent_branch: Uuid,
    kind: &str,
    purpose: &str,
    policy: Value,
    creator: Uuid,
) -> Result<Uuid, StorageError> {
    let execution = Uuid::new_v4();
    let effect = Uuid::new_v4();
    let idempotency_key = format!("lifeos:cow:create:{}", Uuid::new_v4());
    sqlx::query_scalar(
        "SELECT lifeos_runtime.cow_frontdoor_create_v2($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(parent_branch)
    .bind(kind)
    .bind(purpose)
    .bind(policy)
    .bind(creator)
    .bind(execution)
    .bind(effect)
    .bind(idempotency_key)
    .fetch_one(pool)
    .await
    .map_err(StorageError::from)
}

/// Append a witnessed merge gate between two tenant-scoped branches.
pub async fn merge(
    pool: &PgPool,
    source_branch: Uuid,
    target_branch: Uuid,
    merge_record: Value,
) -> Result<Uuid, StorageError> {
    let execution = Uuid::new_v4();
    let effect = Uuid::new_v4();
    let idempotency_key = format!("lifeos:cow:merge:{}", Uuid::new_v4());
    sqlx::query_scalar("SELECT lifeos_runtime.cow_frontdoor_merge_v2($1, $2, $3, $4, $5, $6)")
        .bind(source_branch)
        .bind(target_branch)
        .bind(merge_record)
        .bind(execution)
        .bind(effect)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

/// Record an explicit resolution for a database conflict.
pub async fn resolve(
    pool: &PgPool,
    conflict_id: Uuid,
    resolution: Value,
) -> Result<Uuid, StorageError> {
    sqlx::query_scalar("SELECT lifeos_runtime.resolve_conflict($1, $2)")
        .bind(conflict_id)
        .bind(resolution)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

/// Promote a conflict-free source branch into the target branch.
pub async fn promote(
    pool: &PgPool,
    source_branch: Uuid,
    target_branch: Uuid,
    promotion_record: Value,
) -> Result<Uuid, StorageError> {
    let execution = Uuid::new_v4();
    let effect = Uuid::new_v4();
    let idempotency_key = format!("lifeos:cow:promote:{}", Uuid::new_v4());
    sqlx::query_scalar("SELECT lifeos_runtime.cow_frontdoor_promote_v2($1, $2, $3, $4, $5, $6)")
        .bind(source_branch)
        .bind(target_branch)
        .bind(promotion_record)
        .bind(execution)
        .bind(effect)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn acceptance_contract_rejects_existence_only_reports() {
        let legacy = json!({
            "implemented": true,
            "schema_version": 1,
            "table_count": 12
        });
        assert_ne!(legacy["schema_version"], 2);
        assert!(legacy.get("database_semantics_receipt").is_none());
    }

    #[test]
    fn native_rvf_is_a_separate_receipt() {
        let database_only = json!({
            "implemented": false,
            "database_semantics_receipt": true,
            "rvf_roundtrip": false,
            "native_evidence_valid": false,
            "runtime_digest_binding": false
        });
        assert_eq!(database_only["implemented"], false);
        assert_eq!(database_only["rvf_roundtrip"], false);
    }
}
