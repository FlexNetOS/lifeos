# Ownership Matrix — Source-to-Runtime Authority (YZXCONV-002)

This document is the exact path-and-command projection of the owner-ratified
14-clause source-to-runtime ownership contract. It exists so that every active
path has exactly one editable owner, one generator, and one runtime consumer,
named precisely — not as prose.

**Authority and precedence.** The ratified contract is
`yazelix_runtime_convergence/PLAN.md` at SHA-256
`3515e211db4f8090d67a9a05da3e42fd2ea860238634cab0f714ae65f9099b86`, ratified
by the Owner on 2026-07-14T12:22:43Z (decision `DEC-YZXCONV-001` in
`decisions.json`; proof `proof_records/YZXCONV-002.proof.json`). This matrix is
a derived consolidation of that contract onto live surfaces. On any conflict,
`PLAN.md` and `decisions.json` win over this document.

**Evidence sources.** `EVIDENCE.md` (2026-07-13 baseline plus the 2026-07-14
owner-contract delta), `reports/verification-2026-07-14.md` (the 16-claim
manual verification ledger), the envctl ADR-0006 canonical `home/` overlay
contract (envctl architecture context), and the Yazelix managed-config
conventions in `meta/src/yazelix/docs/configuration.md` and
`meta/src/yazelix/docs/runtime-notes.md`.

**Zone principle.** Runtime-state homes (`~/.codex`, `~/.claude`, the Nix
store, `~/.local/share/yazelix`) never hold editable authority. Editable
authority lives in reviewed, committed repository sources (the envctl `home/`
overlay and the Yazelix repos) plus the one owner-edited managed-config tree.
Anything materialized into a state home or generated tree is proof, never an
edit surface.

## 1. Single-profile selector rule (ratified)

`/home/flexnetos/.nix-profile` is the only active closure selector and the
only interactive PATH owner. All PATH composition begins at
`~/.nix-profile/toolbin` then `~/.nix-profile/bin`. Every other profile path —
`~/.local/state/nix/profiles/profile` (XDG) and any
`/nix/var/nix/profiles/per-user/*` path — may retain normal generation
history, but must either resolve to the same active closure as
`~/.nix-profile` or hold no PATH, launcher, or selection authority at all.
Home Manager is consumed inside the same `lifeos_foundation_yzx` element and
may not create a second profile, launcher shadow, or edit surface (PLAN
clauses 1 and 14; enforcement is `YZXCONV-003`, hard-gate `YZXCONV-039`,
Home Manager gate `YZXCONV-022`).

## 2. Approved Codex/Claude editable-input subpaths (ratified)

The reviewed editable inputs for the two agent runtime configs are the envctl
ADR-0006 `home/` overlay files, materialized (symlink or locked copy) by the
envctl projection into the untouched real state homes:

| Agent | Editable input (reviewed, committed) | Generator (materialization) | Active runtime file | State home (never moved, never edited by the chain) |
| --- | --- | --- | --- | --- |
| Codex | `/home/flexnetos/meta/src/envctl/home/.codex/config.toml` | envctl `home/` projection + `agent-env.lock` (`YZXCONV-004`, `YZXCONV-027`) | `/home/flexnetos/.codex/config.toml` | `/home/flexnetos/.codex` (SQLite, goals, memories, rollouts, auth, app-server) |
| Claude | `/home/flexnetos/meta/src/envctl/home/.claude/settings.json` | envctl `home/` projection + `agent-env.lock` (`YZXCONV-005`, `YZXCONV-027`) | `/home/flexnetos/.claude/settings.json` | `/home/flexnetos/.claude` (projects, todos, history, memory) |

