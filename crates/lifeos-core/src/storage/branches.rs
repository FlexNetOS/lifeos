use serde_json::Value;
use sha3::{
    digest::{ExtendableOutput, Update, XofReader},
    Shake256,
};
use sqlx::PgPool;

use super::StorageError;

/// Return the database-owned COW capability report used by health checks and
/// invariant probes. The report is derived from live tables and functions.
pub async fn capability_report(pool: &PgPool) -> Result<Value, StorageError> {
    let report = sqlx::query_scalar::<_, Value>("SELECT lifeos_runtime.cow_branch_capability()")
        .fetch_one(pool)
        .await?;
    Ok(report)
}

/// Produce the fixed-width SHAKE256-256 witness representation required by
/// the branch runtime. The caller remains responsible for constructing the
/// canonical witness preimage for its domain.
pub fn shake256_256(preimage: &[u8]) -> [u8; 32] {
    let mut hasher = Shake256::default();
    hasher.update(preimage);
    let mut reader = hasher.finalize_xof();
    let mut digest = [0_u8; 32];
    reader.read(&mut digest);
    digest
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{state, Storage};
    use serial_test::serial;
    use sqlx::{Postgres, Transaction};

    fn witness(label: &str) -> Vec<u8> {
        shake256_256(label.as_bytes()).to_vec()
    }

    async fn tenant_id(pool: &PgPool) -> String {
        sqlx::query_scalar("SELECT extensions.gen_random_uuid()::text")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn create_root(pool: &PgPool, tenant: &str, policy: Value, label: &str) -> String {
        sqlx::query_scalar(
            "SELECT lifeos_runtime.create_root_branch(
               $1::uuid, 'proposal', $2, $3, '{}'::jsonb, 'storage-test', $4
             )::text",
        )
        .bind(tenant)
        .bind(label)
        .bind(policy)
        .bind(witness(&format!("{label}:create")))
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn create_child(pool: &PgPool, parent: &str, policy: Value, label: &str) -> String {
        sqlx::query_scalar(
            "SELECT lifeos_runtime.create_branch(
               $1::uuid, 'proposal', $2, $3, '{}'::jsonb, 'storage-test', $4
             )::text",
        )
        .bind(parent)
        .bind(label)
        .bind(policy)
        .bind(witness(&format!("{label}:create")))
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn append_overlay(
        pool: &PgPool,
        branch: &str,
        key: Value,
        payload: &[u8],
        row_json: Value,
        label: &str,
    ) -> i64 {
        sqlx::query_scalar(
            "SELECT overlay_generation
             FROM lifeos_runtime.append_branch_overlay(
               $1::uuid,
               'lifeos_runtime.projection'::regclass,
               $2,
               'update',
               NULL,
               $3,
               $4,
               extensions.gen_random_uuid(),
               $5
             )",
        )
        .bind(branch)
        .bind(key)
        .bind(payload)
        .bind(row_json)
        .bind(witness(label))
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn record_gate(pool: &PgPool, branch: &str, gate: &str, passed: bool, label: &str) {
        let evidence = format!("{gate}:{passed}:{label}");
        sqlx::query_scalar::<_, String>(
            "SELECT lifeos_runtime.record_merge_gate(
               $1::uuid, $2, $3, $4, $5, $6
             )::text",
        )
        .bind(branch)
        .bind(gate)
        .bind(passed)
        .bind(evidence.as_bytes())
        .bind(witness(&format!("{label}:witness")))
        .bind(format!("{label}:idempotency"))
        .fetch_one(pool)
        .await
        .unwrap();
    }

    async fn merge(
        transaction: &mut Transaction<'_, Postgres>,
        source: &str,
        target: &str,
        label: &str,
    ) -> Value {
        sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
            .execute(&mut **transaction)
            .await
            .unwrap();
        sqlx::query_scalar(
            "SELECT lifeos_runtime.merge_branch(
               $1::uuid, $2::uuid, $3, $4
             )",
        )
        .bind(source)
        .bind(target)
        .bind(witness(&format!("{label}:witness")))
        .bind(format!("{label}:idempotency"))
        .fetch_one(&mut **transaction)
        .await
        .unwrap()
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn branch_overlay_resolution_is_snapshot_isolated_and_ordered() {
        let storage = Storage::new_for_test().await.unwrap();
        let pool = storage.pool();
        let tenant = tenant_id(pool).await;
        let root = create_root(pool, &tenant, serde_json::json!({}), "root-isolation").await;
        let repeated_root =
            create_root(pool, &tenant, serde_json::json!({}), "root-isolation").await;
        assert_eq!(repeated_root, root);
        state::write(pool, "branch-base", r#"{"value":"canonical"}"#)
            .await
            .unwrap();

        assert_eq!(
            append_overlay(
                pool,
                &root,
                serde_json::json!({"projection_key": "branch-base"}),
                br#"{"value":"root-v1"}"#,
                serde_json::json!({"value": "root-v1"}),
                "root-isolation:overlay-v1",
            )
            .await,
            1
        );
        let child = create_child(pool, &root, serde_json::json!({}), "child-isolation").await;
        assert_eq!(
            append_overlay(
                pool,
                &root,
                serde_json::json!({"projection_key": "branch-base"}),
                br#"{"value":"root-v2"}"#,
                serde_json::json!({"value": "root-v2"}),
                "root-isolation:overlay-v2",
            )
            .await,
            2
        );

        let inherited: (String, i32, i64, Value) = sqlx::query_as(
            "SELECT source_branch_id::text, source_depth, generation, row_json
             FROM lifeos_runtime.resolve_branch_overlay(
               $1::uuid,
               'lifeos_runtime.projection'::regclass,
               $2
             )",
        )
        .bind(&child)
        .bind(serde_json::json!({"projection_key": "branch-base"}))
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(inherited.0, root);
        assert_eq!(inherited.1, 1);
        assert_eq!(inherited.2, 1);
        assert_eq!(inherited.3, serde_json::json!({"value": "root-v1"}));

        assert_eq!(
            append_overlay(
                pool,
                &child,
                serde_json::json!({"projection_key": "branch-base"}),
                br#"{"value":"child-v1"}"#,
                serde_json::json!({"value": "child-v1"}),
                "child-isolation:overlay-v1",
            )
            .await,
            2
        );
        assert_eq!(
            append_overlay(
                pool,
                &child,
                serde_json::json!({"projection_key": "branch-base"}),
                br#"{"value":"child-v2"}"#,
                serde_json::json!({"value": "child-v2"}),
                "child-isolation:overlay-v2",
            )
            .await,
            3
        );
        let resolved: (String, i32, i64, Value) = sqlx::query_as(
            "SELECT source_branch_id::text, source_depth, generation, row_json
             FROM lifeos_runtime.resolve_branch_overlay(
               $1::uuid,
               'lifeos_runtime.projection'::regclass,
               $2
             )",
        )
        .bind(&child)
        .bind(serde_json::json!({"projection_key": "branch-base"}))
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(resolved.0, child);
        assert_eq!(resolved.1, 0);
        assert_eq!(resolved.2, 3);
        assert_eq!(resolved.3, serde_json::json!({"value": "child-v2"}));

        let generations: Vec<i64> = sqlx::query_scalar(
            "SELECT generation
             FROM lifeos_runtime.branch_overlay
             WHERE branch_id = $1::uuid
             ORDER BY sequence",
        )
        .bind(&child)
        .fetch_all(pool)
        .await
        .unwrap();
        assert_eq!(generations, vec![2, 3]);

        let execution: String = sqlx::query_scalar("SELECT extensions.gen_random_uuid()::text")
            .fetch_one(pool)
            .await
            .unwrap();
        let mut retried_generations = Vec::new();
        for _ in 0..2 {
            let generation: i64 = sqlx::query_scalar(
                "SELECT overlay_generation
                 FROM lifeos_runtime.append_branch_overlay(
                   $1::uuid,
                   'lifeos_runtime.projection'::regclass,
                   $2,
                   'update',
                   NULL,
                   $3,
                   $4,
                   $5::uuid,
                   $6
                 )",
            )
            .bind(&child)
            .bind(serde_json::json!({"projection_key": "idempotent"}))
            .bind(br#"{"value":"once"}"#.as_slice())
            .bind(serde_json::json!({"value": "once"}))
            .bind(&execution)
            .bind(witness("child-isolation:idempotent"))
            .fetch_one(pool)
            .await
            .unwrap();
            retried_generations.push(generation);
        }
        assert_eq!(retried_generations, vec![4, 4]);
        let idempotent_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM lifeos_runtime.branch_overlay
             WHERE branch_id = $1::uuid AND execution_id = $2::uuid",
        )
        .bind(&child)
        .bind(&execution)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(idempotent_count, 1);
        assert_eq!(
            state::read(pool, "branch-base").await.unwrap(),
            r#"{"value":"canonical"}"#
        );

        let report = capability_report(pool).await.unwrap();
        assert_eq!(report["implemented"], true);
        assert_eq!(report["table_count"], 12);
        assert_eq!(report["function_count"], 11);
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn gates_control_promotion_and_rollback_restores_exact_snapshot() {
        let storage = Storage::new_for_test().await.unwrap();
        let pool = storage.pool();
        let tenant = tenant_id(pool).await;
        let policy = serde_json::json!({"required_gates": ["build", "test"]});
        let candidate = create_root(pool, &tenant, policy, "candidate").await;

        let premature = sqlx::query_scalar::<_, String>(
            "SELECT lifeos_runtime.promote_branch(
               $1::uuid, 'active', $2::uuid, $3, $4, 'premature'
             )::text",
        )
        .bind(&tenant)
        .bind(&candidate)
        .bind(b"snapshot-premature".as_slice())
        .bind(witness("candidate:premature"))
        .fetch_one(pool)
        .await;
        assert!(premature.is_err());

        record_gate(pool, &candidate, "build", true, "candidate:g0:build").await;
        record_gate(pool, &candidate, "build", true, "candidate:g0:build").await;
        record_gate(pool, &candidate, "test", true, "candidate:g0:test").await;
        let first_promotion: String = sqlx::query_scalar(
            "SELECT lifeos_runtime.promote_branch(
               $1::uuid, 'active', $2::uuid, $3, $4, 'candidate-promote-v1'
             )::text",
        )
        .bind(&tenant)
        .bind(&candidate)
        .bind(b"snapshot-v1".as_slice())
        .bind(witness("candidate:promote-v1"))
        .fetch_one(pool)
        .await
        .unwrap();
        let repeated_first_promotion: String = sqlx::query_scalar(
            "SELECT lifeos_runtime.promote_branch(
               $1::uuid, 'active', $2::uuid, $3, $4, 'candidate-promote-v1'
             )::text",
        )
        .bind(&tenant)
        .bind(&candidate)
        .bind(b"snapshot-v1".as_slice())
        .bind(witness("candidate:promote-v1"))
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(repeated_first_promotion, first_promotion);

        append_overlay(
            pool,
            &candidate,
            serde_json::json!({"projection_key": "candidate"}),
            br#"{"version":2}"#,
            serde_json::json!({"version": 2}),
            "candidate:overlay-v2",
        )
        .await;
        let stale_gates = sqlx::query_scalar::<_, String>(
            "SELECT lifeos_runtime.promote_branch(
               $1::uuid, 'active', $2::uuid, $3, $4, 'stale-gates'
             )::text",
        )
        .bind(&tenant)
        .bind(&candidate)
        .bind(b"snapshot-stale".as_slice())
        .bind(witness("candidate:stale-gates"))
        .fetch_one(pool)
        .await;
        assert!(stale_gates.is_err());

        record_gate(pool, &candidate, "build", true, "candidate:g1:build").await;
        record_gate(pool, &candidate, "test", true, "candidate:g1:test").await;
        let second_promotion: String = sqlx::query_scalar(
            "SELECT lifeos_runtime.promote_branch(
               $1::uuid, 'active', $2::uuid, $3, $4, 'candidate-promote-v2'
             )::text",
        )
        .bind(&tenant)
        .bind(&candidate)
        .bind(b"snapshot-v2".as_slice())
        .bind(witness("candidate:promote-v2"))
        .fetch_one(pool)
        .await
        .unwrap();
        assert_ne!(first_promotion, second_promotion);

        let rollback_promotion: String = sqlx::query_scalar(
            "SELECT lifeos_runtime.rollback_branch(
               $1::uuid, 'active', $2::uuid, $3, 'candidate-rollback-v1'
             )::text",
        )
        .bind(&tenant)
        .bind(&first_promotion)
        .bind(witness("candidate:rollback-v1"))
        .fetch_one(pool)
        .await
        .unwrap();
        let repeated_rollback: String = sqlx::query_scalar(
            "SELECT lifeos_runtime.rollback_branch(
               $1::uuid, 'active', $2::uuid, $3, 'candidate-rollback-v1'
             )::text",
        )
        .bind(&tenant)
        .bind(&first_promotion)
        .bind(witness("candidate:rollback-v1"))
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(repeated_rollback, rollback_promotion);
        let restored: (i64, Vec<u8>, String) = sqlx::query_as(
            "SELECT generation, snapshot_bytes, promotion_id::text
             FROM lifeos_runtime.active_branch_snapshot($1::uuid, 'active')",
        )
        .bind(&tenant)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(restored.0, 0);
        assert_eq!(restored.1, b"snapshot-v1");
        assert_ne!(restored.2, first_promotion);

        let mutation = sqlx::query(
            "UPDATE lifeos_runtime.merge_gate SET passed = false
             WHERE branch_id = $1::uuid",
        )
        .bind(&candidate)
        .execute(pool)
        .await;
        assert!(mutation.is_err());
    }

    #[tokio::test]
    #[serial(lifeos_postgres)]
    async fn merge_conflicts_are_witnessed_and_rvf_membership_round_trips() {
        let storage = Storage::new_for_test().await.unwrap();
        let pool = storage.pool();
        let tenant = tenant_id(pool).await;
        let root = create_root(pool, &tenant, serde_json::json!({}), "merge-root").await;
        let source = create_child(pool, &root, serde_json::json!({}), "merge-source").await;
        let collision_key = serde_json::json!({"projection_key": "collision"});

        append_overlay(
            pool,
            &root,
            collision_key.clone(),
            br#"{"owner":"root"}"#,
            serde_json::json!({"owner": "root"}),
            "merge-root:collision",
        )
        .await;
        append_overlay(
            pool,
            &source,
            collision_key,
            br#"{"owner":"source"}"#,
            serde_json::json!({"owner": "source"}),
            "merge-source:collision",
        )
        .await;

        let mut conflict_tx = pool.begin().await.unwrap();
        let conflict_result = merge(&mut conflict_tx, &source, &root, "merge-conflict").await;
        conflict_tx.commit().await.unwrap();
        assert_eq!(conflict_result["merged"], false);
        assert_eq!(conflict_result["conflict_count"], 1);
        let mut repeated_conflict_tx = pool.begin().await.unwrap();
        let repeated_conflict =
            merge(&mut repeated_conflict_tx, &source, &root, "merge-conflict").await;
        repeated_conflict_tx.commit().await.unwrap();
        assert_eq!(
            repeated_conflict["merge_event_id"],
            conflict_result["merge_event_id"]
        );
        let conflicts: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM lifeos_runtime.merge_conflict
             WHERE source_branch_id = $1::uuid",
        )
        .bind(&source)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(conflicts, 1);
        let conflict_witnesses: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM lifeos_agent.branch_witness
             WHERE branch_id = $1::uuid AND witness_kind = 'merge-conflict'",
        )
        .bind(&root)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(conflict_witnesses, 1);

        let root_container: String = sqlx::query_scalar(
            "SELECT lifeos_rvf.mirror_branch_membership(
               $1::uuid, NULL::uuid, $2, $3, $4
             )::text",
        )
        .bind(&root)
        .bind(b"rvf-root".as_slice())
        .bind(b"range-root".as_slice())
        .bind(witness("merge-root:rvf"))
        .fetch_one(pool)
        .await
        .unwrap();
        let source_container: String = sqlx::query_scalar(
            "SELECT lifeos_rvf.mirror_branch_membership(
               $1::uuid, $2::uuid, $3, $4, $5
             )::text",
        )
        .bind(&source)
        .bind(&root_container)
        .bind(b"rvf-source".as_slice())
        .bind(b"range-source".as_slice())
        .bind(witness("merge-source:rvf"))
        .fetch_one(pool)
        .await
        .unwrap();
        let repeated_source_container: String = sqlx::query_scalar(
            "SELECT lifeos_rvf.mirror_branch_membership(
               $1::uuid, $2::uuid, $3, $4, $5
             )::text",
        )
        .bind(&source)
        .bind(&root_container)
        .bind(b"rvf-source".as_slice())
        .bind(b"range-source".as_slice())
        .bind(witness("merge-source:rvf"))
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(repeated_source_container, source_container);
        let roundtrip: (bool, i64, i64) = sqlx::query_as(
            "SELECT verified, overlay_count, membership_count
             FROM lifeos_rvf.branch_roundtrip_receipt
             WHERE container_id = $1::uuid",
        )
        .bind(&source_container)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(roundtrip, (true, 1, 1));
        let cow_maps: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM lifeos_rvf.cow_map
             WHERE child_container_id = $1::uuid
               AND parent_container_id = $2::uuid",
        )
        .bind(&source_container)
        .bind(&root_container)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(cow_maps, 1);

        let clean = create_child(pool, &root, serde_json::json!({}), "merge-clean").await;
        let clean_key = serde_json::json!({"projection_key": "clean"});
        append_overlay(
            pool,
            &clean,
            clean_key.clone(),
            br#"{"owner":"clean"}"#,
            serde_json::json!({"owner": "clean"}),
            "merge-clean:overlay",
        )
        .await;
        let mut clean_tx = pool.begin().await.unwrap();
        let clean_result = merge(&mut clean_tx, &clean, &root, "merge-clean").await;
        clean_tx.commit().await.unwrap();
        assert_eq!(clean_result["merged"], true);
        assert_eq!(clean_result["overlay_count"], 1);
        let root_head_after_merge: i64 = sqlx::query_scalar(
            "SELECT head_generation FROM lifeos_runtime.branch
             WHERE branch_id = $1::uuid",
        )
        .bind(&root)
        .fetch_one(pool)
        .await
        .unwrap();
        let mut repeated_clean_tx = pool.begin().await.unwrap();
        let repeated_clean = merge(&mut repeated_clean_tx, &clean, &root, "merge-clean").await;
        repeated_clean_tx.commit().await.unwrap();
        assert_eq!(
            repeated_clean["merge_event_id"],
            clean_result["merge_event_id"]
        );
        let root_head_after_retry: i64 = sqlx::query_scalar(
            "SELECT head_generation FROM lifeos_runtime.branch
             WHERE branch_id = $1::uuid",
        )
        .bind(&root)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(root_head_after_retry, root_head_after_merge);
        let merged: (String, Value) = sqlx::query_as(
            "SELECT source_branch_id::text, row_json
             FROM lifeos_runtime.resolve_branch_overlay(
               $1::uuid,
               'lifeos_runtime.projection'::regclass,
               $2
             )",
        )
        .bind(&root)
        .bind(clean_key)
        .fetch_one(pool)
        .await
        .unwrap();
        assert_eq!(merged.0, root);
        assert_eq!(merged.1, serde_json::json!({"owner": "clean"}));
    }
}
