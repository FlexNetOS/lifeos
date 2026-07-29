-- LifeOS migration 0021 — §2 host filesystem attribute capture.
--
-- Blueprint §2 line 51 requires "every ... file, directory, symlink, hard link,
-- mode, owner, ACL, extended attribute, object, and blob", and §1.1 line 39
-- requires that the bootstrap retain "ownership, timestamps, ... and
-- provenance". None of it was captured: the CodeDB byte sweep stores content
-- bytes only and explicitly records a gap for the rest — its own receipts carry
--   "permission_capture": "gap_not_available_for_raw_blob".
-- lifeos_blob.host_path, .symlink, .tree_entry and .xattr existed and were empty
-- because nothing could populate them.
--
-- This adds the bulk staging surface and the set-based converter that turns
-- staged filesystem records into canonical §16 envelope rows. Per hard rule 12
-- the raw stat/xattr record bytes are themselves stored as canonical objects, so
-- the typed attribute rows never stand in for the bytes they describe.
--
-- Design note: conversion is set-based rather than row-by-row because the host
-- carries ~1.7 M paths. The §16 envelope trigger still fires per row, so every
-- inserted record is digest-derived server-side and its raw object is byte
-- verified before the row is accepted.

-- Bulk landing zone for one capture pass. UNLOGGED: it is a transient staging
-- surface, never an authority — every durable row it produces lands in the
-- canonical envelope tables.
CREATE UNLOGGED TABLE IF NOT EXISTS lifeos_blob.host_capture_staging (
  staging_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  capture_label   text   NOT NULL,
  host_path       text   NOT NULL,
  entry_kind      text   NOT NULL,
  unix_mode       text   NOT NULL,
  owner_uid       bigint NOT NULL,
  owner_gid       bigint NOT NULL,
  owner_name      text   NOT NULL,
  group_name      text   NOT NULL,
  byte_size       bigint NOT NULL,
  hard_link_count bigint NOT NULL,
  inode           bigint NOT NULL,
  device_id       text   NOT NULL,
  access_time     text   NOT NULL,
  modify_time     text   NOT NULL,
  change_time     text   NOT NULL,
  symlink_target  text,
  xattr_names     text,
  acl_text        text,
  content_sha256  text
);

CREATE INDEX IF NOT EXISTS host_capture_staging_label_idx
  ON lifeos_blob.host_capture_staging (capture_label);

-- Convert staged filesystem records into canonical envelope rows.
--   * every staged record's exact bytes -> lifeos_blob.object (raw authority)
--   * regular files and directories    -> lifeos_blob.host_path
--   * symbolic links                   -> lifeos_blob.symlink
--   * directory membership             -> lifeos_blob.tree_entry
--   * extended attributes              -> lifeos_blob.xattr
-- Returns the per-kind counts actually written.
CREATE OR REPLACE FUNCTION lifeos_blob.ingest_host_capture(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_capture_label text
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
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;

  -- The canonical record bytes for each staged entry. These are the raw
  -- authority the typed rows below reference; they are stored before any typed
  -- row exists.
  CREATE TEMP TABLE staged_record ON COMMIT DROP AS
  SELECT
    s.staging_id,
    s.host_path,
    s.entry_kind,
    s.symlink_target,
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
  WHERE s.capture_label = p_capture_label;

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance)
  SELECT DISTINCT ON (extensions.digest(r.record_bytes, 'sha256'))
    p_tenant_id,
    extensions.digest(r.record_bytes, 'sha256'),
    extensions.ruvector_shake256_256(r.record_bytes),
    octet_length(r.record_bytes),
    'application/vnd.lifeos.host-capture-record',
    r.record_bytes,
    false,
    jsonb_build_object('producer', 'host-filesystem-capture',
                       'capture_label', p_capture_label)
  FROM staged_record r
  ORDER BY extensions.digest(r.record_bytes, 'sha256'), r.staging_id
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING;

  CREATE TEMP TABLE staged_linked ON COMMIT DROP AS
  SELECT r.*, o.object_id AS raw_object_id
  FROM staged_record r
  JOIN lifeos_blob.object o
    ON o.tenant_id = p_tenant_id
   AND o.sha256 = extensions.digest(r.record_bytes, 'sha256')
   AND o.byte_length = octet_length(r.record_bytes);

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
    'host_path_rows', host_path_rows,
    'symlink_rows',   symlink_rows,
    'tree_entry_rows', tree_rows,
    'xattr_rows',     xattr_rows);
END
$function$;
