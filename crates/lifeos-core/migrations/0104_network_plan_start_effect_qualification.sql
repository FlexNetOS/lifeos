-- LifeOS migration 0104 — qualify the idempotency lookup in network start.
--
-- The start function's TABLE return shape declares tenant_id. Every catalog
-- column in its existing-effect lookup must therefore be qualified.

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
    E'FROM lifeos_coord.network_effect\n     WHERE tenant_id = plan_row.tenant_id\n       AND typed_payload->>\'plan_id\' = p_plan_id::text\n       AND record_kind = \'network-plan-start\'',
    E'FROM lifeos_coord.network_effect AS network_effect_row\n     WHERE network_effect_row.tenant_id = plan_row.tenant_id\n       AND network_effect_row.typed_payload->>\'plan_id\' = p_plan_id::text\n       AND network_effect_row.record_kind = \'network-plan-start\''
  );
  IF repaired_definition = installed_definition THEN
    RAISE EXCEPTION 'network start effect lookup was not found';
  END IF;
  EXECUTE repaired_definition;
END
$migration$;
