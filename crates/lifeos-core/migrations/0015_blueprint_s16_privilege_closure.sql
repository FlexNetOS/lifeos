-- LifeOS migration 0015 — blueprint §16.3 log/index functions, privileges, closure (SQL block 6 of 6, verbatim after role preamble).
-- Packaging preamble only: restore the migrator session state the original
-- single-session §16 stream carried into this block.
SET ROLE lifeos_migrator;

CREATE OR REPLACE FUNCTION lifeos_runtime.append_log_frame(
  p_execution_id uuid,
  p_stream_name text,
  p_frame_no bigint,
  p_byte_offset bigint,
  p_frame bytea,
  p_context jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  execution_row lifeos_runtime.execution%ROWTYPE;
  frame_sha bytea := extensions.digest(p_frame, 'sha256');
  frame_object uuid;
  new_frame uuid;
BEGIN
  SELECT * INTO STRICT execution_row
  FROM lifeos_runtime.execution
  WHERE execution_id = p_execution_id;
  IF execution_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant()
     OR p_frame_no < 0 OR p_byte_offset < 0 THEN
    RAISE EXCEPTION 'log frame context is invalid';
  END IF;
  frame_object := lifeos_blob.store_bytes(
    execution_row.tenant_id,p_frame,'application/octet-stream',p_context,
    'execution-log-frame',p_execution_id);
  INSERT INTO lifeos_runtime.log_frame (
    tenant_id, execution_id, stream_name, frame_no, byte_offset,
    raw_object_id
  ) VALUES (
    execution_row.tenant_id, p_execution_id, p_stream_name, p_frame_no,
    p_byte_offset, frame_object
  ) RETURNING log_frame_id INTO new_frame;
  RETURN new_frame;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.guard_execution_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.state_code = 'completed' AND OLD.state_code <> 'completed' THEN
    IF NOT EXISTS (SELECT 1 FROM lifeos_runtime.result
                   WHERE execution_id = NEW.execution_id)
       OR (SELECT count(DISTINCT stream_name) FROM lifeos_runtime.log_frame
           WHERE execution_id = NEW.execution_id
             AND stream_name IN ('stdout','stderr')) <> 2
       OR EXISTS (
         SELECT 1 FROM (
           SELECT stream_name,frame_no,byte_offset,
             row_number() OVER (PARTITION BY stream_name ORDER BY frame_no)-1 AS expected_frame,
             coalesce(sum(octet_length(lifeos_blob.load_object_bytes(raw_object_id)))
               OVER (PARTITION BY stream_name ORDER BY frame_no
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS expected_offset
           FROM lifeos_runtime.log_frame WHERE execution_id = NEW.execution_id
         ) ordered WHERE frame_no <> expected_frame OR byte_offset <> expected_offset
       ) OR EXISTS (
         SELECT 1 FROM lifeos_runtime.effect
         WHERE execution_id = NEW.execution_id AND acknowledgement_object_id IS NULL
       ) OR NOT EXISTS (
         SELECT 1 FROM lifeos_agent.witness_entry
         WHERE execution_id = NEW.execution_id
           AND signer_identity = NEW.runner_identity_id
       ) OR NOT EXISTS (
         SELECT 1 FROM lifeos_runtime.lease
         WHERE lease_id = NEW.lease_id AND revoked_at IS NULL
           AND expires_at > statement_timestamp() AND acknowledged_at IS NULL
       ) THEN
      RAISE EXCEPTION 'execution completion lacks contiguous streams, receipts, active lease, result, or witness';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE TRIGGER execution_completion_guard
  BEFORE UPDATE OF state_code ON lifeos_runtime.execution
  FOR EACH ROW EXECUTE FUNCTION lifeos_runtime.guard_execution_completion();

CREATE OR REPLACE FUNCTION lifeos_runtime.guard_branch_head()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.head_generation <> OLD.head_generation THEN
    IF NEW.head_witness_id IS NULL OR NEW.head_witness_id IS NOT DISTINCT FROM OLD.head_witness_id THEN
      RAISE EXCEPTION 'branch head change requires a new witness';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM lifeos_agent.witness_entry entry
      JOIN lifeos_agent.witness_chain chain_row ON chain_row.chain_id=entry.chain_id
      WHERE entry.witness_id=NEW.head_witness_id
        AND chain_row.tenant_id=NEW.tenant_id
        AND chain_row.branch_id=NEW.branch_id
        AND convert_from(lifeos_blob.load_object_bytes(entry.canonical_object_id),'UTF8')::jsonb
            @> jsonb_build_object('branch_id',NEW.branch_id,
                                  'new_generation',NEW.head_generation)
    ) THEN
      RAISE EXCEPTION 'branch witness covers a different head';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE TRIGGER branch_head_witness_guard
  BEFORE UPDATE OF head_generation ON lifeos_runtime.branch
  FOR EACH ROW EXECUTE FUNCTION lifeos_runtime.guard_branch_head();

CREATE OR REPLACE FUNCTION lifeos_security.guard_secret_lease()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM lifeos_security."grant" grant_row
    JOIN lifeos_runtime.lease task_lease
      ON task_lease.lease_id = NEW.task_lease_id
    JOIN lifeos_security.secret_version version_row
      ON version_row.secret_version_id = NEW.secret_version_id
    JOIN lifeos_security.secret_object secret_row
      ON secret_row.secret_object_id = version_row.secret_object_id
    JOIN lifeos_security.identity target_row
      ON target_row.identity_id = NEW.target_identity_id
    WHERE grant_row.grant_id = NEW.grant_id
      AND grant_row.tenant_id = NEW.tenant_id
      AND task_lease.tenant_id = NEW.tenant_id
      AND version_row.tenant_id = NEW.tenant_id
      AND secret_row.tenant_id = NEW.tenant_id
      AND target_row.tenant_id = NEW.tenant_id
      AND grant_row.identity_id = NEW.target_identity_id
      AND grant_row.lease_id = NEW.task_lease_id
      AND grant_row.purpose = NEW.purpose
      AND grant_row.task_id = task_lease.task_id
      AND 'relay' = ANY(grant_row.action_scope)
      AND grant_row.resource_scope @>
          jsonb_build_object('secret_object_id',secret_row.secret_object_id)
      AND grant_row.revoked_at IS NULL
      AND grant_row.issued_at <= statement_timestamp()
      AND grant_row.expires_at >= NEW.expires_at
      AND task_lease.revoked_at IS NULL
      AND task_lease.expires_at >= NEW.expires_at
      AND version_row.retired_at IS NULL
      AND target_row.active_from <= statement_timestamp()
      AND (target_row.active_until IS NULL OR
           target_row.active_until > statement_timestamp())
  ) THEN
    RAISE EXCEPTION 'secret lease authority, scope, tenant, or lifetime is invalid';
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE TRIGGER secret_lease_grant_guard
  BEFORE INSERT ON lifeos_security.secret_lease
  FOR EACH ROW EXECUTE FUNCTION lifeos_security.guard_secret_lease();

CREATE OR REPLACE FUNCTION lifeos_release.guard_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE required_gate text;
BEGIN
  IF NEW.typed_payload->>'release_id' IS NULL
     OR NOT lifeos_blob.verify_object(NEW.raw_object_id) THEN
    RAISE EXCEPTION 'activation identity or bytes are invalid';
  END IF;
  FOREACH required_gate IN ARRAY ARRAY[
    'build','test','byte-reconstruction','retrieval','graph-causal','security',
    'model','forecast','witness','runner-receipt','rollback'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM lifeos_release.verification gate_row
      WHERE gate_row.tenant_id=NEW.tenant_id
        AND gate_row.typed_payload->>'release_id'=NEW.typed_payload->>'release_id'
        AND gate_row.typed_payload->>'gate'=required_gate
        AND (gate_row.typed_payload->>'passed')::boolean
        AND gate_row.witness_chain_id IS NOT NULL
        AND lifeos_blob.verify_object(gate_row.raw_object_id)
    ) THEN
      RAISE EXCEPTION 'activation gate % is not witnessed and byte-verified',required_gate;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM lifeos_release.manifest row_value
                 WHERE row_value.tenant_id=NEW.tenant_id
                   AND row_value.typed_payload->>'release_id'=NEW.typed_payload->>'release_id'
                   AND lifeos_blob.verify_object(row_value.raw_object_id))
     OR NOT EXISTS (SELECT 1 FROM lifeos_release.closure row_value
                    WHERE row_value.tenant_id=NEW.tenant_id
                      AND row_value.typed_payload->>'release_id'=NEW.typed_payload->>'release_id'
                      AND lifeos_blob.verify_object(row_value.raw_object_id))
     OR NOT EXISTS (SELECT 1 FROM lifeos_release.rollback row_value
                    WHERE row_value.tenant_id=NEW.tenant_id
                      AND row_value.typed_payload->>'release_id'=NEW.typed_payload->>'release_id'
                      AND lifeos_blob.verify_object(row_value.raw_object_id)) THEN
    RAISE EXCEPTION 'activation manifest, closure, or rollback bytes are invalid';
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE TRIGGER release_activation_guard
  BEFORE INSERT ON lifeos_release.activation
  FOR EACH ROW EXECUTE FUNCTION lifeos_release.guard_activation();

