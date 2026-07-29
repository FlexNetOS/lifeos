-- LifeOS migration 0101 — align Weave and runner idempotency conflict
-- targets with the canonical nullable-idempotency indexes.
--
-- Migration 0099 is already durable in deployed databases. Recreate only the
-- two submit functions from their installed definitions, changing the
-- conflict target to include the required partial-index predicate. Keeping
-- the repair data-driven avoids a second copy of the long security-bound
-- function bodies and preserves the exact deployed procedure surface.

DO $migration$
DECLARE
  procedure_oid oid;
  installed_definition text;
  repaired_definition text;
BEGIN
  FOR procedure_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'lifeos_coord'
       AND p.proname IN ('submit_weave_job', 'submit_runner_job')
       AND p.prokind = 'f'
  LOOP
    installed_definition := pg_get_functiondef(procedure_oid);
    repaired_definition := replace(
      installed_definition,
      'ON CONFLICT (tenant_id, idempotency_key) DO NOTHING',
      'ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING'
    );
    IF repaired_definition = installed_definition THEN
      RAISE EXCEPTION 'coordination idempotency conflict target missing from %', procedure_oid::regprocedure;
    END IF;
    EXECUTE repaired_definition;
  END LOOP;
END
$migration$;
