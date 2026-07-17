# ARCHBP-019 — Verify the newer upstream ruvnet VM reference

> Task: `ARCHBP-019` (phase 13-architecture-blueprint-execution; parents `INTEL-002`, `NBSOURCE-018`).
> Executes research item **S-5** of `../FOUNDATION_ECOSYSTEM_MAP.md` §7 and resolves the §5.3 caveat
> ("the owner referenced a *recently-created* ruvnet VM; nothing matching is in the local tree").
> Method: read-only queries against the DEC-016 canonical source handles
> (`../../yazelix_runtime_convergence/SUPPLY-CHAIN-DESIGN.md` §7.1) via authenticated GitHub REST,
> crates.io API, and the npm registry. Nothing was installed, built, or executed. Observed 2026-07-14/15 UTC.

## 1. Verdict (one paragraph)

The newer upstream ruvnet VM **exists and is identity-bound**: **`github.com/ruvnet/rvm`** — "RVM — The
Virtual Machine Built for the Agentic Age, in Rust." — a standalone repo created 2026-04-04, HEAD
`af97d18f29d5704f2fbbeecccce192d712bb9a80` (2026-05-23), executing the still-open EPIC
`ruvnet/RuVector#328` "RuVix Hypervisor Core — Coherence-Native Microhypervisor". It is the **same RVM
lineage already vendored locally** (identical "No KVM. No Linux. No VMs. Bare-metal Rust." contract), not a
different product. **It does not change the RuVix/RVM portability conclusion** (`../FOUNDATION_ECOSYSTEM_MAP.md`
§5.3): at the newest upstream state of BOTH lineages the target is still `aarch64-unknown-none` only, the WASM
guest ABI still has no POSIX/filesystem/exec, the hardware context switch is still unimplemented/stubbed, and
every release is a documentation/specification release with **zero binary assets**. Separately,
`github.com/ruvnet/optimizer` — the source cited by the Cognitum Seed device — returns **HTTP 404** and cannot
be bound to any public repository. The RuVector integration plan needs **no change**.

## 2. Search protocol (reproducible probe plan)

All probes are read-only. GitHub via authenticated `gh api`; crates.io via `curl` with a descriptive
`User-Agent` (their API policy rejects default UAs); npm via the public registry. Run dates: 2026-07-14/15 UTC.

| # | Probe | Command (all prefixed `rtk proxy`) |
|---|---|---|
| P1 | Cited source existence | `gh api repos/ruvnet/optimizer` ; `gh api repos/cognitum-one/optimizer` |
| P2 | VM-name sweep | `gh api "search/repositories?q=user:ruvnet+vm+in:name,description"` ; same for `ruvix`, `hypervisor`, `optimizer` |
| P3 | Recency sweep | `gh api "users/ruvnet/repos?sort=created&direction=desc&per_page=40"` ; `gh api "orgs/cognitum-one/repos?sort=created&direction=desc&per_page=40"` |
| P4 | rvm identity | `gh api repos/ruvnet/rvm` ; `…/commits/HEAD` ; `…/releases` ; `…/tags` ; `…/readme` ; `…/contents/.gitmodules` ; `…/contents/LICENSE` (404) |
| P5 | rvm capability | `gh api "repos/ruvnet/rvm/contents/Makefile?ref=af97d18f…"` ; `…/crates/rvm-sched/src/switch.rs` ; `…/crates/rvm-wasm/src/host_functions.rs` ; `gh api "repos/ruvnet/rvm/git/trees/af97d18f…:crates"` ; `gh api "search/code?q=repo:ruvnet/rvm+HARDWARE_SWITCH_IMPLEMENTED"` |
| P6 | Monorepo lineage | `gh api repos/ruvnet/RuVector` ; `…/commits/main` ; `…/commits?path=crates/ruvix` ; `…?path=crates/rvm` ; contents of `crates/rvm/{Makefile,crates/rvm-sched/src/switch.rs,crates/rvm-wasm/src/host_functions.rs}?ref=f3de1724…` ; `git/trees/f3de1724…:crates/rvm/crates` |
| P7 | crates.io | `curl -A "$UA" "https://crates.io/api/v1/crates?q=ruvix"` ; `?q=rvm-kernel` ; `/crates/ruvix-types/{0.1.0,owner_user}` ; `/crates/rvf-runtime/{0.3.0,owner_user}` |
| P8 | npm | `curl https://registry.npmjs.org/ruvix` ; `…/-/v1/search?text=maintainer:ruvnet&size=250` ; `…/@metaharness/host-rvm` |
| P9 | Local baseline | `git -C /home/flexnetos/meta/src/meta-ruvector log -1` ; `log -1 -- crates/rvm` ; direct reads of `crates/rvm/{Makefile,crates/rvm-sched/src/switch.rs,crates/rvm-wasm/src/host_functions.rs,README.md}` |

