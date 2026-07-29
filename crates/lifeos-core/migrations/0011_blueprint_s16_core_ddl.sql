-- LifeOS migration 0011 — blueprint §16.2 "Core byte, semantic, graph, request,
-- branch, and witness DDL" (Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_
-- EXPANDED_VERIFIED.md, SQL block 1 of 6, verbatim below the preamble).
--
-- Packaging preamble (additive, no blueprint statement altered): migrations
-- 0001-0010 created lifeos_* relations owned by the bootstrap superuser, while
-- §16 assumes the lifeos_migrator ownership model (block 1 transfers schema
-- ownership and issues later ALTERs under SET ROLE lifeos_migrator). Align any
-- pre-existing relation/routine ownership first so the §16 blocks apply as
-- designed on both a bootstrapped cluster and a fresh one (loop no-ops when the
-- role or the schemas do not exist yet).
DO $ownership_alignment$
DECLARE
  relation_row record;
  routine_row record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_migrator') THEN
    RETURN;
  END IF;
  FOR relation_row IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY (ARRAY[
            'lifeos_blob','lifeos_semantic','lifeos_runtime','lifeos_agent',
            'lifeos_agentdb','lifeos_rvf','lifeos_security','lifeos_coord',
            'lifeos_release','lifeos_ops'
          ])
      AND c.relkind IN ('r','p','S','v','m')
      -- Identity/serial sequences are column-owned: their ownership follows
      -- ALTER TABLE and cannot be changed directly.
      AND NOT (c.relkind = 'S' AND EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_class'::regclass
              AND d.objid = c.oid
              AND d.deptype IN ('a','i')
          ))
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO lifeos_migrator',
      CASE relation_row.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        ELSE 'TABLE'
      END,
      relation_row.schema_name, relation_row.relation_name
    );
  END LOOP;
  FOR routine_row IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ANY (ARRAY[
            'lifeos_blob','lifeos_semantic','lifeos_runtime','lifeos_agent',
            'lifeos_agentdb','lifeos_rvf','lifeos_security','lifeos_coord',
            'lifeos_release','lifeos_ops'
          ])
      AND p.prokind IN ('f','p')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO lifeos_migrator',
                   routine_row.signature);
  END LOOP;
END
$ownership_alignment$;

-- Packaging reconciliation (data-preserving): migrations 0005-0010 created 15
-- tables whose names §16 also defines but whose shapes follow the earlier
-- pragmatic lineage (all empty at reconciliation time except lifeos_blob.object
-- with 12 parity rows). §16 shapes are normative (hard rule 21): each legacy
-- table is renamed to <name>_pre_s16 — rows, bytes, indexes, and dependent
-- constraints move with it — and §16 then creates the canonical shape. A
-- legacy-lineage marker column guards each rename, so this block is idempotent
-- and no-ops on fresh databases.
DO $legacy_shape_reconciliation$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('lifeos_agentdb','exp_edges','payload_json',NULL::text),
      ('lifeos_agentdb','exp_nodes','payload_json',NULL),
      ('lifeos_agentdb','notes','payload_json',NULL),
      ('lifeos_blob','object','raw_bytes',NULL),
      ('lifeos_runtime','branch','creation_key',NULL),
      ('lifeos_runtime','branch_overlay','logical_key_digest',NULL),
      ('lifeos_runtime','merge_conflict','conflict_kind',NULL),
      ('lifeos_runtime','merge_gate','gate_kind',NULL),
      ('lifeos_runtime','projection','projection_key',NULL),
      ('lifeos_runtime','promotion','pointer_name',NULL),
      ('lifeos_rvf','container','raw_object_id',NULL),
      ('lifeos_rvf','cow_map','range_map_object_id','int8'),
      ('lifeos_rvf','membership','relation_name',NULL),
      ('lifeos_security','identity','password_hash',NULL),
      ('lifeos_semantic','embedding','raw_vector',NULL)
    ) AS v(schema_name, table_name, marker_column, marker_udt)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = spec.schema_name
        AND c.table_name = spec.table_name
        AND c.column_name = spec.marker_column
        AND (spec.marker_udt IS NULL OR c.udt_name = spec.marker_udt)
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I RENAME TO %I',
                     spec.schema_name, spec.table_name,
                     spec.table_name || '_pre_s16');
    END IF;
  END LOOP;
END
$legacy_shape_reconciliation$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS ruvector WITH SCHEMA extensions;

