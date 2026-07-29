-- LifeOS migration 0055 — least-privilege read closure for the COW front door.
-- The front door only recognizes an existing preserved COW branch; all writes
-- remain inside the established security-definer v2 procedures.
GRANT SELECT ON lifeos_runtime.branch_pre_s16 TO lifeos_envctl;
