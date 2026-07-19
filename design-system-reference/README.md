# LifeOS Design System

> **Normative tokens live in [`DESIGN.md`](../DESIGN.md) at the repo root** — colors,
> typography, radii, spacing, and component-level values in machine-readable YAML front matter.
> This document covers identity, voice, asset attribution, and component patterns
> that don't fit the token schema. Both sources must stay in sync:
> `bun run design:lint` catches broken token references.

> **Mission:** LifeOS is the AI agent that runs your home and your life.
> Work, personal, home automation — one operating system, one assistant.

A dark-first, gradient-accented design system. The mark is a **tri-node arc emblem** — three nodes at the corners of a triangle, connected by three swooping arcs that hook into each other in 120° rotational symmetry. The form is borrowed from the *Element Ark* emblem style, recoloured in the LifeOS cyan→purple→green spiral gradient. Modelled on the **FlexNetOS/Sidebar** product codebase. This repo contains every token, font, asset, component and screen pattern needed to design new LifeOS surfaces without starting from scratch.

---

## Index — what's in this folder

| Path | What it is |
|------|------------|
| `colors_and_type.css` | All color, type, spacing, radii, shadow, gradient CSS variables. **Import this in every new artifact.** |
| `fonts/Rigelstar.ttf` | The display face — wordmark, stat numerics. |
| `fonts/rigel_star/License.txt` | License for Rigelstar. |
| `assets/lifeos-mark.png` | **The official LifeOS emblem mark** — ElementArk triad on black with neon glow. 1024px. Canonical Tauri icon source. |
| `assets/lifeos-mark-256.png` | Same mark at 256px (used in-app for 32–64px slots and favicons). |
| `assets/lifeos-primary-lockup.png` | Full lockup: emblem + ELEMENTARK wordmark + LIFEOS tagline. 1024px. |
| `assets/lifeos-wordmark-tagline.png` | Wordmark + tagline only (no emblem). |
| `assets/lifeos-icon-triad.png` | Just the three pillar icons (Work / Personal / Home). |
| `assets/icons/work-on-black.png` | Work pillar icon (laptop, cyan). |
| `assets/icons/personal-on-black.png` | Personal pillar icon (person + heart, purple). |
| `assets/icons/home-on-black.png` | Home pillar icon (house, green). |
| `assets/work_personal_home_icons.svg` | Vector source for the three pillar icons. |
| `assets/elementark-brand-guide.pdf` | Official brand one-sheet PDF. |
| `assets/ripple-logo.png` | Earlier Ripple wordmark (reference only — superseded by ElementArk lockup). |
| `assets/ripple-branding-guide.png` | Earlier brand sheet (reference only). |
| `assets/ripple-brand-notes.md` | Raw notes from the original Ripple color analysis. |
| `preview/*.html` | The card specimens displayed in the Design System tab. |
| `ui_kits/lifeos_app/` | The hi-fi LifeOS sidebar shell + dashboard recreation. Start here when building new screens. |
| `SKILL.md` | Loader for using this folder as a Claude Code Agent Skill. |

### UI kits

- **`ui_kits/lifeos_app/`** — The flagship LifeOS sidebar application. Contains:
  `Sidebar.jsx`, `Workspace.jsx`, `Dashboard.jsx`, `MenuRow.jsx`, `Primitives.jsx` (Badge / StatusDot / Icon / Kbd), `data.js` (all workspace content), `styles.css`, `index.html` (interactive demo with switchable workspaces).

### Source attribution

This system is derived from these inputs, which the reader is encouraged to explore directly:

- **FlexNetOS/Sidebar** — <https://github.com/FlexNetOS/Sidebar>. The codebase that defined the LifeOS sidebar product (AI Command Center, Life Dashboard, Contacts, Wallet, Legal, Smart Home workspaces). Original Figma: <https://www.figma.com/design/KD7gCiG8OEsvnAsJBy3O3n/sidebar>.
- **Ripple brand assets** — provided locally via `my-templates/assets/` (the spiral icon, branding guide, Rigelstar font, theme.config.js color tokens).
- **Provided color palette + theme config** — the cyan/purple/green spiral and dark-first surface scale.

---

## Content fundamentals

LifeOS is the calm operator behind your day. The voice mirrors that:

