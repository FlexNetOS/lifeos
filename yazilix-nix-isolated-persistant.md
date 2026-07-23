# Yazelix–Nix Isolated & Persistent LifeOS

> **Target vision (owner-stated, 2026-07-21).** LifeOS is a Nix-flake-declared,
> self-contained userspace that behaves like a VM — the host is left alone — but
> runs as **native processes** sharing the host kernel, so there is **zero
> hypervisor latency**. The two systems are independent siblings:
>
> - **LifeOS = big brother.** It can, on demand, take authoritative control of
>   host resources it needs (desktop apps, daemons, the network controller, GPUs,
>   ports, update/power policy) — and it releases them cleanly.
> - **Ubuntu = little brother.** It can always function normally. It updates,
>   reboots, and runs its own daemons without LifeOS interference. (Proven this
>   session: user `drdave` updated with no issues after the reboot — the OS is
>   healthy; the only defect was LifeOS being *coupled* to the host session
>   lifecycle.)
>
> **Isolation is bidirectional and about lifecycle, not features:**
> OS updates (kernel, apt, unattended-upgrades, desktop) never alter, corrupt, or
> interrupt LifeOS. LifeOS updates never modify the host kernel, packages, `/etc`,
> or the host user environment. **This does NOT mean "no desktop apps, no daemons,
> no network control"** — those are retained and brought under LifeOS declared
> control, not removed.
>
> **Persistence:** everything must survive a reboot because LifeOS does not depend
> on the OS — it only *leverages* the OS through Nix. Canonical durable macro-state
> is PostgreSQL 17.10 + RuVector; redb is the transient plane; **every byte** is
> captured on LifeOS-owned durable storage.
>
> **Portability endgame:** during development LifeOS uses `/nix/store`; the real
> release ships **fully self-contained and portable**, running on a clean host with
> **no shared `/nix/store` and no Nix daemon** — the store closure travels *with*
> the app (relocatable/embedded closure or static-musl bundle).
>
> **The one honest boundary:** the kernel is shared — that is precisely what
> removes VM latency. So a host kernel-upgrade + reboot still *ends LifeOS
> processes*; it never touches LifeOS *state*. Survival = durable state tier +
> clean auto re-attach on boot. Isolation (namespaces) and survival (persistence +
> re-attach) are orthogonal, and LifeOS delivers both.
>
> Anchored to `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.

---

## The 10 Goals (end-states / invariants)

**G1 — Bidirectional lifecycle isolation.**
OS updates (kernel, apt, unattended-upgrades, snap, desktop) never alter, corrupt,
or interrupt LifeOS state or running work; LifeOS updates never modify the host
kernel, host packages, `/etc`, or the host user shell/environment. Both siblings
update and reboot on their own schedules without affecting the other.

**G2 — Native VM-grade isolation without hypervisor latency.**
LifeOS runs as native host processes inside a Nix-declared user-namespace envelope
(bubblewrap) that presents its own `/`, `/nix`, home overlay, and state mounts.
No hypervisor, no container daemon in the hot path; measured runtime latency equals
bare-native, not VM/Docker.

**G3 — Total survival / persistence (every byte).**
All LifeOS state — canonical macro-state in PostgreSQL 17.10 + RuVector, the
transient plane in redb, agent/session/tool state, secrets, and raw ingested bytes —
lives on durable, LifeOS-owned storage and survives any host reboot, kernel swap,
or desktop crash with **zero loss**.

**G4 — Self-owned runtime, never host `/run`.**
The LifeOS/yazelix runtime is declared and owned by Nix/yazelix at a LifeOS-owned
path. Nothing durable is parasitized onto the host systemd `/run/user/<uid>`
tmpfs. The volatile tier (caches, build scratch) stays ephemeral; the durable tier
stays persistent; the split is explicit, documented, and enforced.

**G5 — Single Nix-profile frontdoor, zero home residuals.**
Every LifeOS binary, runtime path, and active config resolves solely through the
one Nix profile. No home-owned residual (`~/.claude`, `~/.local/share/<tool>`,
`~/FlexNetOS`, host default shell) acts as an active owner. Path-law holds with
zero residuals and no accidental safety nets.

**G6 — Portable, store-independent release.**
The shipped LifeOS release is fully self-contained and runs on a clean host with no
pre-installed Nix daemon and no shared `/nix/store` (relocatable/embedded closure
or static-musl bundle). `/nix/store` is a dev-time dependency only; the release
carries its own closure.

**G7 — Clean auto re-attach on boot.**
After any host reboot, the LifeOS envelope re-materializes and re-attaches to its
durable state automatically (or via a single deliberate command), restoring
services (Postgres, redb, the Glass↔Engine Room front door) and resumable session
context — because a shared kernel ends processes but never state.

**G8 — Host-commandeer capability (big brother), with clean release.**
LifeOS can, on demand, take authoritative control of host-level resources it needs
(desktop apps, daemons, network controllers, GPUs, ports, update/power policy)
through a declared, auditable control plane — and it releases them cleanly so the
OS always resumes normal function. Control is intentional and reversible, never a
permanent hostile takeover.

**G9 — Declared services & devices under Nix control, not ad-hoc host daemons.**
Retained capabilities (the Omada network controller, any DB/daemon, desktop
integration) are packaged and supervised by Nix inside the envelope, not by ad-hoc
host Docker/KVM. Docker/VM stacks are migrated into Nix or disabled; `meta/var` is
never bind-mounted into any container.

**G10 — Insulated & governed OS-update policy.**
Host update mechanisms (unattended-upgrades, kernel installs, snap refreshes) can
never silently break LifeOS: they are gated or observed by LifeOS control plane
during active work, or rendered irrelevant by isolation + persistence + re-attach —
while the host remains free to update and reboot normally.

---

## The 10 Top-Level Tasks (make the goals real)

**T1 — Author the isolation architecture spec & invariant ledger.** -> *G1, foundation for all*
Formalize the two-brother model, the volatile/durable/portable tier map, the
shared-kernel boundary, and the acceptance invariants. Anchor to the RuVector
blueprint. Define, per goal, the conformance test that proves it (e.g., "host
`apt full-upgrade` + reboot leaves LifeOS state byte-identical").

**T2 — Build the bubblewrap user-namespace envelope in the yazelix Nix flake.** -> *G2, G8*
Ship a `yzx enter` / `nix run` sandbox that presents a private `/`, `/nix`, home
overlay, and durable-state mounts as native processes with no hypervisor. Define
entry/exit lifecycle, resource acquisition hooks, and the clean-release contract.

**T3 — Relocate the runtime off host `/run`.** -> *G4, G3*
Redeclare yazelix `profile-runtime` (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
`YAZELIX_STATE_DIR`, and peers) onto a LifeOS-owned persistent path via the flake.
Keep `volatile/` (caches, `cargo-target`, `tmp`, `rustup`) on tmpfs. Codify and
document the tier map so the classification can never drift again.

**T4 — Stand up the durable state plane (Postgres/RuVector + redb).** -> *G3, G9*
Bring PostgreSQL 17.10 + RuVector up as canonical macro-state on persistent
LifeOS storage (`meta/var/lib/...`), redb as the transient plane, with envctl as
the sole authoritative committer. Migrate agent/session/tool/secret state and raw
bytes into it; enforce byte-complete capture.

**T5 — Eliminate path-law residuals.** -> *G5, G4*
Via the envctl committer, finalize the XDG redirects and close every home-owned
owner: `~/.claude`, `~/.local/share/<tool>`, `~/FlexNetOS`. Re-point
`flexnetos_runner@.service` `_work` root off `~/FlexNetOS` into the profile/meta
tier so it stops re-materializing. Verify zero active home-owned owners remain.

**T6 — Migrate Omada into Nix; retire host Docker/KVM.** -> *G9, G8, G1*
Package the TP-Link Omada controller (Java + embedded Mongo) as a Nix-supervised
service inside the envelope with a durable datadir; cut over from the Docker
container, then remove the container. Disable the unused `libvirtd`/`qemu-kvm`
boot units. Assert `meta/var` is never bound into a container.

**T7 — Build the boot re-attach mechanism.** -> *G7, G3*
Provide a Nix/systemd(user)-declared unit that, on login/boot, re-materializes the
envelope, re-attaches durable mounts, restarts services (Postgres, redb, front
door), and re-exposes resumable session context. Idempotent, single-command
recovery; verified against a cold reboot.

**T8 — Implement the host-control plane (big brother).** -> *G8, G10*
Build the declared, audited interface by which LifeOS acquires and releases host
resources (desktop, daemons, network, GPU, ports, update/power policy) with
guaranteed clean-release semantics so the OS returns to normal. Wire the LifeOS
Glass (Tauri/Svelte) <-> Yazelix Engine Room (`yzx enter`/Zellij) front door to it.

**T9 — Govern the OS-update lifecycle.** -> *G10, G1*
Insulate LifeOS from `unattended-upgrades`/kernel/snap changes: gate or observe
them through the control plane, hold desktop-breaking packages during active work,
and make reboots deliberate. Prove the host still updates and reboots normally
(the `drdave` path) with LifeOS unaffected.

**T10 — Produce the portable release & prove isolation end-to-end.** -> *G6, G1, G2, G7*
Deliver `nix bundle` / static-musl / relocatable-store packaging that runs with no
shared `/nix/store`. Run the full acceptance gauntlet: host update + reboot with
zero LifeOS loss; LifeOS update with zero host change; native-latency benchmark vs
bare metal; and a complete survival + auto re-attach test.

---

### Goal -> Task coverage matrix

| Goal | Primary tasks |
|------|---------------|
| G1 Bidirectional isolation      | T1, T6, T9, T10 |
| G2 Native VM-grade, no latency  | T2, T10 |
| G3 Total persistence            | T3, T4, T7, T10 |
| G4 Self-owned runtime           | T3, T5 |
| G5 Single profile, no residuals | T5 |
| G6 Portable release             | T10 |
| G7 Auto re-attach on boot       | T7, T10 |
| G8 Host-commandeer (big brother)| T2, T6, T8 |
| G9 Nix-supervised services      | T4, T6 |
| G10 Governed OS-update policy   | T8, T9 |
