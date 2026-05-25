<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# __mocks__

## Purpose
Vitest-only module mocks. Wired in `../../vitest.config.ts` via the `resolve.alias` block — these files replace their real counterparts only inside the Vitest module graph; `bun run dev` and `bun run build` see the genuine packages.

## Key Files
| File | Description |
|------|-------------|
| `lucide-vue-next.js` | Returns a single `<svg data-test="lucide-icon" />` Vue component for any named export. Strips the ~600 KB real icon pack out of the test bundle. The proxy ignores `__esModule` / `default` / non-string keys. |

## For AI Agents

### Working In This Directory
- A new mock must be paired with an alias entry in `../../vitest.config.ts` — without that, the import resolves to the real module and the mock never runs.
- Keep mocks minimal: replicate just the surface the specs touch. The lucide mock returns a stub for *every* named export deliberately — adding per-icon component definitions would re-pull the dependency graph and defeat the purpose.
- Never let a mock leak into the production bundle. Check `../../vite.config.ts` after any alias change to confirm the production build isn't aliased.

## Dependencies

### Internal
- Activated via aliases in `../../vitest.config.ts`.

### External
- `vue@^3` — for the `defineComponent` / `h` stubs.

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
