# Yazelix Runtime Convergence Plan

## Objective

Converge the four Yazelix repositories, the active Nix/Yazelix profile, Codex,
Claude, RTK TokenKill, envctl agent-env, Meta fleet control, and Nushell onto one
source-to-runtime ownership chain without collapsing Meta's independent peer
repositories into a monorepo.

The four indexed repositories are:

1. `/home/flexnetos/meta/src/yazelix`
2. `/home/flexnetos/meta/src/yazelix-helix`
3. `/home/flexnetos/meta/src/yazelix-yazi-assets`
4. `/home/flexnetos/meta/src/yazelix-terminal-support`

The request's `agent-eng` spelling is treated as `agent-env`: source inspection
found the built-in `envctl-agent-env` crate, `envctl agent` command family,
`agent-env.yaml`, and `agent-env.lock`, but no `agent-eng` binary or symbol.

## Non-negotiable target state

1. **One install owner and one active profile closure.**
   `/home/flexnetos/.nix-profile` is the only interactive Yazelix/toolchain
   frontdoor. The XDG Nix profile may retain normal generation history, but it
   must not select a different active closure or appear as a second PATH owner.
   Home Manager, if retained, is packaged inside the same foundation element;
   it is not a second profile element.
2. **Yazelix input/output separation.** User-editable source lives under
   `/home/flexnetos/.config/yazelix`; generated runtime material lives under
   `/home/flexnetos/.local/share/yazelix`; the active launcher is
   `/home/flexnetos/.nix-profile/bin/yzx`. Generated runtime is proof, never an
   edit surface.
3. **Codex binary and state are not conflated.** The binary resolves from
   `/home/flexnetos/.nix-profile/toolbin/codex` into the same immutable
   foundation closure. Codex's real runtime/state home remains
   `/home/flexnetos/.codex`. The active `config.toml` is materialized from a
   reviewed Yazelix-owned editable input rather than maintained as an unrelated
   handwritten authority.
4. **Claude mirrors the same model.** The Claude binary is profile-owned, its
   real runtime/state home remains `/home/flexnetos/.claude`, and active settings
   are materialized from the same reviewed Yazelix/envctl ownership chain.
5. **Nushell owns the interactive shell contract.** The canonical implementation
   is `/home/flexnetos/meta/src/yazelix/nushell/config` and its packaged copy.
   Host and Yazelix sessions load that contract through the single profile.
   `rtk-tokenkill` exposes and selects a documented `nu_shell` mode.
6. **No orphan shell route.** Every retained Bash, POSIX `sh`, or Zsh launcher is
   either deleted as stale or represented by a native Nushell command/extern
   with an explicit boundary test. No shell wrapper is an alternate owner.
7. **Meta keeps dual mode.** `meta git` owns fleet Git inspection/coordination;
   `meta exec -- ...` owns arbitrary fleet fan-out. Each peer still supports
   its own local Git, issue tracker, tests, releases, and commits.
8. **envctl is native and fleet-aware.** Its native binary is available through
   the single profile. Meta owns a preview-first fleet policy that gives every
   selected peer either an explicit agent-env config or an explicit exclusion.
   Apply is a reviewed step, never inferred from preview.
9. **Child ownership remains narrow.** Helix owns its managed-config/editor
   bridge, Yazi Assets owns rendered assets, and Terminal Support owns terminal
   metadata/detection. Main Yazelix consumes pinned child revisions and owns
   runtime composition.
10. **Kache is the only cache authority.** Agent and workspace package, build,
    compiler, runner, and temporary caches are disabled or mediated by Kache.
    The Nix store and the one Yazelix profile remain install/runtime ownership
    surfaces; they are not competing cache-control paths.
11. **Agents execute shell actions only through Nushell.** Every agent launcher,
    hook, harness, and repository operation enters through the profile-owned Nu
    binary. Bash, `sh`, Zsh, Fish, and Xonsh are owner-only tools. An agent may
    use one only after a system crash and only with owner-authorized emergency
    approval tied to that incident and removed after recovery.
