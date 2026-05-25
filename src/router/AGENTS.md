<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# router

## Purpose
vue-router configuration that mirrors workspace state into the URL. Hash history (no server config required). On every navigation, `beforeEach` reads `:id` / `:section?` / `:sub?` and patches the Pinia store so browser back/forward + bookmarks stay coherent with in-app clicks.

## Key Files
| File | Description |
|------|-------------|
| `index.ts` | Defines `/` → `/workspace/ai` redirect; `/workspace/:id/:section?/:sub?` (`name: "workspace"`); `/settings/:section?/:sub?` (`name: "settings"`). All three routes mount `@/App.vue`. `beforeEach` syncs URL params back into `useLifeos()` state. |

## For AI Agents

### Working In This Directory
- Settings is **not** a workspace — `/settings/...` is a parallel route that sets `lifeos.activeId = "settings"`. Don't try to fold it under `/workspace/`.
- Hash history is intentional — Tauri's `frontendDist` is served via the `tauri://` protocol, and `createWebHistory()` would require server-side fallback that Tauri doesn't provide by default.
- `beforeEach` **URI-decodes** `:section` and `:sub` — labels in `data.js` are encoded by `useNav().buildPath` and decoded here. If you add a new param, decode it the same way.
- Adding a new workspace is data-only: add the workspace to `LIFEOS_DATA.workspaces`, add a rail entry, and routing works automatically — no router changes required.

### Testing Requirements
Router behaviour is exercised indirectly by `../../tests/nav.spec.js` (which mounts a router) and by the integration setup in `../../tests/setup.js`. There is no standalone router spec yet — add one if you change the `beforeEach` contract.

## Dependencies

### Internal
- `@/stores/lifeos` — `useLifeos()` mutated by `beforeEach`.
- `@/lib/resolve` — `resolveWorkspace` used to look up the `activeSub` item by label.
- `@/App.vue` — single component for all three routes.

### External
- `vue-router@^4.3.2`

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
