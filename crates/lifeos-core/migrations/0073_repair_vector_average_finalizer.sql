-- LifeOS migration 0073 — repair the installed RuVector aggregate finalizer.
--
-- The released extension's SQL body passes a double-precision expression to
-- vector_mul_scalar(real[], real), making vector_avg_final fail at runtime.
-- Keep the correction in the canonical migration chain so every database
-- receives the same executable repair and the live authority gate can prove
-- the repaired behavior.

CREATE OR REPLACE FUNCTION extensions.vector_avg_final(state real[], count bigint)
RETURNS real[]
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $function$
SELECT CASE
    WHEN state IS NULL OR count = 0 THEN NULL
    ELSE extensions.vector_mul_scalar(state, (1.0::real / count::real)::real)
END;
$function$;
