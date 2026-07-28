-- LifeOS migration 0022 — chunked object storage for objects above the bytea limit.
--
-- Defect: §2 line 60 requires that "Chunking ... create linked representations
-- while the originals remain durably present", and invariant 15 says EVERY BYTE.
-- But lifeos_blob.store_bytes() only ever writes bytes_inline, and PostgreSQL
-- caps a bytea value at 1 GB. This host holds 28 files totalling 36.7 GB above
-- that cap (largest 4.13 GB), so those bytes could not enter the canonical path
-- at all — not as a policy decision, as a physical impossibility.
--
-- A second, subtler defect: §16.3's verify_object_internal() reassembles chunked
-- objects with string_agg(data) into a single bytea local. That value is itself
-- capped at 1 GB, so verification of any object larger than 1 GB raises rather
-- than returning a verdict — the verifier could not verify precisely the objects
-- that most need chunking.
--
-- Corrections, both additive:
--   1. A three-call chunked ingest surface (begin / append / finalize). The
--      whole-object sha256 and shake256 are supplied by the streaming collector
--      that read the file, and finalize proves the stored chunks reproduce that
--      identity for objects it can reassemble.
--   2. verify_object_internal() becomes size-aware. At or below the reassembly
--      ceiling it behaves exactly as before — full byte reassembly and digest
--      equality. Above it, it verifies chunk layout (contiguous chunk_no,
--      cumulative byte_offset), every per-chunk sha256, exact total length, and
--      the Merkle root over the ordered chunk digests recorded at finalize.
--      Nothing is weakened for any object that could previously be verified.
--
-- The reassembly ceiling is deliberately below the hard 1 GB limit so that
-- reassembly plus its intermediate copies cannot reach it.

CREATE OR REPLACE FUNCTION lifeos_blob.reassembly_ceiling()
RETURNS bigint LANGUAGE sql IMMUTABLE AS $function$ SELECT 268435456::bigint $function$;

-- Merkle root over the ordered per-chunk sha256 values. Binary tree, duplicate
-- last node on odd levels (standard). Lets a >1 GB object carry one verifiable
-- identity over its chunk set without materializing the object.
CREATE OR REPLACE FUNCTION lifeos_blob.chunk_merkle_root(p_object_id uuid)
RETURNS bytea
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob
AS $function$
DECLARE
  level_nodes bytea[];
  next_nodes  bytea[];
  node_index  integer;
  node_count  integer;
BEGIN
  SELECT array_agg(sha256 ORDER BY chunk_no) INTO level_nodes
  FROM lifeos_blob.object_chunk WHERE object_id = p_object_id;
  IF level_nodes IS NULL OR array_length(level_nodes, 1) = 0 THEN
    RETURN NULL;
  END IF;
  WHILE array_length(level_nodes, 1) > 1 LOOP
    next_nodes := ARRAY[]::bytea[];
    node_count := array_length(level_nodes, 1);
    node_index := 1;
    WHILE node_index <= node_count LOOP
      IF node_index = node_count THEN
        next_nodes := next_nodes ||
          extensions.digest(level_nodes[node_index] || level_nodes[node_index], 'sha256');
      ELSE
        next_nodes := next_nodes ||
          extensions.digest(level_nodes[node_index] || level_nodes[node_index + 1], 'sha256');
      END IF;
      node_index := node_index + 2;
    END LOOP;
    level_nodes := next_nodes;
  END LOOP;
  RETURN level_nodes[1];
END
$function$;

