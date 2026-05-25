<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# preview

## Purpose
19 static HTML component specimens displayed in the Design System tab. Each one is a self-contained card showing tokens, type ramps, or component variants on a near-black surface so designers can review the visual language without booting the app.

## Key Files
| Category | Files |
|----------|-------|
| Color | `colors-brand.html`, `colors-gradients.html`, `colors-status.html`, `colors-surfaces.html`, `colors-text.html` |
| Component | `comp-badges.html`, `comp-buttons.html`, `comp-cards.html`, `comp-inputs.html`, `comp-menu.html` |
| Icon | `icon-triad.html`, `icons.html` |
| Logo | `logo.html` |
| Spacing | `spacing-radii.html`, `spacing-scale.html`, `spacing-shadows.html` |
| Type | `type-display.html`, `type-mono.html`, `type-ui.html` |

## For AI Agents

### Working In This Directory
- Each card is self-contained — links to `../../colors_and_type.css` via a sibling-relative path, embeds the rest inline. Don't introduce a shared partial; the cards are meant to be copy-pasteable into other contexts.
- When you change a token in `../../colors_and_type.css`, the cards re-render correctly without edits here. If a card hard-codes a hex, that's a bug — fix it.
- Lucide icons are loaded via CDN (`https://unpkg.com/lucide@0.475.0/dist/umd/lucide.js`) — keep the version pinned to match `../../package.json`.

## Dependencies

### Internal
- `../../colors_and_type.css` — token source.
- `../../fonts/Rigelstar.ttf` — display face.

### External
- Lucide via unpkg CDN (version-pinned).
- Google Fonts (Lexend, JetBrains Mono).

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
