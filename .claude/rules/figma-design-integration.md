# Figma → LifeOS Design Integration Rules

Rules for translating Figma designs into this codebase via the Figma MCP connector.
Written against verified repository state on **2026-07-27**.

**Companion Figma file:** `Sidebar Design System Companion`
`file_key: z7aJ8uZrOsvfnWlsApN0Bu` — 7 pages, canonical token page `node_id 0:1`.

---

## 0. Authority model — read this first

This repository **inverts the usual Figma relationship**. Figma is a *controlled design
input*; the repository is *implementation authority*. This is not a stylistic preference —
it is enforced by a checked-in manifest and a passing verifier.

| Artifact | Role |
|---|---|
| `design-system-reference/figma/sidebar-design-system-companion.json` | The connector receipt + token/component mapping manifest. **The only sanctioned record of what Figma contains.** |
| `scripts/verify-figma-sidebar-companion.mjs` | Gate. Run with `bun run figma:sidebar:check`. |
| `tests/figma-sidebar-companion.spec.ts` | Structural regression on the mapped components. |
| `DESIGN.md`, `colors_and_type.css` | Token authority. Figma never overrides these. |

Verified passing:

```console
$ bun run figma:sidebar:check
{ "status": "ok", "file_key": "z7aJ8uZrOsvfnWlsApN0Bu", "component_mappings": 6,
  "document_pages": 4, "page_sections": 5, "specification_sections": 3,
  "token_mappings": 13, "code_connect": "seat_gated", "screenshot_authority": "disabled" }
```

### Prohibited as authority (`authority_guards.prohibited_authority`)

- Downloaded Figma screenshots
- Manually copied Figma CSS
- Temporary connector assets
- Figma variables absent from the checked-in contract

**Never** paste `get_design_context` CSS output into a component. Read the design, map it
to existing LifeOS tokens, and write LifeOS-idiomatic code.

### Divergences are RESOLVED — Figma now matches LifeOS

Until 2026-07-27 the companion painted itself in Inter with a blue `#60A5FA` accent, and that
was recorded as an accepted divergence. **That is no longer true.** The owner ruled the Brand
section correct and the sidebar spec off, so the spec was repainted *in Figma* to LifeOS
values.

| Was (companion) | Now (LifeOS) | Token |
|---|---|---|
| `#60A5FA` accent blue | **`#00D4FF`** | `--lifeos-cyan` |
| `#09090B` icon rail | **`#0A0A0A`** | `--bg-0` |
| `#0C0C0F` detail panel | **`#121212`** | `--bg-1` |
| `#111116` elevated | **`#1A1A1A`** | `--bg-2` |
| `#18181B` hover | **`#232323`** | `--bg-3` |
| `#0F1D31` active tint | **`#00D4FF` @ 10%** | `--tint-cyan-soft` |
| `#F4F4F5` / `#D4D4D8` / `#A1A1AA` / `#71717A` | **`#ECEDEE` / `#B5B7BA` / `#9BA1A6` / `#6B6F74`** | `--fg-1..4` |
| `#22C55E` / `#F59E0B` / `#EF4444` | **`#00E676` / `#FFB020` / `#FF4D6A`** | `--status-ok/warn/err` |
| Inter | **Lexend** | — |

Both ramps were preserved four steps deep rather than collapsed — elevation
(`--bg-0` rail < `--bg-1` panel < `--bg-2` card < `--bg-3` hover) and text (`--fg-1`…`--fg-4`).

> **The companion styles were a decoy.** Only **1** node was bound to a paint style and
> **zero** text nodes to a text style, while **268** nodes carried hardcoded fills. Editing
> the styles would have repainted almost nothing. Always measure binding coverage before
> assuming a style edit propagates.

Scope: canvases `5:104` (141 fills, 31 strokes, 84 font swaps) and `5:27` (60 fills, 31
strokes, 43 font swaps, 12 swatches), plus all 15 paint styles and 8 text styles.
`Sidebar Companion/Accent/Blue` → `Accent/Cyan`. Zero legacy colors remain; zero overflow.

