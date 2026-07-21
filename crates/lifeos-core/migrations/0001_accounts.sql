-- Canonical durable LifeOS state starts in PostgreSQL. The database bootstrap
-- owns extension installation; the application refuses to operate if the
-- required namespace-isolated RuVector type is unavailable.
DO $lifeos_extensions$
BEGIN
  IF to_regtype('extensions.ruvector') IS NULL THEN
    RAISE EXCEPTION
      'LifeOS requires the ruvector extension installed in schema extensions';
  END IF;
END
$lifeos_extensions$;

-- The installation-owner bootstrap creates these schemas and grants the
-- runtime role only scoped CREATE rights inside them. Keeping `CREATE SCHEMA`
-- out of application migrations avoids requiring database-wide CREATE.
DO $lifeos_application_schemas$
DECLARE
  required_schema TEXT;
BEGIN
  FOREACH required_schema IN ARRAY ARRAY[
    'lifeos_blob',
    'lifeos_security',
    'lifeos_runtime',
    'lifeos_semantic',
    'lifeos_agentdb'
  ]
  LOOP
    IF to_regnamespace(required_schema) IS NULL THEN
      RAISE EXCEPTION
        'LifeOS requires bootstrap-created schema % for the runtime role',
        required_schema;
    END IF;
  END LOOP;
END
$lifeos_application_schemas$;

-- Original import bytes are retained alongside all derived rows. A future
-- chunked representation can extend this table without weakening the inline
-- byte-length invariant used by current account migration.
CREATE TABLE lifeos_blob.object (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256        CHAR(64) NOT NULL UNIQUE,
  byte_length   BIGINT NOT NULL CHECK (byte_length >= 0),
  raw_bytes     BYTEA NOT NULL,
  source_kind   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (octet_length(raw_bytes) = byte_length)
);

-- Login identity is durable PostgreSQL state. Password hashes remain hashes;
-- plaintext credentials never enter this table or general capture surfaces.
CREATE TABLE lifeos_security.identity (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lifeos_identity_email_key UNIQUE (email)
);
