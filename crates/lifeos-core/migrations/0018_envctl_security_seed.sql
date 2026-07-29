-- LifeOS migration 0018 — §5 envctl security seed: the authority chain that makes
-- the canonical ingress path executable.
--
-- Blueprint §5 (line 628) and invariant 7 make envctl the only authoritative
-- PostgreSQL/RuVector ingress committer, and §16.3's
-- lifeos_security.bootstrap_envctl_context() enforces that by requiring, before
-- any byte may be committed:
--   * an identity row whose subject_key equals the connecting session_user,
--   * a non-revoked, unexpired grant carrying the 'bind-session' action scope
--     with task_id and lease_id NULL, and
--   * binding bytes that encode exactly that tenant/identity/grant plus
--     purpose 'envctl-session-binding'.
-- None of those rows existed, so the entire §16 commit surface was unreachable:
-- store_bytes() raises 'tenant context is not bound' without a bound tenant.
--
-- This seeds the bootstrap authority chain (policy -> identity -> grant) and its
-- raw provenance objects. Every row carries its own raw bytes in
-- lifeos_blob.object per hard rule 12 (digests supplement bytes, never replace
-- them). Idempotent: fixed bootstrap UUIDs plus ON CONFLICT DO NOTHING.
--
-- The seeded grant is scoped to 'bind-session' only. It confers no data
-- authority by itself; it is the hinge that lets envctl bind a tenant context,
-- after which the §16.3 SECURITY DEFINER routines apply their own checks.

DO $envctl_security_seed$
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
  producer_marker    text := 'envctl-bootstrap-seed';
BEGIN
  policy_bytes := convert_to(jsonb_build_object(
    'policy_key', 'envctl-bootstrap',
    'tenant_id', bootstrap_tenant,
    'purpose', 'envctl-session-binding',
    'producer', producer_marker
  )::text, 'UTF8');
  identity_bytes := convert_to(jsonb_build_object(
    'identity_id', bootstrap_identity,
    'tenant_id', bootstrap_tenant,
    'subject_kind', 'service',
    'subject_key', subject,
    'producer', producer_marker
  )::text, 'UTF8');
  grant_bytes := convert_to(jsonb_build_object(
    'grant_id', bootstrap_grant,
    'tenant_id', bootstrap_tenant,
    'identity_id', bootstrap_identity,
    'action_scope', ARRAY['bind-session'],
    'producer', producer_marker
  )::text, 'UTF8');

  -- Raw provenance objects first: every typed row references its source bytes.
  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance)
  VALUES
    (bootstrap_tenant, extensions.digest(policy_bytes, 'sha256'),
     extensions.ruvector_shake256_256(policy_bytes), octet_length(policy_bytes),
     'application/json', policy_bytes, false,
     jsonb_build_object('producer', producer_marker, 'record', 'policy')),
    (bootstrap_tenant, extensions.digest(identity_bytes, 'sha256'),
     extensions.ruvector_shake256_256(identity_bytes), octet_length(identity_bytes),
     'application/json', identity_bytes, false,
     jsonb_build_object('producer', producer_marker, 'record', 'identity')),
    (bootstrap_tenant, extensions.digest(grant_bytes, 'sha256'),
     extensions.ruvector_shake256_256(grant_bytes), octet_length(grant_bytes),
     'application/json', grant_bytes, false,
     jsonb_build_object('producer', producer_marker, 'record', 'grant'))
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING;

  SELECT object_id INTO STRICT policy_object FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(policy_bytes, 'sha256')
     AND byte_length = octet_length(policy_bytes);
  SELECT object_id INTO STRICT identity_object FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(identity_bytes, 'sha256')
     AND byte_length = octet_length(identity_bytes);
  SELECT object_id INTO STRICT grant_object FROM lifeos_blob.object
   WHERE tenant_id = bootstrap_tenant
     AND sha256 = extensions.digest(grant_bytes, 'sha256')
     AND byte_length = octet_length(grant_bytes);

  INSERT INTO lifeos_security.policy (
    policy_id, tenant_id, policy_key, policy_revision, policy_document,
    raw_object_id, policy_digest, effective_from)
  VALUES (
    bootstrap_policy, bootstrap_tenant, 'envctl-bootstrap', 1,
    convert_from(policy_bytes, 'UTF8')::jsonb, policy_object,
    extensions.digest(policy_bytes, 'sha256'), now())
  ON CONFLICT (policy_id) DO NOTHING;

  INSERT INTO lifeos_security.identity (
    identity_id, tenant_id, subject_kind, subject_key, attributes,
    raw_object_id, active_from)
  VALUES (
    bootstrap_identity, bootstrap_tenant, 'service', subject,
    jsonb_build_object('role', 'envctl-bootstrap-committer'),
    identity_object, now())
  ON CONFLICT (identity_id) DO UPDATE
    SET subject_key = EXCLUDED.subject_key;

  INSERT INTO lifeos_security."grant" (
    grant_id, tenant_id, policy_id, identity_id, task_id, lease_id,
    resource_scope, action_scope, purpose, nonce, epoch, raw_object_id,
    issued_at, expires_at)
  VALUES (
    bootstrap_grant, bootstrap_tenant, bootstrap_policy, bootstrap_identity,
    NULL, NULL,
    jsonb_build_object('scope', 'bootstrap-import'),
    ARRAY['bind-session'], 'envctl-session-binding',
    extensions.digest(grant_bytes, 'sha256'), 1, grant_object,
    now(), now() + interval '100 years')
  ON CONFLICT (grant_id) DO UPDATE
    SET expires_at = EXCLUDED.expires_at,
        revoked_at = NULL;
END
$envctl_security_seed$;
