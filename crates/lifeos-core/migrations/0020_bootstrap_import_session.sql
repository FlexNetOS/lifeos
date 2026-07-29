-- LifeOS migration 0020 — §1.1 bootstrap import sessions.
--
-- Blueprint §1.1 (line 37): "The ordered bootstrap is recorded as database
-- import sessions from its first byte." lifeos_blob.import_session existed but
-- was never written, and nothing could write it: §16.3's canonical ingress
-- lifeos_runtime.ingest_event() additionally requires
--   * a grant carrying 'ingest' in action_scope (0018 seeded 'bind-session' only),
--   * an lifeos_runtime.session row, a lifeos_runtime.branch row, and
--   * a lifeos_agent.witness_chain to append the ingress witness to,
-- none of which existed. The bootstrap therefore had no recordable identity.
--
-- This migration seeds that authority chain and adds the two functions §1.1
-- needs: open an import session, and close it with its completion summary.
-- Raw bytes back every seeded row (hard rule 12). Idempotent throughout.

DO $bootstrap_import_authority$
DECLARE
  bootstrap_tenant   uuid := '00000000-0000-4000-8000-000000000001';
  bootstrap_identity uuid := '00000000-0000-4000-8000-000000000002';
  bootstrap_grant    uuid := '00000000-0000-4000-8000-000000000003';
  bootstrap_branch   uuid := '00000000-0000-4000-8000-000000000005';
  bootstrap_session  uuid := '00000000-0000-4000-8000-000000000006';
  bootstrap_chain    uuid := '00000000-0000-4000-8000-000000000007';
  branch_bytes   bytea;
  session_bytes  bytea;
  branch_object  uuid;
  session_object uuid;
BEGIN
  -- §16.3 ingest_event requires 'ingest'; bootstrap_envctl_context requires
  -- 'bind-session'. The bootstrap committer legitimately needs both.
  UPDATE lifeos_security."grant"
     SET action_scope = ARRAY['bind-session','ingest']
   WHERE grant_id = bootstrap_grant
     AND NOT ('ingest' = ANY (action_scope));

  branch_bytes := convert_to(jsonb_build_object(
    'branch_id', bootstrap_branch, 'tenant_id', bootstrap_tenant,
    'branch_kind', 'bootstrap', 'purpose', 'bootstrap-import',
    'producer', 'bootstrap-import-session')::text, 'UTF8');
  session_bytes := convert_to(jsonb_build_object(
    'session_id', bootstrap_session, 'tenant_id', bootstrap_tenant,
    'branch_id', bootstrap_branch, 'identity_id', bootstrap_identity,
    'producer', 'bootstrap-import-session')::text, 'UTF8');

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance)
  VALUES
    (bootstrap_tenant, extensions.digest(branch_bytes,'sha256'),
     extensions.ruvector_shake256_256(branch_bytes), octet_length(branch_bytes),
     'application/json', branch_bytes, false,
     jsonb_build_object('producer','bootstrap-import-session','record','branch')),
    (bootstrap_tenant, extensions.digest(session_bytes,'sha256'),
     extensions.ruvector_shake256_256(session_bytes), octet_length(session_bytes),
     'application/json', session_bytes, false,
     jsonb_build_object('producer','bootstrap-import-session','record','session'))
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING;

  SELECT object_id INTO STRICT branch_object FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(branch_bytes,'sha256')
     AND byte_length = octet_length(branch_bytes);
  SELECT object_id INTO STRICT session_object FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(session_bytes,'sha256')
     AND byte_length = octet_length(session_bytes);

  INSERT INTO lifeos_runtime.branch (
    branch_id, tenant_id, parent_branch_id, base_lsn, branch_kind, purpose,
    policy, raw_object_id, head_generation, created_by)
  VALUES (
    bootstrap_branch, bootstrap_tenant, NULL, pg_current_wal_lsn(),
    'bootstrap', 'bootstrap-import',
    jsonb_build_object('scope','host-import'), branch_object, 0,
    bootstrap_identity)
  ON CONFLICT (branch_id) DO NOTHING;

  INSERT INTO lifeos_runtime.session (
    session_id, tenant_id, branch_id, identity_id, raw_object_id,
    client_context, opened_at)
  VALUES (
    bootstrap_session, bootstrap_tenant, bootstrap_branch, bootstrap_identity,
    session_object, jsonb_build_object('client','envctl-bootstrap'), now())
  ON CONFLICT (session_id) DO NOTHING;

  INSERT INTO lifeos_agent.witness_chain (
    chain_id, tenant_id, branch_id, domain, head_sequence, head_shake256)
  VALUES (
    bootstrap_chain, bootstrap_tenant, bootstrap_branch, 'bootstrap-import', 0,
    extensions.ruvector_shake256_256(convert_to('genesis','UTF8')))
  ON CONFLICT (chain_id) DO NOTHING;
