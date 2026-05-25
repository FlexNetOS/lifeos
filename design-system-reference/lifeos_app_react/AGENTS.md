<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# lifeos_app_react

## Purpose
The original React UI kit — a hi-fidelity recreation of the LifeOS sidebar shell modeled after the FlexNetOS/Sidebar product. **Visual reference only — not used at runtime.** The Vue 3 port under `../../src/components/` mirrors its layout and visual language 1:1.

## Key Files
| File | Description | Vue equivalent |
|------|-------------|-----------------|
| `index.html` | Interactive demo — click sections in the rail to switch workspaces, expand items. | n/a |
| `Sidebar.jsx` | Collapsible left rail (logo, search, primary nav, footer). | `../../src/components/Sidebar.vue` |
| `Workspace.jsx` | Secondary panel that swaps content by section. | `../../src/components/Workspace.vue` |
| `Dashboard.jsx` | Example main-canvas content. | `../../src/components/Dashboard.vue` |
| `MenuRow.jsx` | Sidebar row primitive. | `../../src/components/MenuRow.vue` |
| `CommandPalette.jsx` | ⌘K palette. | `../../src/components/CommandPalette.vue` |
| `Primitives.jsx` | Badge / StatusDot / Icon / Kbd primitives. | `../../src/components/Badge.vue`, `Icon.vue` |
| `data.js` | React-side content map. **Diverges** from `../../data.js` — the Vue port has more workspaces + view discriminators. | `../../data.js` |
| `styles.css` | Full component CSS (~71 KB). Folded into `../../lifeos_app.css` for the production Vue path. | `../../lifeos_app.css` |
| `README.md` | Kit overview + source attribution. | n/a |

## For AI Agents

### Working In This Directory
- **This folder is read-only reference.** Do not run, build, or import these files from production code. They are kept verbatim so designers can compare against the React canon.
- When the Vue port and the React canon diverge in visual behaviour, the **Vue port wins** for the production app — but flag the drift so designers can choose to update the canon or accept the divergence.
- Component implementations here use `lucide-react` + `@carbon/icons-react`. The Vue port standardises on `lucide-vue-next` only — see `../README.md → Iconography` for why.

## Dependencies

### Internal
- None at runtime.

### External
- The React kit references `lucide-react` via CDN — never installed locally.

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
