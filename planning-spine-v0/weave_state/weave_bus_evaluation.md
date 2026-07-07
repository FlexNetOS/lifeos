# WEAVE-001 Weave Bus Evaluation

Observed: 2026-07-06T17:36:28Z

## Result

WEAVE-001 is complete as an evaluation and blocked for live adoption.

`src/weave` contains the expected local agent bus primitives, heartbeat model, and MCP surface. `yzx` is confirmed as the installed runtime owner, but neither the current clean pack environment nor plain `yzx run` expose a `weave` frontdoor, and the Rust toolchain is also absent from those proven invocation surfaces. That blocks runtime adoption proof from the live pack matrix until the binary is packaged or exposed through an owned frontdoor.

## Control Surface

| Surface | Current state |
| --- | --- |
| Active Sheet | `LifeOS Planning Spine v0 - Task Graph COMMENT RESET` |
| Task row | `Task Graph v0` row 27, `task_id=WEAVE-001` |
| Sheet next action | `Use weave as event bus only; task graph remains control plane.` |
| Target artifacts | `weave_state/weave_bus_evaluation.md`, `weave_state/weave_bus_evaluation.json`, `proof_records/WEAVE-001.proof.json` |
| Allowed paths | `weave_state/**`, `proof_records/**`, read-only repo inspection |
| Blocked paths | Production mutation or replacing task graph/proof ledger |

## Repository Snapshot

| Repo | Branch | HEAD | Remote | Status |
| --- | --- | --- | --- | --- |
| `src/weave` | `master` | `9605104b8c7418d9bb9a72e8ae1da0a100a3d4b2` | `git@github.com:FlexNetOS/weave.git` | clean |
| `src/lifeos` | `codex/lifeos-planning-spine-v0` | `6f8905d01701133d5dca5831a13fd3001dbb98ac` | `git@github.com:FlexNetOS/lifeos.git` | untracked planning-spine artifacts already present; WEAVE artifacts refreshed |

## Usable Message Primitives

Live source inspection shows these primitives are present in `src/weave`:

| Primitive | Evidence |
| --- | --- |
| Peer discovery and liveness | `weave peers`, `weave scan`, `weave sessions --watch`, `weave connect` in `src/weave/README.md:96-103` |
| Point-to-point messaging | `weave send`, `weave inbox`, `weave export`, backup/restore, session import/export in `src/weave/README.md:104-112` |
| Tracked request flow | `weave ask`, `weave answer`, `weave ack`, `weave asks`, `weave ask-get` in `src/weave/README.md:114-119` |
| Fan-out request flow | `weave ask-many`, `weave ask-many-result` in `src/weave/README.md:121-124` |
| Durable work queue | `weave job create/list/show/status/claim/dispatch/update/result/cancel` in `src/weave/README.md:126-136` |
| Presence state | `weave describe`, `weave status`, `weave daemon start/stop/status` in `src/weave/README.md:145-155` |
| Notification and delivery trace | `weave notify`, `weave delivery`, `weave inject` in `src/weave/README.md:157-163` |
| MCP surface | `weave_send`, `weave_inbox`, `weave_peers`, `weave_ask`, `weave_job_*`, `weave_notify`, `weave_delivery`, `weave_spawn_peer`, `weave_kill_peer` in `src/weave/README.md:311-324` |

## Heartbeat Support

The source supports heartbeat liveness:

| Capability | Evidence |
| --- | --- |
| Optional daemon | `weave daemon start|stop|status` in `src/weave/ARCHITECTURE.md:1174-1177` |
| Heartbeat interval | daemon calls `store.heartbeat` every 15 seconds in `src/weave/ARCHITECTURE.md:1179-1181` |
| Stale-row cleanup | daemon calls `store.evict_stale_presence(30)` every 60 seconds in `src/weave/ARCHITECTURE.md:1179-1181` |
| Store interface | `heartbeat`, `presence`, `evict_stale_presence`, and `peer_liveness` in `src/weave/weave-core/src/store.rs:643-672` |

Runtime heartbeat proof is blocked because the clean environment cannot resolve `weave`.

## Clean Environment Proof

Clean pack prefix used:

