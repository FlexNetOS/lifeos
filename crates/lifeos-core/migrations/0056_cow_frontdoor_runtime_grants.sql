-- LifeOS migration 0056 — grant the envctl front door only the rows it must
-- inspect and the binding mutations it owns.
GRANT SELECT ON lifeos_runtime.branch TO lifeos_envctl;
GRANT INSERT, UPDATE ON lifeos_runtime.cow_frontdoor_binding TO lifeos_envctl;