**Considered and rejected:** `~/.config/yazelix/agents/codex/config.toml.src`
and `~/.config/yazelix/agents/claude/settings.json.src` (the task-briefing
default proposal). Rejected because (a) the envctl ADR-0006 `home/` overlay is
the already-ratified yazelix-to-meta connection for exactly these files
(`DEC-YZXCONV-006`: "the yazelix<->meta connection is the ADR-0006 home
symlink farm + nix profile"; the envctl architecture contract already declares
`~/.claude/settings.json` a farm symlink), (b) `YZXCONV-027` already scopes
the projection to own or symlink these two runtime files from the envctl-home
projected sources, and (c) the Yazelix docs define no agent-config projection
convention — `docs/configuration.md` and `docs/runtime-notes.md` scope
`~/.config/yazelix` to managed-tool native files generated into
`$YAZELIX_STATE_DIR`, not into external state homes. Adopting the `agents/`
subtree would have created a second editable owner for the same two paths,
which is exactly the contradiction class this contract exists to eliminate.

On first materialization, the existing handwritten `~/.codex/config.toml`
and any direct `~/.claude/settings.json` are archived in place with a dated
suffix (never deleted) after their deltas are reviewed into the farm sources
(`YZXCONV-004`/`YZXCONV-005` implementation detail).

## 3. Path authority matrix

Columns: every active path or surface names exactly one editable owner (who
may change content, and through what), exactly one generator (what writes the
active bytes), and exactly one runtime consumer (what reads them at runtime),
with the currently recorded contradiction and the ratified target.

