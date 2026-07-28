-- LifeOS migration 0023 — batched host capture conversion.
--
-- 0021's ingest_host_capture() converted an entire capture label in one
-- statement. Measured against the real host (2,000,200 staged entries) that
-- design does not work: after 18 minutes it had inserted zero rows, still
-- inside its first sort, holding a single two-million-row transaction that any
-- failure would discard entirely. Three compounding causes:
--   * the sha256 digest was computed twice per row — once in DISTINCT ON and
--     again in ORDER BY — over the whole set;
--   * this database sets max_parallel_workers_per_gather = 0, so that sort is
--     single-threaded;
--   * one transaction meant no progress visibility and no resumability.
--
-- This replaces it with a bounded form that converts one staging_id range per
-- call, so the driver commits per batch, progress is observable, and a failure
-- costs one batch rather than the whole pass. The digest is computed once into
-- a materialized temp table and reused. Row semantics are unchanged: identical
-- envelope records, identical idempotency keys, so re-running is safe and the
-- already-converted probe rows are not duplicated.

CREATE OR REPLACE FUNCTION lifeos_blob.ingest_host_capture_batch(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_capture_label text,
  p_from_id bigint,
  p_to_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  host_path_rows bigint := 0;
  symlink_rows   bigint := 0;
  tree_rows      bigint := 0;
  xattr_rows     bigint := 0;
  staged_count   bigint := 0;
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;

  CREATE TEMP TABLE staged_record ON COMMIT DROP AS
  SELECT
    s.staging_id,
    s.host_path,
    s.entry_kind,
    s.xattr_names,
    jsonb_build_object(
      'host_path',       s.host_path,
      'entry_kind',      s.entry_kind,
      'unix_mode',       s.unix_mode,
      'owner_uid',       s.owner_uid,
      'owner_gid',       s.owner_gid,
      'owner_name',      s.owner_name,
      'group_name',      s.group_name,
      'byte_size',       s.byte_size,
      'hard_link_count', s.hard_link_count,
      'inode',           s.inode,
      'device_id',       s.device_id,
      'access_time',     s.access_time,
      'modify_time',     s.modify_time,
      'change_time',     s.change_time,
      'symlink_target',  s.symlink_target,
      'xattr_names',     s.xattr_names,
      'acl',             s.acl_text,
      'content_sha256',  s.content_sha256,
      'capture_label',   s.capture_label
    ) AS typed_payload,
    convert_to(
      s.host_path || E'\t' || s.entry_kind || E'\t' || s.unix_mode || E'\t' ||
      s.owner_uid || ':' || s.owner_gid || E'\t' ||
      s.owner_name || ':' || s.group_name || E'\t' ||
      s.byte_size || E'\t' || s.hard_link_count || E'\t' ||
      s.inode || E'\t' || s.device_id || E'\t' ||
      s.access_time || E'\t' || s.modify_time || E'\t' || s.change_time || E'\t' ||
      coalesce(s.symlink_target, '') || E'\t' ||
      coalesce(s.xattr_names, '') || E'\t' ||
      coalesce(s.acl_text, '') || E'\t' ||
      coalesce(s.content_sha256, '') || E'\n', 'UTF8') AS record_bytes
  FROM lifeos_blob.host_capture_staging s
  WHERE s.capture_label = p_capture_label
    AND s.staging_id >= p_from_id
    AND s.staging_id < p_to_id;

  GET DIAGNOSTICS staged_count = ROW_COUNT;
  IF staged_count = 0 THEN
    RETURN jsonb_build_object('capture_label', p_capture_label,
                              'from_id', p_from_id, 'to_id', p_to_id,
                              'staged', 0, 'host_path_rows', 0,
                              'symlink_rows', 0, 'tree_entry_rows', 0,
                              'xattr_rows', 0);
  END IF;

  -- Digest once, reuse everywhere. The previous form recomputed it per row in
  -- both DISTINCT ON and ORDER BY.
  CREATE TEMP TABLE staged_digest ON COMMIT DROP AS
  SELECT r.*, extensions.digest(r.record_bytes, 'sha256') AS record_sha
  FROM staged_record r;
  CREATE INDEX ON staged_digest (record_sha);

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance)
  SELECT DISTINCT ON (d.record_sha)
    p_tenant_id, d.record_sha,
    extensions.ruvector_shake256_256(d.record_bytes),
    octet_length(d.record_bytes),
    'application/vnd.lifeos.host-capture-record',
    d.record_bytes, false,
    jsonb_build_object('producer', 'host-filesystem-capture',
                       'capture_label', p_capture_label)
  FROM staged_digest d
  ORDER BY d.record_sha, d.staging_id
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING;

  CREATE TEMP TABLE staged_linked ON COMMIT DROP AS
  SELECT d.*, o.object_id AS raw_object_id
  FROM staged_digest d
  JOIN lifeos_blob.object o
    ON o.tenant_id = p_tenant_id
   AND o.sha256 = d.record_sha
   AND o.byte_length = octet_length(d.record_bytes);

  INSERT INTO lifeos_blob.host_path (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time, observed_at)
  SELECT p_tenant_id, p_branch_id, 'host-path', l.raw_object_id, l.typed_payload,
         '\x00'::bytea, 'host-path:' || p_capture_label || ':' || l.host_path,
         tstzrange(statement_timestamp(), NULL, '[)'), now()
  FROM staged_linked l
  WHERE l.entry_kind IN ('file', 'directory')
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS host_path_rows = ROW_COUNT;

  INSERT INTO lifeos_blob.symlink (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time, observed_at)
  SELECT p_tenant_id, p_branch_id, 'symlink', l.raw_object_id, l.typed_payload,
         '\x00'::bytea, 'symlink:' || p_capture_label || ':' || l.host_path,
         tstzrange(statement_timestamp(), NULL, '[)'), now()
  FROM staged_linked l
  WHERE l.entry_kind = 'symlink'
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS symlink_rows = ROW_COUNT;

  INSERT INTO lifeos_blob.tree_entry (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time, observed_at)
  SELECT p_tenant_id, p_branch_id, 'tree-entry', l.raw_object_id,
         l.typed_payload || jsonb_build_object(
           'parent_path', regexp_replace(l.host_path, '/[^/]+$', ''),
           'entry_name',  regexp_replace(l.host_path, '^.*/', '')),
         '\x00'::bytea, 'tree-entry:' || p_capture_label || ':' || l.host_path,
         tstzrange(statement_timestamp(), NULL, '[)'), now()
  FROM staged_linked l
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS tree_rows = ROW_COUNT;

  INSERT INTO lifeos_blob.xattr (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time, observed_at)
  SELECT p_tenant_id, p_branch_id, 'xattr', l.raw_object_id,
         l.typed_payload || jsonb_build_object('xattr_name', attribute_name),
         '\x00'::bytea,
         'xattr:' || p_capture_label || ':' || l.host_path || ':' || attribute_name,
         tstzrange(statement_timestamp(), NULL, '[)'), now()
  FROM staged_linked l,
       LATERAL unnest(string_to_array(l.xattr_names, ',')) AS attribute_name
  WHERE l.xattr_names IS NOT NULL AND l.xattr_names <> ''
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS xattr_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'capture_label', p_capture_label,
    'from_id', p_from_id, 'to_id', p_to_id,
    'staged', staged_count,
    'host_path_rows', host_path_rows,
    'symlink_rows',   symlink_rows,
    'tree_entry_rows', tree_rows,
    'xattr_rows',     xattr_rows);
END
$function$;
