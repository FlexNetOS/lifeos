-- LifeOS migration 0050 — complete the Seed Vault custody bridge.
--
-- register_seed_vault_root is intentionally owned by lifeos_envctl, so the
-- function executes with the sole ingress committer's privileges. The table
-- was created by lifeos_migrator and previously lacked the narrow DML grant
-- required by that SECURITY DEFINER function.
GRANT SELECT, INSERT ON lifeos_security.seed_vault_record TO lifeos_envctl;
