-- LifeOS migration 0077 — close the RuVector library identity boundary.
--
-- Bootstrap binds the accepted CAP-INV011 library by absolute path. Migrations
-- 0068, 0074, 0075, and 0076 historically rebound a subset of RuVector entry
-- points through $libdir. A fresh backend that calls an absolute-path function
-- and then a $libdir function loads the same .so twice; RuVector's _PG_init
-- consequently fails with "attempt to redefine parameter ruvector.ef_search".
-- Keep every RuVector entry point on the one approved library identity.

CREATE OR REPLACE FUNCTION extensions.ruvector_in(cstring)
RETURNS extensions.ruvector LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector', 'ruvector_in';
CREATE OR REPLACE FUNCTION extensions.ruvector_out(extensions.ruvector)
RETURNS cstring LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector', 'ruvector_out';
CREATE OR REPLACE FUNCTION extensions.ruvector_recv(internal)
RETURNS extensions.ruvector LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector', 'ruvector_recv';
CREATE OR REPLACE FUNCTION extensions.ruvector_send(extensions.ruvector)
RETURNS bytea LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector', 'ruvector_send';
CREATE OR REPLACE FUNCTION extensions.ruvector_typmod_in(cstring[])
RETURNS integer LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector', 'ruvector_typmod_in';
CREATE OR REPLACE FUNCTION extensions.ruvector_typmod_out(integer)
RETURNS cstring LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector', 'ruvector_typmod_out';

CREATE OR REPLACE FUNCTION extensions.ruvector_enable_learning(
  table_name text,
  config jsonb DEFAULT NULL
) RETURNS text
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_enable_learning_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_record_feedback(
  table_name text,
  query_vector real[],
  relevant_ids bigint[],
  irrelevant_ids bigint[]
) RETURNS text
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_record_feedback_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_learning_stats(table_name text)
RETURNS jsonb
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_learning_stats_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_extract_patterns(
  table_name text,
  num_clusters integer DEFAULT 10
) RETURNS text
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_extract_patterns_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_get_search_params(
  table_name text,
  query_vector real[]
) RETURNS jsonb
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_get_search_params_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_clear_learning(table_name text)
RETURNS text
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_clear_learning_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_auto_tune_jsonb_native(
  table_name text,
  optimize_for text,
  sample_queries jsonb
) RETURNS jsonb
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_auto_tune_wrapper';

CREATE OR REPLACE FUNCTION extensions.ruvector_record_trajectory(
  table_name text,
  query_vector real[],
  result_ids bigint[],
  latency_us bigint,
  ef_search integer,
  probes integer
) RETURNS text
LANGUAGE C PARALLEL SAFE
AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
   'ruvector_record_trajectory_wrapper';
