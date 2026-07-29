-- Run once as the PostgreSQL installation owner before starting LifeOS.
-- This file is intentionally outside sqlx's numbered application migrations:
-- extension creation requires elevated database authority, while the LifeOS
-- runtime role needs only schema/table privileges after bootstrap.
--
-- Required psql variable: -v lifeos_runtime_role='<runtime role>'. The script
-- grants only that role access to the extension schema; it never widens access
-- to PUBLIC.

\if :{?lifeos_runtime_role}
\else
\echo 'lifeos_runtime_role is required (pass -v lifeos_runtime_role=<role>)'
\quit
\endif

CREATE SCHEMA IF NOT EXISTS extensions;

-- Application schemas are owned by the installation administrator. The
-- runtime role receives only the ability to create and use its application
-- relations, not database-wide schema authority.
CREATE SCHEMA IF NOT EXISTS lifeos_blob;
CREATE SCHEMA IF NOT EXISTS lifeos_security;
CREATE SCHEMA IF NOT EXISTS lifeos_runtime;
CREATE SCHEMA IF NOT EXISTS lifeos_semantic;
CREATE SCHEMA IF NOT EXISTS lifeos_agent;
CREATE SCHEMA IF NOT EXISTS lifeos_agentdb;
CREATE SCHEMA IF NOT EXISTS lifeos_rvf;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;
-- The profile now carries the rendered full-feature 0.3.1 catalog. Its C
-- implementation is rebound below to the one approved durable library path
-- so existing databases and fresh installs share one loaded identity.
CREATE EXTENSION IF NOT EXISTS ruvector
  WITH SCHEMA extensions VERSION '0.3.1';

-- The packaged 0.3 extension SQL still names its profile `$libdir` binary,
-- while CAP-INV011-001 installs the accepted RuVector build in Meta's durable
-- extension path. Reconnect so the backend that parsed CREATE EXTENSION exits,
-- then use supported CREATE OR REPLACE DDL to rebind every extension-owned C
-- function to one library. This prevents duplicate `_PG_init`/GUC registration
-- and avoids a mixed-binary extension session.
\connect :DBNAME

DO $lifeos_ruvector_library_rebind$
DECLARE
  procedure_row RECORD;
  function_definition TEXT;
  approved_library CONSTANT TEXT :=
    '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector';
BEGIN
  FOR procedure_row IN
    SELECT procedure.oid, procedure.probin
    FROM pg_proc procedure
    JOIN pg_language language ON language.oid = procedure.prolang
    JOIN pg_depend dependency
      ON dependency.classid = 'pg_proc'::regclass
     AND dependency.objid = procedure.oid
     AND dependency.refclassid = 'pg_extension'::regclass
     AND dependency.deptype = 'e'
    JOIN pg_extension extension
      ON extension.oid = dependency.refobjid
    WHERE extension.extname = 'ruvector'
      AND language.lanname = 'c'
      AND procedure.probin IS DISTINCT FROM approved_library
  LOOP
    function_definition := pg_get_functiondef(procedure_row.oid);
    function_definition := replace(
      function_definition,
      procedure_row.probin,
      approved_library
    );
    EXECUTE function_definition;
  END LOOP;
END
$lifeos_ruvector_library_rebind$;

