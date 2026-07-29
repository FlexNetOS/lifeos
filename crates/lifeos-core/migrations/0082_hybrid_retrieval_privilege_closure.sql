-- LifeOS migration 0082 — grant the SECURITY DEFINER owner its ledger access.
--
-- The migration session owns the tables, while hybrid_search runs as
-- lifeos_migrator. Keep direct application access closed and grant only the
-- definer's required read/append privileges; RLS remains enforced.

GRANT SELECT, INSERT ON lifeos_semantic.retrieval_query TO lifeos_migrator;
GRANT SELECT, INSERT ON lifeos_semantic.retrieval_result TO lifeos_migrator;
