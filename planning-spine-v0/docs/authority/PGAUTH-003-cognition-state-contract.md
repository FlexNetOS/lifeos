# PGAUTH-003 — Per-Agent Cognition Authority Contract

Task: `PGAUTH-003` ("Per-agent cognition authority contract bounded") — parent `PGAUTH-001`, phase `2-postgres-foundation`.
Status: **owner-ratified target contract; implementation incomplete**. `STORE-001` revision 2 fixes AgentDB `.rvf` as the per-agent cognition owner and PostgreSQL + RuVector as shared macro-state. This document performs no model training or runtime mutation and does not upgrade unproven AgentDB/SONA claims into implementation facts.

Scope: cognitive state that is canonical **only for one agent** — learning traces, trajectories, local adaptations (MicroLoRA weights), routing memory (FastGRNN), and witness-bound memory — per the PGAUTH-003 goal. PostgreSQL + RuVector retains shared macro-state authority (PGAUTH-001); this contract draws the boundary that keeps AgentDB from silently owning shared user-space truth.

Evidence base: `generated/notebooklm_source_claims.source.csv` (claim map), `generated/notebooklm_claim_verification/NBVERIFY-001.truth-matrix.csv` (the only matrix that ran a live AgentDB/SONA probe — rows REDB-CLAIM-027 and REDB-CLAIM-028), and `generated/notebooklm_claim_evidence.source.csv`. Citations below are claim IDs; their verification statuses are those recorded in the matrices, not restatements of NotebookLM prose. Every AGENTDB-/COGEVO-/RUVCOG- claim about self-learning behaviour is `mapped-verification-required` (proposal, not proven current design) unless a live-probe row upgrades it.

## Authority table — cognitive state families

| State family | Target owner | Writers | Readers | Sync path | Failure mode / recovery | Evidence citations |
|---|---|---|---|---|---|---|
| Learning traces & trajectories (per-agent success/failure history, SONA feedback) | **AgentDB `.rvf`, per agent.** | The owning agent's SONA runtime only (single-writer per `.rvf`) | The owning agent; no agent reads another agent's raw traces without a governed export | Curated results and required durable product history enter PostgreSQL through governed envctl commits; `.rvf` never becomes shared macro-state. | `.rvf` is a portable per-agent container. **Known defect:** the live Bun probe recorded zero trajectories through the documented hit-ID call, so this target is not yet operationally proven. | STORE-001 revision 2; REDB-CLAIM-027; ARCHBP-007/042 |
| Local adaptations (MicroLoRA adapter weights = per-agent skills/personality) | **AgentDB `.rvf`, per agent.** | Agent adaptation runtime (single-writer) | Owning agent runtime | Adapters stay agent-local; any promoted skill becomes a separately identified, governed PostgreSQL artifact. | Rebuild from base model and retained history. Joint adapter/FastGRNN and 50-agent footprint claims remain unproven. | STORE-001 revision 2; REDB-CLAIM-028; ARCHBP-007/009/010 |
| Routing memory (FastGRNN pre-filter / attention map) | **AgentDB `.rvf`, per agent.** | Agent routing trainer | Owning agent's pre-LLM selector | Derived from the agent's traces; never authoritative over shared retrieval or execution policy. | Re-train from retained inputs; no current LifeOS deployment is proven. | AGENTDB-CLAIM-008; RUVCOG-CLAIM-006..008; ARCHBP-009 |
| Witness-bound claim/source links | **PostgreSQL + RuVector shared macro-state; AgentDB holds references only.** | Verifier/proof pipeline | Agent (read reference), audit | agent candidate → verifier binding → governed PostgreSQL commit; no implicit cognition-to-truth promotion. | File proof ledger remains operating evidence until witness-chain and DB cutover proofs pass. | ARCHANCHOR-001 §§6, 17; WITNESS-CLAIM-004..007; ARCHBP-016/047 |
| Deployment container identity | **AgentDB `.rvf` bytes plus PostgreSQL registry identity.** | Agent lifecycle manager | Orchestrator, UI | Registry references exact `.rvf` identity; orphan containers are quarantined. | Re-register from exact file/provenance; do not auto-adopt. | STORE-001 revision 2; AGENTDB-CLAIM-001..003; ARCHBP-007 |

## Contract invariants (apply to every row)

1. **Cognition is per-agent and non-authoritative over shared truth.** An `.rvf` may be canonical for its own agent's learning; it may never be the canonical source of any shared macro-state class (PGAUTH-003 gate). The redb-passive-vs-AgentDB-active framing (COGEVO-CLAIM-001, COGEVO-CLAIM-011, authority-proposal, unverified) is recorded as a *proposal*, not an authority grant.
2. **Promotion is explicit, one-way, and governed.** Anything moving from cognition into shared macro-state passes through a named command that produces a new shared artifact with its own identity; there is no implicit merge and no back-write into another agent's cognition.
3. **Portability + retention are declared per class.** Each row states whether it is disposable (routing, adapters — re-derivable) or retained (curated trace summaries). Raw traces are agent-private and never bulk-synced.
4. **Proven-component ≠ proven-system.** REDB-CLAIM-027/028 prove the *pieces* exist and load, but the qualified verdicts (defective feedback loop; components never shown jointly in one file) forbid treating the full self-learning cognitive-container story as current fact.
5. **No secret or shared-user-space value enters an `.rvf` as authority.** Cognition holds references and learned weights, not canonical user records.

## Open items blocking closure

- Fix or formally accept the defective `recordFeedback` trajectory-ID contract before any trace is treated as durable (REDB-CLAIM-027 remainder).
- Local verification that one `.rvf` can jointly persist adapters + routing within a bounded footprint (REDB-CLAIM-028 remainder) — required before AGENTDB-CLAIM-009's 50-agents-one-footprint economics can be relied on.
- Witness-chain implementation does not exist; the provenance-link row is aspirational until built.
