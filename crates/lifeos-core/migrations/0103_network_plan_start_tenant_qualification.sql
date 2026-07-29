-- LifeOS migration 0103 — qualify the network-plan tenant lookup.
--
-- The start function returns a column named tenant_id. PostgreSQL therefore
-- treats an unqualified tenant_id in its SELECT predicate as ambiguous once
-- the function is actually called. Qualify the canonical table reference in
-- the already-installed function definition.

DO $migration$
DECLARE
  installed_definition text;
  repaired_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'lifeos_coord.start_network_plan(uuid)'::regprocedure
  ) INTO installed_definition;
  repaired_definition := replace(
    installed_definition,
    E'FROM lifeos_coord.network_plan\n   WHERE network_plan_id = p_plan_id\n     AND tenant_id = lifeos_security.current_tenant()',
    E'FROM lifeos_coord.network_plan AS network_plan\n   WHERE network_plan_id = p_plan_id\n     AND network_plan.tenant_id = lifeos_security.current_tenant()'
  );
  IF repaired_definition = installed_definition THEN
    RAISE EXCEPTION 'network start tenant predicate was not found';
  END IF;
  EXECUTE repaired_definition;
END
$migration$;