-- RuVector 0.3 installations predate the extension upgrade script that
-- registers the INV-011 SHAKE256-256 SQL entry point.  The native symbol is
-- installed by CAP-INV011-001; register it for fresh databases and attach it
-- to the extension so drop/upgrade ownership remains truthful.
DO $lifeos_ruvector_shake256_registration$
BEGIN
  IF to_regprocedure('extensions.ruvector_shake256_256(bytea)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION extensions.ruvector_shake256_256(input BYTEA)
      RETURNS BYTEA
      AS '/home/flexnetos/meta/var/lib/ruvector/ext/ruvector',
         'ruvector_shake256_256_wrapper'
      LANGUAGE C
      IMMUTABLE STRICT PARALLEL SAFE
    $sql$;
    ALTER EXTENSION ruvector
      ADD FUNCTION extensions.ruvector_shake256_256(BYTEA);
  END IF;
END
$lifeos_ruvector_shake256_registration$;

-- INV-011's immutable probe calls this compatibility surface in `extensions`.
-- Pre-create it as the installation owner, then transfer only this function to
-- the SQLx role. Migration 0005 predates the canonical application-schema
-- boundary and uses CREATE OR REPLACE on this exact function, so bootstrap
-- grants a narrowly timed CREATE privilege. Migration 0006 invokes the
-- installation-owned finalizer below to revoke it immediately; a post-migration
-- bootstrap rerun also revokes it before returning.
CREATE OR REPLACE FUNCTION extensions.lifeos_cow_branch_capability()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  report JSONB;
BEGIN
  IF to_regprocedure('lifeos_runtime.cow_branch_capability()') IS NULL THEN
    RETURN jsonb_build_object(
      'schema_version', 0,
      'implemented', false,
      'reason', 'cow branch migration pending'
    );
  END IF;
  EXECUTE 'SELECT lifeos_runtime.cow_branch_capability()' INTO report;
  RETURN report;
END
$function$;

SELECT format(
  'ALTER FUNCTION extensions.lifeos_cow_branch_capability() OWNER TO %I',
  :'lifeos_runtime_role'
)
\gexec

CREATE OR REPLACE FUNCTION extensions.finalize_lifeos_cow_migration()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  compatibility_owner NAME;
BEGIN
  SELECT role.rolname INTO STRICT compatibility_owner
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles role ON role.oid = procedure.proowner
  WHERE namespace.nspname = 'extensions'
    AND procedure.proname = 'lifeos_cow_branch_capability'
    AND procedure.pronargs = 0;
  EXECUTE format(
    'REVOKE CREATE ON SCHEMA extensions FROM %I',
    compatibility_owner
  );
END
$function$;
REVOKE ALL ON FUNCTION extensions.finalize_lifeos_cow_migration()
  FROM PUBLIC;

SELECT format('GRANT CREATE ON SCHEMA extensions TO %I', :'lifeos_runtime_role')
\gexec

SELECT format('GRANT USAGE ON SCHEMA extensions TO %I', :'lifeos_runtime_role')
\gexec

SELECT format('GRANT USAGE ON TYPE extensions.ruvector TO %I', :'lifeos_runtime_role')
\gexec

SELECT format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO %I', :'lifeos_runtime_role')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'lifeos_runtime_role')
\gexec

-- sqlx keeps its migration ledger as an unqualified relation. Pin this role's
-- database-local search path to the application schema so the ledger never
-- requires CREATE on public.
SELECT format(
  'ALTER ROLE %I IN DATABASE %I SET search_path TO lifeos_runtime, extensions, pg_catalog',
  :'lifeos_runtime_role',
  current_database()
)
\gexec

SELECT format('GRANT USAGE, CREATE ON SCHEMA %I TO %I', schema_name, :'lifeos_runtime_role')
FROM (VALUES
  ('lifeos_blob'),
  ('lifeos_security'),
  ('lifeos_runtime'),
  ('lifeos_semantic'),
  ('lifeos_agent'),
  ('lifeos_agentdb'),
  ('lifeos_rvf')
) AS application_schemas(schema_name)
\gexec

-- envctl is the sole authoritative COW committer. It needs namespace lookup
-- for the narrowly granted SECURITY DEFINER API, never CREATE or table DML.
SELECT format('GRANT USAGE ON SCHEMA %I TO lifeos_envctl', schema_name)
FROM (VALUES
  ('lifeos_blob'),
  ('lifeos_runtime'),
  ('lifeos_agent'),
  ('lifeos_rvf')
) AS envctl_schemas(schema_name)
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_envctl')
\gexec

DO $lifeos_extension_placement$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension extension
    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'ruvector' AND namespace.nspname = 'extensions'
  ) THEN
    RAISE EXCEPTION 'LifeOS requires ruvector in the extensions schema';
  END IF;
END
$lifeos_extension_placement$;

SELECT 'SELECT extensions.finalize_lifeos_cow_migration()'
WHERE to_regprocedure('lifeos_runtime.cow_branch_capability()') IS NOT NULL
\gexec
