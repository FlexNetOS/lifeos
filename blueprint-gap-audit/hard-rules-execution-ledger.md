# HARD EXECUTION RULES — execution ledger

Opened 2026-07-28. This ledger is the governing frame for the every-byte import and all
blueprint execution in this workspace. It walks the blueprint in its own stated order:
the 21 HARD EXECUTION RULES first, then §1 onward. Owner correction 2026-07-28 recorded:
execution must enter through the hard rules, not through a downstream invariant.

Evidence timestamps are live-probe results from 2026-07-28 unless marked otherwise.
Statuses: **GOVERNING** (meta-rule, always in force) · **CONFORMANT** (probed true) ·
**IN-PROGRESS** (active workstream running now) · **REQUIRED-WORK** (release-gated gap,
tracked; never narrows the anchor per rule 21).

| # | Rule (abbrev.) | Status | Evidence / required work |
|---|---|---|---|
| 1 | PG/RuVector contains host ALL data; Swarm Primary Runtime | IN-PROGRESS | `lifeos` live, ruvector 2.0.1, 25 GB and growing under pass-2 sweep; pre-sweep delta 254.7 GB / 391,152 files being imported. Closure = sweep + reconciliation. |
| 2 | Every byte and record captured; nothing left behind | IN-PROGRESS | Pass-2 wave sweep running (detached, ledger `meta/var/lib/codedb/ledgers/waves.jsonl`); declared-exclusion ledger due at closure (PGDATA→invariant-13 path; sockets; secret-class→`capture_gaps`). |
| 3 | After PG works, all work inside PG | REQUIRED-WORK | Operational surfaces (GitKB, ICM, beads, meta graphs) still file/SQLite projections; operational-phase cutover is release-gated (§1.2, doctrine). |
| 4 | "Inside" = PG owns state, coordinates, records, controls | REQUIRED-WORK | `lifeos_runtime` control tables (branch, promotion, merge_gate, cow_*) exist but are near-empty; population is cutover work. |
| 5 | External surfaces do not disappear | CONFORMANT | Nothing removed; all surfaces active. |
| 6 | DB ownership + external execution compatible and required | CONFORMANT | Architecture stance held; no conflicting edit made. |
| 7 | Bidirectional LifeOS front door remains operational | IN-PROGRESS | Svelte phase-3 cutover complete in repo (25 `.svelte` components; R01 target reached, release-pin still owed). §3.1 PTY/xterm Engine-Room embed = REQUIRED-WORK (portable-pty 0.9.0 + ordered channels + exact `yzx enter` argv, per R02/R03). |
| 8 | External components are controlled surfaces, not truth | CONFORMANT (stance) | Enforced progressively as rule-3 cutover lands. |
| 9 | Bootstrap installs/imports; doesn't define ownership | CONFORMANT | Sweep runs as §1.1 bootstrap import; no ownership semantics inferred from bootstrap tooling. |
| 10 | nu_plugin/CodeDB is THE byte-complete ingress | CONFORMANT | Sweep uses `codedb capture --store pg`; direct-PG store used under §3.4's explicit bootstrap/import authorization. |
| 11 | CodeDB captures every byte/semantic/metadata/… record | IN-PROGRESS | Same workstream as rule 2; receipts per root (CSV) + policy + ledger, all themselves captured by the convergence pass. |
| 12 | Hashes/manifests supplement, never replace bytes | CONFORMANT | Probe: 564,930/564,933 blobs carry inline bytes; 3 carry chunked bytes (`blob_chunks`); zero pointer-only rows. |
| 13 | redb single-owner plane + published mmap projection | IN-PROGRESS | `flexnetos-redb-owner serve /home/flexnetos/meta/var/lib/redb` RUNNING (pid 1169710). mmap projection format/pins/stale-reader gates = REQUIRED-WORK (R05 additions). |
| 14 | Files/worktrees are execution projections | CONFORMANT (stance) | Doctrine conversion (`files → Nu tables → envctl tables → generated files`) continues as required work. |
| 15 | ruvnet/rUv components installed and used | IN-PROGRESS | ruvector 2.0.1 live in-DB; `lifeos_agentdb`, `lifeos_rvf`, `lifeos_semantic` schemas present. ruvllm/SONA/Ruflo/RuvLTRA/ATAS activation = REQUIRED-WORK (ruflo not on PATH; `.swarm/memory.db` stale since 07-24). |
| 16 | Everything round-trips to PG/RuVector | IN-PROGRESS | Capture receipts/ledgers captured by convergence pass; full request/response round-trip enforcement is operational-phase (rule 3). |
| 17 | Conflicting edit is invalid | GOVERNING | This ledger is the enforcement instrument; every edit checked against rules before landing. |
| 18 | Broader interpretation governs ambiguity | GOVERNING | Applied: exclusions are *declared* (never silent); recapture-whole-roots chosen over path-delta-only. |
| 19 | Scope implemented as written | GOVERNING | Owner correction accepted 2026-07-28; execution re-anchored to blueprint order. |
| 20 | Exact linked file read back after final edit | GOVERNING | Applies to the closure report and every linked artifact at hand-off. |
| 21 | Anchor absolute; gaps → required work, never narrowing | GOVERNING | Gap treatment follows R17–R19 precedent: additive acknowledgement, no gate narrowed. |