### Other external design inputs are governed by the same rule

Figma is not the only controlled input. The **LifeOS Multi-Surface UI/UX Specification**
and **LifeOS_MultiSurface_Design_Tokens.json** (Gemini Spark, 2026-07-23, Google Drive)
proposed a full competing design system. Ruling, recorded 2026-07-27:

| Gemini Spark proposed | Disposition |
|---|---|
| Brand primary Electric Violet `#7C3AED` | **Rejected** — `--lifeos-cyan` `#00D4FF` is brand primary |
| Base surface Slate `#090D16` | **Rejected** — `--bg-0` `#0A0A0A` |
| Card glass `rgba(17,24,39,.75)` + backdrop-blur | **Rejected** — `--surface-card` `#1A1A1A`, flat |
| Inter | **Rejected** — Lexend |
| JetBrains Mono | Already the LifeOS mono — no change |
| Four surface viewports + density rules | **Adopted** (values snapped to the LifeOS 4pt scale) |
| Agent semantic roles (local node / active subagent / human approval) | **Adopted as roles**, bound to LifeOS values |

**The pattern:** adopt *structure and semantics* from an external design input; never adopt
its *values* over a LifeOS token. Record every such ruling here before writing code.

### Code Connect is seat-gated

`code_connect.status = "seat_gated"` — official Code Connect needs an Org/Enterprise Dev
seat; this account is Pro. **Do not attempt `add_code_connect_map` / `send_code_connect_mappings`.**
The repository-approved equivalent is the `data-figma-component` DOM anchor:

```svelte
<!-- src/components/MenuRow.svelte:22 -->
<div class="menu-row" class:active={item.active} class:collapsed
     data-figma-component="Sidebar Companion/Menu row"
     ...>
```

The verifier asserts each `component_mappings[].source_anchor` string is literally present
in its mapped source file. **Deleting or renaming an anchor breaks `figma:sidebar:check`.**

Current mappings (all six anchors verified present):

All six live on page `0:1`; the section column is the enforced tier.

| Section | Figma node | Concept | Source |
|---|---|---|---|
| `260:72` | `5:154` | Icon Rail / persistent 64px | `src/components/Sidebar.svelte` |
| `260:72` | `5:176` | Detail Sidebar / expanded 320px | `src/components/Workspace.svelte` |
| `260:72` | `5:130` | Sidebar Detail Item | `src/components/MenuRow.svelte` |
| `260:73` | `166:3` | Brand master / App mark | `src/components/Sidebar.svelte` |
| `260:73` | `145:2` | Brand master / Primary lockup | `src/views/Login.svelte` |
| `260:74` | `181:3` | Product identity / Navigation triad | `src/components/Sidebar.svelte` |

### Structure: one specification page, five sections

**The file has 4 pages, not 7.** On 2026-07-27 the owner consolidated by hand: pages `5:25`
(Components + Sidebar Spec), `166:2` (LifeOS Brand) and `181:2` (Product Identity) were
merged onto page `0:1` and **those three page ids no longer exist** — `get_metadata` returns
"node not found" for all three.

| Page | Node | Role |
|---|---|---|
| 00 — Overview + Tokens | `0:1` | **the** specification page; 5 sections |
| LifeOS / Screens | `5:26` | 59 frames + the on-canvas component library |
| LifeOS / Archive | `142:5950` | history |
| Archive — Non-LifeOS Screens | `119:1925` | history |

Page `0:1` is organized into five sections (created 2026-07-27, uniform 400px gutter,
120px inner padding, left-to-right in reading order):

| Section | Node | Holds | Tier |
|---|---|---|---|
| 01 — Foundations · Tokens | `260:71` | `5:27` | — |
| 02 — Components + Sidebar Spec | `260:72` | `5:104` | **specification** |
| 03 — Brand | `260:73` | `166:3`, `145:2`, `144:2` | **specification** |
| 04 — Product Identity | `260:74` | `181:3` | **specification** |
| 05 — Audit Evidence | `260:75` | `190:50` | — |

