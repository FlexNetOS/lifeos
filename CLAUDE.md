# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandate: Boil the Ocean (Garry Tan) — the always-on target

> Remember when implementing: the marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that I am genuinely impressed—not politely satisfied, actually impressed. Never offer to "table this for later" when the permanent solution is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard is not "good enough"—it is "holy shit, that is done." Search before building. Test before shipping. Ship the complete thing. When I ask for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

## Execution style: Karpathy guidelines (mandatory) — the how

**Boil-the-Ocean is the target; Karpathy is the style.** Completeness is the standard the deliverable is judged against; the four rules below are the discipline that gets you there without sprawl, speculation, or unverified claims. Apply both on every task. Full reference: `andrej-karpathy-skills:karpathy-guidelines`.

1. **Think before coding.** State assumptions in plain language before touching files. If two interpretations of the request are plausible, name them — don't pick silently. When something is genuinely unclear, stop and ask rather than guessing. No hidden confusion.
2. **Simplicity first.** Write the minimum code that solves the stated problem. No speculative features, no abstractions for single-use code, no configurability that wasn't requested, no error handling for impossible branches. If 200 lines could be 50, rewrite it. A senior reviewer must not be able to call it overcomplicated.
3. **Surgical changes.** Touch only what the task requires. Match existing style even if you'd do it differently. Don't refactor adjacent code, reflow comments, or "tidy" unrelated files. Remove imports/variables/functions your edits orphaned; don't delete pre-existing dead code unless explicitly asked. Every changed line must trace to the user's request.
4. **Goal-driven execution.** Convert the request into verifiable success criteria up front — usually a failing test that should pass, or a command whose output you can inspect. Loop until verified. Never claim completion before producing the evidence (see "Verification before claiming done" under `## Common commands`).

How they interact: completeness without surgical discipline becomes sprawl; surgical discipline without completeness becomes the "table this for later" anti-pattern. Hit the *asked-for* scope completely, then stop — and do it with the four rules above. "Boil the ocean" is not license to expand scope; it's the obligation to finish the scope you took.

## Architecture anchor — RuVector data-pipeline blueprint

`Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` (repo root) is the **normative architecture and data-pipeline authority** for this repository. Read it before substantive architecture, storage, ingress, or release work, and conform to its "HARD EXECUTION RULES — READ FIRST" (21 rules) and "Operational invariants and acceptance" (19 invariants). Its opening law: *"EVERYTHING means EVERYTHING. EVERY BYTE means EVERY BYTE."* The blueprint is itself anchored to `Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED(3).md` (SHA-256 `abd36f1c…`) as its normative topology authority.

Anchor invariants that bind day-to-day work here:

