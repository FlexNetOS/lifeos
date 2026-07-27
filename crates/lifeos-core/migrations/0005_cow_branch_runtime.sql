-- Copy-on-write runtime for isolated proposals, witnessed gates, atomic
-- promotion, exact rollback, and RVF branch-membership round trips.
DO $lifeos_cow_schemas$
DECLARE
  required_schema TEXT;
BEGIN
  FOREACH required_schema IN ARRAY ARRAY['lifeos_agent', 'lifeos_rvf']
  LOOP
    IF to_regnamespace(required_schema) IS NULL THEN
      RAISE EXCEPTION
        'LifeOS COW migration requires bootstrap-created schema %',
        required_schema;
    END IF;
  END LOOP;
END
$lifeos_cow_schemas$;

CREATE OR REPLACE FUNCTION lifeos_runtime.store_generated_object(
  object_bytes BYTEA,
  object_source_kind TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob
AS $function$
DECLARE
  object_sha256 TEXT := encode(extensions.digest(object_bytes, 'sha256'), 'hex');
  stored_object_id BIGINT;
BEGIN
  IF object_source_kind IS NULL OR btrim(object_source_kind) = '' THEN
    RAISE EXCEPTION 'generated object source kind is required';
  END IF;

  INSERT INTO lifeos_blob.object (
    sha256, byte_length, raw_bytes, source_kind
  ) VALUES (
    object_sha256, octet_length(object_bytes), object_bytes, object_source_kind
  )
  ON CONFLICT (sha256) DO NOTHING
  RETURNING id INTO stored_object_id;

  IF stored_object_id IS NULL THEN
    SELECT id INTO stored_object_id
    FROM lifeos_blob.object
    WHERE sha256 = object_sha256
      AND byte_length = octet_length(object_bytes)
      AND raw_bytes = object_bytes;
  END IF;

  IF stored_object_id IS NULL THEN
    RAISE EXCEPTION 'SHA-256 collision while storing generated object';
  END IF;
  RETURN stored_object_id;
END
$function$;

CREATE TABLE lifeos_runtime.branch (
  branch_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  parent_branch_id UUID REFERENCES lifeos_runtime.branch(branch_id),
  parent_generation BIGINT,
  base_lsn PG_LSN NOT NULL DEFAULT pg_current_wal_lsn(),
  branch_kind TEXT NOT NULL CHECK (btrim(branch_kind) <> ''),
  purpose TEXT NOT NULL CHECK (btrim(purpose) <> ''),
  policy JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(policy) = 'object'),
  model_adapters JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(model_adapters) = 'object'),
  creation_key TEXT NOT NULL CHECK (btrim(creation_key) <> ''),
  raw_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  head_generation BIGINT NOT NULL DEFAULT 0 CHECK (head_generation >= 0),
  created_by TEXT NOT NULL CHECK (btrim(created_by) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (parent_branch_id IS DISTINCT FROM branch_id),
  CHECK (
    (parent_branch_id IS NULL AND parent_generation IS NULL)
    OR
    (parent_branch_id IS NOT NULL AND parent_generation IS NOT NULL
     AND parent_generation >= 0)
  )
);
CREATE UNIQUE INDEX lifeos_branch_creation_key_idx
  ON lifeos_runtime.branch(tenant_id, creation_key);
CREATE INDEX lifeos_branch_parent_idx
  ON lifeos_runtime.branch(parent_branch_id);
CREATE INDEX lifeos_branch_tenant_kind_idx
  ON lifeos_runtime.branch(tenant_id, branch_kind, created_at);

CREATE TABLE lifeos_agent.branch_witness (
  witness_id UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  generation BIGINT NOT NULL CHECK (generation >= 0),
  witness_kind TEXT NOT NULL CHECK (btrim(witness_kind) <> ''),
  previous_shake256 BYTEA NOT NULL
    CHECK (octet_length(previous_shake256) = 32),
  entry_shake256 BYTEA NOT NULL
    CHECK (octet_length(entry_shake256) = 32),
  payload_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (branch_id, sequence),
  UNIQUE (witness_id),
  UNIQUE (branch_id, entry_shake256)
);
CREATE INDEX lifeos_branch_witness_generation_idx
  ON lifeos_agent.branch_witness(branch_id, generation, sequence);

