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
CREATE SCHEMA IF NOT EXISTS lifeos_agentdb;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS ruvector WITH SCHEMA extensions;

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
  ('lifeos_agentdb')
) AS application_schemas(schema_name)
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
