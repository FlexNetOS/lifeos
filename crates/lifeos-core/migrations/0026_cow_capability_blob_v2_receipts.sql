-- The receipt gate must remain readable after S16 preserves the COW blob
-- objects as object_pre_s16.  It remains fail-closed for native RVF until the
-- native roundtrip task supplies and validates its separate receipt.
CREATE OR REPLACE FUNCTION lifeos_runtime.cow_branch_capability()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  self_check JSONB;
  database_receipt lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  database_receipt_valid BOOLEAN := false;
BEGIN
  self_check := lifeos_runtime.cow_semantic_self_check_v2();

  SELECT * INTO database_receipt
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = 'database-semantics'
    AND receipt.suite_version = 'lifeos.cow-db-semantic-suite.v1'
    AND receipt.accepted
  ORDER BY receipt.created_at DESC, receipt.receipt_id DESC
  LIMIT 1;

  IF FOUND THEN
    IF to_regclass('lifeos_blob.object_pre_s16') IS NOT NULL THEN
      EXECUTE $sql$
        SELECT $1 = extensions.ruvector_shake256_256(preimage.raw_bytes)
          AND $2 = extensions.ruvector_shake256_256(evidence.raw_bytes)
        FROM lifeos_blob.object_pre_s16 preimage
        JOIN lifeos_blob.object_pre_s16 evidence ON evidence.id = $4
        WHERE preimage.id = $3
      $sql$ INTO database_receipt_valid
      USING database_receipt.receipt_digest, database_receipt.evidence_digest,
            database_receipt.receipt_preimage_object_id,
            database_receipt.evidence_object_id;
    ELSE
      EXECUTE $sql$
        SELECT $1 = extensions.ruvector_shake256_256(
                 lifeos_blob.load_object_bytes(preimage.object_id))
          AND $2 = extensions.ruvector_shake256_256(
                 lifeos_blob.load_object_bytes(evidence.object_id))
        FROM lifeos_blob.object preimage
        JOIN lifeos_blob.object evidence ON evidence.object_id = $4
        WHERE preimage.object_id = $3
      $sql$ INTO database_receipt_valid
      USING database_receipt.receipt_digest, database_receipt.evidence_digest,
            database_receipt.receipt_preimage_object_id,
            database_receipt.evidence_object_id;
    END IF;
  END IF;

  RETURN self_check || jsonb_build_object(
    'acceptance_receipt_schema_version', 1,
    'database_receipt_id', database_receipt.receipt_id,
    'database_semantics_receipt', coalesce(database_receipt_valid, false),
    'implemented', false,
    'native_evidence_valid', false,
    'native_rvf_receipt_id', NULL,
    'overlay_resolution', 'overlay-nearest-ancestor-canonical-projection',
    'promotion', 'baseline-gated-database-materialized',
    'rollback', 'active-pointer-recursive-promotion-ancestry',
    'runtime_digest_binding', false,
    'rvf_roundtrip', false,
    'schema_version', 2,
    'witness_algorithm', 'SHAKE256-256',
    'witness_preimage_schema', 'lifeos.cow-preimage.v1'
  );
END
$function$;