DO $extension_locations$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension extension_row
    JOIN pg_namespace namespace_row ON namespace_row.oid=extension_row.extnamespace
    WHERE extension_row.extname IN ('pgcrypto','btree_gin','ruvector')
      AND namespace_row.nspname <> 'extensions'
  ) THEN
    RAISE EXCEPTION 'required extensions must be installed in schema extensions';
  END IF;
END
$extension_locations$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_migrator') THEN
    EXECUTE 'CREATE ROLE lifeos_migrator NOLOGIN BYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_security_owner') THEN
    EXECUTE 'CREATE ROLE lifeos_security_owner NOLOGIN BYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_runtime') THEN
    EXECUTE 'CREATE ROLE lifeos_runtime NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_envctl') THEN
    EXECUTE 'CREATE ROLE lifeos_envctl NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_reader') THEN
    EXECUTE 'CREATE ROLE lifeos_reader NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_worker') THEN
    EXECUTE 'CREATE ROLE lifeos_worker NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_security_broker') THEN
    EXECUTE 'CREATE ROLE lifeos_security_broker NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_release') THEN
    EXECUTE 'CREATE ROLE lifeos_release NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_backup') THEN
    EXECUTE 'CREATE ROLE lifeos_backup NOLOGIN REPLICATION NOBYPASSRLS';
  END IF;
END
$roles$;

ALTER ROLE lifeos_backup REPLICATION;
GRANT pg_read_all_data, pg_read_all_settings TO lifeos_backup;
GRANT pg_read_all_stats TO lifeos_security_owner;

CREATE SCHEMA IF NOT EXISTS lifeos_blob;
CREATE SCHEMA IF NOT EXISTS lifeos_semantic;
CREATE SCHEMA IF NOT EXISTS lifeos_runtime;
CREATE SCHEMA IF NOT EXISTS lifeos_agent;
CREATE SCHEMA IF NOT EXISTS lifeos_agentdb;
CREATE SCHEMA IF NOT EXISTS lifeos_rvf;
CREATE SCHEMA IF NOT EXISTS lifeos_security;
CREATE SCHEMA IF NOT EXISTS lifeos_coord;
CREATE SCHEMA IF NOT EXISTS lifeos_release;
CREATE SCHEMA IF NOT EXISTS lifeos_ops;

SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_semantic,
                  lifeos_runtime, lifeos_agent, lifeos_agentdb, lifeos_rvf,
                  lifeos_security, lifeos_coord, lifeos_release, lifeos_ops;

ALTER SCHEMA lifeos_blob OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_semantic OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_runtime OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_agent OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_agentdb OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_rvf OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_security OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_coord OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_release OWNER TO lifeos_migrator;
ALTER SCHEMA lifeos_ops OWNER TO lifeos_migrator;
GRANT USAGE ON SCHEMA extensions
  TO lifeos_migrator, lifeos_envctl, lifeos_runtime, lifeos_worker,
     lifeos_reader, lifeos_security_owner, lifeos_security_broker,
     lifeos_release, lifeos_backup;
SET ROLE lifeos_migrator;

CREATE TABLE IF NOT EXISTS lifeos_blob.object (
  object_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sha256 bytea NOT NULL,
  shake256 bytea NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  media_type text NOT NULL,
  bytes_inline bytea,
  chunked boolean NOT NULL,
  created_by_execution uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  provenance jsonb NOT NULL,
  UNIQUE (tenant_id, sha256, byte_length),
  CHECK (octet_length(sha256) = 32),
  CHECK (octet_length(shake256) = 32),
  CHECK ((chunked AND bytes_inline IS NULL) OR
         (NOT chunked AND bytes_inline IS NOT NULL AND
          octet_length(bytes_inline) = byte_length))
);

CREATE TABLE IF NOT EXISTS lifeos_blob.object_chunk (
  object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  chunk_no integer NOT NULL CHECK (chunk_no >= 0),
  byte_offset bigint NOT NULL CHECK (byte_offset >= 0),
  data bytea NOT NULL,
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  PRIMARY KEY (object_id, chunk_no),
  UNIQUE (object_id, byte_offset)
);

CREATE TABLE IF NOT EXISTS lifeos_semantic.embedding (
  embedding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  source_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  byte_start bigint NOT NULL,
  byte_end bigint NOT NULL,
  record_kind text NOT NULL,
  metadata jsonb NOT NULL,
  model_digest bytea NOT NULL,
  transform_id uuid NOT NULL,
  generation bigint NOT NULL,
  dimension integer NOT NULL CHECK (dimension > 0),
  embedding extensions.ruvector NOT NULL,
  witness_id uuid NOT NULL,
  CHECK (byte_start >= 0 AND byte_end >= byte_start),
  UNIQUE (branch_id, source_object_id, byte_start, byte_end,
          model_digest, generation, dimension)
);
CREATE INDEX IF NOT EXISTS embedding_metadata_gin
  ON lifeos_semantic.embedding USING gin (metadata);