## 3. Exact identities found (source receipts — all VERIFIED FACT)

### 3.1 The VM: `github.com/ruvnet/rvm` (standalone)

| Field | Value |
|---|---|
| Repo | `ruvnet/rvm` — https://github.com/ruvnet/rvm (fork=false, archived=false, Rust, 119 stars) |
| Description | "RVM — The Virtual Machine Built for the Agentic Age, in Rust." |
| Created / last push | `2026-04-04T14:59:42Z` / `2026-05-23T09:31:58Z` |
| Default branch / HEAD | `main` / `af97d18f29d5704f2fbbeecccce192d712bb9a80` (2026-05-23T09:31:57Z, "fix(security): suppress RUSTSEC-2024-0436 + fix 6 npm CVEs in mcp docs server (#16)") |
| Releases | 6: v1.0.0 `2026-04-04T22:36:42Z` → v1.5.0 `2026-04-06T01:51:17Z` ("Complete Specification: 23 ADRs + Research Foundation") — **all 6 have 0 assets** (tag `v0.9.0-security` additionally exists, unreleased) |
| License | **No LICENSE file at HEAD** (`contents/LICENSE` → 404; API `license: null`) despite a README badge claiming "MIT OR Apache-2.0" |
| Submodules | `rudevolution` → `ruvnet/rudevolution`; `ruvector` → `ruvnet/RuVector`; `cuda-wasm` → `ruvnet/ruv-FANN` |
| Lineage anchor | README: "Part of the RuVector ecosystem. Uses RuVix kernel primitives and RVF package format. Designed for Cognitum Seed, Appliance, and future chip targets."; badge → EPIC `ruvnet/RuVector#328` "EPIC: RuVix Hypervisor Core — Coherence-Native Microhypervisor" (open, created 2026-04-04T14:21:47Z — the same day this repo was created) |
| Target ISA | `Makefile`: `TARGET = aarch64-unknown-none`; `QEMU = qemu-system-aarch64` — no other target in the build entrypoint |
| Crates (14) | rvm-boot cap coherence **gpu** hal kernel memory partition proof sched security types wasm witness (has `rvm-gpu`, lacks `rvm-checkpoint`) |
| WASM guest ABI | `rvm-wasm/src/host_functions.rs` `HostFunction` = **13 calls**: Send Receive Alloc Free Spawn Yield GetTime GetId + GpuLaunch GpuAlloc GpuFree GpuTransfer GpuSync — **no POSIX, no filesystem, no process-exec** |
| Hardware switch | `rvm-sched/src/switch.rs` at HEAD: no `HARDWARE_SWITCH_IMPLEMENTED` const (code search: 0 hits); doc-comment: "Actual register manipulation requires `unsafe` / inline assembly and is handled by the HAL crate. This module provides the **safe stub interface** and timing measurement scaffolding." — AArch64 EL2 (`VTTBR_EL2`) state |

### 3.2 The monorepo lineage: `github.com/ruvnet/RuVector` `crates/{ruvix,rvm}`

| Field | Value |
|---|---|
| Repo | https://github.com/ruvnet/RuVector — default `main`, pushed `2026-07-14T07:36:23Z`; HEAD `f3de1724fa5d8ff871ac24a528575f115b2a9df7` (2026-07-12T18:52:33Z) |
| `crates/ruvix` | exists; last path commit `eafba64fa54345b679a5b3f989580bc7d3f0b0cc` (2026-05-23T09:40:24Z) |
| `crates/rvm` | exists; last path commit `efa3d0976220a3873fdd2036d5c537af804ca89d` (2026-06-12T19:32:19Z) — **newer than the standalone repo's last push** |
| At HEAD `f3de1724` | `crates/rvm/Makefile`: `TARGET = aarch64-unknown-none`; `crates/rvm/crates/rvm-sched/src/switch.rs:37`: `pub const HARDWARE_SWITCH_IMPLEMENTED: bool = false;`; `HostFunction` = **8 calls** (Send…GetId, no GPU, no POSIX); crate set = 14 incl. `rvm-checkpoint`, no `rvm-gpu` |

### 3.3 Registries (owner-verified per DEC-016 handles)