12. **Repository state is published, merged, and removed deliberately.** Every
    valuable worktree and stash becomes a normal commit and pull request—never
    a cherry-pick—before merge. Existing `main`, `master`, and `develop` refs
    are synchronized with origin, then merged branches, worktrees, and stashes
    are purged only after their published receipts prove preservation.
13. **Yazelix portability claims are artifact-proven.** Eligible Rust binaries
    are tested against `x86_64-unknown-linux-musl`; GUI, Nix, native, and
    glibc-only dependencies receive an explicit closure or bundle disposition.
    Static or no-`/nix/store` claims are forbidden without executable proof.
14. **Home Manager remains inside the one install owner.** It is consumed by
    the same `lifeos_foundation_yzx` profile element, owns reviewed desktop and
    layout projection, and may not create a second profile, generated-runtime
    edit surface, or user-local launcher shadow.

## Current contradictions that drive the graph

- `~/.nix-profile` and `~/.local/state/nix/profiles/profile` resolve to different
  store profiles even though each lists one `lifeos_foundation_yzx` element.
- Codex and Claude binaries are correctly profile-owned, but active config files
  are direct files under `~/.codex` and `~/.claude` with no proved Yazelix input
  lineage.
- Codex doctor proves its real runtime home is `~/.codex`, so moving state into a
  config tree would be incorrect; only config authorship/materialization moves.
- Active standalone Nushell config is a symlink into
  `meta/src/envctl/home/.config/nushell/config.nu`, while Yazelix runtime config
  is generated separately. That is split shell authority.
- envctl is absent from the active profile. Meta exposes it through a generated
  `/bin/sh` wrapper at `meta/usr/bin/envctl` that delegates to a native binary.
- Agent-env lock/sync succeeds for the envctl peer through `meta exec`, but the
  same commands fail at the Meta root because no fleet `agent-env.yaml` exists.
- RTK 0.43.0 has no `nu_shell` field in its active config or source search.
- The staged Yazelix RTK module covers `meta` but not `envctl`, `grit`, `icm`,
  `weave`, or `nix`; it also exposes npm/npx/pnpm routes despite the Bun/Bunx
  foundation policy.
- Bash, POSIX, and Zsh launch surfaces remain in main Yazelix and Meta-installed
  wrappers. They need classification, migration, and executable proof rather
  than blanket deletion.
- Canonical and stale/worktree/runner flake copies coexist under `meta/src`.
  They must be classified through Meta inventory before any retirement.
- Kache is packaged by Yazelix, but current fleet and runner configuration does
  not yet prove that package, build, compiler, runner, and temporary caches all
  route through it or that competing cache authorities are disabled.
- Agent guidance contains Nushell routes while active `.sh` launchers, hooks,
  tests, and cleanup scripts remain. No executable negative gate yet prevents
  an agent from invoking an alternate shell without the owner's crash-specific
  emergency approval.
- The fleet currently contains dirty worktrees, stashes, ahead/behind branches,
  missing upstreams, and open pull requests. Those are preserved work inputs,
  not disposable residue, until each has a published merge or owner disposition.
- The architecture blueprint requires musl portability, but the current package
  has no executable matrix separating eligible static Rust binaries from GUI,
  Nix, native, or glibc-only dependencies and no proved fallback closure.
- Home Manager appears only as an input to the broad profile-convergence task;
  no dedicated test currently proves it is inside the one foundation element or
  that its desktop projection cannot become a parallel owner.

## Execution waves

### Wave 0 — Freeze authority and evidence

`YZXCONV-001` and `YZXCONV-002` preserve the graph baseline and ratify exact
input, generated-output, state-home, profile, and peer ownership boundaries.

### Wave 1 — Remove split owners

`YZXCONV-003` through `YZXCONV-008` converge the Nix profile, Codex, Claude,
envctl, fleet sync, and Meta dual-mode contract. Mutating profile or global
agent config requires explicit owner approval and rollback receipts.

