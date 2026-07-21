# `.claude/` — agent configuration contract

This directory holds Claude Code / agent configuration for the LifeOS repo. It is
split into **shared** (committed, propagates to every checkout and worktree) and
**local** (ignored, machine- or session-specific). The split is enforced by the
`.claude` block in the repo `.gitignore`.

## Tracked vs. ignored

| Path | State | Rationale |
|---|---|---|
| `settings.json` | **committed** | Shared, non-secret project settings: `outputStyle` + a conservative permission baseline. Every checkout and worktree inherits it from git. |
| `skills/` | **committed** | Shared skills (e.g. GitNexus). |
| `rules/`, `hooks/` | **committed** when present | Shared rules and project hooks. |
| `settings.local.json` | **ignored** | Additional machine-specific / secret permission grants layered on top of the committed baseline. Never commit; never treat as the source of truth. |
| `projects/` | **ignored** | Session transcripts — disposable chat-session memory. |
| `worktrees/` | **ignored** | Agent worktree scaffolding; never tracked. |
| `**/*.local.json` | **ignored** | Any local override file. |

Claude Code merges `settings.local.json` over `settings.json`, so the committed
file is the deterministic baseline and the local file adds only machine-specific
or secret bits. Keep session-scoped cruft (one-off command allowances, dead job
paths) out of both — it belongs to neither the shared baseline nor durable memory.

## Permissions: committed baseline + local overrides

`settings.json` carries a **conservative, non-secret permission baseline** —
general-purpose allows this repo needs on every checkout (`Bash(rtk git *)`,
`Bash(rtk grep *)`, `Bash(cd *)`, `Bash(git add *)`, `Bash(git checkout *)`,
`Bash(git commit *)`, `Skill(update-config)`). New worktrees inherit it from git,
which is what removes the old confusion.

`settings.local.json` (ignored) holds **additional machine-specific or secret
grants** layered on top; Claude Code merges local over committed. Two rules:

- **Never commit secrets or broad wildcards** (e.g. `Bash(rtk proxy *)`, which is
  effectively arbitrary shell) — those stay local.
- **Review the baseline deliberately.** Anyone who checks this repo out inherits
  the committed allows; keep the baseline to safe, general operations and prune
  session cruft (one-off command allowances, dead job-tmp paths).

## Why new worktrees used to be confusing

Previously the meaningful config lived only in the **ignored** `settings.local.json`
while the committed `settings.json` was an empty `{}`. A worktree created outside
the harness inherited an empty config, and it was unclear what the "real" settings
were. Now: the shared, non-secret config is in the **committed** `settings.json`,
the tracked-vs-ignored split is explicit in `.gitignore`, and this file documents
the contract. A conservative permission baseline is committed; only machine-specific
or secret grants remain local.

## Canonical target (the blueprint)

Per `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`,
this configuration is ultimately a **database-owned generated projection**, not a
git artifact:

- **Hard rule 14** — *"Files and materialized worktrees are execution projections.
  They are not independent execution authorities."*
- **§4.7 (envctl)** — envctl *"projects worktrees, Nix inputs, runtime
  configuration, and activation state."*
- **Operating doctrine** — *"envctl generates its controlled configuration from
  database rows"*; generated Codex/MCP/RTK/GitKB/… outputs carry generator, source
  table, checksum, branch, witness, and **do-not-edit provenance**.

When envctl's generation loop lands (release gate **R11**), `.claude` — including
per-machine permissions — is regenerated identically into every worktree from
PostgreSQL/RuVector, and the tracked-vs-ignored split above becomes moot: git stops
being the carrier. Until then, the committed shared config plus this contract are
the interim stand-in.