| Artifact | Identity | Digest / date |
|---|---|---|
| crates.io `ruvix-*` | `ruvix-types`, `ruvix-hal`, `ruvix-dtb`, `ruvix-vecgraph`, `ruvix-dma`, `ruvix-cap` — all `0.1.0`, published 2026-03-14; owner_user = `ruvnet` (https://github.com/ruvnet) | `ruvix-types@0.1.0` sha256 `b15d7336559f05b8fe88d312d5465134fc65a101439096d01596323b6cb1ffcd`, not yanked |
| crates.io `rvm-*` | **none** (`q=rvm-kernel` → total 0) | — |
| crates.io `rvf-runtime` | `0.3.0`, owner_user = `ruvnet` | sha256 `6003ee0f408c5293e66c6718186a63978f9a271870a64197117ada273a0319f3`, created 2026-06-11T23:44:56Z, not yanked |
| npm `ruvix` | **Not found** | — |
| npm maintainer:`ruvnet` (361 pkgs) | only VM-adjacent hit: `@metaharness/host-rvm@0.1.2` — "RVM (Agentic Virtual Machine) **host adapter** for agent-harness-generator", maintainer `ruvnet`, created 2026-06-15T01:15:23Z | shasum `e014e6a2c91e47076afa24a20e32958a5c36e100` — an adapter, not the VM |

### 3.4 Local baseline (what the §5.3 conclusion was evidenced against)

| Field | Value |
|---|---|
| Checkout | `/home/flexnetos/meta/src/meta-ruvector` (origin `git@github.com:FlexNetOS/meta-ruvector.git`) — HEAD `b2e06780868c68aa53fe0169eeb577f2086b390c` (2026-07-07); `crates/rvm` last touched by `89596d0fca06f1c41a71e3adff0b6e5646d464e6` (2026-06-25) |
| State | `crates/rvm/Makefile:16` `TARGET = aarch64-unknown-none`; `crates/rvm/crates/rvm-sched/src/switch.rs:37` `HARDWARE_SWITCH_IMPLEMENTED: bool = false`; `HostFunction` = **8 calls**; 14 crates incl. `rvm-checkpoint` — **structurally identical to the monorepo lineage at upstream HEAD** |
| Correction | `../FOUNDATION_ECOSYSTEM_MAP.md` §5.2 says "7-call" WASM ABI; the actual `HostFunction` enum has **8** variants (Send Receive Alloc Free Spawn Yield GetTime GetId). Immaterial to the conclusion (still no POSIX/fs/exec), recorded for accuracy. |

## 4. What exists vs what does not

**Exists (bound above):** `ruvnet/rvm` (standalone VM repo); `ruvnet/RuVector` `crates/{ruvix,rvm}` (monorepo
lineage, fresher); crates.io `ruvix-*` 0.1.0 kernel-primitive crates and `rvf-runtime` 0.3.0 (owner `ruvnet`);
npm `@metaharness/host-rvm` 0.1.2 (adapter only).

**Does not exist (negative evidence, queried 2026-07-14/15 UTC):**
- `github.com/ruvnet/optimizer` → **HTTP 404**; `github.com/cognitum-one/optimizer` → **HTTP 404**. GitHub
  follows renames with redirects, so a public rename would not 404 — the cited repo is private, deleted, or
  never public. It **cannot be bound from official public sources**; the Cognitum Seed guide's citation
  (`vault_hub/COGNITUM-SEED.md:11,98`) stays an unresolved pointer.
- No standalone `ruvix` repo (`search user:ruvnet ruvix` → only `ruvnet/rvm`); no repo matching `vm` in
  name/description besides `rvm`; the 40 most-recently-created `ruvnet` repos (back to 2025-09-19) contain no
  other VM; `cognitum-one` org (8 repos) contains no VM.
- No `rvm-*` crates on crates.io; no `ruvix` npm package; no bare `rvm`/VM package among the 361
  `maintainer:ruvnet` npm packages.
- **Adjacent but not VMs:** `cognitum-one/ruOS` (HEAD `b1762a71bb1ad58b9175e2ae78ed454fed47b655`, 2026-07-02) =
  "Cross-compile & .deb packaging pipeline for **ruvultra Linux distribution**. amd64 + arm64." and
  `ruvnet/ruos-macair` (Shell, 2026-04-17) = a custom Linux image — Linux-distribution tooling, not
  hypervisors/VMs.

## 5. Capability matrix — the four §5.3 grounds at newest upstream state

| §5.3 ground | Standalone `ruvnet/rvm` @ `af97d18f` (2026-05-23) | Monorepo `RuVector` @ `f3de1724` (2026-07-12) | Ground still holds? |
|---|---|---|---|
| Wrong ISA (need x86_64) | `TARGET = aarch64-unknown-none` | `TARGET = aarch64-unknown-none` | **Yes** |
| Wrong runtime contract (need POSIX/fs/exec for `cargo`/`rustc`/`yzx`) | 13-call WASM ABI (8 core + 5 GPU); no POSIX/fs/exec | 8-call WASM ABI; no POSIX/fs/exec | **Yes** |
| Not executing real guests | switch.rs = "safe stub interface"; 6/6 releases have 0 binary assets (spec releases) | `HARDWARE_SWITCH_IMPLEMENTED = false` (switch.rs:37) | **Yes** |
| Not in the G3 release path | Nothing found adds rvm/ruvix to the G3 candidates | same | **Yes** |

Release maturity: v1.0.0→v1.5.0 shipped inside ~51 hours (2026-04-04→06), all documentation/specification
releases (v1.5.0 = "Complete Specification: 23 ADRs + Research Foundation"), zero binary assets, no LICENSE
file, standalone repo untouched since 2026-05-23 while the monorepo `crates/rvm` moved on (2026-06-12) —
**research-stage specification velocity, not shipping-runtime maturity**.

## 6. Claim disposition

| Claim | Disposition |
|---|---|
| "A newer ruvnet VM exists upstream" | **CONFIRMED** — `ruvnet/rvm`, created 2026-04-04, i.e. *after* the RuVector monorepo (2025-11-19) and standalone from it; identity and digests bound in §3.1. |
| "It is a different/newer product than the vendored RVM" | **REFUTED** — same lineage (same contract sentence, same crate family, submodules back to `ruvnet/RuVector`, EPIC #328); the monorepo copy the local tree mirrors is actually the *fresher* branch of the lineage (2026-06-12 > 2026-05-23). |
| "RuVix is a separate VM" | **REFUTED as a VM** — RuVix is the kernel-primitive crate family (`crates/ruvix`, crates.io `ruvix-*` 0.1.0) that RVM *uses*; EPIC #328 titles the hypervisor work "RuVix Hypervisor Core", but the only VM repo is `rvm`. |
| "github.com/ruvnet/optimizer is the Cognitum Seed's source" | **UNRESOLVED upstream** — 404 on both orgs; not bindable from public official sources (negative evidence recorded §4). The device-side citation remains, but no public identity exists to pin. |
| "The newer VM changes the RuVix/RVM portability conclusion (§5.3) or the RuVector integration plan" | **REFUTED** — every §5.3 ground holds at both upstream HEADs (§5); no new coordinates, targets, or runtimes exist to adopt. Plan unchanged. |

## 7. Architecture disposition (impact verdict)

1. **`FOUNDATION_ECOSYSTEM_MAP.md` §5.3 stands as final.** The caveat sentence ("warrants a separate upstream
   check before this conclusion is treated as final") is discharged by this document; S-5 (§7) is resolved.
2. **RuVector integration plan: no change.** The canonical coordinates remain the DEC-016 table; nothing found
   introduces an x86_64 host runtime, a POSIX guest ABI, or an executable release to integrate.
3. **Supply-chain caution (new, minor):** standalone `ruvnet/rvm` has **no LICENSE file** despite its README
   badge — if it is ever vendored, licensing must be clarified upstream first; prefer the monorepo lineage
   (which the local vendor already mirrors and which is fresher).
4. **Watch item (inference, not a finding):** `cognitum-one/ruOS` / "ruvultra" targets amd64+arm64 as a Linux
   distribution pipeline. It is not a VM and has no bearing on §5.3, but it is the only ruvnet/cognitum
   artifact aimed at an x86_64 host substrate; the G3/host-substrate track may want to track it separately.
5. **Doc correction queued:** §5.2's "7-call" should read "8-call" (§3.4); immaterial to any conclusion.

## 8. Verified fact vs inference

- **Verified fact:** every row in §3 (API responses, file contents at pinned SHAs, registry records with
  digests); every negative in §4 (exact queries + 404/empty results); every cell in §5.
- **Inference (flagged):** (a) that `ruvnet/rvm` *is* the artifact the owner referred to — it is the only VM
  in the canonical namespaces and matches "recently created", but owner intent itself is not machine-checkable;
  if the owner meant something else, only a private/unpublished source can satisfy the reference (the public
  namespace is exhaustively negative). (b) The ruOS watch item's potential relevance to the host-substrate
  track. Nothing else in this document is inferred.

## 9. Rollback

Per the task row: this document (and its proof record) are the only artifacts; remove/invalidate them if
upstream identity changes. No upstream code or runtime was installed, built, or executed.