- **PostgreSQL 17.10 + RuVector is the canonical durable macro-state and the Swarm Primary Runtime** — it hosts host ALL data, and after cutover all work happens inside it. (The repo's Rust storage layer already treats PostgreSQL/RuVector as canonical and rejects SQLite URLs — see "Storage layer (Rust-side only)" below.)
- **nu_plugin / CodeDB is the byte-complete ingress** into PostgreSQL/RuVector; hashes, manifests, and pointers supplement byte capture and never replace it.
- **redb is the transient shared low-latency state plane** — a single-owner, file-backed ACID buffer/cache/geometry/WAL that atomically publishes a read-only mmap projection plus ordered wakeup events; it is never the primary runtime or a source of truth.
- **envctl is the sole authoritative PostgreSQL/RuVector ingress committer** and the bidirectional bridge, materializer, projection manager, and security boundary.
- **ruvnet/rUv, RuVector, AgentDB, RVF, ruvllm, SONA, MicroLoRA, FastGRNN, Ruflo, RuvLTRA, ATAS** are installed and used, not replaced.
- The bidirectional LifeOS **Glass (Tauri/Svelte) ↔ Yazelix Engine Room (`yzx enter` / Zellij)** front door stays operational after database cutover.

Blueprint content map (open the file for detail — do not re-derive):

| Section | Contents |
|---|---|
| HARD EXECUTION RULES — READ FIRST | 21 non-negotiable rules; the broader interpretation governs every ambiguity; a conflicting edit is invalid |
| §1 Two-phase architecture | 1.1 Bootstrap import · 1.2 Operational (all work inside PostgreSQL/RuVector) |
| §2 Host ALL-data contract | every repo/byte/semantic/metadata/task/model/secret record; raw bytes kept beside derived representations |
| §3 Bidirectional operational front door | 3.1 Glass/Engine ownership · 3.2 eight physical pipelines · 3.3 redb owner / mmap / crash / replay · 3.4 rtk / rtk_nu / Nu / plugin raw-byte contract · 3.5 D01–D24 Mermaid atlas |
| §4 Component scopes | 4.1 PostgreSQL+RuVector … 4.5 nu_plugin/CodeDB … 4.6 redb … 4.7 envctl … 4.10 ruvllm/AgentDB/RVF/SONA/Ruflo/RuvLTRA/ATAS |
| §5 envctl security architecture | six subsystems: Secret Engine · Broker · Mint · Seed Vault · Cognitum Seed · Secret Relay |
| RUVECTOR/RUVNET full component architecture (§§1–20) | ecosystem map, crate/package/extension inventory, PostgreSQL extension & SQL surface, retrieval/indexing, graph/GNN/causal/MinCut, COW branching, AgentDB/RVF, ruvllm, SONA/RL, witness-chain, Ruflo/RuvLTRA/ATAS, redb geometry, envctl integration, CodeDB ingress, Nix/release, complete data schema (§16), install/activation order (§17), bidirectional graph (§18), byte-capture/reconciliation (§19), additional components (§20) |
| Capability register · component integration table | supplied capabilities and per-component integration rows |
| Import, transformation, export, and release contract | zero-undeclared-loss completion; database-gated, envctl-activated release |
| Anchor conformance ledger (A01–A15) | crosswalk over 15 anchor sections, 14 diagrams, 10 invariants |
| Review ledger (R01–R16) | 2026-07-19 repository-source reconciliation (e.g. Vue→Svelte migration required; `rtk_nu` and `codedb ingest-envelope` are unbuilt release blockers) |
| FlexNetOS operating doctrine and release gate | permanent `files → Nushell tables → validated envctl tables → generated files` conversion |
| Operational invariants and acceptance | 19 invariants; zero silent-downgrade language permitted at release |

Agent execution in this repo conforms to the blueprint's hard execution rules; an edit that conflicts with them is invalid.

## Mandatory agent tooling — RTK · ICM · GitKB · GitNexus

These are **mandatory must-use**, not optional. In this environment "optional" reads as mandatory.

- **RTK (Rust Token Killer) — mandatory command frontdoor.** Every shell execution begins with the profile-owned `/home/flexnetos/.nix-profile/bin/rtk`; commands that need raw, unfiltered evidence use `rtk proxy <cmd>`. Adoption is verified from the session transcript, not from mere binary availability. Command reference: `RTK.md`.
- **ICM (Infinite Context Memory) — mandatory persistent memory.** Recall before starting work (`icm recall "<query>"`); store immediately — before responding, not after — on every trigger: error resolved (`-t errors-resolved`), architecture or design decision (`-t decisions-lifeos`), user preference (`-t preferences -i critical`), significant task completed (`-t context-lifeos`), or more than ~20 tool calls without a store. ICM is the system of record for cross-session memory.
- **GitKB — mandatory knowledge and code-intelligence layer.** Use the `kb_*` MCP tools (and `git kb`) for callers / usages / definitions, impact and blast-radius, and knowledge documents — not raw grep for code symbols. Create the task or incident document before implementing; link commits to tasks.
- **GitNexus — mandatory code-intelligence.** Run impact analysis before editing any symbol, and `detect_changes()` before committing, per the GitNexus block at the bottom of this file (Always Do / Never Do).

**Transitional note — why all three of GitKB, ICM, and GitNexus are mandated (alongside RTK).** GitNexus is retained and mandated *as-is*; it is **not** demoted. Its mandated status is provisional: GitNexus is demoted only after the **GitKB + ICM** combination is *proven* to fill its gap. Until that proof exists, all three (GitKB, ICM, GitNexus) are mandated and used together, with RTK as the mandatory shell frontdoor.

## Path law — single Nix profile

`/home/flexnetos/.nix-profile` is the **sole active owner and frontdoor** for all agent and workspace binaries, runtime, and configs — required to achieve the blueprint build. Forbidden:

- any `.local` ownership, runtime, or launcher path;
- any home-root `~/.codex` or `~/.claude` ownership or compatibility path.

Profile-managed volatile agent state targets `/run/user/1001/yazelix/profile-runtime`. This governs ownership and runtime paths; it does not touch the in-repo `CLAUDE.md` / `AGENTS.md` contracts.

## Read first

This repo already has two long-form documents that are **authoritative** — read them before doing substantive work, and prefer them over re-deriving information:

- `AGENTS.md` — the operating contract (workspaces, sections, code conventions, OpenPencil flow, AI provider routing, persistence whitelist). Overrides generic defaults.
- `README.md` — quick start, directory map, component table, routing table, design contracts.
- `design-system-reference/README.md` — the LifeOS Design System spec (tokens, voice, components, motion). Read front-to-back the first time you touch UI.
- `design-system-reference/sot.md` — verbatim user brief that `AGENTS.md` is derived from.

`AUDIT.md`, `HANDOFF.md`, `CHANGELOG.md`, `TODO.md` are useful but situational — skim only if relevant to the task.

## What this app is

LifeOS — a Vue 3 + Vite + Pinia + vue-router web app wrapped in a Tauri 2 native shell. Six workspaces (`ai`, `gaming`, `work`, `personal`, `home`, `media`) plus a separate `/settings/:section?` context. Cross-platform desktop target (Linux/macOS/Windows) with a web build for browsers.

Shell layout in `src/App.vue`: **Sidebar | Workspace | main | AIAvatar**, where `main` renders Dashboard / SubsectionView / N8nFlowView / OpenPencilEditor depending on `lifeos.activeSub`.

## Common commands

Use **`bun`**, not npm. (Corrected 2026-07-07: the previously documented mise-managed toolchain does not exist on this host; toolchain ownership is migrating to the Yazelix/Nix foundation — see the Toolchain section in `AGENTS.md`.) Tauri's `beforeDevCommand`/`beforeBuildCommand` already invoke `bun run dev`/`bun run build`.

```bash
bun install                 # install JS deps
bun run dev                 # Vite dev server on :1420 (strict port — Tauri expects it)
bun run tauri:dev           # Tauri shell + Vite HMR; opens a 1280×800 dark window
bun run test                # Vitest, all specs (happy-dom + @vue/test-utils)
bun run test:watch          # Vitest watch mode
bun run test:coverage       # Vitest + v8 coverage
bun run build               # vue-tsc --noEmit, then `vite build` to dist/
bun run tauri:build         # Native installer (.deb / .AppImage on Linux); slow — on demand only

# Run one spec file
bunx vitest run tests/Sidebar.spec.js
# Run a single test by name
bunx vitest run -t "renders the brand toggle"
```

Verification before claiming done (from `AGENTS.md`): `bun run test` passes, `bun run dev` mounts `#app` without console errors, `bun run build` succeeds. Tauri builds only on explicit request.

## Architecture beats you only see by reading multiple files

### Path alias `@/` → `src/` is declared in three places

`tsconfig.json` + `vite.config.ts` + `vitest.config.ts` all set it. Vitest *also* aliases `lucide-vue-next` → `tests/__mocks__/lucide-vue-next.js` so the 600 KB icon pack doesn't load in unit tests. If you add a new test setup or build tool, you must wire the alias there too or imports break asymmetrically.

### Legacy `.js` siblings exist alongside `.ts` for the preview path

`src/stores/lifeos.ts` ↔ `src/stores/lifeos.js`, `src/lib/resolve.ts` ↔ `src/lib/resolve.js`, `src/lib/persistence.ts` ↔ `src/lib/persistence.js`. The `.js` versions feed the in-browser CDN preview path; the `.ts` versions are the production source. **They must be kept sibling-identical until the preview is retired.** When you change `sendAiMessage`, `setAiProvider`, the `LIFEOS_PERSIST_KEYS` whitelist, or any persisted getter/action, change both.

### `data.js` is the shared content layer

Workspaces, sections, items, aggregators, and "flows" all come from `data.js` (`LIFEOS_DATA` / `LIFEOS_AGGREGATORS` / `LIFEOS_FLOWS`). It's plain JS so the preview can `import` it from a `<script type="module">`. Don't TypeScript-port it without a coordinated plan.

### Dual-mode AI provider — don't break Vitest

`sendAiMessage(text, opts)` in `stores/lifeos.{ts,js}` behaves differently depending on `window.__TAURI__`:

- **Plain Vite / Vitest** → keeps the legacy canned-reply path. The 65+ test suite depends on this. Do not make the store unconditionally call `invoke()`.
- **Tauri host** → `invoke("ai_complete", { prompt, source })` → Rust → provider HTTP. On reject, push the literal calm error string: *"LifeOS couldn't reach the AI provider right now — try again."*

Rust side (`src-tauri/src/lib.rs`) exposes `ai_complete`, `ai_provider_get`, `ai_provider_set`. Keys come from OS keyring (`service: "lifeos"`, account: `anthropic` | `openai` | `gemini`) with env-var fallback (`ANTHROPIC_API_KEY` etc.). HTTP uses `reqwest` with `rustls-tls` — **don't pull in `openssl-sys`**.

### Persistence is a strict whitelist, debounced

`src/lib/persistence.ts` no-ops outside Tauri. Inside Tauri it persists only `LIFEOS_PERSIST_KEYS`: `activeId`, `wsCollapsed`, `sectionByWs`, `aiAvatarHidden`, `aiChatOpen`, `avatarPos`, `aiProvider`, `teamOrder`, `sectionOrder`, `itemOrder`. Explicitly excluded: `aiMessages` (would replay stale chat), `activeSub` / `pendingExpand` (URL-driven), `cmdkOpen` / `cmdkSeed` / `extraItems` / `extraSections` (ephemeral). Writes debounce at 300ms. If you add a new store key and want it to survive restart, add it to both the `.ts` and `.js` whitelist — nowhere else.

### OpenPencil mounting gate in `App.vue`

`OpenPencilEditor.vue` only mounts when the active sub has `view: "open-pencil"`. The gate is:

```vue
v-else-if="lifeos.activeSub.item?.view === 'open-pencil'"
```

Lose that condition and OpenPencil-tagged subs fall through to `<SubsectionView>` and the editor never renders. File navigation into the editor must go through `useNav().pickSub(...)` so the `view` field is set.

### Routing mirrors workspace state to the URL

`/workspace/:id/:section?/:sub?` is the canonical pattern. `?view=flow` switches `main` from `SubsectionView` to `N8nFlowView`. `/settings/:section?` is **not** a workspace — it lives outside the workspace tree. The native menu's Cmd-, emits `lifeos:navigate` → `/settings` (handled in `main.ts`).

### Storage layer (Rust-side only)

Added in `database-storage-foundation`. Owned entirely by `lifeos-core` + the Tauri shell — the Vue layer never touches the DB directly.

- **Feature flags**: `storage` in `crates/lifeos-core/Cargo.toml` owns PostgreSQL/RuVector storage; `legacy-sqlite-import` is a one-way read-only importer enabled only by the desktop shell. ESP32/`no_std` consumers turn storage off with `default-features = false`. Guard: `cargo check -p lifeos-core --no-default-features` must always pass.
- **Canonical store**: `LIFEOS_DATABASE_URL` must name PostgreSQL. The application rejects SQLite URLs and verifies that `ruvector` is installed in schema `extensions`. Administrative bootstrap lives at `crates/lifeos-core/sql/bootstrap-postgres-ruvector.sql`.
- **Init sequence**: inside `tauri::Builder::setup()` (before any IPC command fires): `Storage::from_runtime_env` → `storage.migrate()` → extension verification → legacy JSON/SQLite imports. On any failure the app refuses to start with a calm initialization error.
- **`db_health` command**: returns `DbHealth { status, database_id, applied_migrations, last_migration_version, ruvector_extension_version, schema_version }`; `database_id` never contains credentials.
- **`db_migrate` command**: re-runs `sqlx::migrate!` (idempotent) in PostgreSQL.
- **Legacy migration**: `account.json`, UI/provider JSON state, and the historical `lifeos.db` are opened/read only, copied with their source bytes into PostgreSQL in a transaction, and removed only after commit. A conflicting record fails closed and leaves the local source intact.
- **Module layout**: `crates/lifeos-core/src/storage/{mod,error,accounts,legacy_sqlite,mempalace,ruvector,state}.rs`; numbered migrations at `crates/lifeos-core/migrations/000N_*.sql`.
- **ESP32 isolation test**: `cargo tree -p lifeos-core --features storage | grep openssl-sys` must be empty.

### DESIGN.md is the agent-readable token source

Added in `design-md-format-adoption`. Three files form the design-system contract:

- **`DESIGN.md`** (repo root) — normative agent-readable spec following Google Labs' `@google/design.md@0.1.1` format. YAML front matter holds tokens (colors / typography / rounded / spacing / components); markdown body has 8 canonical sections. Lint with `bun run design:lint` (must exit 0, 0 errors).
- **`colors_and_type.css`** — runtime CSS variable consumer. Every opaque `#hex` in this file must mirror a token in `DESIGN.md`'s `colors:` map.
- **`design-system-reference/README.md`** — long-form brand prose, voice, asset attribution.

Drift gates:
- `bun run design:lint` enforces `broken-ref` (errors on unresolved `{token.path}` references) and `contrast-ratio` (warns on WCAG AA fails).
- `bun run design:diff` (via `scripts/design-diff.mjs`) compares HEAD~1 against HEAD and fails on token-level regressions in `colors / typography / rounded / spacing` unless allowlisted in `scripts/design-diff.allow`.
- Component-level a11y suite at `tests/a11y/*.spec.ts` runs via `bun run test:a11y` against the 9 dedicated views + 4 overlays + 6 component variants — 32 axe assertions, 0 violations enforced.

Exports regenerate from `DESIGN.md`: `bun run design:export` writes `design-system-reference/exports/tokens.json` (DTCG) and `tailwind.theme.json` (Tailwind v3 `theme.extend`). Both byte-deterministic — checked in.

### Vite build splits vendor chunks deliberately

`vite.config.ts` `manualChunks` separates `lucide`, `vue-router`, `pinia`, `vue`, and a residual `vendor`. Lucide alone is ~600 KB — keep it in its own chunk so the main app chunk stays small and vendor chunks cache across releases. Don't collapse this back into a single chunk.

## Non-negotiable design contracts

From `design-system-reference/README.md` (summarized — read the source for nuance):

- **Tokens, not literals.** All color/spacing/radii/shadow come from `colors_and_type.css` CSS variables. No inline hex, ever.
- **Dark-first.** `--bg-0` page, `--bg-2` cards, `--fg-1` text. `--gradient-spiral` (cyan→purple→green) is the only chromatic moment — never as a full background wash.
- **Lexend everywhere** except the Rigelstar wordmark. JetBrains Mono for shortcuts/timestamps/hex.
- **Lucide icons only** via `lucide-vue-next` (or the `Icon.vue` wrapper). Stroke 1.5; 16px in rows, 14px in buttons, 20px in rails. No emoji, no unicode-as-icon, no PNG iconography.
- **One brand mark per screen**, **one brand glow per viewport** (status pulses don't count).
- **Voice**: calm, second-person, present-tense, sentence-case. AI suggestions prefixed with `LifeOS suggests:`.

## Vue / TypeScript conventions

- `<script setup>` with **explicit `defineProps()` schemas** — inferred props caused the icon-click bug recorded in `AUDIT.md`. Do not repeat.
- TypeScript for everything new under `src/`. (Watch the `.ts`/`.js` sibling contract above.)
- Tests live under `tests/` mirroring component layout. Every interactive surface ships with a spec.
- Tauri-only code must be guarded by `window.__TAURI__` so the spec suite and the browser preview path stay green.

## Tauri specifics

- Window: 1280×800 default, 960×640 min, dark theme, decorated, resizable.
- FS scope locked to `$APPDATA/lifeos/*` (vault + user data). Everything else off.
- System tray icon configured but disabled until a user opts in.
- CSP allows Google Fonts (Lexend / JetBrains Mono) plus IPC.
- Linux system deps already installed on this host (`webkit2gtk-4.1`, `libsoup-3.0`, `gtk-3`, `libxdo`, `ayatana-appindicator3`, `librsvg2`, `build-essential`).

## Hard rules (from `AGENTS.md`)

- **Upgrades, never downgrades** — never remove functionality without explicit user consent.
- **Heal, do not harm** — surgical changes, verify before committing.
- **Never commit without `bun test` passing and the dev server booting.**
- All changes must remain compatible with the OpenPencil in-app editing flow.

> **GitNexus status: mandatory (provisional).** Retained *as-is* and mandated alongside RTK, ICM, and GitKB (see "Mandatory agent tooling — RTK · ICM · GitKB · GitNexus" above). It is demoted only once the GitKB + ICM combination is *proven* to fill its gap.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **lifeos** (10830 symbols, 17879 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/lifeos/context` | Codebase overview, check index freshness |
| `gitnexus://repo/lifeos/clusters` | All functional areas |
| `gitnexus://repo/lifeos/processes` | All execution flows |
| `gitnexus://repo/lifeos/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Active-tool `~/.local/share` state — restart-gated migration to the Meta payload

**Status (2026-07-21).** Sole remaining `.local` residual in the FlexNetOS operational
environment. Meta-repo docs conformance and meta-root `.local` are already done
(meta PR #110; ~1.7G of dev-host `.local`/shadow state relocated to `meta/var/archives/`;
single nix-profile owner confirmed). This note records the one piece that a session-
internal agent structurally cannot finish.

**Subject.** The FlexNetOS agent tools `icm`, `rtk`, `yazelix`, `weave`, `env-ctl` keep
durable data under `~/.local/share/<tool>` because `XDG_DATA_HOME` is unset (→
`~/.local/share`). Under the single-profile path law and the RuVector blueprint (files
are projections; one canonical source), that durable tool state belongs in the Meta
payload `meta/var/xdg-data/<tool>` — the tier already hosting
`var/lib/{postgresql,ruvector,agentdb,envctl,gitkb}`.

**Why it cannot be eliminated from inside a running session (empirically verified).**
An agent running inside a yazelix session cannot remove the `.local` its own live
toolchain is bound to:
- Tools resolve their data dir from the session env at process start; the running
  process's env is immutable mid-session.
- `~/.local/share/yazelix` is written continuously by the **running zellij** that hosts
  the session (`YAZELIX_STATUS_BAR_CACHE_PATH`, `STARSHIP_CONFIG`) — un-movable without
  ending the session.
- ICM's `[store].path` config key is parsed but **ignored** for the default DB (only
  `--db` / `ICM_DB` / the XDG default apply — its docs say "the CLI reads the DB only
  from `--db`"; tested: a probe with `[store].path` set still landed in `~/.local`).
- `rtk` has no data-dir config (`[tracking]/[display]/[filters]/[tee]/[telemetry]/
  [hooks]/[limits]` only).
- envctl's `bootstrap_env_vars` table is inert without regeneration, and `envctl` is not
  on PATH from an in-session shell — so its committer path is unreachable in-session.
- Removing a dir → recreated on the next tool call (env still points there). Root
  bind-mount and symlinks are disallowed; a session cannot restart itself.

**The fix (owner action; one session restart).** Single lever = `XDG_DATA_HOME` /
`XDG_STATE_HOME`, owned by envctl's agent-env engine
(`meta/var/lib/envctl/tables/bootstrap_env_vars.csv`; rows currently point at
`~/.local/share` / `~/.local/state`):
1. `meta/var/ops/migrate-tool-state-off-dotlocal.sh migrate` — copy
   `~/.local/share/{tools}` → `meta/var/xdg-data` (+ `xdg-state`); verifies icm db
   integrity. (100M already staged; re-run to sync before restart.)
2. Via **envctl's committer** (sole authoritative committer — do NOT hand-edit the live
   table): `XDG_DATA_HOME` → `/home/flexnetos/meta/var/xdg-data`, `XDG_STATE_HOME` →
   `/home/flexnetos/meta/var/xdg-state`; add
   `ICM_DB=/home/flexnetos/meta/var/xdg-data/icm/memories.db`; leave `YAZELIX_STATE_DIR`
   unset (yzx baked default `/run/user/1001/yazelix/profile-runtime/yazelix`).
3. **Restart the yazelix session** so the agent env adopts the new roots.
4. `migrate-tool-state-off-dotlocal.sh verify` → `finalize` (removes
   `~/.local/share/{tools}` + `~/.local/state/env-ctl`; `finalize` refuses unless
   `XDG_DATA_HOME` is already redirected).

Full runbook: `meta/var/ops/README-migrate-tool-state.md`.

<!-- vox:start -->
After completing a significant task, call `vox -l fr "résumé en français"` to give a spoken summary.
<!-- vox:end -->

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
rtk uv run <cmd>        # Compact uv project command output
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

<!-- icm:start -->
## Persistent memory (ICM) — MANDATORY

This project uses [ICM](https://github.com/rtk-ai/icm) for persistent memory across sessions.
You MUST use it actively. Not optional.

### Recall (before starting work)
```bash
icm recall "query"                        # search memories
icm recall "query" -t "topic-name"        # filter by topic
icm recall-context "query" --limit 5      # formatted for prompt injection
```

### Store — MANDATORY triggers
You MUST call `icm store` when ANY of the following happens:
1. **Error resolved** → `icm store -t errors-resolved -c "description" -i high -k "keyword1,keyword2"`
2. **Architecture/design decision** → `icm store -t decisions-{project} -c "description" -i high`
3. **User preference discovered** → `icm store -t preferences -c "description" -i critical`
4. **Significant task completed** → `icm store -t context-{project} -c "summary of work done" -i high`
5. **Conversation exceeds ~20 tool calls without a store** → store a progress summary

Do this BEFORE responding to the user. Not after. Not later. Immediately.

Do NOT store: trivial details, info already in this file, ephemeral state (build logs, git status).

### Other commands
```bash
icm forget <id>                          # remove a memory by ID
icm list --all                           # list all memories
icm list --topic <name>                  # list memories in a topic
icm update <id> -c "updated content"     # edit memory in-place
icm health                                # topic hygiene audit
icm topics                                # list all topics
```
<!-- icm:end -->

## GitKB

This project uses GitKB for knowledge management.

@.kb/AGENTS.md