- **Address the user directly.** "Good afternoon, Alex." "Your AI ran 18 automations overnight." Second-person, present tense, no exclamation marks.
- **Lead with the result, not the feature.** "85.8k across 3 accounts" beats "View your aggregated banking dashboard."
- **Be specific with numbers.** Percentages, deltas, time stamps. Vague summaries break the trust contract.
- **Sentence case everywhere** except the wordmark (`LIFEOS`) and SECTION HEADERS (uppercase + tracked +.08em). Buttons are sentence case ("Ask LifeOS", not "ASK LIFEOS").
- **No emoji.** Iconography carries semantic meaning; emoji muddle the brand voice. (The source codebase uses 0 emoji and so do we.)
- **Time-relative metadata.** "2m ago", "5m ago", "30 min" — never absolute ISO timestamps in the UI.
- **The AI has a persona but no name.** Refer to it as "LifeOS" or "your AI", never "the assistant" or "ChatGPT-style" naming. AI suggestions are prefaced with `LifeOS suggests:`.
- **Calm > clever.** Microcopy explains, it does not perform. "Family time today: 2.5h", not "Family time bank: 2.5h dropped 🎉".
- **Empty states are encouraging, not apologetic.** "No favorites yet · Star items to add them here."

Examples — verbatim from the source:
- > "Your AI ran 18 automations overnight. Here is what needs you."
- > "Security: All clear · Energy usage: Normal · Climate: 72°F"
- > "Quick access to your most used sections"
- > "Right-click any section to add to favorites"

---

## Visual foundations

### Colors

| Role | Token | Hex |
|------|-------|-----|
| **Brand primary** (actions, focus, links) | `--lifeos-cyan` | `#00D4FF` |
| **Brand secondary** (AI, memory, thinking) | `--lifeos-purple` | `#9B7BFF` |
| **Brand accent** (success, live, ok) | `--lifeos-green` | `#00E676` |
| Page background | `--bg-0` | `#0A0A0A` |
| Elevated panel | `--bg-1` | `#121212` |
| Card | `--bg-2` | `#1A1A1A` |
| Hover / input | `--bg-3` | `#232323` |
| Border default | `--bg-4` | `#2A2A2A` |
| Text default | `--fg-1` | `#ECEDEE` |
| Text muted | `--fg-3` | `#9BA1A6` |

The signature gradient `--gradient-spiral` (`135deg, cyan → purple → green`) appears on:
the brand mark itself, the wordmark, the **Ask LifeOS** CTA, AI-suggest callouts, occasional 1px gradient borders. **Never as a full background wash** — backgrounds are flat near-black.

### Typography

- **Display (Rigelstar)** — wordmark, large stat values. `letter-spacing: +.04em`. Used at 32–96px. The face is geometric/digital, evocative of mission-control panels.
- **UI (Lexend, 300–700)** — every label, heading, body and meta string. Lexend reads cleanly at 11–18px on dark backgrounds.
- **Mono (JetBrains Mono)** — `kbd` shortcuts, hex tokens, timestamps, deltas. Adds a "data" texture that grounds the AI in measurable reality.

Type ramp uses small steps in the 11–14px range because the product is information-dense; headings open up to 22 → 36 → 72 for landing/dashboard headers.

### Backgrounds, imagery & texture

- **Flat near-black is the default.** No noise, no grain, no patterns — the surface is meant to feel like deep space so the gradient can glow against it.
- **One subtle radial glow** lives at the top of the main canvas (`--gradient-radial-glow`). It anchors the page without competing with content.
- **No full-bleed photography** in the product UI. The brand uses the spiral mark and gradient as its only visual identity; photography would dilute it.
- **Imagery, when needed, is cool-toned + slightly desaturated.** Avatars are mono circles by default.

### Animation

- **Soft spring easing** is the house curve: `cubic-bezier(0.25, 1.1, 0.4, 1)` — slight overshoot, no bounce. 300–500ms durations for sidebar collapse / panel transitions.
- **Pulse animations** (1.5–1.8s loop) only on live signals: unread badges, online status dots. Never on decoration.
- **No bounces, no slides-from-offscreen, no parallax.** This is an operating system, not a marketing site.

### Hover, press, focus

- **Hover** lifts the surface: `bg-2 → bg-3`, text `fg-2 → fg-0`. No translate, no scale.
- **Active/selected** state on rail items uses `bg-2` + a 2px inset cyan stripe on the left edge.
- **Press** is implicit (the click resolves immediately). For gradient buttons, a 1px `translateY(-1px)` lift on hover, no press depression.
- **Focus** is a 2-ring system: 2px page-color spacer, then 2px cyan ring (`--ring-focus`). On inputs it's a soft cyan glow halo (3px, 15% alpha).

### Borders, dividers, separation