The verifier enforces this against **sections, not pages**: each specification section must
carry ≥1 mapping, every mapped `section_node_id` must exist, and the three dead page ids
must never reappear as a live `page_node_id`. Both guards are negative-tested.

> **`figma:sidebar:check` passing does not prove the Figma file matches.** It validates the
> manifest against the repo. It stayed green for a whole cycle while describing three pages
> that had been deleted. **Re-inspect the live file before trusting it.**

### Figma variables are real now — and they are downstream

`LifeOS/Colors` (22 variables, mode `Dark`) exists. The older manifest claim "no bound Figma
variables" is obsolete. Nine values contradicted LifeOS tokens and were corrected **in
Figma** on 2026-07-27 — including `Badge/Work`, which read violet `#8B5CF6` while the file's
own Product Identity page mandates **work = cyan**.

**Rule:** a variable named `LifeOS/*` that does not equal its LifeOS token is *mislabelled*,
not a divergence. Fix it in Figma. Divergence is reserved for the separately-named
`Sidebar Companion/*` paint styles (§0), which are the companion's own palette.

The product-identity triad binds `work → --lifeos-cyan`, `personal → --lifeos-purple`,
`home → --lifeos-green` — in the repo *and*, since 2026-07-27, in the Figma variables.

### Writing to Figma

This repo **does** write to Figma. Earlier guidance that "the Figma file is not edited from
this repository" is retired — it caused a full drift cycle where a manifest-only "promotion"
was recorded while the real file went untouched.

- Load the `figma-use` guidance **before** any `use_figma` call (MCP resource
  `skill://figma/figma-use/SKILL.md` when no plugin skill is installed).
- Enumerate pages with `figma.root.children` via `use_figma`. The MCP top-level listing
  reports only page `0:1` on this seat and **will mislead you**.
- Work incrementally, return every created/mutated node id, and verify with
  `get_metadata` + `get_screenshot` before moving on.
- Code Connect stays seat-gated (Full seat, Pro tier — needs Org/Enterprise). Keep using
  the `data-figma-component` anchors.

---

## 1. Token definitions

Tokens live in **two files that must be changed together**. There is no codegen between
them — a lint gate binds them instead.

### 1a. `DESIGN.md` (repo root) — agent-readable spec, generates exports

Google Labs `@google/design.md@0.1.1` format. YAML front matter + 8 markdown sections.
Currently: **17 colors, 11 typography scales, 7 rounding levels, 9 spacing tokens, 32 components.**

```yaml
---
version: alpha
name: LifeOS
colors:
  primary: "#00D4FF"             # cyan — actions, focus, link
  secondary: "#9B7BFF"           # purple — AI, thinking, memory
  tertiary: "#00E676"            # green — success, ok, live
  surface: "#0A0A0A"             # page background (--bg-0)
  surface-card: "#1A1A1A"        # card (--bg-2)
  on-surface: "#ECEDEE"          # default text (--fg-1)
typography:
  body-md: { fontFamily: Lexend, fontSize: 14px, fontWeight: 400, lineHeight: 1.45 }
rounded: { xs: 4px, sm: 6px, md: 8px, lg: 12px, xl: 16px, 2xl: 20px, full: 9999px }
spacing: { xs: 4px, sm: 8px, md-sm: 12px, md: 16px, lg-sm: 20px, lg: 24px, xl: 32px }
components:
  button-primary:
    backgroundColor: "{colors.primary}"     # ← reference syntax, lint-checked
    textColor: "{colors.on-brand}"
    typography: "{typography.body-md-strong}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 16px
---
```

### 1b. `colors_and_type.css` (repo root) — the runtime consumer

Three-layer CSS custom property cascade. **Components consume layer 3 only.**