## Walk order correction — 2026-07-28

Owner correction #2: the first pass jumped to §17 (line 5571) without walking §§1–16.
The blueprint's own order is the execution order. A complete heading index was built
(95 headings, lines 3–6347) and the walk restarted at line 33. Sections are visited in
document order; nothing is selected for convenience.

**What the restarted walk found immediately — the canonical ingress was 100 % non-executable.**
Two defects, both invisible from §17 and both fixed:

| Defect | Evidence | Correction |
|---|---|---|
| §16.3 computes SHAKE256 witnesses as `extensions.digest(x,'shake256')`. **pgcrypto cannot compute SHAKE at all** — it is an extendable-output function, so OpenSSL's `EVP_MD_CTX_size()` has no defined value. | Live: `ERROR: EVP_MD_CTX_size() failed`; `sha3-256` works, `shake256` never can. | **0017** — 26 call sites across 12 functions repointed to RuVector's native `extensions.ruvector_shake256_256(bytea)` (32-byte output, matches the `octet_length=32` checks). Generated mechanically from `pg_get_functiondef` so the digest call is the only delta. Satisfies hard rule 15 and invariant 12. |
| No security authority existed, so `store_bytes()` always raised *"tenant context is not bound"*. `bootstrap_envctl_context()` requires an identity whose `subject_key = session_user`, an unexpired `bind-session` grant, and matching binding bytes. | Live: every commit attempt rejected. | **0018** — seeds policy → identity → grant with fixed bootstrap UUIDs, each with its raw provenance bytes in `lifeos_blob.object` (hard rule 12). |
| §16 grants USAGE on schema `extensions` to nine roles, but PUBLIC execute had been revoked earlier, so the grant was inert and SECURITY DEFINER bodies could not call RuVector. | Live only: `permission denied for function ruvector_shake256_256`; ACL showed `lifeos_security_owner` absent. | **0019** — EXECUTE granted to exactly §16's role list. Nothing widened to PUBLIC. |

Live proof after 0017–0019 (`bound_tenant_matches`, `dedup_same_object`, `sha_matches`,
`shake_matches`, `roundtrip_exact`, `load_object_bytes_exact`, `verify_object`) — **all true**.
Full lineage `0001→0019` also applies clean from an empty database. Live: **19 migrations**.

Also learned: `sql/bootstrap-postgres-ruvector.sql` requires `-v lifeos_runtime_role=<role>`
and otherwise `\quit`s **with exit status 0**, so it reports success while doing nothing.

