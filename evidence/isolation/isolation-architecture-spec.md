---
title: LifeOS native envelope and host-control architecture
version: 1.1.0
status: ratified
authority: Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md
published: 2026-07-28
---

# LifeOS isolation architecture

This document is the tracked evidence authority for the currently implemented
Yazelix envelope. It is derived from the RuVector data-pipeline blueprint and
the live `yazelix/envelope/yzx-envelope.nu` engine. It replaces the deleted
planning-loop document surface; it does not create a task board, approval
record, or second source of truth. The immutable byte authority remains
PostgreSQL/RuVector for durable application state, while this file records the
execution boundary and its proof receipts.

## Ratification and reconciliation

The 2026-07-28 reconciliation compared the normative blueprint, the current
Nushell engine, the released bundle shim, and the focused live tests. The
result is ratified only for claims supported by those artifacts. Static-musl
and relocatable-closure claims are intentionally separated. The engine does
not claim that WebKitGTK, PostgreSQL/RuVector, bwrap, or host AppArmor policy
can be replaced by a static application binary. The packaging receipt at
`evidence/packaging/portable_release_packaging_decision.json` records those
trade-offs and the portable-release receipt records remaining host dependence.

## Two-brother control model — ARCHBP-058

The big brother is the LifeOS envelope and control plane. It may acquire host
resources on demand: a GPU, one device, a network namespace choice, or an
explicit durable bind. Acquisition is declared in the command line and is
visible in the resulting proof. Release is a clean-release: the envelope
process exits, private mounts unwind, the caller-owned durable root remains,
The envelope restores the prior host state during clean-release. The release is reversible, and the control plane never permanently
takes over Ubuntu.

The little-brother-always-functions invariant is non-negotiable. Ubuntu still
functions normally while LifeOS is absent or stopped; Ubuntu updates, reboots,
and runs its own daemons without LifeOS interference. A release or an
envelope failure cannot turn the host into a LifeOS-only appliance.

## Shared-kernel boundary — ARCHBP-060 (consumer ARCHBP-093)

The envelope uses Linux user, PID, IPC, UTS, network, mount, and device
namespaces through bubblewrap. The host kernel is shared. That is the reason
there is zero hypervisor latency in the hot path, and it is also the honest
limit: a host kernel upgrade and reboot can end LifeOS processes. Reboot ends LifeOS processes but never touches LifeOS state because state belongs to the
durable plane and is reopened by re-attach. Isolation and survival are
orthogonal concerns. Survival = durable state tier + clean auto-re-attach.

## Mount contract — ARCHBP-129

The private root is tmpfs, `/nix` is an explicit read-only bind, `$HOME` is a
fresh tmpfs, and `/durable/*` is caller-declared read-write bind state. `/proc`
and `/dev` are namespace-local surfaces. No `/run` path is implicitly bound.
The complete table and overlay-vs-bind decisions are in
`evidence/isolation/envelope_mount_design.json`; the path classifications are
in `evidence/isolation/isolation_tier_map.json`.

The `/nix` bind is parameterized. Default operation exposes the host profile's
store. Portable operation uses `--store` to expose the extracted closure from
the moved bundle. It is always read-only. The engine does not copy the store,
and it never treats a closure manifest as a replacement for the bytes that
the launcher actually executes.

## Tier contract — ARCHBP-059, ARCHBP-072, ARCHBP-073

Every known runtime path is exactly one of `volatile`, `durable`, or
`portable`. Volatile means tmpfs or reproducible scratch state: profile
runtime, rustup scratch, build temporary files, private home, and envelope
temporary files. Durable means persistent paths under `meta/var`: PostgreSQL,
RuVector, redb, ICM, runner work, and migrated XDG data. Portable means the
release closure and static release binaries. Nothing durable targets host
`/run`.

The current process environment is enumerated by
`scripts/enumerate-runtime-env.mjs` and committed at
`evidence/isolation/runtime_env_enumeration.json`. The enumeration records
known restart-gated durable residents on `/run` honestly; it does not convert
them into an authority source. `scripts/check-durable-not-on-run.mjs` passes
for clean targets and strict mode fails while that migration remains
restart-gated. A durable target regression is always a failure.