- **1px borders, never 2px.** Cards: `1px solid var(--bg-4)`. Section dividers: `1px solid var(--bg-4)` between header and body.
- **Subtle gradient borders** (`gradient-border` mixin) for hero/premium surfaces — a 1px spiral gradient masked into the rounded corner. Use sparingly: one per screen, max.
- **No drop shadows for separation.** Separation is borders + surface elevation, not shadows. Shadows are reserved for floating overlays (notifications, modals).

### Shadows & glow

Two shadow systems coexist:
- **Drop shadows** (`--shadow-sm/md/lg/xl`) — neutral black, used only on floating panels (notifications drawer, modals, dropdown menus).
- **Brand glows** (`--shadow-glow-cyan/purple/green`) — used as decorative emphasis on the primary CTA, the dashboard logo ring, and live status dots. The glow is the brand. Use one per viewport at a time.

### Transparency & blur

- **Modal overlays** use `bg-overlay` (10,10,10,.72) with `backdrop-filter: blur(12px)`. The blur is what tells the user the underlying surface is paused, not just dimmed.
- **Tinted badge backgrounds** are 14% alpha of the brand color — never solid. This keeps the pill light but reads against any surface.

### Corner radii

A compressed scale: 4 / 6 / 8 / 12 / 16 / 999. Inputs and menu rows are 8. Cards are 12–14. Hero modules are 16–20. Avatars and pills are 999. **Never mix radii inside a single component.**

### Cards

- Card = `var(--bg-2)` + `1px solid var(--bg-4)` + `12–14px radius` + `padding: 14–18px`.
- Stat cards add a colored 6% top-anchored gradient wash tinted by the card's tone (cyan/purple/green) plus a tinted border.
- No left-border accent stripes (that's an AI-slop trope we explicitly avoid).
- No raised drop shadow.

### Layout rules

- **Fixed shell, scrolling canvas.** The sidebar and workspace panel are always visible; only the main canvas scrolls.
- **Three columns: rail (auto) · workspace (320px) · canvas (1fr).** Below 1100px, workspace shrinks to 280px; canvas stats collapse to 2-up.
- **Gap is the spacing primitive.** Lists use flex/grid with `gap: 2px–14px`. Margins are avoided except on the page-level canvas.
- **Max content width 1200px** on the canvas. Wider screens get more left/right whitespace, not more content.

---

## Iconography

- **Lucide** (`lucide@0.475.0`, loaded from unpkg) is the live icon set across this design system. Stroke weight 1.5, default size 20px in rails, 16px in menu rows, 14px in buttons/badges.
- **The source codebase uses two systems:** `@carbon/icons-react` (for primary nav glyphs like Dashboard, Folder, Calendar) and `lucide-react` (for everything else — Bot, Sparkles, Heart, etc.). For prototypes here we standardize on Lucide alone since it has CDN parity with the source visuals.
- **SVG only.** No PNG icons in the UI, no icon fonts. The Ripple spiral PNG (`assets/icon.png`) is the only raster image in the brand; it's used as a stamp, never as a generic decorative element.
- **No emoji.** Confirmed by reading the source — zero emoji in the Sidebar codebase.
- **No unicode-as-icon.** The mono font's `⌘` `⇧` `⌥` `⌃` chars appear inside `<kbd>` elements for shortcuts, but that's it.
- **Brand mark usage:** the LifeOS emblem (`assets/lifeos-mark.png` or `-256.png`) should appear once per screen, max — typically the top of the sidebar or anchoring an empty/loading state. It is never used as a section heading icon. The mark has neon glow baked in; place it on a flat near-black surface. section heading icon. The mark already carries the gradient internally; don't put it on a coloured background.

---

## Caveats & substitutions

- **Fonts substituted:** the brand sheet calls for "Montsetreat" (Primary) — likely a misspelling of **Montserrat**. We did not import it; LifeOS uses **Lexend** (Google) instead, because that's what the actual product codebase uses. Rigelstar is used unchanged.
- **Carbon icons not bundled.** The source uses `@carbon/icons-react` for some primary-nav glyphs; we mirror them via the nearest Lucide equivalents (`layout-dashboard`, `users`, etc). If you want pixel parity, swap in `@carbon/icons-react` in your build.
- **Logo lineage:** the LifeOS mark is a custom SVG inspired by the *Element Ark* emblem provided in the brand sheet (3 nodes + 3 arc swooshes in 120° rotation), recoloured in the LifeOS spiral gradient. The original *Ripple* spiral PNG remains in `assets/icon.png` for reference but is no longer used in the UI.
- **Product name conflict:** the brand assets are labeled "Ripple" but the stated mission is "LifeOS". We treat **LifeOS as the product name** and **the Ripple/Element-Ark palette + emblem language as the visual identity**. If the user prefers either name to win outright, flag and we'll re-thread.