```css
/* Layer 1 — CORE (raw values, do NOT consume directly in UI) */
--lifeos-cyan: #00D4FF;  --bg-0: #0A0A0A;  --fg-1: #ECEDEE;

/* Layer 2 — SEMANTIC (consume these) */
--surface-page: var(--bg-0);
--surface-card: var(--bg-2);
--text-primary: var(--fg-1);
--border-focus: var(--lifeos-cyan);

/* Layer 3 — radii / shadow / spacing / type ramp */
--radius-md: 8px;  --space-4: 16px;  --text-base: 14px;
--font-sans: "Lexend", system-ui, -apple-system, "Segoe UI", sans-serif;
```

**Contract:** every opaque `#hex` in `colors_and_type.css` must mirror a token in
`DESIGN.md`'s `colors:` map.

### 1c. Transformation system

`DESIGN.md` is the only input; both exports are byte-deterministic and checked in.

```bash
bun run design:export          # → both exports below
# design-system-reference/exports/tokens.json          (DTCG 2025.10)
# design-system-reference/exports/tailwind.theme.json  (Tailwind v3 theme.extend)
```

DTCG output shape:

```json
{ "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
  "color": { "$type": "color",
    "primary": { "$value": { "colorSpace": "srgb", "components": [0, 0.831, 1], "hex": "#00d4ff" } } } }
```

> **The Tailwind export is an interop artifact, not a build input.** Tailwind is not
> installed. Do not `import` it or introduce Tailwind classes.

### 1d. Token gates

```bash
bun run design:lint    # broken-ref (error) + contrast-ratio (warn). MUST exit 0, 0 errors.
bun run design:diff    # HEAD~1 vs HEAD; fails on token regressions in
                       # colors/typography/rounded/spacing unless allowlisted in
                       # scripts/design-diff.allow
```

### Rule: adding a token from a Figma design

1. Add to `DESIGN.md` front matter (correct category, `{reference}` syntax for components).
2. Add the matching CSS custom property to `colors_and_type.css` — core layer *and* a
   semantic alias if UI consumes it.
3. `bun run design:export` — commit regenerated exports.
4. `bun run design:lint` — must be 0 errors.
5. Refresh `observed_design_tokens` in the Figma manifest with the mapping + relationship.

---

## 2. Component library

### 2a. Framework: Svelte 5 — ⚠️ NOT Vue

**The Vue SFC toolchain retired at the phase-3 cutover.** All 25 components are `.svelte`.

> **Stale docs warning.** `CLAUDE.md` ("Vue 3 + Vite + Pinia") and `src/AGENTS.md`
> ("22 SFCs", `.vue`, `shims-vue.d.ts`, `lucide-vue-next`) predate the migration and are
> **wrong**. This file supersedes them for framework questions. Ground truth:
> `vite.config.ts` loads only `svelte()`; `package.json` `build` is `svelte-check && vite build`.

The `vue` package **is** still a runtime dependency, but only as Pinia's reactivity engine
plus `vue-router`. There are no Vue components.

### 2b. Component inventory (`src/components/`, `src/views/`)

| Tier | Components |
|---|---|
| Primitives | `Icon`, `Badge`, `MenuRow` |
| Shell | `App.svelte`, `Sidebar`, `Workspace`, `AIAvatar` |
| Overlays | `CommandPalette`, `KeyboardHelp`, `NotificationsDrawer`, `ToastContainer`, `AIChat` |
| Views | `Dashboard`, `SubsectionView`, `SettingsView`, `ContactsView`, `CalendarView`, `FilesView`, `HealthView`, `IoTView`, `LightsView`, `N8nFlowView`, `TelemetryWidget`, `OpenPencilEditor`, `views/Login` |

### 2c. Canonical component pattern (Svelte 5 runes)

```svelte
<script>
  // LifeOS — MenuRow SFC (Svelte port of MenuRow.vue)
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";

  // Explicit destructured $props() with defaults — always. Never implicit.
  let { item, collapsed = false, onclick } = $props();

  function activate() { onclick?.(item); }
</script>

<div class="menu-row" class:active={item.active} class:collapsed
     data-figma-component="Sidebar Companion/Menu row"
     role="button" tabindex="0"
     onclick={activate} onkeydown={onRowKeydown}>
  <Icon name={item.icon || "circle"} size={16} />
  {#if !collapsed}<span class="label">{item.label}</span>{/if}
</div>
```

