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

## Toolchain (this host, mise-managed)

```
node 24.15.0 · bun 1.3.13 · rustc 1.95.0 · cargo 1.95.0 · tauri-cli 2.11.1
```

Use `bun` for everything JS (not npm). Tauri's `beforeDevCommand` / `beforeBuildCommand` already point at `bun run dev` / `bun run build`.

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
4. **Persistence boundary**: edits are buffered in-memory until the user clicks Apply (not yet wired). Real persistence will go via Tauri's `fs` plugin, scoped to `$APPDATA/lifeos/edits/*` (see `tauri.conf.json` plugins → `fs`).
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
| `ai_provider_get() -> String` | Reads `<app_data_dir>/ai.json`; defaults to `"claude"`. |
| `ai_provider_set(provider) -> Result<(), String>` | Persists the choice to `<app_data_dir>/ai.json`. |

Provider selection lives at `<app_data_dir>/ai.json` as `{ "provider": "claude" | "openai" | "gemini" }`. The store mirrors that as `aiProvider` (state) + `availableAiProviders` (getter) + `setAiProvider(name)` (action) — sibling-identical between `lifeos.ts` and `lifeos.js`.

API-key lookup per provider, in order: OS keyring (`service: "lifeos"`, account: `"anthropic" | "openai" | "gemini"`) via the `keyring` crate, then env var fallback (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`). Either path is sufficient; both missing surfaces the calm error to the UI. HTTP uses `reqwest` with `rustls-tls` (no `openssl-sys` C build).

## UI state persistence

The Pinia `lifeos` store survives app restarts in the Tauri shell via the persistence plugin at `src/lib/persistence.{ts,js}`. Outside Tauri (plain Vite dev / Vitest) the plugin no-ops — no read, no subscribe — so the test suite, OpenPencil mocks, and browser preview stay byte-identical to before.

Wiring lives in `src/main.ts`:

```ts
const pinia = createPinia();
pinia.use(tauriPersistence({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS }));
app.use(pinia);
```

The Rust side (`src-tauri/src/lib.rs`) exposes two commands plus a shared `state_file(name)` helper so future state slices reuse the same path:

| Command | Purpose |
|---|---|
| `ui_state_read() -> Result<String, String>` | Reads `<app_data_dir>/ui-state.json`; returns `"{}"` when the file doesn't exist yet. |
| `ui_state_write(state) -> Result<(), String>` | Overwrites `<app_data_dir>/ui-state.json` with the serialised slice. |

`lights_state_read` / `lights_state_write` route through the same helper, now pointing at `lighting.json`.

Persisted keys (whitelist in `LIFEOS_PERSIST_KEYS`): `activeId`, `wsCollapsed`, `sectionByWs`, `aiAvatarHidden`, `aiChatOpen`, `avatarPos`, `aiProvider`, `teamOrder`, `sectionOrder`, `itemOrder`. Transient (`aiMessages`), URL-driven (`activeSub`, `pendingExpand`), and ephemeral UI (`cmdkOpen`, `cmdkSeed`, `extraItems`, `extraSections`) are intentionally excluded — `aiMessages` would replay stale chat, the URL surfaces re-derive `activeSub`/`pendingExpand` on every nav, and `cmdkOpen` is a transient overlay. Writes are debounced (default 300ms) so rapid mutations coalesce into a single disk hit.
