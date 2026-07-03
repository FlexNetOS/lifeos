## 1. Devdep & preflight

- [x] 1.1 Preflight: `bun pm view @google/design.md version` (or `npm view`) — confirm a published version is resolvable from the configured registry; record the resolved version in this file as a comment on Task 1.3
- [x] 1.2 Preflight: verify the package resolves from `registry.npmjs.org` even though `publishConfig` points to `wombat-dressing-room.appspot.com` (Google's signed-publish proxy); if `bun add` fails, fall back to `bun add @google/design.md --registry https://registry.npmjs.org/`
- [x] 1.3 Add `@google/design.md` (exact version, no `^` — alpha schema), `vitest-axe@^0.1`, `axe-core@^4.10` to `devDependencies` in `package.json` via `bun add -d`
- [x] 1.4 Verify `bun install` produces a clean lockfile; `bun pm ls @google/design.md vitest-axe axe-core` lists all three
- [x] 1.5 Verify `bunx designmd --help` (prefer the `designmd` alias over `design.md` for cross-platform script safety per upstream README) prints the CLI usage
- [x] 1.6 Confirm no runtime deps were added: `bun pm ls --production` does not list `@google/design.md`, `vitest-axe`, or `axe-core`

## 2. DESIGN.md authored at repo root

- [x] 2.1 Create `DESIGN.md` at repo root with YAML front matter per design.md §D3 (colors / typography / rounded / spacing / components)
- [x] 2.2 Write 8-section markdown body per design.md §D4 (Overview / Colors / Typography / Layout / Elevation & Depth / Shapes / Components / Do's and Don'ts), 80–200 words per section
- [x] 2.3 Inside `## Components`, add a `### Synchronization` subsection noting the manual sync contract with `colors_and_type.css` until the auto-generation follow-up lands
- [x] 2.4 Run `bunx designmd lint DESIGN.md` — assert exit 0, 0 errors, ≤4 warnings (warnings expected: `orphaned-tokens` for unused aliases, `token-summary` info)
- [x] 2.5 Fix any `broken-ref` errors inline (must be 0 errors before this task is complete)
- [x] 2.6 Add `version: alpha` and a `# Validated by @google/design.md <resolved-version-from-1.1>` HTML comment at the top of DESIGN.md so the validation provenance is durable

## 3. package.json scripts

- [x] 3.1 Add `"design:lint": "designmd lint DESIGN.md"` to `scripts` (use the `designmd` bin per upstream README's portability note)
- [x] 3.2 Add `"design:export:dtcg": "designmd export --format dtcg DESIGN.md > design-system-reference/exports/tokens.json"`
- [x] 3.3 Add `"design:export:tailwind": "designmd export --format css-tailwind DESIGN.md > design-system-reference/exports/theme.css"`
- [x] 3.4 Add `"design:export": "bun run design:export:dtcg && bun run design:export:tailwind"`
- [x] 3.5 Create `scripts/design-diff.mjs` — Node/Bun script that: (a) runs `git show HEAD~1:DESIGN.md` into `/tmp/DESIGN.previous.md` (returns no-op exit 0 if there is no previous version on the branch), (b) calls `designmd diff /tmp/DESIGN.previous.md DESIGN.md`, (c) parses JSON output, (d) exits non-zero on any `tokens.{colors,typography,rounded,spacing}.removed` or `tokens.{colors,typography,rounded,spacing}.modified` entries unless the path appears in an allowlist file `scripts/design-diff.allow` (initially empty)
- [x] 3.6 Add `"design:diff": "node scripts/design-diff.mjs"` to scripts
- [x] 3.7 Add `"test:a11y": "vitest run --dir tests/a11y"` (filters to the new subdir; the existing `"test": "vitest run"` continues to invoke the global config)
- [x] 3.8 Add umbrella `"check": "vue-tsc --noEmit && bun run test && bun run test:a11y && bun run design:lint"` — single command for local pre-flight
- [x] 3.9 Run `bun run check` — fails initially (no DESIGN.md, no a11y specs); each subsequent section's exit criteria is the gate turning incrementally green

## 4. Vitest config — exclude a11y from default test run

- [x] 4.1 Update `vitest.config.ts` to add `exclude: ["tests/a11y/**", "**/node_modules/**"]` (the second is the vitest default — preserve it). This guarantees `bun run test` count stays at exactly 194 specs after this change (codex finding R-include)
- [x] 4.2 Verify: `bun run test 2>&1 | grep "Tests "` reports the unchanged baseline count
- [x] 4.3 Verify: `bun run test:a11y` discovers only files under `tests/a11y/` (until the suite is created, this reports 0 tests — expected)

## 5. Generated export artifacts

- [x] 5.1 Create `design-system-reference/exports/` directory; add `.gitkeep` if empty
- [x] 5.2 Run `bun run design:export:dtcg`; verify `tokens.json` is well-formed JSON (`jq empty tokens.json` exits 0)
- [x] 5.3 Run `bun run design:export:tailwind`; verify `theme.css` contains a `@theme { ... }` block
- [x] 5.4 Re-run `bun run design:export`; assert byte-identical artifacts (`md5sum` matches across two runs — determinism check, PBT P7). If non-deterministic key order, pipe through `jq -S` and document
- [x] 5.5 Commit both artifacts to the repo so consumers can read them without running the CLI
- [x] 5.6 Verify the generated `theme.css` is **NOT imported anywhere in `src/`** — `rg '@import.*theme\.css|from.*theme\.css' src/` returns empty (codex regression risk: artifact might be mistaken for a runtime stylesheet)

## 6. Vitest-axe wiring — augment existing setup.js

- [x] 6.1 Augment `tests/setup.js` **at the top** (before existing imports) with: `import { expect } from "vitest";`, `import { toHaveNoViolations } from "vitest-axe/matchers";`, `import "vitest-axe/extend-expect";`, `expect.extend({ toHaveNoViolations });`
- [x] 6.2 **Do NOT remove or modify any existing content** of `tests/setup.js` — the 14.4K of `LIFEOS_DATA`/`LIFEOS_AGGREGATORS`/`LIFEOS_FLOWS`/`TONE` fixtures and the existing `beforeAll` are non-negotiable (codex regression risk: replacement breaks 27 existing specs)
- [x] 6.3 Run `bun run test` — confirm 194 specs still pass after the setup augmentation; non-zero count delta is a hard blocker
- [x] 6.4 Create `tests/a11y/_axe-helper.js` per design.md §D6 — exports `expectNoA11yViolations(node, ruleSetOverride?)` plus a default `AXE_RULES` object running `wcag2a, wcag2aa, wcag21aa, best-practice`
- [x] 6.5 Create `tests/a11y/_mount-a11y.js` — shared helper that installs `setActivePinia(createPinia())`, optionally a `createMemoryHistory` router, and mounts a component with `attachTo: document.body`; returns the wrapper plus a `cleanup()` that calls `wrapper.unmount()` and removes the attach root. Centralises the contract codex flagged for Pinia/router/Tauri cleanup
- [x] 6.6 In `tests/a11y/_mount-a11y.js`, also provide a `withTauriMock(fn)` helper that sets `window.__TAURI__ = { ... }` for the duration of `fn()` and restores the previous value in `finally{}` — prevents leak between SettingsView / TelemetryWidget / LightsView a11y specs (codex regression risk)

## 7. A11y spec suite — landed in batches

Each spec file mounts the component with `mountA11y(...)`, awaits any necessary `flushPromises()`, calls `await expectNoA11yViolations(wrapper.element)`, then `cleanup()`. All specs are `.js` files (matches the existing 27-spec convention).

### Batch 7.A — dedicated views at idle (11 files)

- [x] 7.A.1 `tests/a11y/Sidebar.a11y.spec.js` — expanded + collapsed
- [x] 7.A.2 `tests/a11y/Workspace.a11y.spec.js` — default workspace
- [x] 7.A.3 `tests/a11y/Dashboard.a11y.spec.js`
- [x] 7.A.4 `tests/a11y/LightsView.a11y.spec.js`
- [x] 7.A.5 `tests/a11y/CalendarView.a11y.spec.js`
- [x] 7.A.6 `tests/a11y/FilesView.a11y.spec.js`
- [x] 7.A.7 `tests/a11y/HealthView.a11y.spec.js`
- [x] 7.A.8 `tests/a11y/IoTView.a11y.spec.js`
- [x] 7.A.9 `tests/a11y/ContactsView.workspace.a11y.spec.js` + `ContactsView.aggregator.a11y.spec.js` (two files — different mount modes)
- [x] 7.A.10 `tests/a11y/SettingsView.a11y.spec.js` — uses `withTauriMock` to stub `ai_complete` etc.
- [x] 7.A.11 `tests/a11y/OpenPencilEditor.a11y.spec.js` — mount the editor directly, bypass `App.vue` gate
- [x] 7.A.12 `tests/a11y/N8nFlowView.a11y.spec.js`
- [x] 7.A.13 Run `bun run test:a11y` after Batch 7.A — expect ≥11 files, 0 violations on every view

### Batch 7.B — overlays in open/closed states (4 files × 2 states = 8 specs)

- [x] 7.B.1 `tests/a11y/CommandPalette.a11y.spec.js` — closed + open (Ctrl+K) states
- [x] 7.B.2 `tests/a11y/KeyboardHelp.a11y.spec.js` — closed + open (`?` shortcut) states
- [x] 7.B.3 `tests/a11y/NotificationsDrawer.a11y.spec.js` — closed + open + with-unread states
- [x] 7.B.4 `tests/a11y/ToastContainer.a11y.spec.js` — empty + with-toasts states
- [x] 7.B.5 Run `bun run test:a11y` — expect zero violations including the overlay-open states (focus-trap + ARIA-modal critical here)

### Batch 7.C — stateful component variants (≥6 files)

- [x] 7.C.1 `tests/a11y/AIAvatar.a11y.spec.js` — hidden / visible / chat-open
- [x] 7.C.2 `tests/a11y/TelemetryWidget.a11y.spec.js` — loading / loaded / error states (mock Tauri `telemetry_get`)
- [x] 7.C.3 `tests/a11y/Button.a11y.spec.js` — primary / secondary / ghost / disabled variants. **Comment in file**: "Hover/focus-visible pseudo-classes are not reliably computed in happy-dom; this spec covers structural a11y of default + disabled states only. Hover-state contrast is verified by `bunx designmd lint` (token-level) and a future Playwright smoke" — codex finding R-pseudo-class
- [x] 7.C.4 `tests/a11y/MenuRow.a11y.spec.js` — idle / active states
- [x] 7.C.5 `tests/a11y/Badge.a11y.spec.js` — count / dot variants
- [x] 7.C.6 `tests/a11y/Icon.a11y.spec.js` — accessible name / decorative-only variants
- [x] 7.C.7 `tests/a11y/Login.a11y.spec.js` — form, labels, error states
- [x] 7.C.8 `tests/a11y/App-auth-gate.a11y.spec.js` — covers the auth-gate UI path
- [x] 7.C.9 Run `bun run test:a11y` — full suite green; report total spec count + total assertion count

### Batch 7.D — properties + meta-tests (4 files)

- [x] 7.D.1 `tests/a11y/_design-md-lint.spec.js` — invokes `bunx designmd lint DESIGN.md` via `child_process.execSync`, asserts exit 0 + parses JSON output + asserts no `error`-severity findings. Adds the lint check as a test-runtime gate (PBT P2)
- [x] 7.D.2 `tests/a11y/_design-md-broken-ref.spec.js` — writes `tests/__fixtures__/broken-design.md` with a deliberate `{colors.does-not-exist}` reference; invokes `bunx designmd lint`; asserts non-zero exit (PBT P4)
- [x] 7.D.3 `tests/a11y/_design-md-color-shape.spec.js` — parses `DESIGN.md` YAML, asserts every value under `colors:` matches `/^#[0-9a-fA-F]{6}$/`; asserts every `*Color` field under `components:` is hex, rgba, linear-gradient, or `{token-ref}` (PBT P5)
- [x] 7.D.4 `tests/a11y/_design-md-export-determinism.spec.js` — runs `bun run design:export` twice, compares md5 of the two outputs, asserts identical (PBT P7)

### Batch 7.E — CSS↔DESIGN.md sync check (codex finding)

- [x] 7.E.1 `tests/a11y/_css-design-sync.spec.js` — parses `colors_and_type.css` (regex over `--lifeos-cyan: #...`, `--bg-0: #...`, etc.), parses `DESIGN.md` YAML, asserts every opaque `#hex` value in CSS for the mapped tokens (per design.md §D3 mapping table) appears in `DESIGN.md` `colors:` map. Catches the drift codex flagged (PBT P8 first automated step)
- [x] 7.E.2 Add a comment at the top of `colors_and_type.css` pointing to `DESIGN.md` as the agent-readable mirror, and a `## Synchronization` subsection in `DESIGN.md` pointing back to `colors_and_type.css` as the runtime consumer

## 8. Documentation updates

- [x] 8.1 `design-system-reference/README.md` — prepend a 5-line header pointer per design.md §D4 (no existing content removed)
- [x] 8.2 `CLAUDE.md` — add a "Design system contract (token canonical file)" subsection under "Architecture beats you only see by reading multiple files" pointing at DESIGN.md as the agent-readable token source, `colors_and_type.css` as the runtime consumer, and `design-system-reference/README.md` as human prose; document the sync rule
- [x] 8.3 `AGENTS.md` — append `bun run check` to the "Verification commands" code block as the umbrella pre-flight
- [x] 8.4 `CHANGELOG.md` — entry under next version with: (a) bullet for `DESIGN.md` format adoption, (b) bullet for component-level axe baseline (~30 specs / ~50 assertions), (c) Apache-2.0 attribution for `@google/design.md`, (d) list of new scripts
- [x] 8.5 `TODO.md` — mark `google-design-incorporation` complete; add follow-ups: "Auto-generate DESIGN.md from colors_and_type.css", "GitHub Actions workflow for `bun run check`", "`@google/design.md` post-alpha migration", "Browser-backed Playwright axe lane for pseudo-state contrast (hover/focus-visible)"

## 9. Verification gate stack — must all pass

Run in this order. Any failure aborts the change.

- [x] 9.1 **Lint**: `bun run design:lint` — exit 0, 0 errors, ≤4 warnings; capture full JSON to `.omc/logs/design-lint-<date>.json` for audit
- [x] 9.2 **Type check**: `vue-tsc --noEmit` — green
- [x] 9.3 **Unit tests**: `bun run test` — **194 specs** exactly (the baseline; no count drift permitted from this change because a11y specs are excluded per Task 4.1)
- [x] 9.4 **A11y tests**: `bun run test:a11y` — ~30 spec files / ~50 axe assertions, 0 violations
- [x] 9.5 **Build**: `bun run build` — vue-tsc + Vite production build green; bundle size diff vs `main` ≤ ±1 KB (proves no runtime deps slipped in)
- [x] 9.6 **Tauri shell smoke**: `bun run tauri:dev` — opens 1280×800 dark window; manual click-through the 11 dedicated views — no console errors
- [x] 9.7 **Rust isolation (unchanged contract)**: `cargo check --workspace` green; `cargo check -p lifeos-core --no-default-features` green; `cargo tree -p lifeos-core --features storage | grep openssl-sys` empty
- [x] 9.8 **Determinism**: `bun run design:export` twice; `md5sum design-system-reference/exports/tokens.json design-system-reference/exports/theme.css` identical
- [x] 9.9 **Runtime-dep boundary**: `bun pm ls --production | grep -E '@google/design|vitest-axe|axe-core'` returns empty
- [x] 9.10 **No Tailwind leakage**: `rg '@import.*exports/theme.css|from.*exports/theme.css' src/` returns empty
- [x] 9.11 **Umbrella**: `bun run check` — single command, green

## 10. Closure

- [x] 10.1 Update `HANDOFF.md` with any traps surfaced during implementation (e.g. specific axe rules that needed per-spec disabling and why; happy-dom limitations encountered)
- [x] 10.2 Mark this change complete and prepare for OPSX archive on next archive sweep (rename to `2026-MM-DD-design-md-format-adoption` at archive time)
- [x] 10.3 Confirm closure ritual: "All subjects are 100% complete, 100% healthy, and 100% ready for integration" per `AGENTS.md` Phase 5