### Wave 2 — Make Nushell complete

`YZXCONV-009` through `YZXCONV-012` implement RTK `nu_shell`, a native Nushell
command catalog, legacy-shell retirement/classification, and Nu coverage for
Meta, Grit, ICM, Weave, envctl, Nix/flake operations, and canonical old-flake
migration commands.

### Wave 3 — Recompose and prove the four-repo runtime

`YZXCONV-013` pins child-repo ownership and consumption. `YZXCONV-014` rebuilds
and installs one proven foundation closure, materializes generated runtime, and
checks Codex/Claude/Nu/envctl/terminal behavior. `YZXCONV-015` reindexes all four
repos, runs fleet and peer-local status checks, and closes only with complete
proof and a clean, reviewable per-repo finish state.
`YZXCONV-021` proves the eligible musl artifact set and an honest portable
fallback for the non-musl closure. `YZXCONV-022` makes Home Manager and the
desktop launch contract part of the same profile owner.

### Wave 4 — Enforce cache, shell, agent-env, and repository closure

`YZXCONV-016` makes Kache the sole cache authority. `YZXCONV-017` makes
profile-owned Nushell the sole agent shell and gives the owner exclusive
control of any crash-only emergency fallback. `YZXCONV-018` encodes these tasks
and the musl/Home Manager gates in envctl agent-env. `YZXCONV-019` publishes,
reviews, merges, syncs,
and purges all worktree, stash, branch, and pull request state without
cherry-picking. `YZXCONV-020` is the independent final closure gate.

## Requirement-to-task coverage

| Requested concern | Owning tasks |
| --- | --- |
| Code intelligence on all four Yazelix repos | `YZXCONV-001`, `YZXCONV-013`, `YZXCONV-015` |
| `yazelix/nushell/config` | `YZXCONV-010`, `YZXCONV-011`, `YZXCONV-014` |
| One Nix profile, not split profiles | `YZXCONV-003`, `YZXCONV-014` |
| Codex and Claude configs in wrong place | `YZXCONV-004`, `YZXCONV-005` |
| Codex binary and real runtime home | `YZXCONV-004`, `YZXCONV-014` |
| envctl/agent-env binary and Meta sync | `YZXCONV-006`, `YZXCONV-007` |
| `meta git` / `meta exec` central control | `YZXCONV-008`, `YZXCONV-015` |
| Meta central control plus repo independence | `YZXCONV-008`, `YZXCONV-013` |
| Codex not pointed at an old split profile | `YZXCONV-003`, `YZXCONV-004`, `YZXCONV-014` |
| RTK TokenKill configured to `nu_shell` | `YZXCONV-009`, `YZXCONV-014` |
| No unowned Bash/Zsh/old wrappers | `YZXCONV-011`, `YZXCONV-014` |
| Meta/Grit/ICM/Weave/old flakes have Nu surfaces | `YZXCONV-010`, `YZXCONV-012` |
| Kache is the only cache authority | `YZXCONV-016`, `YZXCONV-020` |
| Agents use Nushell only; owner controls crash fallback | `YZXCONV-017`, `YZXCONV-020` |
| Owner-contract tasks and gates are in agent-env | `YZXCONV-018`, `YZXCONV-020` |
| Worktrees, stashes, branches, and pull requests are settled | `YZXCONV-019`, `YZXCONV-020` |
| Existing origin/main/master/develop refs are synchronized | `YZXCONV-019`, `YZXCONV-020` |
| Yazelix musl support and honest non-musl fallback | `YZXCONV-021`, `YZXCONV-020` |
| Home Manager inside the one foundation owner | `YZXCONV-022`, `YZXCONV-020` |
| Profile desktop entry and layout override have one owner | `YZXCONV-022`, `YZXCONV-020` |

## Completion rule

The plan does not permit a success claim based only on green package builds.
`YZXCONV-020` must prove every row above from installed runtime and source state,
including both Meta fleet commands and local peer commands. Any missing proof
keeps the graph active.
