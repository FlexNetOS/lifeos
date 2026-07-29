-- LifeOS migration 0070 — make transform idempotency inference explicit.

CREATE UNIQUE INDEX IF NOT EXISTS lifeos_semantic_transform_tenant_idempotency_full_uidx
  ON lifeos_semantic.transform (tenant_id, idempotency_key);
