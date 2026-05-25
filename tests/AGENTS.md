<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# tests

## Purpose
Vitest specs for every interactive surface. happy-dom + `@vue/test-utils`. Path layout mirrors `../src/components/` and `../src/lib/`. The 65+ spec suite is the verification gate — the root `AGENTS.md` mandates `bun run test` passing before any commit.

## Key Files

### Setup
| File | Description |
|------|-------------|
| `setup.js` | Vitest global setup. Builds a minimal `LIFEOS_DATA` / `LIFEOS_AGGREGATORS` / `LIFEOS_FLOWS` / `TONE` fixture on `globalThis` + `window` so SFCs mount without a full page bootstrap. Covers rail / footer / 3 workspaces / profile / dashboardCanvas / files / health / iot / contacts / lighting / notifications. |

### Component specs
`Badge.spec.js`, `CalendarView.spec.js`, `CommandPalette.spec.js`, `ContactsView.spec.js`, `Dashboard.spec.js`, `FilesView.spec.js`, `HealthView.spec.js`, `Icon.spec.js`, `IoTView.spec.js`, `KeyboardHelp.spec.js`, `Lights.spec.js`, `MenuRow.spec.js`, `NotificationsDrawer.spec.js`, `SettingsView.spec.js`, `Sidebar.spec.js`, `SubsectionAndFlow.spec.js`, `TelemetryWidget.spec.js`, `Workspace.spec.js`.

### Library / store specs
| File | Description |
|------|-------------|
| `nav.spec.js` | Mounts a router; asserts `useNav()` pushes the right URLs. |
| `persistence.spec.js` | Hydration + debounced write contract for the Tauri persistence plugin. |
| `resolve.spec.js` | `resolveWorkspace` workspace / settings / aggregator branches. |
| `store.spec.js` | Basic `useLifeos()` state + action coverage. |
| `store-sync.spec.js` | **Parity gate.** Asserts `lifeos.ts` and `lifeos.js` expose the same keys + actions; same for `toasts.{ts,js}`. |
| `Toasts.spec.js` | `stores/toasts` push / dismiss queue behaviour. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `__mocks__/` | Vitest-only module mocks (see `__mocks__/AGENTS.md`). |

## For AI Agents

### Working In This Directory
- Every new interactive SFC ships with a sibling spec — root contract.
- When adding a fixture field for a new component, append it to the `FIXTURE` object in `setup.js` (don't fork a per-spec fixture). The fixture should mirror the real `data.js` shape closely enough that production code paths don't branch on the test stub.
- `lucide-vue-next` is auto-aliased to `__mocks__/lucide-vue-next.js` via `../vitest.config.ts` so icon imports return a generic `<svg data-test="lucide-icon" />`. Don't import directly from `lucide-vue-next` in setup code expecting real components.
- happy-dom is the renderer (faster than jsdom for shallow component tests); don't switch to jsdom without a coordinated reason.
- Specs that exercise Tauri-only paths must mock `window.__TAURI__` themselves (see `persistence.spec.js` for the pattern).

### Verification
```bash
bun run test                                   # full suite
bunx vitest run tests/Sidebar.spec.js          # one file
bunx vitest run -t "renders the brand toggle" # one test
bun run test:coverage                          # v8 coverage report
```

## Dependencies

### Internal
- `../src/**` — system under test.
- `../data.js` is **not** imported here; the `setup.js` fixture substitutes for it.

### External
- `vitest@^1.6.0`, `@vue/test-utils@^2.4.6`, `happy-dom@^14.12.0`, `@vitest/coverage-v8@^1.6.0`.

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