Runes in use: `$props()`, `$state()`, `$derived()`. Callback props (`onclick`), **not**
`createEventDispatcher`. Children via `{@render children?.()}`.

**Pinia in Svelte:** stores are bridged, not used directly.

```svelte
import { useLifeos } from "@/stores/lifeos.js";
import { bindStore } from "@/lib/pinia-bridge.svelte.js";
const lifeos = useLifeos();
const lifeosState = bindStore(lifeos, ["activeId", "wsCollapsed", "aiAvatarHidden"]);
// read lifeosState.activeId — reactive in the Svelte tree
```

Navigation uses `createNav(router)` from `@/lib/svelte-nav.js` — **not** `useNav()` from
`nav.ts`, which needs Vue component injection that no longer exists.

### 2d. There is no Storybook

The design surfaces are `design-system-reference/README.md` (long-form spec),
`design-system-reference/preview/`, and the Vitest suites. Don't generate Storybook stories.

---

## 3. Frameworks, build, libraries

| Concern | Choice | Notes |
|---|---|---|
| UI | Svelte 5.56 | Runes mode |
| State | Pinia 3 (`setActivePinia`, no `app.use`) | Bridged via `pinia-bridge.svelte.js` |
| Routing | vue-router 5, headless | `router.push(router.options.history.location)` boots it |
| Build | Vite 8 + Rolldown | `rolldownOptions.output.codeSplitting` |
| Types | TypeScript 6, `svelte-check` | `vue-tsc` is gone |
| Test | Vitest 4 + happy-dom + `@testing-library/svelte` | |
| a11y | `vitest-axe` + `axe-core` | separate config |
| Native | Tauri 2 | `frontendDist` = Vite output |
| PM | **bun 1.3.14** | never npm |

```bash
bun run dev          # Vite :1420 (strictPort — Tauri expects it)
bun run build        # svelte-check && vite build
bun run test         # Vitest unit
bun run test:a11y    # 35 axe assertions, 0 violations enforced
bun run check        # svelte-check + test + test:a11y + design:lint + tauri:icons:check
```

Path alias `@/` → `src/` is declared in **three** places — `tsconfig.json`,
`vite.config.ts`, `vitest.config.ts` (and again in `vitest.a11y.config.ts`). Add a new
alias to all of them or imports break asymmetrically.

Vendor chunking is deliberate (`vite.config.ts`) — `lucide` (~600 KB) is isolated so the
app chunk stays small and vendor chunks cache across releases. **Do not collapse it.**

---

## 4. Asset management

Static assets are served from `public/` at the web root — no import pipeline, no hashing,
no CDN. Tauri bundles them; the app is offline-first.

| Asset | Path | Use |
|---|---|---|
| Primary lockup | `public/lifeos-primary-lockup.png` | 1.1 MB |
| Wordmark + tagline | `public/lifeos-wordmark-tagline.png` | |
| App mark | `public/lifeos-mark.png` / `lifeos-mark-256.png` | favicon + Tauri icon source |
| Nav triad | `public/icons/{work,personal,home}-on-black.png` | cyan / purple / green |
| Triad SVG | `public/work_personal_home_icons.svg` | |
| Display font | `fonts/Rigelstar.ttf` (188 KB) | self-hosted `@font-face` |

Reference with a root-absolute path: `href="/lifeos-mark-256.png"`.

**Rules when Figma has exportable assets:**
- Brand marks already exist. **Do not export a new logo from Figma** — the companion's
  "01 — LifeOS Brand" page maps to these existing files.
- Never commit `download_assets` output as authority (`prohibited_authority`).
- Icons must become Lucide names, not rasters (§5).
- Lexend + JetBrains Mono load from Google Fonts via `@import` in `colors_and_type.css`;
  the Tauri CSP already allows this. Rigelstar is local.

---

## 5. Icon system