CREATE TABLE IF NOT EXISTS lifeos_semantic.lexical_document (
  lexical_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  source_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  byte_start bigint NOT NULL,
  byte_end bigint NOT NULL,
  fields jsonb NOT NULL,
  terms tsvector NOT NULL,
  analyzer jsonb NOT NULL,
  generation bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS lexical_terms_gin
  ON lifeos_semantic.lexical_document USING gin (terms);
CREATE INDEX IF NOT EXISTS lexical_fields_gin
  ON lifeos_semantic.lexical_document USING gin (fields);

CREATE TABLE IF NOT EXISTS lifeos_semantic.graph_node (
  node_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  node_kind text NOT NULL,
  logical_key text NOT NULL,
  source_object_id uuid REFERENCES lifeos_blob.object,
  source_range int8range,
  properties jsonb NOT NULL,
  embedding_id uuid REFERENCES lifeos_semantic.embedding,
  generation bigint NOT NULL,
  witness_id uuid NOT NULL,
  UNIQUE (tenant_id, branch_id, node_kind, logical_key, generation)
);
CREATE INDEX IF NOT EXISTS graph_node_properties_gin
  ON lifeos_semantic.graph_node USING gin (properties);

CREATE TABLE IF NOT EXISTS lifeos_semantic.graph_edge (
  edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  from_node uuid NOT NULL REFERENCES lifeos_semantic.graph_node,
  to_node uuid NOT NULL REFERENCES lifeos_semantic.graph_node,
  edge_kind text NOT NULL,
  weight double precision NOT NULL,
  causal_direction smallint NOT NULL,
  properties jsonb NOT NULL,
  source_object_id uuid REFERENCES lifeos_blob.object,
  generation bigint NOT NULL,
  witness_id uuid NOT NULL,
  UNIQUE (branch_id, from_node, to_node, edge_kind, generation)
);
CREATE INDEX IF NOT EXISTS graph_edge_from ON lifeos_semantic.graph_edge
  (branch_id, from_node, edge_kind, generation);
CREATE INDEX IF NOT EXISTS graph_edge_to ON lifeos_semantic.graph_edge
  (branch_id, to_node, edge_kind, generation);

CREATE TABLE IF NOT EXISTS lifeos_runtime.request (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  typed_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  authorization_context jsonb NOT NULL,
  idempotency_key text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.request_hop (
  request_id uuid NOT NULL REFERENCES lifeos_runtime.request,
  hop_no integer NOT NULL,
  component text NOT NULL,
  input_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  output_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  metadata jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (request_id, hop_no)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.branch (
  branch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  parent_branch_id uuid REFERENCES lifeos_runtime.branch,
  base_lsn pg_lsn NOT NULL,
  branch_kind text NOT NULL,
  purpose text NOT NULL,
  policy jsonb NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  head_generation bigint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.branch_overlay (
  branch_id uuid NOT NULL REFERENCES lifeos_runtime.branch,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  relation_name regclass NOT NULL,
  logical_key jsonb NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert','update','delete')),
  base_digest bytea,
  row_object_id uuid REFERENCES lifeos_blob.object,
  row_json jsonb,
  execution_id uuid NOT NULL,
  witness_id uuid NOT NULL,
  PRIMARY KEY (branch_id, sequence)
);
CREATE INDEX IF NOT EXISTS branch_overlay_key_gin
  ON lifeos_runtime.branch_overlay USING gin (logical_key);

CREATE TABLE IF NOT EXISTS lifeos_agent.witness_chain (
  chain_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  domain text NOT NULL,
  head_sequence bigint NOT NULL DEFAULT 0,
  head_shake256 bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS lifeos_agent.witness_entry (
  witness_id uuid NOT NULL DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES lifeos_agent.witness_chain,
  sequence bigint NOT NULL,
  previous_shake256 bytea NOT NULL,
  canonical_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  entry_shake256 bytea NOT NULL,
  source_object_id uuid REFERENCES lifeos_blob.object,
  source_range int8range,
  vector_id uuid REFERENCES lifeos_semantic.embedding,
  graph_edge_id uuid REFERENCES lifeos_semantic.graph_edge,
  request_id uuid REFERENCES lifeos_runtime.request,
  execution_id uuid,
  signer_identity uuid NOT NULL,
  signature bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (chain_id, sequence),
  UNIQUE (witness_id),
  UNIQUE (chain_id, entry_shake256)
);
