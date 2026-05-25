# Loop iter 2 — Settings + KeyboardHelp + FilesView

Shipped 2026-05-21 (continuation of `/goal` "100% healthy production dashboard" loop).

## Lanes

| Lane | Outcome |
|---|---|
| I2-A SettingsView (retry) | New `src/components/SettingsView.vue`. 4 cards (AI provider, Telemetry, Appearance, About). Right rail: keyboard-shortcut handoff + Reset state. Wired `lifeos.aiProvider/setAiProvider/setTelemetryEnabled/setTelemetryRefreshMs/resetUiState`. New Rust `app_version()` command. +12 tests. Initial agent terminated mid-step-4; retry agent finished cleanly. |
| I2-B KeyboardHelp | Global `?` overlay listing shortcuts across Global / Navigation / Lights / CommandPalette groups. `role="dialog"` + `aria-modal`. ESC + backdrop dismiss. Skips input/textarea focus. Mounted in App.vue. +N tests. |
| I2-C FilesView | New `FilesView.vue` for Work + Personal → Files: folder tree + recent files. Routes via `view: "files"`. Added `FileEntry/FileFolder/FilesWorkspace/FilesData` to types.ts + `LIFEOS_DATA.files` block in data.js + test fixture. +N tests. |

## Post-swarm fixes (axe regressions)

| Surface | Finding | Fix |
|---|---|---|
| All 5 surfaces (Toast container always present) | serious:`aria-prohibited-attr` — `.toast-stack` div had `aria-label` without role | Added `role="region"` to the toast-stack root |
| /settings | moderate:`landmark-complementary-is-top-level` — settings-side `<aside>` nested in `<main>` | Converted to `<section role="region">` |
| KeyboardHelp open | serious:`color-contrast` (7 nodes) — `.khelp-group-label/then/sep/footer` used `--fg-4` (#6B6F74) at 10px = 3.7:1 contrast | Bumped to `--fg-3` (#9BA1A6) = 7.5:1 contrast |

## Verification

| Check | Result |
|---|---|
| `bun run test` | 150 / 150 across 20 files (was 117 → +33) |
| `bun run build` | app 153.80 kB / gzip 47.50 kB. Clean. |
| `cargo build --manifest-path=src-tauri/Cargo.toml` | Clean (no new deps) |
| axe-core on Dashboard, Lights, Calendar, Files, Settings | **0 violations** |
| axe-core on KeyboardHelp open | **0 violations** (after the `--fg-3` contrast bump) |

## Bundle delta

| Chunk | Iter 1 | Iter 2 | Δ |
|---|---|---|---|
| App | 136 / 43 kB | 154 / 48 kB | +18 / +5 kB |
| CSS | 86 / 15 kB | 95 / 16 kB | +9 / +1 kB |

## Production-readiness scorecard (Δ)

| Capability | Before | After |
|---|---|---|
| Dedicated subsection views | 3 (Lights, Calendar, OpenPencil) | 4 (+ Files) |
| Settings surface | None (empty state) | Real (AI provider, Telemetry controls, About) |
| Keyboard shortcut discoverability | None | `?` overlay with 13+ shortcuts grouped |
| User-controllable telemetry | Hardcoded 2s polling | Toggle + 1s/2s/5s radio + persists across reload |
| State reset / "factory" path | None | `Reset state` button in Settings clears persisted UI |
