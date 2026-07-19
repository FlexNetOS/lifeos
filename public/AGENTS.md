<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# public

## Purpose
Vite static assets — served at the root URL by the dev server and copied verbatim into `dist/` by the build. Houses the production-served brand assets and the pillar icons consumed by the Sidebar.

## Key Files
| File | Description |
|------|-------------|
| `lifeos-mark.png` | The official LifeOS emblem (1024px) — ElementArk triad on black with neon glow. Used for hero / loading anchors and as the canonical Tauri icon source. |
| `lifeos-mark-256.png` | Same mark at 256px — the in-app variant used for 32–64px Sidebar slots and the favicon. |
| `lifeos-primary-lockup.png` | Full lockup: emblem + ELEMENTARK wordmark + LIFEOS tagline (1024px). |
| `lifeos-wordmark-tagline.png` | Wordmark + tagline only (no emblem). |
| `lifeos-icon-triad.png` | The three pillar icons (Work / Personal / Home) bundled in one PNG. |
| `work_personal_home_icons.svg` | Vector source for the three pillar icons. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `icons/` | PNG variants of the pillar icons (`work-on-black.png`, `personal-on-black.png`, `home-on-black.png`). |

## For AI Agents

### Working In This Directory
- The brand mark has **neon glow baked in** — only place it on near-black surfaces (`var(--bg-0)` or `var(--bg-1)`). Coloured backgrounds desaturate the glow.
- **One brand mark per screen, max.** Don't add the lockup AND the standalone mark to the same view.
- Updating `lifeos-mark.png` means regenerating the Tauri icon set — run `cargo tauri icon public/lifeos-mark.png` (from `../`) to refresh `../src-tauri/icons/`.
- SVGs are kept for vector edits; PNGs are what the app references at runtime.

## Dependencies

### Internal
- `../src/components/Sidebar.vue` references `/lifeos-mark-256.png` and the pillar icons under `/icons/`.
- `../src-tauri/tauri.conf.json` indirectly consumes `lifeos-mark.png` via the generated `../src-tauri/icons/` set.

### External
- None.

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
