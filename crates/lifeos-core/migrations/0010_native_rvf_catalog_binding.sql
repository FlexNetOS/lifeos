-- Keep the native acceptance gate within one loaded RuVector library.
--
-- The live catalog has the SHAKE256 primitive and the remaining extension
-- functions bound to two separately installed copies of RuVector. Calling a
-- function from each copy in one backend re-registers the same GUCs. Validate
-- the SQL extension version from pg_extension instead; the acceptance verifier
-- probes the native library version in a separate backend and hashes both
-- catalog-bound libraries.

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
  native_receipt lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  database_receipt_valid BOOLEAN := false;
  native_receipt_content_valid BOOLEAN := false;
  native_evidence_valid BOOLEAN := false;
  runtime_digest_binding BOOLEAN := false;
  native_evidence JSONB;
  native_evidence_bytes BYTEA;
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
    SELECT
      database_receipt.receipt_digest
        = extensions.ruvector_shake256_256(preimage.raw_bytes)
      AND database_receipt.evidence_digest
        = extensions.ruvector_shake256_256(evidence.raw_bytes)
    INTO database_receipt_valid
    FROM lifeos_blob.object preimage
    JOIN lifeos_blob.object evidence
      ON evidence.id = database_receipt.evidence_object_id
    WHERE preimage.id = database_receipt.receipt_preimage_object_id;
  END IF;

  SELECT * INTO native_receipt
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = 'native-rvf-roundtrip'
    AND receipt.suite_version = 'lifeos.native-rvf-postgres-roundtrip.v1'
    AND receipt.accepted
  ORDER BY receipt.created_at DESC, receipt.receipt_id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT
      native_receipt.receipt_digest
        = extensions.ruvector_shake256_256(preimage.raw_bytes)
      AND native_receipt.evidence_digest
        = extensions.ruvector_shake256_256(evidence.raw_bytes),
      evidence.raw_bytes
    INTO native_receipt_content_valid, native_evidence_bytes
    FROM lifeos_blob.object preimage
    JOIN lifeos_blob.object evidence
      ON evidence.id = native_receipt.evidence_object_id
    WHERE preimage.id = native_receipt.receipt_preimage_object_id;
  END IF;

  IF coalesce(native_receipt_content_valid, false)
     AND native_evidence_bytes IS NOT NULL THEN
    BEGIN
      native_evidence := convert_from(native_evidence_bytes, 'UTF8')::jsonb;
      SELECT
        native_evidence->>'schema'
          = 'lifeos.native-rvf-postgres-roundtrip.v1'
        AND native_evidence->>'status' = 'passed'
        AND native_evidence->>'suite_version'
          = 'lifeos.native-rvf-postgres-roundtrip.v1'
        AND native_evidence#>>'{database_semantics,suite_version}'
          = 'lifeos.cow-db-semantic-suite.v1'
        AND native_evidence#>>'{database_semantics,receipt_digest}'
          = encode(database_receipt.receipt_digest, 'hex')
        AND native_evidence#>>'{database_semantics,artifact_sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{native_binary,sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{native_binary,rvf_runtime_source_sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{native_binary,ruvector_postgres_source_sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{installed_extension,version}'
          ~ '^[0-9]+[.][0-9]+[.][0-9]+$'
        AND native_evidence#>>'{installed_extension,catalog_version}'
          = (
            SELECT extension.extversion
            FROM pg_extension extension
            WHERE extension.extname = 'ruvector'
          )
        AND native_evidence#>>'{verification,adversarial_suite}'
          = 'passed'
        AND native_evidence#>>'{verification,native_close_reopen}'
          = 'passed'
        AND native_evidence#>>'{verification,postgres_roundtrip}'
          = 'passed'
        AND native_evidence#>>'{verification,fresh_bootstrap}'
          = 'passed'
        AND native_evidence#>>'{verification,upgrade_migration}'
          = 'passed'
        AND native_evidence#>>'{verification,least_privilege_rls}'
          = 'passed'
        AND native_evidence#>>'{verification,witness_chain}'
          = 'passed'
      INTO native_evidence_valid;

      SELECT
        jsonb_typeof(native_evidence->'installed_libraries') = 'array'
        AND jsonb_array_length(native_evidence->'installed_libraries') > 0
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            native_evidence->'installed_libraries'
          ) library
          WHERE coalesce(library->>'catalog_binding', '') = ''
             OR coalesce(library->>'path', '') = ''
             OR coalesce(library->>'sha256', '')
                  !~ '^[0-9a-f]{64}$'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT DISTINCT procedure.probin AS catalog_binding
            FROM pg_proc procedure
            JOIN pg_language language
              ON language.oid = procedure.prolang
            JOIN pg_depend dependency
              ON dependency.classid = 'pg_proc'::regclass
             AND dependency.objid = procedure.oid
             AND dependency.refclassid = 'pg_extension'::regclass
             AND dependency.deptype = 'e'
            JOIN pg_extension extension
              ON extension.oid = dependency.refobjid
            WHERE extension.extname = 'ruvector'
              AND language.lanname = 'c'
          ) live_library
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              native_evidence->'installed_libraries'
            ) evidence_library
            WHERE evidence_library->>'catalog_binding'
              = live_library.catalog_binding
          )
        )
      INTO runtime_digest_binding;
    EXCEPTION
      WHEN OTHERS THEN
        native_evidence_valid := false;
        runtime_digest_binding := false;
    END;
  END IF;

  RETURN self_check || jsonb_build_object(
    'acceptance_receipt_schema_version', 1,
    'database_receipt_id', database_receipt.receipt_id,
    'database_semantics_receipt', coalesce(database_receipt_valid, false),
    'implemented',
      (self_check->>'ready')::boolean
      AND coalesce(database_receipt_valid, false)
      AND coalesce(native_receipt_content_valid, false)
      AND coalesce(native_evidence_valid, false)
      AND coalesce(runtime_digest_binding, false),
    'native_evidence_valid', coalesce(native_evidence_valid, false),
    'native_rvf_receipt_id', native_receipt.receipt_id,
    'overlay_resolution', 'overlay-nearest-ancestor-canonical-projection',
    'promotion', 'baseline-gated-database-materialized',
    'rollback', 'active-pointer-recursive-promotion-ancestry',
    'runtime_digest_binding', coalesce(runtime_digest_binding, false),
    'rvf_roundtrip',
      coalesce(native_receipt_content_valid, false)
      AND coalesce(native_evidence_valid, false),
    'schema_version', 2,
    'witness_algorithm', 'SHAKE256-256',
    'witness_preimage_schema', 'lifeos.cow-preimage.v1'
  );
END
$function$;
