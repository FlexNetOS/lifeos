<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# design-system-reference

## Purpose
The LifeOS Design System handoff bundle — **read-only reference**, the source of truth for tokens, voice, components, motion. The app itself doesn't import from here at runtime; production tokens live in `../colors_and_type.css` and component CSS in `../lifeos_app.css`. This bundle is preserved so designers and AI agents can re-derive surfaces without leaving the repo.

## Key Files
| File | Description |
|------|-------------|
| `README.md` | The full design-system spec — colors, type, spacing, motion, iconography, brand mark usage. **Read front-to-back the first time you touch UI.** |
| `sot.md` | Verbatim user brief that `../AGENTS.md` is derived from. The operating contract paraphrases this; when the two disagree, sot.md wins. |
| `SKILL.md` | Loader for using this folder as a Claude Code Agent Skill (`lifeos-design`). |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `lifeos_app_react/` | Original React UI kit — visual reference, not used at runtime. The Vue port mirrors its layout 1:1 (see `lifeos_app_react/AGENTS.md`). |
| `preview/` | 19 HTML component specimens shown in the Design System tab (see `preview/AGENTS.md`). |
| `scrap/` | PNG screenshots / iteration captures from the design process. Pure reference, never imported. |
| `scraps/` | A single `.napkin` sketch artifact. Pure reference, never imported. |

## For AI Agents

### Working In This Directory
- **Do not edit `sot.md` without explicit user direction.** It is the verbatim user brief; the operating contract derives from it.
- The bundle is checked into the repo intentionally — when you're asked to design a new surface, copy assets/snippets from here rather than fetching from outside.
- When a token in `../colors_and_type.css` disagrees with `README.md` here, the production CSS file is authoritative (it is what the app actually renders) — open an issue or flag the drift.
- The `lifeos-design` skill in `SKILL.md` references asset paths under `assets/` that don't exist directly in this snapshot — the matching production assets live at `../public/lifeos-*.png`. Use the `../public/` copies for in-app embedding.

### Brand DNA (one-liner)
Calm dark-first OS · tri-node arc mark · cyan→purple→green spiral gradient as the only chromatic moment · Lexend for everything except a Rigelstar display wordmark · never use emoji.

## Dependencies

### Internal
- `../public/lifeos-*.png` — production-served copies of the brand assets.
- `../fonts/Rigelstar.ttf` — display face.
- `../colors_and_type.css` — token implementation.

### External
- None at runtime — this is reference material only.

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
