---
version: alpha
name: LifeOS
description: >
  The OS for work, personal & home automation. Dark-first, calm, spiral-branded.
  A personal AI operating system spanning desktop (Tauri 2), mobile, Pi, and ESP32.
  Visual DNA: ripple spiral (cyan → purple → green) on deep black.
colors:
  # Brand spiral — mapped to spec conventions
  primary: "#00D4FF"             # cyan — actions, focus, link
  primary-hi: "#5BE4FF"          # hover / glow
  primary-lo: "#0099BF"          # pressed
  secondary: "#9B7BFF"           # purple — AI, thinking, memory
  tertiary: "#00E676"            # green — success, ok, live
  # Surface scale (deep black → near-white)
  surface: "#0A0A0A"             # page background (--bg-0)
  surface-dim: "#000000"         # deep black (--black)
  surface-panel: "#121212"       # elevated surface (--bg-1)
  surface-card: "#1A1A1A"        # card (--bg-2)
  surface-card-hover: "#232323"  # card hover / input (--bg-3)
  # Foreground / text
  on-surface: "#ECEDEE"          # default text (--fg-1)
  on-surface-variant: "#B5B7BA"  # secondary text (--fg-2)
  on-surface-muted: "#9BA1A6"    # muted / metadata (--fg-3)
  on-surface-disabled: "#3F4348" # disabled (--fg-5)
  on-brand: "#0A0A0A"            # text placed on brand-colored backgrounds
  # Status
  error: "#FF4D6A"
  warning: "#FFB020"
typography:
  display-hero:
    fontFamily: Rigelstar
    fontSize: 72px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.02em
  display-stat:
    fontFamily: Rigelstar
    fontSize: 48px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.04em
  headline-lg:
    fontFamily: Lexend
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Lexend
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Lexend
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  title-md:
    fontFamily: Lexend
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
  label-caps:
    fontFamily: Lexend
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0.08em
  body-md:
    fontFamily: Lexend
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  body-md-strong:
    fontFamily: Lexend
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.45
  label-sm:
    fontFamily: Lexend
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 500
    letterSpacing: 0.02em
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 20px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md-sm: 12px
  md: 16px
  lg-sm: 20px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  # Buttons
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-brand}"
    typography: "{typography.body-md-strong}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 16px
  button-primary-hover:
    backgroundColor: "{colors.primary-hi}"
    textColor: "{colors.on-brand}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-lo}"
    textColor: "{colors.on-brand}"
  button-primary-disabled:
    textColor: "{colors.on-surface-disabled}"
    typography: "{typography.body-md-strong}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 16px
  button-secondary:
    backgroundColor: rgba(0, 212, 255, 0.14)
    textColor: "{colors.primary}"
    typography: "{typography.body-md-strong}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 16px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 12px
  button-icon:
    backgroundColor: transparent
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.md}"
    width: 32px
    height: 32px
  # Cards
  card-standard:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  card-glow-cyan:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  card-glow-purple:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  card-stat:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  # Inputs
  input-text:
    backgroundColor: "{colors.surface-dim}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 8px 12px
  input-search:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 8px 12px
  # Navigation primitives
  menu-row:
    backgroundColor: transparent
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 0 8px
  menu-row-hover:
    backgroundColor: "{colors.surface-card-hover}"
  menu-row-active:
    backgroundColor: rgba(0, 212, 255, 0.14)
    textColor: "{colors.primary}"
  # Chips / pills
  chip-filter:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    height: 24px
    padding: 0 10px
  chip-status-ok:
    backgroundColor: rgba(0, 230, 118, 0.14)
    textColor: "{colors.tertiary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  chip-status-warn:
    backgroundColor: rgba(255, 176, 32, 0.14)
    textColor: "{colors.warning}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  chip-status-err:
    backgroundColor: rgba(255, 77, 106, 0.14)
    textColor: "{colors.error}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  chip-ai:
    backgroundColor: rgba(155, 123, 255, 0.14)
    textColor: "{colors.secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  # Badges
  badge-count:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    height: 16px
    padding: 0 4px
  badge-count-info:
    backgroundColor: rgba(0, 212, 255, 0.14)
    textColor: "{colors.primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  # Sidebar / rail
  sidebar-rail:
    backgroundColor: "{colors.surface}"
    width: 56px
  sidebar-panel:
    backgroundColor: "{colors.surface-panel}"
    width: 240px
  # Brand mark
  brand-spiral-gradient:
    backgroundColor: "linear-gradient(135deg, #00D4FF 0%, #9B7BFF 50%, #00E676 100%)"
  brand-spiral-gradient-soft:
    backgroundColor: "linear-gradient(135deg, rgba(0,212,255,.18) 0%, rgba(155,123,255,.18) 50%, rgba(0,230,118,.18) 100%)"
  # Overlays
  overlay-modal:
    backgroundColor: rgba(10, 10, 10, 0.72)
  toast-info:
    backgroundColor: rgba(0, 212, 255, 0.14)
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  toast-success:
    backgroundColor: rgba(0, 230, 118, 0.14)
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  toast-warn:
    backgroundColor: rgba(255, 176, 32, 0.14)
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  toast-error:
    backgroundColor: rgba(255, 77, 106, 0.14)
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
---