REVOKE ALL ON FUNCTION lifeos_blob.store_generated_object(uuid,jsonb,jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_blob.verify_object(uuid),
                       lifeos_blob.verify_object_internal(uuid),
                       lifeos_blob.verify_object_for_backup(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.ingest_event(bytea,bytea,jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.claim_task(uuid,jsonb,interval)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.complete_execution(uuid,jsonb,jsonb,jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.append_log_frame(
  uuid,text,bigint,bigint,bytea,jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_agent.append_witness(uuid,jsonb,bytea)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_agentdb.register_native_definition(
  text,text,uuid,bigint,bigint,text,uuid,uuid,bigint
), lifeos_agentdb.assert_native_inventory()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_blob.verify_object(uuid)
  TO lifeos_runtime, lifeos_worker, lifeos_release;
GRANT EXECUTE ON FUNCTION lifeos_blob.verify_object_for_backup(uuid)
  TO lifeos_backup;
GRANT EXECUTE ON FUNCTION lifeos_blob.store_generated_object(uuid,jsonb,jsonb)
  TO lifeos_runtime, lifeos_worker, lifeos_release;
GRANT EXECUTE ON FUNCTION lifeos_runtime.ingest_event(bytea,bytea,jsonb)
  TO lifeos_runtime;
GRANT EXECUTE ON FUNCTION lifeos_runtime.claim_task(uuid,jsonb,interval)
  TO lifeos_worker;
GRANT EXECUTE ON FUNCTION lifeos_runtime.complete_execution(uuid,jsonb,jsonb,jsonb)
  TO lifeos_worker;
GRANT EXECUTE ON FUNCTION lifeos_runtime.append_log_frame(
  uuid,text,bigint,bigint,bytea,jsonb
) TO lifeos_worker;
GRANT EXECUTE ON FUNCTION lifeos_agent.append_witness(uuid,jsonb,bytea)
  TO lifeos_worker, lifeos_release;
GRANT EXECUTE ON FUNCTION lifeos_agentdb.register_native_definition(
  text,text,uuid,bigint,bigint,text,uuid,uuid,bigint
), lifeos_agentdb.assert_native_inventory()
  TO lifeos_worker;
REVOKE ALL ON FUNCTION lifeos_semantic.enqueue_refresh(uuid,uuid),
                       lifeos_semantic.refresh_object(uuid),
                       lifeos_runtime.create_branch(uuid,text,text,jsonb,uuid),
                       lifeos_runtime.merge_branch(uuid,uuid,jsonb),
                       lifeos_runtime.resolve_conflict(uuid,jsonb),
                       lifeos_runtime.promote_branch(uuid,uuid,jsonb),
                       lifeos_security.authorize_secret(uuid,uuid,uuid,uuid,text),
                       lifeos_security.mint_secret(uuid,uuid,text,text,bytea,uuid),
                       lifeos_security.relay_secret(uuid,uuid,uuid,uuid,text,bytea,uuid),
                       lifeos_security.rotate_secret(uuid,uuid,text,text,bytea,uuid),
                       lifeos_security.revoke_secret(uuid,text,uuid),
                       lifeos_release.promote(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.enqueue_refresh(uuid,uuid),
                          lifeos_semantic.refresh_object(uuid)
  TO lifeos_worker;
GRANT EXECUTE ON FUNCTION lifeos_runtime.create_branch(uuid,text,text,jsonb,uuid),
                          lifeos_runtime.merge_branch(uuid,uuid,jsonb),
                          lifeos_runtime.resolve_conflict(uuid,jsonb),
                          lifeos_runtime.promote_branch(uuid,uuid,jsonb)
  TO lifeos_runtime;
GRANT EXECUTE ON FUNCTION lifeos_security.authorize_secret(uuid,uuid,uuid,uuid,text),
                          lifeos_security.mint_secret(uuid,uuid,text,text,bytea,uuid),
                          lifeos_security.relay_secret(uuid,uuid,uuid,uuid,text,bytea,uuid),
                          lifeos_security.rotate_secret(uuid,uuid,text,text,bytea,uuid),
                          lifeos_security.revoke_secret(uuid,text,uuid)
  TO lifeos_security_broker;
GRANT EXECUTE ON FUNCTION lifeos_release.promote(uuid)
  TO lifeos_release;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA lifeos_blob, lifeos_semantic, lifeos_runtime,
                     lifeos_agent, lifeos_agentdb, lifeos_rvf,
                     lifeos_security, lifeos_coord, lifeos_release,
                     lifeos_ops
  FROM PUBLIC;
GRANT USAGE ON SCHEMA lifeos_blob, lifeos_runtime, lifeos_security
  TO lifeos_runtime, lifeos_worker, lifeos_security_broker,
     lifeos_release, lifeos_backup;
GRANT USAGE ON SCHEMA lifeos_semantic, lifeos_agent, lifeos_agentdb,
                      lifeos_rvf
  TO lifeos_worker;
GRANT USAGE ON SCHEMA lifeos_release TO lifeos_release;

-- Final hardening migration. This block runs in the same migration session as
-- the preceding definitions and replaces broad helper behavior with exact,
-- tenant-bound, byte-preserving behavior before application roles are used.
CREATE UNIQUE INDEX IF NOT EXISTS object_tenant_identity
  ON lifeos_blob.object (tenant_id, object_id);
CREATE UNIQUE INDEX IF NOT EXISTS object_dual_digest_identity
  ON lifeos_blob.object (tenant_id, sha256, shake256, byte_length);

CREATE TABLE IF NOT EXISTS lifeos_blob.object_observation (
  observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  object_id uuid NOT NULL,
  call_kind text NOT NULL,
  provenance_bytes bytea NOT NULL,
  provenance_sha256 bytea NOT NULL CHECK (octet_length(provenance_sha256) = 32),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, object_id)
    REFERENCES lifeos_blob.object (tenant_id, object_id),
  CHECK (extensions.digest(provenance_bytes, 'sha256') = provenance_sha256)
);
CREATE INDEX IF NOT EXISTS object_observation_object
  ON lifeos_blob.object_observation (tenant_id, object_id, observed_at);
CREATE OR REPLACE TRIGGER object_observation_append_only
  BEFORE UPDATE OR DELETE ON lifeos_blob.object_observation
  FOR EACH ROW EXECUTE FUNCTION lifeos_ops.prevent_canonical_link_rewrite();
ALTER TABLE lifeos_blob.object_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_blob.object_observation FORCE ROW LEVEL SECURITY;
CREATE POLICY object_observation_tenant_scope
  ON lifeos_blob.object_observation
  USING (tenant_id = lifeos_security.current_tenant())
  WITH CHECK (tenant_id = lifeos_security.current_tenant());
GRANT INSERT ON lifeos_blob.object_observation TO lifeos_security_owner;

CREATE OR REPLACE FUNCTION lifeos_blob.canonical_jsonb_bytes(p_value jsonb)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
AS $function$
  SELECT convert_to(p_value::text, 'UTF8')
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.store_bytes(
  p_tenant_id uuid,
  p_payload bytea,
  p_media_type text,
  p_provenance jsonb,
  p_call_kind text,
  p_created_by_execution uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  payload_sha bytea := extensions.digest(p_payload, 'sha256');
  payload_shake bytea := extensions.digest(p_payload, 'shake256');
  stored_object_id uuid;
  provenance_bytes bytea := lifeos_blob.canonical_jsonb_bytes(p_provenance);
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_created_by_execution IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM lifeos_runtime.execution execution_row
       WHERE execution_row.execution_id = p_created_by_execution
         AND execution_row.tenant_id = p_tenant_id
     ) THEN
    RAISE EXCEPTION 'creating execution belongs to a different tenant';
  END IF;
  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, created_by_execution, provenance
  ) VALUES (
    p_tenant_id, payload_sha, payload_shake, octet_length(p_payload),
    p_media_type, p_payload, false, p_created_by_execution, p_provenance
  ) ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO stored_object_id;

  IF stored_object_id IS NULL THEN
    SELECT object_id INTO STRICT stored_object_id
    FROM lifeos_blob.object
    WHERE tenant_id = p_tenant_id
      AND sha256 = payload_sha
      AND shake256 = payload_shake
      AND byte_length = octet_length(p_payload)
      AND NOT chunked
      AND bytes_inline = p_payload;
  END IF;

  INSERT INTO lifeos_blob.object_observation (
    tenant_id, object_id, call_kind, provenance_bytes, provenance_sha256
  ) VALUES (
    p_tenant_id, stored_object_id, p_call_kind, provenance_bytes,
    extensions.digest(provenance_bytes, 'sha256')
  );
  RETURN stored_object_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.store_generated_object(
  p_tenant_id uuid,
  p_payload jsonb,
  p_provenance jsonb
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob
AS $function$
  SELECT lifeos_blob.store_bytes(
    p_tenant_id, lifeos_blob.canonical_jsonb_bytes(p_payload),
    'application/json', p_provenance, 'generated-json', NULL
  )
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.load_object_bytes(p_object_id uuid)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_security
AS $function$
DECLARE
  object_row lifeos_blob.object%ROWTYPE;
  reconstructed bytea;
BEGIN
  SELECT * INTO STRICT object_row FROM lifeos_blob.object
  WHERE object_id = p_object_id
    AND tenant_id = lifeos_security.current_tenant();
  IF object_row.chunked THEN
    SELECT coalesce(string_agg(data, ''::bytea ORDER BY chunk_no), ''::bytea)
      INTO reconstructed
    FROM lifeos_blob.object_chunk WHERE object_id = p_object_id;
  ELSE
    reconstructed := object_row.bytes_inline;
  END IF;
  IF NOT lifeos_blob.verify_object(p_object_id) THEN
    RAISE EXCEPTION 'canonical object failed reconstruction';
  END IF;
  RETURN reconstructed;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_ops.enforce_envelope_digest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob
AS $function$
DECLARE
  typed_bytes bytea := lifeos_blob.canonical_jsonb_bytes(NEW.typed_payload);
BEGIN
  NEW.record_digest := extensions.digest(typed_bytes, 'sha256');
  IF NOT lifeos_blob.verify_object(NEW.raw_object_id) THEN
    RAISE EXCEPTION 'envelope raw object failed byte verification';
  END IF;
  RETURN NEW;
END
$function$;

DO $envelope_guards$
DECLARE relation_row record;
BEGIN
  FOR relation_row IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY (ARRAY[
      'lifeos_blob','lifeos_semantic','lifeos_runtime','lifeos_agent',
      'lifeos_agentdb','lifeos_security','lifeos_coord','lifeos_release','lifeos_ops'
    ]) AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                  AND a.attname = 'typed_payload' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                  AND a.attname = 'record_digest' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS envelope_digest_guard ON %I.%I',
                   relation_row.nspname, relation_row.relname);
    EXECUTE format(
      'CREATE TRIGGER envelope_digest_guard BEFORE INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION lifeos_ops.enforce_envelope_digest()',
      relation_row.nspname, relation_row.relname
    );
  END LOOP;
END
$envelope_guards$;

-- Child rows receive an explicit tenant identity so tenant integrity can be
-- checked structurally instead of relying only on correlated RLS subqueries.
ALTER TABLE lifeos_blob.object_chunk ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE lifeos_blob.object_chunk child SET tenant_id = parent.tenant_id
FROM lifeos_blob.object parent WHERE child.object_id = parent.object_id;
ALTER TABLE lifeos_blob.object_chunk ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lifeos_blob.object_chunk DROP CONSTRAINT IF EXISTS object_chunk_tenant_fk;
ALTER TABLE lifeos_blob.object_chunk ADD CONSTRAINT object_chunk_tenant_fk
  FOREIGN KEY (tenant_id, object_id)
  REFERENCES lifeos_blob.object (tenant_id, object_id);

ALTER TABLE lifeos_semantic.lexical_document ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE lifeos_semantic.lexical_document child SET tenant_id = parent.tenant_id
FROM lifeos_blob.object parent WHERE child.source_object_id = parent.object_id;
ALTER TABLE lifeos_semantic.lexical_document ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE lifeos_runtime.request_hop ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE lifeos_runtime.request_hop child SET tenant_id = parent.tenant_id
FROM lifeos_runtime.request parent WHERE child.request_id = parent.request_id;
ALTER TABLE lifeos_runtime.request_hop ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE lifeos_runtime.branch_overlay ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE lifeos_runtime.branch_overlay child SET tenant_id = parent.tenant_id
FROM lifeos_runtime.branch parent WHERE child.branch_id = parent.branch_id;
ALTER TABLE lifeos_runtime.branch_overlay ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE lifeos_agent.witness_entry ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE lifeos_agent.witness_entry
  ADD COLUMN signature_verification_object_id uuid
    REFERENCES lifeos_blob.object (object_id);
UPDATE lifeos_agent.witness_entry child SET tenant_id = parent.tenant_id
FROM lifeos_agent.witness_chain parent WHERE child.chain_id = parent.chain_id;
ALTER TABLE lifeos_agent.witness_entry ALTER COLUMN tenant_id SET NOT NULL;
CREATE OR REPLACE TRIGGER witness_entry_append_only
  BEFORE UPDATE OR DELETE ON lifeos_agent.witness_entry
  FOR EACH ROW EXECUTE FUNCTION lifeos_ops.prevent_canonical_link_rewrite();

ALTER TABLE lifeos_runtime.result DROP CONSTRAINT IF EXISTS result_witness_pair;
ALTER TABLE lifeos_runtime.result DROP CONSTRAINT IF EXISTS result_witness_entry_fk;
ALTER TABLE lifeos_runtime.result
  ADD CONSTRAINT result_witness_pair CHECK (
    (witness_chain_id IS NULL) = (witness_sequence IS NULL)
  ),
  ADD CONSTRAINT result_witness_entry_fk
    FOREIGN KEY (witness_chain_id, witness_sequence)
    REFERENCES lifeos_agent.witness_entry (chain_id, sequence)
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION lifeos_ops.assert_reference_tenant(
  p_schema name, p_table name, p_id_column name, p_id uuid, p_tenant uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE found_row boolean;
BEGIN
  IF p_id IS NULL THEN RETURN; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1 AND tenant_id = $2)',
                 p_schema, p_table, p_id_column)
    INTO found_row USING p_id, p_tenant;
  IF NOT found_row THEN
    RAISE EXCEPTION 'cross-tenant or absent reference %.%.%=%',
      p_schema, p_table, p_id_column, p_id;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_ops.enforce_reference_tenants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_ops
AS $function$
DECLARE row_value jsonb := to_jsonb(NEW); key_name text; reference_id uuid;
BEGIN
  FOREACH key_name IN ARRAY ARRAY[
    'raw_object_id','source_object_id','canonical_object_id','payload_object_id',
    'typed_object_id','input_object_id','output_object_id','nix_closure_object_id',
    'request_object_id','response_object_id','acknowledgement_object_id',
    'rollback_object_id','ciphertext_object_id','range_map_object_id',
    'member_object_id','parameter_object_id','result_object_id',
    'public_key_object_id','signature_object_id','verification_object_id',
    'signature_verification_object_id',
    'reconstructed_object_id','receipt_object_id','exported_object_id',
    'binding_object_id','directory_entry_object_id','row_object_id'
  ] LOOP
    IF row_value ? key_name AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      reference_id := (row_value->>key_name)::uuid;
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_blob','object','object_id',reference_id,NEW.tenant_id);
    END IF;
  END LOOP;
  IF row_value ? 'branch_id' AND TG_TABLE_NAME <> 'branch'
     AND nullif(row_value->>'branch_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_runtime','branch','branch_id',(row_value->>'branch_id')::uuid,NEW.tenant_id);
  END IF;
  IF row_value ? 'parent_branch_id'
     AND nullif(row_value->>'parent_branch_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_runtime','branch','branch_id',(row_value->>'parent_branch_id')::uuid,NEW.tenant_id);
  END IF;
  FOREACH key_name IN ARRAY ARRAY[
    'identity_id','holder_identity_id','runner_identity_id','signer_identity',
    'signer_identity_id','target_identity_id','peer_identity_id','created_by'
  ] LOOP
    IF row_value ? key_name
       AND NOT (TG_TABLE_SCHEMA = 'lifeos_security'
                AND TG_TABLE_NAME = 'identity'
                AND key_name = 'identity_id')
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_security','identity','identity_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['task_id','parent_task_id','depends_on_task_id'] LOOP
    IF row_value ? key_name
       AND NOT (TG_TABLE_SCHEMA = 'lifeos_runtime'
                AND TG_TABLE_NAME = 'task'
                AND key_name = 'task_id')
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_runtime','task','task_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY[
    'execution_id','envctl_execution_id','source_execution_id','created_by_execution'
  ] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'execution'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_runtime','execution','execution_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['request_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'request'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_runtime','request','request_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['session_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'session'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_runtime','session','session_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['lease_id','task_lease_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'lease'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_runtime','lease','lease_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['witness_chain_id','chain_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'witness_chain'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_agent','witness_chain','chain_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['policy_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'policy'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_security','policy','policy_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['grant_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'grant'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_security','grant','grant_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['secret_object_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'secret_object'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_security','secret_object','secret_object_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY['secret_version_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'secret_version'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_security','secret_version','secret_version_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY ARRAY[
    'container_id','parent_container_id','child_container_id',
    'source_container_id','derived_container_id'
  ] LOOP
    IF row_value ? key_name
       AND NOT (TG_TABLE_SCHEMA = 'lifeos_rvf'
                AND TG_TABLE_NAME = 'container'
                AND key_name = 'container_id')
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_rvf','container','container_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  IF TG_TABLE_SCHEMA='lifeos_rvf' AND TG_TABLE_NAME='container' THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_blob','object','object_id',(row_value->>'object_id')::uuid,NEW.tenant_id);
  END IF;
  FOREACH key_name IN ARRAY ARRAY['segment_id','witness_segment_id','signed_segment_id'] LOOP
    IF row_value ? key_name AND TG_TABLE_NAME <> 'segment'
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_rvf','segment','segment_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  IF row_value ? 'manifest_id' AND TG_TABLE_NAME <> 'manifest'
     AND nullif(row_value->>'manifest_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_rvf','manifest','manifest_id',(row_value->>'manifest_id')::uuid,NEW.tenant_id);
  END IF;
  IF row_value ? 'rvf_witness_id' AND TG_TABLE_NAME <> 'witness'
     AND nullif(row_value->>'rvf_witness_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_rvf','witness','rvf_witness_id',(row_value->>'rvf_witness_id')::uuid,NEW.tenant_id);
  END IF;
  IF row_value ? 'inbox_id' AND TG_TABLE_NAME <> 'inbox'
     AND nullif(row_value->>'inbox_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_runtime','inbox','inbox_id',(row_value->>'inbox_id')::uuid,NEW.tenant_id);
  END IF;
  FOREACH key_name IN ARRAY ARRAY['from_node','to_node'] LOOP
    IF row_value ? key_name AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_semantic','graph_node','node_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  IF row_value ? 'embedding_id' AND TG_TABLE_NAME <> 'embedding'
     AND nullif(row_value->>'embedding_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_semantic','embedding','embedding_id',(row_value->>'embedding_id')::uuid,NEW.tenant_id);
  END IF;
  IF row_value ? 'vector_id' AND nullif(row_value->>'vector_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_semantic','embedding','embedding_id',(row_value->>'vector_id')::uuid,NEW.tenant_id);
  END IF;
  IF row_value ? 'graph_edge_id'
     AND nullif(row_value->>'graph_edge_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_semantic','graph_edge','edge_id',(row_value->>'graph_edge_id')::uuid,NEW.tenant_id);
  END IF;
  IF row_value ? 'transform_id' AND TG_TABLE_NAME <> 'transform'
     AND nullif(row_value->>'transform_id','') IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_semantic','transform','transform_id',(row_value->>'transform_id')::uuid,NEW.tenant_id);
  END IF;
  FOREACH key_name IN ARRAY ARRAY['witness_id','head_witness_id','lifeos_witness_id'] LOOP
    IF row_value ? key_name
       AND NOT (TG_TABLE_SCHEMA = 'lifeos_agent'
                AND TG_TABLE_NAME = 'witness_entry'
                AND key_name = 'witness_id')
       AND nullif(row_value->>key_name,'') IS NOT NULL THEN
      PERFORM lifeos_ops.assert_reference_tenant(
        'lifeos_agent','witness_entry','witness_id',(row_value->>key_name)::uuid,NEW.tenant_id);
    END IF;
  END LOOP;
  IF TG_TABLE_SCHEMA = 'lifeos_agentdb'
     AND TG_TABLE_NAME = 'native_definition'
     AND nullif(row_value->'typed_payload'->>'generated_ddl_object_id','')
           IS NOT NULL THEN
    PERFORM lifeos_ops.assert_reference_tenant(
      'lifeos_blob','object','object_id',
      (row_value->'typed_payload'->>'generated_ddl_object_id')::uuid,
      NEW.tenant_id);
  END IF;
  RETURN NEW;
END
$function$;

DO $tenant_guards$
DECLARE relation_row record;
BEGIN
  FOR relation_row IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = ANY (ARRAY[
      'lifeos_blob','lifeos_semantic','lifeos_runtime','lifeos_agent',
      'lifeos_agentdb','lifeos_rvf','lifeos_security','lifeos_coord',
      'lifeos_release','lifeos_ops'
    ]) AND c.relkind = 'r' AND a.attname = 'tenant_id' AND NOT a.attisdropped
      AND NOT (n.nspname = 'lifeos_blob' AND c.relname = 'object')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tenant_reference_guard ON %I.%I',
                   relation_row.nspname, relation_row.relname);
    EXECUTE format(
      'CREATE TRIGGER tenant_reference_guard BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION lifeos_ops.enforce_reference_tenants()',
      relation_row.nspname, relation_row.relname
    );
  END LOOP;
END
$tenant_guards$;

CREATE OR REPLACE FUNCTION lifeos_semantic.enforce_embedding_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_semantic
AS $function$
DECLARE
  expected_dimension integer := split_part(TG_TABLE_NAME, '_', 3)::integer;
  parent_row lifeos_semantic.embedding%ROWTYPE;
BEGIN
  SELECT * INTO STRICT parent_row FROM lifeos_semantic.embedding
  WHERE embedding_id = NEW.embedding_id;
  IF expected_dimension <> parent_row.dimension
     OR NEW.tenant_id <> parent_row.tenant_id
     OR NEW.branch_id <> parent_row.branch_id
     OR NEW.model_digest <> parent_row.model_digest
     OR NEW.generation <> parent_row.generation
     OR NEW.source_object_id <> parent_row.source_object_id
     OR NEW.embedding::text <> parent_row.embedding::text THEN
    RAISE EXCEPTION 'embedding projection differs from its canonical parent';
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE TRIGGER embedding_append_only
  BEFORE UPDATE OR DELETE ON lifeos_semantic.embedding
  FOR EACH ROW EXECUTE FUNCTION lifeos_ops.prevent_canonical_link_rewrite();
DO $embedding_append_guards$
DECLARE dimension integer; table_name text;
BEGIN
  FOREACH dimension IN ARRAY ARRAY[384,768,1024,1536,3072] LOOP
    table_name := 'embedding_index_' || dimension::text;
    EXECUTE format(
      'CREATE TRIGGER embedding_projection_append_only BEFORE UPDATE OR DELETE ON lifeos_semantic.%I FOR EACH ROW EXECUTE FUNCTION lifeos_ops.prevent_canonical_link_rewrite()',
      table_name);
  END LOOP;
END
$embedding_append_guards$;

CREATE OR REPLACE FUNCTION lifeos_agent.append_witness(
  p_chain_id uuid,
  p_canonical_record jsonb,
  p_signature bytea
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_agent,
                  lifeos_security
AS $function$
DECLARE
  chain_row lifeos_agent.witness_chain%ROWTYPE;
  object_row lifeos_blob.object%ROWTYPE;
  canonical_object uuid := (p_canonical_record->>'canonical_object_id')::uuid;
  verification_object uuid :=
    (p_canonical_record->>'signature_verification_object_id')::uuid;
  signer uuid := (p_canonical_record->>'signer_identity')::uuid;
  proof jsonb;
  next_sequence bigint;
  next_digest bytea;
  new_witness_id uuid;
BEGIN
  SELECT * INTO STRICT chain_row FROM lifeos_agent.witness_chain
  WHERE chain_id = p_chain_id FOR UPDATE;
  IF chain_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant()
     OR (p_canonical_record ? 'branch_id'
         AND p_canonical_record->>'branch_id' <> chain_row.branch_id::text)
     OR NOT EXISTS (
       SELECT 1 FROM lifeos_security.current_binding() binding
       WHERE binding.tenant_id = chain_row.tenant_id
         AND binding.identity_id = signer
         AND binding.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'witness signer is not the active bound identity';
  END IF;
  SELECT * INTO STRICT object_row FROM lifeos_blob.object
  WHERE object_id = canonical_object AND tenant_id = chain_row.tenant_id;
  proof := convert_from(lifeos_blob.load_object_bytes(verification_object),'UTF8')::jsonb;
  IF p_signature IS NULL OR octet_length(p_signature) = 0
     OR coalesce((proof->>'verified')::boolean,false) IS NOT TRUE
     OR proof->>'signer_identity' <> signer::text
     OR proof->>'signature_sha256' <>
        encode(extensions.digest(p_signature,'sha256'),'hex') THEN
    RAISE EXCEPTION 'cryptographic witness verification receipt is invalid';
  END IF;
  next_sequence := chain_row.head_sequence + 1;
  next_digest := extensions.digest(
    convert_to('lifeos-witness-v1', 'UTF8') || chain_row.head_shake256 ||
    object_row.shake256 || lifeos_blob.canonical_jsonb_bytes(
      p_canonical_record - 'signature_verification_object_id'),
    'shake256'
  );
  IF proof->>'signed_digest' <> encode(next_digest,'hex') THEN
    RAISE EXCEPTION 'signature receipt covers a different witness digest';
  END IF;
  INSERT INTO lifeos_agent.witness_entry (
    tenant_id, chain_id, sequence, previous_shake256, canonical_object_id,
    entry_shake256, source_object_id, source_range, vector_id, graph_edge_id,
    request_id, execution_id, signer_identity, signature,
    signature_verification_object_id
  ) VALUES (
    chain_row.tenant_id, p_chain_id, next_sequence, chain_row.head_shake256,
    canonical_object, next_digest,
    nullif(p_canonical_record->>'source_object_id','')::uuid,
    CASE WHEN p_canonical_record ? 'byte_start' THEN
      int8range((p_canonical_record->>'byte_start')::bigint,
                (p_canonical_record->>'byte_end')::bigint,'[)') END,
    nullif(p_canonical_record->>'vector_id','')::uuid,
    nullif(p_canonical_record->>'graph_edge_id','')::uuid,
    nullif(p_canonical_record->>'request_id','')::uuid,
    nullif(p_canonical_record->>'execution_id','')::uuid,
    signer, p_signature, verification_object
  ) RETURNING witness_id INTO new_witness_id;
  UPDATE lifeos_agent.witness_chain
  SET head_sequence = next_sequence, head_shake256 = next_digest
  WHERE chain_id = p_chain_id;
  RETURN new_witness_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_rvf.assert_container(p_container_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_rvf,
                  lifeos_security
AS $function$
DECLARE
  container_row lifeos_rvf.container%ROWTYPE;
  container_bytes bytea;
  manifest_count bigint;
  expected_segment_count bigint;
  segment_row record;
  previous_end bigint := 0;
  segment_bytes bytea;
BEGIN
  SELECT * INTO STRICT container_row FROM lifeos_rvf.container
  WHERE container_id = p_container_id
    AND tenant_id = lifeos_security.current_tenant();
  container_bytes := lifeos_blob.load_object_bytes(container_row.object_id);
  IF octet_length(container_bytes)::bigint <> container_row.file_length
     OR extensions.digest(container_bytes,'sha256') <> container_row.sha256
     OR extensions.digest(container_bytes,'shake256') <> container_row.shake256 THEN
    RAISE EXCEPTION 'RVF container bytes do not match its canonical identity';
  END IF;
  SELECT count(*), coalesce(max(manifest_row.segment_count),0)
    INTO manifest_count, expected_segment_count
  FROM lifeos_rvf.manifest manifest_row
  WHERE manifest_row.container_id = p_container_id;
  IF manifest_count <> 1 THEN
    RAISE EXCEPTION 'RVF container requires exactly one active manifest';
  END IF;
  IF expected_segment_count <> (SELECT count(*) FROM lifeos_rvf.segment
                        WHERE container_id = p_container_id) THEN
    RAISE EXCEPTION 'RVF manifest segment count differs from the directory';
  END IF;
  IF (SELECT count(*) FROM lifeos_rvf.segment_directory
      WHERE container_id = p_container_id) <> expected_segment_count
     OR EXISTS (
       SELECT 1 FROM lifeos_rvf.segment segment_row
       WHERE segment_row.container_id = p_container_id
         AND NOT EXISTS (SELECT 1 FROM lifeos_rvf.segment_directory directory_row
                         WHERE directory_row.container_id = p_container_id
                           AND directory_row.segment_id = segment_row.segment_id)
     ) THEN
    RAISE EXCEPTION 'RVF segment directory does not cover every segment exactly once';
  END IF;
  FOR segment_row IN SELECT * FROM lifeos_rvf.segment
    WHERE container_id = p_container_id ORDER BY byte_offset, segment_no
  LOOP
    IF segment_row.byte_offset < previous_end
       OR segment_row.byte_offset + segment_row.byte_length > container_row.file_length THEN
      RAISE EXCEPTION 'RVF segment ranges overlap or exceed the container';
    END IF;
    segment_bytes := lifeos_blob.load_object_bytes(segment_row.raw_object_id);
    IF octet_length(segment_bytes)::bigint <> segment_row.byte_length
       OR extensions.digest(segment_bytes,'sha256') <> segment_row.sha256
       OR extensions.digest(segment_bytes,'shake256') <> segment_row.shake256
       OR substring(container_bytes FROM (segment_row.byte_offset + 1)::integer
                    FOR segment_row.byte_length::integer) <> segment_bytes THEN
      RAISE EXCEPTION 'RVF segment bytes differ from the container slice';
    END IF;
    previous_end := segment_row.byte_offset + segment_row.byte_length;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM lifeos_rvf.import_receipt receipt
    WHERE receipt.container_id = p_container_id
      AND (lifeos_blob.load_object_bytes(receipt.reconstructed_object_id) <>
           container_bytes OR lifeos_blob.load_object_bytes(receipt.source_object_id) <>
           container_bytes OR NOT receipt.exact_match)
  ) OR EXISTS (
    SELECT 1 FROM lifeos_rvf.export_receipt receipt
    WHERE receipt.container_id = p_container_id
      AND (extensions.digest(lifeos_blob.load_object_bytes(receipt.exported_object_id),'sha256') <>
             receipt.expected_sha256 OR
           extensions.digest(lifeos_blob.load_object_bytes(receipt.exported_object_id),'shake256') <>
             receipt.expected_shake256 OR
           lifeos_blob.load_object_bytes(receipt.exported_object_id) <> container_bytes)
  ) THEN
    RAISE EXCEPTION 'RVF import or export reconstruction differs byte-for-byte';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_rvf.deferred_container_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE container_identity uuid;
BEGIN
  container_identity := CASE TG_TABLE_NAME
    WHEN 'container' THEN NEW.container_id
    ELSE NEW.container_id
  END;
  PERFORM lifeos_rvf.assert_container(container_identity);
  RETURN NULL;
END
$function$;
DO $rvf_integrity_triggers$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'container','manifest','segment','segment_directory','import_receipt','export_receipt'
  ] LOOP
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER rvf_complete_byte_guard AFTER INSERT ON lifeos_rvf.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lifeos_rvf.deferred_container_guard()',
      table_name);
  END LOOP;
END
$rvf_integrity_triggers$;

CREATE OR REPLACE FUNCTION lifeos_agentdb.assert_native_inventory()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_agentdb, lifeos_security
AS $function$
DECLARE expected record; actual_count bigint; distinct_count bigint;
        definition_row record;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('table',24::bigint),('index',55::bigint),
    ('trigger',6::bigint),('view',8::bigint)
  ) AS inventory(definition_kind,expected_count) LOOP
    SELECT count(*), count(DISTINCT typed_payload->>'native_name')
      INTO actual_count, distinct_count
    FROM lifeos_agentdb.native_definition
    WHERE tenant_id = lifeos_security.current_tenant()
      AND typed_payload->>'definition_kind' = expected.definition_kind;
    IF actual_count <> expected.expected_count
       OR distinct_count <> expected.expected_count THEN
      RAISE EXCEPTION 'AgentDB inventory is not exact for %',expected.definition_kind;
    END IF;
  END LOOP;
  FOR definition_row IN SELECT definition.*,
      source.byte_length AS source_length
    FROM lifeos_agentdb.native_definition definition
    JOIN lifeos_blob.object source ON source.object_id = definition.raw_object_id
    WHERE definition.tenant_id = lifeos_security.current_tenant()
  LOOP
    IF (definition_row.typed_payload->>'byte_start')::bigint < 0
       OR (definition_row.typed_payload->>'byte_end')::bigint > definition_row.source_length
       OR NOT lifeos_blob.verify_object(definition_row.raw_object_id)
       OR NOT lifeos_blob.verify_object(
         (definition_row.typed_payload->>'generated_ddl_object_id')::uuid) THEN
      RAISE EXCEPTION 'AgentDB definition source, range, or generated DDL is invalid';
    END IF;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.guard_log_frame_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.stream_name NOT IN ('stdout','stderr','binary','audit','protocol')
     OR NEW.frame_no < 0 OR NEW.byte_offset < 0
     OR NOT EXISTS (
       SELECT 1 FROM lifeos_runtime.execution execution_row
       JOIN lifeos_runtime.lease lease_row ON lease_row.lease_id=execution_row.lease_id
       JOIN lifeos_security.current_binding() binding
         ON binding.identity_id=execution_row.runner_identity_id
        AND binding.tenant_id=execution_row.tenant_id
        AND binding.binding_kind='task'
        AND binding.lease_id=execution_row.lease_id
       WHERE execution_row.execution_id=NEW.execution_id
         AND execution_row.tenant_id=NEW.tenant_id
         AND execution_row.state_code='running'
         AND lease_row.revoked_at IS NULL
         AND lease_row.expires_at > statement_timestamp()
         AND binding.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'log frame writer, lease, stream, or position is invalid';
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE TRIGGER log_frame_writer_guard
  BEFORE INSERT ON lifeos_runtime.log_frame
  FOR EACH ROW EXECUTE FUNCTION lifeos_runtime.guard_log_frame_insert();

REVOKE ALL ON FUNCTION lifeos_rvf.assert_container(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lifeos_runtime.ingest_event(bytea,bytea,jsonb)
  FROM lifeos_runtime;
GRANT EXECUTE ON FUNCTION lifeos_runtime.ingest_event(bytea,bytea,jsonb)
  TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_blob.store_bytes(
  uuid,bytea,text,jsonb,text,uuid
), lifeos_blob.canonical_jsonb_bytes(jsonb),
   lifeos_blob.load_object_bytes(uuid),
   lifeos_ops.assert_reference_tenant(name,name,name,uuid,uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_blob.store_bytes(
  uuid,bytea,text,jsonb,text,uuid
) TO lifeos_envctl,lifeos_runtime,lifeos_worker,lifeos_release;
GRANT EXECUTE ON FUNCTION lifeos_blob.canonical_jsonb_bytes(jsonb)
  TO lifeos_migrator,lifeos_envctl,lifeos_runtime,lifeos_worker,
     lifeos_security_owner,lifeos_security_broker,lifeos_release;
GRANT EXECUTE ON FUNCTION lifeos_blob.load_object_bytes(uuid)
  TO lifeos_envctl,lifeos_runtime,lifeos_worker,lifeos_release;

GRANT USAGE ON SCHEMA lifeos_blob,lifeos_semantic,lifeos_runtime,
  lifeos_agent,lifeos_agentdb,lifeos_rvf,lifeos_coord,lifeos_release
  TO lifeos_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA lifeos_blob,lifeos_semantic,
  lifeos_runtime,lifeos_agent,lifeos_agentdb,lifeos_rvf,lifeos_coord,
  lifeos_release TO lifeos_reader;
GRANT USAGE ON SCHEMA lifeos_security,lifeos_runtime,lifeos_blob
  TO lifeos_envctl;
GRANT USAGE ON SCHEMA lifeos_semantic TO lifeos_runtime;
GRANT SELECT ON lifeos_runtime.request,lifeos_runtime.request_hop,
  lifeos_runtime.result,lifeos_runtime.log_frame,lifeos_runtime.outbox,
  lifeos_semantic.embedding,lifeos_semantic.lexical_document,
  lifeos_semantic.graph_node,lifeos_semantic.graph_edge
  TO lifeos_runtime;

-- Packaging: the closure REVOKE below covers lifeos_security functions owned by
-- lifeos_security_owner; migrator lacks privilege on them, so run the final
-- privilege-closure section as the login role (superuser), intent unchanged.
RESET ROLE;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA lifeos_blob,lifeos_semantic,
  lifeos_runtime,lifeos_agent,lifeos_agentdb,lifeos_rvf,lifeos_security,
  lifeos_coord,lifeos_release,lifeos_ops FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE lifeos_migrator
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE lifeos_migrator
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE lifeos_migrator
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
RESET ROLE;
