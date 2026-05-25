<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# fonts

## Purpose
The Rigelstar display face — used for the LIFEOS wordmark and large stat numerics. Loaded via `@font-face` from `../colors_and_type.css`. Lexend (the body face) and JetBrains Mono (mono) are served via Google Fonts at runtime — only Rigelstar ships in-repo because it is a custom license that can't be CDN-loaded.

## Key Files
| File | Description |
|------|-------------|
| `Rigelstar.ttf` | The display face. 184 KB. Used at 32–96px on the wordmark + dashboard hero numerics. `letter-spacing: +.04em` per the design system spec. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `rigel_star/` | Source-of-truth font folder (contains `License.txt` per the upstream brand-sheet distribution). |

## For AI Agents

### Working In This Directory
- Rigelstar is for the wordmark + stat numerics ONLY. Body / labels / metadata all use Lexend (Google Fonts). Mono fields use JetBrains Mono.
- Don't substitute another display face without explicit user approval — the brand sheet calls for Montserrat, but the production codebase uses Lexend + Rigelstar deliberately.
- If you load Rigelstar from a new CSS file, use the same `@font-face` declaration as `../colors_and_type.css` so subsetting / display strategies stay consistent.

## Dependencies

### Internal
- `../colors_and_type.css` — `@font-face` declaration that points at `Rigelstar.ttf`.

### External
- None — the file is self-hosted.

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
