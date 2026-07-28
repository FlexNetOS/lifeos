-- LifeOS migration 0072 — repair an empty witness chain with a non-genesis head.
-- An empty chain is valid only at sequence zero with the canonical genesis
-- digest. This forward migration repairs the observed stale bootstrap row;
-- populated chains are never rewritten.
UPDATE lifeos_agent.witness_chain AS chain
SET head_shake256 = extensions.ruvector_shake256_256(convert_to('genesis', 'UTF8'))
WHERE chain.head_sequence = 0
  AND NOT EXISTS (
    SELECT 1
    FROM lifeos_agent.witness_entry AS entry
    WHERE entry.chain_id = chain.chain_id
  )
  AND chain.head_shake256 IS DISTINCT FROM extensions.ruvector_shake256_256(convert_to('genesis', 'UTF8'));
