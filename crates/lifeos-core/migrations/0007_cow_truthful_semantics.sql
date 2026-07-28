-- Truthful COW semantics for INV-011.
--
-- Migrations 0005 and 0006 are checksum-pinned.  This migration is the only
-- corrective layer: legacy entry points are revoked, all new witnesses are
-- derived inside PostgreSQL from canonical versioned preimages, and capability
-- reporting is gated by durable acceptance receipts rather than object
-- existence.

DO $lifeos_cow_v2_prerequisites$
BEGIN
  IF to_regclass('lifeos_runtime.branch') IS NULL
     OR to_regclass('lifeos_agent.branch_witness') IS NULL
     OR to_regclass('lifeos_runtime.branch_overlay') IS NULL
     OR to_regclass('lifeos_runtime.promotion') IS NULL
     OR to_regprocedure('lifeos_runtime.cow_branch_capability()') IS NULL THEN
    RAISE EXCEPTION
      'LifeOS COW semantic migration requires checksum-pinned migrations 0005 and 0006';
  END IF;
  IF to_regprocedure('extensions.ruvector_shake256_256(bytea)') IS NULL THEN
    RAISE EXCEPTION
      'LifeOS COW semantic migration requires extensions.ruvector_shake256_256(bytea)';
  END IF;
END
$lifeos_cow_v2_prerequisites$;

ALTER TABLE lifeos_runtime.branch
  ADD COLUMN canonical_ceiling BIGINT;
UPDATE lifeos_runtime.branch SET canonical_ceiling = 0
WHERE canonical_ceiling IS NULL;
ALTER TABLE lifeos_runtime.branch
  ALTER COLUMN canonical_ceiling SET NOT NULL,
  ALTER COLUMN canonical_ceiling SET DEFAULT 0,
  ADD CONSTRAINT lifeos_branch_canonical_ceiling_nonnegative
    CHECK (canonical_ceiling >= 0);

ALTER TABLE lifeos_agent.branch_witness
  ADD COLUMN tenant_id UUID,
  ADD COLUMN preimage_version SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN preimage_object_id BIGINT REFERENCES lifeos_blob.object(id),
  ADD COLUMN witness_context JSONB;
ALTER TABLE lifeos_agent.branch_witness
  DISABLE TRIGGER lifeos_append_only;
UPDATE lifeos_agent.branch_witness witness
SET tenant_id = branch.tenant_id
FROM lifeos_runtime.branch branch
WHERE branch.branch_id = witness.branch_id
  AND witness.tenant_id IS NULL;
ALTER TABLE lifeos_agent.branch_witness
  ENABLE TRIGGER lifeos_append_only;
ALTER TABLE lifeos_agent.branch_witness
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT lifeos_branch_witness_preimage_shape CHECK (
    (preimage_version = 0
      AND preimage_object_id IS NULL
      AND witness_context IS NULL)
    OR
    (preimage_version = 1
      AND preimage_object_id IS NOT NULL
      AND jsonb_typeof(witness_context) = 'object')
  );

ALTER TABLE lifeos_runtime.branch_overlay
  ADD COLUMN tenant_id UUID,
  ADD COLUMN effect_id UUID,
  ADD COLUMN request_digest BYTEA;
ALTER TABLE lifeos_runtime.branch_overlay
  DISABLE TRIGGER lifeos_append_only;
UPDATE lifeos_runtime.branch_overlay overlay
SET tenant_id = branch.tenant_id
FROM lifeos_runtime.branch branch
WHERE branch.branch_id = overlay.branch_id
  AND overlay.tenant_id IS NULL;
ALTER TABLE lifeos_runtime.branch_overlay
  ENABLE TRIGGER lifeos_append_only;
ALTER TABLE lifeos_runtime.branch_overlay
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT lifeos_overlay_request_digest_shape
    CHECK (request_digest IS NULL OR octet_length(request_digest) = 32);

ALTER TABLE lifeos_runtime.merge_gate
  ADD COLUMN tenant_id UUID,
  ADD COLUMN execution_id UUID,
  ADD COLUMN effect_id UUID,
  ADD COLUMN request_digest BYTEA;
ALTER TABLE lifeos_runtime.merge_gate
  DISABLE TRIGGER lifeos_append_only;
UPDATE lifeos_runtime.merge_gate gate
SET tenant_id = branch.tenant_id
FROM lifeos_runtime.branch branch
WHERE branch.branch_id = gate.branch_id
  AND gate.tenant_id IS NULL;
ALTER TABLE lifeos_runtime.merge_gate
  ENABLE TRIGGER lifeos_append_only;
ALTER TABLE lifeos_runtime.merge_gate
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT lifeos_merge_gate_request_digest_shape
    CHECK (request_digest IS NULL OR octet_length(request_digest) = 32);

ALTER TABLE lifeos_runtime.merge_conflict
  ADD COLUMN request_id UUID,
  ADD COLUMN execution_id UUID,
  ADD COLUMN effect_id UUID,
  ADD COLUMN conflict_ordinal SMALLINT,
  ADD CONSTRAINT lifeos_merge_conflict_ordinal_range
    CHECK (conflict_ordinal IS NULL OR conflict_ordinal BETWEEN 1 AND 7);

ALTER TABLE lifeos_runtime.merge_conflict_resolution
  ADD COLUMN tenant_id UUID,
  ADD COLUMN operation TEXT,
  ADD COLUMN row_json JSONB,
  ADD COLUMN row_digest BYTEA,
  ADD COLUMN execution_id UUID,
  ADD COLUMN effect_id UUID,
  ADD COLUMN request_digest BYTEA;
ALTER TABLE lifeos_runtime.merge_conflict_resolution
  DISABLE TRIGGER lifeos_append_only;
UPDATE lifeos_runtime.merge_conflict_resolution resolution
SET tenant_id = conflict.tenant_id
FROM lifeos_runtime.merge_conflict conflict
WHERE conflict.merge_conflict_id = resolution.merge_conflict_id
  AND resolution.tenant_id IS NULL;
ALTER TABLE lifeos_runtime.merge_conflict_resolution
  ENABLE TRIGGER lifeos_append_only;
ALTER TABLE lifeos_runtime.merge_conflict_resolution
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT lifeos_resolution_operation
    CHECK (operation IS NULL OR operation IN ('insert', 'update', 'delete')),
  ADD CONSTRAINT lifeos_resolution_row_digest_shape
    CHECK (row_digest IS NULL OR octet_length(row_digest) = 32),
  ADD CONSTRAINT lifeos_resolution_request_digest_shape
    CHECK (request_digest IS NULL OR octet_length(request_digest) = 32);

ALTER TABLE lifeos_runtime.promotion
  ADD COLUMN execution_id UUID,
  ADD COLUMN effect_id UUID,
  ADD COLUMN request_digest BYTEA,
  ADD COLUMN snapshot_digest BYTEA;
ALTER TABLE lifeos_runtime.promotion
  ADD CONSTRAINT lifeos_promotion_request_digest_shape
    CHECK (request_digest IS NULL OR octet_length(request_digest) = 32),
  ADD CONSTRAINT lifeos_promotion_snapshot_digest_shape
    CHECK (snapshot_digest IS NULL OR octet_length(snapshot_digest) = 32);

DO $lifeos_rvf_generation_bounds$
DECLARE
  target_table REGCLASS;
  constraint_name TEXT;
BEGIN
  FOR target_table, constraint_name IN
    SELECT *
    FROM (VALUES
      ('lifeos_rvf.container'::regclass, 'lifeos_rvf_container_generation_u32'),
      ('lifeos_rvf.cow_map'::regclass, 'lifeos_rvf_cow_map_generation_u32'),
      ('lifeos_rvf.membership'::regclass, 'lifeos_rvf_membership_generation_u32'),
      ('lifeos_rvf.branch_roundtrip_receipt'::regclass,
       'lifeos_rvf_receipt_generation_u32')
    ) AS bounds(target_table, constraint_name)
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I CHECK (generation <= 4294967295)',
      target_table,
      constraint_name
    );
  END LOOP;
END
$lifeos_rvf_generation_bounds$;

CREATE SEQUENCE lifeos_rvf.vector_id_seq
  AS BIGINT MINVALUE 0 START WITH 1 NO CYCLE;

CREATE TABLE lifeos_rvf.member_vector_identity (
  tenant_id UUID NOT NULL,
  relation_name REGCLASS NOT NULL,
  member_key_digest BYTEA NOT NULL
    CHECK (octet_length(member_key_digest) = 32),
  vector_id BIGINT NOT NULL DEFAULT nextval('lifeos_rvf.vector_id_seq')
    CHECK (vector_id >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, relation_name, member_key_digest),
  UNIQUE (tenant_id, vector_id)
);

ALTER TABLE lifeos_rvf.membership
  ADD COLUMN vector_id BIGINT;
INSERT INTO lifeos_rvf.member_vector_identity (
  tenant_id, relation_name, member_key_digest
)
SELECT DISTINCT tenant_id, relation_name, member_key_digest
FROM lifeos_rvf.membership
ON CONFLICT DO NOTHING;
ALTER TABLE lifeos_rvf.membership
  DISABLE TRIGGER lifeos_append_only;
UPDATE lifeos_rvf.membership membership
SET vector_id = identity.vector_id
FROM lifeos_rvf.member_vector_identity identity
WHERE identity.tenant_id = membership.tenant_id
  AND identity.relation_name = membership.relation_name
  AND identity.member_key_digest = membership.member_key_digest
  AND membership.vector_id IS NULL;
ALTER TABLE lifeos_rvf.membership
  ENABLE TRIGGER lifeos_append_only;
ALTER TABLE lifeos_rvf.membership
  ALTER COLUMN vector_id SET NOT NULL,
  ADD CONSTRAINT lifeos_rvf_membership_vector_identity_fk
    FOREIGN KEY (tenant_id, relation_name, member_key_digest)
    REFERENCES lifeos_rvf.member_vector_identity(
      tenant_id, relation_name, member_key_digest
    );

CREATE TABLE lifeos_runtime.cow_request (
  request_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (btrim(operation) <> ''),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  input_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  input_digest BYTEA NOT NULL CHECK (octet_length(input_digest) = 32),
  execution_id UUID NOT NULL,
  effect_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, operation, idempotency_key)
);

CREATE TABLE lifeos_runtime.cow_request_result (
  request_id UUID PRIMARY KEY
    REFERENCES lifeos_runtime.cow_request(request_id),
  tenant_id UUID NOT NULL,
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  result_digest BYTEA NOT NULL CHECK (octet_length(result_digest) = 32),
  witness_id UUID REFERENCES lifeos_agent.branch_witness(witness_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE lifeos_runtime.canonical_projection (
  canonical_sequence BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL,
  relation_name REGCLASS NOT NULL,
  logical_key JSONB NOT NULL CHECK (jsonb_typeof(logical_key) = 'object'),
  logical_key_digest BYTEA NOT NULL
    CHECK (octet_length(logical_key_digest) = 32),
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  base_digest BYTEA CHECK (
    base_digest IS NULL OR octet_length(base_digest) = 32
  ),
  row_object_id BIGINT REFERENCES lifeos_blob.object(id),
  row_json JSONB,
  row_digest BYTEA CHECK (
    row_digest IS NULL OR octet_length(row_digest) = 32
  ),
  record_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  record_digest BYTEA NOT NULL CHECK (octet_length(record_digest) = 32),
  request_id UUID NOT NULL REFERENCES lifeos_runtime.cow_request(request_id),
  execution_id UUID NOT NULL,
  effect_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, request_id),
  CHECK (
    (operation = 'delete'
      AND row_object_id IS NULL
      AND row_json IS NULL
      AND row_digest IS NULL)
    OR
    (operation IN ('insert', 'update')
      AND row_object_id IS NOT NULL
      AND row_digest IS NOT NULL)
  )
);
CREATE INDEX lifeos_canonical_projection_lookup_idx
  ON lifeos_runtime.canonical_projection(
    tenant_id, relation_name, logical_key_digest, canonical_sequence DESC
  );

CREATE TABLE lifeos_runtime.merge_conflict_application (
  application_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  resolution_id UUID NOT NULL UNIQUE
    REFERENCES lifeos_runtime.merge_conflict_resolution(resolution_id),
  target_branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  target_overlay_sequence BIGINT NOT NULL,
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  request_id UUID NOT NULL REFERENCES lifeos_runtime.cow_request(request_id),
  execution_id UUID NOT NULL,
  effect_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (target_branch_id, target_overlay_sequence, resolution_id)
);

CREATE TABLE lifeos_runtime.cow_acceptance_receipt (
  receipt_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  receipt_schema_version SMALLINT NOT NULL CHECK (receipt_schema_version = 1),
  receipt_kind TEXT NOT NULL CHECK (
    receipt_kind IN ('database-semantics', 'native-rvf-roundtrip')
  ),
  suite_version TEXT NOT NULL CHECK (btrim(suite_version) <> ''),
  accepted BOOLEAN NOT NULL,
  evidence_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  evidence_digest BYTEA NOT NULL CHECK (octet_length(evidence_digest) = 32),
  receipt_preimage_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  receipt_digest BYTEA NOT NULL CHECK (octet_length(receipt_digest) = 32),
  execution_id UUID NOT NULL,
  effect_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (receipt_kind, suite_version, idempotency_key)
);

DO $lifeos_cow_v2_append_only$
DECLARE
  target REGCLASS;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'lifeos_rvf.member_vector_identity'::regclass,
    'lifeos_runtime.cow_request'::regclass,
    'lifeos_runtime.cow_request_result'::regclass,
    'lifeos_runtime.canonical_projection'::regclass,
    'lifeos_runtime.merge_conflict_application'::regclass,
    'lifeos_runtime.cow_acceptance_receipt'::regclass
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER lifeos_append_only BEFORE UPDATE OR DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION lifeos_runtime.reject_append_only_mutation()',
      target
    );
  END LOOP;
END
$lifeos_cow_v2_append_only$;

