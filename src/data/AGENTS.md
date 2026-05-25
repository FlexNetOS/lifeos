<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# data

## Purpose
TypeScript declarations for the runtime content layer. The actual content lives in `../../data.js` (plain JS so the in-browser preview can `import` it from a `<script type="module">`); this folder declares the *shape* so TypeScript consumers can opt into type safety without porting the data itself.

## Key Files
| File | Description |
|------|-------------|
| `types.ts` | Interfaces for `RailEntry`, `DataItem`, `DataSection`, `DataWorkspace`, `Flow`, `DashboardCanvas`, `LightingData`, `FilesData`, `HealthData`, `IoTData`, `ContactsData`, `NotificationItem`, and the `Tone` / `Status` unions. Augments `Window` with `LIFEOS_DATA` / `LIFEOS_AGGREGATORS` / `LIFEOS_FLOWS` / `TONE`. Exports `useData()` / `useFlow()` / `useAggregator()` accessors. |

## For AI Agents

### Working In This Directory
- This file is **additive type information only**. The runtime source of truth is still `../../data.js`. Touching `types.ts` does not require touching `data.js`, and vice versa.
- Long-term plan (deferred per `../../design-system-reference/sot.md`): port `data.js` into typed ES modules under `data/<workspace>.ts`. Until that lands, do not split this file or generate a barrel.
- New view discriminator: extend `DataItem["view"]` union (currently `"n8n-flow" | "open-pencil"`) AND the matching `App.vue` `v-else-if` branch in the same change.
- New tone/status: extend the union here AND add the matching TONE entry to the `../../tests/setup.js` fixture so specs that mount tone-aware components don't crash.

### Testing Requirements
No spec — these are compile-time types. `bun run build` (which runs `vue-tsc --noEmit`) is the verification gate.

## Dependencies

### Internal
- Consumed by SFCs that opt into typed data access via `useData()` / `useFlow()` / `useAggregator()`.

### External
- None (types only).

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
