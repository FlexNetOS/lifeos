-- LifeOS migration 0060 — restore the idempotent bootstrap authority chain.
--
-- The bootstrap branch and its migration history can survive independently of
-- the seeded identity/grant rows.  Rehydrate the byte-backed policy, identity,
-- and bind-session grant so the guarded envctl front door is executable again.

DO $restore_bootstrap_authority$
DECLARE
  bootstrap_tenant   uuid := '00000000-0000-4000-8000-000000000001';
  bootstrap_identity uuid := '00000000-0000-4000-8000-000000000002';
  bootstrap_grant    uuid := '00000000-0000-4000-8000-000000000003';
  bootstrap_policy   uuid := '00000000-0000-4000-8000-000000000004';
  subject            text := session_user;
  policy_bytes       bytea;
  identity_bytes     bytea;
  grant_bytes        bytea;
  policy_object      uuid;
  identity_object    uuid;
  grant_object       uuid;
BEGIN
  policy_bytes := convert_to(jsonb_build_object(
    'policy_key', 'envctl-bootstrap',
    'tenant_id', bootstrap_tenant,
    'purpose', 'envctl-session-binding',
    'producer', 'envctl-bootstrap-repair'
  )::text, 'UTF8');
  identity_bytes := convert_to(jsonb_build_object(
    'identity_id', bootstrap_identity,
    'tenant_id', bootstrap_tenant,
    'subject_kind', 'service',
    'subject_key', subject,
    'producer', 'envctl-bootstrap-repair'
  )::text, 'UTF8');
  grant_bytes := convert_to(jsonb_build_object(
    'grant_id', bootstrap_grant,
    'tenant_id', bootstrap_tenant,
    'identity_id', bootstrap_identity,
    'action_scope', ARRAY['bind-session','ingest'],
    'producer', 'envctl-bootstrap-repair'
  )::text, 'UTF8');

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance
  ) VALUES
    (bootstrap_tenant, extensions.digest(policy_bytes, 'sha256'),
     extensions.ruvector_shake256_256(policy_bytes), octet_length(policy_bytes),
     'application/json', policy_bytes, false,
     jsonb_build_object('producer','envctl-bootstrap-repair','record','policy')),
    (bootstrap_tenant, extensions.digest(identity_bytes, 'sha256'),
     extensions.ruvector_shake256_256(identity_bytes), octet_length(identity_bytes),
     'application/json', identity_bytes, false,
     jsonb_build_object('producer','envctl-bootstrap-repair','record','identity')),
    (bootstrap_tenant, extensions.digest(grant_bytes, 'sha256'),
     extensions.ruvector_shake256_256(grant_bytes), octet_length(grant_bytes),
     'application/json', grant_bytes, false,
     jsonb_build_object('producer','envctl-bootstrap-repair','record','grant'))
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING;

  SELECT object_id INTO STRICT policy_object
    FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(policy_bytes, 'sha256')
     AND byte_length = octet_length(policy_bytes);
  SELECT object_id INTO STRICT identity_object
    FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(identity_bytes, 'sha256')
     AND byte_length = octet_length(identity_bytes);
  SELECT object_id INTO STRICT grant_object
    FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(grant_bytes, 'sha256')
     AND byte_length = octet_length(grant_bytes);

  INSERT INTO lifeos_security.policy (
    policy_id, tenant_id, policy_key, policy_revision, policy_document,
    raw_object_id, policy_digest, effective_from
  ) VALUES (
    bootstrap_policy, bootstrap_tenant, 'envctl-bootstrap', 1,
    convert_from(policy_bytes, 'UTF8')::jsonb, policy_object,
    extensions.digest(policy_bytes, 'sha256'), now()
  ) ON CONFLICT (policy_id) DO UPDATE
    SET raw_object_id = EXCLUDED.raw_object_id,
        policy_document = EXCLUDED.policy_document,
        policy_digest = EXCLUDED.policy_digest;

  INSERT INTO lifeos_security.identity (
    identity_id, tenant_id, subject_kind, subject_key, attributes,
    raw_object_id, active_from
  ) VALUES (
    bootstrap_identity, bootstrap_tenant, 'service', subject,
    jsonb_build_object('role', 'envctl-bootstrap-committer'),
    identity_object, now()
  ) ON CONFLICT (identity_id) DO UPDATE
    SET subject_key = EXCLUDED.subject_key,
        raw_object_id = EXCLUDED.raw_object_id,
        active_until = NULL;

  INSERT INTO lifeos_security."grant" (
    grant_id, tenant_id, policy_id, identity_id, task_id, lease_id,
    resource_scope, action_scope, purpose, nonce, epoch, raw_object_id,
    issued_at, expires_at
  ) VALUES (
    bootstrap_grant, bootstrap_tenant, bootstrap_policy, bootstrap_identity,
    NULL, NULL, jsonb_build_object('scope', 'bootstrap-import'),
    ARRAY['bind-session','ingest'], 'envctl-session-binding',
    extensions.digest(grant_bytes, 'sha256'), 1, grant_object,
    now(), now() + interval '100 years'
  ) ON CONFLICT (grant_id) DO UPDATE
    SET policy_id = EXCLUDED.policy_id,
        identity_id = EXCLUDED.identity_id,
        action_scope = EXCLUDED.action_scope,
        raw_object_id = EXCLUDED.raw_object_id,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL;
END
$restore_bootstrap_authority$;
