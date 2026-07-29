-- LifeOS migration 0046 — scoped AgentDB projection retirement.
--
-- Subsystems share the generic S16 tables, so a broad table clear is not a
-- valid implementation of a subsystem reset. Retire only the requested
-- record kind and keep all unrelated canonical history intact.

CREATE OR REPLACE FUNCTION lifeos_agentdb.clear_projection_kind(
  p_target regclass,
  p_record_kind text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_agentdb, lifeos_security
AS $function$
DECLARE
  row_value record;
  cleared bigint := 0;
  tombstone jsonb;
  target_name text := p_target::text;
BEGIN
  IF target_name NOT IN ('lifeos_agentdb.exp_nodes', 'lifeos_agentdb.exp_edges') THEN
    RAISE EXCEPTION 'unsupported AgentDB projection target %', target_name;
  END IF;
  FOR row_value IN EXECUTE format(
    'SELECT DISTINCT ON (typed_payload->>''logical_key'')
       record_kind, typed_payload->>''logical_key'' AS logical_key
     FROM %s
     WHERE tenant_id = lifeos_security.current_tenant()
       AND record_kind = $1
       AND coalesce((typed_payload->>''tombstone'')::boolean, false) = false
     ORDER BY typed_payload->>''logical_key'', sequence DESC', target_name)
  USING p_record_kind
  LOOP
    tombstone := jsonb_build_object(
      'logical_key', row_value.logical_key,
      'tombstone', true,
      'payload', '{}'::jsonb
    );
    PERFORM lifeos_agentdb.append_projection_record(
      p_target, p_record_kind, row_value.logical_key,
      tombstone, convert_to(tombstone::text, 'UTF8'));
    cleared := cleared + 1;
  END LOOP;
  RETURN cleared;
END
$function$;

ALTER FUNCTION lifeos_agentdb.clear_projection_kind(regclass, text)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_agentdb.clear_projection_kind(regclass, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_agentdb.clear_projection_kind(regclass, text)
  TO lifeos_runtime, lifeos_envctl;
