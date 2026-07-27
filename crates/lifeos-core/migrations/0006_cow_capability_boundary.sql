-- Keep application-owned introspection in the application schema. The
-- installation-owner bootstrap retains a single immutable-packet compatibility
-- wrapper in `extensions`, without granting schema CREATE to the runtime role.
CREATE OR REPLACE FUNCTION lifeos_runtime.cow_branch_capability()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  WITH required_tables(name) AS (
    VALUES
      ('lifeos_runtime.branch'),
      ('lifeos_runtime.branch_overlay'),
      ('lifeos_agent.branch_witness'),
      ('lifeos_runtime.merge_gate'),
      ('lifeos_runtime.merge_conflict'),
      ('lifeos_runtime.merge_conflict_resolution'),
      ('lifeos_runtime.promotion'),
      ('lifeos_runtime.branch_pointer'),
      ('lifeos_rvf.container'),
      ('lifeos_rvf.cow_map'),
      ('lifeos_rvf.membership'),
      ('lifeos_rvf.branch_roundtrip_receipt')
  ),
  required_functions(schema_name, function_name) AS (
    VALUES
      ('lifeos_runtime', 'create_root_branch'),
      ('lifeos_runtime', 'create_branch'),
      ('lifeos_runtime', 'append_branch_overlay'),
      ('lifeos_runtime', 'resolve_branch_overlay'),
      ('lifeos_runtime', 'resolve_branch_membership'),
      ('lifeos_runtime', 'record_merge_gate'),
      ('lifeos_runtime', 'merge_branch'),
      ('lifeos_runtime', 'promote_branch'),
      ('lifeos_runtime', 'rollback_branch'),
      ('lifeos_runtime', 'active_branch_snapshot'),
      ('lifeos_rvf', 'mirror_branch_membership')
  ),
  counts AS (
    SELECT
      (SELECT count(*) FROM required_tables
       WHERE to_regclass(name) IS NOT NULL) AS table_count,
      (SELECT count(*)
       FROM required_functions required
       WHERE EXISTS (
         SELECT 1
         FROM pg_proc procedure
         JOIN pg_namespace namespace
           ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = required.schema_name
           AND procedure.proname = required.function_name
       )) AS function_count
  )
  SELECT jsonb_build_object(
    'schema_version', 1,
    'implemented', table_count = 12 AND function_count = 11,
    'table_count', table_count,
    'required_table_count', 12,
    'function_count', function_count,
    'required_function_count', 11,
    'witness_algorithm', 'SHAKE256-256',
    'overlay_resolution', 'branch-nearest-ancestor-canonical-fallback',
    'promotion', 'gate-and-conflict-checked',
    'rollback', 'exact-content-addressed-snapshot',
    'rvf_roundtrip', true
  )
  FROM counts
$function$;

CREATE OR REPLACE FUNCTION extensions.lifeos_cow_branch_capability()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT lifeos_runtime.cow_branch_capability()
$function$;

GRANT EXECUTE ON FUNCTION lifeos_runtime.cow_branch_capability() TO PUBLIC;
GRANT EXECUTE ON FUNCTION extensions.lifeos_cow_branch_capability() TO PUBLIC;

SELECT extensions.finalize_lifeos_cow_migration();