**Lucide only**, through a kebab-name barrel → `Icon.svelte`. No emoji, no unicode-as-icon,
no PNG iconography.

`src/lib/icons-svelte.js` — **155 mapped icons**, sourced from `lucide-svelte`:

```js
import { Activity, Archive, ArrowLeft, AlertTriangle, BarChart3, Dot } from "lucide-svelte";
export const icons = {
  "activity": Activity,
  "arrow-left": ArrowLeft,
  "alert-triangle": AlertTriangle,
  // kebab-case key → PascalCase Lucide component
};
```

```svelte
<!-- src/components/Icon.svelte -->
let { name, size = 16, strokeWidth = 1.75, ...rest } = $props();
let Comp = $derived(icons[name] || null);
{#if Comp}<Comp {size} {strokeWidth} aria-hidden="true" {...rest} />
{:else}<span style="display:inline-block;width:{size}px;height:{size}px;" aria-hidden="true"></span>{/if}
```

**Naming convention:** kebab-case of the Lucide PascalCase name. `AlertTriangle` →
`"alert-triangle"`. Unmapped names render a sized blank placeholder — silent, not an error.

**Adding an icon requires two edits in the same file:** the named PascalCase import *and*
the kebab map entry. Miss either and you get a silent blank.

> There are three icon barrels. `icons-svelte.js` is the **live** one. `icons.js` / `icons.ts`
> are the retired Vue barrels kept as siblings. Edit `icons-svelte.js`.
> Note `"bot-off"` and `"incognito"` are *intentionally* unmapped — parity with the Vue
> barrel. Don't "fix" them.

**Sizing (from the design contract):** 16px in rows · 14px in buttons · 20px in rails ·
stroke 1.5 (component default 1.75).

Vitest aliases `lucide-svelte` → `tests/__mocks__/lucide-svelte.js` in both configs so the
600 KB pack never loads in tests. New icon tests must survive the stub.

---

## 6. Styling approach

**Global-CSS-first, token-driven. This is the single most important thing to get right
when generating a component from Figma.**

Load order is explicit in `src/main.ts` (nested `@import` triggers PostCSS ordering warnings):

```ts
import "../colors_and_type.css";  // 1. tokens
import "../lifeos_app.css";       // 2. canonical component CSS — 3,835 lines
import "../styles.css";           // 3. top-level: route transitions, .skip-link
```

**Only 8 of 25 components have a scoped `<style>` block** (`Sidebar`, `SettingsView`,
`CalendarView`, `KeyboardHelp`, `NotificationsDrawer`, `TelemetryWidget`, `ToastContainer`,
`views/Login`). The other 17 — including `Dashboard`, `Workspace`, `MenuRow`, `Badge` —
carry **zero** CSS and consume global classes from `lifeos_app.css`.

### Rule: where does new CSS go?

| Situation | Destination |
|---|---|
| Restyling an existing surface | `lifeos_app.css`, in its existing `/* ==== SECTION ==== */` block |
| A shared/reused visual pattern | `lifeos_app.css` |
| Genuinely component-local (popover geometry, one-off animation) | scoped `<style>` in that component |
| A new token | `DESIGN.md` + `colors_and_type.css` (§1) |

Class naming is flat kebab-case with a component prefix, not BEM: `.menu-row`,
`.rail-switcher-trigger`, `.net-ctl-head`. State via Svelte `class:` directives —
`class:active={item.active}`, `class:collapsed`.

### Tokens, not literals — with a caveat

The stated contract is *"All color/spacing/radii/shadow come from `colors_and_type.css` CSS
variables. No inline hex, ever."* Correct scoped-style example:

```css
.rail-switcher-link.on {
  background: var(--lifeos-green);
  box-shadow: 0 0 0 1.5px var(--bg-1), 0 0 6px var(--tint-green-glow-hi);
}
```

**Measured reality: 43 hex literals remain across 6 components** — `CalendarView` (16),
`HealthView` (15), `OpenPencilEditor` (7), `views/Login` (3), `SettingsView` (1),
`NotificationsDrawer` (1). These are pre-existing debt, **not** precedent. Write new code
with tokens. Do not add hex; do not bulk-refactor these unless asked.

