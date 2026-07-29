-- LifeOS migration 0105 — bind Weave and runner job provenance to the
-- claimed running execution.

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
      E'  job_id uuid;\nBEGIN',
      E'  job_id uuid;\n  source_execution_id uuid;\n  binding lifeos_security.backend_binding;\nBEGIN\n  binding := lifeos_security.current_binding();\n  IF binding.identity_id IS NULL THEN\n    RAISE EXCEPTION ''coordination execution provenance requires an active backend binding'';\n  END IF;'
    );
    repaired_definition := replace(
      repaired_definition,
      '  payload := jsonb_build_object(',
      E'  SELECT execution.execution_id\n    INTO source_execution_id\n    FROM lifeos_runtime.execution execution\n   WHERE execution.tenant_id = tenant\n     AND execution.task_id = p_task_id\n     AND execution.lease_id = p_lease_id\n     AND execution.branch_id = p_branch_id\n     AND execution.runner_identity_id = binding.identity_id\n     AND execution.state_code = ''running''\n   ORDER BY execution.attempt_no DESC\n   LIMIT 1;\n  IF source_execution_id IS NULL THEN\n    RAISE EXCEPTION ''coordination job requires a running execution for the active task lease'';\n  END IF;\n  payload := jsonb_build_object('
    );
    repaired_definition := replace(
      repaired_definition,
      'p_idempotency_key, p_task_id, tstzrange',
      'p_idempotency_key, source_execution_id, tstzrange'
    );
    IF repaired_definition = installed_definition
       OR repaired_definition NOT LIKE '%source_execution_id%' THEN
      RAISE EXCEPTION 'coordination execution provenance repair failed for %', procedure_oid::regprocedure;
    END IF;
    EXECUTE repaired_definition;
  END LOOP;
END
$migration$;
