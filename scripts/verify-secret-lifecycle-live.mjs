import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const socket = process.env.LIFEOS_PG_SOCKET ?? "/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const database = process.env.LIFEOS_SECRET_DATABASE ?? "lifeos";
const sql = String.raw`BEGIN;
DO $$
DECLARE
  tenant uuid := '00000000-0000-4000-8000-000000000001';
  identity_id uuid := '00000000-0000-4000-8000-000000000002';
  policy_id uuid := '00000000-0000-4000-8000-000000000004';
  bootstrap_grant uuid := '00000000-0000-4000-8000-000000000003';
  bootstrap_raw uuid;
  session_grant uuid := gen_random_uuid();
  seed_id uuid;
  cipher_id uuid;
  secret_id uuid;
  mint_object uuid;
  version_id uuid;
  rotation_cipher uuid;
  rotation_object uuid;
  rotated_id uuid;
  task_id uuid := gen_random_uuid();
  lease_id uuid := gen_random_uuid();
  task_payload uuid;
  lease_raw uuid;
  relay_grant uuid := gen_random_uuid();
  bind_object uuid;
  relay_object uuid;
  secret_lease_id uuid;
  revoke_object uuid;
  revocation_id uuid;
BEGIN
  SELECT raw_object_id INTO STRICT bootstrap_raw
  FROM lifeos_security."grant" WHERE grant_id = bootstrap_grant;

  INSERT INTO lifeos_security."grant"(
    grant_id, tenant_id, policy_id, identity_id, resource_scope,
    action_scope, purpose, nonce, epoch, raw_object_id, expires_at
  ) VALUES (
    session_grant, tenant, policy_id, identity_id, '{}'::jsonb,
    ARRAY['bind-session', 'mint-secret', 'revoke-secret'],
    'envctl-session-binding', decode('aa', 'hex'), 1,
    bootstrap_raw, clock_timestamp() + interval '1 hour'
  );

  PERFORM lifeos_security.bootstrap_envctl_context(
    tenant, identity_id, session_grant,
    convert_to(jsonb_build_object(
      'tenant_id', tenant, 'identity_id', identity_id,
      'grant_id', session_grant, 'purpose', 'envctl-session-binding'
    )::text, 'UTF8')
  );

  seed_id := lifeos_security.register_seed_vault_root(
    decode(repeat('ab', 32), 'hex'), 'os-keyring', '{}'::jsonb
  );
  cipher_id := lifeos_blob.store_bytes(
    tenant, decode('00112233445566778899aabbccddeeff', 'hex'),
    'application/octet-stream', '{}'::jsonb, 'secret-ciphertext', NULL
  );
  secret_id := lifeos_security.register_secret_object(
    'live-proof-secret', jsonb_build_object('surface', 'test'),
    ARRAY['test', 'relay'], cipher_id
  );
  UPDATE lifeos_security."grant"
  SET resource_scope = jsonb_build_object('secret_object_id', secret_id)
  WHERE grant_id = session_grant;

  mint_object := lifeos_blob.store_generated_object(tenant, '{}'::jsonb, '{}'::jsonb);
  version_id := lifeos_security.mint_secret(
    secret_id, cipher_id, 'test-key', 'AES-256-GCM',
    decode('00112233445566778899aabbccddeeff', 'hex'), mint_object
  );
  rotation_cipher := lifeos_blob.store_bytes(
    tenant, decode('ffeeddccbbaa99887766554433221100', 'hex'),
    'application/octet-stream', '{}'::jsonb, 'secret-ciphertext', NULL
  );
  rotation_object := lifeos_blob.store_generated_object(tenant, '{}'::jsonb, '{}'::jsonb);
  rotated_id := lifeos_security.rotate_secret(
    secret_id, rotation_cipher, 'test-key', 'AES-256-GCM',
    decode('ffeeddccbbaa99887766554433221100', 'hex'), rotation_object
  );

  task_payload := lifeos_blob.store_generated_object(tenant, '{}'::jsonb, '{}'::jsonb);
  INSERT INTO lifeos_runtime.task(
    task_id, tenant_id, branch_id, task_kind, payload_object_id, idempotency_key
  ) VALUES (
    task_id, tenant, '00000000-0000-4000-8000-000000000005',
    'secret-live-proof', task_payload, 'secret-live-proof-' || task_id
  );
  lease_raw := lifeos_blob.store_generated_object(tenant, '{}'::jsonb, '{}'::jsonb);
  INSERT INTO lifeos_runtime.lease(
    lease_id, tenant_id, task_id, holder_identity_id,
    capability_token_hash, raw_object_id, expires_at
  ) VALUES (
    lease_id, tenant, task_id, identity_id, decode(repeat('cd', 32), 'hex'),
    lease_raw, clock_timestamp() + interval '1 hour'
  );
  bind_object := lifeos_blob.store_generated_object(tenant, '{}'::jsonb, '{}'::jsonb);
  INSERT INTO lifeos_security."grant"(
    grant_id, tenant_id, policy_id, identity_id, task_id, lease_id,
    resource_scope, action_scope, purpose, nonce, epoch, raw_object_id, issued_at, expires_at
  ) VALUES (
    relay_grant, tenant, policy_id, identity_id, task_id, lease_id,
    jsonb_build_object('secret_object_id', secret_id),
    ARRAY['bind-runtime', 'relay', 'mint-secret', 'revoke-secret'],
    'secret-use', decode('bb', 'hex'), 1,
    lifeos_blob.store_generated_object(tenant, '{}'::jsonb, '{}'::jsonb),
    clock_timestamp() - interval '1 second',
    clock_timestamp() + interval '1 hour'
  );
  PERFORM lifeos_security.bind_runtime_context(
    tenant, identity_id, relay_grant, lease_id, bind_object
  );
  PERFORM lifeos_security.authorize_secret(
    identity_id, task_id, lease_id, secret_id, 'secret-use'
  );
  relay_object := lifeos_blob.store_generated_object(tenant, '{}'::jsonb, '{}'::jsonb);
  secret_lease_id := lifeos_security.relay_secret(
    rotated_id, relay_grant, lease_id, identity_id, 'secret-use',
    decode('1234', 'hex'), relay_object
  );
  revoke_object := lifeos_blob.store_generated_object(
    tenant,
    jsonb_build_object('secret_object_id', secret_id, 'reason', 'live proof'),
    jsonb_build_object('producer', 'lifeos-secret-revocation')
  );
  IF NOT lifeos_blob.verify_object(revoke_object) THEN
    RAISE EXCEPTION 'revocation object failed preflight verification';
  END IF;
  revocation_id := lifeos_security.revoke_secret(secret_id, 'live proof', revoke_object);

  IF seed_id IS NULL OR version_id IS NULL OR rotated_id IS NULL
     OR secret_lease_id IS NULL OR revocation_id IS NULL THEN
    RAISE EXCEPTION 'secret lifecycle returned a null identifier';
  END IF;
  RAISE NOTICE 'SECRET_LIFECYCLE_OK';
END $$;
SELECT 'SECRET_LIFECYCLE_OK';
ROLLBACK;`;

const output = execFileSync(rtk, [
  "proxy", "psql", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
  "-h", socket, "-p", "5432", "-d", database, "-Atc", sql,
], { cwd: root, encoding: "utf8" });
if (!output.includes("SECRET_LIFECYCLE_OK")) {
  throw new Error("secret lifecycle transaction did not emit its success marker");
}

const receipt = {
  schema_version: "lifeos.evidence.secret-lifecycle-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  authority_invariants: [8, 10, 12, 14, 15, 18],
  database: { name: database, socket, transaction: "rolled back after successful lifecycle" },
  stages: [
    "Seed Vault root registration",
    "ciphertext-only Secret Engine registration",
    "database-authorized Secret Mint",
    "database-authorized Secret rotation",
    "Secret Broker authorization with identity/task/lease/purpose",
    "Secret Relay lease creation",
    "revocation of grants and relays",
  ],
  plaintext_exposed: false,
  output_sha256: createHash("sha256").update(output).digest("hex"),
};
const receiptPath = join(root, "evidence/secrets/live-lifecycle-receipt.json");
mkdirSync(join(root, "evidence/secrets"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, status: "ok", stages: receipt.stages.length }, null, 2));