**Concurrent writer warning:** `0016_cow_blob_object_v2_compatibility.sql` appeared in the
migrations directory at 01:55 during this session, untracked and not written by this run.
Another process is editing the same migration set.

## Blueprint-ordered execution state

| Blueprint section | State |
|---|---|
| HARD RULES 1–21 | This ledger (governing frame, above). |
| §1.1 Bootstrap import | RUNNING — pass-2 byte sweep, 185 roots, release codedb, operator policy v1 (`allow_extended=configuration,unknown`, `classifier_uncertain=persist-raw`). |
| §1.2 Operational phase | Release-gated; begins at cutover (rules 3–4). |
| §2 Host ALL-data contract | Enforced by §1.1 sweep + declared-exclusion ledger at closure. |
| §3 Front door (3.1–3.5) | Glass=Svelte done in-repo; PTY embed, mmap projection pins, `rtk_nu`/ingest-envelope release pins = required work (R02/R05/R17/R18). |
| §4–§5 component scopes, secret lifecycle | envctl on PATH; secret-class bytes flow through §5 path, never plaintext blob tables. |
| §17 install/activation order | Walk IN PROGRESS this run. Step 3: PG **17.10** ✓ (data_checksums=off and WAL archive=off → restart-gated required work). Step 4: ruvector 2.0.1 live, real `<=>` result 0.025368156, `hnsw`+`ruivfflat` AMs present ✓. Step 5: **CLOSED 2026-07-28** — migrations 0011–0015 authored from §16's six SQL blocks (packaging: role preambles, idempotency guards, ownership alignment, 15 marker-guarded legacy renames to `*_pre_s16`; blueprint statements verbatim otherwise), dress-rehearsed green on a live-schema clone AND from empty, applied live: **15/15 migrations, 199 lifeos_\* tables, 184 RLS-enabled**; sqlx ledger rows recorded with SHA-384 checksums. Step 7: negative capability proof done (`lifeos_worker` INSERT → permission denied; `lifeos_envctl` raw SELECT denied — capability is function-mediated per §5); plugin registration + ingest-envelope round trip next. Step 8: §1.1 sweep running. |
| Import/transformation/export/release contract | Byte-level verification at sweep closure (materialize round-trip probes + FS↔DB reconciliation). |
| 19 acceptance invariants | Gate set for closure report; invariant-13 note: `archive_mode=off` flagged as required work. |

## §17 step-7 proofs executed 2026-07-28

| Requirement (step 7) | Result |
|---|---|
| Register `nu_plugin_codedb` through isolated Nushell configuration | ✓ registered in an isolated `--plugin-config`; `plugin list` → `codedb 0.1.0` |
| Typed round trip over the Nu/MessagePack plugin protocol | ✓ `open --raw envelope.json \| from json \| codedb ingest-envelope` → typed receipt `codedb.ingest-receipt.v0` |
| Raw-byte object linkage | ✓ receipt carries `blob_ref sha256:98ea6e…`, recomputed BLAKE3, exact `bytes=3` |
| Content deduplication | ✓ re-ingest → `deduplicated=true`, `dedup_hit_count=1` |
| Blob-store parity (redb vs PostgreSQL) | ✓ same file through `--store redb://…` and `--store pg` → identical `sha256 de375abc…`; in-database recompute `encode(digest(content,'sha256'))=sha256` → **true**, `bytes=30=octet_length(content)` |
| Plugin/agent roles cannot perform authoritative PostgreSQL writes | ✓ `SET ROLE lifeos_worker` INSERT into `lifeos_blob.object` → *permission denied*; `lifeos_envctl` raw SELECT on `lifeos_runtime.request` → *permission denied* (envctl capability is function-mediated per §5, not raw DML) |
| `rtk_nu` envelope emission | ✓ `rtk_nu --format json -- echo hi` emits `flexnetos.rtk_nu.envelope.v1` with identity/tenant/grant/lease/session/request/execution IDs (provisional until database-issued) |

