# AGENTS.md — operating contract for ubuntu-lifeos

This file is the durable operating contract for any AI agent (Claude Code, Codex, Gemini, etc.) working in this repo. It overrides generic defaults. Read it before making changes.

The contract is sourced from `design-system-reference/sot.md` (the user's verbatim brief) and adapted for this concrete repo layout.

## Mandate: Boil the Ocean (Garry Tan) — the always-on target

> Remember when implementing: the marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that I am genuinely impressed—not politely satisfied, actually impressed. Never offer to "table this for later" when the permanent solution is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard is not "good enough"—it is "holy shit, that is done." Search before building. Test before shipping. Ship the complete thing. When I ask for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

**Boil-the-Ocean is the target. The Karpathy execution rules (below, under `## Karpathy execution rules`) are the style that gets you there without sprawl, speculation, or unverified claims.** Both apply on every task: finish the asked-for scope completely, and do it surgically and verifiably.

---

## Role

Senior UI/UX engineer + design-systems architect on a **Vue 3 + Tauri 2** desktop/cross-platform app. The product is **LifeOS** — an AI agent that runs the user's work, personal, and home-automation surfaces. The design system is the **LifeOS Design System** (`design-system-reference/`). Tokens, voice, components, and motion rules are non-negotiable.

## Fundamental rules (non-negotiable)

- **Cross-check everything. Triple-verify everything.**
- No hallucinations. No deception. No uncertainty. No omissions.
- No assumptions. No over-claiming. No vague terms.
- No skipping verification. No fabricated data, citations, or logs.
- No implied completion without verification (`bun test`, dev-server boot, Tauri build).
- **Upgrades, never downgrades** — improve code quality, security, maintainability; modernize patterns; never remove functionality without explicit user consent.
- **Heal, do not harm** — preserve working functionality; make surgical, targeted changes; verify before committing.
- **Cross-check and verify** — check for conflicts with existing code, validate against conventions, verify env var and path compatibility, use latest stable toolchains where possible.

## Karpathy execution rules (mandatory — the execution style)

Full reference: `andrej-karpathy-skills:karpathy-guidelines`. **Boil-the-Ocean (top of file) is the target; these four rules are the style that gets you there.** They govern *how* you work; the rest of this file governs *what* to build. They turn the urge to over-deliver into completeness-within-scope rather than sprawl, speculation, or unverified shipping.

1. **Think before coding.** Surface assumptions explicitly. If multiple interpretations of the request are plausible, name them — don't pick silently. If a simpler approach exists, say so and push back when warranted. When genuinely unclear, stop and ask rather than guessing.
2. **Simplicity first.** Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. No error handling for impossible scenarios. If 200 lines could be 50, rewrite it. A senior engineer must not be able to call it overcomplicated.
3. **Surgical changes.** Touch only what the task requires. Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style even if you'd write it differently. Remove imports/variables/functions YOUR changes orphaned; if you notice pre-existing dead code, mention it — don't delete it. Every changed line must trace directly to the user's request.
4. **Goal-driven execution.** Convert each task into verifiable success criteria up front: "add validation" → tests for invalid inputs that must pass; "fix the bug" → failing reproducer that must turn green; "refactor X" → tests pass before and after. For multi-step tasks state a brief plan with a `verify:` check per step. Loop until verified; never claim completion before producing the evidence required by **Verification commands** below.

These rules harmonize with the Fundamental rules above: no hallucination, no over-claiming, no implied completion. Karpathy specifies the *positive* discipline; the Fundamental rules specify the *prohibitions*.

## Architecture anchor — RuVector data-pipeline blueprint

`Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` (repo root) is the **normative architecture and data-pipeline authority** for this repository. Read it before substantive architecture, storage, ingress, or release work, and conform to its "HARD EXECUTION RULES — READ FIRST" (21 rules) and "Operational invariants and acceptance" (19 invariants). Its opening law: *"EVERYTHING means EVERYTHING. EVERY BYTE means EVERY BYTE."* The blueprint is itself anchored to `Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED(3).md` (SHA-256 `abd36f1c…`) as its normative topology authority.

Anchor invariants that bind day-to-day work here:

- **PostgreSQL 17.10 + RuVector is the canonical durable macro-state and the Swarm Primary Runtime** — it hosts host ALL data, and after cutover all work happens inside it. (The repo's Rust storage layer in `crates/lifeos-core` already treats PostgreSQL/RuVector as canonical and rejects SQLite URLs.)
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

## Application architecture (LifeOS)

### Workspaces (6 — addressable via `:id` on the rail)

| id | Title | Sections |
|----|-------|----------|
| `ai` | AI Command Center | Rules · Goals · Ideas · Agent Teams |
| `gaming` | Gaming | L1 *Who Am I* (self-discovery) · L2 *Sherlock* (deduction). Higher level → more AI autonomy. |
| `work` | Work | Legal · Finance · Sales · Marketing · Operations · Files · Contacts · Calendar · Analytics |
| `personal` | Personal *(Family sub-section)* | Finance · Health · Legal · Files · Calendar · Wallet · Social Media · Contacts |
| `home` | Home Automation | IoT · Appliances · TV · Streaming · Movies · Photos · Videos · Energy · Gas · Energy Storage · Water · Food · Irrigation · Lights · Pool · Network |
| `media` | Media | Photos · Socials · Videos · Streaming |

### Persistent global icons (bottom-left rail — NOT workspace-specific)

Aggregate identical data from matching sections across all workspaces (e.g. Work Calendar + Personal Calendar → unified Calendar view). Backed by `LIFEOS_AGGREGATORS` in `data.js`.

1. Settings
2. Favorites
3. Notifications
4. Calendar (aggregated)
5. To-Do
6. Knowledge
7. Contacts

### Settings / Profile (separate from workspaces)

Lives at `/settings/:section?`. Contents:

- Secrets, keys, certificates, registry, environment variables (FS-scoped to `$APPDATA/lifeos/vault/*` via Tauri).
- Account logins and passwords.
- Hardware inventory: PC, Phone, Laptop, compute devices, data-storage devices, memory devices.

## Visual contract (one-line summary)

> Calm dark-first OS · tri-node arc mark · cyan→purple→green spiral gradient as the only chromatic moment · Lexend for everything except a Rigelstar display wordmark · never use emoji.

Full spec: `design-system-reference/README.md`. Read it front-to-back the first time you touch UI.

Tokens you will use constantly (defined in `colors_and_type.css`):

```
--bg-0  --bg-1  --bg-2  --bg-3  --bg-4
--fg-1  --fg-2  --fg-3
--lifeos-cyan  --lifeos-purple  --lifeos-green
--gradient-spiral  --gradient-radial-glow
--radius-md (8) --radius-lg (12) --radius-xl (16)
--shadow-glow-cyan/purple/green
```

## Code conventions

- **Vue 3 `<script setup>`** with explicit `defineProps()` schemas (the AUDIT.md icon-click bug was caused by inferred props — never repeat).
- **TypeScript** for everything new under `src/`. Legacy `.js` siblings (`stores/lifeos.js`, `lib/resolve.js`) exist for the in-browser preview path and must be kept in sync until they're retired.
- **Path alias `@/` → `src/`** (set in `tsconfig.json` + `vite.config.ts` + `vitest.config.ts`).
- **Lucide icons only** via `lucide-vue-next` (or the `Icon.vue` wrapper). Stroke 1.5, 16px in rows, 14px in buttons, 20px in rails.
- **Tests live under `tests/`** mirroring component layout. Every interactive surface needs a spec. New components ship with their spec.
- **Never commit without `bun test` passing and the dev server booting.**

## Task pipeline (from sot.md)

Execute in order:

1. **Phase 1 — Load skills & analyze framework architecture.** State active skill modules. Analyze component hierarchy, routing, state management, design-token impl, inter-workspace data sync.
2. **Phase 2 — Gap, inconsistency, conflict & disconnect analysis.** Exhaustive findings (no vague items).
3. **Phase 3 — Prioritized upgrade plan.** Critical / High / Medium / Low — each with problem · root cause · proposed solution · affected files · complexity.
4. **Phase 4 — Implementation.** Production-ready code. Each change verified before moving on.
5. **Phase 5 — Verification & integration readiness.** Cross-check vs Phase 2. 100% of Critical + High resolved. No regressions. Close with the literal sentence: **"All subjects are 100% complete, 100% healthy, and 100% ready for integration"** — or list what remains and why.

## Constraints

- No modules off-limits. All code in scope.
- Never remove an existing feature without explicit user approval.
- All changes must remain compatible with **OpenPencil** local editing (the in-browser SFC editor flow — see `design-system-reference/lifeos_app_react/` for the canonical UI behaviors).
- LifeOS Design System is the visual + structural source of truth.
- Use latest stable Vue 3 + Tauri toolchain.
- Surgical, targeted changes only — no wholesale rewrites unless structural failure makes targeted changes impossible (must be explicitly justified).

## Toolchain (host reality, corrected 2026-07-11)

The Yazelix/Nix foundation (`lifeos_foundation_yzx`) owns the active Bun
toolchain. `bun` and `bunx` resolve through the profile package's `toolbin` and
then to the immutable Nix-store Bun executable. The previously documented
"mise-managed" toolchain does not exist on this host. Verify every toolchain
receipt with `command -v`, `readlink -f`, and the tool's version before trusting
it; a legacy `FlexNetOS/usr/bin` result is stale-shadow evidence, not an
alternate owner.

Use `bun` for npm-compatible package management and JS execution, and `bunx`
for npx-compatible package execution. Tauri's `beforeDevCommand` /
`beforeBuildCommand` already point at `bun run dev` / `bun run build`.

## Planning-spine instant recall

Start planning work at `planning-spine-v0/navigation/README.md`. The committed graph
is repository-native and remains usable when GitKB or GitNexus is absent,
stale, or pointed at another checkout.

```bash
bun run planning-spine:navigation:query -- "STORE-001"
bun run planning-spine:navigation:query -- "redb PostgreSQL authority"
bun run planning-spine:navigation:explain -- "claim:REDB-CLAIM-002"
bun run planning-spine:navigation:check
```

The generated graph is a navigation projection, not a new authority source.
Canonical task inputs, exact proof history, maintained contracts, and raw
architecture inputs retain the authority order documented in
`planning-spine-v0/navigation/README.md`.

## Verification commands

```bash
bun run test              # Vitest — all specs must pass (currently 65+ across 11 files)
bun run dev               # Vite dev server on :1420 — must mount #app without console errors
bun run tauri:dev         # Tauri shell must open a 1280×800 dark window
bun run build             # vue-tsc + Vite production build must succeed
bun run tauri:build       # Native installer build must succeed (slow; only run on demand)

# Rust storage layer (added in database-storage-foundation)
cargo check --workspace                                    # full workspace must compile clean
cargo check -p lifeos-core --no-default-features          # ESP32/no_std isolation must hold
cargo test -p lifeos-core --features storage              # storage round-trip + property tests
cargo tree -p lifeos-core --features storage | grep openssl-sys   # must be empty

# DESIGN.md + a11y gates (added in design-md-format-adoption)
bun run design:lint       # @google/design.md lint — must exit 0 (0 errors)
bun run test:a11y         # vitest-axe component-level a11y — must be 0 violations
bun run design:export     # regenerate DTCG tokens + tailwind theme; deterministic (md5 stable)
bun run check             # umbrella: vue-tsc + test + test:a11y + design:lint
```

## OpenPencil flow

`OpenPencilEditor.vue` is the in-app editor surface for [open-pencil](https://github.com/FlexNetOS/open-pencil/tree/develop). Its design is **AI-mediated**, not free-form keyboard editing — the user describes a change in natural language, LifeOS proposes a diff, and (on user confirm) the diff is applied to the running SFC.

Runtime contract:

1. The editor renders the active SFC inside its canvas pane. The mock layer + AI chat strip live in the right rail of `OpenPencilEditor.vue`.
2. AI chat messages tagged `source: "open-pencil"` get the special canned reply pattern ("I'll refactor and run `bun run check` before flagging the PR back."). See `stores/lifeos.ts → sendAiMessage`.
3. **File navigation routes through `useNav().pickSub(...)`** with `view: "open-pencil"` on the item. That's what tells `App.vue` to mount `<OpenPencilEditor>` instead of `<SubsectionView>`.
4. **Persistence boundary**: edits are buffered in-memory until the user clicks Apply (not yet wired). When Apply is wired, its durable source and audit record must go through PostgreSQL/RuVector (`lifeos_blob` plus a maintained projection), never a Tauri app-data file.
5. The legacy `#__om-edit-overrides` inline style block (from the bundle's CDN preview `index.html`) is no longer present in the production entry — OpenPencil rewrites the SFC source instead of injecting `!important` overrides.

If you change SFC mounting logic in `App.vue`, keep this gate intact: `v-else-if="lifeos.activeSub.item?.view === 'open-pencil'"`. Without it, OpenPencil-tagged subs fall through to `SubsectionView` and the editor never mounts.

## AI provider

`sendAiMessage(text, opts)` in `stores/lifeos.{ts,js}` is dual-mode:

- **Plain Vite dev / Vitest** (no `window.__TAURI__`) — keeps the historical canned-reply behavior so the 85-test suite, OpenPencil mocks, and standalone preview path stay green.
- **Tauri host** — dispatches the user message immediately, then `invoke("ai_complete", { prompt, source })` against the Rust backend. On resolve the reply is appended; on reject a calm error string is pushed: *"LifeOS couldn't reach the AI provider right now — try again."*

The Rust side (`src-tauri/src/lib.rs`) exposes three commands:

| Command | Purpose |
|---|---|
| `ai_complete(prompt, source) -> Result<String, String>` | Routes to the active provider; returns the reply or the calm error string. |
| `ai_provider_get() -> Result<String, String>` | Reads the canonical PostgreSQL `ai-provider` projection; defaults to `"claude"` when absent. |
| `ai_provider_set(provider) -> Result<(), String>` | Persists the validated choice to the canonical PostgreSQL `ai-provider` projection. |

Provider selection lives in `lifeos_runtime.projection` under key `ai-provider` as `{ "provider": "claude" | "openai" | "gemini" }`. A pre-cutover `<app_data_dir>/ai.json` is imported byte-for-byte into PostgreSQL before it is retired. The store mirrors that as `aiProvider` (state) + `availableAiProviders` (getter) + `setAiProvider(name)` (action) — sibling-identical between `lifeos.ts` and `lifeos.js`.

API-key lookup per provider, in order: OS keyring (`service: "lifeos"`, account: `"anthropic" | "openai" | "gemini"`) via the `keyring` crate, then env var fallback (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`). Either path is sufficient; both missing surfaces the calm error to the UI. HTTP uses `reqwest` with `rustls-tls` (no `openssl-sys` C build).

## UI state persistence

The Pinia `lifeos` store survives app restarts in the Tauri shell via the persistence plugin at `src/lib/persistence.{ts,js}`. Outside Tauri (plain Vite dev / Vitest) the plugin no-ops — no read, no subscribe — so the test suite, OpenPencil mocks, and browser preview stay byte-identical to before.

Wiring lives in `src/main.ts`:

```ts
const pinia = createPinia();
pinia.use(tauriPersistence({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS }));
app.use(pinia);
```

The Rust side (`src-tauri/src/lib.rs`) exposes two stable commands backed by the canonical PostgreSQL projection table:

| Command | Purpose |
|---|---|
| `ui_state_read() -> Result<String, String>` | Reads `lifeos_runtime.projection` key `ui-state`; returns `"{}"` when absent. |
| `ui_state_write(state) -> Result<(), String>` | Validates and atomically writes the serialised slice to `lifeos_runtime.projection`. |

`lights_state_read` / `lights_state_write` use the same PostgreSQL projection boundary under key `lighting-state`. Legacy `ui-state.json`, `lighting.json`, and `ai.json` sources are captured as raw PostgreSQL blobs and retired only after their import transaction commits.

Persisted keys (whitelist in `LIFEOS_PERSIST_KEYS`): `activeId`, `wsCollapsed`, `sectionByWs`, `aiAvatarHidden`, `aiChatOpen`, `avatarPos`, `aiProvider`, `teamOrder`, `sectionOrder`, `itemOrder`. Transient (`aiMessages`), URL-driven (`activeSub`, `pendingExpand`), and ephemeral UI (`cmdkOpen`, `cmdkSeed`, `extraItems`, `extraSections`) are intentionally excluded — `aiMessages` would replay stale chat, the URL surfaces re-derive `activeSub`/`pendingExpand` on every nav, and `cmdkOpen` is a transient overlay. Writes are debounced (default 300ms) so rapid mutations coalesce into a single disk hit.

@RTK.md

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
