-- LifeOS migration 0024 — chunked objects respect the append-only law.
--
-- Defect in 0022: finalize_chunked_object() recorded the chunk Merkle root by
-- UPDATE-ing lifeos_blob.object.provenance. §16 installs prevent_object_rewrite
-- on that table, so the update is rejected with "canonical object rows are
-- append-only and never deleted" and no object above the reassembly ceiling
-- could ever be finalized. The rule is correct and the code was wrong: a
-- canonical object's row must be complete at insert.
--
-- Correction: the streaming collector already computes each chunk's digest as
-- it reads, so it can declare the Merkle root up front. begin_chunked_object()
-- now takes it and writes it into provenance at insert time; finalize only
-- recomputes the root over the stored chunks and compares. That is strictly
-- stronger than the previous shape — the identity is declared before the bytes
-- land and then proven against them, instead of being derived from whatever
-- happened to be stored.

DROP FUNCTION IF EXISTS lifeos_blob.begin_chunked_object(uuid, bytea, bytea, bigint, text, jsonb);

CREATE OR REPLACE FUNCTION lifeos_blob.begin_chunked_object(
  p_tenant_id uuid,
  p_sha256 bytea,
  p_shake256 bytea,
  p_byte_length bigint,
  p_media_type text,
  p_provenance jsonb,
  p_chunk_merkle_root bytea
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  new_object uuid;
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_chunk_merkle_root IS NULL THEN
    RAISE EXCEPTION 'chunked objects must declare their chunk Merkle root';
  END IF;
  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance)
  VALUES (
    p_tenant_id, p_sha256, p_shake256, p_byte_length, p_media_type, NULL, true,
    p_provenance
      || jsonb_build_object('chunk_merkle_root', encode(p_chunk_merkle_root, 'hex')))
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO new_object;
  IF new_object IS NULL THEN
    SELECT object_id INTO STRICT new_object FROM lifeos_blob.object
    WHERE tenant_id = p_tenant_id AND sha256 = p_sha256
      AND byte_length = p_byte_length;
  END IF;
  RETURN new_object;
END
$function$;

-- Finalize verifies only; it never mutates the canonical row.
CREATE OR REPLACE FUNCTION lifeos_blob.finalize_chunked_object(
  p_tenant_id uuid,
  p_object_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  declared_root bytea;
  computed_root bytea;
  verified boolean;
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  SELECT decode(provenance->>'chunk_merkle_root', 'hex') INTO declared_root
  FROM lifeos_blob.object
  WHERE object_id = p_object_id AND tenant_id = p_tenant_id;
  IF declared_root IS NULL THEN
    RAISE EXCEPTION 'object % declares no chunk Merkle root', p_object_id;
  END IF;
  computed_root := lifeos_blob.chunk_merkle_root(p_object_id);
  IF computed_root IS NULL THEN
    RAISE EXCEPTION 'chunked object % has no chunks', p_object_id;
  END IF;
  IF computed_root IS DISTINCT FROM declared_root THEN
    RAISE EXCEPTION 'chunked object % chunk set does not reproduce its declared Merkle root',
      p_object_id;
  END IF;
  verified := lifeos_blob.verify_object_internal(p_object_id);
  IF NOT verified THEN
    RAISE EXCEPTION 'chunked object % failed byte verification at finalize', p_object_id;
  END IF;
  RETURN verified;
END
$function$;