## Blueprint-ordered execution record — 2026-07-28

Walked in document order from line 33. Everything below is measured, not asserted;
each row names the command or query that produced the evidence.

### §1.1 (line 37) — "the ordered bootstrap is recorded as database import sessions"

**BUILT.** `lifeos_blob.import_session` existed and was empty, and nothing could write
it: §16.3's canonical ingress `lifeos_runtime.ingest_event()` additionally requires an
`'ingest'`-scoped grant, a `lifeos_runtime.session`, a `lifeos_runtime.branch` and a
`lifeos_agent.witness_chain` — none existed, so the bootstrap had no recordable identity.
Migration **0020** seeds that chain and adds `open_import_session` / `close_import_session`.
Live proof: `sequence=1 envelope_digest_correct=true raw_object_verifies=true
raw_bytes_exact=true idempotent_reopen_same_row=true`.

### §2 (line 51) — host ALL-data contract, filesystem attributes

**BUILT AND RECONCILED.** CodeDB captured content bytes only and declared the rest a gap
in its own receipts (`"permission_capture": "gap_not_available_for_raw_blob"`). Migrations
**0021**/**0023** add the staging surface and a batched set-based converter;
`meta/var/ops/capture-host-filesystem.sh` collects; `convert-host-capture.sh` drives it in
per-batch transactions (101 batches).

| Requirement | Captured |
|---|---|
| files + directories | 1,986,708 |
| symlinks | 13,474 |
| tree entries | 2,000,200 |
| hard-link groups (device+inode, nlink>1) | 304,079 |
| modes / owners / mtimes missing | 0 / 0 / 0 |
| ACLs | 1,986,706 |
| extended attributes | 21 across 13 paths, values included |
| **unconverted** | **0** |

Reconciliation anti-joins on the deterministic idempotency key, so a duplicate and a miss
cannot cancel into a matching count.

### §2 (line 60) — chunking; objects above the 1 GB bytea limit

**BUILT.** 28 files totalling 36.7 GB exceed PostgreSQL's `bytea` limit; `store_bytes()`
only ever wrote inline, so those bytes were physically unstorable, and
`verify_object_internal()` reassembled via `string_agg` into a value subject to the same
limit — it could not verify precisely the objects that need chunking. Migrations **0022**
(chunked ingest + size-aware verification + Merkle root) and **0024** (append-only fix).
Proof: `finalize=true chunks=4 per_chunk_digests_ok=true merkle_root_recorded=true
verify_object=true reassembled_byte_exact=true`; tampering is **rejected outright** by
`prevent_chunk_rewrite` rather than merely detected.

### §3.4 (lines 104–112) — canonical Nu conversion contracts

**RELEASE-BLOCKING GAP PROVEN.** The literal line-108 contract fails:

```
rtk_nu --format json -- echo hi | from json | codedb ingest-envelope
→ codedb: invalid envelope JSON: missing field `files`
```

`rtk_nu` emits `flexnetos.rtk_nu.envelope.v1` (`completion, event_type, frames, metadata`)
modelling an **execution**; `codedb ingest-envelope` expects `codedb.ingest-envelope.v0`
(`{schema_version, files[]}`) modelling a **file set**. Different domains — no renaming
bridges them. R17/R18 record each component as implemented but never assert the pipeline;
this is the missing adapter. The plugin side is sound: a hand-built envelope round-trips
and returns a typed receipt with `deduplicated=true` on re-ingest.

### §3.5 / invariant 19 — atlas parser gate

**BUILT.** The blueprint requires parser checks stay green; none existed as code.
`scripts/verify-blueprint-diagrams.mjs`, wired as `bun run blueprint:diagrams` and into the
aggregate `check`. Result: **26 diagrams parsed, 24 D-headings, 0 failures**. (26 fences vs
24 D-headings is correct — the extras are the ecosystem map and the §18 graph.)

### §17 step 4 — RuVector feature set

**REBUILT, NOT YET ACTIVE.** Two-layer defect in `yazelix/packaging/ruvector_postgres.nix`:
`buildFeatures` omitted `ai-complete-v3`/`all-features-v3` (dropping `embeddings`,
`learning`, `gnn`, `routing`, and `sparse`/BM25), **and** `postInstall` overwrote pgrx's
generated install script with the checked-in 0.3.0 one — capping the bound surface at 191
functions regardless of what was compiled. Fixing only the first would have changed
nothing observable. Also required for a hermetic build: `ORT_STRATEGY=system`,
`ORT_LIB_LOCATION=${onnxruntime}/lib`, `ORT_PREFER_DYNAMIC_LINK=1` (ort-sys falls through
to static linking otherwise, and nixpkgs ships only `.so`). The generated script's single
invalid line — `DEFAULT JsonB(serde_json::json!({}))` — is now repaired rather than the
whole script discarded, with fail-closed guards. Result: **314 functions, up from 191**,
including `ruvector_embed`, `ruvector_mincut`, `pg_sparse_bm25`.
**Activation is restart-gated owner work**: profile rebuild + PostgreSQL restart +
`ALTER EXTENSION ruvector UPDATE`.

### CodeDB silently drops files above ~1.03 GiB — the worst finding for "every byte"

**PROVEN AND BEING REMEDIED.** CodeDB refuses files above ~1,110,059,084 bytes and
reports `status=complete` with `files_captured=0`, **no error, no `capture_gaps` row, no
`source_blobs` row**. Measured by isolating the 2.4 GB `.grit/registry.db` into its own
directory and capturing it alone: "complete", yet `max(bytes)` across both schemas was
unchanged and no matching blob existed. Every "wave ok" for a root containing such a file
was simultaneously true and misleading — the root succeeded, the large file vanished.

Exposure: **7 files / 14.10 GB** above the ceiling, of which **6 files / 12.31 GB** are
undeclared loss (the 7th is the PGDATA logfile, already declared).

Remedy: ingest through the §16 chunked path (migrations 0022/0024) via
`meta/var/ops/ingest-large-files.py`. Independent re-verification from a separate session:
**`chunked_objects=4  total=7704 MB  largest=3942 MB  verified_all=true`** — the database
re-derives each object's identity from what is actually stored, rather than trusting the
writer's own report.

### §16.3 procedure surface — exercised for the first time

| Invariant | Procedure | Result |
|---|---|---|
| 12 — SHAKE256 witnesses bind bytes/executions | `lifeos_agent.append_witness` | **WORKS** after 0040. `sequence=1`, 32-byte digests, `binds_canonical_object=true`, `head_matches_entry=true`, mismatched signature rejected (`bluff_rejected=true`). |
| 11 — COW branches isolate proposals | `lifeos_runtime.create_branch` | **WORKS.** Branch created, parent correctly linked. |
| 11 — witnessed merge gates | `lifeos_runtime.merge_branch` | **WORKS.** Gate created; does *not* hit the circularity below, because its witness record uses caller-supplied values. |

**0017 was incomplete — my defect.** Its generator matched only single-line
`digest(x,'shake256')` and silently skipped every multi-line call, leaving `append_witness`
broken; my verification query missed it too, because it searched for the same single-line
shape. Found only by *executing* the function. Fixed by **0040**, generated mechanically
from the deployed definition and anchored on the exact literal block — a first attempt with
a lazy multi-line regex spanned two different calls and would have disabled the sha256
signature check entirely.

### §3.2 path 6 — the canonical durable ingress is uncallable

**STRUCTURAL DEFECT PROVEN.** `lifeos_runtime.ingest_event()` requires the caller's
signature receipt to carry `signed_digest` equal to the witness digest — but that digest
covers `capture_payload`, containing `request_id` (generated inside the call),
`postgres_lsn` (from `pg_logical_emit_message` inside the call) and the object IDs assigned
inside the call. **The signature must cover values that only exist after signing.**

Live proof with a best-possible receipt (correct signer, correct signature digest):
`INGRESS_BLOCKED: signature receipt covers a different witness digest`.

No caller-side value resolves this. Resolution requires an architecture decision — two-phase
reserve-then-sign, signing a caller-determinable subset, or envctl signing server-side
inside the transaction (consistent with invariant 7) — so it is recorded as required work,
not silently patched.

**Consequence, stated plainly:** with §3.4's `rtk_nu`→`codedb ingest-envelope` mismatch,
**both specified ingress routes are non-functional as written.** What is actually carrying
the data is the bootstrap path — `codedb capture --store pg` plus the §16 chunked path.

### §4 component scopes (lines 588–626) — verified against the live system

| § | Component | Measured state |
|---|---|---|
| 4.1 | PostgreSQL + RuVector | **CONFORMANT** — PG 17.10, ruvector 2.0.1, 184 RLS-enabled `lifeos_*` tables |
| 4.2 | LifeOS Glass | **PARTIAL** — Svelte migration complete (23 components), but `portable-pty` does **not** appear in `src-tauri/Cargo.toml`: the Tauri PTY controller that embeds `yzx enter` is unbuilt (R02/R03 confirmed open) |
| 4.3 | Yazelix / Zellij | **CONFORMANT** — `yzx` present; zellij **0.44.3** pinned inside the yzx closure, matching the blueprint's pin. Absent from PATH by design, since `yzx enter` execs the pinned store path |
| 4.4 | Nushell / rtk / rtk_nu | Binaries present (rtk 0.43.0, rtk_nu) but the §3.4 pipeline does not compose — see above |
| 4.5 | nu_plugin / CodeDB | Present and carrying the import, but silently drops files >~1.03 GiB — see above |
| 4.6 | redb | Owner **running** (pid 1169710); the required read-only mmap projection is **absent** from its state dir |
| 4.7 | envctl | Binary present; the drain/embed/commit loop is unbuilt, and its canonical entry point `ingest_event` is uncallable — see above |
| 4.9 | flexnetos_runner | **MISSING from PATH** — the doctrine release gate ("the runner gate proves clean-shell bootstrap … no activation bypasses provenance") cannot execute at all |

### Capture recovery — four blocked roots, four distinct causes

| Root | Cause | Status |
|---|---|---|
| `meta/.kb` | GitKB daemon rewrites a fixed 1 MiB ring buffer every ~5 s | recovered, `rc=0` |
| `meta/src` | same, in `envctl/.kb` and `lifeos/.kb` two levels down | recursive decompose written; re-run pending |
| `meta/var/cargo-target` | concurrent Codex agent's live cargo builds delete artifacts mid-read | retry widened; needs a build-idle window |
| `meta/var/lib/codedb` | **capture policy lived inside its own capture target** — codedb correctly refuses this | recovered, `rc=0` |

`codedb` has no `--exclude` flag, so volatile leaves are handled by point-in-time snapshot
(with `kind=volatile-ring-buffer-point-in-time` provenance) plus recursive decomposition —
satisfying zero *undeclared* loss without mutating the tree or stopping any daemon.

## GOAL MEASUREMENT — 2026-07-28

Measured by `meta/var/ops/reconcile-bytes.sh` after all four blocked roots were recovered.
Reconciliation is by **path**, anti-joined against the filesystem, unioning both CodeDB
schemas plus canonical `lifeos_blob.object` rows carrying `provenance->>'host_path'` —
querying any one source alone under-reports and would report false loss.

```
filesystem: 1,785,724 files   470,738,358,849 bytes
database:   1,697,004 distinct captured paths
missing:      113,068 files   321,056,450,962 bytes
captured_byte_fraction = 31.80%
```

**The goal is not met.** Decomposition of the 321 GB:

| Category | Bytes | Files |
|---|---|---|
| PGDATA — declared exclusion, self-referential | 85.97 GB | 13,276 |
| This session's capture ledger + ingest spool | 3.27 GB | 130 |
| **Real gap** | **231.83 GB** | **99,652** |

Causes of the real gap, measured rather than assumed:

1. **Roots never swept — 96.26 GB / 54,385 files.** `wave-roots` enumerated only the
   *children* of `meta/var` and `meta/src`; both parents failed the original sweep and their
   recovery runs are absent from `waves.jsonl`, so files directly under those parents were
   never in any sweep's scope. **Being fixed now** by sweeping the parents themselves.
2. **Existed before capture yet absent — 121.72 GB / 40,664 files.** Dominated by `.cache`
   (77.74 GB) and `meta/.toolchains` (13.10 GB). Root cause is the operator capture policy:
   non-allowed source classes are stored **metadata-only** — path and hash recorded, bytes
   deliberately withheld. `.cache`'s own receipt: `status=complete_with_gaps`,
   `bytes_captured=50,902,412,133`, `files_captured=80,840`, `files_metadata_only=10,213`,
   with 91,053 `metadata-only` markers. Policy is
   `allow=source-code,documentation; allow_extended=configuration,unknown;
   classifier_uncertain=persist-raw` — anything classified *sensitive* is withheld.
   **This is a declared policy decision, not undeclared loss**, and it is §5-conformant
   (protected bytes belong in the secret lifecycle, not plaintext blob tables). It does mean
   "EVERY BYTE" is not literally satisfiable under the current policy. **Owner decision
   required**: widen the policy, or route those files through §5's secret path.
3. **Moving-edge drift — only 13.83 GB / 4,588 files.** The *smallest* cause, contrary to
   expectation. Verified case: `.cache/envctl/020f87dde051906f/state.json` mtime 04:18:51
   against its root's wave finishing 02:34:54.

**Self-inflation warning.** The filesystem grew from ~302 GB at session start to 470 GB,
largely because PGDATA itself reached 86 GB as the import proceeded. Importing a host into a
database stored on that host is self-inflating; PGDATA must remain a declared exclusion or
the measurement never converges. The same applies at smaller scale to `meta/var/lib/rtk/tee`,
which every `rtk` command — including the capture commands — writes into.

**Terminal state is convergence with declared residue**, per §19's reconciliation contract —
not "zero missing". A capture that logs its own activity into its own scope cannot drive
residue to zero.

## Live risk register (this run)

- **Ingress split-brain (found 2026-07-28, resolution scheduled):** pass-1 wrote
  `public.codebase_codedb_*` (564,933 blobs / 19 GB + 1.9 GB chunks + 1.586 M path_refs);
  pass-2 writes `lifeos_runtime.codebase_codedb_*` (45 k blobs so far). Cause: the
  db-level `search_path=lifeos_runtime,…` added between passes, and CodeDB creates its
  store with unqualified names. 33,165 sha256 overlap. Convergence step merges public →
  lifeos_runtime with `ON CONFLICT DO NOTHING`, verifies, then drops the public copies.
  **Every reconciliation query must union both schemas until the merge lands.**
- `lifeos-core` embedded `sqlx::migrate!` set now includes 0011–0015 and `cargo check -p
  lifeos-core` passes; the desktop binary must be rebuilt before the next Tauri launch.

- `flexnetos_runner` binary absent from PATH — release-gate execution (doctrine gate) blocked until built/installed. Required work.
- `.swarm/memory.db` (AgentDB) last write 2026-07-24; `ruflo` not on PATH — project memory is not capturing sessions. Required work under rule 15.
- WAL tuning active for bulk load (`max_wal_size=16GB`, `checkpoint_timeout=30min`) — revert and record at closure.
