-- LifeOS migration 0040 — complete the SHAKE256 correction started in 0017.
--
-- Defect in 0017 (mine): it rewrote pgcrypto SHAKE256 calls onto RuVector's
-- native implementation using a sed pattern that only matched a SINGLE-LINE
-- call, extensions.digest(<no-comma expr>, 'shake256'). That converted 26 sites
-- and silently missed every multi-line call. One survived —
-- lifeos_agent.append_witness, whose digest spans four lines and concatenates
-- several values before the algorithm argument.
--
-- Consequence: the witness chain, which operational invariant 12 rests on,
-- still raised "EVP_MD_CTX_size() failed" on every append. Found by EXERCISING
-- append_witness, not by re-reading the catalog — the earlier verification query
-- searched for the single-line shape and reported clean.
--
-- Body below is the live catalog definition with exactly one substitution
-- applied, generated mechanically rather than retyped: a hand-written copy of a
-- 100-line SECURITY DEFINER routine risks silently altering semantics (a first
-- attempt did exactly that, mis-transcribing the source_range CASE).

CREATE OR REPLACE FUNCTION lifeos_agent.append_witness(p_chain_id uuid, p_canonical_record jsonb, p_signature bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_agent', 'lifeos_security'
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
  next_digest := extensions.ruvector_shake256_256(
    convert_to('lifeos-witness-v1', 'UTF8') || chain_row.head_shake256 ||
    object_row.shake256 || lifeos_blob.canonical_jsonb_bytes(
      p_canonical_record - 'signature_verification_object_id')
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
$function$

;