CREATE OR REPLACE FUNCTION lifeos_agent.append_branch_witness(
  target_branch UUID,
  target_generation BIGINT,
  target_kind TEXT,
  target_payload_object BIGINT,
  target_shake256 BYTEA
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  branch_head BIGINT;
  prior_shake256 BYTEA;
  new_witness_id UUID;
BEGIN
  IF octet_length(target_shake256) <> 32 THEN
    RAISE EXCEPTION 'SHAKE256-256 witness must contain exactly 32 bytes';
  END IF;

  SELECT head_generation INTO STRICT branch_head
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  IF target_generation > branch_head THEN
    RAISE EXCEPTION
      'witness generation % exceeds branch head %',
      target_generation, branch_head;
  END IF;

  SELECT entry_shake256 INTO prior_shake256
  FROM lifeos_agent.branch_witness
  WHERE branch_id = target_branch
  ORDER BY sequence DESC
  LIMIT 1;
  prior_shake256 := coalesce(
    prior_shake256,
    decode(repeat('00', 32), 'hex')
  );

  INSERT INTO lifeos_agent.branch_witness (
    branch_id, generation, witness_kind, previous_shake256,
    entry_shake256, payload_object_id
  ) VALUES (
    target_branch, target_generation, target_kind, prior_shake256,
    target_shake256, target_payload_object
  )
  RETURNING witness_id INTO new_witness_id;
  RETURN new_witness_id;
END
$function$;

CREATE TABLE lifeos_runtime.branch_overlay (
  branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  generation BIGINT NOT NULL CHECK (generation > 0),
  relation_name REGCLASS NOT NULL,
  logical_key JSONB NOT NULL CHECK (jsonb_typeof(logical_key) = 'object'),
  logical_key_digest BYTEA NOT NULL
    CHECK (octet_length(logical_key_digest) = 32),
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  base_digest BYTEA CHECK (
    base_digest IS NULL OR octet_length(base_digest) = 32
  ),
  record_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  row_object_id BIGINT REFERENCES lifeos_blob.object(id),
  row_json JSONB,
  execution_id UUID NOT NULL,
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (branch_id, sequence),
  UNIQUE (branch_id, generation),
  UNIQUE (branch_id, execution_id),
  CHECK (
    (operation = 'delete' AND row_object_id IS NULL AND row_json IS NULL)
    OR
    (operation IN ('insert', 'update') AND row_object_id IS NOT NULL)
  )
);
CREATE INDEX lifeos_branch_overlay_key_idx
  ON lifeos_runtime.branch_overlay(
    branch_id, relation_name, logical_key_digest, generation DESC
  );
CREATE INDEX lifeos_branch_overlay_key_gin
  ON lifeos_runtime.branch_overlay USING gin(logical_key);

CREATE TABLE lifeos_runtime.merge_gate (
  merge_gate_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  generation BIGINT NOT NULL CHECK (generation >= 0),
  gate_kind TEXT NOT NULL CHECK (btrim(gate_kind) <> ''),
  passed BOOLEAN NOT NULL,
  evidence_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  evidence_digest BYTEA NOT NULL CHECK (octet_length(evidence_digest) = 32),
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (branch_id, generation, gate_kind, idempotency_key)
);
CREATE INDEX lifeos_merge_gate_head_idx
  ON lifeos_runtime.merge_gate(
    branch_id, generation, gate_kind, created_at DESC
  );

CREATE TABLE lifeos_runtime.merge_conflict (
  merge_conflict_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  source_branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  target_branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  source_generation BIGINT NOT NULL,
  target_generation BIGINT NOT NULL,
  relation_name REGCLASS NOT NULL,
  logical_key JSONB NOT NULL,
  logical_key_digest BYTEA NOT NULL
    CHECK (octet_length(logical_key_digest) = 32),
  conflict_kind TEXT NOT NULL CHECK (
    conflict_kind IN (
      'key', 'byte', 'ast', 'semantic', 'graph', 'policy', 'release'
    )
  ),
  base_digest BYTEA CHECK (
    base_digest IS NULL OR octet_length(base_digest) = 32
  ),
  source_object_id BIGINT REFERENCES lifeos_blob.object(id),
  target_object_id BIGINT REFERENCES lifeos_blob.object(id),
  record_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE lifeos_runtime.merge_conflict_resolution (
  resolution_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  merge_conflict_id UUID NOT NULL UNIQUE
    REFERENCES lifeos_runtime.merge_conflict(merge_conflict_id),
  resolution_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE lifeos_runtime.promotion (
  promotion_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pointer_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('merge', 'promote', 'rollback')),
  previous_promotion_id UUID REFERENCES lifeos_runtime.promotion(promotion_id),
  source_branch_id UUID REFERENCES lifeos_runtime.branch(branch_id),
  target_branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  from_generation BIGINT,
  to_generation BIGINT NOT NULL CHECK (to_generation >= 0),
  snapshot_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  event_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (
    (action = 'merge' AND pointer_name IS NULL)
    OR
    (action IN ('promote', 'rollback') AND btrim(pointer_name) <> '')
  )
);
CREATE INDEX lifeos_promotion_pointer_history_idx
  ON lifeos_runtime.promotion(tenant_id, pointer_name, created_at DESC);

CREATE TABLE lifeos_runtime.branch_pointer (
  tenant_id UUID NOT NULL,
  pointer_name TEXT NOT NULL CHECK (btrim(pointer_name) <> ''),
  branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  generation BIGINT NOT NULL CHECK (generation >= 0),
  snapshot_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  active_promotion_id UUID NOT NULL
    REFERENCES lifeos_runtime.promotion(promotion_id),
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, pointer_name)
);

CREATE TABLE lifeos_rvf.container (
  container_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  generation BIGINT NOT NULL CHECK (generation >= 0),
  parent_container_id UUID REFERENCES lifeos_rvf.container(container_id),
  raw_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (branch_id, generation)
);

CREATE TABLE lifeos_rvf.cow_map (
  cow_map_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  child_container_id UUID NOT NULL
    REFERENCES lifeos_rvf.container(container_id),
  parent_container_id UUID NOT NULL
    REFERENCES lifeos_rvf.container(container_id),
  generation BIGINT NOT NULL CHECK (generation >= 0),
  range_map_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  membership_digest BYTEA NOT NULL
    CHECK (octet_length(membership_digest) = 32),
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  UNIQUE (child_container_id, parent_container_id, generation)
);

CREATE TABLE lifeos_rvf.membership (
  membership_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  container_id UUID NOT NULL REFERENCES lifeos_rvf.container(container_id),
  branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  relation_name REGCLASS NOT NULL,
  member_key JSONB NOT NULL,
  member_key_digest BYTEA NOT NULL
    CHECK (octet_length(member_key_digest) = 32),
  member_object_id BIGINT NOT NULL REFERENCES lifeos_blob.object(id),
  generation BIGINT NOT NULL CHECK (generation >= 0),
  tombstone BOOLEAN NOT NULL,
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  UNIQUE (container_id, relation_name, member_key_digest)
);
CREATE INDEX lifeos_rvf_membership_lookup_idx
  ON lifeos_rvf.membership(
    branch_id, relation_name, member_key_digest, generation DESC
  );

CREATE TABLE lifeos_rvf.branch_roundtrip_receipt (
  receipt_id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES lifeos_runtime.branch(branch_id),
  container_id UUID NOT NULL REFERENCES lifeos_rvf.container(container_id),
  generation BIGINT NOT NULL,
  overlay_count BIGINT NOT NULL CHECK (overlay_count >= 0),
  membership_count BIGINT NOT NULL CHECK (membership_count >= 0),
  membership_digest BYTEA NOT NULL
    CHECK (octet_length(membership_digest) = 32),
  verified BOOLEAN NOT NULL,
  witness_id UUID NOT NULL
    REFERENCES lifeos_agent.branch_witness(witness_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (branch_id, generation)
);

CREATE OR REPLACE FUNCTION lifeos_runtime.reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.protect_branch_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'branch rows are never deleted';
  END IF;
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.parent_branch_id IS DISTINCT FROM OLD.parent_branch_id
     OR NEW.parent_generation IS DISTINCT FROM OLD.parent_generation
     OR NEW.base_lsn IS DISTINCT FROM OLD.base_lsn
     OR NEW.branch_kind IS DISTINCT FROM OLD.branch_kind
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.policy IS DISTINCT FROM OLD.policy
     OR NEW.model_adapters IS DISTINCT FROM OLD.model_adapters
     OR NEW.creation_key IS DISTINCT FROM OLD.creation_key
     OR NEW.raw_object_id IS DISTINCT FROM OLD.raw_object_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.head_generation < OLD.head_generation THEN
    RAISE EXCEPTION 'branch identity is immutable and head generation is monotonic';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER lifeos_branch_identity_guard
  BEFORE UPDATE OR DELETE ON lifeos_runtime.branch
  FOR EACH ROW EXECUTE FUNCTION lifeos_runtime.protect_branch_identity();

DO $lifeos_append_only_triggers$
DECLARE
  target REGCLASS;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'lifeos_agent.branch_witness'::regclass,
    'lifeos_runtime.branch_overlay'::regclass,
    'lifeos_runtime.merge_gate'::regclass,
    'lifeos_runtime.merge_conflict'::regclass,
    'lifeos_runtime.merge_conflict_resolution'::regclass,
    'lifeos_runtime.promotion'::regclass,
    'lifeos_rvf.container'::regclass,
    'lifeos_rvf.cow_map'::regclass,
    'lifeos_rvf.membership'::regclass,
    'lifeos_rvf.branch_roundtrip_receipt'::regclass
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER lifeos_append_only BEFORE UPDATE OR DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION lifeos_runtime.reject_append_only_mutation()',
      target
    );
  END LOOP;
END
$lifeos_append_only_triggers$;

CREATE OR REPLACE FUNCTION lifeos_runtime.create_root_branch(
  branch_tenant UUID,
  kind TEXT,
  branch_purpose TEXT,
  branch_policy JSONB,
  adapters JSONB,
  creator TEXT,
  creation_shake256 BYTEA
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  branch_payload JSONB;
  branch_object BIGINT;
  branch_creation_key TEXT;
  new_branch UUID;
BEGIN
  branch_payload := jsonb_build_object(
    'tenant_id', branch_tenant,
    'parent_branch_id', NULL,
    'branch_kind', kind,
    'purpose', branch_purpose,
    'policy', branch_policy,
    'model_adapters', adapters,
    'created_by', creator
  );
  branch_creation_key := encode(
    extensions.digest(convert_to(branch_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  SELECT branch_id INTO new_branch
  FROM lifeos_runtime.branch
  WHERE tenant_id = branch_tenant
    AND creation_key = branch_creation_key;
  IF new_branch IS NOT NULL THEN
    RETURN new_branch;
  END IF;
  branch_object := lifeos_runtime.store_generated_object(
    convert_to(branch_payload::text, 'UTF8'),
    'cow-branch-root'
  );
  INSERT INTO lifeos_runtime.branch (
    tenant_id, branch_kind, purpose, policy, model_adapters,
    creation_key, raw_object_id, created_by
  ) VALUES (
    branch_tenant, kind, branch_purpose, branch_policy, adapters,
    branch_creation_key, branch_object, creator
  )
  RETURNING branch_id INTO new_branch;

  PERFORM lifeos_agent.append_branch_witness(
    new_branch, 0, 'branch-create', branch_object, creation_shake256
  );
  RETURN new_branch;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.create_branch(
  parent_branch UUID,
  kind TEXT,
  branch_purpose TEXT,
  branch_policy JSONB,
  adapters JSONB,
  creator TEXT,
  creation_shake256 BYTEA
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  parent_row lifeos_runtime.branch%ROWTYPE;
  branch_payload JSONB;
  branch_object BIGINT;
  branch_creation_key TEXT;
  new_branch UUID;
BEGIN
  SELECT * INTO STRICT parent_row
  FROM lifeos_runtime.branch
  WHERE branch_id = parent_branch
  FOR SHARE;

  branch_payload := jsonb_build_object(
    'tenant_id', parent_row.tenant_id,
    'parent_branch_id', parent_branch,
    'parent_generation', parent_row.head_generation,
    'branch_kind', kind,
    'purpose', branch_purpose,
    'policy', branch_policy,
    'model_adapters', adapters,
    'created_by', creator
  );
  branch_creation_key := encode(
    extensions.digest(convert_to(branch_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  SELECT branch_id INTO new_branch
  FROM lifeos_runtime.branch
  WHERE tenant_id = parent_row.tenant_id
    AND creation_key = branch_creation_key;
  IF new_branch IS NOT NULL THEN
    RETURN new_branch;
  END IF;
  branch_object := lifeos_runtime.store_generated_object(
    convert_to(branch_payload::text, 'UTF8'),
    'cow-branch-child'
  );
  INSERT INTO lifeos_runtime.branch (
    tenant_id, parent_branch_id, parent_generation, base_lsn,
    branch_kind, purpose, policy, model_adapters, creation_key, raw_object_id,
    head_generation, created_by
  ) VALUES (
    parent_row.tenant_id, parent_branch, parent_row.head_generation,
    pg_current_wal_lsn(), kind, branch_purpose, branch_policy, adapters,
    branch_creation_key, branch_object, parent_row.head_generation, creator
  )
  RETURNING branch_id INTO new_branch;

  PERFORM lifeos_agent.append_branch_witness(
    new_branch, parent_row.head_generation, 'branch-create',
    branch_object, creation_shake256
  );
  RETURN new_branch;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.append_branch_overlay(
  target_branch UUID,
  target_relation REGCLASS,
  target_key JSONB,
  target_operation TEXT,
  target_base_digest BYTEA,
  replacement_bytes BYTEA,
  replacement_json JSONB,
  target_execution UUID,
  overlay_shake256 BYTEA
) RETURNS TABLE (
  overlay_sequence BIGINT,
  overlay_generation BIGINT,
  replacement_object_id BIGINT,
  overlay_witness_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  key_digest BYTEA;
  row_object BIGINT;
  record_object BIGINT;
  record_payload JSONB;
  new_generation BIGINT;
  new_witness UUID;
  existing_overlay lifeos_runtime.branch_overlay%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  IF jsonb_typeof(target_key) <> 'object' THEN
    RAISE EXCEPTION 'overlay logical key must be a JSON object';
  END IF;
  IF target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'unsupported overlay operation %', target_operation;
  END IF;
  IF target_base_digest IS NOT NULL
     AND octet_length(target_base_digest) <> 32 THEN
    RAISE EXCEPTION 'base digest must contain exactly 32 bytes';
  END IF;
  IF target_operation = 'delete' AND
     (replacement_bytes IS NOT NULL OR replacement_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete overlays cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND replacement_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update overlays require replacement bytes';
  END IF;
  key_digest := extensions.digest(
    convert_to(target_key::text, 'UTF8'), 'sha256'
  );

  SELECT * INTO existing_overlay
  FROM lifeos_runtime.branch_overlay
  WHERE branch_id = target_branch
    AND execution_id = target_execution;
  IF FOUND THEN
    SELECT
      existing_overlay.relation_name = target_relation
      AND existing_overlay.logical_key = target_key
      AND existing_overlay.logical_key_digest = key_digest
      AND existing_overlay.operation = target_operation
      AND existing_overlay.base_digest IS NOT DISTINCT FROM target_base_digest
      AND existing_overlay.row_json IS NOT DISTINCT FROM replacement_json
      AND (
        (existing_overlay.row_object_id IS NULL AND replacement_bytes IS NULL)
        OR EXISTS (
          SELECT 1
          FROM lifeos_blob.object object
          WHERE object.id = existing_overlay.row_object_id
            AND object.raw_bytes = replacement_bytes
        )
      )
    INTO existing_matches;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'branch-overlay execution idempotency collision';
    END IF;
    RETURN QUERY SELECT
      existing_overlay.sequence,
      existing_overlay.generation,
      existing_overlay.row_object_id,
      existing_overlay.witness_id;
    RETURN;
  END IF;

  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR UPDATE;
  new_generation := branch_row.head_generation + 1;

  IF replacement_bytes IS NOT NULL THEN
    row_object := lifeos_runtime.store_generated_object(
      replacement_bytes, 'cow-overlay-row'
    );
  END IF;
  record_payload := jsonb_build_object(
    'branch_id', target_branch,
    'generation', new_generation,
    'relation_name', target_relation::text,
    'logical_key', target_key,
    'operation', target_operation,
    'base_digest', CASE
      WHEN target_base_digest IS NULL THEN NULL
      ELSE encode(target_base_digest, 'hex')
    END,
    'row_object_id', row_object,
    'execution_id', target_execution
  );
  record_object := lifeos_runtime.store_generated_object(
    convert_to(record_payload::text, 'UTF8'),
    'cow-overlay-record'
  );

  UPDATE lifeos_runtime.branch
  SET head_generation = new_generation
  WHERE branch_id = target_branch;
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, new_generation, 'overlay-append',
    record_object, overlay_shake256
  );

  RETURN QUERY
  INSERT INTO lifeos_runtime.branch_overlay (
    branch_id, generation, relation_name, logical_key,
    logical_key_digest, operation, base_digest, record_object_id,
    row_object_id, row_json, execution_id, witness_id
  ) VALUES (
    target_branch, new_generation, target_relation, target_key,
    key_digest, target_operation, target_base_digest, record_object,
    row_object, replacement_json, target_execution, new_witness
  )
  RETURNING
    sequence, generation, row_object_id, witness_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_branch_overlay(
  target_branch UUID,
  target_relation REGCLASS,
  target_key JSONB
) RETURNS TABLE (
  source_branch_id UUID,
  source_depth INTEGER,
  sequence BIGINT,
  generation BIGINT,
  relation_name REGCLASS,
  logical_key JSONB,
  operation TEXT,
  base_digest BYTEA,
  record_object_id BIGINT,
  row_object_id BIGINT,
  row_json JSONB,
  witness_id UUID
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, lifeos_runtime
AS $function$
  WITH RECURSIVE ancestry AS (
    SELECT
      branch.branch_id,
      0 AS depth,
      branch.head_generation AS generation_ceiling,
      branch.parent_branch_id,
      branch.parent_generation
    FROM lifeos_runtime.branch branch
    WHERE branch.branch_id = target_branch
    UNION ALL
    SELECT
      parent.branch_id,
      ancestry.depth + 1,
      ancestry.parent_generation,
      parent.parent_branch_id,
      parent.parent_generation
    FROM ancestry
    JOIN lifeos_runtime.branch parent
      ON parent.branch_id = ancestry.parent_branch_id
  )
  SELECT
    overlay.branch_id,
    ancestry.depth,
    overlay.sequence,
    overlay.generation,
    overlay.relation_name,
    overlay.logical_key,
    overlay.operation,
    overlay.base_digest,
    overlay.record_object_id,
    overlay.row_object_id,
    overlay.row_json,
    overlay.witness_id
  FROM ancestry
  JOIN lifeos_runtime.branch_overlay overlay
    ON overlay.branch_id = ancestry.branch_id
   AND overlay.generation <= ancestry.generation_ceiling
  WHERE overlay.relation_name = target_relation
    AND overlay.logical_key = target_key
  ORDER BY ancestry.depth, overlay.generation DESC, overlay.sequence DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_branch_membership(
  target_branch UUID
) RETURNS TABLE (
  source_branch_id UUID,
  source_depth INTEGER,
  sequence BIGINT,
  generation BIGINT,
  relation_name REGCLASS,
  logical_key JSONB,
  logical_key_digest BYTEA,
  operation TEXT,
  record_object_id BIGINT,
  row_object_id BIGINT,
  witness_id UUID
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, lifeos_runtime
AS $function$
  WITH RECURSIVE ancestry AS (
    SELECT
      branch.branch_id,
      0 AS depth,
      branch.head_generation AS generation_ceiling,
      branch.parent_branch_id,
      branch.parent_generation
    FROM lifeos_runtime.branch branch
    WHERE branch.branch_id = target_branch
    UNION ALL
    SELECT
      parent.branch_id,
      ancestry.depth + 1,
      ancestry.parent_generation,
      parent.parent_branch_id,
      parent.parent_generation
    FROM ancestry
    JOIN lifeos_runtime.branch parent
      ON parent.branch_id = ancestry.parent_branch_id
  ),
  ranked AS (
    SELECT
      overlay.branch_id,
      ancestry.depth,
      overlay.sequence,
      overlay.generation,
      overlay.relation_name,
      overlay.logical_key,
      overlay.logical_key_digest,
      overlay.operation,
      overlay.record_object_id,
      overlay.row_object_id,
      overlay.witness_id,
      row_number() OVER (
        PARTITION BY overlay.relation_name, overlay.logical_key_digest
        ORDER BY ancestry.depth, overlay.generation DESC, overlay.sequence DESC
      ) AS rank
    FROM ancestry
    JOIN lifeos_runtime.branch_overlay overlay
      ON overlay.branch_id = ancestry.branch_id
     AND overlay.generation <= ancestry.generation_ceiling
  )
  SELECT
    branch_id, depth, sequence, generation, relation_name, logical_key,
    logical_key_digest, operation, record_object_id, row_object_id, witness_id
  FROM ranked
  WHERE rank = 1
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.record_merge_gate(
  target_branch UUID,
  target_gate_kind TEXT,
  target_passed BOOLEAN,
  evidence_bytes BYTEA,
  gate_shake256 BYTEA,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  branch_head BIGINT;
  evidence_object BIGINT;
  evidence_sha256 BYTEA;
  new_witness UUID;
  new_gate UUID;
  existing_gate lifeos_runtime.merge_gate%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  SELECT * INTO existing_gate
  FROM lifeos_runtime.merge_gate
  WHERE branch_id = target_branch
    AND gate_kind = target_gate_kind
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    SELECT raw_bytes = evidence_bytes
      AND existing_gate.passed = target_passed
    INTO existing_matches
    FROM lifeos_blob.object
    WHERE id = existing_gate.evidence_object_id;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'merge-gate idempotency collision';
    END IF;
    RETURN existing_gate.merge_gate_id;
  END IF;

  SELECT head_generation INTO STRICT branch_head
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  evidence_object := lifeos_runtime.store_generated_object(
    evidence_bytes, 'cow-merge-gate-evidence'
  );
  evidence_sha256 := extensions.digest(evidence_bytes, 'sha256');
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, branch_head, 'merge-gate:' || target_gate_kind,
    evidence_object, gate_shake256
  );
  INSERT INTO lifeos_runtime.merge_gate (
    branch_id, generation, gate_kind, passed, evidence_object_id,
    evidence_digest, witness_id, idempotency_key
  ) VALUES (
    target_branch, branch_head, target_gate_kind, target_passed,
    evidence_object, evidence_sha256, new_witness, target_idempotency_key
  )
  RETURNING merge_gate_id INTO new_gate;
  RETURN new_gate;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.branch_gates_satisfied(
  target_branch UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, lifeos_runtime
AS $function$
  WITH branch_head AS (
    SELECT branch_id, head_generation, policy
    FROM lifeos_runtime.branch
    WHERE branch_id = target_branch
  ),
  required AS (
    SELECT jsonb_array_elements_text(
      coalesce(branch_head.policy->'required_gates', '[]'::jsonb)
    ) AS gate_kind
    FROM branch_head
  ),
  latest AS (
    SELECT DISTINCT ON (gate.gate_kind)
      gate.gate_kind, gate.passed
    FROM lifeos_runtime.merge_gate gate
    JOIN branch_head
      ON branch_head.branch_id = gate.branch_id
     AND branch_head.head_generation = gate.generation
    ORDER BY gate.gate_kind, gate.created_at DESC, gate.merge_gate_id DESC
  )
  SELECT NOT EXISTS (
    SELECT 1
    FROM required
    LEFT JOIN latest USING (gate_kind)
    WHERE latest.gate_kind IS NULL OR NOT latest.passed
  )
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_merge_conflict(
  target_conflict UUID,
  resolution_bytes BYTEA,
  resolution_shake256 BYTEA,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  conflict_row lifeos_runtime.merge_conflict%ROWTYPE;
  resolution_object BIGINT;
  new_witness UUID;
  new_resolution UUID;
  existing_resolution lifeos_runtime.merge_conflict_resolution%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  SELECT * INTO STRICT conflict_row
  FROM lifeos_runtime.merge_conflict
  WHERE merge_conflict_id = target_conflict
  FOR SHARE;

  SELECT * INTO existing_resolution
  FROM lifeos_runtime.merge_conflict_resolution
  WHERE merge_conflict_id = target_conflict;
  IF FOUND THEN
    SELECT object.raw_bytes = resolution_bytes
      AND existing_resolution.idempotency_key = target_idempotency_key
    INTO existing_matches
    FROM lifeos_blob.object object
    WHERE object.id = existing_resolution.resolution_object_id;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'merge-conflict resolution idempotency collision';
    END IF;
    RETURN existing_resolution.resolution_id;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict_resolution
    WHERE idempotency_key = target_idempotency_key
  ) THEN
    RAISE EXCEPTION 'merge-conflict resolution idempotency collision';
  END IF;

  resolution_object := lifeos_runtime.store_generated_object(
    resolution_bytes, 'cow-merge-conflict-resolution'
  );
  new_witness := lifeos_agent.append_branch_witness(
    conflict_row.target_branch_id,
    conflict_row.target_generation,
    'merge-conflict-resolution',
    resolution_object,
    resolution_shake256
  );
  INSERT INTO lifeos_runtime.merge_conflict_resolution (
    merge_conflict_id, resolution_object_id, witness_id, idempotency_key
  ) VALUES (
    target_conflict, resolution_object, new_witness, target_idempotency_key
  )
  RETURNING resolution_id INTO new_resolution;
  RETURN new_resolution;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.merge_branch(
  source_branch UUID,
  target_branch UUID,
  merge_shake256 BYTEA,
  target_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  source_row lifeos_runtime.branch%ROWTYPE;
  target_row lifeos_runtime.branch%ROWTYPE;
  collision_count BIGINT;
  overlay_count BIGINT;
  final_generation BIGINT;
  merge_payload JSONB;
  merge_object BIGINT;
  merge_witness UUID;
  merge_event UUID;
  existing_merge lifeos_runtime.promotion%ROWTYPE;
  existing_payload JSONB;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'branch merge requires a SERIALIZABLE transaction';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    least(source_branch::text, target_branch::text) || ':' ||
    greatest(source_branch::text, target_branch::text),
    0
  ));
  PERFORM 1
  FROM lifeos_runtime.branch
  WHERE branch_id IN (source_branch, target_branch)
  ORDER BY branch_id
  FOR UPDATE;
  SELECT * INTO STRICT source_row
  FROM lifeos_runtime.branch WHERE branch_id = source_branch;
  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.branch WHERE branch_id = target_branch;

  IF source_row.tenant_id <> target_row.tenant_id
     OR source_row.parent_branch_id IS DISTINCT FROM target_branch THEN
    RAISE EXCEPTION 'only a child branch can merge into its same-tenant parent';
  END IF;
  SELECT * INTO existing_merge
  FROM lifeos_runtime.promotion
  WHERE tenant_id = source_row.tenant_id
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    IF existing_merge.action <> 'merge'
       OR existing_merge.source_branch_id IS DISTINCT FROM source_branch
       OR existing_merge.target_branch_id IS DISTINCT FROM target_branch THEN
      RAISE EXCEPTION 'branch-merge idempotency collision';
    END IF;
    SELECT convert_from(raw_bytes, 'UTF8')::jsonb INTO STRICT existing_payload
    FROM lifeos_blob.object
    WHERE id = existing_merge.event_object_id;
    RETURN existing_payload || jsonb_build_object(
      'merged', coalesce((existing_payload->>'conflict_count')::bigint, 0) = 0,
      'overlay_count',
        existing_merge.to_generation - coalesce(
          existing_merge.from_generation, existing_merge.to_generation
        ),
      'target_generation', existing_merge.to_generation,
      'merge_event_id', existing_merge.promotion_id
    );
  END IF;
  IF NOT lifeos_runtime.branch_gates_satisfied(source_branch) THEN
    RAISE EXCEPTION 'source branch gates are not satisfied';
  END IF;

  WITH source_local AS (
    SELECT source.*
    FROM lifeos_runtime.branch_overlay source
    WHERE source.branch_id = source_branch
      AND source.generation > source_row.parent_generation
  )
  SELECT count(*) INTO collision_count
  FROM source_local source
  CROSS JOIN LATERAL (
    SELECT target.*
    FROM lifeos_runtime.branch_overlay target
    WHERE target.branch_id = target_branch
      AND target.generation > source_row.parent_generation
      AND target.relation_name = source.relation_name
      AND target.logical_key_digest = source.logical_key_digest
    ORDER BY target.generation DESC, target.sequence DESC
    LIMIT 1
  ) target;

  merge_payload := jsonb_build_object(
    'source_branch_id', source_branch,
    'target_branch_id', target_branch,
    'source_generation', source_row.head_generation,
    'target_generation', target_row.head_generation,
    'conflict_count', collision_count,
    'idempotency_key', target_idempotency_key
  );
  merge_object := lifeos_runtime.store_generated_object(
    convert_to(merge_payload::text, 'UTF8'),
    CASE WHEN collision_count > 0
      THEN 'cow-merge-conflict-record'
      ELSE 'cow-merge-record'
    END
  );

  IF collision_count > 0 THEN
    merge_witness := lifeos_agent.append_branch_witness(
      target_branch, target_row.head_generation, 'merge-conflict',
      merge_object, merge_shake256
    );
    WITH source_local AS (
      SELECT source.*
      FROM lifeos_runtime.branch_overlay source
      WHERE source.branch_id = source_branch
        AND source.generation > source_row.parent_generation
    ),
    collisions AS (
      SELECT source.*, target.sequence AS target_sequence,
             target.generation AS conflicting_generation,
             target.row_object_id AS conflicting_object_id
      FROM source_local source
      CROSS JOIN LATERAL (
        SELECT target.*
        FROM lifeos_runtime.branch_overlay target
        WHERE target.branch_id = target_branch
          AND target.generation > source_row.parent_generation
          AND target.relation_name = source.relation_name
          AND target.logical_key_digest = source.logical_key_digest
        ORDER BY target.generation DESC, target.sequence DESC
        LIMIT 1
      ) target
    )
    INSERT INTO lifeos_runtime.merge_conflict (
      tenant_id, source_branch_id, target_branch_id, source_generation,
      target_generation, relation_name, logical_key, logical_key_digest,
      conflict_kind, base_digest, source_object_id, target_object_id,
      record_object_id, witness_id, idempotency_key
    )
    SELECT
      source_row.tenant_id, source_branch, target_branch,
      collisions.generation, collisions.conflicting_generation,
      collisions.relation_name, collisions.logical_key,
      collisions.logical_key_digest, 'key', collisions.base_digest,
      collisions.row_object_id, collisions.conflicting_object_id,
      merge_object, merge_witness,
      target_idempotency_key || ':' || collisions.sequence::text ||
        ':' || collisions.target_sequence::text
    FROM collisions
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

    INSERT INTO lifeos_runtime.promotion (
      tenant_id, action, source_branch_id, target_branch_id,
      from_generation, to_generation, snapshot_object_id, event_object_id,
      witness_id, idempotency_key
    ) VALUES (
      source_row.tenant_id, 'merge', source_branch, target_branch,
      target_row.head_generation, target_row.head_generation,
      merge_object, merge_object, merge_witness, target_idempotency_key
    )
    RETURNING promotion_id INTO merge_event;
    RETURN merge_payload || jsonb_build_object(
      'merged', false,
      'overlay_count', 0,
      'merge_event_id', merge_event
    );
  END IF;

  SELECT count(*) INTO overlay_count
  FROM lifeos_runtime.branch_overlay
  WHERE branch_id = source_branch
    AND generation > source_row.parent_generation;
  final_generation := target_row.head_generation + overlay_count;
  UPDATE lifeos_runtime.branch
  SET head_generation = final_generation
  WHERE branch_id = target_branch;
  merge_witness := lifeos_agent.append_branch_witness(
    target_branch, final_generation, 'merge-commit',
    merge_object, merge_shake256
  );

  INSERT INTO lifeos_runtime.branch_overlay (
    branch_id, generation, relation_name, logical_key, logical_key_digest,
    operation, base_digest, record_object_id, row_object_id, row_json,
    execution_id, witness_id
  )
  SELECT
    target_branch,
    target_row.head_generation +
      row_number() OVER (ORDER BY source.generation, source.sequence),
    source.relation_name, source.logical_key, source.logical_key_digest,
    source.operation, source.base_digest, source.record_object_id,
    source.row_object_id, source.row_json, source.execution_id, merge_witness
  FROM lifeos_runtime.branch_overlay source
  WHERE source.branch_id = source_branch
    AND source.generation > source_row.parent_generation
  ORDER BY source.generation, source.sequence;

  INSERT INTO lifeos_runtime.promotion (
    tenant_id, action, source_branch_id, target_branch_id,
    from_generation, to_generation, snapshot_object_id, event_object_id,
    witness_id, idempotency_key
  ) VALUES (
    source_row.tenant_id, 'merge', source_branch, target_branch,
    target_row.head_generation, final_generation, merge_object, merge_object,
    merge_witness, target_idempotency_key
  )
  RETURNING promotion_id INTO merge_event;
  RETURN merge_payload || jsonb_build_object(
    'merged', true,
    'overlay_count', overlay_count,
    'target_generation', final_generation,
    'merge_event_id', merge_event
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.promote_branch(
  branch_tenant UUID,
  target_pointer_name TEXT,
  target_branch UUID,
  projection_snapshot BYTEA,
  promotion_shake256 BYTEA,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
  snapshot_object BIGINT;
  event_object BIGINT;
  event_payload JSONB;
  new_witness UUID;
  new_promotion UUID;
  existing_promotion lifeos_runtime.promotion%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  SELECT * INTO existing_promotion
  FROM lifeos_runtime.promotion
  WHERE tenant_id = branch_tenant
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    SELECT
      existing_promotion.action = 'promote'
      AND existing_promotion.pointer_name = target_pointer_name
      AND existing_promotion.target_branch_id = target_branch
      AND object.raw_bytes = projection_snapshot
    INTO existing_matches
    FROM lifeos_blob.object object
    WHERE object.id = existing_promotion.snapshot_object_id;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'branch-promotion idempotency collision';
    END IF;
    RETURN existing_promotion.promotion_id;
  END IF;

  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
    AND tenant_id = branch_tenant
  FOR SHARE;
  IF NOT lifeos_runtime.branch_gates_satisfied(target_branch) THEN
    RAISE EXCEPTION 'branch promotion gates are not satisfied';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict conflict
    LEFT JOIN lifeos_runtime.merge_conflict_resolution resolution
      ON resolution.merge_conflict_id = conflict.merge_conflict_id
    WHERE conflict.source_branch_id = target_branch
      AND resolution.resolution_id IS NULL
  ) THEN
    RAISE EXCEPTION 'branch has unresolved merge conflicts';
  END IF;

  SELECT * INTO pointer_row
  FROM lifeos_runtime.branch_pointer
  WHERE tenant_id = branch_tenant
    AND pointer_name = target_pointer_name
  FOR UPDATE;
  snapshot_object := lifeos_runtime.store_generated_object(
    projection_snapshot, 'cow-promotion-snapshot'
  );
  event_payload := jsonb_build_object(
    'action', 'promote',
    'tenant_id', branch_tenant,
    'pointer_name', target_pointer_name,
    'branch_id', target_branch,
    'generation', branch_row.head_generation,
    'snapshot_object_id', snapshot_object,
    'idempotency_key', target_idempotency_key
  );
  event_object := lifeos_runtime.store_generated_object(
    convert_to(event_payload::text, 'UTF8'), 'cow-promotion-record'
  );
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, branch_row.head_generation, 'branch-promotion',
    event_object, promotion_shake256
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, pointer_name, action, previous_promotion_id,
    source_branch_id, target_branch_id, from_generation, to_generation,
    snapshot_object_id, event_object_id, witness_id, idempotency_key
  ) VALUES (
    branch_tenant, target_pointer_name, 'promote',
    pointer_row.active_promotion_id, pointer_row.branch_id, target_branch,
    pointer_row.generation, branch_row.head_generation, snapshot_object,
    event_object, new_witness, target_idempotency_key
  )
  RETURNING promotion_id INTO new_promotion;

  INSERT INTO lifeos_runtime.branch_pointer (
    tenant_id, pointer_name, branch_id, generation, snapshot_object_id,
    active_promotion_id, witness_id
  ) VALUES (
    branch_tenant, target_pointer_name, target_branch,
    branch_row.head_generation, snapshot_object, new_promotion, new_witness
  )
  ON CONFLICT (tenant_id, pointer_name) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    generation = EXCLUDED.generation,
    snapshot_object_id = EXCLUDED.snapshot_object_id,
    active_promotion_id = EXCLUDED.active_promotion_id,
    witness_id = EXCLUDED.witness_id,
    updated_at = clock_timestamp();
  RETURN new_promotion;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.rollback_branch(
  branch_tenant UUID,
  target_pointer_name TEXT,
  target_promotion UUID,
  rollback_shake256 BYTEA,
  target_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_agent
AS $function$
DECLARE
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
  target_row lifeos_runtime.promotion%ROWTYPE;
  event_payload JSONB;
  event_object BIGINT;
  new_witness UUID;
  new_promotion UUID;
  existing_promotion lifeos_runtime.promotion%ROWTYPE;
  existing_target lifeos_runtime.promotion%ROWTYPE;
BEGIN
  SELECT * INTO existing_promotion
  FROM lifeos_runtime.promotion
  WHERE tenant_id = branch_tenant
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    SELECT * INTO existing_target
    FROM lifeos_runtime.promotion
    WHERE promotion_id = target_promotion
      AND tenant_id = branch_tenant
      AND pointer_name = target_pointer_name
      AND action IN ('promote', 'rollback');
    IF existing_target.promotion_id IS NULL
       OR existing_promotion.action <> 'rollback'
       OR existing_promotion.pointer_name <> target_pointer_name
       OR existing_promotion.target_branch_id
          IS DISTINCT FROM existing_target.target_branch_id
       OR existing_promotion.to_generation
          IS DISTINCT FROM existing_target.to_generation
       OR existing_promotion.snapshot_object_id
          IS DISTINCT FROM existing_target.snapshot_object_id THEN
      RAISE EXCEPTION 'branch-rollback idempotency collision';
    END IF;
    RETURN existing_promotion.promotion_id;
  END IF;

  SELECT * INTO STRICT pointer_row
  FROM lifeos_runtime.branch_pointer
  WHERE tenant_id = branch_tenant
    AND pointer_name = target_pointer_name
  FOR UPDATE;
  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.promotion
  WHERE promotion_id = target_promotion
    AND tenant_id = branch_tenant
    AND pointer_name = target_pointer_name
    AND action IN ('promote', 'rollback');

  event_payload := jsonb_build_object(
    'action', 'rollback',
    'tenant_id', branch_tenant,
    'pointer_name', target_pointer_name,
    'target_promotion_id', target_promotion,
    'branch_id', target_row.target_branch_id,
    'generation', target_row.to_generation,
    'snapshot_object_id', target_row.snapshot_object_id,
    'idempotency_key', target_idempotency_key
  );
  event_object := lifeos_runtime.store_generated_object(
    convert_to(event_payload::text, 'UTF8'), 'cow-rollback-record'
  );
  new_witness := lifeos_agent.append_branch_witness(
    target_row.target_branch_id, target_row.to_generation,
    'branch-rollback', event_object, rollback_shake256
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, pointer_name, action, previous_promotion_id,
    source_branch_id, target_branch_id, from_generation, to_generation,
    snapshot_object_id, event_object_id, witness_id, idempotency_key
  ) VALUES (
    branch_tenant, target_pointer_name, 'rollback',
    pointer_row.active_promotion_id, pointer_row.branch_id,
    target_row.target_branch_id, pointer_row.generation,
    target_row.to_generation, target_row.snapshot_object_id,
    event_object, new_witness, target_idempotency_key
  )
  RETURNING promotion_id INTO new_promotion;

  UPDATE lifeos_runtime.branch_pointer
  SET branch_id = target_row.target_branch_id,
      generation = target_row.to_generation,
      snapshot_object_id = target_row.snapshot_object_id,
      active_promotion_id = new_promotion,
      witness_id = new_witness,
      updated_at = clock_timestamp()
  WHERE tenant_id = branch_tenant
    AND pointer_name = target_pointer_name;
  RETURN new_promotion;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.active_branch_snapshot(
  branch_tenant UUID,
  target_pointer_name TEXT
) RETURNS TABLE (
  branch_id UUID,
  generation BIGINT,
  snapshot_object_id BIGINT,
  snapshot_sha256 TEXT,
  snapshot_bytes BYTEA,
  promotion_id UUID
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, lifeos_blob, lifeos_runtime
AS $function$
  SELECT
    pointer.branch_id,
    pointer.generation,
    pointer.snapshot_object_id,
    object.sha256::text,
    object.raw_bytes,
    pointer.active_promotion_id
  FROM lifeos_runtime.branch_pointer pointer
  JOIN lifeos_blob.object object ON object.id = pointer.snapshot_object_id
  WHERE pointer.tenant_id = branch_tenant
    AND pointer.pointer_name = target_pointer_name
$function$;

CREATE OR REPLACE FUNCTION lifeos_rvf.mirror_branch_membership(
  target_branch UUID,
  parent_container UUID,
  container_bytes BYTEA,
  range_map_bytes BYTEA,
  mirror_shake256 BYTEA
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_runtime, lifeos_agent,
                  lifeos_rvf
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  existing_container lifeos_rvf.container%ROWTYPE;
  container_object BIGINT;
  range_map_object BIGINT;
  membership_payload JSONB;
  membership_sha256 BYTEA;
  new_witness UUID;
  new_container UUID;
  expected_count BIGINT;
  actual_count BIGINT;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  SELECT * INTO existing_container
  FROM lifeos_rvf.container
  WHERE branch_id = target_branch
    AND generation = branch_row.head_generation;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM lifeos_blob.object
      WHERE id = existing_container.raw_object_id
        AND raw_bytes = container_bytes
    ) THEN
      RAISE EXCEPTION 'RVF mirror idempotency collision';
    END IF;
    RETURN existing_container.container_id;
  END IF;
  IF parent_container IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lifeos_rvf.container
    WHERE container_id = parent_container
      AND tenant_id = branch_row.tenant_id
  ) THEN
    RAISE EXCEPTION 'RVF parent container is outside the branch tenant';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'relation_name', resolved.relation_name::text,
        'logical_key', resolved.logical_key,
        'generation', resolved.generation,
        'operation', resolved.operation,
        'member_object_id',
          coalesce(resolved.row_object_id, resolved.record_object_id)
      )
      ORDER BY resolved.relation_name::text, resolved.logical_key::text
    ),
    '[]'::jsonb
  ) INTO membership_payload
  FROM lifeos_runtime.resolve_branch_membership(target_branch) resolved;
  membership_sha256 := extensions.digest(
    convert_to(membership_payload::text, 'UTF8'), 'sha256'
  );
  container_object := lifeos_runtime.store_generated_object(
    container_bytes, 'rvf-cow-container'
  );
  range_map_object := lifeos_runtime.store_generated_object(
    range_map_bytes, 'rvf-cow-range-map'
  );
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, branch_row.head_generation, 'rvf-cow-membership',
    container_object, mirror_shake256
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
    member_key_digest, member_object_id, generation, tombstone, witness_id
  )
  SELECT
    branch_row.tenant_id, new_container, target_branch,
    resolved.relation_name, resolved.logical_key,
    resolved.logical_key_digest,
    coalesce(resolved.row_object_id, resolved.record_object_id),
    branch_row.head_generation, resolved.operation = 'delete', new_witness
  FROM lifeos_runtime.resolve_branch_membership(target_branch) resolved;

  IF parent_container IS NOT NULL THEN
    INSERT INTO lifeos_rvf.cow_map (
      tenant_id, child_container_id, parent_container_id, generation,
      range_map_object_id, membership_digest, witness_id
    ) VALUES (
      branch_row.tenant_id, new_container, parent_container,
      branch_row.head_generation, range_map_object, membership_sha256,
      new_witness
    );
  END IF;

  SELECT count(*) INTO expected_count
  FROM lifeos_runtime.resolve_branch_membership(target_branch);
  SELECT count(*) INTO actual_count
  FROM lifeos_rvf.membership
  WHERE container_id = new_container;
  IF expected_count <> actual_count THEN
    RAISE EXCEPTION
      'RVF branch round trip mismatch: overlays %, memberships %',
      expected_count, actual_count;
  END IF;
  INSERT INTO lifeos_rvf.branch_roundtrip_receipt (
    tenant_id, branch_id, container_id, generation, overlay_count,
    membership_count, membership_digest, verified, witness_id
  ) VALUES (
    branch_row.tenant_id, target_branch, new_container,
    branch_row.head_generation, expected_count, actual_count,
    membership_sha256, true, new_witness
  );
  RETURN new_container;
END
$function$;

CREATE OR REPLACE FUNCTION extensions.lifeos_cow_branch_capability()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  WITH required_tables(name) AS (
    VALUES
      ('lifeos_runtime.branch'),
      ('lifeos_runtime.branch_overlay'),
      ('lifeos_agent.branch_witness'),
      ('lifeos_runtime.merge_gate'),
      ('lifeos_runtime.merge_conflict'),
      ('lifeos_runtime.merge_conflict_resolution'),
      ('lifeos_runtime.promotion'),
      ('lifeos_runtime.branch_pointer'),
      ('lifeos_rvf.container'),
      ('lifeos_rvf.cow_map'),
      ('lifeos_rvf.membership'),
      ('lifeos_rvf.branch_roundtrip_receipt')
  ),
  required_functions(schema_name, function_name) AS (
    VALUES
      ('lifeos_runtime', 'create_root_branch'),
      ('lifeos_runtime', 'create_branch'),
      ('lifeos_runtime', 'append_branch_overlay'),
      ('lifeos_runtime', 'resolve_branch_overlay'),
      ('lifeos_runtime', 'resolve_branch_membership'),
      ('lifeos_runtime', 'record_merge_gate'),
      ('lifeos_runtime', 'merge_branch'),
      ('lifeos_runtime', 'promote_branch'),
      ('lifeos_runtime', 'rollback_branch'),
      ('lifeos_runtime', 'active_branch_snapshot'),
      ('lifeos_rvf', 'mirror_branch_membership')
  ),
  counts AS (
    SELECT
      (SELECT count(*) FROM required_tables
       WHERE to_regclass(name) IS NOT NULL) AS table_count,
      (SELECT count(*)
       FROM required_functions required
       WHERE EXISTS (
         SELECT 1
         FROM pg_proc procedure
         JOIN pg_namespace namespace
           ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = required.schema_name
           AND procedure.proname = required.function_name
       )) AS function_count
  )
  SELECT jsonb_build_object(
    'schema_version', 1,
    'implemented', table_count = 12 AND function_count = 11,
    'table_count', table_count,
    'required_table_count', 12,
    'function_count', function_count,
    'required_function_count', 11,
    'witness_algorithm', 'SHAKE256-256',
    'overlay_resolution', 'branch-nearest-ancestor-canonical-fallback',
    'promotion', 'gate-and-conflict-checked',
    'rollback', 'exact-content-addressed-snapshot',
    'rvf_roundtrip', true
  )
  FROM counts
$function$;

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

DO $lifeos_envctl_cow_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_envctl') THEN
    GRANT EXECUTE ON FUNCTION
      lifeos_runtime.create_root_branch(
        UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BYTEA
      ),
      lifeos_runtime.create_branch(
        UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BYTEA
      ),
      lifeos_runtime.append_branch_overlay(
        UUID, REGCLASS, JSONB, TEXT, BYTEA, BYTEA, JSONB, UUID, BYTEA
      ),
      lifeos_runtime.record_merge_gate(
        UUID, TEXT, BOOLEAN, BYTEA, BYTEA, TEXT
      ),
      lifeos_runtime.resolve_merge_conflict(UUID, BYTEA, BYTEA, TEXT),
      lifeos_runtime.merge_branch(UUID, UUID, BYTEA, TEXT),
      lifeos_runtime.promote_branch(
        UUID, TEXT, UUID, BYTEA, BYTEA, TEXT
      ),
      lifeos_runtime.rollback_branch(UUID, TEXT, UUID, BYTEA, TEXT),
      lifeos_rvf.mirror_branch_membership(
        UUID, UUID, BYTEA, BYTEA, BYTEA
      )
    TO lifeos_envctl;
  END IF;
END
$lifeos_envctl_cow_grants$;

GRANT EXECUTE ON FUNCTION extensions.lifeos_cow_branch_capability()
  TO PUBLIC;
