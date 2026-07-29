-- Close the final default-PUBLIC helper privilege without changing the
-- checksum-pinned 0007 migration or its accepted semantic behavior.
REVOKE ALL ON FUNCTION lifeos_runtime.resolved_branch_members_v2(UUID, BIGINT)
  FROM PUBLIC;

ALTER FUNCTION lifeos_runtime.cow_semantic_self_check_v2()
  RENAME TO cow_semantic_self_check_v2_base;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_semantic_self_check_v2()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime
AS $function$
DECLARE
  base_report JSONB;
  public_security_definer_count INTEGER;
BEGIN
  base_report := lifeos_runtime.cow_semantic_self_check_v2_base();
  SELECT count(*) INTO public_security_definer_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE procedure.prosecdef
    AND namespace.nspname IN ('lifeos_runtime', 'lifeos_agent', 'lifeos_rvf')
    AND procedure.oid
      <> 'lifeos_runtime.cow_branch_capability()'::regprocedure
    AND (
      procedure.proacl IS NULL
      OR aclcontains(
        procedure.proacl,
        makeaclitem(0, procedure.proowner, 'EXECUTE', false)
      )
    );
  RETURN base_report || jsonb_build_object(
    'public_security_definer_count', public_security_definer_count,
    'ready',
      (base_report->>'ready')::boolean
      AND public_security_definer_count = 0
  );
END
$function$;

REVOKE ALL ON FUNCTION
  lifeos_runtime.cow_semantic_self_check_v2_base()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.cow_semantic_self_check_v2()
  FROM PUBLIC;
