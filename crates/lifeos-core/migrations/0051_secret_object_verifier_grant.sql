-- LifeOS migration 0051 — complete the ciphertext registration bridge.
--
-- register_secret_object is owned by lifeos_envctl and delegates byte
-- verification to the migrator-owned verifier under its SECURITY DEFINER
-- boundary. Keep that dependency explicit and narrowly scoped.
GRANT EXECUTE ON FUNCTION lifeos_blob.verify_object(uuid) TO lifeos_envctl;
