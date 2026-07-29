-- LifeOS migration 0075 — restore the released RuVector trajectory writer.
--
-- The installed binary exports ruvector_record_trajectory_wrapper, but the
-- generated 0.3.0 SQL artifact omits its CREATE FUNCTION binding. Feedback
-- can only match a recent trajectory after this public binding is restored.

CREATE FUNCTION extensions.ruvector_record_trajectory(
  table_name text,
  query_vector real[],
  result_ids bigint[],
  latency_us bigint,
  ef_search integer,
  probes integer
) RETURNS text
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_record_trajectory_wrapper';

ALTER FUNCTION extensions.ruvector_record_trajectory(
  text, real[], bigint[], bigint, integer, integer
) OWNER TO lifeos_migrator;
