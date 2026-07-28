-- LifeOS migration 0012 — blueprint §16.2.1 full catalog, constraints, row security (SQL block 2 of 6, verbatim after role preamble).
-- Packaging preamble only: restore the migrator session state the original
-- single-session §16 stream carried into this block.
SET ROLE lifeos_migrator;

CREATE OR REPLACE FUNCTION lifeos_ops.prevent_canonical_link_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'canonical envelope rows are never deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'canonical envelope rows are append-only';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TABLE IF NOT EXISTS lifeos_security.identity (
  identity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subject_kind text NOT NULL,
  subject_key text NOT NULL,
  public_key bytea,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  active_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  active_until timestamptz,
  UNIQUE (tenant_id, subject_kind, subject_key)
);

CREATE TABLE IF NOT EXISTS lifeos_security.policy (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  policy_key text NOT NULL,
  policy_revision bigint NOT NULL,
  policy_document jsonb NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  policy_digest bytea NOT NULL CHECK (octet_length(policy_digest) = 32),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  UNIQUE (tenant_id, policy_key, policy_revision)
);

CREATE TABLE IF NOT EXISTS lifeos_security."grant" (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  policy_id uuid NOT NULL REFERENCES lifeos_security.policy,
  identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  task_id uuid,
  lease_id uuid,
  resource_scope jsonb NOT NULL,
  action_scope text[] NOT NULL,
  purpose text NOT NULL,
  nonce bytea NOT NULL,
  epoch bigint NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (tenant_id, identity_id, nonce, epoch),
  CHECK (expires_at > issued_at)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.session (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES lifeos_runtime.branch,
  identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  client_context jsonb NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.task (
  task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES lifeos_runtime.branch,
  request_id uuid REFERENCES lifeos_runtime.request,
  parent_task_id uuid REFERENCES lifeos_runtime.task,
  task_kind text NOT NULL,
  payload_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  state_code text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  capability_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  witness_chain_id uuid REFERENCES lifeos_agent.witness_chain,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS task_claim_order
  ON lifeos_runtime.task (state_code, priority DESC, available_at, created_at);

CREATE TABLE IF NOT EXISTS lifeos_runtime.task_dependency (
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES lifeos_runtime.task,
  depends_on_task_id uuid NOT NULL REFERENCES lifeos_runtime.task,
  dependency_kind text NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.lease (
  lease_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES lifeos_runtime.task,
  holder_identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  capability_token_hash bytea NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);
CREATE INDEX IF NOT EXISTS lease_expiry
  ON lifeos_runtime.lease (expires_at)
  WHERE acknowledged_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS lifeos_runtime.execution (
  execution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES lifeos_runtime.task,
  lease_id uuid NOT NULL REFERENCES lifeos_runtime.lease,
  branch_id uuid NOT NULL REFERENCES lifeos_runtime.branch,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  runner_identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  nix_closure_object_id uuid REFERENCES lifeos_blob.object,
  input_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  state_code text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE (task_id, attempt_no)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.effect (
  effect_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL REFERENCES lifeos_runtime.execution,
  effect_no bigint NOT NULL,
  effect_kind text NOT NULL,
  request_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  response_object_id uuid REFERENCES lifeos_blob.object,
  acknowledgement_object_id uuid REFERENCES lifeos_blob.object,
  rollback_object_id uuid REFERENCES lifeos_blob.object,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (execution_id, effect_no)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.result (
  result_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL REFERENCES lifeos_runtime.execution,
  result_no bigint NOT NULL,
  result_kind text NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  typed_object_id uuid REFERENCES lifeos_blob.object,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  witness_chain_id uuid REFERENCES lifeos_agent.witness_chain,
  witness_sequence bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (execution_id, result_no)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.log_frame (
  log_frame_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL REFERENCES lifeos_runtime.execution,
  stream_name text NOT NULL,
  frame_no bigint NOT NULL,
  byte_offset bigint NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (execution_id, stream_name, frame_no)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.error (
  error_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid REFERENCES lifeos_runtime.execution,
  task_id uuid REFERENCES lifeos_runtime.task,
  error_class text NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  typed_payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (execution_id IS NOT NULL OR task_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.inbox (
  inbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_component text NOT NULL,
  source_sequence bigint NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  record_digest bytea NOT NULL CHECK (octet_length(record_digest) = 32),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  committed_lsn pg_lsn,
  UNIQUE (tenant_id, source_component, source_sequence)
);

CREATE TABLE IF NOT EXISTS lifeos_runtime.outbox (
  outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  destination_component text NOT NULL,
  branch_id uuid REFERENCES lifeos_runtime.branch,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  typed_payload jsonb NOT NULL,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_delivery
  ON lifeos_runtime.outbox (destination_component, acknowledged_at,
                            available_at, sequence);

CREATE TABLE IF NOT EXISTS lifeos_runtime.reconcile_commit (
  reconcile_commit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  inbox_id uuid NOT NULL REFERENCES lifeos_runtime.inbox,
  envctl_execution_id uuid NOT NULL REFERENCES lifeos_runtime.execution,
  redb_transaction_id bytea NOT NULL,
  postgres_lsn pg_lsn NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  witness_chain_id uuid NOT NULL REFERENCES lifeos_agent.witness_chain,
  witness_sequence bigint NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, redb_transaction_id),
  FOREIGN KEY (witness_chain_id, witness_sequence)
    REFERENCES lifeos_agent.witness_entry (chain_id, sequence)
);

CREATE TABLE IF NOT EXISTS lifeos_security.secret_object (
  secret_object_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  secret_key text NOT NULL,
  target_scope jsonb NOT NULL,
  purpose_scope text[] NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, secret_key)
);

CREATE TABLE IF NOT EXISTS lifeos_security.secret_version (
  secret_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  secret_object_id uuid NOT NULL REFERENCES lifeos_security.secret_object,
  version_no bigint NOT NULL,
  ciphertext_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  wrapping_key_ref text NOT NULL,
  algorithm text NOT NULL,
  nonce bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at timestamptz,
  UNIQUE (secret_object_id, version_no)
);

CREATE TABLE IF NOT EXISTS lifeos_security.secret_lease (
  secret_lease_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  secret_version_id uuid NOT NULL REFERENCES lifeos_security.secret_version,
  grant_id uuid NOT NULL REFERENCES lifeos_security."grant",
  task_lease_id uuid NOT NULL REFERENCES lifeos_runtime.lease,
  target_identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  purpose text NOT NULL,
  relay_nonce bytea NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (grant_id, relay_nonce),
  CHECK (expires_at > issued_at)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.container (
  container_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES lifeos_runtime.branch,
  object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  format_version integer NOT NULL,
  header_length bigint NOT NULL CHECK (header_length >= 0),
  manifest_offset bigint NOT NULL CHECK (manifest_offset >= 0),
  file_length bigint NOT NULL CHECK (file_length >= manifest_offset),
  parent_container_id uuid REFERENCES lifeos_rvf.container,
  generation bigint NOT NULL,
  frozen boolean NOT NULL,
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  shake256 bytea NOT NULL CHECK (octet_length(shake256) = 32),
  witness_id uuid REFERENCES lifeos_agent.witness_entry (witness_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, object_id),
  UNIQUE (tenant_id, parent_container_id, generation)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.manifest (
  manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  manifest_version integer NOT NULL,
  segment_count integer NOT NULL CHECK (segment_count >= 0),
  root_generation bigint NOT NULL,
  capabilities jsonb NOT NULL,
  manifest_digest bytea NOT NULL CHECK (octet_length(manifest_digest) = 32),
  witness_id uuid REFERENCES lifeos_agent.witness_entry (witness_id),
  UNIQUE (container_id, manifest_version)
);
CREATE INDEX IF NOT EXISTS rvf_manifest_capabilities_gin
  ON lifeos_rvf.manifest USING gin (capabilities);

CREATE TABLE IF NOT EXISTS lifeos_rvf.segment (
  segment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  segment_no integer NOT NULL CHECK (segment_no >= 0),
  segment_type smallint NOT NULL,
  segment_name text NOT NULL,
  byte_offset bigint NOT NULL CHECK (byte_offset >= 0 AND byte_offset % 64 = 0),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  flags integer NOT NULL,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  shake256 bytea NOT NULL CHECK (octet_length(shake256) = 32),
  compression jsonb NOT NULL,
  encryption jsonb NOT NULL,
  witness_id uuid REFERENCES lifeos_agent.witness_entry (witness_id),
  UNIQUE (container_id, segment_no),
  UNIQUE (container_id, byte_offset)
);
CREATE INDEX IF NOT EXISTS rvf_segment_type
  ON lifeos_rvf.segment (container_id, segment_type, segment_no);

CREATE TABLE IF NOT EXISTS lifeos_rvf.segment_directory (
  segment_directory_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  segment_id uuid NOT NULL REFERENCES lifeos_rvf.segment,
  directory_ordinal integer NOT NULL,
  directory_entry_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  witness_id uuid REFERENCES lifeos_agent.witness_entry (witness_id),
  UNIQUE (container_id, directory_ordinal),
  UNIQUE (container_id, segment_id)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.cow_map (
  cow_map_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  child_container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  parent_container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  generation bigint NOT NULL,
  range_map_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  membership_digest bytea NOT NULL CHECK (octet_length(membership_digest) = 32),
  witness_id uuid REFERENCES lifeos_agent.witness_entry (witness_id),
  UNIQUE (child_container_id, parent_container_id, generation)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.membership (
  membership_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  segment_id uuid REFERENCES lifeos_rvf.segment,
  member_kind text NOT NULL,
  member_key text NOT NULL,
  member_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  generation bigint NOT NULL,
  tombstone boolean NOT NULL,
  witness_id uuid REFERENCES lifeos_agent.witness_entry (witness_id),
  UNIQUE (container_id, member_kind, member_key, generation)
);
CREATE INDEX IF NOT EXISTS rvf_membership_lookup
  ON lifeos_rvf.membership
     (container_id, member_kind, member_key, generation DESC);

CREATE TABLE IF NOT EXISTS lifeos_rvf.witness (
  rvf_witness_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  witness_segment_id uuid NOT NULL REFERENCES lifeos_rvf.segment,
  sequence bigint NOT NULL,
  previous_shake256 bytea NOT NULL CHECK (octet_length(previous_shake256) = 32),
  entry_shake256 bytea NOT NULL CHECK (octet_length(entry_shake256) = 32),
  canonical_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  lifeos_witness_id uuid NOT NULL
    REFERENCES lifeos_agent.witness_entry (witness_id),
  UNIQUE (container_id, sequence),
  UNIQUE (container_id, entry_shake256)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.signature (
  signature_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  rvf_witness_id uuid REFERENCES lifeos_rvf.witness,
  signed_segment_id uuid REFERENCES lifeos_rvf.segment,
  signer_identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  algorithm text NOT NULL,
  public_key_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  signature_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  signed_digest bytea NOT NULL,
  verification_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  verified_at timestamptz NOT NULL,
  CHECK (rvf_witness_id IS NOT NULL OR signed_segment_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.derivation (
  derivation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  derived_container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  operation text NOT NULL,
  parameter_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  result_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  witness_id uuid NOT NULL REFERENCES lifeos_agent.witness_entry (witness_id),
  UNIQUE (source_container_id, derived_container_id)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.federation_event (
  federation_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  peer_identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  direction text NOT NULL CHECK (direction IN ('send','receive')),
  request_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  response_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  acknowledgement_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  witness_id uuid NOT NULL REFERENCES lifeos_agent.witness_entry (witness_id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.import_receipt (
  import_receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  source_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  manifest_id uuid NOT NULL REFERENCES lifeos_rvf.manifest,
  parsed_segment_count integer NOT NULL,
  reconstructed_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  exact_match boolean NOT NULL,
  receipt_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  witness_id uuid NOT NULL REFERENCES lifeos_agent.witness_entry (witness_id),
  CHECK (exact_match)
);

CREATE TABLE IF NOT EXISTS lifeos_rvf.export_receipt (
  export_receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  container_id uuid NOT NULL REFERENCES lifeos_rvf.container,
  exported_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  expected_sha256 bytea NOT NULL CHECK (octet_length(expected_sha256) = 32),
  expected_shake256 bytea NOT NULL CHECK (octet_length(expected_shake256) = 32),
  destination jsonb NOT NULL,
  acknowledgement_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  witness_id uuid NOT NULL REFERENCES lifeos_agent.witness_entry (witness_id),
  exported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION lifeos_rvf.prevent_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'normalized RVF rows are append-only and never deleted';
END
$function$;

DO $rvf_guards$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'container','manifest','segment','segment_directory','cow_map',
    'membership','witness','signature','derivation','federation_event',
    'import_receipt','export_receipt'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER rvf_append_only BEFORE UPDATE OR DELETE ON lifeos_rvf.%I FOR EACH ROW EXECUTE FUNCTION lifeos_rvf.prevent_rewrite()',
      relation_name
    );
  END LOOP;
END
$rvf_guards$;

CREATE OR REPLACE FUNCTION lifeos_ops.create_canonical_table(
  target_schema name,
  target_table name
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent, lifeos_ops
AS $function$
DECLARE
  id_column text := target_table::text || '_id';
  digest_index text := left(target_schema::text || '_' ||
                            target_table::text || '_digest_idx', 63);
  branch_index text := left(target_schema::text || '_' ||
                            target_table::text || '_branch_seq_idx', 63);
  payload_index text := left(target_schema::text || '_' ||
                             target_table::text || '_payload_gin', 63);
  idem_index text := left(target_schema::text || '_' ||
                          target_table::text || '_idempotency_uidx', 63);
  trigger_name text := left(target_table::text || '_canonical_guard', 63);
  created_table boolean := false;
BEGIN
  IF target_schema::text <> ALL (ARRAY[
       'lifeos_blob','lifeos_semantic','lifeos_runtime','lifeos_agent',
       'lifeos_agentdb','lifeos_rvf','lifeos_security','lifeos_coord',
       'lifeos_release','lifeos_ops'
     ]) THEN
    RAISE EXCEPTION 'schema % is outside the LifeOS catalog', target_schema;
  END IF;
  IF to_regclass(format('%I.%I', target_schema, target_table)) IS NULL THEN
    EXECUTE format($ddl$
      CREATE TABLE %I.%I (
        %I uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        branch_id uuid REFERENCES lifeos_runtime.branch,
        sequence bigint GENERATED ALWAYS AS IDENTITY,
        record_kind text NOT NULL,
        raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
        typed_payload jsonb NOT NULL CHECK (jsonb_typeof(typed_payload) = 'object'),
        record_digest bytea NOT NULL CHECK (octet_length(record_digest) = 32),
        idempotency_key text,
        source_execution_id uuid,
        witness_chain_id uuid,
        witness_sequence bigint,
        valid_time tstzrange,
        observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        FOREIGN KEY (witness_chain_id, witness_sequence)
          REFERENCES lifeos_agent.witness_entry (chain_id, sequence),
        CHECK ((witness_chain_id IS NULL) = (witness_sequence IS NULL))
      )
    $ddl$, target_schema, target_table, id_column);
    created_table := true;
  END IF;

  IF created_table THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (record_digest)',
                   digest_index, target_schema, target_table);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (branch_id, sequence)',
                   branch_index, target_schema, target_table);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I USING gin (typed_payload)',
      payload_index, target_schema, target_table
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.%I (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL',
      idem_index, target_schema, target_table
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION lifeos_ops.prevent_canonical_link_rewrite()',
      trigger_name, target_schema, target_table
    );
  END IF;
END
$function$;

ALTER FUNCTION lifeos_ops.create_canonical_table(name, name)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_ops.create_canonical_table(name, name)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_ops.create_canonical_table(name, name)
  TO lifeos_migrator;

DO $migration$
DECLARE
  catalog_row record;
BEGIN
  FOR catalog_row IN
    SELECT * FROM (VALUES
      ('lifeos_blob','import_session'), ('lifeos_blob','object'),
      ('lifeos_blob','object_chunk'), ('lifeos_blob','tree_entry'),
      ('lifeos_blob','host_path'), ('lifeos_blob','xattr'),
      ('lifeos_blob','symlink'), ('lifeos_blob','capture_event'),
      ('lifeos_semantic','document'), ('lifeos_semantic','ast_node'),
      ('lifeos_semantic','token'), ('lifeos_semantic','symbol'),
      ('lifeos_semantic','symbol_ref'), ('lifeos_semantic','type_record'),
      ('lifeos_semantic','function_record'), ('lifeos_semantic','dependency_edge'),
      ('lifeos_semantic','embedding'), ('lifeos_semantic','lexical_document'),
      ('lifeos_semantic','graph_node'), ('lifeos_semantic','graph_edge'),
      ('lifeos_semantic','causal_edge'), ('lifeos_semantic','transform'),
      ('lifeos_semantic','index_generation'),
      ('lifeos_runtime','session'), ('lifeos_runtime','request'),
      ('lifeos_runtime','request_hop'), ('lifeos_runtime','task'),
      ('lifeos_runtime','task_dependency'), ('lifeos_runtime','queue'),
      ('lifeos_runtime','lease'), ('lifeos_runtime','execution'),
      ('lifeos_runtime','effect'), ('lifeos_runtime','result'),
      ('lifeos_runtime','log_frame'), ('lifeos_runtime','error'),
      ('lifeos_runtime','projection'), ('lifeos_runtime','branch'),
      ('lifeos_runtime','branch_overlay'), ('lifeos_runtime','merge_conflict'),
      ('lifeos_runtime','merge_gate'), ('lifeos_runtime','promotion'),
      ('lifeos_runtime','inbox'), ('lifeos_runtime','outbox'),
      ('lifeos_runtime','reconcile_commit'),
      ('lifeos_agent','agent'), ('lifeos_agent','route_decision'),
      ('lifeos_agent','model'), ('lifeos_agent','model_invocation'),
      ('lifeos_agent','model_io'), ('lifeos_agent','kv_cache_record'),
      ('lifeos_agent','adapter'), ('lifeos_agent','sona_state'),
      ('lifeos_agent','learning_episode'), ('lifeos_agent','learning_step'),
      ('lifeos_agent','bandit_arm'), ('lifeos_agent','q_value'),
      ('lifeos_agent','ppo_update'), ('lifeos_agent','policy_matrix'),
      ('lifeos_agent','agentdb_projection'), ('lifeos_agent','rvf_container'),
      ('lifeos_agent','rvf_segment'), ('lifeos_agent','rvf_generation'),
      ('lifeos_agent','forecast'), ('lifeos_agent','timeline'),
      ('lifeos_agent','timeline_event'), ('lifeos_agent','forecast_observation'),
      ('lifeos_agent','witness_chain'), ('lifeos_agent','witness_entry'),
      ('lifeos_agentdb','episodes'), ('lifeos_agentdb','episode_embeddings'),
      ('lifeos_agentdb','skills'), ('lifeos_agentdb','skill_links'),
      ('lifeos_agentdb','skill_embeddings'), ('lifeos_agentdb','facts'),
      ('lifeos_agentdb','notes'), ('lifeos_agentdb','note_embeddings'),
      ('lifeos_agentdb','events'),
      ('lifeos_agentdb','consolidated_memories'),
      ('lifeos_agentdb','exp_nodes'), ('lifeos_agentdb','exp_edges'),
      ('lifeos_agentdb','exp_node_embeddings'),
      ('lifeos_agentdb','memory_scores'),
      ('lifeos_agentdb','memory_access_log'),
      ('lifeos_agentdb','consolidation_runs'),
      ('lifeos_agentdb','causal_edges'),
      ('lifeos_agentdb','causal_experiments'),
      ('lifeos_agentdb','causal_observations'),
      ('lifeos_agentdb','recall_certificates'),
      ('lifeos_agentdb','provenance_sources'),
      ('lifeos_agentdb','justification_paths'),
      ('lifeos_agentdb','learning_experiences'),
      ('lifeos_agentdb','learning_sessions'),
      ('lifeos_agentdb','native_definition'),
      ('lifeos_rvf','container'), ('lifeos_rvf','manifest'),
      ('lifeos_rvf','segment'), ('lifeos_rvf','segment_directory'),
      ('lifeos_rvf','cow_map'), ('lifeos_rvf','membership'),
      ('lifeos_rvf','witness'), ('lifeos_rvf','signature'),
      ('lifeos_rvf','derivation'), ('lifeos_rvf','federation_event'),
      ('lifeos_rvf','import_receipt'), ('lifeos_rvf','export_receipt'),
      ('lifeos_security','identity'), ('lifeos_security','trust_root'),
      ('lifeos_security','policy'), ('lifeos_security','grant'),
      ('lifeos_security','secret_object'), ('lifeos_security','secret_version'),
      ('lifeos_security','secret_lease'), ('lifeos_security','broker_event'),
      ('lifeos_security','mint_event'), ('lifeos_security','relay_event'),
      ('lifeos_security','seed_vault_record'),
      ('lifeos_security','cognitum_lineage'), ('lifeos_security','rotation'),
      ('lifeos_security','revocation'), ('lifeos_security','audit_event'),
      ('lifeos_coord','envctl_table'), ('lifeos_coord','envctl_row'),
      ('lifeos_coord','git_repository'), ('lifeos_coord','git_ref'),
      ('lifeos_coord','git_object'), ('lifeos_coord','gitkb_record'),
      ('lifeos_coord','meta_node'), ('lifeos_coord','meta_edge'),
      ('lifeos_coord','bead'), ('lifeos_coord','bead_dependency'),
      ('lifeos_coord','icm_manifest'), ('lifeos_coord','icm_memory'),
      ('lifeos_coord','weave_message'), ('lifeos_coord','weave_job'),
      ('lifeos_coord','weave_attempt'), ('lifeos_coord','network_plan'),
      ('lifeos_coord','network_effect'), ('lifeos_coord','idd_work_order'),
      ('lifeos_coord','idd_ledger_event'), ('lifeos_coord','handoff'),
      ('lifeos_coord','command_ledger'), ('lifeos_coord','rtk_record'),
      ('lifeos_coord','runner_job'), ('lifeos_coord','runner_receipt'),
      ('lifeos_release','build_input'), ('lifeos_release','build'),
      ('lifeos_release','test'), ('lifeos_release','artifact'),
      ('lifeos_release','manifest'), ('lifeos_release','closure'),
      ('lifeos_release','activation'), ('lifeos_release','rollback'),
      ('lifeos_release','verification'),
      ('lifeos_ops','migration'), ('lifeos_ops','extension_inventory'),
      ('lifeos_ops','backup'), ('lifeos_ops','base_backup'),
      ('lifeos_ops','wal_archive'), ('lifeos_ops','replication_slot'),
      ('lifeos_ops','restore_drill'),
      ('lifeos_ops','projection_compaction_decision')
    ) AS catalog(schema_name, table_name)
  LOOP
    PERFORM lifeos_ops.create_canonical_table(
      catalog_row.schema_name::name,
      catalog_row.table_name::name
    );
  END LOOP;
END
$migration$;

CREATE OR REPLACE FUNCTION lifeos_semantic.create_embedding_index(
  p_dimension integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_semantic,
                  lifeos_runtime
AS $function$
DECLARE
  table_name text;
BEGIN
  IF p_dimension < 1 OR p_dimension > 65535 THEN
    RAISE EXCEPTION 'invalid embedding dimension %', p_dimension;
  END IF;
  table_name := 'embedding_index_' || p_dimension::text;
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS lifeos_semantic.%I (
      embedding_id uuid PRIMARY KEY
        REFERENCES lifeos_semantic.embedding ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      branch_id uuid NOT NULL REFERENCES lifeos_runtime.branch,
      model_digest bytea NOT NULL,
      generation bigint NOT NULL,
      source_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
      embedding extensions.ruvector(%s) NOT NULL
    )
  $ddl$, table_name, p_dimension);
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON lifeos_semantic.%I USING hnsw (embedding extensions.ruvector_cosine_ops)',
    left(table_name || '_cosine_hnsw', 63), table_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON lifeos_semantic.%I USING hnsw (embedding extensions.ruvector_l2_ops)',
    left(table_name || '_l2_hnsw', 63), table_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON lifeos_semantic.%I USING hnsw (embedding extensions.ruvector_ip_ops)',
    left(table_name || '_ip_hnsw', 63), table_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON lifeos_semantic.%I USING ruivfflat (embedding extensions.ruvector_cosine_ops)',
    left(table_name || '_cosine_ivf', 63), table_name
  );
END
$function$;

ALTER FUNCTION lifeos_semantic.create_embedding_index(integer)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_semantic.create_embedding_index(integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.create_embedding_index(integer)
  TO lifeos_migrator;

SELECT lifeos_semantic.create_embedding_index(dimension)
FROM unnest(ARRAY[384, 768, 1024, 1536, 3072]) AS dimension;

CREATE OR REPLACE FUNCTION lifeos_semantic.enforce_embedding_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  expected_dimension integer := split_part(TG_TABLE_NAME, '_', 3)::integer;
  parent_dimension integer;
BEGIN
  SELECT dimension INTO STRICT parent_dimension
  FROM lifeos_semantic.embedding
  WHERE embedding_id = NEW.embedding_id;
  IF expected_dimension <> parent_dimension THEN
    RAISE EXCEPTION 'embedding projection dimension mismatch';
  END IF;
  RETURN NEW;
END
$function$;

DO $projection_triggers$
DECLARE
  dimension integer;
  table_name text;
BEGIN
  FOREACH dimension IN ARRAY ARRAY[384, 768, 1024, 1536, 3072]
  LOOP
    table_name := 'embedding_index_' || dimension::text;
    EXECUTE format(
      'CREATE TRIGGER embedding_projection_dimension BEFORE INSERT OR UPDATE ON lifeos_semantic.%I FOR EACH ROW EXECUTE FUNCTION lifeos_semantic.enforce_embedding_projection()',
      table_name
    );
  END LOOP;
END
$projection_triggers$;

CREATE TABLE IF NOT EXISTS lifeos_security.backend_binding (
  binding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  backend_pid integer NOT NULL,
  backend_start timestamptz NOT NULL,
  database_oid oid NOT NULL,
  database_user name NOT NULL,
  session_nonce uuid NOT NULL DEFAULT gen_random_uuid(),
  binding_kind text NOT NULL CHECK (binding_kind IN ('session','task')),
  tenant_id uuid NOT NULL,
  identity_id uuid NOT NULL REFERENCES lifeos_security.identity,
  grant_id uuid NOT NULL REFERENCES lifeos_security."grant",
  lease_id uuid REFERENCES lifeos_runtime.lease,
  raw_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  bound_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > bound_at),
  CHECK ((binding_kind = 'task') = (lease_id IS NOT NULL)),
  UNIQUE (backend_pid, backend_start, database_oid, database_user, session_nonce)
);
CREATE INDEX IF NOT EXISTS backend_binding_lookup
  ON lifeos_security.backend_binding
     (backend_pid, backend_start, database_oid, database_user,
      bound_at DESC, expires_at);

REVOKE ALL ON lifeos_security.backend_binding FROM PUBLIC;
GRANT USAGE ON SCHEMA lifeos_security, lifeos_runtime, lifeos_blob
  TO lifeos_security_owner;
GRANT SELECT, INSERT ON lifeos_security.backend_binding
  TO lifeos_security_owner;
GRANT SELECT ON lifeos_security.identity, lifeos_security."grant",
                lifeos_runtime.lease, lifeos_blob.object
  TO lifeos_security_owner;
GRANT INSERT ON lifeos_blob.object TO lifeos_security_owner;

CREATE OR REPLACE FUNCTION lifeos_security.current_binding()
RETURNS lifeos_security.backend_binding
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_security
AS $function$
  SELECT binding
  FROM lifeos_security.backend_binding binding
  JOIN pg_stat_activity backend
    ON backend.pid = binding.backend_pid
   AND backend.backend_start = binding.backend_start
   AND backend.datid = binding.database_oid
  WHERE binding.backend_pid = pg_backend_pid()
    AND binding.database_oid = (SELECT oid FROM pg_database
                                WHERE datname = current_database())
    AND binding.database_user = session_user
  ORDER BY binding.binding_sequence DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_security
AS $function$
  SELECT binding.tenant_id
  FROM lifeos_security.current_binding() binding
  JOIN lifeos_security."grant" grant_row
    ON grant_row.grant_id = binding.grant_id
   AND grant_row.tenant_id = binding.tenant_id
   AND grant_row.identity_id = binding.identity_id
   AND grant_row.revoked_at IS NULL
   AND grant_row.expires_at > statement_timestamp()
  LEFT JOIN lifeos_runtime.lease lease_row
    ON lease_row.lease_id = binding.lease_id
   AND lease_row.tenant_id = binding.tenant_id
   AND lease_row.holder_identity_id = binding.identity_id
  WHERE binding.expires_at > statement_timestamp()
    AND (binding.binding_kind = 'session' OR
         (lease_row.lease_id IS NOT NULL
          AND lease_row.revoked_at IS NULL
          AND lease_row.expires_at > statement_timestamp()))
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.bind_runtime_context(
  p_tenant_id uuid,
  p_identity_id uuid,
  p_grant_id uuid,
  p_lease_id uuid,
  p_binding_object_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  new_binding_id uuid;
  binding_expiry timestamptz;
BEGIN
  SELECT least(g.expires_at, l.expires_at)
  INTO STRICT binding_expiry
  FROM lifeos_security."grant" g
  JOIN lifeos_runtime.lease l ON l.lease_id = p_lease_id
  JOIN lifeos_security.identity i ON i.identity_id = p_identity_id
  JOIN lifeos_blob.object o ON o.object_id = p_binding_object_id
  WHERE g.grant_id = p_grant_id
    AND g.tenant_id = p_tenant_id
    AND g.identity_id = p_identity_id
    AND g.lease_id = p_lease_id
    AND g.task_id = l.task_id
    AND 'bind-runtime' = ANY (g.action_scope)
    AND g.revoked_at IS NULL
    AND g.expires_at > statement_timestamp()
    AND l.tenant_id = p_tenant_id
    AND l.holder_identity_id = p_identity_id
    AND l.revoked_at IS NULL
    AND l.expires_at > statement_timestamp()
    AND i.tenant_id = p_tenant_id
    AND i.subject_key = session_user
    AND o.tenant_id = p_tenant_id;

  INSERT INTO lifeos_security.backend_binding (
    backend_pid, backend_start, database_oid, database_user, binding_kind,
    tenant_id, identity_id, grant_id, lease_id, raw_object_id, expires_at
  ) VALUES (
    pg_backend_pid(), (SELECT backend_start FROM pg_stat_activity
                       WHERE pid = pg_backend_pid()),
    (SELECT oid FROM pg_database WHERE datname = current_database()),
    session_user, 'task', p_tenant_id, p_identity_id, p_grant_id,
    p_lease_id, p_binding_object_id, binding_expiry
  ) RETURNING binding_id INTO new_binding_id;

  RETURN new_binding_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.bootstrap_envctl_context(
  p_tenant_id uuid,
  p_identity_id uuid,
  p_grant_id uuid,
  p_binding_bytes bytea
) RETURNS TABLE (binding_id uuid, session_nonce uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  binding_payload jsonb;
  binding_object_id uuid;
  binding_expiry timestamptz;
  payload_sha bytea := extensions.digest(p_binding_bytes, 'sha256');
  payload_shake bytea := extensions.digest(p_binding_bytes, 'shake256');
BEGIN
  binding_payload := convert_from(p_binding_bytes, 'UTF8')::jsonb;
  IF binding_payload->>'tenant_id' <> p_tenant_id::text
     OR binding_payload->>'identity_id' <> p_identity_id::text
     OR binding_payload->>'grant_id' <> p_grant_id::text
     OR binding_payload->>'purpose' <> 'envctl-session-binding' THEN
    RAISE EXCEPTION 'binding bytes do not encode the requested authority';
  END IF;

  SELECT grant_row.expires_at INTO STRICT binding_expiry
  FROM lifeos_security."grant" grant_row
  JOIN lifeos_security.identity identity_row
    ON identity_row.identity_id = p_identity_id
   AND identity_row.tenant_id = p_tenant_id
   AND identity_row.subject_key = session_user
  WHERE grant_row.grant_id = p_grant_id
    AND grant_row.tenant_id = p_tenant_id
    AND grant_row.identity_id = p_identity_id
    AND grant_row.task_id IS NULL
    AND grant_row.lease_id IS NULL
    AND 'bind-session' = ANY (grant_row.action_scope)
    AND grant_row.revoked_at IS NULL
    AND grant_row.expires_at > statement_timestamp();

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance
  ) VALUES (
    p_tenant_id, payload_sha, payload_shake, octet_length(p_binding_bytes),
    'application/json', p_binding_bytes, false,
    jsonb_build_object('producer','envctl-bootstrap')
  ) ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO binding_object_id;
  IF binding_object_id IS NULL THEN
    SELECT object_id INTO STRICT binding_object_id
    FROM lifeos_blob.object
    WHERE tenant_id = p_tenant_id AND sha256 = payload_sha
      AND shake256 = payload_shake
      AND byte_length = octet_length(p_binding_bytes)
      AND bytes_inline = p_binding_bytes;
  END IF;
  INSERT INTO lifeos_blob.object_observation (
    tenant_id, object_id, call_kind, provenance_bytes, provenance_sha256
  ) VALUES (
    p_tenant_id, binding_object_id, 'envctl-bootstrap',
    convert_to(jsonb_build_object('grant_id',p_grant_id,
                                  'identity_id',p_identity_id)::text,'UTF8'),
    extensions.digest(convert_to(jsonb_build_object('grant_id',p_grant_id,
                                  'identity_id',p_identity_id)::text,'UTF8'),'sha256')
  );

  session_nonce := gen_random_uuid();
  INSERT INTO lifeos_security.backend_binding (
    backend_pid, backend_start, database_oid, database_user, session_nonce,
    binding_kind, tenant_id, identity_id, grant_id, raw_object_id, expires_at
  ) VALUES (
    pg_backend_pid(), (SELECT backend_start FROM pg_stat_activity
                       WHERE pid = pg_backend_pid()),
    (SELECT oid FROM pg_database WHERE datname = current_database()),
    session_user, session_nonce, 'session', p_tenant_id, p_identity_id,
    p_grant_id, binding_object_id, binding_expiry
  ) RETURNING lifeos_security.backend_binding.binding_id
    INTO binding_id;
  RETURN NEXT;
END
$function$;

REVOKE ALL ON FUNCTION lifeos_security.current_binding(),
                       lifeos_security.current_tenant()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_security.bind_runtime_context(
  uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_security.bootstrap_envctl_context(
  uuid, uuid, uuid, bytea
) FROM PUBLIC;
RESET ROLE;
GRANT CREATE ON SCHEMA lifeos_security TO lifeos_security_owner;
ALTER FUNCTION lifeos_security.current_tenant()
  OWNER TO lifeos_security_owner;
ALTER FUNCTION lifeos_security.current_binding()
  OWNER TO lifeos_security_owner;
ALTER FUNCTION lifeos_security.bind_runtime_context(
  uuid, uuid, uuid, uuid, uuid
) OWNER TO lifeos_security_owner;
ALTER FUNCTION lifeos_security.bootstrap_envctl_context(
  uuid, uuid, uuid, bytea
) OWNER TO lifeos_security_owner;
REVOKE CREATE ON SCHEMA lifeos_security FROM lifeos_security_owner;
GRANT EXECUTE ON FUNCTION lifeos_security.current_binding()
  TO lifeos_migrator;
GRANT EXECUTE ON FUNCTION lifeos_security.current_tenant()
  TO lifeos_migrator, lifeos_envctl, lifeos_runtime, lifeos_worker,
     lifeos_reader, lifeos_security_broker,
     lifeos_release, lifeos_backup;
GRANT EXECUTE ON FUNCTION lifeos_security.bind_runtime_context(
  uuid, uuid, uuid, uuid, uuid
) TO lifeos_runtime, lifeos_worker, lifeos_security_broker, lifeos_release;
GRANT EXECUTE ON FUNCTION lifeos_security.bootstrap_envctl_context(
  uuid, uuid, uuid, bytea
) TO lifeos_envctl;
SET ROLE lifeos_migrator;

DO $rls$
DECLARE
  relation_row record;
  policy_name text;
BEGIN
  FOR relation_row IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = ANY (ARRAY[
            'lifeos_blob','lifeos_semantic','lifeos_runtime','lifeos_agent',
            'lifeos_agentdb','lifeos_rvf','lifeos_security','lifeos_coord',
            'lifeos_release','lifeos_ops'
          ])
      AND c.relkind IN ('r','p')
      AND a.attname = 'tenant_id'
      AND NOT a.attisdropped
      AND NOT (n.nspname = 'lifeos_security'
               AND c.relname = 'backend_binding')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                   relation_row.schema_name, relation_row.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
                   relation_row.schema_name, relation_row.table_name);
    policy_name := left(relation_row.table_name || '_tenant_scope', 63);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polrelid = relation_row.oid AND polname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I USING (tenant_id = lifeos_security.current_tenant()) WITH CHECK (tenant_id = lifeos_security.current_tenant())',
        policy_name, relation_row.schema_name, relation_row.table_name
      );
    END IF;
  END LOOP;
END
$rls$;

ALTER TABLE lifeos_blob.object_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_blob.object_chunk FORCE ROW LEVEL SECURITY;
CREATE POLICY object_chunk_tenant_scope ON lifeos_blob.object_chunk
  USING (EXISTS (
    SELECT 1 FROM lifeos_blob.object parent
    WHERE parent.object_id = object_chunk.object_id
      AND parent.tenant_id = lifeos_security.current_tenant()
  ));

ALTER TABLE lifeos_semantic.lexical_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_semantic.lexical_document FORCE ROW LEVEL SECURITY;
CREATE POLICY lexical_document_tenant_scope
  ON lifeos_semantic.lexical_document
  USING (EXISTS (
    SELECT 1 FROM lifeos_blob.object parent
    WHERE parent.object_id = lexical_document.source_object_id
      AND parent.tenant_id = lifeos_security.current_tenant()
  ));

ALTER TABLE lifeos_runtime.request_hop ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_runtime.request_hop FORCE ROW LEVEL SECURITY;
CREATE POLICY request_hop_tenant_scope ON lifeos_runtime.request_hop
  USING (EXISTS (
    SELECT 1 FROM lifeos_runtime.request parent
    WHERE parent.request_id = request_hop.request_id
      AND parent.tenant_id = lifeos_security.current_tenant()
  ));

ALTER TABLE lifeos_runtime.branch_overlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_runtime.branch_overlay FORCE ROW LEVEL SECURITY;
CREATE POLICY branch_overlay_tenant_scope ON lifeos_runtime.branch_overlay
  USING (EXISTS (
    SELECT 1 FROM lifeos_runtime.branch parent
    WHERE parent.branch_id = branch_overlay.branch_id
      AND parent.tenant_id = lifeos_security.current_tenant()
  ));

ALTER TABLE lifeos_agent.witness_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_agent.witness_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY witness_entry_tenant_scope ON lifeos_agent.witness_entry
  USING (EXISTS (
    SELECT 1 FROM lifeos_agent.witness_chain parent
    WHERE parent.chain_id = witness_entry.chain_id
      AND parent.tenant_id = lifeos_security.current_tenant()
  ));

ALTER TABLE lifeos_runtime.request DROP CONSTRAINT IF EXISTS request_session_fk;
ALTER TABLE lifeos_runtime.request DROP CONSTRAINT IF EXISTS request_branch_fk;
ALTER TABLE lifeos_runtime.request DROP CONSTRAINT IF EXISTS request_identity_fk;
ALTER TABLE lifeos_runtime.request
  ADD CONSTRAINT request_session_fk
    FOREIGN KEY (session_id) REFERENCES lifeos_runtime.session,
  ADD CONSTRAINT request_branch_fk
    FOREIGN KEY (branch_id) REFERENCES lifeos_runtime.branch,
  ADD CONSTRAINT request_identity_fk
    FOREIGN KEY (identity_id) REFERENCES lifeos_security.identity;
ALTER TABLE lifeos_semantic.embedding DROP CONSTRAINT IF EXISTS embedding_transform_fk;
ALTER TABLE lifeos_semantic.embedding DROP CONSTRAINT IF EXISTS embedding_witness_fk;
ALTER TABLE lifeos_semantic.embedding
  ADD CONSTRAINT embedding_transform_fk
    FOREIGN KEY (transform_id) REFERENCES lifeos_semantic.transform,
  ADD CONSTRAINT embedding_witness_fk
    FOREIGN KEY (witness_id) REFERENCES lifeos_agent.witness_entry (witness_id);
ALTER TABLE lifeos_semantic.graph_node DROP CONSTRAINT IF EXISTS graph_node_witness_fk;
ALTER TABLE lifeos_semantic.graph_node
  ADD CONSTRAINT graph_node_witness_fk
    FOREIGN KEY (witness_id) REFERENCES lifeos_agent.witness_entry (witness_id);
ALTER TABLE lifeos_semantic.graph_edge DROP CONSTRAINT IF EXISTS graph_edge_witness_fk;
ALTER TABLE lifeos_semantic.graph_edge
  ADD CONSTRAINT graph_edge_witness_fk
    FOREIGN KEY (witness_id) REFERENCES lifeos_agent.witness_entry (witness_id);
ALTER TABLE lifeos_runtime.branch_overlay DROP CONSTRAINT IF EXISTS branch_overlay_execution_fk;
ALTER TABLE lifeos_runtime.branch_overlay DROP CONSTRAINT IF EXISTS branch_overlay_witness_fk;
ALTER TABLE lifeos_runtime.branch_overlay
  ADD CONSTRAINT branch_overlay_execution_fk
    FOREIGN KEY (execution_id) REFERENCES lifeos_runtime.execution,
  ADD CONSTRAINT branch_overlay_witness_fk
    FOREIGN KEY (witness_id) REFERENCES lifeos_agent.witness_entry (witness_id);
ALTER TABLE lifeos_agent.witness_entry DROP CONSTRAINT IF EXISTS witness_entry_execution_fk;
ALTER TABLE lifeos_agent.witness_entry
  ADD CONSTRAINT witness_entry_execution_fk
    FOREIGN KEY (execution_id) REFERENCES lifeos_runtime.execution;

CREATE OR REPLACE FUNCTION lifeos_blob.prevent_object_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'canonical object rows are append-only and never deleted';
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.prevent_chunk_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'canonical object chunks are never deleted';
  END IF;
  IF OLD.object_id IS DISTINCT FROM NEW.object_id
     OR OLD.chunk_no IS DISTINCT FROM NEW.chunk_no
     OR OLD.byte_offset IS DISTINCT FROM NEW.byte_offset
     OR OLD.data IS DISTINCT FROM NEW.data
     OR OLD.sha256 IS DISTINCT FROM NEW.sha256 THEN
    RAISE EXCEPTION 'canonical object chunks are immutable';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE TRIGGER object_immutable
  BEFORE UPDATE OR DELETE ON lifeos_blob.object
  FOR EACH ROW EXECUTE FUNCTION lifeos_blob.prevent_object_rewrite();
CREATE OR REPLACE TRIGGER object_chunk_immutable
  BEFORE UPDATE OR DELETE ON lifeos_blob.object_chunk
  FOR EACH ROW EXECUTE FUNCTION lifeos_blob.prevent_chunk_rewrite();