CREATE OR REPLACE FUNCTION lifeos_runtime.current_tenant()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT nullif(current_setting('lifeos.tenant_id', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.require_tenant(expected_tenant UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, lifeos_runtime
AS $function$
DECLARE
  session_tenant UUID := lifeos_runtime.current_tenant();
BEGIN
  IF session_tenant IS NULL THEN
    RAISE EXCEPTION 'lifeos.tenant_id must be set for COW operations';
  END IF;
  IF session_tenant IS DISTINCT FROM expected_tenant THEN
    RAISE EXCEPTION
      'tenant isolation violation: session tenant % cannot access tenant %',
      session_tenant,
      expected_tenant;
  END IF;
END
$function$;

DO $lifeos_cow_v2_rls$
DECLARE
  target REGCLASS;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'lifeos_runtime.branch'::regclass,
    'lifeos_agent.branch_witness'::regclass,
    'lifeos_runtime.branch_overlay'::regclass,
    'lifeos_runtime.merge_gate'::regclass,
    'lifeos_runtime.merge_conflict'::regclass,
    'lifeos_runtime.merge_conflict_resolution'::regclass,
    'lifeos_runtime.promotion'::regclass,
    'lifeos_runtime.branch_pointer'::regclass,
    'lifeos_rvf.container'::regclass,
    'lifeos_rvf.cow_map'::regclass,
    'lifeos_rvf.membership'::regclass,
    'lifeos_rvf.branch_roundtrip_receipt'::regclass,
    'lifeos_rvf.member_vector_identity'::regclass,
    'lifeos_runtime.cow_request'::regclass,
    'lifeos_runtime.cow_request_result'::regclass,
    'lifeos_runtime.canonical_projection'::regclass,
    'lifeos_runtime.merge_conflict_application'::regclass
  ]
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY lifeos_tenant_isolation ON %s
       USING (
         tenant_id = nullif(current_setting(''lifeos.tenant_id'', true), '''')::uuid
       )
       WITH CHECK (
         tenant_id = nullif(current_setting(''lifeos.tenant_id'', true), '''')::uuid
       )',
      target
    );
  END LOOP;
END
$lifeos_cow_v2_rls$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_preimage_v1(
  preimage_kind TEXT,
  payload JSONB
) RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $function$
BEGIN
  IF btrim(preimage_kind) = '' OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'canonical COW preimages require a kind and JSON object';
  END IF;
  RETURN convert_to(
    'lifeos.cow-preimage.v1' || chr(10)
      || jsonb_build_object(
           'kind', preimage_kind,
           'payload', payload,
           'version', 1
         )::text,
    'UTF8'
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_digest_v1(
  preimage_kind TEXT,
  payload JSONB
) RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, extensions, lifeos_runtime
AS $function$
  SELECT extensions.ruvector_shake256_256(
    lifeos_runtime.cow_preimage_v1(preimage_kind, payload)
  )
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.begin_cow_request_v2(
  request_tenant UUID,
  request_operation TEXT,
  request_idempotency_key TEXT,
  request_input JSONB,
  request_execution UUID,
  request_effect UUID
) RETURNS TABLE (
  request_id UUID,
  request_digest BYTEA,
  replayed BOOLEAN,
  prior_result JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  canonical_input BYTEA;
  canonical_object BIGINT;
  canonical_digest BYTEA;
  request_row lifeos_runtime.cow_request%ROWTYPE;
  result_row lifeos_runtime.cow_request_result%ROWTYPE;
BEGIN
  PERFORM lifeos_runtime.require_tenant(request_tenant);
  IF btrim(coalesce(request_operation, '')) = ''
     OR btrim(coalesce(request_idempotency_key, '')) = ''
     OR jsonb_typeof(request_input) <> 'object'
     OR request_execution IS NULL
     OR request_effect IS NULL THEN
    RAISE EXCEPTION 'complete COW request provenance is required';
  END IF;
  canonical_input := lifeos_runtime.cow_preimage_v1(
    'request',
    jsonb_build_object(
      'effect_id', request_effect,
      'execution_id', request_execution,
      'idempotency_key', request_idempotency_key,
      'input', request_input,
      'operation', request_operation,
      'tenant_id', request_tenant
    )
  );
  canonical_digest := extensions.ruvector_shake256_256(canonical_input);
  canonical_object := lifeos_runtime.store_generated_object(
    canonical_input,
    'cow-request-preimage-v1'
  );

  INSERT INTO lifeos_runtime.cow_request (
    tenant_id, operation, idempotency_key, input_object_id, input_digest,
    execution_id, effect_id
  ) VALUES (
    request_tenant, request_operation, request_idempotency_key,
    canonical_object, canonical_digest, request_execution, request_effect
  )
  ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING;

  SELECT * INTO STRICT request_row
  FROM lifeos_runtime.cow_request request
  WHERE request.tenant_id = request_tenant
    AND request.operation = request_operation
    AND request.idempotency_key = request_idempotency_key
  FOR UPDATE;

  IF request_row.input_digest <> canonical_digest
     OR request_row.execution_id <> request_execution
     OR request_row.effect_id <> request_effect
     OR NOT EXISTS (
       SELECT 1
       FROM lifeos_blob.object object
       WHERE object.id = request_row.input_object_id
         AND object.raw_bytes = canonical_input
     ) THEN
    RAISE EXCEPTION
      'full-input idempotency collision for operation % and key %',
      request_operation,
      request_idempotency_key;
  END IF;

  SELECT * INTO result_row
  FROM lifeos_runtime.cow_request_result result
  WHERE result.request_id = request_row.request_id;

  RETURN QUERY SELECT
    request_row.request_id,
    canonical_digest,
    FOUND,
    result_row.result;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.complete_cow_request_v2(
  target_request UUID,
  request_tenant UUID,
  request_result JSONB,
  result_witness UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_runtime
AS $function$
DECLARE
  result_digest BYTEA;
BEGIN
  PERFORM lifeos_runtime.require_tenant(request_tenant);
  IF jsonb_typeof(request_result) <> 'object' THEN
    RAISE EXCEPTION 'COW request result must be a JSON object';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_runtime.cow_request request
    WHERE request.request_id = target_request
      AND request.tenant_id = request_tenant
  ) THEN
    RAISE EXCEPTION 'COW request is outside the session tenant';
  END IF;
  result_digest := lifeos_runtime.cow_digest_v1(
    'request-result',
    jsonb_build_object(
      'request_id', target_request,
      'result', request_result,
      'tenant_id', request_tenant
    )
  );
  INSERT INTO lifeos_runtime.cow_request_result (
    request_id, tenant_id, result, result_digest, witness_id
  ) VALUES (
    target_request, request_tenant, request_result, result_digest, result_witness
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agent.append_branch_witness_v2(
  target_branch UUID,
  target_generation BIGINT,
  target_kind TEXT,
  target_payload_object BIGINT,
  target_context JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  payload_row lifeos_blob.object%ROWTYPE;
  prior_shake256 BYTEA;
  canonical_payload JSONB;
  canonical_preimage BYTEA;
  preimage_object BIGINT;
  derived_shake256 BYTEA;
  new_witness UUID;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR UPDATE;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF target_generation < 0 OR target_generation > branch_row.head_generation THEN
    RAISE EXCEPTION
      'witness generation % is outside branch head %',
      target_generation,
      branch_row.head_generation;
  END IF;
  IF btrim(coalesce(target_kind, '')) = ''
     OR jsonb_typeof(target_context) <> 'object' THEN
    RAISE EXCEPTION 'witness kind and context are required';
  END IF;
  SELECT * INTO STRICT payload_row
  FROM lifeos_blob.object
  WHERE id = target_payload_object;
  SELECT witness.entry_shake256 INTO prior_shake256
  FROM lifeos_agent.branch_witness witness
  WHERE witness.branch_id = target_branch
  ORDER BY witness.sequence DESC
  LIMIT 1;
  prior_shake256 := coalesce(
    prior_shake256,
    decode(repeat('00', 32), 'hex')
  );
  canonical_payload := jsonb_build_object(
    'branch_id', target_branch,
    'generation', target_generation,
    'payload', jsonb_build_object(
      'byte_length', payload_row.byte_length,
      'object_id', payload_row.id,
      'sha256', payload_row.sha256
    ),
    'previous_shake256', encode(prior_shake256, 'hex'),
    'tenant_id', branch_row.tenant_id,
    'witness_context', target_context,
    'witness_kind', target_kind
  );
  canonical_preimage := lifeos_runtime.cow_preimage_v1(
    'branch-witness',
    canonical_payload
  );
  derived_shake256 := extensions.ruvector_shake256_256(canonical_preimage);
  preimage_object := lifeos_runtime.store_generated_object(
    canonical_preimage,
    'cow-witness-preimage-v1'
  );
  INSERT INTO lifeos_agent.branch_witness (
    tenant_id, branch_id, generation, witness_kind, previous_shake256,
    entry_shake256, payload_object_id, preimage_version, preimage_object_id,
    witness_context
  ) VALUES (
    branch_row.tenant_id, target_branch, target_generation, target_kind,
    prior_shake256, derived_shake256, target_payload_object, 1,
    preimage_object, target_context
  )
  RETURNING witness_id INTO new_witness;
  RETURN new_witness;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_rvf.stable_vector_id_v2(
  target_tenant UUID,
  target_relation REGCLASS,
  target_key_digest BYTEA
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_rvf
AS $function$
DECLARE
  resolved_vector_id BIGINT;
BEGIN
  PERFORM lifeos_runtime.require_tenant(target_tenant);
  IF octet_length(target_key_digest) <> 32 THEN
    RAISE EXCEPTION 'RVF member key digest must contain exactly 32 bytes';
  END IF;
  INSERT INTO lifeos_rvf.member_vector_identity (
    tenant_id, relation_name, member_key_digest
  ) VALUES (
    target_tenant, target_relation, target_key_digest
  )
  ON CONFLICT (tenant_id, relation_name, member_key_digest) DO NOTHING;
  SELECT vector_id INTO STRICT resolved_vector_id
  FROM lifeos_rvf.member_vector_identity
  WHERE tenant_id = target_tenant
    AND relation_name = target_relation
    AND member_key_digest = target_key_digest;
  RETURN resolved_vector_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.put_canonical_projection_v2(
  target_tenant UUID,
  target_relation REGCLASS,
  target_key JSONB,
  target_operation TEXT,
  target_base_digest BYTEA,
  replacement_bytes BYTEA,
  replacement_json JSONB,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  request_state RECORD;
  key_digest BYTEA;
  current_row lifeos_runtime.canonical_projection%ROWTYPE;
  current_exists BOOLEAN := false;
  row_object BIGINT;
  row_digest BYTEA;
  record_payload JSONB;
  record_bytes BYTEA;
  record_object BIGINT;
  record_digest BYTEA;
  new_sequence BIGINT;
  result JSONB;
BEGIN
  key_digest := extensions.digest(convert_to(target_key::text, 'UTF8'), 'sha256');
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    target_tenant,
    'put-canonical-projection',
    target_idempotency_key,
    jsonb_build_object(
      'base_digest', CASE WHEN target_base_digest IS NULL THEN NULL
                          ELSE encode(target_base_digest, 'hex') END,
      'logical_key', target_key,
      'operation', target_operation,
      'relation_name', target_relation::text,
      'replacement_bytes', CASE WHEN replacement_bytes IS NULL THEN NULL
                                ELSE encode(replacement_bytes, 'hex') END,
      'replacement_json', replacement_json
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN request_state.prior_result;
  END IF;
  IF jsonb_typeof(target_key) <> 'object'
     OR target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'invalid canonical projection operation';
  END IF;
  IF target_base_digest IS NOT NULL
     AND octet_length(target_base_digest) <> 32 THEN
    RAISE EXCEPTION 'base digest must contain exactly 32 bytes';
  END IF;
  IF target_operation = 'delete'
     AND (replacement_bytes IS NOT NULL OR replacement_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete operations cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND replacement_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update operations require replacement bytes';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      target_tenant::text || ':' || target_relation::text || ':'
        || encode(key_digest, 'hex'),
      7001
    )
  );
  SELECT * INTO current_row
  FROM lifeos_runtime.canonical_projection projection
  WHERE projection.tenant_id = target_tenant
    AND projection.relation_name = target_relation
    AND projection.logical_key_digest = key_digest
  ORDER BY projection.canonical_sequence DESC
  LIMIT 1;
  current_exists := FOUND AND current_row.operation <> 'delete';

  IF target_operation = 'insert' THEN
    IF current_exists OR target_base_digest IS NOT NULL THEN
      RAISE EXCEPTION
        'canonical insert requires an absent key and NULL base digest';
    END IF;
  ELSE
    IF NOT current_exists THEN
      RAISE EXCEPTION
        'canonical % requires an existing key',
        target_operation;
    END IF;
    IF target_base_digest IS NULL
       OR target_base_digest <> current_row.row_digest THEN
      RAISE EXCEPTION
        'canonical % base digest precondition failed',
        target_operation;
    END IF;
  END IF;

  IF replacement_bytes IS NOT NULL THEN
    row_object := lifeos_runtime.store_generated_object(
      replacement_bytes,
      'cow-canonical-row'
    );
    row_digest := extensions.ruvector_shake256_256(replacement_bytes);
  END IF;
  PERFORM lifeos_rvf.stable_vector_id_v2(
    target_tenant,
    target_relation,
    key_digest
  );
  record_payload := jsonb_build_object(
    'base_digest', CASE WHEN target_base_digest IS NULL THEN NULL
                        ELSE encode(target_base_digest, 'hex') END,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'logical_key', target_key,
    'logical_key_digest', encode(key_digest, 'hex'),
    'operation', target_operation,
    'relation_name', target_relation::text,
    'request_id', request_state.request_id,
    'row_digest', CASE WHEN row_digest IS NULL THEN NULL
                       ELSE encode(row_digest, 'hex') END,
    'tenant_id', target_tenant
  );
  record_bytes := lifeos_runtime.cow_preimage_v1(
    'canonical-projection-record',
    record_payload
  );
  record_object := lifeos_runtime.store_generated_object(
    record_bytes,
    'cow-canonical-record-v1'
  );
  record_digest := extensions.ruvector_shake256_256(record_bytes);
  INSERT INTO lifeos_runtime.canonical_projection (
    tenant_id, relation_name, logical_key, logical_key_digest, operation,
    base_digest, row_object_id, row_json, row_digest, record_object_id,
    record_digest, request_id, execution_id, effect_id
  ) VALUES (
    target_tenant, target_relation, target_key, key_digest, target_operation,
    target_base_digest, row_object, replacement_json, row_digest, record_object,
    record_digest, request_state.request_id, target_execution, target_effect
  )
  RETURNING canonical_sequence INTO new_sequence;
  result := jsonb_build_object(
    'canonical_sequence', new_sequence,
    'record_digest', encode(record_digest, 'hex'),
    'row_digest', CASE WHEN row_digest IS NULL THEN NULL
                       ELSE encode(row_digest, 'hex') END
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    target_tenant,
    result
  );
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_branch_record_v2(
  target_branch UUID,
  target_generation BIGINT,
  target_relation REGCLASS,
  target_key JSONB
) RETURNS TABLE (
  state_exists BOOLEAN,
  source_kind TEXT,
  source_branch_id UUID,
  source_depth INTEGER,
  operation TEXT,
  row_object_id BIGINT,
  row_json JSONB,
  row_digest BYTEA,
  logical_key_digest BYTEA
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF target_generation < 0 OR target_generation > branch_row.head_generation THEN
    RAISE EXCEPTION
      'requested generation % is outside branch head %',
      target_generation,
      branch_row.head_generation;
  END IF;
  RETURN QUERY
  WITH RECURSIVE ancestry AS (
    SELECT
      branch.branch_id,
      0 AS depth,
      target_generation AS generation_ceiling,
      branch.parent_branch_id,
      branch.parent_generation
    FROM lifeos_runtime.branch branch
    WHERE branch.branch_id = target_branch
    UNION ALL
    SELECT
      parent.branch_id,
      ancestry.depth + 1,
      least(ancestry.parent_generation, parent.head_generation),
      parent.parent_branch_id,
      parent.parent_generation
    FROM ancestry
    JOIN lifeos_runtime.branch parent
      ON parent.branch_id = ancestry.parent_branch_id
  ),
  selected_overlay AS (
    SELECT
      overlay.operation,
      overlay.row_object_id,
      overlay.row_json,
      overlay.logical_key_digest,
      overlay.branch_id,
      ancestry.depth
    FROM ancestry
    JOIN lifeos_runtime.branch_overlay overlay
      ON overlay.branch_id = ancestry.branch_id
     AND overlay.generation <= ancestry.generation_ceiling
    WHERE overlay.relation_name = target_relation
      AND overlay.logical_key_digest = extensions.digest(
        convert_to(target_key::text, 'UTF8'),
        'sha256'
      )
      AND overlay.logical_key = target_key
    ORDER BY ancestry.depth, overlay.generation DESC, overlay.sequence DESC
    LIMIT 1
  ),
  selected_canonical AS (
    SELECT
      projection.operation,
      projection.row_object_id,
      projection.row_json,
      projection.row_digest,
      projection.logical_key_digest
    FROM lifeos_runtime.canonical_projection projection
    WHERE projection.tenant_id = branch_row.tenant_id
      AND projection.relation_name = target_relation
      AND projection.logical_key_digest = extensions.digest(
        convert_to(target_key::text, 'UTF8'),
        'sha256'
      )
      AND projection.logical_key = target_key
      AND projection.canonical_sequence <= branch_row.canonical_ceiling
    ORDER BY projection.canonical_sequence DESC
    LIMIT 1
  )
  SELECT
    overlay.operation <> 'delete',
    'overlay'::text,
    overlay.branch_id,
    overlay.depth,
    overlay.operation,
    overlay.row_object_id,
    overlay.row_json,
    CASE
      WHEN overlay.operation = 'delete' THEN NULL
      ELSE extensions.ruvector_shake256_256(object.raw_bytes)
    END,
    overlay.logical_key_digest
  FROM selected_overlay overlay
  LEFT JOIN lifeos_blob.object object ON object.id = overlay.row_object_id
  UNION ALL
  SELECT
    canonical.operation <> 'delete',
    'canonical'::text,
    NULL::uuid,
    NULL::integer,
    canonical.operation,
    canonical.row_object_id,
    canonical.row_json,
    canonical.row_digest,
    canonical.logical_key_digest
  FROM selected_canonical canonical
  WHERE NOT EXISTS (SELECT 1 FROM selected_overlay);
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.materialize_branch_v2(
  target_branch UUID,
  target_generation BIGINT
) RETURNS BYTEA
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  materialized JSONB;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF target_generation < 0 OR target_generation > branch_row.head_generation THEN
    RAISE EXCEPTION 'cannot materialize an invalid branch generation';
  END IF;
  WITH RECURSIVE ancestry AS (
    SELECT
      branch.branch_id,
      0 AS depth,
      target_generation AS generation_ceiling,
      branch.parent_branch_id,
      branch.parent_generation
    FROM lifeos_runtime.branch branch
    WHERE branch.branch_id = target_branch
    UNION ALL
    SELECT
      parent.branch_id,
      ancestry.depth + 1,
      least(ancestry.parent_generation, parent.head_generation),
      parent.parent_branch_id,
      parent.parent_generation
    FROM ancestry
    JOIN lifeos_runtime.branch parent
      ON parent.branch_id = ancestry.parent_branch_id
  ),
  overlay_ranked AS (
    SELECT
      overlay.relation_name,
      overlay.logical_key,
      overlay.logical_key_digest,
      overlay.operation,
      overlay.row_object_id,
      overlay.row_json,
      row_number() OVER (
        PARTITION BY overlay.relation_name, overlay.logical_key_digest
        ORDER BY ancestry.depth, overlay.generation DESC, overlay.sequence DESC
      ) AS rank
    FROM ancestry
    JOIN lifeos_runtime.branch_overlay overlay
      ON overlay.branch_id = ancestry.branch_id
     AND overlay.generation <= ancestry.generation_ceiling
  ),
  canonical_ranked AS (
    SELECT
      projection.relation_name,
      projection.logical_key,
      projection.logical_key_digest,
      projection.operation,
      projection.row_object_id,
      projection.row_json,
      row_number() OVER (
        PARTITION BY projection.relation_name, projection.logical_key_digest
        ORDER BY projection.canonical_sequence DESC
      ) AS rank
    FROM lifeos_runtime.canonical_projection projection
    WHERE projection.tenant_id = branch_row.tenant_id
      AND projection.canonical_sequence <= branch_row.canonical_ceiling
  ),
  resolved AS (
    SELECT
      overlay.relation_name,
      overlay.logical_key,
      overlay.logical_key_digest,
      overlay.operation,
      overlay.row_object_id,
      overlay.row_json,
      'overlay'::text AS source_kind
    FROM overlay_ranked overlay
    WHERE overlay.rank = 1
    UNION ALL
    SELECT
      canonical.relation_name,
      canonical.logical_key,
      canonical.logical_key_digest,
      canonical.operation,
      canonical.row_object_id,
      canonical.row_json,
      'canonical'::text
    FROM canonical_ranked canonical
    WHERE canonical.rank = 1
      AND NOT EXISTS (
        SELECT 1 FROM overlay_ranked overlay
        WHERE overlay.rank = 1
          AND overlay.relation_name = canonical.relation_name
          AND overlay.logical_key_digest = canonical.logical_key_digest
      )
  )
  SELECT jsonb_build_object(
    'branch_id', target_branch,
    'canonical_ceiling', branch_row.canonical_ceiling,
    'generation', target_generation,
    'members', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'logical_key', resolved.logical_key,
          'logical_key_digest', encode(resolved.logical_key_digest, 'hex'),
          'operation', resolved.operation,
          'relation_name', resolved.relation_name::text,
          'row_bytes', CASE WHEN object.id IS NULL THEN NULL
                            ELSE encode(object.raw_bytes, 'hex') END,
          'row_json', resolved.row_json,
          'source_kind', resolved.source_kind
        )
        ORDER BY
          resolved.relation_name::text,
          encode(resolved.logical_key_digest, 'hex')
      ),
      '[]'::jsonb
    ),
    'schema', 'lifeos.cow-materialization.v1',
    'tenant_id', branch_row.tenant_id
  ) INTO materialized
  FROM resolved
  LEFT JOIN lifeos_blob.object object ON object.id = resolved.row_object_id;
  RETURN convert_to(materialized::text, 'UTF8');
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.validate_branch_policy_v2(
  branch_policy JSONB
) RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
BEGIN
  IF jsonb_typeof(branch_policy) <> 'object' THEN
    RAISE EXCEPTION 'branch policy must be a JSON object';
  END IF;
  IF branch_policy ? 'required_gates'
     AND jsonb_typeof(branch_policy->'required_gates') <> 'array' THEN
    RAISE EXCEPTION 'required_gates must be an array';
  END IF;
  IF branch_policy ? 'conflict_classes'
     AND (
       jsonb_typeof(branch_policy->'conflict_classes') <> 'array'
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(branch_policy->'conflict_classes') class
         WHERE class NOT IN (
           'key', 'byte', 'ast', 'semantic', 'graph', 'policy', 'release'
         )
       )
     ) THEN
    RAISE EXCEPTION 'conflict_classes contains an undeclared conflict class';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.create_root_branch_v2(
  branch_tenant UUID,
  kind TEXT,
  branch_purpose TEXT,
  branch_policy JSONB,
  adapters JSONB,
  creator TEXT,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  request_state RECORD;
  branch_payload JSONB;
  branch_object BIGINT;
  branch_creation_key TEXT;
  canonical_head BIGINT;
  new_branch UUID;
  new_witness UUID;
  result JSONB;
BEGIN
  PERFORM lifeos_runtime.validate_branch_policy_v2(branch_policy);
  IF jsonb_typeof(adapters) <> 'object'
     OR btrim(coalesce(kind, '')) = ''
     OR btrim(coalesce(branch_purpose, '')) = ''
     OR btrim(coalesce(creator, '')) = '' THEN
    RAISE EXCEPTION 'complete root branch inputs are required';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_tenant,
    'create-root-branch',
    target_idempotency_key,
    jsonb_build_object(
      'adapters', adapters,
      'creator', creator,
      'kind', kind,
      'policy', branch_policy,
      'purpose', branch_purpose
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'branch_id')::uuid;
  END IF;
  SELECT coalesce(max(canonical_sequence), 0) INTO canonical_head
  FROM lifeos_runtime.canonical_projection
  WHERE tenant_id = branch_tenant;
  branch_payload := jsonb_build_object(
    'adapters', adapters,
    'canonical_ceiling', canonical_head,
    'created_by', creator,
    'kind', kind,
    'policy', branch_policy,
    'purpose', branch_purpose,
    'request_id', request_state.request_id,
    'tenant_id', branch_tenant
  );
  branch_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1('root-branch-record', branch_payload),
    'cow-root-branch-record-v1'
  );
  branch_creation_key := encode(request_state.request_digest, 'hex');
  INSERT INTO lifeos_runtime.branch (
    tenant_id, branch_kind, purpose, policy, model_adapters, creation_key,
    raw_object_id, head_generation, canonical_ceiling, created_by
  ) VALUES (
    branch_tenant, kind, branch_purpose, branch_policy, adapters,
    branch_creation_key, branch_object, 0, canonical_head, creator
  )
  RETURNING branch_id INTO new_branch;
  new_witness := lifeos_agent.append_branch_witness_v2(
    new_branch,
    0,
    'branch-create',
    branch_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'request_id', request_state.request_id
    )
  );
  result := jsonb_build_object(
    'branch_id', new_branch,
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_tenant,
    result,
    new_witness
  );
  RETURN new_branch;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.create_branch_v2(
  parent_branch UUID,
  kind TEXT,
  branch_purpose TEXT,
  branch_policy JSONB,
  adapters JSONB,
  creator TEXT,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  parent_row lifeos_runtime.branch%ROWTYPE;
  request_state RECORD;
  branch_payload JSONB;
  branch_object BIGINT;
  new_branch UUID;
  new_witness UUID;
  result JSONB;
BEGIN
  SELECT * INTO STRICT parent_row
  FROM lifeos_runtime.branch
  WHERE branch_id = parent_branch
  FOR SHARE;
  PERFORM lifeos_runtime.require_tenant(parent_row.tenant_id);
  PERFORM lifeos_runtime.validate_branch_policy_v2(branch_policy);
  IF jsonb_typeof(adapters) <> 'object'
     OR btrim(coalesce(kind, '')) = ''
     OR btrim(coalesce(branch_purpose, '')) = ''
     OR btrim(coalesce(creator, '')) = '' THEN
    RAISE EXCEPTION 'complete child branch inputs are required';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    parent_row.tenant_id,
    'create-branch',
    target_idempotency_key,
    jsonb_build_object(
      'adapters', adapters,
      'creator', creator,
      'kind', kind,
      'parent_branch_id', parent_branch,
      'parent_generation', parent_row.head_generation,
      'policy', branch_policy,
      'purpose', branch_purpose
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'branch_id')::uuid;
  END IF;
  branch_payload := jsonb_build_object(
    'adapters', adapters,
    'canonical_ceiling', parent_row.canonical_ceiling,
    'created_by', creator,
    'kind', kind,
    'parent_branch_id', parent_branch,
    'parent_generation', parent_row.head_generation,
    'policy', branch_policy,
    'purpose', branch_purpose,
    'request_id', request_state.request_id,
    'tenant_id', parent_row.tenant_id
  );
  branch_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1('child-branch-record', branch_payload),
    'cow-child-branch-record-v1'
  );
  INSERT INTO lifeos_runtime.branch (
    tenant_id, parent_branch_id, parent_generation, base_lsn, branch_kind,
    purpose, policy, model_adapters, creation_key, raw_object_id,
    head_generation, canonical_ceiling, created_by
  ) VALUES (
    parent_row.tenant_id, parent_branch, parent_row.head_generation,
    pg_current_wal_lsn(), kind, branch_purpose, branch_policy, adapters,
    encode(request_state.request_digest, 'hex'), branch_object,
    parent_row.head_generation, parent_row.canonical_ceiling, creator
  )
  RETURNING branch_id INTO new_branch;
  new_witness := lifeos_agent.append_branch_witness_v2(
    new_branch,
    parent_row.head_generation,
    'branch-create',
    branch_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'parent_branch_id', parent_branch,
      'request_id', request_state.request_id
    )
  );
  result := jsonb_build_object(
    'branch_id', new_branch,
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    parent_row.tenant_id,
    result,
    new_witness
  );
  RETURN new_branch;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.append_branch_overlay_internal_v2(
  target_branch UUID,
  target_relation REGCLASS,
  target_key JSONB,
  target_operation TEXT,
  target_base_digest BYTEA,
  replacement_bytes BYTEA,
  replacement_json JSONB,
  target_execution UUID,
  target_effect UUID,
  target_request UUID,
  target_request_digest BYTEA,
  enforce_base_precondition BOOLEAN,
  target_witness_kind TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  current_state RECORD;
  key_digest BYTEA;
  row_object BIGINT;
  record_object BIGINT;
  record_payload JSONB;
  new_generation BIGINT;
  new_witness UUID;
  new_sequence BIGINT;
  effective_base_digest BYTEA;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR UPDATE;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF jsonb_typeof(target_key) <> 'object'
     OR target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'invalid overlay operation';
  END IF;
  IF target_base_digest IS NOT NULL
     AND octet_length(target_base_digest) <> 32 THEN
    RAISE EXCEPTION 'base digest must contain exactly 32 bytes';
  END IF;
  IF octet_length(target_request_digest) <> 32 THEN
    RAISE EXCEPTION 'request digest must contain exactly 32 bytes';
  END IF;
  IF target_operation = 'delete'
     AND (replacement_bytes IS NOT NULL OR replacement_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete overlays cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND replacement_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update overlays require replacement bytes';
  END IF;

  SELECT * INTO current_state
  FROM lifeos_runtime.resolve_branch_record_v2(
    target_branch,
    branch_row.head_generation,
    target_relation,
    target_key
  );
  IF enforce_base_precondition THEN
    IF target_operation = 'insert' THEN
      IF (FOUND AND current_state.state_exists)
         OR target_base_digest IS NOT NULL THEN
        RAISE EXCEPTION
          'overlay insert requires an absent key and NULL base digest';
      END IF;
    ELSE
      IF NOT FOUND OR NOT current_state.state_exists THEN
        RAISE EXCEPTION
          'overlay % requires an existing key',
          target_operation;
      END IF;
      IF target_base_digest IS NULL
         OR target_base_digest <> current_state.row_digest THEN
        RAISE EXCEPTION
          'overlay % base digest precondition failed',
          target_operation;
      END IF;
    END IF;
    effective_base_digest := target_base_digest;
  ELSE
    effective_base_digest := CASE
      WHEN FOUND AND current_state.state_exists THEN current_state.row_digest
      ELSE NULL
    END;
  END IF;

  key_digest := extensions.digest(
    convert_to(target_key::text, 'UTF8'),
    'sha256'
  );
  IF replacement_bytes IS NOT NULL THEN
    row_object := lifeos_runtime.store_generated_object(
      replacement_bytes,
      'cow-overlay-row-v2'
    );
  END IF;
  new_generation := branch_row.head_generation + 1;
  record_payload := jsonb_build_object(
    'base_digest', CASE WHEN effective_base_digest IS NULL THEN NULL
                        ELSE encode(effective_base_digest, 'hex') END,
    'branch_id', target_branch,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'generation', new_generation,
    'logical_key', target_key,
    'logical_key_digest', encode(key_digest, 'hex'),
    'operation', target_operation,
    'relation_name', target_relation::text,
    'request_id', target_request,
    'row_digest', CASE WHEN replacement_bytes IS NULL THEN NULL
                       ELSE encode(
                         extensions.ruvector_shake256_256(replacement_bytes),
                         'hex'
                       ) END,
    'tenant_id', branch_row.tenant_id
  );
  record_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1('overlay-record', record_payload),
    'cow-overlay-record-v2'
  );
  UPDATE lifeos_runtime.branch
  SET head_generation = new_generation
  WHERE branch_id = target_branch;
  new_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    new_generation,
    target_witness_kind,
    record_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'request_id', target_request,
      'request_digest', encode(target_request_digest, 'hex')
    )
  );
  INSERT INTO lifeos_runtime.branch_overlay (
    tenant_id, branch_id, generation, relation_name, logical_key,
    logical_key_digest, operation, base_digest, record_object_id,
    row_object_id, row_json, execution_id, effect_id, request_digest,
    witness_id
  ) VALUES (
    branch_row.tenant_id, target_branch, new_generation, target_relation,
    target_key, key_digest, target_operation, effective_base_digest,
    record_object, row_object, replacement_json, target_execution,
    target_effect, target_request_digest, new_witness
  )
  RETURNING sequence INTO new_sequence;
  PERFORM lifeos_rvf.stable_vector_id_v2(
    branch_row.tenant_id,
    target_relation,
    key_digest
  );
  RETURN jsonb_build_object(
    'generation', new_generation,
    'overlay_sequence', new_sequence,
    'row_object_id', row_object,
    'witness_id', new_witness
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.append_branch_overlay_v2(
  target_branch UUID,
  target_relation REGCLASS,
  target_key JSONB,
  target_operation TEXT,
  target_base_digest BYTEA,
  replacement_bytes BYTEA,
  replacement_json JSONB,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime
AS $function$
DECLARE
  branch_tenant UUID;
  request_state RECORD;
  result JSONB;
BEGIN
  SELECT tenant_id INTO STRICT branch_tenant
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(branch_tenant);
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_tenant,
    'append-branch-overlay',
    target_idempotency_key,
    jsonb_build_object(
      'base_digest', CASE WHEN target_base_digest IS NULL THEN NULL
                          ELSE encode(target_base_digest, 'hex') END,
      'branch_id', target_branch,
      'logical_key', target_key,
      'operation', target_operation,
      'relation_name', target_relation::text,
      'replacement_bytes', CASE WHEN replacement_bytes IS NULL THEN NULL
                                ELSE encode(replacement_bytes, 'hex') END,
      'replacement_json', replacement_json
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN request_state.prior_result;
  END IF;
  result := lifeos_runtime.append_branch_overlay_internal_v2(
    target_branch,
    target_relation,
    target_key,
    target_operation,
    target_base_digest,
    replacement_bytes,
    replacement_json,
    target_execution,
    target_effect,
    request_state.request_id,
    request_state.request_digest,
    true,
    'overlay-append'
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_tenant,
    result,
    (result->>'witness_id')::uuid
  );
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.baseline_merge_gates_v2()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT ARRAY[
    'build',
    'byte-reconstruction',
    'security',
    'static-analysis',
    'test',
    'witness-integrity'
  ]::text[]
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.record_merge_gate_v2(
  target_branch UUID,
  target_gate_kind TEXT,
  target_passed BOOLEAN,
  evidence_bytes BYTEA,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  request_state RECORD;
  evidence_object BIGINT;
  evidence_digest BYTEA;
  new_witness UUID;
  new_gate UUID;
  result JSONB;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF btrim(coalesce(target_gate_kind, '')) = '' OR evidence_bytes IS NULL THEN
    RAISE EXCEPTION 'gate kind and evidence bytes are required';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_row.tenant_id,
    'record-merge-gate',
    target_idempotency_key,
    jsonb_build_object(
      'branch_id', target_branch,
      'evidence_bytes', encode(evidence_bytes, 'hex'),
      'gate_kind', target_gate_kind,
      'generation', branch_row.head_generation,
      'passed', target_passed
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'merge_gate_id')::uuid;
  END IF;
  evidence_object := lifeos_runtime.store_generated_object(
    evidence_bytes,
    'cow-merge-gate-evidence-v2'
  );
  evidence_digest := extensions.ruvector_shake256_256(evidence_bytes);
  new_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    branch_row.head_generation,
    'merge-gate:' || target_gate_kind,
    evidence_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'evidence_digest', encode(evidence_digest, 'hex'),
      'execution_id', target_execution,
      'passed', target_passed,
      'request_id', request_state.request_id
    )
  );
  INSERT INTO lifeos_runtime.merge_gate (
    tenant_id, branch_id, generation, gate_kind, passed, evidence_object_id,
    evidence_digest, witness_id, idempotency_key, execution_id, effect_id,
    request_digest
  ) VALUES (
    branch_row.tenant_id, target_branch, branch_row.head_generation,
    target_gate_kind, target_passed, evidence_object, evidence_digest,
    new_witness, target_idempotency_key, target_execution, target_effect,
    request_state.request_digest
  )
  RETURNING merge_gate_id INTO new_gate;
  result := jsonb_build_object(
    'merge_gate_id', new_gate,
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_row.tenant_id,
    result,
    new_witness
  );
  RETURN new_gate;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.branch_gates_satisfied_v2(
  target_branch UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  gates_satisfied BOOLEAN;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  PERFORM lifeos_runtime.validate_branch_policy_v2(branch_row.policy);
  WITH required(gate_kind) AS (
    SELECT unnest(lifeos_runtime.baseline_merge_gates_v2())
    UNION
    SELECT jsonb_array_elements_text(
      coalesce(branch_row.policy->'required_gates', '[]'::jsonb)
    )
  ),
  latest AS (
    SELECT DISTINCT ON (gate.gate_kind)
      gate.gate_kind,
      gate.passed
    FROM lifeos_runtime.merge_gate gate
    WHERE gate.branch_id = target_branch
      AND gate.tenant_id = branch_row.tenant_id
      AND gate.generation = branch_row.head_generation
    ORDER BY gate.gate_kind, gate.created_at DESC, gate.merge_gate_id DESC
  )
  SELECT NOT EXISTS (
    SELECT 1
    FROM required
    LEFT JOIN latest USING (gate_kind)
    WHERE coalesce(latest.passed, false) = false
  ) INTO gates_satisfied;
  RETURN gates_satisfied;
END
$function$;

ALTER TABLE lifeos_runtime.merge_conflict
  ADD COLUMN source_overlay_sequence BIGINT,
  ADD COLUMN target_overlay_sequence BIGINT,
  ADD CONSTRAINT lifeos_merge_conflict_request_fk
    FOREIGN KEY (request_id) REFERENCES lifeos_runtime.cow_request(request_id);

CREATE OR REPLACE FUNCTION lifeos_runtime.declared_conflict_classes_v2(
  branch_policy JSONB
) RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, lifeos_runtime
AS $function$
DECLARE
  declared TEXT[];
BEGIN
  PERFORM lifeos_runtime.validate_branch_policy_v2(branch_policy);
  IF NOT branch_policy ? 'conflict_classes'
     OR jsonb_array_length(branch_policy->'conflict_classes') = 0 THEN
    RETURN ARRAY[
      'key', 'byte', 'ast', 'semantic', 'graph', 'policy', 'release'
    ]::text[];
  END IF;
  SELECT array_agg(value ORDER BY ordinal)
  INTO declared
  FROM jsonb_array_elements_text(
    branch_policy->'conflict_classes'
  ) WITH ORDINALITY item(value, ordinal);
  RETURN declared;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_merge_conflict_v2(
  target_conflict UUID,
  target_operation TEXT,
  resolution_bytes BYTEA,
  resolution_json JSONB,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  conflict_row lifeos_runtime.merge_conflict%ROWTYPE;
  target_head BIGINT;
  request_state RECORD;
  resolution_object BIGINT;
  resolution_record BIGINT;
  resolution_digest BYTEA;
  resolution_payload JSONB;
  new_witness UUID;
  new_resolution UUID;
  result JSONB;
BEGIN
  SELECT * INTO STRICT conflict_row
  FROM lifeos_runtime.merge_conflict
  WHERE merge_conflict_id = target_conflict
  FOR SHARE;
  PERFORM lifeos_runtime.require_tenant(conflict_row.tenant_id);
  IF target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'invalid merge-conflict resolution operation';
  END IF;
  IF target_operation = 'delete'
     AND (resolution_bytes IS NOT NULL OR resolution_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete resolutions cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND resolution_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update resolutions require bytes';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    conflict_row.tenant_id,
    'resolve-merge-conflict',
    target_idempotency_key,
    jsonb_build_object(
      'conflict_id', target_conflict,
      'operation', target_operation,
      'resolution_bytes', CASE WHEN resolution_bytes IS NULL THEN NULL
                               ELSE encode(resolution_bytes, 'hex') END,
      'resolution_json', resolution_json
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'resolution_id')::uuid;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict_resolution resolution
    WHERE resolution.merge_conflict_id = target_conflict
  ) THEN
    RAISE EXCEPTION 'merge conflict already has a different resolution request';
  END IF;
  IF resolution_bytes IS NOT NULL THEN
    resolution_object := lifeos_runtime.store_generated_object(
      resolution_bytes,
      'cow-conflict-resolution-row-v2'
    );
    resolution_digest := extensions.ruvector_shake256_256(resolution_bytes);
  END IF;
  resolution_payload := jsonb_build_object(
    'conflict_id', target_conflict,
    'conflict_kind', conflict_row.conflict_kind,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'operation', target_operation,
    'request_id', request_state.request_id,
    'row_digest', CASE WHEN resolution_digest IS NULL THEN NULL
                       ELSE encode(resolution_digest, 'hex') END,
    'tenant_id', conflict_row.tenant_id
  );
  resolution_record := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1(
      'merge-conflict-resolution',
      resolution_payload
    ),
    'cow-conflict-resolution-record-v2'
  );
  SELECT head_generation INTO STRICT target_head
  FROM lifeos_runtime.branch
  WHERE branch_id = conflict_row.target_branch_id;
  new_witness := lifeos_agent.append_branch_witness_v2(
    conflict_row.target_branch_id,
    target_head,
    'merge-conflict-resolution:' || conflict_row.conflict_kind,
    resolution_record,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'request_id', request_state.request_id
    )
  );
  INSERT INTO lifeos_runtime.merge_conflict_resolution (
    tenant_id, merge_conflict_id, resolution_object_id, witness_id,
    idempotency_key, operation, row_json, row_digest, execution_id,
    effect_id, request_digest
  ) VALUES (
    conflict_row.tenant_id, target_conflict,
    coalesce(resolution_object, resolution_record), new_witness,
    target_idempotency_key, target_operation, resolution_json,
    resolution_digest, target_execution, target_effect,
    request_state.request_digest
  )
  RETURNING resolution_id INTO new_resolution;
  result := jsonb_build_object(
    'resolution_id', new_resolution,
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    conflict_row.tenant_id,
    result,
    new_witness
  );
  RETURN new_resolution;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.merge_branch_v2(
  source_branch UUID,
  target_branch UUID,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  source_row lifeos_runtime.branch%ROWTYPE;
  target_row lifeos_runtime.branch%ROWTYPE;
  request_state RECORD;
  source_overlay lifeos_runtime.branch_overlay%ROWTYPE;
  target_state RECORD;
  declared_classes TEXT[];
  conflict_class TEXT;
  conflict_ordinal SMALLINT;
  conflict_payload JSONB;
  conflict_record BIGINT;
  conflict_witness UUID;
  new_conflict UUID;
  request_conflict_count BIGINT;
  unresolved_count BIGINT;
  resolution_count BIGINT;
  resolution_operation TEXT;
  resolution_digest BYTEA;
  resolution_json JSONB;
  resolution_object BIGINT;
  replacement_bytes BYTEA;
  apply_result JSONB;
  application_witness UUID;
  resolution_row RECORD;
  snapshot_bytes BYTEA;
  snapshot_object BIGINT;
  snapshot_digest BYTEA;
  merge_payload BIGINT;
  merge_witness UUID;
  merge_promotion UUID;
  result JSONB;
BEGIN
  SELECT * INTO STRICT source_row
  FROM lifeos_runtime.branch
  WHERE branch_id = source_branch;
  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(source_row.tenant_id);
  IF source_row.tenant_id <> target_row.tenant_id THEN
    RAISE EXCEPTION 'cross-tenant branch merge is forbidden';
  END IF;
  IF source_row.parent_branch_id IS DISTINCT FROM target_branch THEN
    RAISE EXCEPTION 'source branch must be a direct child of the merge target';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      source_row.tenant_id::text || ':merge:'
        || least(source_branch::text, target_branch::text) || ':'
        || greatest(source_branch::text, target_branch::text),
      7002
    )
  );
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    source_row.tenant_id,
    'merge-branch',
    target_idempotency_key,
    jsonb_build_object(
      'source_branch_id', source_branch,
      'source_generation', source_row.head_generation,
      'target_branch_id', target_branch,
      'target_generation', target_row.head_generation
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN request_state.prior_result;
  END IF;
  declared_classes := lifeos_runtime.declared_conflict_classes_v2(
    source_row.policy
  );

  FOR source_overlay IN
    SELECT *
    FROM lifeos_runtime.branch_overlay overlay
    WHERE overlay.branch_id = source_branch
      AND overlay.generation <= source_row.head_generation
    ORDER BY overlay.sequence
  LOOP
    SELECT * INTO target_state
    FROM lifeos_runtime.resolve_branch_record_v2(
      target_branch,
      target_row.head_generation,
      source_overlay.relation_name,
      source_overlay.logical_key
    );
    IF (
      source_overlay.operation = 'insert'
      AND FOUND
      AND target_state.state_exists
    ) OR (
      source_overlay.operation IN ('update', 'delete')
      AND (
        NOT FOUND
        OR NOT target_state.state_exists
        OR source_overlay.base_digest IS DISTINCT FROM target_state.row_digest
      )
    ) THEN
      conflict_ordinal := 0;
      FOREACH conflict_class IN ARRAY declared_classes
      LOOP
        conflict_ordinal := conflict_ordinal + 1;
        IF NOT EXISTS (
          SELECT 1
          FROM lifeos_runtime.merge_conflict conflict
          WHERE conflict.tenant_id = source_row.tenant_id
            AND conflict.request_id = request_state.request_id
            AND conflict.source_overlay_sequence = source_overlay.sequence
            AND conflict.conflict_kind = conflict_class
        ) THEN
          conflict_payload := jsonb_build_object(
            'base_digest', CASE WHEN source_overlay.base_digest IS NULL THEN NULL
                                ELSE encode(source_overlay.base_digest, 'hex') END,
            'conflict_kind', conflict_class,
            'effect_id', target_effect,
            'execution_id', target_execution,
            'logical_key', source_overlay.logical_key,
            'relation_name', source_overlay.relation_name::text,
            'request_id', request_state.request_id,
            'source_branch_id', source_branch,
            'source_overlay_sequence', source_overlay.sequence,
            'target_branch_id', target_branch,
            'tenant_id', source_row.tenant_id
          );
          conflict_record := lifeos_runtime.store_generated_object(
            lifeos_runtime.cow_preimage_v1(
              'merge-conflict',
              conflict_payload
            ),
            'cow-merge-conflict-record-v2'
          );
          conflict_witness := lifeos_agent.append_branch_witness_v2(
            target_branch,
            target_row.head_generation,
            'merge-conflict:' || conflict_class,
            conflict_record,
            jsonb_build_object(
              'effect_id', target_effect,
              'execution_id', target_execution,
              'request_id', request_state.request_id,
              'source_overlay_sequence', source_overlay.sequence
            )
          );
          INSERT INTO lifeos_runtime.merge_conflict (
            tenant_id, source_branch_id, target_branch_id, source_generation,
            target_generation, relation_name, logical_key, logical_key_digest,
            conflict_kind, base_digest, source_object_id, target_object_id,
            record_object_id, witness_id, idempotency_key, request_id,
            execution_id, effect_id, conflict_ordinal,
            source_overlay_sequence
          ) VALUES (
            source_row.tenant_id, source_branch, target_branch,
            source_row.head_generation, target_row.head_generation,
            source_overlay.relation_name, source_overlay.logical_key,
            source_overlay.logical_key_digest, conflict_class,
            source_overlay.base_digest,
            coalesce(source_overlay.row_object_id, source_overlay.record_object_id),
            CASE WHEN FOUND THEN target_state.row_object_id ELSE NULL END,
            conflict_record, conflict_witness,
            request_state.request_id::text || ':' || source_overlay.sequence
              || ':' || conflict_class,
            request_state.request_id, target_execution, target_effect,
            conflict_ordinal, source_overlay.sequence
          )
          RETURNING merge_conflict_id INTO new_conflict;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  SELECT count(*) INTO request_conflict_count
  FROM lifeos_runtime.merge_conflict conflict
  WHERE conflict.request_id = request_state.request_id;
  SELECT count(*) INTO unresolved_count
  FROM lifeos_runtime.merge_conflict conflict
  LEFT JOIN lifeos_runtime.merge_conflict_resolution resolution
    ON resolution.merge_conflict_id = conflict.merge_conflict_id
  WHERE conflict.request_id = request_state.request_id
    AND resolution.resolution_id IS NULL;
  IF unresolved_count > 0 THEN
    RETURN jsonb_build_object(
      'conflict_count', request_conflict_count,
      'merged', false,
      'request_id', request_state.request_id,
      'unresolved_count', unresolved_count
    );
  END IF;

  FOR source_overlay IN
    SELECT *
    FROM lifeos_runtime.branch_overlay overlay
    WHERE overlay.branch_id = source_branch
      AND overlay.generation <= source_row.head_generation
    ORDER BY overlay.sequence
  LOOP
    SELECT
      count(*),
      (array_agg(
        resolution.operation ORDER BY conflict.conflict_ordinal
      ))[1],
      (array_agg(
        resolution.row_digest ORDER BY conflict.conflict_ordinal
      ))[1],
      (array_agg(
        resolution.row_json ORDER BY conflict.conflict_ordinal
      ))[1],
      (array_agg(
        resolution.resolution_object_id ORDER BY conflict.conflict_ordinal
      ))[1]
    INTO
      resolution_count,
      resolution_operation,
      resolution_digest,
      resolution_json,
      resolution_object
    FROM lifeos_runtime.merge_conflict conflict
    JOIN lifeos_runtime.merge_conflict_resolution resolution
      ON resolution.merge_conflict_id = conflict.merge_conflict_id
    WHERE conflict.request_id = request_state.request_id
      AND conflict.source_overlay_sequence = source_overlay.sequence;
    IF resolution_count > 0 THEN
      IF EXISTS (
        SELECT 1
        FROM lifeos_runtime.merge_conflict conflict
        JOIN lifeos_runtime.merge_conflict_resolution resolution
          ON resolution.merge_conflict_id = conflict.merge_conflict_id
        WHERE conflict.request_id = request_state.request_id
          AND conflict.source_overlay_sequence = source_overlay.sequence
          AND (
            resolution.operation IS DISTINCT FROM resolution_operation
            OR resolution.row_digest IS DISTINCT FROM resolution_digest
            OR resolution.row_json IS DISTINCT FROM resolution_json
          )
      ) THEN
        RAISE EXCEPTION
          'all declared conflict-class resolutions for a key must agree';
      END IF;
      IF resolution_operation <> 'delete' THEN
        SELECT raw_bytes INTO STRICT replacement_bytes
        FROM lifeos_blob.object
        WHERE id = resolution_object;
      ELSE
        replacement_bytes := NULL;
      END IF;
      apply_result := lifeos_runtime.append_branch_overlay_internal_v2(
        target_branch,
        source_overlay.relation_name,
        source_overlay.logical_key,
        resolution_operation,
        NULL,
        replacement_bytes,
        resolution_json,
        extensions.gen_random_uuid(),
        target_effect,
        request_state.request_id,
        request_state.request_digest,
        false,
        'merge-resolution-apply'
      );
      application_witness := (apply_result->>'witness_id')::uuid;
      FOR resolution_row IN
        SELECT resolution.resolution_id
        FROM lifeos_runtime.merge_conflict conflict
        JOIN lifeos_runtime.merge_conflict_resolution resolution
          ON resolution.merge_conflict_id = conflict.merge_conflict_id
        WHERE conflict.request_id = request_state.request_id
          AND conflict.source_overlay_sequence = source_overlay.sequence
        ORDER BY conflict.conflict_ordinal
      LOOP
        INSERT INTO lifeos_runtime.merge_conflict_application (
          tenant_id, resolution_id, target_branch_id,
          target_overlay_sequence, witness_id, request_id, execution_id,
          effect_id
        ) VALUES (
          source_row.tenant_id, resolution_row.resolution_id, target_branch,
          (apply_result->>'overlay_sequence')::bigint, application_witness,
          request_state.request_id, target_execution, target_effect
        );
      END LOOP;
    ELSE
      IF source_overlay.row_object_id IS NOT NULL THEN
        SELECT raw_bytes INTO STRICT replacement_bytes
        FROM lifeos_blob.object
        WHERE id = source_overlay.row_object_id;
      ELSE
        replacement_bytes := NULL;
      END IF;
      PERFORM lifeos_runtime.append_branch_overlay_internal_v2(
        target_branch,
        source_overlay.relation_name,
        source_overlay.logical_key,
        source_overlay.operation,
        NULL,
        replacement_bytes,
        source_overlay.row_json,
        extensions.gen_random_uuid(),
        target_effect,
        request_state.request_id,
        request_state.request_digest,
        false,
        'merge-overlay-apply'
      );
    END IF;
  END LOOP;

  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  snapshot_bytes := lifeos_runtime.materialize_branch_v2(
    target_branch,
    target_row.head_generation
  );
  snapshot_digest := extensions.ruvector_shake256_256(snapshot_bytes);
  snapshot_object := lifeos_runtime.store_generated_object(
    snapshot_bytes,
    'cow-merge-snapshot-v2'
  );
  merge_payload := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1(
      'merge-event',
      jsonb_build_object(
        'effect_id', target_effect,
        'execution_id', target_execution,
        'request_id', request_state.request_id,
        'snapshot_digest', encode(snapshot_digest, 'hex'),
        'source_branch_id', source_branch,
        'source_generation', source_row.head_generation,
        'target_branch_id', target_branch,
        'target_generation', target_row.head_generation,
        'tenant_id', source_row.tenant_id
      )
    ),
    'cow-merge-event-v2'
  );
  merge_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    target_row.head_generation,
    'branch-merge',
    merge_payload,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'request_id', request_state.request_id
    )
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, action, source_branch_id, target_branch_id, from_generation,
    to_generation, snapshot_object_id, event_object_id, witness_id,
    idempotency_key, execution_id, effect_id, request_digest,
    snapshot_digest
  ) VALUES (
    source_row.tenant_id, 'merge', source_branch, target_branch,
    source_row.head_generation, target_row.head_generation, snapshot_object,
    merge_payload, merge_witness, target_idempotency_key, target_execution,
    target_effect, request_state.request_digest, snapshot_digest
  )
  RETURNING promotion_id INTO merge_promotion;
  result := jsonb_build_object(
    'applied_resolution_count', (
      SELECT count(*)
      FROM lifeos_runtime.merge_conflict_application application
      WHERE application.request_id = request_state.request_id
    ),
    'conflict_count', request_conflict_count,
    'merged', true,
    'promotion_id', merge_promotion,
    'request_id', request_state.request_id,
    'target_generation', target_row.head_generation,
    'witness_id', merge_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    source_row.tenant_id,
    result,
    merge_witness
  );
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.compare_promotion_snapshot_v2(
  target_promotion UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  promotion_row lifeos_runtime.promotion%ROWTYPE;
  stored_bytes BYTEA;
  reconstructed_bytes BYTEA;
BEGIN
  SELECT * INTO STRICT promotion_row
  FROM lifeos_runtime.promotion
  WHERE promotion_id = target_promotion;
  PERFORM lifeos_runtime.require_tenant(promotion_row.tenant_id);
  SELECT raw_bytes INTO STRICT stored_bytes
  FROM lifeos_blob.object
  WHERE id = promotion_row.snapshot_object_id;
  reconstructed_bytes := lifeos_runtime.materialize_branch_v2(
    promotion_row.target_branch_id,
    promotion_row.to_generation
  );
  RETURN stored_bytes = reconstructed_bytes
    AND promotion_row.snapshot_digest
      = extensions.ruvector_shake256_256(reconstructed_bytes);
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.promote_branch_v2(
  branch_tenant UUID,
  target_pointer_name TEXT,
  target_branch UUID,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
  request_state RECORD;
  snapshot_bytes BYTEA;
  snapshot_object BIGINT;
  snapshot_digest BYTEA;
  event_payload JSONB;
  event_object BIGINT;
  new_witness UUID;
  new_promotion UUID;
  result JSONB;
BEGIN
  PERFORM lifeos_runtime.require_tenant(branch_tenant);
  IF btrim(coalesce(target_pointer_name, '')) = '' THEN
    RAISE EXCEPTION 'promotion pointer name is required';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      branch_tenant::text || ':pointer:' || target_pointer_name,
      7003
    )
  );
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  IF branch_row.tenant_id <> branch_tenant THEN
    RAISE EXCEPTION 'promotion branch is outside the requested tenant';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_tenant,
    'promote-branch',
    target_idempotency_key,
    jsonb_build_object(
      'branch_id', target_branch,
      'generation', branch_row.head_generation,
      'pointer_name', target_pointer_name
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'promotion_id')::uuid;
  END IF;
  IF NOT lifeos_runtime.branch_gates_satisfied_v2(target_branch) THEN
    RAISE EXCEPTION
      'all baseline and policy gates must pass at the exact branch head';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict conflict
    LEFT JOIN lifeos_runtime.merge_conflict_resolution resolution
      ON resolution.merge_conflict_id = conflict.merge_conflict_id
    LEFT JOIN lifeos_runtime.merge_conflict_application application
      ON application.resolution_id = resolution.resolution_id
    WHERE conflict.tenant_id = branch_tenant
      AND (
        conflict.source_branch_id = target_branch
        OR conflict.target_branch_id = target_branch
      )
      AND application.application_id IS NULL
  ) THEN
    RAISE EXCEPTION 'branch has unresolved or unapplied merge conflicts';
  END IF;
  snapshot_bytes := lifeos_runtime.materialize_branch_v2(
    target_branch,
    branch_row.head_generation
  );
  snapshot_digest := extensions.ruvector_shake256_256(snapshot_bytes);
  snapshot_object := lifeos_runtime.store_generated_object(
    snapshot_bytes,
    'cow-promotion-snapshot-v2'
  );
  SELECT * INTO pointer_row
  FROM lifeos_runtime.branch_pointer pointer
  WHERE pointer.tenant_id = branch_tenant
    AND pointer.pointer_name = target_pointer_name
  FOR UPDATE;
  event_payload := jsonb_build_object(
    'branch_id', target_branch,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'generation', branch_row.head_generation,
    'pointer_name', target_pointer_name,
    'previous_promotion_id', pointer_row.active_promotion_id,
    'request_id', request_state.request_id,
    'snapshot_digest', encode(snapshot_digest, 'hex'),
    'tenant_id', branch_tenant
  );
  event_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1('promotion-event', event_payload),
    'cow-promotion-event-v2'
  );
  new_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    branch_row.head_generation,
    'branch-promotion',
    event_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'pointer_name', target_pointer_name,
      'request_id', request_state.request_id,
      'snapshot_digest', encode(snapshot_digest, 'hex')
    )
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, pointer_name, action, previous_promotion_id, source_branch_id,
    target_branch_id, from_generation, to_generation, snapshot_object_id,
    event_object_id, witness_id, idempotency_key, execution_id, effect_id,
    request_digest, snapshot_digest
  ) VALUES (
    branch_tenant, target_pointer_name, 'promote',
    pointer_row.active_promotion_id,
    CASE WHEN pointer_row.branch_id IS NULL THEN NULL ELSE pointer_row.branch_id END,
    target_branch,
    CASE WHEN pointer_row.branch_id IS NULL THEN NULL
         ELSE pointer_row.generation END,
    branch_row.head_generation, snapshot_object, event_object, new_witness,
    target_idempotency_key, target_execution, target_effect,
    request_state.request_digest, snapshot_digest
  )
  RETURNING promotion_id INTO new_promotion;
  INSERT INTO lifeos_runtime.branch_pointer (
    tenant_id, pointer_name, branch_id, generation, snapshot_object_id,
    active_promotion_id, witness_id
  ) VALUES (
    branch_tenant, target_pointer_name, target_branch,
    branch_row.head_generation, snapshot_object, new_promotion, new_witness
  )
  ON CONFLICT (tenant_id, pointer_name) DO UPDATE
  SET branch_id = EXCLUDED.branch_id,
      generation = EXCLUDED.generation,
      snapshot_object_id = EXCLUDED.snapshot_object_id,
      active_promotion_id = EXCLUDED.active_promotion_id,
      witness_id = EXCLUDED.witness_id,
      updated_at = clock_timestamp();
  result := jsonb_build_object(
    'promotion_id', new_promotion,
    'snapshot_digest', encode(snapshot_digest, 'hex'),
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_tenant,
    result,
    new_witness
  );
  RETURN new_promotion;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.rollback_branch_v2(
  branch_tenant UUID,
  target_pointer_name TEXT,
  target_promotion UUID,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
  restore_row lifeos_runtime.promotion%ROWTYPE;
  request_state RECORD;
  event_payload JSONB;
  event_object BIGINT;
  new_witness UUID;
  rollback_promotion UUID;
  result JSONB;
BEGIN
  PERFORM lifeos_runtime.require_tenant(branch_tenant);
  IF btrim(coalesce(target_pointer_name, '')) = '' THEN
    RAISE EXCEPTION 'rollback pointer name is required';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      branch_tenant::text || ':pointer:' || target_pointer_name,
      7003
    )
  );
  SELECT * INTO STRICT pointer_row
  FROM lifeos_runtime.branch_pointer pointer
  WHERE pointer.tenant_id = branch_tenant
    AND pointer.pointer_name = target_pointer_name
  FOR UPDATE;
  IF target_promotion = pointer_row.active_promotion_id THEN
    RAISE EXCEPTION 'rollback target is already active';
  END IF;
  IF NOT EXISTS (
    WITH RECURSIVE ancestry AS (
      SELECT promotion.promotion_id, promotion.previous_promotion_id
      FROM lifeos_runtime.promotion promotion
      WHERE promotion.promotion_id = pointer_row.active_promotion_id
        AND promotion.tenant_id = branch_tenant
        AND promotion.pointer_name = target_pointer_name
      UNION ALL
      SELECT prior.promotion_id, prior.previous_promotion_id
      FROM ancestry
      JOIN lifeos_runtime.promotion prior
        ON prior.promotion_id = ancestry.previous_promotion_id
      WHERE prior.tenant_id = branch_tenant
        AND prior.pointer_name = target_pointer_name
    )
    SELECT 1 FROM ancestry
    WHERE ancestry.promotion_id = target_promotion
  ) THEN
    RAISE EXCEPTION
      'rollback target is not in the active pointer recursive promotion ancestry';
  END IF;
  SELECT * INTO STRICT restore_row
  FROM lifeos_runtime.promotion promotion
  WHERE promotion.promotion_id = target_promotion
    AND promotion.tenant_id = branch_tenant
    AND promotion.pointer_name = target_pointer_name;
  IF NOT lifeos_runtime.compare_promotion_snapshot_v2(target_promotion) THEN
    RAISE EXCEPTION 'rollback target snapshot reconstruction mismatch';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_tenant,
    'rollback-branch',
    target_idempotency_key,
    jsonb_build_object(
      'active_promotion_id', pointer_row.active_promotion_id,
      'pointer_name', target_pointer_name,
      'target_promotion_id', target_promotion
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'promotion_id')::uuid;
  END IF;
  event_payload := jsonb_build_object(
    'effect_id', target_effect,
    'execution_id', target_execution,
    'from_promotion_id', pointer_row.active_promotion_id,
    'pointer_name', target_pointer_name,
    'request_id', request_state.request_id,
    'restore_branch_id', restore_row.target_branch_id,
    'restore_generation', restore_row.to_generation,
    'restore_snapshot_digest', encode(restore_row.snapshot_digest, 'hex'),
    'target_promotion_id', target_promotion,
    'tenant_id', branch_tenant
  );
  event_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1('rollback-event', event_payload),
    'cow-rollback-event-v2'
  );
  new_witness := lifeos_agent.append_branch_witness_v2(
    restore_row.target_branch_id,
    restore_row.to_generation,
    'branch-rollback',
    event_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'pointer_name', target_pointer_name,
      'request_id', request_state.request_id,
      'target_promotion_id', target_promotion
    )
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, pointer_name, action, previous_promotion_id, source_branch_id,
    target_branch_id, from_generation, to_generation, snapshot_object_id,
    event_object_id, witness_id, idempotency_key, execution_id, effect_id,
    request_digest, snapshot_digest
  ) VALUES (
    branch_tenant, target_pointer_name, 'rollback',
    pointer_row.active_promotion_id, pointer_row.branch_id,
    restore_row.target_branch_id, pointer_row.generation,
    restore_row.to_generation, restore_row.snapshot_object_id, event_object,
    new_witness, target_idempotency_key, target_execution, target_effect,
    request_state.request_digest, restore_row.snapshot_digest
  )
  RETURNING promotion_id INTO rollback_promotion;
  UPDATE lifeos_runtime.branch_pointer
  SET branch_id = restore_row.target_branch_id,
      generation = restore_row.to_generation,
      snapshot_object_id = restore_row.snapshot_object_id,
      active_promotion_id = rollback_promotion,
      witness_id = new_witness,
      updated_at = clock_timestamp()
  WHERE tenant_id = branch_tenant
    AND pointer_name = target_pointer_name;
  result := jsonb_build_object(
    'promotion_id', rollback_promotion,
    'restored_promotion_id', target_promotion,
    'snapshot_digest', encode(restore_row.snapshot_digest, 'hex'),
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_tenant,
    result,
    new_witness
  );
  RETURN rollback_promotion;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.active_branch_snapshot_v2(
  branch_tenant UUID,
  target_pointer_name TEXT
) RETURNS TABLE (
  branch_id UUID,
  generation BIGINT,
  snapshot_object_id BIGINT,
  snapshot_digest BYTEA,
  snapshot_bytes BYTEA,
  promotion_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
BEGIN
  PERFORM lifeos_runtime.require_tenant(branch_tenant);
  SELECT * INTO STRICT pointer_row
  FROM lifeos_runtime.branch_pointer pointer
  WHERE pointer.tenant_id = branch_tenant
    AND pointer.pointer_name = target_pointer_name;
  IF NOT lifeos_runtime.compare_promotion_snapshot_v2(
    pointer_row.active_promotion_id
  ) THEN
    RAISE EXCEPTION 'active snapshot reconstruction mismatch';
  END IF;
  RETURN QUERY
  SELECT
    pointer_row.branch_id,
    pointer_row.generation,
    pointer_row.snapshot_object_id,
    promotion.snapshot_digest,
    object.raw_bytes,
    pointer_row.active_promotion_id
  FROM lifeos_runtime.promotion promotion
  JOIN lifeos_blob.object object
    ON object.id = pointer_row.snapshot_object_id
  WHERE promotion.promotion_id = pointer_row.active_promotion_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.resolved_branch_members_v2(
  target_branch UUID,
  target_generation BIGINT
) RETURNS TABLE (
  relation_name REGCLASS,
  logical_key JSONB,
  logical_key_digest BYTEA,
  operation TEXT,
  record_object_id BIGINT,
  row_object_id BIGINT,
  row_json JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF target_generation < 0 OR target_generation > branch_row.head_generation THEN
    RAISE EXCEPTION 'invalid resolved-members generation';
  END IF;
  RETURN QUERY
  WITH RECURSIVE ancestry AS (
    SELECT
      branch.branch_id,
      0 AS depth,
      target_generation AS generation_ceiling,
      branch.parent_branch_id,
      branch.parent_generation
    FROM lifeos_runtime.branch branch
    WHERE branch.branch_id = target_branch
    UNION ALL
    SELECT
      parent.branch_id,
      ancestry.depth + 1,
      least(ancestry.parent_generation, parent.head_generation),
      parent.parent_branch_id,
      parent.parent_generation
    FROM ancestry
    JOIN lifeos_runtime.branch parent
      ON parent.branch_id = ancestry.parent_branch_id
  ),
  overlay_ranked AS (
    SELECT
      overlay.relation_name,
      overlay.logical_key,
      overlay.logical_key_digest,
      overlay.operation,
      overlay.record_object_id,
      overlay.row_object_id,
      overlay.row_json,
      row_number() OVER (
        PARTITION BY overlay.relation_name, overlay.logical_key_digest
        ORDER BY ancestry.depth, overlay.generation DESC, overlay.sequence DESC
      ) AS rank
    FROM ancestry
    JOIN lifeos_runtime.branch_overlay overlay
      ON overlay.branch_id = ancestry.branch_id
     AND overlay.generation <= ancestry.generation_ceiling
  ),
  canonical_ranked AS (
    SELECT
      projection.relation_name,
      projection.logical_key,
      projection.logical_key_digest,
      projection.operation,
      projection.record_object_id,
      projection.row_object_id,
      projection.row_json,
      row_number() OVER (
        PARTITION BY projection.relation_name, projection.logical_key_digest
        ORDER BY projection.canonical_sequence DESC
      ) AS rank
    FROM lifeos_runtime.canonical_projection projection
    WHERE projection.tenant_id = branch_row.tenant_id
      AND projection.canonical_sequence <= branch_row.canonical_ceiling
  )
  SELECT
    overlay.relation_name,
    overlay.logical_key,
    overlay.logical_key_digest,
    overlay.operation,
    overlay.record_object_id,
    overlay.row_object_id,
    overlay.row_json
  FROM overlay_ranked overlay
  WHERE overlay.rank = 1
  UNION ALL
  SELECT
    canonical.relation_name,
    canonical.logical_key,
    canonical.logical_key_digest,
    canonical.operation,
    canonical.record_object_id,
    canonical.row_object_id,
    canonical.row_json
  FROM canonical_ranked canonical
  WHERE canonical.rank = 1
    AND NOT EXISTS (
      SELECT 1
      FROM overlay_ranked overlay
      WHERE overlay.rank = 1
        AND overlay.relation_name = canonical.relation_name
        AND overlay.logical_key_digest = canonical.logical_key_digest
    );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_rvf.mirror_branch_membership_v2(
  target_branch UUID,
  parent_container UUID,
  container_bytes BYTEA,
  range_map_bytes BYTEA,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent, lifeos_rvf
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  request_state RECORD;
  container_object BIGINT;
  range_map_object BIGINT;
  membership_payload JSONB;
  membership_digest BYTEA;
  event_object BIGINT;
  new_witness UUID;
  new_container UUID;
  expected_count BIGINT;
  actual_count BIGINT;
  result JSONB;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF branch_row.head_generation > 4294967295 THEN
    RAISE EXCEPTION
      'RVF generation % exceeds u32::MAX',
      branch_row.head_generation;
  END IF;
  IF container_bytes IS NULL OR range_map_bytes IS NULL THEN
    RAISE EXCEPTION 'RVF container and range-map bytes are required';
  END IF;
  IF parent_container IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM lifeos_rvf.container container
    WHERE container.container_id = parent_container
      AND container.tenant_id = branch_row.tenant_id
  ) THEN
    RAISE EXCEPTION 'RVF parent container is outside the branch tenant';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_row.tenant_id,
    'mirror-rvf-membership',
    target_idempotency_key,
    jsonb_build_object(
      'branch_id', target_branch,
      'container_bytes', encode(container_bytes, 'hex'),
      'generation', branch_row.head_generation,
      'parent_container_id', parent_container,
      'range_map_bytes', encode(range_map_bytes, 'hex')
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'container_id')::uuid;
  END IF;
  IF EXISTS (
    SELECT 1 FROM lifeos_rvf.container container
    WHERE container.branch_id = target_branch
      AND container.generation = branch_row.head_generation
  ) THEN
    RAISE EXCEPTION
      'RVF branch generation already has a different mirror request';
  END IF;

  INSERT INTO lifeos_rvf.member_vector_identity (
    tenant_id, relation_name, member_key_digest
  )
  SELECT
    branch_row.tenant_id,
    member.relation_name,
    member.logical_key_digest
  FROM lifeos_runtime.resolved_branch_members_v2(
    target_branch,
    branch_row.head_generation
  ) member
  ON CONFLICT (tenant_id, relation_name, member_key_digest) DO NOTHING;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'logical_key_digest', encode(member.logical_key_digest, 'hex'),
        'operation', member.operation,
        'relation_name', member.relation_name::text,
        'vector_id', identity.vector_id
      )
      ORDER BY member.relation_name::text, identity.vector_id
    ),
    '[]'::jsonb
  ) INTO membership_payload
  FROM lifeos_runtime.resolved_branch_members_v2(
    target_branch,
    branch_row.head_generation
  ) member
  JOIN lifeos_rvf.member_vector_identity identity
    ON identity.tenant_id = branch_row.tenant_id
   AND identity.relation_name = member.relation_name
   AND identity.member_key_digest = member.logical_key_digest;
  membership_digest := lifeos_runtime.cow_digest_v1(
    'rvf-membership',
    jsonb_build_object(
      'branch_id', target_branch,
      'generation', branch_row.head_generation,
      'members', membership_payload,
      'tenant_id', branch_row.tenant_id
    )
  );
  container_object := lifeos_runtime.store_generated_object(
    container_bytes,
    'rvf-cow-container-v2'
  );
  range_map_object := lifeos_runtime.store_generated_object(
    range_map_bytes,
    'rvf-cow-range-map-v2'
  );
  event_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1(
      'rvf-membership-event',
      jsonb_build_object(
        'branch_id', target_branch,
        'effect_id', target_effect,
        'execution_id', target_execution,
        'generation', branch_row.head_generation,
        'membership_digest', encode(membership_digest, 'hex'),
        'parent_container_id', parent_container,
        'request_id', request_state.request_id,
        'tenant_id', branch_row.tenant_id
      )
    ),
    'rvf-cow-membership-event-v2'
  );
  new_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    branch_row.head_generation,
    'rvf-cow-membership',
    event_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'membership_digest', encode(membership_digest, 'hex'),
      'request_id', request_state.request_id
    )
  );
  INSERT INTO lifeos_rvf.container (
    tenant_id, branch_id, generation, parent_container_id,
    raw_object_id, witness_id
  ) VALUES (
    branch_row.tenant_id, target_branch, branch_row.head_generation,
    parent_container, container_object, new_witness
  )
  RETURNING container_id INTO new_container;
  INSERT INTO lifeos_rvf.membership (
    tenant_id, container_id, branch_id, relation_name, member_key,
    member_key_digest, member_object_id, generation, tombstone, witness_id,
    vector_id
  )
  SELECT
    branch_row.tenant_id,
    new_container,
    target_branch,
    member.relation_name,
    member.logical_key,
    member.logical_key_digest,
    coalesce(member.row_object_id, member.record_object_id),
    branch_row.head_generation,
    member.operation = 'delete',
    new_witness,
    identity.vector_id
  FROM lifeos_runtime.resolved_branch_members_v2(
    target_branch,
    branch_row.head_generation
  ) member
  JOIN lifeos_rvf.member_vector_identity identity
    ON identity.tenant_id = branch_row.tenant_id
   AND identity.relation_name = member.relation_name
   AND identity.member_key_digest = member.logical_key_digest;
  IF parent_container IS NOT NULL THEN
    INSERT INTO lifeos_rvf.cow_map (
      tenant_id, child_container_id, parent_container_id, generation,
      range_map_object_id, membership_digest, witness_id
    ) VALUES (
      branch_row.tenant_id, new_container, parent_container,
      branch_row.head_generation, range_map_object, membership_digest,
      new_witness
    );
  END IF;
  SELECT count(*) INTO expected_count
  FROM lifeos_runtime.resolved_branch_members_v2(
    target_branch,
    branch_row.head_generation
  );
  SELECT count(*) INTO actual_count
  FROM lifeos_rvf.membership membership
  WHERE membership.container_id = new_container;
  IF expected_count <> actual_count THEN
    RAISE EXCEPTION
      'RVF relational mirror mismatch: expected %, actual %',
      expected_count,
      actual_count;
  END IF;
  INSERT INTO lifeos_rvf.branch_roundtrip_receipt (
    tenant_id, branch_id, container_id, generation, overlay_count,
    membership_count, membership_digest, verified, witness_id
  ) VALUES (
    branch_row.tenant_id, target_branch, new_container,
    branch_row.head_generation, expected_count, actual_count,
    membership_digest, true, new_witness
  );
  result := jsonb_build_object(
    'container_id', new_container,
    'membership_count', actual_count,
    'membership_digest', encode(membership_digest, 'hex'),
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_row.tenant_id,
    result,
    new_witness
  );
  RETURN new_container;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.record_cow_acceptance_receipt_v2(
  target_receipt_kind TEXT,
  target_suite_version TEXT,
  target_accepted BOOLEAN,
  evidence_bytes BYTEA,
  target_execution UUID,
  target_effect UUID,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  expected_suite TEXT;
  evidence_object BIGINT;
  evidence_digest BYTEA;
  receipt_payload JSONB;
  receipt_preimage BYTEA;
  receipt_preimage_object BIGINT;
  receipt_digest BYTEA;
  receipt_row lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  new_receipt UUID;
BEGIN
  expected_suite := CASE target_receipt_kind
    WHEN 'database-semantics' THEN 'lifeos.cow-db-semantic-suite.v1'
    WHEN 'native-rvf-roundtrip' THEN
      'lifeos.native-rvf-postgres-roundtrip.v1'
    ELSE NULL
  END;
  IF expected_suite IS NULL OR target_suite_version <> expected_suite THEN
    RAISE EXCEPTION 'unsupported COW acceptance receipt contract';
  END IF;
  IF evidence_bytes IS NULL
     OR target_execution IS NULL
     OR target_effect IS NULL
     OR btrim(coalesce(target_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'complete acceptance receipt evidence is required';
  END IF;
  evidence_object := lifeos_runtime.store_generated_object(
    evidence_bytes,
    'cow-acceptance-evidence-v1'
  );
  evidence_digest := extensions.ruvector_shake256_256(evidence_bytes);
  receipt_payload := jsonb_build_object(
    'accepted', target_accepted,
    'effect_id', target_effect,
    'evidence_digest', encode(evidence_digest, 'hex'),
    'execution_id', target_execution,
    'idempotency_key', target_idempotency_key,
    'receipt_kind', target_receipt_kind,
    'receipt_schema_version', 1,
    'suite_version', target_suite_version
  );
  receipt_preimage := lifeos_runtime.cow_preimage_v1(
    'acceptance-receipt',
    receipt_payload
  );
  receipt_preimage_object := lifeos_runtime.store_generated_object(
    receipt_preimage,
    'cow-acceptance-receipt-preimage-v1'
  );
  receipt_digest := extensions.ruvector_shake256_256(receipt_preimage);
  SELECT * INTO receipt_row
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = target_receipt_kind
    AND receipt.suite_version = target_suite_version
    AND receipt.idempotency_key = target_idempotency_key;
  IF FOUND THEN
    IF receipt_row.accepted IS DISTINCT FROM target_accepted
       OR receipt_row.evidence_digest <> evidence_digest
       OR receipt_row.receipt_digest <> receipt_digest
       OR receipt_row.execution_id <> target_execution
       OR receipt_row.effect_id <> target_effect
       OR NOT EXISTS (
         SELECT 1 FROM lifeos_blob.object object
         WHERE object.id = receipt_row.evidence_object_id
           AND object.raw_bytes = evidence_bytes
       )
       OR NOT EXISTS (
         SELECT 1 FROM lifeos_blob.object object
         WHERE object.id = receipt_row.receipt_preimage_object_id
           AND object.raw_bytes = receipt_preimage
       ) THEN
      RAISE EXCEPTION 'acceptance receipt full-input idempotency collision';
    END IF;
    RETURN receipt_row.receipt_id;
  END IF;
  INSERT INTO lifeos_runtime.cow_acceptance_receipt (
    receipt_schema_version, receipt_kind, suite_version, accepted,
    evidence_object_id, evidence_digest, receipt_preimage_object_id,
    receipt_digest, execution_id, effect_id, idempotency_key
  ) VALUES (
    1, target_receipt_kind, target_suite_version, target_accepted,
    evidence_object, evidence_digest, receipt_preimage_object, receipt_digest,
    target_execution, target_effect, target_idempotency_key
  )
  RETURNING receipt_id INTO new_receipt;
  RETURN new_receipt;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_semantic_self_check_v2()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  required_table_count INTEGER := 18;
  table_count INTEGER;
  required_function_count INTEGER := 21;
  function_count INTEGER;
  forced_rls_count INTEGER;
  legacy_witness_count BIGINT;
  invalid_witness_count BIGINT;
  invalid_chain_count BIGINT;
  old_envctl_execute_count INTEGER := 0;
BEGIN
  WITH required(name) AS (
    VALUES
      ('lifeos_runtime.branch'),
      ('lifeos_runtime.branch_overlay'),
      ('lifeos_agent.branch_witness'),
      ('lifeos_runtime.merge_gate'),
      ('lifeos_runtime.merge_conflict'),
      ('lifeos_runtime.merge_conflict_resolution'),
      ('lifeos_runtime.merge_conflict_application'),
      ('lifeos_runtime.promotion'),
      ('lifeos_runtime.branch_pointer'),
      ('lifeos_runtime.cow_request'),
      ('lifeos_runtime.cow_request_result'),
      ('lifeos_runtime.canonical_projection'),
      ('lifeos_runtime.cow_acceptance_receipt'),
      ('lifeos_rvf.container'),
      ('lifeos_rvf.cow_map'),
      ('lifeos_rvf.membership'),
      ('lifeos_rvf.member_vector_identity'),
      ('lifeos_rvf.branch_roundtrip_receipt')
  )
  SELECT count(*) INTO table_count
  FROM required
  WHERE to_regclass(name) IS NOT NULL;

  WITH required(name) AS (
    VALUES
      ('lifeos_runtime.current_tenant()'),
      ('lifeos_runtime.cow_preimage_v1(text,jsonb)'),
      ('lifeos_runtime.cow_digest_v1(text,jsonb)'),
      ('lifeos_agent.append_branch_witness_v2(uuid,bigint,text,bigint,jsonb)'),
      ('lifeos_runtime.put_canonical_projection_v2(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,uuid,text)'),
      ('lifeos_runtime.resolve_branch_record_v2(uuid,bigint,regclass,jsonb)'),
      ('lifeos_runtime.materialize_branch_v2(uuid,bigint)'),
      ('lifeos_runtime.create_root_branch_v2(uuid,text,text,jsonb,jsonb,text,uuid,uuid,text)'),
      ('lifeos_runtime.create_branch_v2(uuid,text,text,jsonb,jsonb,text,uuid,uuid,text)'),
      ('lifeos_runtime.append_branch_overlay_v2(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,uuid,text)'),
      ('lifeos_runtime.record_merge_gate_v2(uuid,text,boolean,bytea,uuid,uuid,text)'),
      ('lifeos_runtime.branch_gates_satisfied_v2(uuid)'),
      ('lifeos_runtime.resolve_merge_conflict_v2(uuid,text,bytea,jsonb,uuid,uuid,text)'),
      ('lifeos_runtime.merge_branch_v2(uuid,uuid,uuid,uuid,text)'),
      ('lifeos_runtime.promote_branch_v2(uuid,text,uuid,uuid,uuid,text)'),
      ('lifeos_runtime.rollback_branch_v2(uuid,text,uuid,uuid,uuid,text)'),
      ('lifeos_runtime.compare_promotion_snapshot_v2(uuid)'),
      ('lifeos_runtime.active_branch_snapshot_v2(uuid,text)'),
      ('lifeos_rvf.stable_vector_id_v2(uuid,regclass,bytea)'),
      ('lifeos_rvf.mirror_branch_membership_v2(uuid,uuid,bytea,bytea,uuid,uuid,text)'),
      ('lifeos_runtime.record_cow_acceptance_receipt_v2(text,text,boolean,bytea,uuid,uuid,text)')
  )
  SELECT count(*) INTO function_count
  FROM required
  WHERE to_regprocedure(name) IS NOT NULL;

  SELECT count(*) INTO forced_rls_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relforcerowsecurity
    AND namespace.nspname IN ('lifeos_runtime', 'lifeos_agent', 'lifeos_rvf')
    AND relation.relname IN (
      'branch', 'branch_overlay', 'branch_witness', 'merge_gate',
      'merge_conflict', 'merge_conflict_resolution',
      'merge_conflict_application', 'promotion', 'branch_pointer',
      'cow_request', 'cow_request_result', 'canonical_projection',
      'container', 'cow_map', 'membership', 'member_vector_identity',
      'branch_roundtrip_receipt'
    );

  SELECT count(*) INTO legacy_witness_count
  FROM lifeos_agent.branch_witness witness
  WHERE witness.preimage_version = 0;
  SELECT count(*) INTO invalid_witness_count
  FROM lifeos_agent.branch_witness witness
  JOIN lifeos_blob.object preimage
    ON preimage.id = witness.preimage_object_id
  WHERE witness.preimage_version = 1
    AND witness.entry_shake256
      <> extensions.ruvector_shake256_256(preimage.raw_bytes);
  WITH ordered AS (
    SELECT
      witness.branch_id,
      witness.sequence,
      witness.previous_shake256,
      lag(witness.entry_shake256) OVER (
        PARTITION BY witness.branch_id ORDER BY witness.sequence
      ) AS expected_previous
    FROM lifeos_agent.branch_witness witness
    WHERE witness.preimage_version = 1
  )
  SELECT count(*) INTO invalid_chain_count
  FROM ordered
  WHERE previous_shake256 <> coalesce(
    expected_previous,
    decode(repeat('00', 32), 'hex')
  );

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_envctl') THEN
    SELECT count(*) INTO old_envctl_execute_count
    FROM (VALUES
      ('lifeos_runtime.create_root_branch(uuid,text,text,jsonb,jsonb,text,bytea)'),
      ('lifeos_runtime.create_branch(uuid,text,text,jsonb,jsonb,text,bytea)'),
      ('lifeos_runtime.append_branch_overlay(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,bytea)'),
      ('lifeos_runtime.record_merge_gate(uuid,text,boolean,bytea,bytea,text)'),
      ('lifeos_runtime.resolve_merge_conflict(uuid,bytea,bytea,text)'),
      ('lifeos_runtime.merge_branch(uuid,uuid,bytea,text)'),
      ('lifeos_runtime.promote_branch(uuid,text,uuid,bytea,bytea,text)'),
      ('lifeos_runtime.rollback_branch(uuid,text,uuid,bytea,text)'),
      ('lifeos_rvf.mirror_branch_membership(uuid,uuid,bytea,bytea,bytea)')
    ) legacy(name)
    WHERE has_function_privilege('lifeos_envctl', name, 'EXECUTE');
  END IF;

  RETURN jsonb_build_object(
    'forced_rls_count', forced_rls_count,
    'function_count', function_count,
    'invalid_witness_chain_count', invalid_chain_count,
    'invalid_witness_count', invalid_witness_count,
    'legacy_envctl_execute_count', old_envctl_execute_count,
    'legacy_witness_count', legacy_witness_count,
    'ready',
      table_count = required_table_count
      AND function_count = required_function_count
      AND forced_rls_count = 17
      AND legacy_witness_count = 0
      AND invalid_witness_count = 0
      AND invalid_chain_count = 0
      AND old_envctl_execute_count = 0,
    'required_function_count', required_function_count,
    'required_table_count', required_table_count,
    'table_count', table_count
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_branch_capability()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime
AS $function$
DECLARE
  self_check JSONB;
  database_receipt lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  native_receipt lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  database_receipt_valid BOOLEAN := false;
  native_receipt_valid BOOLEAN := false;
BEGIN
  self_check := lifeos_runtime.cow_semantic_self_check_v2();
  SELECT * INTO database_receipt
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = 'database-semantics'
    AND receipt.suite_version = 'lifeos.cow-db-semantic-suite.v1'
    AND receipt.accepted
  ORDER BY receipt.created_at DESC, receipt.receipt_id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT
      database_receipt.receipt_digest
        = extensions.ruvector_shake256_256(preimage.raw_bytes)
      AND database_receipt.evidence_digest
        = extensions.ruvector_shake256_256(evidence.raw_bytes)
    INTO database_receipt_valid
    FROM lifeos_blob.object preimage
    JOIN lifeos_blob.object evidence
      ON evidence.id = database_receipt.evidence_object_id
    WHERE preimage.id = database_receipt.receipt_preimage_object_id;
  END IF;
  SELECT * INTO native_receipt
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = 'native-rvf-roundtrip'
    AND receipt.suite_version = 'lifeos.native-rvf-postgres-roundtrip.v1'
    AND receipt.accepted
  ORDER BY receipt.created_at DESC, receipt.receipt_id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT
      native_receipt.receipt_digest
        = extensions.ruvector_shake256_256(preimage.raw_bytes)
      AND native_receipt.evidence_digest
        = extensions.ruvector_shake256_256(evidence.raw_bytes)
    INTO native_receipt_valid
    FROM lifeos_blob.object preimage
    JOIN lifeos_blob.object evidence
      ON evidence.id = native_receipt.evidence_object_id
    WHERE preimage.id = native_receipt.receipt_preimage_object_id;
  END IF;
  RETURN self_check || jsonb_build_object(
    'acceptance_receipt_schema_version', 1,
    'database_receipt_id', database_receipt.receipt_id,
    'database_semantics_receipt', coalesce(database_receipt_valid, false),
    'implemented',
      (self_check->>'ready')::boolean
      AND coalesce(database_receipt_valid, false),
    'native_rvf_receipt_id', native_receipt.receipt_id,
    'overlay_resolution', 'overlay-nearest-ancestor-canonical-projection',
    'promotion', 'baseline-gated-database-materialized',
    'rollback', 'active-pointer-recursive-promotion-ancestry',
    'rvf_roundtrip', coalesce(native_receipt_valid, false),
    'schema_version', 2,
    'witness_algorithm', 'SHAKE256-256',
    'witness_preimage_schema', 'lifeos.cow-preimage.v1'
  );
END
$function$;

-- Revoke every legacy mutation route.  Keeping the functions present preserves
-- migration history and dependency resolution; removing EXECUTE makes the
-- caller-supplied-witness semantics unreachable.
REVOKE ALL ON FUNCTION lifeos_runtime.store_generated_object(BYTEA, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_agent.append_branch_witness(
  UUID, BIGINT, TEXT, BIGINT, BYTEA
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.create_root_branch(
  UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BYTEA
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.create_branch(
  UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BYTEA
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.append_branch_overlay(
  UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB, UUID, BYTEA
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.record_merge_gate(
  UUID, TEXT, BOOLEAN, BYTEA, BYTEA, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.resolve_merge_conflict(
  UUID, BYTEA, BYTEA, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.merge_branch(
  UUID, UUID, BYTEA, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.promote_branch(
  UUID, TEXT, UUID, BYTEA, BYTEA, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.rollback_branch(
  UUID, TEXT, UUID, BYTEA, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_rvf.mirror_branch_membership(
  UUID, UUID, BYTEA, BYTEA, BYTEA
) FROM PUBLIC;

DO $lifeos_cow_v2_role_revokes$
DECLARE
  role_name TEXT;
  target_table REGCLASS;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['lifeos_envctl', 'lifeos_runtime']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.create_root_branch(
           UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BYTEA
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.create_branch(
           UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BYTEA
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.append_branch_overlay(
           UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB, UUID, BYTEA
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.record_merge_gate(
           UUID, TEXT, BOOLEAN, BYTEA, BYTEA, TEXT
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.resolve_merge_conflict(
           UUID, BYTEA, BYTEA, TEXT
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.merge_branch(
           UUID, UUID, BYTEA, TEXT
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.promote_branch(
           UUID, TEXT, UUID, BYTEA, BYTEA, TEXT
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_runtime.rollback_branch(
           UUID, TEXT, UUID, BYTEA, TEXT
         ) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION lifeos_rvf.mirror_branch_membership(
           UUID, UUID, BYTEA, BYTEA, BYTEA
         ) FROM %I',
        role_name
      );
      FOREACH target_table IN ARRAY ARRAY[
        'lifeos_runtime.branch'::regclass,
        'lifeos_agent.branch_witness'::regclass,
        'lifeos_runtime.branch_overlay'::regclass,
        'lifeos_runtime.merge_gate'::regclass,
        'lifeos_runtime.merge_conflict'::regclass,
        'lifeos_runtime.merge_conflict_resolution'::regclass,
        'lifeos_runtime.merge_conflict_application'::regclass,
        'lifeos_runtime.promotion'::regclass,
        'lifeos_runtime.branch_pointer'::regclass,
        'lifeos_runtime.cow_request'::regclass,
        'lifeos_runtime.cow_request_result'::regclass,
        'lifeos_runtime.canonical_projection'::regclass,
        'lifeos_runtime.cow_acceptance_receipt'::regclass,
        'lifeos_rvf.container'::regclass,
        'lifeos_rvf.cow_map'::regclass,
        'lifeos_rvf.membership'::regclass,
        'lifeos_rvf.member_vector_identity'::regclass,
        'lifeos_rvf.branch_roundtrip_receipt'::regclass
      ]
      LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', target_table, role_name);
      END LOOP;
    END IF;
  END LOOP;
END
$lifeos_cow_v2_role_revokes$;

REVOKE ALL ON FUNCTION lifeos_runtime.require_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.begin_cow_request_v2(
  UUID, TEXT, TEXT, JSONB, UUID, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.complete_cow_request_v2(
  UUID, UUID, JSONB, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_agent.append_branch_witness_v2(
  UUID, BIGINT, TEXT, BIGINT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.append_branch_overlay_internal_v2(
  UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB, UUID, UUID, UUID,
  BYTEA, BOOLEAN, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.put_canonical_projection_v2(
  UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.resolve_branch_record_v2(
  UUID, BIGINT, REGCLASS, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.materialize_branch_v2(
  UUID, BIGINT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.create_root_branch_v2(
  UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.create_branch_v2(
  UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.append_branch_overlay_v2(
  UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.record_merge_gate_v2(
  UUID, TEXT, BOOLEAN, BYTEA, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.branch_gates_satisfied_v2(
  UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.resolve_merge_conflict_v2(
  UUID, TEXT, BYTEA, JSONB, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.merge_branch_v2(
  UUID, UUID, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.promote_branch_v2(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.rollback_branch_v2(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.compare_promotion_snapshot_v2(
  UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.active_branch_snapshot_v2(
  UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_rvf.stable_vector_id_v2(
  UUID, REGCLASS, BYTEA
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_rvf.mirror_branch_membership_v2(
  UUID, UUID, BYTEA, BYTEA, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.record_cow_acceptance_receipt_v2(
  TEXT, TEXT, BOOLEAN, BYTEA, UUID, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifeos_runtime.cow_semantic_self_check_v2()
  FROM PUBLIC;

DO $lifeos_cow_v2_envctl_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_envctl') THEN
    GRANT USAGE ON SCHEMA lifeos_runtime, lifeos_agent, lifeos_rvf
      TO lifeos_envctl;
    GRANT EXECUTE ON FUNCTION
      lifeos_runtime.put_canonical_projection_v2(
        UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB, UUID, UUID, TEXT
      ),
      lifeos_runtime.resolve_branch_record_v2(
        UUID, BIGINT, REGCLASS, JSONB
      ),
      lifeos_runtime.materialize_branch_v2(UUID, BIGINT),
      lifeos_runtime.create_root_branch_v2(
        UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID, TEXT
      ),
      lifeos_runtime.create_branch_v2(
        UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID, TEXT
      ),
      lifeos_runtime.append_branch_overlay_v2(
        UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB,
        UUID, UUID, TEXT
      ),
      lifeos_runtime.record_merge_gate_v2(
        UUID, TEXT, BOOLEAN, BYTEA, UUID, UUID, TEXT
      ),
      lifeos_runtime.branch_gates_satisfied_v2(UUID),
      lifeos_runtime.resolve_merge_conflict_v2(
        UUID, TEXT, BYTEA, JSONB, UUID, UUID, TEXT
      ),
      lifeos_runtime.merge_branch_v2(UUID, UUID, UUID, UUID, TEXT),
      lifeos_runtime.promote_branch_v2(
        UUID, TEXT, UUID, UUID, UUID, TEXT
      ),
      lifeos_runtime.rollback_branch_v2(
        UUID, TEXT, UUID, UUID, UUID, TEXT
      ),
      lifeos_runtime.compare_promotion_snapshot_v2(UUID),
      lifeos_runtime.active_branch_snapshot_v2(UUID, TEXT),
      lifeos_rvf.stable_vector_id_v2(UUID, REGCLASS, BYTEA),
      lifeos_rvf.mirror_branch_membership_v2(
        UUID, UUID, BYTEA, BYTEA, UUID, UUID, TEXT
      ),
      lifeos_runtime.record_cow_acceptance_receipt_v2(
        TEXT, TEXT, BOOLEAN, BYTEA, UUID, UUID, TEXT
      )
    TO lifeos_envctl;
  END IF;
END
$lifeos_cow_v2_envctl_grants$;

GRANT EXECUTE ON FUNCTION lifeos_runtime.cow_branch_capability() TO PUBLIC;
GRANT EXECUTE ON FUNCTION extensions.lifeos_cow_branch_capability() TO PUBLIC;
