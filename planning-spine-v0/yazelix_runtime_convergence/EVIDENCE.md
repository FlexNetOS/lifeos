# Evidence Baseline — 2026-07-13

## GitNexus code intelligence

All four repositories were indexed from the Meta root with the immutable
Nix-store GitNexus 1.6.9 binary using pure-index mode and PDG:

```text
meta exec --include yazelix,yazelix-helix,yazelix-yazi-assets,yazelix-terminal-support -- \
  /nix/store/qkkkqggf990cfa4ps86s3v8r502q389x-gitnexus-1.6.9/bin/gitnexus \
  analyze --index-only --pdg
```

Post-index status returned `up-to-date` for all four repositories. Registry
statistics:

| Repository | Commit | Files | Symbols | Edges | Clusters | Processes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| yazelix | `fe5910a` | 358 | 33,552 | 74,512 | 345 | 300 |
| yazelix-helix | `c2819ed` | 1,690 | 47,556 | 106,683 | 450 | 300 |
| yazelix-yazi-assets | `2280ffc` | 51 | 555 | 1,009 | 5 | 29 |
| yazelix-terminal-support | `6ab751a` | 5 | 287 | 457 | 3 | 15 |

The main Yazelix index was intentionally built from the current working tree,
which already contained owner changes to `flake.nix`, `nushell/config/config.nu`,
`nushell/config/rtk_wrappers.nu`, and packaging contracts. The three child
repositories were clean.

Graph queries and symbol context established these ownership seams:

- Main Yazelix: `evaluate_install_ownership_report` feeds doctor, desktop,
  Home Manager, and update paths; `compute_runtime_env` composes profile-first
  PATH and sets RTK-required Codex/Claude commands; `rtk_session_policy_initializer`
  still emits separate Nu/Bash/Zsh/Fish/Xonsh integrations;
  `verify_profile_installed_runtime` is the package-level runtime gate.
- Yazelix Helix: `handle_yazelix_bridge_command` owns only context, cwd,
  directory, and file bridge actions. `YAZELIX_HELIX_MANAGED_CONFIG_PATH` is an
  explicit bridge input; main Yazelix remains runtime owner.
- Yazi Assets: `render_yazelix_starship_config` owns deterministic Starship/Yazi
  asset rendering, not runtime orchestration.
- Terminal Support: `terminal_support()` owns parsed static metadata; its tests
  require Kitty then Ghostty and preserve legacy session detection. It does not
  launch terminals or mutate runtime state.

One analysis limitation was recorded: GitNexus skipped CDG construction for
eight Helix Rust functions whose EXIT blocks were not reverse-reachable. CFG and
REACHING_DEF remained available, and indexing completed successfully.

## Installed profile and binaries

- `/home/flexnetos/.nix-profile` resolves to
  `/nix/store/9yxhhy94bmblvnxhzhw1gqcasv4lmvay-profile`.
- `/home/flexnetos/.local/state/nix/profiles/profile` resolves to
  `/nix/store/8l6s8qvbrfq953zr0bqzhl3zyszjnid3-profile`.
- Each profile lists one `lifeos_foundation_yzx` element locked to Yazelix
  revision `4112c7ee6952c5d813ec11e10be8db19aa48e8ba`, but the output store paths
  differ. This is two active selectors, not a proved single closure.
- The legacy `/nix/var/nix/profiles/per-user/flexnetos/profile` and
  `~/.local/bin/yzx` are absent.
- Active immutable binaries:
  - `yzx` -> `lifeos-foundation-yzx/bin/yzx`
  - `codex` -> `codex-cli-0.144.0/bin/codex`
  - `claude` -> `claude-code-2.1.207/bin/claude`
  - `rtk` -> `rtk-0.43.0/bin/rtk`
  - `nu` -> `nushell-0.113.1/bin/nu`
  - `meta` -> `meta-0.2.22/bin/meta`
  - `grit` -> `grit-0.6.4/bin/grit`
  - `icm` -> `icm-0.10.57/bin/icm`
  - `weave` -> `weave-0.2.0/bin/weave`

## Codex and Claude ownership

Codex doctor proved:

- `CODEX_HOME=/home/flexnetos/.codex` by default even though the environment
  variable is unset;
- config is loaded from `/home/flexnetos/.codex/config.toml`;
- SQLite state, goals, memories, rollouts, auth, and app-server paths all live
  under `/home/flexnetos/.codex`;
- the executable is the profile-owned Nix-store binary;
- the overall doctor result failed only because the sandbox denied network and
  PATH-alias creation, not because config parsing or installation failed.

Claude is likewise profile-owned, but `/home/flexnetos/.claude/settings.json`
is a direct file. Neither direct active config currently has a proved editable
source under `~/.config/yazelix`.

## Nushell and RTK

- `$nu.config-path` is
  `/home/flexnetos/meta/src/envctl/home/.config/nushell/config.nu` because
  `~/.config/nushell/config.nu` is a symlink into envctl source.
- Yazelix also generates
  `~/.local/share/yazelix/generated/nushell/config.nu`; it sources the immutable
  packaged Yazelix config, optional `~/.config/yazelix/shell_nu.nu`, and the
  packaged prompt guard.
- The source of the managed config is
  `/home/flexnetos/meta/src/yazelix/nushell/config/config.nu`.
- The staged `rtk_wrappers.nu` defines `meta` but not `envctl`, `grit`, `icm`,
  `weave`, or `nix`. It defines npm/npx/pnpm despite the active Bun/Bunx policy.
- `rtk config` resolves to `~/.config/rtk/config.toml`; neither that output nor a
  source search contains the literal `nu_shell`.
- Main Yazelix retains Bash, POSIX, and Zsh launch/config files. These are not
  all stale by definition, but no complete Nu-owned catalog proves which remain
  necessary.

## envctl and Meta

- No `agent-eng` binary or symbol exists in the inspected source. The concrete
  requested surface is envctl's built-in `envctl-agent-env` crate and
  `envctl agent` CLI driven by `agent-env.yaml` and `agent-env.lock`.
- envctl is not present under `~/.nix-profile/{bin,toolbin}`.
- `meta/usr/bin/envctl` is a generated `/bin/sh` wrapper that exports Meta paths
  and execs the native binary at `meta/usr/libexec/envctl/cli/bin/envctl`.
- From the Meta root, `envctl agent lock --check --locked` and dry-run sync fail
  because `agent-env.yaml` is absent.
- Through `meta exec --include envctl`, the envctl peer lock passes and dry-run
  sync reports 6 unchanged, 0 broken, and 0 failed assets.
- `meta git status` proves central fleet visibility while local `git status`
  proves each of the four Yazelix repositories retains independent branch and
  worktree state.

## Flake and shell inventory

Canonical flakes exist for all four Yazelix repositories and Grit. Additional
flake copies exist in worktrees, runner work directories, vendored trees, and
other peer repositories. Grit, ICM, and Weave have no first-party `.nu` command
module in their current repository roots; main Yazelix's staged module covers
only `meta`. The task graph therefore requires classification before retirement
and native Nu command/extern coverage before any shell route is removed.