| Path / surface | Editable owner | Generator | Runtime consumer | Current contradiction (evidence) | Ratified target |
| --- | --- | --- | --- | --- | --- |
| `~/.nix-profile` | None (immutable closure; changes only via owner-approved `nix profile` operations of the `lifeos_foundation_yzx` element) | Nix profile install/upgrade driven by the Yazelix flake (`YZXCONV-003`, `YZXCONV-014`) | Every interactive session and agent PATH (`toolbin` then `bin` first) | Resolves to `9yxhhy…-profile` while the XDG profile resolves to `8l6s8qvbrfq…-profile` — two active selectors (EVIDENCE.md) | Sole interactive selector (PLAN clause 1; hard-gated by `YZXCONV-039`) |
| `~/.local/state/nix/profiles/profile` (XDG profile) | None | Nix generation machinery | None permitted | Currently selects a different closure than `~/.nix-profile` (EVIDENCE.md) | History-only: same closure as `~/.nix-profile` or no PATH/launcher authority (PLAN clause 1; `YZXCONV-003`) |
| `~/.nix-profile/bin/yzx` + profile binaries (`codex`, `claude`, `nu`, `rtk`, `meta`, `grit`, `icm`, `weave`, `kache`) | None (immutable store output) | Profile install of the foundation closure | User sessions and agents (the only launcher/tool frontdoor) | Seven declared binaries missing from the profile: `envctl`, `rusty-idd`, `teri`, `hf`, `handoff`, `nu_plugin`, `flexnetos_runner`; bash-sandbox-only PATH-ordering drift (verification ledger #15, #16) | All foundation binaries resolve via the one profile (`YZXCONV-006`, `YZXCONV-025`, `YZXCONV-033`) |
| `~/.config/yazelix` — Nova-managed set (`config.toml`, `mars/`, `zellij/`, `starship.toml`, `helix/`, `yazi/`, `nu/`, `cursors.toml`) | Owner, via `yzx config` (Nova) or reviewed direct edits | None (Nova saves only explicit overrides; one-time `cursors.toml` seed from the child template) | Yazelix runtime materializer (`yzx`) reading inputs to generate `$YAZELIX_STATE_DIR` | None structural | Sole user-editable Yazelix managed-config root (PLAN clause 2). Not the home of agent-config inputs (section 2) |
| `~/.config/yazelix` — farm-projected set (`shell_nu.nu`, `settings.jsonc`, `configs/`, `terminal_ghostty.conf`, `tombi.toml`, legacy `shell_bash.sh`/`shell_zsh.zsh`) | envctl `home/` overlay: `meta/src/envctl/home/.config/yazelix/**` (reviewed commits) | envctl `home/` projection | Yazelix generated runtime (sources `shell_nu.nu` after packaged config) | Farm still ships `shell_bash.sh`/`shell_zsh.zsh` — legacy-shell surfaces pending classification (`YZXCONV-011`, `YZXCONV-023`) | Disjoint from the Nova-managed set, so each file keeps exactly one owner; legacy shell hooks retired or explicitly bridged with proof |
| `~/.local/share/yazelix` (`$YAZELIX_STATE_DIR`) | None, ever | Yazelix runtime preparation (`yzx`) from packaged config + `~/.config/yazelix` inputs | Managed sessions: Zellij, managed Nu, Helix bridge, Yazi, Mars, agent popup | None; risk class is "edited generated runtime" | Generated-only proof surface, never an edit surface (PLAN clause 2) |
| `~/.codex/config.toml` | envctl farm source `meta/src/envctl/home/.codex/config.toml` (section 2) | envctl `home/` projection + lock (`YZXCONV-004`, `YZXCONV-027`) | Profile-owned `codex` binary (`CODEX_HOME=~/.codex`, doctor-proven) | Active file is a direct handwritten 1016B file diverging from the projected source — missing `shell_tool`/`unified_exec` keys (verification ledger #6, #7) | Projection-owned active config; handwritten original archived with dated suffix (PLAN clause 3) |
| `~/.codex` state (SQLite, goals, memories, rollouts, auth, app-server) | None (runtime-owned) | `codex` runtime | `codex` runtime | None — doctor proved the state home is correct; only config authorship moves | State never moves into a config tree; auth material handled by name only (PLAN clause 3) |
| `~/.claude/settings.json` | envctl farm source `meta/src/envctl/home/.claude/settings.json` (section 2) | envctl `home/` projection + lock (`YZXCONV-005`, `YZXCONV-027`) | Profile-owned `claude` binary (PreToolUse `rtk hook claude` confirmed, verification ledger #5) | Live file is a direct file, not the ADR-0006 farm symlink — projection drift (EVIDENCE.md; `YZXCONV-027`) | Projection-owned active settings; direct original archived with dated suffix (PLAN clause 4) |
| `~/.claude` state (projects, todos, history, memory) | None (runtime-owned) | `claude` runtime | `claude` runtime | None | State home stays in place; only settings authorship converges (PLAN clause 4) |
| `~/.config/nushell` (host standalone Nu) | Content: `meta/src/yazelix/nushell/config/**` (the canonical shell contract, PLAN clause 5) | Delivery: envctl `home/` projection (`home/.config/nushell/config.nu`, `meta-usr-path.nu`) | Host standalone `nu` sessions (`$nu.config-path`) | The farm's `config.nu` is its own competing contract instead of sourcing the packaged Yazelix config, while Yazelix separately generates `~/.local/share/yazelix/generated/nushell/config.nu` — split shell authority (EVIDENCE.md) | One shell contract: the farm-projected host loader sources the packaged Yazelix Nu config through the profile; the competing content is retired by archive after re-pointing (`YZXCONV-010`, `YZXCONV-011`, `YZXCONV-014`) |
| `~/.config/rtk/config.toml` (+ `filters.toml`) | envctl farm source `meta/src/envctl/home/.config/rtk/config.toml` (reviewed commits) | envctl `home/` projection | Profile-owned `rtk` 0.43.0 — every agent command and the `rtk hook claude` rewrite | Live file is a direct file, not the farm projection; no `nu_shell` field exists in config or rtk source (EVIDENCE.md; verification ledger #2) | Farm-projected single RTK config with a documented, selected `nu_shell` mode (`YZXCONV-009`); wrapper catalog completed through the single rtk chokepoint (`DEC-YZXCONV-003`, `YZXCONV-024`) |
| `agent-env.yaml` / `agent-env.lock` (per peer) | Each peer repo commits its own `agent-env.yaml` (reviewed PR); fleet baseline scope is repo-scoped skills+MCP only (`DEC-YZXCONV-006`) | `envctl agent lock` writes `agent-env.lock` | `envctl agent sync` (preview-first; apply is a reviewed step), fanned out via `meta exec` | Meta root has no fleet `agent-env.yaml`, so root lock/sync fails; `.meta.yaml` stale plugin peers and meta-plugins path drift (EVIDENCE.md; `YZXCONV-029`, `YZXCONV-030`) | Every selected peer has an explicit agent-env config or an explicit exclusion (PLAN clause 8; `YZXCONV-007`, `YZXCONV-018`, `YZXCONV-029`) |
| Meta fleet frontdoors (`meta git`, `meta exec`) | `meta` repo source (own PR flow) | n/a (profile binary) | Fleet-wide inspection/coordination and fan-out; each peer keeps independent local git, tests, releases (PLAN clause 7 dual mode) | `meta/usr/bin/envctl` is a generated `/bin/sh` wrapper delegating to a non-profile native binary; divergent bash `meta/usr/bin/kache-rustc-wrapper` (EVIDENCE.md; verification ledger #14) | Native `envctl` in the one profile (`YZXCONV-006`); sh wrappers retired by archive after Nu extern coverage (`YZXCONV-011`, `YZXCONV-023`); dual mode codified (`YZXCONV-008`) |
| Kache cache authority (`~/.cache`, `XDG_CACHE_HOME=/run/user/1001/yazelix/volatile/cache`, `RUSTC_WRAPPER`) | Cache policy source: `meta/src/yazelix/packaging/kache_release.nix` + flake composition (reviewed commits) | Profile packaging (wrappers installed into the closure) | Every package, build, compiler, runner, and temporary cache — Kache-mediated or disabled | Divergent bash wrapper `meta/usr/bin/kache-rustc-wrapper` pointing at `/home/flexnetos/FlexNetOS/usr/bin/kache`; installed kache 0.8.0 stale vs canonical `github:kunobi-ninja/kache` v0.10.0 (verification ledger #13, #14; `DEC-YZXCONV-015`) | Kache is the only cache authority; the Nix store and the one profile are install/runtime surfaces, never cache-control paths (PLAN clause 10; `YZXCONV-016`, `YZXCONV-052`) |
| `meta/src/yazelix` (main repo) | Its own repo via its own PR flow (never monorepo-collapsed) | Flake build of the foundation closure, consuming pinned child revisions | The installed profile closure and `yzx` runtime composition | Working tree indexed dirty (owner changes to `flake.nix`, `nushell/config/config.nu`, `rtk_wrappers.nu` uncommitted); canonical vs stale flake copies coexist under `meta/src` (EVIDENCE.md) | Owner of runtime composition and packaging; pinned four-repo ownership transaction; dirty state published, merged, then reaped with receipts (PLAN clauses 9, 12; `YZXCONV-013`, `YZXCONV-019`) |
| `meta/src/yazelix-helix` | Its own repo (PR flow) | Its build outputs, consumed as a pinned input by the main flake | Main Yazelix runtime (bridge actions only: context, cwd, directory, file; `YAZELIX_HELIX_MANAGED_CONFIG_PATH` is an explicit input) | None (clean at baseline) | Narrow child owner of the managed-config/editor bridge (PLAN clause 9; `YZXCONV-013`) |
| `meta/src/yazelix-yazi-assets` | Its own repo (PR flow) | Deterministic asset rendering (`render_yazelix_starship_config`; Rust crate shipping Lua assets, verification ledger #11) | Main Yazelix runtime composition | None (clean at baseline) | Narrow child owner of rendered assets, not orchestration (PLAN clause 9; `YZXCONV-013`) |
| `meta/src/yazelix-terminal-support` | Its own repo (PR flow) | Parsed static terminal metadata (`terminal_support()`) | Main Yazelix terminal detection (Kitty then Ghostty ordering preserved) | None (clean at baseline) | Narrow child owner of terminal metadata/detection; launches nothing, mutates nothing (PLAN clause 9; `YZXCONV-013`) |
| Home Manager surface (desktop entry, layout projection) | Declared HM module config inside the foundation flake (reviewed commits) | Home Manager activation inside the same `lifeos_foundation_yzx` element (writes nothing unless declared; singular `package` — verification ledger #12) | Desktop launch and layout of the one profile runtime | Historically only input-level; dedicated single-owner proof still open (`YZXCONV-022`) | Component of the one install owner; never a second profile, generated-runtime edit surface, or launcher shadow (PLAN clause 14; `YZXCONV-022`) |

## 4. Command authority matrix

| Command | Sole authority for | Bound |
| --- | --- | --- |
| `nix profile …` on `~/.nix-profile` | Activating/changing the one foundation closure | Owner-approved cutover steps only, with rollback receipts (`YZXCONV-003`) |
| `yzx` | Launching and materializing the managed runtime (`$YAZELIX_STATE_DIR`) | Generated output is proof, never an edit surface |
| `yzx config` (Nova) | Editing the Nova-managed set under `~/.config/yazelix` | Saves explicit overrides only; rejects unknown keys |
| envctl `home/` projection + `envctl agent lock` / `envctl agent sync` | Materializing farm-owned dotfiles and repo-scoped agent baselines | Preview-first; apply is a reviewed step, never inferred (PLAN clause 8) |
| `meta git` / `meta exec` | Fleet-wide git inspection/coordination and arbitrary fan-out | Peers keep independent local git; no monorepo collapse (PLAN clause 7) |
| `rtk` | The single command chokepoint for agent CLI invocations (wrappers call binaries through rtk) | Wrappers never reimplement tools (`DEC-YZXCONV-003`, `YZXCONV-024`) |
| `nu --mcp` (profile Nushell) + Bash-tool deny | Agent shell execution routing | Two-swaps-plus-hard-gate model; bash/zsh/fish are owner-only, crash-emergency exceptions owner-authorized per incident (PLAN clause 11; `DEC-YZXCONV-002`, `YZXCONV-028`) |
| `kache` wrappers (`kache-rustc-wrapper` from the profile) | Cache mediation for compilers/builds/runners | Only the nix-profile wrapper is legitimate; divergent copies are drift (`YZXCONV-016`) |

## 5. Ratification record

- **Decision:** This matrix is adopted as the exact path-and-command
  projection of the owner-ratified 14-clause contract (`DEC-YZXCONV-001`).
  It ratifies (a) the single-profile selector rule as stated in section 1,
  (b) the envctl `home/` overlay files in section 2 as the exact Codex and
  Claude editable-input subpaths, with the `~/.config/yazelix/agents/*.src`
  alternative rejected, and (c) the per-path owner/generator/consumer
  assignments in sections 3 and 4. Every active path in scope has exactly one
  editable owner, one generator, and one runtime consumer.
- **Decided under:** owner-delegated agent authority (mission 2026-07-14,
  ultracode autonomous mode), by the Runtime Architecture Owner agent for
  task `YZXCONV-002`, on 2026-07-15. Bounded: this document mutates no
  profile, no global config, and no peer implementation code; it changes
  planning-spine documentation only. `PLAN.md` remains byte-identical to the
  owner-ratified hash. Reversible in full.
- **Unblock condition:** The Owner may amend any row by a revised
  `OWNERSHIP_MATRIX.md` plus a superseding entry in `decisions.json`; any
  such amendment re-opens the affected implementation tasks
  (`YZXCONV-003`..`YZXCONV-055`) for re-scoping.
- **Deferral/rollback rule:** Revert this document and keep all current
  runtime selectors unchanged (the `YZXCONV-002` rollback plan). The
  owner-ratified `PLAN.md` clauses and `decisions.json` remain in force
  unaffected; implementation tasks fall back to their row text as sole
  guidance.