### Responsive — two independent mechanisms

**1. Shell state (existing).** Layout is CSS grid/flex on a fixed desktop shell — Tauri
window 1280×800 default, 960×640 min, shell `Sidebar | Workspace | main | AIAvatar`
(`src/App.svelte`). This axis is **state-driven, not viewport-driven**:
`lifeos.wsCollapsed` swaps the workspace panel between `.workspace` (320px) and
`.workspace.mini`.

**2. Surface density (added 2026-07-27).** Four viewports — `mobile`, `workstation`,
`tv-10ft`, `ai-glasses` — as `[data-surface]` scopes in `colors_and_type.css` §9,
resolved by `src/lib/surface.svelte.js` and stamped on `<html>` before mount.

| Surface | Padding | Radius | Min target | Focus ring | Type scale |
|---|---|---|---|---|---|
| `mobile` | 12px | 16px | 44px | 2px | 1× |
| `workstation` *(default)* | 16px | 12px | 32px | 2px | 1× |
| `tv-10ft` | 32px | 20px | 64px | 4px | 1.5× |
| `ai-glasses` | 8px | 8px | 32px | 2px | 1.15× |

Precedence: explicit pin → `?surface=` → `VITE_LIFEOS_SURFACE` → width (`≤767px` = mobile).

**`tv-10ft` and `ai-glasses` are never auto-detected** — a TV reports a desktop-sized
viewport. Do not add a width heuristic for them.

Consume via `--surface-pad`, `--surface-radius`, `--surface-gap`, `--surface-min-target`,
`--surface-focus-ring`, `--surface-text-scale`, `--surface-opacity`, or the utility classes
`.surface-pad` / `.surface-card` / `.surface-stack` / `.surface-target` / `.surface-focus`.
**Opt-in only** — workstation defaults reproduce today's rendering exactly, so nothing
existing changes until a component adopts them. Spec: `tests/surface.spec.js` (17 cases).

> "Responsive + Handoff" was never built as a *page*, but it **does exist as frame `5:246`**
> on `LifeOS / Screens` (2400×1900). The file map card that advertised a three-page structure
> was corrected in Figma on 2026-07-27. The surface-density scaffold above is the code-side
> counterpart.

### Agent-state tokens

Six roles, distinct from generic `status-*`: `--agent-local` (green), `--agent-active`
(cyan), `--agent-approval` (amber), `--agent-thinking` (purple), `--agent-idle` (`--fg-3`),
`--agent-failed` (red), each with a matching `*-tint`. An agent chip says *where and how*
work runs, not whether an operation succeeded.

`--agent-idle` uses `--fg-3`, not `--fg-4`: `#6B6F74` on `--surface-card` measures 3.44:1
and fails WCAG AA. `design:lint`'s contrast rule catches it.

### Non-negotiable visual contracts

- **Dark-first.** `--bg-0` page, `--bg-2` cards, `--fg-1` text.
- **`--gradient-spiral` (cyan→purple→green) is the only chromatic moment** — never a full
  background wash.
- **One brand mark per screen; one brand glow per viewport** (status pulses excepted).
- **Lexend everywhere** except the Rigelstar wordmark. JetBrains Mono for shortcuts,
  timestamps, hex.
- **Voice:** calm, second-person, present-tense, sentence-case. AI suggestions prefixed
  literally `LifeOS suggests:`.

---

## 7. Project structure