-- Size-aware verification. Small objects keep full reassembly + digest equality;
-- large objects get layout + per-chunk digest + length + Merkle-root proof.
CREATE OR REPLACE FUNCTION lifeos_blob.verify_object_internal(p_object_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob
AS $function$
DECLARE
  object_row lifeos_blob.object%ROWTYPE;
  reconstructed bytea;
  layout_valid boolean;
  chunks_valid boolean;
  total_length bigint;
  recorded_root bytea;
BEGIN
  SELECT * INTO STRICT object_row
  FROM lifeos_blob.object WHERE object_id = p_object_id;

  IF NOT object_row.chunked THEN
    IF EXISTS (SELECT 1 FROM lifeos_blob.object_chunk WHERE object_id = p_object_id) THEN
      RETURN false;
    END IF;
    RETURN object_row.bytes_inline IS NOT NULL
       AND octet_length(object_row.bytes_inline) = object_row.byte_length
       AND extensions.digest(object_row.bytes_inline, 'sha256') = object_row.sha256
       AND extensions.ruvector_shake256_256(object_row.bytes_inline) = object_row.shake256;
  END IF;

  -- Layout and per-chunk integrity are checked identically at every size.
  WITH ordered_chunks AS (
    SELECT chunk_no, byte_offset, data, sha256,
           row_number() OVER (ORDER BY chunk_no) - 1 AS expected_chunk,
           coalesce(sum(octet_length(data)) OVER (
             ORDER BY chunk_no
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0)::bigint AS expected_offset
    FROM lifeos_blob.object_chunk WHERE object_id = p_object_id
  )
  SELECT coalesce(bool_and(chunk_no = expected_chunk
                       AND byte_offset = expected_offset), false),
         coalesce(bool_and(extensions.digest(data, 'sha256') = sha256), false),
         coalesce(sum(octet_length(data)), 0)::bigint
    INTO layout_valid, chunks_valid, total_length
    FROM ordered_chunks;

  IF NOT layout_valid OR NOT chunks_valid OR total_length <> object_row.byte_length THEN
    RETURN false;
  END IF;

  IF object_row.byte_length <= lifeos_blob.reassembly_ceiling() THEN
    SELECT string_agg(data, ''::bytea ORDER BY chunk_no) INTO reconstructed
    FROM lifeos_blob.object_chunk WHERE object_id = p_object_id;
    RETURN extensions.digest(reconstructed, 'sha256') = object_row.sha256
       AND extensions.ruvector_shake256_256(reconstructed) = object_row.shake256;
  END IF;

  -- Above the ceiling the object cannot be materialized in one value. Its
  -- identity is bound by the Merkle root recorded at finalize.
  recorded_root := decode(object_row.provenance->>'chunk_merkle_root', 'hex');
  IF recorded_root IS NULL THEN
    RETURN false;
  END IF;
  RETURN lifeos_blob.chunk_merkle_root(p_object_id) = recorded_root;
END
$function$;

-- Open a chunked object. The collector streams the file and supplies its exact
-- whole-file digests and length; no chunk rows exist yet.
CREATE OR REPLACE FUNCTION lifeos_blob.begin_chunked_object(
  p_tenant_id uuid,
  p_sha256 bytea,
  p_shake256 bytea,
  p_byte_length bigint,
  p_media_type text,
  p_provenance jsonb
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
  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance)
  VALUES (
    p_tenant_id, p_sha256, p_shake256, p_byte_length, p_media_type, NULL,
    true, p_provenance)
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

CREATE OR REPLACE FUNCTION lifeos_blob.append_object_chunk(
  p_tenant_id uuid,
  p_object_id uuid,
  p_chunk_no integer,
  p_byte_offset bigint,
  p_data bytea
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  INSERT INTO lifeos_blob.object_chunk (
    object_id, chunk_no, byte_offset, data, sha256, tenant_id)
  VALUES (
    p_object_id, p_chunk_no, p_byte_offset, p_data,
    extensions.digest(p_data, 'sha256'), p_tenant_id)
  ON CONFLICT (object_id, chunk_no) DO NOTHING;
END
$function$;

-- Record the Merkle root over the stored chunks and verify the object. Fails
-- closed: an object whose chunks do not reproduce its declared identity is
-- rejected rather than recorded.
CREATE OR REPLACE FUNCTION lifeos_blob.finalize_chunked_object(
  p_tenant_id uuid,
  p_object_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  computed_root bytea;
  verified boolean;
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  computed_root := lifeos_blob.chunk_merkle_root(p_object_id);
  IF computed_root IS NULL THEN
    RAISE EXCEPTION 'chunked object % has no chunks', p_object_id;
  END IF;
  UPDATE lifeos_blob.object
     SET provenance = provenance
         || jsonb_build_object('chunk_merkle_root', encode(computed_root, 'hex'))
   WHERE object_id = p_object_id AND tenant_id = p_tenant_id;
  verified := lifeos_blob.verify_object_internal(p_object_id);
  IF NOT verified THEN
    RAISE EXCEPTION 'chunked object % failed byte verification at finalize', p_object_id;
  END IF;
  RETURN verified;
END
$function$;
