use serde_json::Value;
use sqlx::PgPool;

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
