-- LifeOS migration 0097 — normalize every learning entrypoint to the
-- approved RuVector library identity.
--
-- The extension-generated SQL may resolve MODULE_PATHNAME to a sibling path
-- ending in `.so`.  That is the same native code, but it violates the
-- single-library identity used by the runtime, witness, and security gates.
-- Re-declare the affected entrypoints against the canonical absolute path.

CREATE OR REPLACE FUNCTION extensions.ruvector_auto_tune_jsonb_native(
  table_name text,
  optimize_for text,
  sample_queries jsonb
)
RETURNS jsonb
LANGUAGE C
PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_auto_tune_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_record_trajectory(
  table_name text,
  query_vector real[],
  result_ids bigint[],
  latency_us bigint,
  ef_search integer,
  probes integer
)
RETURNS text
LANGUAGE C
PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_record_trajectory_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_dag_set_learning_rate(
  rate double precision
)
RETURNS void
LANGUAGE C
PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_dag_set_learning_rate_wrapper';
