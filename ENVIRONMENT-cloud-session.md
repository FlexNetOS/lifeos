# ENVIRONMENT — Claude Code cloud session

Situational note (like `AUDIT.md` / `HANDOFF.md`): what the agent environment actually
is when LifeOS is opened in a **Claude Code on the web** cloud container, how it differs
from the FlexNetOS dev host that `CLAUDE.md` / `AGENTS.md` describe, and what "configure
the environment" resolves to here. Written 2026-07-21.

The mandated agent stack is **not faked**. Where it cannot exist in this container, that is
stated plainly rather than stubbed.

## What this container is

- Identity: `root`, `HOME=/root`, working dir `/home/user/lifeos` (repo owned by root).
- Ephemeral: cloned fresh at container start, reclaimed on inactivity. Anything worth
  keeping must be committed and pushed.
- Outbound HTTPS goes through the managed agent proxy (`HTTPS_PROXY` is set).

## Toolchain present (works)

| Tool | Version | Path |
|---|---|---|
| bun | 1.3.11 | `/root/.bun/bin/bun` |
| node | 22.22.2 | `/opt/node22/bin/node` |
| cargo / rustc | 1.94.1 | `/root/.cargo/bin/*` |
| git | 2.43.0 | `/usr/bin/git` |

- `bun install` succeeds against the checked-in `bun.lock`; `node_modules` installs cleanly.
- Version pin drift: `package.json` sets `packageManager: bun@1.3.14`, installed bun is
  `1.3.11`. Compatible for `install` / `run test` / `run build`; the system bun is not
  changed from this session.

## Mandated agent stack — absent by construction (not installable here)

`CLAUDE.md` mandates RTK, ICM, GitKB, and the GitNexus engine as must-use tooling, all owned
by a single Nix profile at `/home/flexnetos/.nix-profile` under the "Path law". In this
container **none of that substrate exists**:

- No `flexnetos` user and no `/home/flexnetos` tree; no `nix` binary; no `~/.nix-profile`.
- `rtk`, `icm`, `gitkb` / `git kb`, `gitnexus` — none on `PATH`; no `.gitnexus/` index in the
  checkout (the `run.cjs` / index that `CLAUDE.md` references are not present).
- `XDG_DATA_HOME` / `XDG_STATE_HOME` are unset, so the tool-state migration note in
  `CLAUDE.md` has nothing to point at.

These are dev-host constructs; a cloud session cannot stand up the Nix profile or the agent
binaries it owns. `.claude/settings.json` pre-authorizes `Bash(rtk *)`, `Bash(icm *)`,
`Bash(gitkb *)`, `Bash(gitnexus *)`, etc. — those allow-list entries are harmless no-ops here
because the binaries are absent. The committed GitNexus **skill docs**
(`.claude/skills/gitnexus/`) survive; only the engine and index do not.

Consequence for agents working in this container: use the standard toolchain directly (`bun`,
`git`, `cargo`) as the command frontdoor, and treat RTK/ICM/GitKB/GitNexus guidance as
inert until the repo is opened on the FlexNetOS host.

## MCP state

- On-disk `.mcp.json` declares `cognitum-seed` and `cognitum` (both currently
  unauthenticated — their token env vars are unset) and, as of this session, **`Figma`**
  (remote, `https://mcp.figma.com/mcp`, OAuth — no token on disk).
- Runtime-injected by the harness (not from any repo/home file): `Figma`, `github`,
  `Google_Drive`, `Hugging_Face`. `cognitum` / `cognitum-seed` need interactive OAuth before
  their tools work.
- No Figma token or `FIGMA_*` env var exists on disk; the Figma connection authenticates via
  the MCP client OAuth flow.

## Test baseline (2026-07-21, this container)

`bun run test` → **305 passed, 2 failed (307 tests / 54 files)**. Both failures are
pre-existing and independent of Figma/environment work in this session:

1. `tests/bun-frontdoor.spec.ts` — asserts the profile Bun resolves into `/nix/store/...`;
   fails with `ENOENT '/root/.nix-profile'`. Environmental: there is no Nix here. Expected to
   pass only on the FlexNetOS host.
2. `tests/planning-spine-navigation.spec.js` — the committed `navigation/generated/*.json`
   are stale vs regeneration (`navigation_graph.json`, `navigation_index.json`,
   `navigation.validation_report.json`). Repo-state drift, unrelated to this session's scope;
   left for a dedicated navigation regeneration change.

Green and directly exercised by this session's work:

- `bunx vitest run tests/figma-sidebar-companion.spec.ts` — the Figma connection contract.
- `bun run figma:sidebar:check` — the manifest/token/anchor/page verifier.
- `bun run design:lint` — the DESIGN.md token contract.

## What "configure the environment" means in this container

1. `bun install` (done — `node_modules` present).
2. Keep the standard toolchain green: `bun run build`, `bun run test:a11y`,
   `bun run design:lint`, `bun run figma:sidebar:check`, and the targeted Figma spec.
3. Treat the mandated Nix/agent-tool stack as unavailable and document it (this file) rather
   than emulate it.
4. Declare the Figma design-input connector in `.mcp.json` so the design<->code link is
   reproducible for future sessions.
