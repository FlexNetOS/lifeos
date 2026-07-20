# Proof-ledger duplicate revision identity resolutions (2026-07-14)

Task: ARCHBP-035 — "Resolve duplicate proof-ledger task revision identities
without rewriting history" (parent LPS-007).

## Incident

On 2026-07-14 ledger sequences 241-258 were appended to
`proof_records/proof_ledger.jsonl` out-of-band: the lines use non-canonical
key ordering (the merger writes sorted keys) and bypassed the merge conflict
guard, recording regenerated proofs under already-used `(task_id, revision)`
identities. The root trigger is that `verify-lps-docs.py` rewrites the
LPS proof records with a hardcoded `"revision": 1`, so a regeneration after
content changes produces a same-revision different-digest proof.

Result: 18 `(task_id, revision)` pairs carried two identities with
conflicting `proof_sha256` values (first hit: `GRAPH-005` revision 1,
sequences 185 and 241). `merge-proof-records.py` failed closed on the whole
ledger from that point, while the status projection silently selected the
highest sequence and the navigation index silently accepted the last row.

## Resolution contract (append-only)

Ledger history is never rewritten or deleted. A conflict is reconciled only
by appending a `status: "conflict-resolved"` ledger record whose `resolves`
object names **every** recorded identity `(sequence, proof_sha256)` for the
conflicted `(task_id, revision)`, marks exactly one identity `accepted`
(the rest `superseded`), and carries independent-verifier fields
(`verified_by`, `verified_at`, `resolution_reason`). The record itself
repeats the accepted digest and proof URI.

All four ledger readers apply the identical contract and fail closed while
any conflict is unresolved:

- `scripts/merge-proof-records.py` (merge + `--audit` + `--resolve`)
- `scripts/update-task-graph-status.py` (status projection)
- `scripts/build-navigation-index.mjs` (`ledger_revision_conflicts_resolved`
  check)
- regression suite `tests/planning-spine-proof-ledger-conflicts.spec.js`

After a valid resolution, every reader projects the single accepted
identity; superseded identities stay byte-preserved in the ledger. A proof
line appended after a resolution with a diverging digest reopens the
conflict and requires a new resolution naming the full identity history.

## Files

- `resolutions.json` — the independent-verifier resolution document
  (schema `lifeos-planning-spine.proof-ledger.conflict-resolutions.v0`)
  applied with:

  ```bash
  python3 scripts/merge-proof-records.py \
    --resolve proof_records/corrections/proof-ledger-conflict-resolutions-2026-07-14/resolutions.json \
    --ledger proof_records/proof_ledger.jsonl
  ```

  Every accepted digest was verified to match the current on-disk bytes of
  the task proof artifact before acceptance (`--resolve` re-checks this).
  The append receipt is committed at
  `proof_records/proof_ledger.resolution_report.json`.

## Consolidation receipt (2026-07-20)

The LifeOS consolidation had already appended sequence 259, the ARCHBP-035
proof carrying the same 18 independently verified decisions in its embedded
`ledger_conflict_resolutions` evidence, followed by sequence 260 for
STORE-001. Full history integration therefore preserved sequences 1–260
byte-for-byte and appended the explicit `conflict-resolved` records as
sequences 261–278. The explicit records are the canonical reader contract;
the embedded sequence-259 evidence remains immutable provenance.
