-- LifeOS migration 0074 — adapt the released RuVector auto-tune ABI.
--
-- The released SQL surface exposes sample_queries as real[], while the
-- native ruvector_auto_tune wrapper consumes a JSONB array of query vectors.
-- Preserve the public signature and convert the one-dimensional SQL array to
-- the JSONB array-of-arrays expected by the native implementation.

ALTER FUNCTION extensions.ruvector_auto_tune(text, text, real[])
  RENAME TO ruvector_auto_tune_array_native;

CREATE FUNCTION extensions.ruvector_auto_tune_jsonb_native(
  table_name text,
  optimize_for text,
  sample_queries jsonb
) RETURNS jsonb
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_auto_tune_wrapper';

CREATE FUNCTION extensions.ruvector_auto_tune(
  table_name text,
  optimize_for text DEFAULT 'balanced',
  sample_queries real[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
PARALLEL SAFE
AS $function$
  SELECT extensions.ruvector_auto_tune_jsonb_native(
    $1,
    $2,
    CASE
      WHEN $3 IS NULL THEN NULL::jsonb
      ELSE to_jsonb(ARRAY[$3]::real[][])
    END
  )
$function$;

ALTER FUNCTION extensions.ruvector_auto_tune_jsonb_native(text, text, jsonb)
  OWNER TO lifeos_migrator;
ALTER FUNCTION extensions.ruvector_auto_tune(text, text, real[])
  OWNER TO lifeos_migrator;
