-- LifeOS migration 0052 — complete the secret registration table boundary.
--
-- The envctl-owned registration procedure inserts and reconciles the
-- ciphertext-backed secret object while all secret lifecycle writes remain
-- behind their existing SECURITY DEFINER procedures.
GRANT SELECT, INSERT ON lifeos_security.secret_object TO lifeos_envctl;