# LifeOS Design System

> Machine-readable design contract. Long-form brand guide, voice, asset attribution,
> and component patterns that don't fit the token schema live in
> `design-system-reference/README.md`. This file contains the normative tokens.

## Overview

LifeOS is ElementArk's operating system and all-in-one application. It manages Work, Personal, and Home surfaces from a single cohesive shell. Its visual identity is **calm, dark-first, and precision-toned**: the UI recedes so that content and AI guidance can surface cleanly.

**Brand architecture**: LifeOS leads on product surfaces. ElementArk remains the visible parent and leads in corporate, investor, portfolio, and cross-portfolio contexts. Use the typographic endorsement "LifeOS by ElementArk" when ownership helps, while keeping one brand lockup per screen.

**Brand personality**: Focused, intelligent, trustworthy. Never loud. LifeOS does not shout — it whispers. Every surface exists to reduce cognitive load, not add to it.

**Target emotional response**: The user should feel in control and supported — as if the system is quietly competent and always ready, not demanding attention. The interface should disappear into the task.

**Visual DNA**: A deep-black page (near `#0A0A0A`) with the approved cyan, purple, and green direction concentrated in the canonical tri-node mark and domain accents. Do not invent gradient fields, generic technology symbols, or decorative brand glow. All other color is utilitarian (status, metadata, interaction feedback).

**LifeOS product lockup**: The canonical tri-node emblem and Rigelstar LIFEOS wordmark may form one lockup. ElementArk appears as a typographic endorsement, not a competing second emblem. Use one lockup per screen.

**Scale**: Desktop-first (1280×800 minimum) but responsive to mobile and tablet via breakpoints. The Tauri shell hosts the desktop surface; iOS/Android and Pi targets share the same token vocabulary.

## Colors

The palette is rooted in a near-black chromatic neutral and three complementary brand hues. Status colors are strictly semantic.