## Normative invariant ledger — ARCHBP-061

The complete ledger is `evidence/isolation/isolation_invariant_ledger.json`.
It is normative for this evidence surface and enumerates I01 through I17.
Every invariant has a statement, an acceptance predicate, at least one goal,
and one or more covered axes. The ledger covers isolation, persistence,
ownership, and portability. The following invariant IDs are directly consumed
by the engine README and acceptance gate: I03, I05, I06, I11, I12, I13.

## Per-goal conformance — ARCHBP-062

The acceptance surface is expressed as ten runnable conformance rows rather
than a detached planning task. Each row names a live proof and an invariant:

| ID | Live conformance proof | Invariants |
| --- | --- | --- |
| CT-G1 | shared-kernel and two-brother boundary review | I01, I02 |
| CT-G2 | enter, probe, teardown, and multi-envelope tests | I03, I05, I14 |
| CT-G3 | durable bind write and restart/re-attach contract | I06, I10, I16 |
| CT-G4 | tier map and runtime environment enumeration | I06, I07 |
| CT-G5 | home-owned residual guard and explicit migration receipt | I08 |
| CT-G6 | moved-prefix portable bundle and static artifact tests | I09, I17 |
| CT-G7 | durable-state survival and redb/PostgreSQL ownership tests | I02, I10, I16 |
| CT-G8 | GPU, network, and device acquire/release probes | I11, I12, I13 |
| CT-G9 | meta/var container-mount guard with violation fixtures | I15 |
| CT-G10 | release gauntlet and latency evidence | I04, I09, I17 |

The release gauntlet consumes
`evidence/packaging/portable_release_root_coverage.json`. A missing proof is
not upgraded to a pass by this document.

## Failure catalog — ARCHBP-063

The four known breakage classes are recorded in
`evidence/isolation/isolation_failure_modes.json`: unattended-upgrades and a
kernel swap, the tmpfs profile-runtime migration surface, home residuals, and
host docker or kvm container surfaces. The 2026-07-21 incident timeline records
kernel `7.0.0-28`, the 21:28 reboot, intact filesystem bytes, and lost
processes. The correct recovery is re-attach from durable state, not a silent
reconstruction or downgrade.

## Resource acquisition and release — ARCHBP-069, ARCHBP-070, ARCHBP-071

GPU access is absent unless `--gpu` is supplied. A single device is absent
unless `--device PATH` is supplied. Shared networking is the default explicit
choice; `--isolate-net` leaves loopback only. Each acquired surface is
namespace-scoped and is released when the envelope exits. The live tests prove
the no-GPU, GPU, shared-network, isolated-network, single-device, durable
write, and leakcheck cases.

The engine's README records I03, I05, I06, I11, I12, and I13. The acceptance
seal re-runs enter → observe → exit → leakcheck and checks that host home is
not visible. The engine source has no `/run` bind and uses `--tmpfs /`, so a
durable state path cannot become ambient through the envelope constructor.

## Ownership and container boundary — ARCHBP-082, ARCHBP-091

Known home residuals remain reported until the owner-gated restart migration
lands. The default home-owner guard fails only new residuals; strict mode
fails on any residual. This is honest transitional evidence, not completion of
the migration. The meta/var guard scans the live mount table and rejects
overlay lowerdirs or volume binds that reference `meta/var`; its fixture test
proves both violation classes.

## Re-attach and release rule

No process lifetime is a durable guarantee. The durable roots are mounted by
explicit caller declaration and are reopened after process loss. The portable
launcher is tested after the bundle prefix has moved. The receipt records the
remaining host dependencies and blocks a stronger claim than the evidence
supports. PostgreSQL/RuVector remains the canonical durable macro-state, redb
remains transient, and the envelope remains an execution boundary rather than
a competing storage authority.

## Activation evidence

The current proof set is executable from this repository. The focused
ARCHBP-021/134 packaging suite passes 7/7. The envelope engine's existing
focused tests cover enter, teardown, durable writes, resource acquire/release,
multi-session isolation, and leak detection. The production frontend build,
diagram parser, and blueprint ICM verifier are separate gates. This file is a
ratified, tracked evidence record, not a claim that any future host migration
or native installer work has already happened.
