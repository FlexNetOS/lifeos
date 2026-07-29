-- LifeOS migration 0061 — restore the bootstrap runtime anchor.
--
-- The guarded front door needs a tenant-owned current branch.  Recreate the
-- fixed bootstrap branch/session records when a purge removed them while the
-- surrounding schema and witness chain remained present.

DO $restore_bootstrap_runtime$
DECLARE
  bootstrap_tenant   uuid := '00000000-0000-4000-8000-000000000001';
  bootstrap_identity uuid := '00000000-0000-4000-8000-000000000002';
  bootstrap_branch   uuid := '00000000-0000-4000-8000-000000000005';
  bootstrap_session  uuid := '00000000-0000-4000-8000-000000000006';
  bootstrap_chain    uuid := '00000000-0000-4000-8000-000000000007';
  branch_bytes       bytea;
  session_bytes      bytea;
  branch_object      uuid;
  session_object     uuid;
BEGIN
  branch_bytes := convert_to(jsonb_build_object(
    'branch_id', bootstrap_branch,
    'tenant_id', bootstrap_tenant,
    'branch_kind', 'bootstrap',
    'purpose', 'bootstrap-import',
    'producer', 'bootstrap-import-session'
  )::text, 'UTF8');
  session_bytes := convert_to(jsonb_build_object(
    'session_id', bootstrap_session,
    'tenant_id', bootstrap_tenant,
    'branch_id', bootstrap_branch,
    'identity_id', bootstrap_identity,
    'producer', 'bootstrap-import-session'
  )::text, 'UTF8');

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance
  ) VALUES
    (bootstrap_tenant, extensions.digest(branch_bytes,'sha256'),
     extensions.ruvector_shake256_256(branch_bytes), octet_length(branch_bytes),
     'application/json', branch_bytes, false,
     jsonb_build_object('producer','bootstrap-import-session','record','branch')),
    (bootstrap_tenant, extensions.digest(session_bytes,'sha256'),
     extensions.ruvector_shake256_256(session_bytes), octet_length(session_bytes),
     'application/json', session_bytes, false,
     jsonb_build_object('producer','bootstrap-import-session','record','session'))
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING;

  SELECT object_id INTO STRICT branch_object
    FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(branch_bytes,'sha256')
     AND byte_length = octet_length(branch_bytes);
  SELECT object_id INTO STRICT session_object
    FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(session_bytes,'sha256')
     AND byte_length = octet_length(session_bytes);

  INSERT INTO lifeos_runtime.branch (
    branch_id, tenant_id, parent_branch_id, base_lsn, branch_kind, purpose,
    policy, raw_object_id, head_generation, created_by
  ) VALUES (
    bootstrap_branch, bootstrap_tenant, NULL, pg_current_wal_lsn(),
    'bootstrap', 'bootstrap-import',
    jsonb_build_object('scope','host-import'), branch_object, 0,
    bootstrap_identity
  ) ON CONFLICT (branch_id) DO NOTHING;

  INSERT INTO lifeos_runtime.session (
    session_id, tenant_id, branch_id, identity_id, raw_object_id,
    client_context, opened_at
  ) VALUES (
    bootstrap_session, bootstrap_tenant, bootstrap_branch, bootstrap_identity,
    session_object, jsonb_build_object('client','envctl-bootstrap'), now()
  ) ON CONFLICT (session_id) DO NOTHING;

  INSERT INTO lifeos_agent.witness_chain (
    chain_id, tenant_id, branch_id, domain, head_sequence, head_shake256
  ) VALUES (
    bootstrap_chain, bootstrap_tenant, bootstrap_branch, 'bootstrap-import', 0,
    extensions.ruvector_shake256_256(convert_to('genesis','UTF8'))
  ) ON CONFLICT (chain_id) DO NOTHING;
END
$restore_bootstrap_runtime$;