```
lifeos/
├── DESIGN.md                      # ★ token spec (agent-readable, generates exports)
├── colors_and_type.css            # ★ token runtime (CSS custom properties)
├── lifeos_app.css                 # ★ canonical component CSS (3,835 lines)
├── styles.css                     # top-level: transitions, .skip-link
├── data.js                        # shared content layer → window.LIFEOS_DATA
├── index.html                     # #app mount, .lifeos-root, skip link
├── src/
│   ├── main.ts                    # mount(App) + pinia + headless router + CSS order
│   ├── App.svelte                 # shell: Sidebar | Workspace | main | AIAvatar
│   ├── components/                # 24 .svelte + AGENTS.md
│   ├── views/Login.svelte
│   ├── lib/                       # icons-svelte.js, svelte-nav.js, pinia-bridge.svelte.js,
│   │                              #   resolve/nav/persistence (.ts canonical ↔ .js sibling)
│   ├── stores/                    # lifeos, toasts (.ts ↔ .js siblings), auth.ts
│   ├── router/                    # vue-router config; URL ↔ Pinia sync
│   └── data/types.ts              # types for window.LIFEOS_DATA
├── design-system-reference/
│   ├── README.md                  # ★ long-form design system spec
│   ├── sot.md                     # verbatim user brief
│   ├── exports/                   # tokens.json (DTCG) + tailwind.theme.json — generated
│   └── figma/sidebar-design-system-companion.json   # ★ Figma manifest
├── scripts/verify-figma-sidebar-companion.mjs
├── tests/                         # *.svelte.spec.js mirrors src/components/
│   ├── a11y/{components,overlays,views}.spec.ts
│   ├── figma-sidebar-companion.spec.ts
│   └── __mocks__/lucide-svelte.js
├── src-tauri/                     # Rust shell: ai_complete, db_health, ...
└── crates/                        # lifeos-core (PostgreSQL/RuVector storage)
```

**`AGENTS.md` files are per-directory contracts** — `src/`, `src/components/`, `src/lib/`,
`src/stores/`, `tests/`, `public/`, `fonts/`, `design-system-reference/`. Read the local one
before editing a directory. (Several still describe the pre-migration Vue tree; framework
facts come from §2 of this file.)

**`.ts` ↔ `.js` sibling contract:** `stores/lifeos`, `stores/toasts`, `lib/resolve`,
`lib/nav`, `lib/persistence` exist in both. The `.js` versions feed the CDN preview path.
**Keep them sibling-identical** until the preview retires. `icons-svelte.js` is exempt —
it is Svelte-only glue, deliberately not a third sibling.

---

## 8. Workflow: implementing a Figma design

1. **Inspect live.** `get_metadata` / `get_design_context` on the exact node. Never work
   from a screenshot or a stale manifest entry.
2. **Map, don't copy.** Every observed color/spacing value → an existing LifeOS token via
   `observed_design_tokens`. A value with no token is a design decision requiring §1's
   add-a-token flow, not an inline literal.
3. **Locate the target.** If it's rail / detail-panel / menu-row, it maps to an existing
   component (§0) — extend it, keep the `data-figma-component` anchor. Otherwise place it
   per §7 and style it per §6.
4. **Write Svelte 5.** `$props()` destructured with defaults, runes, callback props,
   `Icon` for icons, global classes unless genuinely local.
5. **Ship the spec.** Every interactive surface lands with its `tests/<Name>.svelte.spec.js`
   in the same change, plus an a11y case if it's a new view/overlay.
6. **Refresh the manifest.** Update `observed_design_tokens`, `component_mappings`, and add
   a `refresh_log` entry with the connector receipt. Record every divergence explicitly.
7. **Gate it:**

```bash
bun run figma:sidebar:check   # manifest + anchor + token contract
bun run design:lint           # 0 errors required
bun run design:diff           # no unallowlisted token regression
bun run test                  # unit
bun run test:a11y             # 35 axe assertions, 0 violations
bun run build                 # svelte-check && vite build
```

### Never

- Generate Vue SFCs, `defineProps`, `createEventDispatcher`, or `lucide-vue-next` imports.
- Paste Figma CSS or inline a hex value.
- Import `tailwind.theme.json` or introduce Tailwind classes.
- Call `add_code_connect_map` — seat-gated; use the DOM anchor.
- Remove or rename a `data-figma-component` anchor.
- Use npm. Use `bun`.
- Adopt a Figma value over a LifeOS token where §0 records a divergence.
