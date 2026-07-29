-- LifeOS migration 0086 — grant the OpenPencil definer its ledger access.

GRANT SELECT, INSERT ON lifeos_runtime.open_pencil_apply TO lifeos_envctl;