END
$bootstrap_import_authority$;

-- §1.1: open an import session. Returns its import_session_id. The descriptor
-- bytes are stored as a canonical object first, so the session record itself is
-- byte-backed like every other record.
CREATE OR REPLACE FUNCTION lifeos_blob.open_import_session(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_label text,
  p_scope jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  descriptor_bytes bytea;
  descriptor_object uuid;
  new_session uuid;
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  descriptor_bytes := convert_to(jsonb_build_object(
    'label', p_label, 'scope', p_scope, 'phase', 'bootstrap',
    'opened_at', now())::text, 'UTF8');
  descriptor_object := lifeos_blob.store_bytes(
    p_tenant_id, descriptor_bytes, 'application/json',
    jsonb_build_object('producer','bootstrap-import-session','label',p_label),
    'import-session-open');
  INSERT INTO lifeos_blob.import_session (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time, observed_at)
  VALUES (
    p_tenant_id, p_branch_id, 'import-session-open',
    descriptor_object,
    jsonb_build_object('label', p_label, 'scope', p_scope, 'state', 'open'),
    extensions.digest(descriptor_bytes, 'sha256'),
    'import-session:' || p_label,
    tstzrange(statement_timestamp(), NULL, '[)'), now())
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING import_session_id INTO new_session;
  IF new_session IS NULL THEN
    SELECT import_session_id INTO STRICT new_session
    FROM lifeos_blob.import_session
    WHERE tenant_id = p_tenant_id
      AND idempotency_key = 'import-session:' || p_label;
  END IF;
  RETURN new_session;
END
$function$;

-- §1.1: close an import session with its completion summary. The open record is
-- retained; closure appends its own byte-backed record (append-only history).
CREATE OR REPLACE FUNCTION lifeos_blob.close_import_session(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_label text,
  p_summary jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  summary_bytes bytea;
  summary_object uuid;
  closed_session uuid;
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  summary_bytes := convert_to(jsonb_build_object(
    'label', p_label, 'summary', p_summary, 'closed_at', now())::text, 'UTF8');
  summary_object := lifeos_blob.store_bytes(
    p_tenant_id, summary_bytes, 'application/json',
    jsonb_build_object('producer','bootstrap-import-session','label',p_label),
    'import-session-close');
  INSERT INTO lifeos_blob.import_session (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time, observed_at)
  VALUES (
    p_tenant_id, p_branch_id, 'import-session-close',
    summary_object,
    jsonb_build_object('label', p_label, 'summary', p_summary, 'state', 'closed'),
    extensions.digest(summary_bytes, 'sha256'),
    'import-session-close:' || p_label,
    tstzrange(statement_timestamp(), NULL, '[)'), now())
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING import_session_id INTO closed_session;
  IF closed_session IS NULL THEN
    SELECT import_session_id INTO STRICT closed_session
    FROM lifeos_blob.import_session
    WHERE tenant_id = p_tenant_id
      AND idempotency_key = 'import-session-close:' || p_label;
  END IF;
  RETURN closed_session;
END
$function$;