```bash
env -i HOME=/home/flexnetos USER=flexnetos LOGNAME=flexnetos PATH=/home/flexnetos/FlexNetOS/usr/bin:/home/flexnetos/.local/bin:/home/flexnetos/.nix-profile/bin:/run/current-system/sw/bin:/usr/bin:/bin bash --noprofile --norc -c 'set -eu; for c in weave envctl git-kb codex cargo; do if p=$(command -v "$c" 2>/dev/null); then printf "%s=%s\n" "$c" "$p"; else printf "%s=NOT_FOUND\n" "$c"; fi; done'
```

Exit status: 0

```text
weave=NOT_FOUND
envctl=/home/flexnetos/FlexNetOS/usr/bin/envctl
git-kb=/home/flexnetos/FlexNetOS/usr/bin/git-kb
codex=/home/flexnetos/.local/bin/codex
cargo=NOT_FOUND
```

## Installed Runtime Proof

Installed runtime identity:

```bash
env -i HOME=/home/flexnetos USER=flexnetos LOGNAME=flexnetos PATH=/home/flexnetos/.nix-profile/bin:/run/current-system/sw/bin:/usr/bin:/bin yzx inspect
```

Exit status: 0

```text
Runtime: /nix/store/dpp8f11dbpfgfxdb0c0k535vcxidgcyy-yazelix-flexnetos-foundation
Version: v17.9
Variant: mars
Generated state: noop
```

Plain Yazelix runtime command resolution:

```bash
env -i HOME=/home/flexnetos USER=flexnetos LOGNAME=flexnetos PATH=/home/flexnetos/.nix-profile/bin:/run/current-system/sw/bin:/usr/bin:/bin yzx run bash -lc 'for c in cargo rustc bun bunx felix kache wild-linker weave; do if p=$(command -v "$c" 2>/dev/null); then printf "%s=%s\n" "$c" "$p"; else printf "%s=NOT_FOUND\n" "$c"; fi; done'
```

Exit status: 0

```text
cargo=NOT_FOUND
rustc=NOT_FOUND
bun=/home/flexnetos/FlexNetOS/usr/bin/bun
bunx=/home/flexnetos/FlexNetOS/usr/bin/bunx
felix=NOT_FOUND
kache=/home/flexnetos/.local/bin/kache
wild-linker=NOT_FOUND
weave=NOT_FOUND
```

Additional clean envctl table proof:

```bash
env -i HOME=/home/flexnetos USER=flexnetos LOGNAME=flexnetos PATH=/home/flexnetos/FlexNetOS/usr/bin:/home/flexnetos/.local/bin:/home/flexnetos/.nix-profile/bin:/run/current-system/sw/bin:/usr/bin:/bin bash --noprofile --norc -c 'set -eu; envctl catalog tables --repo-root /home/flexnetos/FlexNetOS/src/envctl | sed -n "1,80p"'
```

Exit status: 0. Result: envctl reported 11 catalog tables, including `components`, `paths`, `settings`, `env_vars`, `agent_assets`, `registries`, `config_files`, `codedb_file_imports`, and `observed_facts`.

## Integration Guidance

Use Weave as a local event bus only. The Drive task graph and proof ledger remain the control plane. Do not replace Sheet rows, proof records, or comment coordination with Weave state.

Safe integration path:

1. Add a source-owned clean `weave` frontdoor through the runner/envctl packaging lane or workspace `usr/bin` wrapper.
2. Prove `env -i ... command -v weave`, `weave --version`, `weave doctor --json`, and a read-only `weave peers --json` or isolated store smoke from both the clean pack prefix and the intended Yazelix invocation surface.
3. Prove heartbeat with an isolated runtime path, for example `WEAVE_PIDFILE` and a temporary store, before any production daemon hookup.
4. Wire Weave only as event notification between agents; keep Drive comments, Sheet rows, and `proof_records/**` authoritative.

## Next Safe Task

Create a narrow packaging/frontdoor task: expose `src/weave` as a clean-prefix runtime command or a documented Yazelix invocation that also surfaces cargo/rustc as intended, then run an isolated clean-environment bus smoke that exercises register, send, inbox or notify, delivery, and daemon status without mutating production control paths.
