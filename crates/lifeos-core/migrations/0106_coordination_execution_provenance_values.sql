-- LifeOS migration 0106 — finish execution provenance value binding.
--
-- 0105 repaired the source_execution_id column and lookup, but its textual
-- function rewrite left the VALUES expression using p_task_id.  That value
-- is rejected by the tenant-reference trigger because source_execution_id
-- must reference the live execution row, not the task row.

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
      E'    p_task_id, tstzrange(statement_timestamp(), NULL, ''[)'')',
      E'    source_execution_id, tstzrange(statement_timestamp(), NULL, ''[)'')'
    );
    IF repaired_definition = installed_definition
       OR repaired_definition NOT LIKE '%source_execution_id, tstzrange%' THEN
      RAISE EXCEPTION 'coordination execution provenance value repair failed for %', procedure_oid::regprocedure;
    END IF;
    EXECUTE repaired_definition;
  END LOOP;
END
$migration$;