- **Primary (#00D4FF — cyan):** The action color. Used for focus rings, active nav states, links, CTAs, and the lead position in the spiral gradient. Contrast ratio against `surface` (#0A0A0A): ~12:1 (AAA). Hover tint: `primary-hi` (#5BE4FF). Pressed: `primary-lo` (#0099BF).

- **Secondary (#9B7BFF — purple):** The AI/intelligence color. Appears on AI avatar glows, memory-layer indicators, agent team chips, and the mid-stop of the spiral. Never used for critical actions or errors — it belongs to the system's "thinking" state.

- **Tertiary (#00E676 — green):** The success and live-status color. Used for online indicators, completion states, positive health metrics, and the trailing stop of the spiral. Distinct from the `error` and `warning` status colors which have their own dedicated tokens.

- **Surface scale:** Five steps from `surface-dim` (#000000) to `surface-card-hover` (#232323). `surface` (#0A0A0A) is the page canvas; `surface-panel` (#121212) hosts elevated panels and the sidebar; `surface-card` (#1A1A1A) hosts interactive tiles. Never expose raw hex in component code — always reference the surface tokens.

- **Foreground scale:** Four steps from `on-surface` (#ECEDEE, default body text) to `on-surface-disabled` (#3F4348). Use `on-surface-variant` for secondary labels and metadata; `on-surface-muted` for tertiary metadata and timestamps.

- **Status colors:** `error` (#FF4D6A) and `warning` (#FFB020) are reserved for destructive or caution states only. Do not use them decoratively.

- **Alpha companions:** The raw `rgba()` tint values (`rgba(0,212,255,.14)` for cyan chip fills, etc.) live in the `components:` token map and in `colors_and_type.css` as `--tint-*` CSS variables. They are not first-class design tokens because the spec's `Color` type requires opaque `#hex` SRGB. Apply the tints via the CSS variables or the component tokens, never as bare literals in SFC styles.

- **Signature spiral gradient:** `linear-gradient(135deg, #00D4FF 0%, #9B7BFF 50%, #00E676 100%)`. The only polychromatic moment in the UI. Applied as: brand wordmark text fill, border treatment on focused cards (`brand-spiral-gradient` component token), and the `AIAvatar` pulse glow. Never as a full-bleed background wash.

## Typography

LifeOS uses three typefaces with strict hierarchy rules. No typeface substitution is permitted on production surfaces.

- **Rigelstar** — display / digital glyph face. Used exclusively for the Rigelstar wordmark, large dashboard stat values (`display-stat`, 48px), and the hero display level (`display-hero`, 72px). Loaded as a local `@font-face` from `fonts/Rigelstar.ttf`. No bold weight.

- **Lexend** — UI body face. The workhorse for all interface text from `headline-lg` (36px/600) down to `label-sm` (11px/400). Loaded from Google Fonts (weights 300–700). Fallback: `system-ui, -apple-system, Segoe UI, sans-serif`.

- **JetBrains Mono** — code / monospace. Reserved for shortcuts displayed in `KeyboardHelp`, token values, timestamps, and technical metadata (`mono-sm`, 12px/500). Never used for body prose.

**Scale mapping to CSS utility classes:**

| Token | CSS class | Use |
|---|---|---|
| `display-hero` | `.t-display` | Page-level hero numbers |
| `display-stat` | `.t-stat` | Dashboard metric values |
| `headline-lg` | `.t-h1` | Page titles |
| `headline-md` | `.t-h2` | Section titles |
| `headline-sm` | `.t-h3` | Subsection headings |
| `title-md` | `.t-h4` | Card titles, panel heads |
| `label-caps` | `.t-section` | SECTION LABELS, all-caps with tracking |
| `body-md` | `.t-body` | Default body text |
| `body-md-strong` | `.t-body-strong` | Emphasis, menu item labels |
| `label-sm` | `.t-meta` | Timestamps, badges, footnotes |
| `mono-sm` | `.t-code` | Keyboard shortcuts, hex values |

**Rules:**
- All text is sentence-case. No ALL CAPS except the `label-caps` utility (applied via CSS class, not manual uppercasing in templates).
- Line lengths cap at ~72ch for prose, ~50ch for UI labels.
- No text-shadow on dark surfaces — sufficient contrast is achieved through the color system alone.

## Layout

LifeOS uses a fixed-shell three-column layout: **Sidebar | Workspace panel | Main content area**.

- **Grid base:** 4px. All spacing derives from the spacing token scale (`xs`=4 → `3xl`=64).
- **Sidebar rail:** 56px fixed (collapsed icon rail). Expands to a 240px panel with labels and section lists. State transitions use `transition: width 240ms ease`.
- **Workspace panel:** 280px fixed on desktop; collapses below 1024px.
- **Main area:** Fills remaining width. Dashboard, SubsectionView, and OpenPencilEditor all mount here.
- **Breakpoints:** Mobile <768px collapses both sidebar and workspace panel to full-width stacked views. The 480px breakpoint further collapses metadata and hides secondary rail icons.
- **Card grid:** 12-column CSS grid with `gap: var(--space-4)` (16px). Stat cards span 3 columns; feature cards span 6; full-width cards span 12.
- **`z-index` layers:** `surface` (0) → `panel` (10) → `overlay` (100) → `modal` (200) → `toast` (300) → `tooltip` (400).
- **Safe area:** 16px minimum margin from viewport edges on all surfaces.

## Elevation & Depth

Depth is communicated through surface darkness (lighter = higher), brand glows, and subtle border treatments. No skeuomorphic shadows used except as brand-glow accents.

**Surface stack (lowest to highest):**

| Level | Token | Hex | Use |
|---|---|---|---|
| 0 | `surface` | #0A0A0A | Page canvas |
| 1 | `surface-panel` | #121212 | Sidebar, elevated panels |
| 2 | `surface-card` | #1A1A1A | Cards, interactive tiles |
| 3 | `surface-card-hover` | #232323 | Hover state, input fill |

**Shadow system:**
- `shadow-sm` (`0 1px 2px rgba(0,0,0,.4)`) — card lift on default state
- `shadow-md` (`0 4px 12px rgba(0,0,0,.45)`) — panel and dropdown
- `shadow-lg` (`0 12px 32px rgba(0,0,0,.55)`) — modal and overlay
- `shadow-glow-cyan/purple/green` (`0 0 24px rgba(x,x,x,.35)`) — active brand elements only. One glow per viewport. Never stack multiple glow shadows on a single element.

**Brand glow rules:**
- Cyan glow: active AI avatar, focused primary input, active rail icon
- Purple glow: AI processing state, agent-online indicator
- Green glow: live/connected status, success confirmation

**Focus ring:** `0 0 0 2px var(--bg-0), 0 0 0 4px var(--lifeos-cyan)` — doubled ring (inner dark + outer cyan) ensures focus visibility on all surface levels.

## Shapes

The shape language is precise and restrained. LifeOS does not use organic or freeform curves — all radii are from the seven-step scale.

- **`md` (8px):** Default for inputs, menu items, buttons, chips. The workhorse radius.
- **`lg` (12px):** Cards, panels, drawers, modals. The card radius.
- **`xl` (16px):** Large feature cards, prominent CTAs.
- **`2xl` (20px):** Hero module surfaces, the AI avatar panel.
- **`full` (9999px):** Badges, count pills, toggle tracks, any truly circular element.
- **`sm` (6px):** Sub-pixel contexts, nested inner radii inside a `lg` card.
- **`xs` (4px):** Tooltips, tiny metadata chips.

**Rules:**
- Nested radii: inner radius = outer radius − padding. A `card-standard` (radius `lg`=12px) with 12px padding and a nested button uses `md`=8px on the button.
- Avoid mixing `xs` and `xl` in the same component — pick a visual register and stay in it.
- The AI avatar uses `full` for its circular face and `2xl` for its panel expansion.

## Components

Design-system primitives. Each entry maps visual tokens; behavioral specification lives in the SFC files under `src/components/`.

### Buttons

Four variants: **primary** (cyan fill, `on-brand` text), **secondary** (cyan-tint fill, `primary` text), **ghost** (transparent fill, `on-surface-variant` text), **icon-only** (32×32px). Disabled state uses `surface-card` fill with `on-surface-disabled` text. All share `rounded.md` (8px) and 36px height.

Primary buttons carry the brand; use them for the single most-important action per surface. Ghost buttons are for destructive or reversible actions. Secondary buttons occupy the supporting role.

### Cards

Four card patterns: `card-standard` (plain surface-card), `card-glow-cyan` / `card-glow-purple` (with brand-tinted border and box-shadow — see CSS variables `--tint-*`), `card-stat` (display-stat typography for numeric values). All use `rounded.lg` (12px). Card elevation is always `surface-card` (#1A1A1A) — never a lighter surface for dark-mode-only contexts.

### Inputs

Two patterns: `input-text` (black fill for contrast in forms) and `input-search` (card-colored for inline search). Both 36px height, `rounded.md` (8px). Focus state replaces border with `primary` cyan at 2px. Placeholder text uses `on-surface-subtle` (#6B6F74) via `var(--fg-4)`.

### Navigation

`menu-row` is the building block of the sidebar list: 32px height, transparent background, `rounded.sm`. The active state applies a `primary`-tinted left border and a cyan-14% background fill. The hover state darkens to `surface-card-hover` (#232323). Section headers above menu rows use `label-caps` typography.

### Chips & Pills

Filter chips use `surface-card` fill and `on-surface-muted` text. Status chips use the three-tone tint system: ok (green-14%), warn (amber-14%), err (red-14%). AI chips use purple-14% — indicating system intelligence state. Badge counts use `error` (#FF4D6A) fill with `on-brand` text (dark, passing WCAG AA at ~6:1); informational badges use cyan-14% fill with `primary` text.

### Sidebar & Rail

The navigation shell: a 56px collapsed rail with icon-only items expands to a 240px panel. The rail background is `surface` (#0A0A0A), not elevated — it recedes visually. The panel background is `surface-panel` (#121212). The active workspace icon has a `primary` left accent bar, not a fill.

### Toasts

Four tone variants (info/success/warn/error) using the 14% alpha fills. Positioned in a stack at the bottom-right viewport edge (`z-index: 300`). Auto-dismiss in 4s; hover pauses the timer. Maximum 4 toasts visible simultaneously.

### Brand Gradient Elements

The `brand-spiral-gradient` token (`linear-gradient(135deg, #00D4FF 0%, #9B7BFF 50%, #00E676 100%)`) appears as:
- Gradient text fill on the Rigelstar wordmark
- Left border treatment on focused/highlighted cards (`1px solid` with gradient applied via CSS mask)
- AIAvatar orbital ring glow on active state

The soft variant (`brand-spiral-gradient-soft`, 18% opacity) is safe to use as a subtle section accent.

## Do's and Don'ts

### Do

- **Do** lead with LifeOS on app icon, splash, login, onboarding, sidebar, app shell, loading, Settings, and About surfaces.
- **Do** use ElementArk as the parent endorsement on product surfaces and as the primary identity in corporate contexts.
- **Do** use the surface scale in order. A card (#1A1A1A) lives on a panel (#121212) on the page (#0A0A0A). Never invert.
- **Do** reserve the spiral gradient for brand moments — wordmark, AIAvatar, section-level accent borders. Maximum one gradient element per viewport section.
- **Do** use the focus ring (`ring-focus`) on every interactive element. The doubled ring (dark inner + cyan outer) is visible on all surface levels.
- **Do** write all UI copy in sentence case. LifeOS voice is calm and second-person: "LifeOS suggests:" not "WE RECOMMEND".
- **Do** use `on-surface-muted` (#9BA1A6) for metadata, timestamps, and secondary labels — not `on-surface-subtle` (#6B6F74) which is reserved for placeholder text (applied via `var(--fg-4)` CSS variable).
- **Do** use Lucide icons at stroke 1.5: 16px in rows, 14px in buttons, 20px in the rail. Lucide only — no emoji, no Unicode-as-icon.
- **Do** prefer `rgba()` alpha-fills for interactive tints over solid background color changes. The 14% fill + 30% border pattern is the standard.

### Don't

- **Don't** use the ElementArk-led corporate lockup as the default LifeOS app identity.
- **Don't** place separate LifeOS and ElementArk emblems on the same screen.
- **Don't** use the spiral gradient as a full-bleed background wash. It appears as an accent, never as wallpaper.
- **Don't** use more than one brand glow (cyan/purple/green box-shadow) per viewport.
- **Don't** use raw hex literals in component styles — always reference CSS variables (`var(--lifeos-cyan)`) or the token paths.
- **Don't** use emoji anywhere in the UI. LifeOS uses Lucide icons and `--fg-*` text only.
- **Don't** use light backgrounds. The `surface` scale tops out at #232323 — there are no white or near-white surface tokens.
- **Don't** mix `body-md` (Lexend 14px) with `mono-sm` (JetBrains Mono 12px) within the same paragraph. Mono is for codes and keys only.
- **Don't** use `display-stat` (Rigelstar) for anything other than numeric dashboard values and the wordmark. Running text in Rigelstar is off-brand.
- **Don't** stack multiple different-colored glows on one element. Pick one brand color per component.
- **Don't** add new CSS variables to `colors_and_type.css` without a corresponding token entry in this file. The two sources must stay in sync; the `broken-ref` lint rule will flag missing references.
