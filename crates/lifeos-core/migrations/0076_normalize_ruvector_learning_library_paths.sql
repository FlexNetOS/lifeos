-- LifeOS migration 0076 — normalize RuVector learning bindings.
--
-- The released artifact binds learning functions to the absolute extension
-- path while the extension itself is loaded through $libdir. PostgreSQL can
-- treat those spellings as separate library identities; the second load
-- re-registers ruvector.ef_search and makes learning activation fail. Keep
-- every learning entry point on the canonical $libdir spelling.

CREATE OR REPLACE FUNCTION extensions.ruvector_enable_learning(
  table_name text,
  config jsonb DEFAULT NULL
) RETURNS text
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_enable_learning_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_record_feedback(
  table_name text,
  query_vector real[],
  relevant_ids bigint[],
  irrelevant_ids bigint[]
) RETURNS text
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_record_feedback_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_learning_stats(
  table_name text
) RETURNS jsonb
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_learning_stats_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_extract_patterns(
  table_name text,
  num_clusters integer DEFAULT 10
) RETURNS text
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_extract_patterns_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_get_search_params(
  table_name text,
  query_vector real[]
) RETURNS jsonb
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_get_search_params_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_clear_learning(
  table_name text
) RETURNS text
LANGUAGE c
PARALLEL SAFE
AS '$libdir/ruvector', 'ruvector_clear_learning_wrapper';
