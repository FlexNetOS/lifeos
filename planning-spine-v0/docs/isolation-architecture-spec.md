# LifeOS Isolation Architecture Specification

- version: 1.0.0
- status: ratified
- ratified: 2026-07-22
- review basis: the 2026-07-22 yzx-iso vs planning-spine reconciliation
  (`tasks/yzx-iso/reconciliation-index` — per-task verdicts recorded in
  GitKB with the strict done-in-spine basis), applied to the planning spine
  in commit `1af25ec`.
- owner brief: `yazilix-nix-isolated-persistant.md` (owner-stated target
  vision, 2026-07-21; goals G1–G10, tasks T1–T10).
- architecture anchor:
  `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`
  (normative data-pipeline authority; PostgreSQL 17.10 + RuVector is the
  canonical durable macro-state and Swarm Primary Runtime; redb is the
  transient plane; envctl is the sole authoritative committer).
- machine-readable companions (normative, versioned with this spec):
  - `planning-spine-v0/docs/isolation_invariant_ledger.json`
  - `planning-spine-v0/docs/isolation_tier_map.json`
  - `planning-spine-v0/docs/isolation_failure_modes.json`

This document is the stable authority the yzx-iso lanes T2–T10 reference.
Referenced by: `tasks/yzx-iso/t1-0-lane-index`,
`tasks/yzx-iso/t2-0-lane-index`, `tasks/yzx-iso/t3-0-lane-index`,
`tasks/yzx-iso/t4-0-lane-index`, `tasks/yzx-iso/t5-0-lane-index`,
`tasks/yzx-iso/t6-0-lane-index`, `tasks/yzx-iso/t7-0-lane-index`,
`tasks/yzx-iso/t8-0-lane-index`, `tasks/yzx-iso/t9-0-lane-index`,
`tasks/yzx-iso/t10-0-lane-index`.

---

## 1. The two-brother control model (ARCHBP-058)

LifeOS and the host Ubuntu are **independent siblings**, not a guest and a
hypervisor.

**LifeOS is the big brother.** It can, on demand, take authoritative control
of host resources it needs — desktop apps, daemons, the network controller,
GPUs, ports, update/power policy — through a declared, audited control
plane. Acquisition is never ambient: LifeOS must **acquire** a resource
explicitly, and every acquisition records the prior host state before
control is taken (invariant I11).

**Every acquire has a clean-release.** Releasing a resource
restores the prior host state exactly as recorded at acquisition (I12).
Controls are **reversible** and time-bounded — a takeover is intentional
and temporary, never permanent or hostile.

**Ubuntu is the little brother, and the little-brother-always-functions
invariant is normative (I13):** the host OS always functions normally. It
updates, reboots, and runs its own daemons on its own schedule without
LifeOS interference — proven empirically on 2026-07-21, when user `drdave`
updated and rebooted the host cleanly while the only real defect was LifeOS
state being *coupled* to the host session lifecycle.

Consumed by the host-control lane `tasks/yzx-iso/t8-0-lane-index`
(control-plane implementation: ARCHBP-101..108).

## 2. Runtime path tier map (ARCHBP-059)

Every runtime env var and state path is classified into exactly one tier in
`isolation_tier_map.json` so the classification cannot drift:

| Tier | Meaning |
|---|---|
| volatile | Ephemeral by design (tmpfs); loss on reboot is correct behavior. |
| durable | Persistent LifeOS-owned state; survives any reboot byte-identically. |
| portable | Travels with the released closure; store-independent at release. |

The governing rule is **`nothing-durable-on-host-run`** (invariant I06):
nothing durable may live on the host systemd `/run` tmpfs. Entries whose
*current* location still violates the rule (the tmpfs `profile-runtime`
tree holding `CLAUDE_CONFIG_DIR` and `CODEX_HOME`, the `~/.claude`
transcript residual, the runner `_work` root) are recorded honestly with
`misplaced: true` and a durable target path — hiding the violation would
recreate the 2026-07-21 loss. Caches, `cargo-target`, build tmp, and rustup
toolchains stay correctly volatile (invariant I07).

The tier map feeds the runtime-relocation lane
`tasks/yzx-iso/t3-0-lane-index` (ARCHBP-072..077, ARCHBP-131).

## 3. The shared-kernel boundary (ARCHBP-060)

The one honest limit: **the kernel is shared**. LifeOS processes are native
host processes inside a Nix-declared user-namespace (bubblewrap) envelope —
no hypervisor, no container daemon in the hot path — and that shared kernel
is precisely the source of **zero hypervisor latency** (invariants I03,
I04).

The consequence is stated without euphemism: a host kernel upgrade plus
**reboot ends LifeOS processes**. It **never touches LifeOS state** — the
durable tier is untouched by design (invariants I01, I05).

**Isolation and survival are therefore orthogonal concerns:**

- *Isolation* (namespaces, the envelope, the control plane) protects the
  two siblings from each other while both run.
- *Survival* protects LifeOS across the reboots the shared kernel makes
  inevitable. **Survival = durable tier + re-attach**: every byte on
  LifeOS-owned durable storage, plus clean automatic re-materialization and
  re-attachment on boot (invariant I10).

Referenced by the boot re-attach lane `tasks/yzx-iso/t7-0-lane-index`
(ARCHBP-093..100).

## 4. Invariant ledger (ARCHBP-061)

The normative invariant ledger is `isolation_invariant_ledger.json` —
seventeen numbered invariants, each with an acceptance predicate and its
G1–G10 goal mapping, covering the four axes isolation, persistence,
ownership, and portability:

