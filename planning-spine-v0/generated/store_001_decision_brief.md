# STORE-001 — Store Relationship Decision Brief

**For:** David (owner). **Prepared by:** planning-spine PGAUTH lane. **Status:** decision-ready; awaiting your architecture decision. Nothing below has been deployed.

## The decision to make

Assign every macro-state data class exactly once across **redb**, **PostgreSQL + RuVector**, and **nu_plugin CodeDB**, and fix the synchronization direction, durability, recovery, and transition path between them. This one decision unblocks PGAUTH-002/006, POSTGRES-001, and the whole `2-postgres-foundation` phase. An agent cannot make it; it needs your sign-off, recorded as `proof_records/STORE-001.proof.json`.

## What is already true (not a proposal)

- **redb and PostgreSQL are already peer backends of one contract.** `codedb_core::store::BlobStore` is a backend-neutral, SHA-256 content-addressed trait. `codedb_store_redb` and `codedb_store_pg::PgStore` both implement it; `codedb_store_pg/tests/blobstore_parity.rs` runs the *same* behavioural suite against both, and `fail_closed.rs` proves the PG path rejects empty/unsafe DSNs offline. **redb is the durable default today; PgStore is a fully-implemented alternative.** No rebuild is required to move blobs between them — the migration path already exists in code.
- **Parity is proven by design, but live PG parity needs a service.** `blobstore_parity.rs` is gated behind `pg-integration` + a mandatory disposable `CODEDB_PG_CONN`; the contract is symmetric, but a green live run against a real PostgreSQL has not been captured here.
- **RuVector-in-PostgreSQL is not yet proven to run locally.** The pgrx extension exists upstream (`CREATE EXTENSION`, no sidecar), but **no installed LifeOS PostgreSQL extension activation was demonstrated** (NBVERIFY-001, REDB-CLAIM-023 qualified). The proven runtime is the Bun-loaded `ruvector` 0.2.34 N-API package — a standalone vector DB, not an in-PG extension.

## The three options

### Option A — redb-primary
redb owns durable macro-state; PostgreSQL is optional/secondary.
- **Evidence for:** NBVERIFY-001 verified redb 4.1.0 as a pure-Rust embedded ACID/MVCC store (REDB-CLAIM-001/004/005/006). Benchmark (`NBVERIFY-001.redb-benchmark.summary.json`, 5 runs): 1536-byte read **p50 ~0.27 µs**; Immediate write-commit **p50 ~20–24 µs**. Already the durable default; zero migration risk.
- **Evidence against:** redb has **no SQL, relational, or vector capability** — REDB-CLAIM-008/009/010 (geometry engine / cosine / AVX-512) are **refuted**; REDB-CLAIM-013 (no SQL/secondary indexes) qualified. It is single-node, no server/replication (REDB-CLAIM-012). "Competitive with LMDB" is **unproven** (no comparator, REDB-CLAIM-014 qualified). Picking A caps LifeOS out of native relational + semantic SQL.

### Option B — PostgreSQL+RuVector-primary
PostgreSQL + RuVector (PostgreSQL+RuVector-primary) owns durable macro-state and semantics; redb demoted to cache/buffer.
- **Evidence for:** RuVector consolidates relational + vector + GNN in one engine, removing a synchronized sidecar (RVPG-CLAIM-002/004/005, architecture-proposals). CodeDB already has a working `PgStore`, so the durable path exists. NBVERIFY-003 confirms CodeDB can target PostgreSQL directly.
- **Evidence against:** **Not locally proven** — no RuVector PG extension activation demonstrated (REDB-CLAIM-023 remainder); PG durability/PITR claims unverified here (RVPG-CLAIM-005). Choosing B *demotes redb's current durable uses (CodeDB source blobs, envctl migration state) to transient* — a durable→transient reclassification that the PGAUTH-002 gate explicitly forbids doing silently.

### Option C — layered hybrid (the NotebookLM proposal)
PostgreSQL + RuVector = canonical macro-state; redb = transient high-frequency buffer/WAL; AgentDB `.rvf` = per-agent cognition; envctl = DB→directory projection; Yazelix + Nix = portable runtime (`notebooklm_postgres_context.meta.json` `architectural_result`).
- **Evidence for:** Cleanly separates concerns and matches the PGAUTH-001..005 family split. Each tier maps to a real component that exists on disk.
- **Evidence against (the core contradiction — see below):** the proposal's premise that **redb is *only* a transient buffer is false today** (REDB-CLAIM-020 qualified: redb is the durable default; envctl uses redb durably for migration state). Its envctl-writes-to-PostgreSQL mechanism is **refuted** (AUTH-CLAIM-001, REDB-CLAIM-021, NUPG-CLAIM-008/009, ENVPROJ-CLAIM-002/003/004). Adopting C verbatim would erase justified durable capability.

## Contradiction found (researched, not assumed)

The NotebookLM sources repeatedly cast **redb as a transient ingestion buffer / WAL feeding a durable PostgreSQL** (REDB-CLAIM-020, EDGE-CLAIM-003/004, the "migration bridge"). The **verified local reality is the opposite direction of authority**: redb is CodeDB's *durable default* source-blob store and envctl's *durable* migration store, while PostgreSQL is an already-implemented **peer** backend of the same `BlobStore` contract — not a tier above redb. Separately, NBVERIFY-003 shows the source's rationale for a redb→envctl→PostgreSQL indirection is contradicted by the **existing direct `PgStore`** (NUPG-CLAIM-006), and the plugin does **not** buffer parsed blocks into redb (NUPG-CLAIM-007 refuted). Treating redb as transient by assumption would be a silent durable→transient reclassification — exactly what POSTGRES-001/PGAUTH-002 prohibit.

## Risks

- **Downgrade risk (highest):** any option that demotes redb's current durable classes without a *proven* PG cutover violates upgrades-not-downgrades and risks data-authority loss.
- **Unproven-target risk:** committing to RuVector-in-PostgreSQL before local extension activation is proven bets on an unverified runtime.
- **Dual-write risk:** an undirected redb↔PostgreSQL edge (Option C done naively) creates two writers for one class.
- **Benchmark-overreach risk:** the redb numbers prove low local latency only; no LMDB/PostgreSQL comparator, no AVX-512, no vector path — they cannot justify redb for semantic/relational work.

## Recommendation

**Adopt a *corrected* layered hybrid (Option C with two guardrails).**

1. **Target state:** PostgreSQL + RuVector as the **canonical owner of relational + semantic shared macro-state**; AgentDB `.rvf` for per-agent cognition (non-authoritative, PGAUTH-003); envctl/CodeDB materialization for projections (PGAUTH-004); Yazelix + Nix for the portable runtime.
2. **Guardrail 1 — preserve durable redb until a *proven* cutover:** CodeDB source blobs and envctl migration state stay **durable on redb** until a green live `blobstore_parity.rs` run against a disposable PostgreSQL + a proven RuVector extension activation exist. redb is reclassified to buffer/cache **only per class, only after** its PG replacement is verified — never by assumption.
3. **Guardrail 2 — use the existing `BlobStore` parity contract as the migration mechanism.** It already lets the same bytes live in either backend under one SHA-256 identity, so cutover is a verified swap, not a rebuild.

This preserves every justified current capability, moves deliberately toward PostgreSQL-primary macro-state, keeps redb where it is genuinely fast and durable, and resolves the CodeDB/envctl durable-redb conflict explicitly rather than erasing it. Record the class-by-class assignment in `generated/store_relationship_decision.json` and sign off in `proof_records/STORE-001.proof.json`; that single act unblocks PGAUTH-002/006, POSTGRES-001, and phase 2.
