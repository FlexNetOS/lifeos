# Manual verification ledger — 2026-07-14

Owner-requested ground-truth code review of every material convergence claim.
Each row was checked by running the command shown against the live box
(profile Nushell 0.113.1 / rtk 0.43.0 / kache 0.8.0). Verdicts: CONFIRMED /
CORRECTED / UNCERTAIN. Zero claims failed; one uncertainty was resolved.

| # | Claim | Verdict | Evidence (command → result) |
|---|-------|---------|-----------------------------|
| 1 | `rtk hook claude` is built into the `rtk` binary | CONFIRMED | `rtk hook --help` → subcommands `claude/cursor/gemini/copilot/check`; `rtk --version` = `rtk 0.43.0` |
| 2 | rtk does not route through nushell; `rtk run` = `sh -c`; no `nu_shell` field | CONFIRMED | `rtk --help` → `run` = "Execute a shell command via sh -c"; no `nu_shell`/`nushell` in help or `rtk config` |
| 3 | `nu --mcp` is built into the profile Nushell | CONFIRMED (resolves the plan's open question) | `nu -c "version \| get features"` → `default, mcp, network, plugin, rustls-tls, sqlite, trash-support`; `nu --help` shows `--mcp`, `--mcp-transport stdio/http`, `--mcp-port` |
| 4 | nu is non-POSIX; bash constructs fail in `nu -c` | CONFIRMED | `nu -c "echo hi && echo bye"` → `shell_andand`; `nu -c "echo $(date)"` → `parse_mismatch`; `nu -c "ls x 2>&1"` → `shell_outerr` |
| 5 | Claude Bash tool routed via `rtk hook claude` PreToolUse | CONFIRMED | `~/.claude/settings.json` → `PreToolUse` matcher `"Bash"` → `"command": "rtk hook claude"` |
| 6 | Active Codex config has no shell/exec interpreter selector | CONFIRMED | `~/.codex/config.toml` (1016B) keys: model/reasoning/approvals/trust_level/plugins=false — no `shell`/`exec`/`bash`/`zsh` |
| 7 | Active Codex config diverges from the projected source (YZXCONV-027) | CONFIRMED | active file minimal; lacks the `shell_tool`/`unified_exec` keys carried by the projected `home/.codex/config.toml` |
| 8 | `gh` is a compiled binary, not bash | CONFIRMED | `head -c4 $(command -v gh)` → ELF magic `7f 45 4c 46`; `gh --version` = 2.96.0 |
| 9 | `shell.program = "nu"` is the shipped yazelix default | CONFIRMED | `defaults/config.toml:8-10` `[shell] program = "nu"` ("Yazelix Nova requires Nushell") |
| 10 | The nu catalog wraps external binaries (not reimplementation) | CONFIRMED | `rtk_wrappers.nu:18` `export def --wrapped gh [...rest] { ^rtk gh ...$rest }` |
| 11 | `yazelix-yazi-assets` is a Rust crate shipping Lua assets | CONFIRMED | `Cargo.toml`: `name=yazelix_yazi_assets, edition=2024, [lib] src/lib.rs` |
| 12 | HM writes no config unless declared; singular `package` (no plural option) | CONFIRMED | `module.nix:152` `mkIf cfg.enable`, `:153` `home.packages=[cfg.package]`, `:164` `optionalAttrs (cfg.config.settings != null)` |
| 13 | kache 0.8.0; `~/.cache` kache-only; RUSTC_WRAPPER = nix kache | CONFIRMED | `kache --version`=0.8.0; `ls ~/.cache`=`kache`; `RUSTC_WRAPPER=~/.nix-profile/bin/kache-rustc-wrapper`; `XDG_CACHE_HOME=/run/user/1001/yazelix/volatile/cache` |
| 14 | Divergent bash kache wrapper drift exists | CONFIRMED | `meta/usr/bin/kache-rustc-wrapper` = `#!/usr/bin/env bash`; `KACHE_BIN=/home/flexnetos/FlexNetOS/usr/bin/kache` (diverges from the nix wrapper on PATH) |
| 15 | Install gaps: envctl, rusty-idd, teri, hf, handoff, nu_plugin, flexnetos_runner MISSING | CONFIRMED | `command -v` → MISSING for all seven; grit/icm/meta/weave/git-kb/codex/claude resolve via the foundation-tools store, yzx via `~/.nix-profile/bin` |
| 16 | PATH-ordering drift is bash-sandbox-only; nu login self-corrects | CONFIRMED | `nu -lc "$env.PATH \| first 4"` → `~/.nix-profile/{toolbin,bin}` first, then store bins |

## Consequence for the plan

- **YZXCONV-026 / YZXCONV-028:** the "which nu MCP" question is resolved — the
  profile Nushell 0.113.1 already ships `nu --mcp` (mcp feature compiled in), so
  the execution half of strict-nu routing needs no build and no vendored crate.
  next_action of both tasks updated; DEC-YZXCONV-002 evidence updated.
- The two `rtk`-vs-`nu --mcp` "built-in" facts are distinct: `rtk hook claude`
  (compiled into rtk) rewrites Claude's Bash command TEXT (shell stays bash);
  `nu --mcp` (compiled into nushell) is the actual nu EXECUTION server. rtk is
  not a nushell router; nu --mcp is.
- No product, profile, agent config, or cache state was mutated by this review
  (read-only checks + `--help`/`--version`/`version` probes only).