| Id | Invariant (abbreviated) | Goals |
|---|---|---|
| I01 | Host updates never alter/corrupt/interrupt LifeOS durable state | G1 |
| I02 | LifeOS updates never modify host kernel/packages//etc/user env | G1 |
| I03 | Native processes in a user-namespace envelope; no hypervisor path | G2 |
| I04 | In-envelope latency equals bare-native | G2 |
| I05 | Every byte of LifeOS state on LifeOS-owned durable storage | G3 |
| I06 | Nothing durable on host /run | G4 |
| I07 | Volatile tier stays ephemeral on tmpfs | G4 |
| I08 | Zero home-owned active owners; single Nix-profile frontdoor | G5 |
| I09 | Release runs on a clean host: no Nix daemon, no shared /nix/store | G6 |
| I10 | Envelope re-materializes and re-attaches after any reboot | G7 |
| I11 | Acquisition only via the declared control plane, prior state recorded | G8 |
| I12 | Clean release restores recorded prior host state; reversible | G8 |
| I13 | Little brother always functions | G8, G1 |
| I14 | Retained services Nix-supervised, not host docker/KVM | G9 |
| I15 | meta/var never bind-mounted into a container | G9 |
| I16 | Host update mechanisms gated/observed during active work | G10 |
| I17 | The portable release carries its own closure | G6 |

The ledger is merged as normative: a conflicting implementation is invalid,
and every conformance test below is defined against these invariant ids.

## 5. Per-goal conformance tests (ARCHBP-062)

Each goal G1–G10 has a named, concrete, runnable conformance test. A goal
is proven only by its test passing — never by assertion.

| Test | Goal | Proves invariants | Definition | Runner lane |
|---|---|---|---|---|
| CT-G1 host-upgrade-reboot-zero-loss | G1 | I01, I05 | Run `apt full-upgrade` + reboot on the host with LifeOS live; the LifeOS durable tier is byte-identical afterward. | ARCHBP-113/117 |
| CT-G2 native-latency-benchmark | G2 | I03, I04 | Benchmark the workload suite in-envelope vs bare-native; delta under 2%. | ARCHBP-120/130 |
| CT-G3 kill-reboot-byte-identical | G3 | I05 | Kill LifeOS uncleanly, reboot; PostgreSQL/RuVector, redb, and state verified byte-identical (WAL/crash replay allowed). | ARCHBP-132/133 |
| CT-G4 no-durable-on-run | G4 | I06, I07 | CI check fails if any durable var or tier-map entry targets host /run; volatile entries proven tmpfs. | ARCHBP-075 |
| CT-G5 zero-home-owners-sweep | G5 | I08 | Full sweep proves no home-owned active owner remains; CI guard enforces it. | ARCHBP-082/083 |
| CT-G6 clean-host-boot | G6 | I09, I17 | Boot the released bundle on a clean host with no Nix daemon and no /nix/store; RPATH/ldd audit clean. | ARCHBP-134 lane (t10-3/t10-4) |
| CT-G7 cold-reboot-reattach | G7 | I10 | Automated harness cold-reboots and asserts full envelope re-materialization, service restart (postgres → redb → front door), and session resume. | ARCHBP-099/100/135 |
| CT-G8 acquire-release-cycle | G8 | I11, I12, I13 | Cycle acquire/release across every registered host resource; host state equals pre-acquire snapshots; OS functions normally throughout. | ARCHBP-107/108 |
| CT-G9 nix-omada-no-docker | G9 | I14, I15 | Omada serves under Nix supervision with docker/containerd/libvirt/qemu units off; container-mount scan finds no meta/var. | ARCHBP-091/092 |
| CT-G10 governed-update-hold | G10 | I16 | With a live session, kernel/snapd/accountsservice upgrades hold and auto-reboot is off; with no session the host updates and reboots unassisted (the drdave path). | ARCHBP-113/114/117 |

The complete gauntlet (CT-G1..CT-G10 executed end-to-end against a release
candidate) is handed to the release lane
`tasks/yzx-iso/t10-0-lane-index` (ARCHBP-118..120, ARCHBP-134/135).

## 6. Failure-mode catalog (ARCHBP-063)

What breaks isolation **today** is enumerated in
`isolation_failure_modes.json`: eight failure modes (FM-01..FM-08), each
with a root cause and an owning spine task, spanning the four known
breakage classes — the unattended-upgrades kernel swap, in-session desktop
package upgrades, the tmpfs profile-runtime, home residuals, the host
docker/KVM stacks, volatile journald, the unsandboxed agent shell, and the
missing boot re-attach.

The catalog embeds the **2026-07-21 reboot incident** verbatim (timeline
06:31 kernel swap → 19:44 snapd/accountsservice/desktop upgrades → 21:28
reboot into 7.0.0-28; filesystem intact, tmpfs wiped, durable transcripts
survived) as the empirical ground truth these failure modes are derived
from. It feeds the residual-elimination lane (T5), the service-migration
lane (T6), and the update-governance lane (T9).

## 7. Ratification and versioning (ARCHBP-064)

- This spec is **version 1.0.0**, status **ratified**, published at
  `planning-spine-v0/docs/isolation-architecture-spec.md` and versioned in
  the repository alongside its three machine-readable companions.
- The review record is the 2026-07-22 reconciliation
  (`tasks/yzx-iso/reconciliation-index`): every T1 leaf carries a
  per-task verdict (genuine-new vs covered-in-spine) recorded against the
  strict proof-record basis, and the resulting lane structure was applied
  to the planning spine as ARCHBP-049/058..064.
- The owner-stated brief `yazilix-nix-isolated-persistant.md` (2026-07-21)
  is the source of the goals and target vision; this spec is its normative,
  testable form. Changes require a new version and a fresh ratification
  record — silent edits to a ratified version are invalid.
- All ten yzx-iso lane indexes (T1–T10) reference this spec as their
  stable authority (see the reference list in the header).
