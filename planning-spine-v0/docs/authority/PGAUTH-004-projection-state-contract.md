# PGAUTH-004 — Derived Projection Authority Contract

Task: `PGAUTH-004` ("Derived projection authority contract bounded") — parent `PGAUTH-001`, phase `2-postgres-foundation`.
Status: **owner-ratified target contract; implementation incomplete**. `STORE-001` revision 2 fixes PostgreSQL + RuVector as durable owner, redb as transient/pass-through, and envctl/CodeDB as controlled projection and reconciliation layers. Repository-authored planning inputs remain canonical until `ARCHBP-046..048` prove database control and cutover. Nothing is materialized or promoted merely by this document.

Scope: derived projections — flat files, generated directories, build inputs, runtime materializations, reports, exports, and caches — declared as **disposable or preserved projections with one-way provenance** from canonical state, per the PGAUTH-004 goal. A projection may be regenerated or (if preserved) checksummed and retained, but it can never become a competing writable owner of the state it was projected from.

Evidence base: `generated/notebooklm_source_claims.source.csv` (claim map) and `generated/notebooklm_claim_verification/NBVERIFY-001.truth-matrix.csv` + `NBVERIFY-003.truth-matrix.csv` (claim-scoped verification). **Reality check that shapes this whole contract:** the NotebookLM "envctl projection engine from database to directory" narrative is largely *refuted* against current code — envctl does **not** query PostgreSQL for a final branch, does **not** reconstruct directories from `module_path`, and does **not** concatenate `raw_code` into files (REDB-CLAIM-024, ENVPROJ-CLAIM-002/003/004, MAT-CLAIM-003/004/005, all refuted). Current materialization is a **separate CodeDB operation**. This contract therefore describes projections against *actual* materializers, not the source's proposed one.

## Authority table — projected state families

| State family | Target source and current boundary | Writers (materializer) | Readers | Directional provenance | Failure mode / recovery | Evidence citations |
|---|---|---|---|---|---|---|
| Materialized source directories | **Projection of PostgreSQL-retained original bytes in the target; current CodeDB redb blobs remain transitional.** | CodeDB/envctl deterministic materializer | Build environments, editors, agents | selected DB generation → CodeDB/envctl → files; edits return only through canonical byte-complete ingestion, never as projection back-writes. | Exact byte/metadata reconstruction; current CodeDB materialization remains the proven mechanism while target projection is built. | ARCHANCHOR-001 §§4.5, 4.8, 16; REDB-CLAIM-011/024; ARCHBP-038/042/046 |
| Build inputs / portable-runtime closure | **Disposable projection of a selected materialized generation.** | Nix/Yazelix build through the profile owner | Release pipeline, runtime | selected generation → materialize → build → runtime closure. | Rebuild from retained bytes and pinned build inputs; end-to-end selected-PG proof remains missing. | REDB-CLAIM-007/025; ARCHBP-021/025/029 |
| Semantic and runtime projections | **Derived from PostgreSQL + RuVector; never independent authority.** | envctl/CodeDB projection, redb owner mmap publisher | LifeOS Vue/Tauri Glass, agents, bounded consumers | PostgreSQL → envctl/CodeDB → redb owner → atomic checksummed read-only mmap generation plus ordered UDS events. Current envctl only consumes read-only exports; target commit/return behavior is unimplemented. | Regenerate after checksum/generation verification and replay ordered gaps. | ARCHANCHOR-001 §§3.2–3.3, 4.6–4.8, 12–13; ARCHANCHOR-002 §§4, 6–8; ARCHBP-039/042/043 |
| Generated planning artifacts (`generated/**` CSV/JSON, status projections, reports) | **Projection of maintained repository-native inputs now; database projection only after proven cutover.** | Repository generators now; governed database jobs after cutover | Agents, gates, bundle packager | maintained source → deterministic generator now; selected DB generation → deterministic generator after cutover. | Regenerate from the controlling source and verify hashes/links. | STORE-001 revision 2; ARCHBP-046..048 |
| Caches | **Disposable projections keyed by retained canonical inputs and complete algorithm identity.** | Declared cache owner | Same pipeline | canonical input → cache; miss or corruption → recompute. | Delete and recompute; no cache is authority. | REDB-CLAIM-016; ARCHBP-039 |
| Reports & exports | **Read-only projections of a named generation.** | Report generators | Humans, UI | selected state → deterministic report/export; never edited back. | Regenerate and checksum. | ARCHBP-047 |

## Contract invariants (apply to every row)

1. **One canonical source per projection; provenance is one-way.** Every projected class names its canonical source identity, the selected branch/version, and its deterministic materializer (PGAUTH-004 gate). Output → source back-writes are prohibited.
2. **Projection output can never become a competing writable owner.** Editing a materialized file, a generated CSV, or an export is not a write to canonical state; it reaches truth only by re-capture/ingestion through the canonical writer.
3. **Disposable vs preserved is declared, with a cleanup rule.** Caches/materialized dirs are disposable (safe to delete + regenerate); generated planning artifacts and deterministic exports are preserved with checksums.
4. **Checksum + metadata contract on every materialization.** SHA-256 byte-exactness (source dirs, blobs) or byte-deterministic regeneration (exports) is the integrity and recovery guarantee.
5. **Describe the real materializer, not the proposed one.** The refuted envctl-from-PostgreSQL projection story (REDB-CLAIM-024, ENVPROJ-CLAIM-002/003/004, MAT-CLAIM-003/004/005) may not be cited as current behaviour; only the actual `codedb` materialize path and the read-only envctl export consumer are current fact.

## Open items blocking closure

- `ARCHBP-039` single-owner redb service and atomic mmap/event projection.
- `ARCHBP-042/043` controlled PostgreSQL return projection and real Vue/Tauri Glass consumption.
- `ARCHBP-046..048` are the only gates that move repository planning inputs from canonical maintained sources to database-controlled projections.
- Local verification of the end-to-end selected-state → materialized dir → isolated build trace (REDB-CLAIM-025 remainder) and of portable-closure claims (REDB-CLAIM-007 remainder).
