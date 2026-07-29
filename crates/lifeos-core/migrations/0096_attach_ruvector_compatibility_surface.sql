-- LifeOS migration 0096 — keep the repaired auto-tune entry point in the
-- extension-owned catalog surface.
--
-- Migration 0074 preserves the public real[] signature by renaming the
-- native entry point and installing a JSONB bridge.  The bridge is durable
-- activation behavior, not an untracked side function: attach it to the
-- existing extension when the function is present and still unattached.

DO $$
DECLARE
  function_oid oid := to_regprocedure(
    'extensions.ruvector_auto_tune(text,text,real[])'
  );
BEGIN
  IF function_oid IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_depend d
       JOIN pg_extension e ON e.oid = d.refobjid
       WHERE d.objid = function_oid
         AND d.deptype = 'e'
         AND e.extname = 'ruvector'
     ) THEN
    ALTER EXTENSION ruvector ADD FUNCTION
      extensions.ruvector_auto_tune(text, text, real[]);
  END IF;
END
$$;
