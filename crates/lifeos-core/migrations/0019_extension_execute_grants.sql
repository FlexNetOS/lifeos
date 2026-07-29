-- LifeOS migration 0019 — extension EXECUTE grants for the §16 role set.
--
-- Defect: §16.2 (blueprint line 146) grants USAGE ON SCHEMA extensions to
-- lifeos_migrator, lifeos_envctl, lifeos_runtime, lifeos_worker, lifeos_reader,
-- lifeos_security_owner, lifeos_security_broker, lifeos_release and
-- lifeos_backup, but the earlier least-privilege closure had already revoked
-- PUBLIC execute on those functions. Schema usage without function execute is
-- inert, so §16.3's SECURITY DEFINER routines — which run as their owner,
-- notably lifeos_security_owner — failed live with
-- "permission denied for function ruvector_shake256_256" even though the same
-- migrations succeed on a database where PUBLIC execute was never revoked.
--
-- Correction: grant EXECUTE on the extension routines to exactly the role list
-- §16 already grants schema usage to. This adds no role, widens nothing to
-- PUBLIC, and narrows no gate; it makes the grant §16 states actually effective.
-- Idempotent.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions
  TO lifeos_migrator, lifeos_envctl, lifeos_runtime, lifeos_worker,
     lifeos_reader, lifeos_security_owner, lifeos_security_broker,
     lifeos_release, lifeos_backup;

GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA extensions
  TO lifeos_migrator, lifeos_envctl, lifeos_runtime, lifeos_worker,
     lifeos_reader, lifeos_security_owner, lifeos_security_broker,
     lifeos_release, lifeos_backup;
