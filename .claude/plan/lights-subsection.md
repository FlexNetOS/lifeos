# Home → Lights Subsection — Implementation Plan

Status: **Approved** (Phase 3 closed; Phase 4 in progress).
Source: `/ecc:multi-frontend` workflow, Gemini analyzer + architect (session `48bfa880-b961-48c3-a342-cc7f9ad47735`).

## Solution: Spatial Grid (A)

Canvas grid `1fr 280px`, gap 24px, padding 24px. Top: 4-pill scene strip (`role="radiogroup"`). Left main: auto-fill 240-px room cards, each with a 2-column light-tile grid. Right rail: vertical schedule timeline with mono times + connector line.

## File change manifest

| File | Action | Purpose |
|---|---|---|
| `data.js` | edit + append | Replace Home>Lights placeholder; add `window.LIFEOS_DATA.lighting` |
| `src/data/types.ts` | edit | `LightingData`, `Room`, `Light`, `Scene`, `Schedule` interfaces |
| `lifeos_app.css` | append | `.lights-canvas`, `.scene-strip/btn`, `.room-grid/card/title`, `.light-tiles/tile`, `.schedule-timeline/row/time` |
| `src/components/LightsView.vue` | new | Single-SFC orchestrator |
| `src/App.vue` | edit | `v-else-if="lifeos.activeSub.item?.view === 'lights'"` branch |
| `tests/setup.js` | edit | Add lighting fixture |
| `tests/Lights.spec.js` | new | 6 specs (canvas + scene strip + room grid + tiles + aria + timeline) |

## Order of operations

1. types.ts + data.js — verify with `bun run build` (vue-tsc green)
2. lifeos_app.css append — visual check
3. LightsView.vue scaffold — existing tests still pass
4. App.vue gating + import — Playwright click-through `/workspace/home/Lights/Lights`
5. tests/setup.js fixture + tests/Lights.spec.js — `bun run test` shows 78/78
6. Phase 5 — Gemini reviewer pass; Phase 6 — final close

## Tokens used

- Surfaces: `--bg-0..--bg-4`, `--surface-card`, `--surface-card-hover`, `--surface-panel`
- Borders: `--border-subtle`, `--border-default`, `--border-strong`, `--border-focus`
- Text: `--text-strong`, `--text-primary`, `--text-muted`
- Brand: `--lifeos-cyan/purple/green`, `--brand-accent`, `--gradient-spiral`, `--shadow-glow-green`
- Radii: `--radius-md/lg/capsule`
- Type: `--font-mono`, `--text-xs/sm/lg`
- Spacing: `--space-2/3/4/6`

## A11y

- Each `.room-card` is `role="region"` with `aria-labelledby` pointing at its title
- `.scene-strip` is `role="radiogroup"`; scene buttons are `role="radio"` with `aria-checked`
- `.light-tile` is `role="switch"` with `aria-checked=isOn`
- `:focus-visible` already wired globally (`--lifeos-cyan` ring)
- `aria-live="polite"` region reserved for future toggle confirmations

## Risks

- vue-tsc on the loose `lighting` global — mitigated by extending `Window` in types.ts.
- Existing tests on Home>Lights aggregator scans — none found in current test bodies.
- Lucide icon availability — using only common names (lamp, sofa, bed, utensils, zap, film, sun, moon).
