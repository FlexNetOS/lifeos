-- LifeOS migration 0080 — close the final RuVector library identity gap.
--
-- The bootstrap SHAKE-256 helper historically remained on $libdir while the
-- migration closure moved the other C entrypoints to the approved absolute
-- library. Calling a SHAKE-backed witness operation after another RuVector
-- entrypoint could therefore load the .so twice and fail _PG_init.

CREATE OR REPLACE FUNCTION extensions.ruvector_shake256_256(input bytea)
RETURNS bytea
LANGUAGE C
IMMUTABLE PARALLEL SAFE STRICT
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_shake256_256_wrapper';
