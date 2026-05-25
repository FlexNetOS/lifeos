# HANDOFF.md — next-session orientation for LifeOS

Read this first when you (or any agent) return to `~/repos/ubuntu-lifeos/`.

## Current state (2026-05-25 — v0.1.5)

**Production-ready dashboard + cross-platform Rust foundation in place.** 9 dedicated subsection views, 4 overlay surfaces, 14 Tauri Rust commands (+1 `plugin_run` from the Wave 3 mlua spike), 217/217 Vitest specs, 0 axe violations on every surface, `bun run build` + `cargo check --workspace` both clean. The repo is now a Cargo workspace:

```
ubuntu-lifeos/
├── Cargo.toml                 # workspace root
├── src-tauri/                 # Tauri 2 desktop shell (workspace member)
├── crates/
│   ├── lifeos-core/           # portable Rust core — types, auth, MCP, plugin host
│   └── lifeos-daemon/         # headless Pi/Linux daemon (placeholder main; banner only)
└── firmware/esp32/            # ESP32-C6 no_std firmware (standalone — NOT a workspace member)
```

| Quick check | Command |
|---|---|
| Vitest | `bun run test` — expect 217/217 across 27 files |
| Web build | `bun run build` — vue-tsc + Vite, app ≈199 kB / 60 kB gzip |
| Web dev | `bun run dev` — Vite on :1420 |
| Native dev | `bun run tauri:dev` — opens 1280×800 dark window |
| Rust workspace check | `cargo check --workspace` (run from repo root) |
| `lifeos-core` tests with plugin host | `cargo test -p lifeos-core --features plugin-host` — expect 42 passed + 1 ignored |
| Cross-compile daemon to Pi 64-bit | `cargo check -p lifeos-daemon --target aarch64-unknown-linux-gnu` |
| ESP32-C6 firmware check | `cd firmware/esp32 && cargo check --target riscv32imac-unknown-none-elf` |
| Axe sweep | Run via Playwright MCP — inject `https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js`, call `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","best-practice"] } })` |

## Where to start

1. **Read `CHANGELOG.md`** for the four-stage build history.
2. **Read `.claude/plan/loop-closure.md`** for the canonical end-state — surface roster, bundle history, test history, what's "100% healthy" defined.
3. **Read `TODO.md`** for the next-session task list.
4. **Read `AGENTS.md`** for the durable operating contract: code conventions, OpenPencil flow, AI provider routing, verification commands.

## Key architecture you must respect

- **Sibling parity**: `src/stores/{lifeos,toasts}.{ts,js}` + `src/lib/{nav,resolve,persistence,icons}.{ts,js}` are JS/TS siblings. `tests/store-sync.spec.js` enforces it. Adding state/actions/exports → mirror in both siblings.
- **App.vue gating**: dedicated views are mounted via `v-else-if="lifeos.activeSub.item?.view === 'X'"`. The chain order matters; new gates go BEFORE `<SubsectionView v-else />`.
- **Tauri detection**: components and stores check `window.__TAURI__?.core?.invoke`. Falsy → no-op (browser dev / Vitest). Truthy → call `invoke("command_name", { ... })` and `.catch(noop)`.
- **A11y traps** (each was hit at least once during the loop):
  - `<aside>` nested in `<main>` triggers `landmark-complementary-is-top-level` (moderate). Use `<section role="region">` for right-rail panels.
  - `aria-label` on a roleless `<div>` triggers `aria-prohibited-attr` (serious). Add a `role`.
  - `--fg-4` text at 10–11 px on `--bg-1` is 3.7:1 (fails AA). Use `--fg-3` (7.5:1).
  - `<h3>` without an h2 ancestor triggers `heading-order`. Match the canvas h1 → use h2.
- **Tokens-only CSS**: every new style uses `var(--*)` from `colors_and_type.css`. No literal hex. The 12 `--tint-*` tokens cover most decorative rgba needs.

## Adding a new subsection view (the canonical pattern)

1. Add `view: "newview"` flag to a data.js item in the relevant workspace section
2. Append a `window.LIFEOS_DATA.newview = {...}` block (after existing top-level blocks)
3. Add interfaces in `src/data/types.ts` + the field on `LifeosData`
4. Create `src/components/NewView.vue` mirroring an existing pattern (LightsView for dense data, FilesView for tree+list, CalendarView for time-series)
5. Append CSS to `lifeos_app.css` under a `/* NEWVIEW subsection */` block, tokens-only
6. Wire `<NewView v-else-if="lifeos.activeSub.item?.view === 'newview'" />` in App.vue
7. Add fixture to `tests/setup.js`
8. Write `tests/NewView.spec.js` (mount + roles + interactivity + accessibility)
9. Verify: `bun run test` + `bun run build` + axe sweep via Playwright

## Workflow conventions

The user has been running `/loop /ecc:multi-frontend` with parallel agent swarms. Pattern per iteration:
1. Gemini analyzer call (`~/.claude/bin/codeagent-wrapper --backend gemini --gemini-model gemini-2.5-pro - "$PWD"` with the analyzer.md role) → ranked upgrade list
2. 2-3 parallel `Agent(subagent_type=executor)` lanes with disjoint file scopes
3. Verify: tests + build + cargo + axe
4. Fix any axe regressions inline
5. Write `.claude/plan/loop-iterN.md` log
6. Loop until Gemini stops surfacing meaningful upgrades

**Gemini model**: use `gemini-2.5-pro`. The `gemini-3-pro-preview` model the spec hardcodes returns 429 RESOURCE_EXHAUSTED.

## Next session

See `TODO.md` and `.claude/plan/google-design-incorporation.md`.

## Reference

- `AUDIT.md` — pre-loop swarm audit (Stage 2 + early fixes); useful for archaeology
- `design-system-reference/` — read-only LifeOS Design System handoff bundle (the source of truth for visuals)
- `.claude/plan/` — per-stage closure logs (loop-iter1..4, swarm-closure, lights-subsection-{plan,closure})
