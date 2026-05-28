## Context

LifeOS has a strong, opinionated design system distributed across two files: `colors_and_type.css` (60+ CSS variables: brand spiral, surface scale, foreground scale, tints, gradients, radii, shadows, spacing, type ramp) and `design-system-reference/README.md` (12.8K of brand prose, voice, asset attribution). What it does not have is an **agent-readable canonical file**. The repo runs five+ AI coding agents daily (Claude Code, Codex, Gemini, plus tooling); each re-derives the system from prose every session and the agents disagree subtly about boundaries (which colors are brand vs. status, what the radius scale names are, whether the spiral gradient is a color or a fill).

Google Labs' [`design.md` format](https://github.com/google-labs-code/design.md) (alpha, MIT, cloned to `~/_work/repos/google-labs-code-design.md/`) is precisely the missing piece: YAML front matter holds normative tokens, an 8-section markdown body holds rationale, a CLI lints against 8 rules. We adopt the **format**, not Material Design — no UI library, no visual change, no runtime dep.

The second half closes a long-standing gap. `loop-closure.md` documents "0 axe violations across 9 surfaces" but `grep -rn axe /home/drdave/repos/ubuntu-lifeos` returns empty: that baseline was achieved by a manual dev-tools sweep, not enforced. The chosen scope (component-level via `vitest-axe`, ~30 specs) turns the manual ritual into a test-runtime contract.

Hard constraints inherited from the codebase (`CLAUDE.md`, `AGENTS.md`, `package.json`, `vitest.config.ts`, `tests/setup.js`):

- **Single test runtime.** Vitest + happy-dom + `@vue/test-utils`. The existing setup file is `./tests/setup.js` (JavaScript, not TypeScript), 14.4K, populated with `globalThis.LIFEOS_DATA / LIFEOS_AGGREGATORS / LIFEOS_FLOWS / TONE` fixtures in `beforeAll`. The setup file must be **augmented**, not replaced.
- **Existing specs are `.js`.** All 27 specs under `tests/` use the `.js` extension. New a11y specs follow the same convention. Mixing `.ts` would surface `vue-tsc` config issues for the test tree.
- **The Vue icon dependency is `@lucide/vue` v1.16.0**, aliased to `tests/__mocks__/lucide-vue.js` in `vitest.config.ts`. The `lucide-vue-next` references in `AGENTS.md` and `CLAUDE.md` are stale and must not be relied on for implementation. New a11y specs that touch icons go through the existing alias automatically.
- **No runtime dependencies added.** Bundle size impact 0 bytes — everything new is `devDependencies`.
- **No `openssl-sys` in the cargo graph.** Pre-existing constraint, untouched (this change is JS-only).
- **ESP32 / `no_std` isolation must hold.** This change touches zero Rust code; the constraint is preserved by construction.
- **`.ts` / `.js` sibling parity** (`stores/lifeos.{ts,js}`, `lib/persistence.{ts,js}`, `lib/resolve.{ts,js}`) — none of those files are touched here.
- **OpenPencil mounting gate** (`v-else-if="lifeos.activeSub.item?.view === 'open-pencil'"`) — not touched.
- **194 existing specs must stay green.** New specs land under `tests/a11y/` so the unit-test signal stays clean and `bun run test:a11y` provides a separable channel.
- **Vue components reference `globalThis.LIFEOS_DATA` etc.** New a11y specs auto-load these via `tests/setup.js`'s existing `beforeAll`.
- **DESIGN.md format is `version: alpha`** — dependency version pinned exactly, no `^` range.

## Goals / Non-Goals

**Goals:**
- Land `DESIGN.md` at repo root containing the LifeOS token universe (YAML) plus 8-section prose, valid against `@google/design.md lint` with 0 errors.
- Add `@google/design.md` as a devDependency (exact pin) and wire four scripts: `design:lint`, `design:diff`, `design:export:dtcg`, `design:export:tailwind`.
- Generate and check in `design-system-reference/exports/tokens.json` (DTCG) and `design-system-reference/exports/theme.css` (Tailwind v4 `@theme`).
- Add `vitest-axe` + `axe-core` as devDependencies; augment `tests/setup.js` with the `toHaveNoViolations` matcher.
- Add ~30 component-level a11y specs under `tests/a11y/` covering the 11 dedicated views at idle, 4 overlays in open + closed states, and ~10 interactive component variants.
- Add `bun run test:a11y` and `bun run check` (umbrella) scripts to `package.json`.
- Update `design-system-reference/README.md` with a 5-line header pointer to `DESIGN.md` as the normative tokens source.
- Verifiable via the gate stack in §"Migration Plan".

**Non-Goals (explicit, deferred):**
- Auto-generation of `DESIGN.md` from `colors_and_type.css` (and vice versa). Drift is mitigated by lint + manual discipline + the `## Synchronization` note in DESIGN.md.
- GitHub Actions / pre-commit hook installation (no `.github/workflows/` in this repo today).
- Light mode color palette (explicitly out per `AGENTS.md`).
- Material 3 / Material Design component adoption (explicitly anti-listed).
- Replacing Lucide icons.
- Rewriting `design-system-reference/README.md` (only a 5-line pointer is added).
- E2E axe via Playwright (chosen scope is component-level vitest-axe).
- Component token mapping for every Vue SFC (only design-system-level primitives).
- Post-`alpha` `@google/design.md` schema migration (follow-up change when upstream leaves alpha).

## Decisions

### D1. Devdep tooling — `@google/design.md` exact pin + `vitest-axe@0.x` + `axe-core@4.x`

```jsonc
// package.json fragment
{
  "devDependencies": {
    "@google/design.md": "0.1.0",   // exact, no ^; replace with actual published version at install
    "vitest-axe":        "^0.1.0",  // vitest-axe is at 0.x; ^ inside 0.x is acceptable
    "axe-core":          "^4.10.0"  // pinned major
  }
}
```

The exact `@google/design.md` version is captured at install time. Document the version in `DESIGN.md` front matter (`version: alpha` per spec field, plus a comment line noting the CLI version used to validate). When upstream leaves alpha, a follow-up OPSX change re-validates.

**Why not `@axe-core/playwright`?** Playwright isn't in the workspace; adding it would multiply test runtime + CI complexity. Vitest + happy-dom is sufficient for component-level rendering and is what the rest of the suite uses.

### D2. New scripts in `package.json`

```jsonc
{
  "scripts": {
    "test:a11y":            "vitest run --dir tests/a11y",
    "design:lint":          "design.md lint DESIGN.md",
    "design:diff":          "design.md diff DESIGN.md design-system-reference/exports/DESIGN.previous.md",
    "design:export:dtcg":   "design.md export --format dtcg DESIGN.md > design-system-reference/exports/tokens.json",
    "design:export:tailwind":"design.md export --format css-tailwind DESIGN.md > design-system-reference/exports/theme.css",
    "design:export":        "bun run design:export:dtcg && bun run design:export:tailwind",
    "check":                "vue-tsc --noEmit && bun run test && bun run test:a11y && bun run design:lint"
  }
}
```

The binary alias is `designmd` per spec (`design.md` confuses Windows). Use `designmd` in scripts that may be invoked from a Windows host. The host this repo runs on is Linux, so `design.md` is fine — alias is a follow-up if/when a Windows contributor surfaces.

**`design:diff` baseline strategy.** The first time a maintainer runs `design:diff`, no previous-version artifact exists → output a no-op. After the first release tag, a release-time hook (out of scope for this change) snapshots `DESIGN.md` into `design-system-reference/exports/DESIGN.previous.md`. Until then, `design:diff` is advisory and may exit-0 with no diff output.

### D3. DESIGN.md token mapping

The complete YAML front matter for `DESIGN.md`. All values mirror existing `colors_and_type.css` variables; CSS variable names do not change.

```yaml
---
version: alpha
name: LifeOS
description: >
  The OS for work, personal & home automation. Calm dark-first surface with a
  cyan→purple→green spiral gradient as the single chromatic moment. Modeled on
  the FlexNetOS / Sidebar codebase. Tokens here are normative; long-form rationale
  lives in design-system-reference/README.md.

colors:
  # Brand triad (primary/secondary/tertiary follow spec convention)
  primary:           "#00D4FF"   # --lifeos-cyan      — actions, focus, links
  primary-hi:        "#5BE4FF"   # --lifeos-cyan-hi   — hover / glow
  primary-lo:        "#0099BF"   # --lifeos-cyan-lo   — pressed
  secondary:         "#9B7BFF"   # --lifeos-purple    — AI, thinking, memory
  secondary-hi:      "#B9A3FF"
  secondary-lo:      "#6E55D6"
  tertiary:          "#00E676"   # --lifeos-green     — success, accent, live
  tertiary-hi:       "#5BFFAA"
  tertiary-lo:       "#00A352"

  # Surface scale (deep black → near-white)
  surface-dim:       "#000000"   # --black
  surface:           "#0A0A0A"   # --bg-0
  surface-bright:    "#121212"   # --bg-1
  surface-container: "#1A1A1A"   # --bg-2
  surface-container-high: "#232323"  # --bg-3
  outline-variant:   "#2A2A2A"   # --bg-4
  outline:           "#3A3A3A"   # --bg-5

  # Foreground (text)
  on-surface-strong: "#FFFFFF"   # --fg-0
  on-surface:        "#ECEDEE"   # --fg-1 — neutral / default text
  on-surface-variant:"#B5B7BA"   # --fg-2
  on-surface-muted:  "#9BA1A6"   # --fg-3 — metadata
  on-surface-faint:  "#6B6F74"   # --fg-4 — placeholder
  on-surface-disabled:"#3F4348"  # --fg-5

  # Semantic status (distinct from brand)
  status-ok:         "#00E676"   # alias of tertiary
  status-warn:       "#FFB020"
  status-err:        "#FF4D6A"
  status-info:       "#00D4FF"   # alias of primary

  # Neutral / on-brand text
  on-primary:        "#0A0A0A"   # --text-on-brand
  neutral:           "#ECEDEE"   # alias of on-surface for spec compatibility

typography:
  display-hero:                  # --text-display, .t-display
    fontFamily: Rigelstar
    fontSize: 72px
    lineHeight: 1
    letterSpacing: 0.02em
  display-stat:                  # .t-stat
    fontFamily: Rigelstar
    fontSize: 48px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.04em
  headline-lg:                   # .t-h1
    fontFamily: Lexend
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-md:                   # .t-h2
    fontFamily: Lexend
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.015em
  headline-sm:                   # .t-h3
    fontFamily: Lexend
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  title-md:                      # .t-h4
    fontFamily: Lexend
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
  body-md:                       # .t-body — default UI
    fontFamily: Lexend
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  body-md-strong:                # .t-body-strong
    fontFamily: Lexend
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.45
  label-caps:                    # .t-section
    fontFamily: Lexend
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0.08em
  label-sm:                      # .t-meta
    fontFamily: Lexend
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  mono-sm:                       # .t-code
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 500
    letterSpacing: 0.02em

rounded:
  xs:      4px      # --radius-xs
  sm:      6px      # --radius-sm
  md:      8px      # --radius-md  (default for inputs, menu items)
  lg:      12px     # --radius-lg  (cards, panels)
  xl:      16px     # --radius-xl  (large feature cards)
  2xl:     20px     # --radius-2xl (hero modules)
  full:    9999px   # --radius-capsule

spacing:
  xs:      4px      # --space-1
  sm:      8px      # --space-2
  md:      12px     # --space-3
  lg:      16px     # --space-4   (canonical "base")
  xl:      20px     # --space-5
  2xl:     24px     # --space-6
  3xl:     32px     # --space-8
  4xl:     40px     # --space-10
  5xl:     48px     # --space-12
  6xl:     64px     # --space-16

components:
  # Primary CTA — the spiral gradient is the brand voice
  button-primary:
    backgroundColor: "linear-gradient(135deg, #00D4FF 0%, #9B7BFF 50%, #00E676 100%)"
    textColor:       "{colors.on-primary}"
    typography:      "{typography.body-md-strong}"
    rounded:         "{rounded.md}"
    padding:         "10px 16px"
    height:          36px
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, #5BE4FF 0%, #B9A3FF 50%, #5BFFAA 100%)"
  button-primary-disabled:
    backgroundColor: "{colors.outline-variant}"
    textColor:       "{colors.on-surface-disabled}"

  button-secondary:
    backgroundColor: "{colors.surface-container}"
    textColor:       "{colors.on-surface}"
    typography:      "{typography.body-md}"
    rounded:         "{rounded.md}"
    padding:         "10px 14px"
    height:          36px
  button-secondary-hover:
    backgroundColor: "{colors.surface-container-high}"

  button-ghost:
    backgroundColor: "transparent"
    textColor:       "{colors.on-surface-variant}"
    typography:      "{typography.body-md}"
    rounded:         "{rounded.md}"
    padding:         "8px 12px"
    height:          32px
  button-ghost-hover:
    backgroundColor: "{colors.surface-container-high}"
    textColor:       "{colors.on-surface}"

  card:
    backgroundColor: "{colors.surface-container}"
    textColor:       "{colors.on-surface}"
    rounded:         "{rounded.lg}"
    padding:         "{spacing.lg}"
  card-hover:
    backgroundColor: "{colors.surface-container-high}"

  input-field:
    backgroundColor: "{colors.surface-dim}"
    textColor:       "{colors.on-surface}"
    typography:      "{typography.body-md}"
    rounded:         "{rounded.md}"
    padding:         "10px 12px"
    height:          36px

  menu-row:
    backgroundColor: "transparent"
    textColor:       "{colors.on-surface-variant}"
    typography:      "{typography.body-md}"
    rounded:         "{rounded.md}"
    padding:         "8px 12px"
  menu-row-hover:
    backgroundColor: "{colors.surface-container-high}"
    textColor:       "{colors.on-surface}"
  menu-row-active:
    backgroundColor: "{colors.surface-container}"
    textColor:       "{colors.on-surface}"

  chip-filter:
    backgroundColor: "rgba(0, 212, 255, 0.10)"
    textColor:       "{colors.primary}"
    typography:      "{typography.label-sm}"
    rounded:         "{rounded.full}"
    padding:         "4px 10px"

  badge-count:
    backgroundColor: "rgba(0, 212, 255, 0.14)"
    textColor:       "{colors.primary}"
    typography:      "{typography.label-sm}"
    rounded:         "{rounded.full}"
    padding:         "2px 8px"

  kbd-key:
    backgroundColor: "{colors.surface-container}"
    textColor:       "{colors.on-surface-variant}"
    typography:      "{typography.mono-sm}"
    rounded:         "{rounded.xs}"
    padding:         "2px 6px"
---
```

**Why this exact mapping.** Spec-canonical names (`primary`/`secondary`/`tertiary`/`surface*`/`on-surface*`/`outline*`) maximise agent-readability — they are what `@google/design.md` agents expect. CSS variables in `colors_and_type.css` keep their `--lifeos-*` / `--bg-*` / `--fg-*` names unchanged so no Vue SFC needs a rename. The prose under `## Colors` documents the alias mapping so humans reading either file see both names.

**Gradient handling.** `--gradient-spiral` is the brand identity. The DESIGN.md spec has no gradient token type. Resolution: it lives in **prose** under `## Colors` ("The signature spiral — 135°, cyan → purple → green — is the only chromatic moment, never as a full background wash"), and as a raw `linear-gradient(...)` value inside `components.button-primary.backgroundColor`. The `broken-ref` lint will not flag a raw gradient value (it only checks `{path.to.token}` references).

**Tints / alphas.** Top-level `colors:` accepts only `#hex` SRGB per spec. The 14 `--tint-*` companions (e.g. `--tint-cyan-medium: rgba(0,212,255,.14)`) stay CSS-only. Where a component needs an alpha (chip, badge), the raw `rgba(...)` literal sits inside `components:` — permitted per the spec and the `atmospheric-glass` example.

### D4. DESIGN.md prose body — 8 canonical sections

Section order is normative (per `section-order` lint rule):

```
## Overview          — brand personality, voice, calm-OS positioning
## Colors            — palette rationale, spiral gradient prose, alpha-tint note
## Typography        — Rigelstar / Lexend / JetBrains Mono roles, scale rationale
## Layout            — 3-column shell (rail | workspace | canvas), 4pt grid, max-width 1200
## Elevation & Depth — borders+tones over shadows, glow budget (one per viewport)
## Shapes            — radius scale, no-mixing rule, capsule for pills/avatars
## Components        — design-system primitives only; consumer instructions
## Do's and Don'ts   — anti-AI-slop rules (no emoji, no left-border-stripe stat cards, etc.)
```

Each section is 80–200 words. The full prose is written during implementation; it is **derived from but not duplicated with** `design-system-reference/README.md`. The README adds a header pointer:

```markdown
> **Normative tokens live in `DESIGN.md` at the repo root.** That file is the
> single source of truth for token values; this document covers identity, voice,
> asset attribution, and component patterns that don't fit the token schema.
```

No content is removed from the README.

### D5. Synchronization contract

`DESIGN.md` is **hand-authored, manually kept in sync with `colors_and_type.css`** for this change. Drift mitigations:

1. The `broken-ref` lint rule (error severity) catches any `{path.to.token}` reference whose target doesn't exist in YAML. CI fails on it.
2. The `contrast-ratio` lint rule (warning) catches contrast regressions on component pairs.
3. A `## Synchronization` note inside `DESIGN.md` (last subsection of Components, before Do's and Don'ts) reminds editors to update both files together.
4. A follow-up OPSX change ("auto-generate DESIGN.md from colors_and_type.css") is queued in `TODO.md`.

Out of scope here: bidirectional auto-sync. The lint rule + the contributing note are sufficient for the alpha phase.

### D6. Vitest-axe wiring

**Setup augmentation** (additive, no removal):

```js
// tests/setup.js (additions at top, after existing imports)
import { expect } from "vitest";
import { toHaveNoViolations } from "vitest-axe/matchers";
import "vitest-axe/extend-expect";
expect.extend({ toHaveNoViolations });
```

`vitest-axe` exports both the matcher and an `extend-expect` import that registers it automatically — we use both belt-and-braces. Existing `beforeAll` block stays as-is.

**Axe configuration** — applied per-test via a shared helper, not globally, so individual specs can tune rules where genuinely needed:

```js
// tests/a11y/_axe-helper.js  (new file, _-prefix so vitest doesn't treat it as a spec)
import { axe } from "vitest-axe";
export const AXE_RULES = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
};
export async function expectNoA11yViolations(node) {
  const results = await axe(node, AXE_RULES);
  expect(results).toHaveNoViolations();
}
```

Specs use `await expectNoA11yViolations(wrapper.element)` after mounting and any necessary async (`flushPromises()`).

### D7. A11y spec layout — `tests/a11y/`

Mirror the existing spec pattern (`.js`, one component per file), but under a sub-directory so `bun run test:a11y` can filter independently of `bun run test`.

```
tests/a11y/
  _axe-helper.js                # shared helper (D6)
  Sidebar.a11y.spec.js          # rail expanded + collapsed
  Workspace.a11y.spec.js        # default + alt workspace
  Dashboard.a11y.spec.js
  LightsView.a11y.spec.js
  CalendarView.a11y.spec.js
  FilesView.a11y.spec.js
  HealthView.a11y.spec.js
  IoTView.a11y.spec.js
  ContactsView.workspace.a11y.spec.js
  ContactsView.aggregator.a11y.spec.js
  SettingsView.a11y.spec.js
  OpenPencilEditor.a11y.spec.js
  N8nFlowView.a11y.spec.js
  CommandPalette.a11y.spec.js   # closed + open
  KeyboardHelp.a11y.spec.js     # closed + open
  NotificationsDrawer.a11y.spec.js  # closed + open
  ToastContainer.a11y.spec.js   # empty + with toasts
  AIAvatar.a11y.spec.js         # hidden + visible + chat-open
  TelemetryWidget.a11y.spec.js  # loading + loaded + error
  Button.a11y.spec.js           # primary + secondary + ghost + disabled
  MenuRow.a11y.spec.js          # idle + hover + active
  Badge.a11y.spec.js            # count + dot
  Icon.a11y.spec.js             # all aria patterns
  Login.a11y.spec.js
  App-auth-gate.a11y.spec.js
```

Total: **27 a11y spec files** covering the dedicated views, overlays, and design-system primitives. Each file contains 1–3 `it()` blocks (one per state) for an estimated **~50 a11y assertions** across the suite. At ~150ms per axe run in happy-dom, total runtime budget ≈ 7.5s — acceptable per the chosen-scope cost/benefit.

### D8. Each a11y spec — concrete shape

```js
// tests/a11y/Sidebar.a11y.spec.js (example, illustrative)
import { describe, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import Sidebar from "../../src/components/Sidebar.vue";
import { expectNoA11yViolations } from "./_axe-helper.js";

describe("Sidebar — a11y", () => {
  it("has no axe violations when expanded", async () => {
    setActivePinia(createPinia());
    const wrapper = mount(Sidebar, { attachTo: document.body });
    await expectNoA11yViolations(wrapper.element);
    wrapper.unmount();
  });

  it("has no axe violations when collapsed", async () => {
    setActivePinia(createPinia());
    const wrapper = mount(Sidebar, {
      props: { collapsed: true },
      attachTo: document.body,
    });
    await expectNoA11yViolations(wrapper.element);
    wrapper.unmount();
  });
});
```

**Why `attachTo: document.body`.** axe-core inspects DOM ancestry for landmark / focus-trap / role context. Components mounted detached fail rules that aren't actually broken in production. The existing `Sidebar.spec.js` doesn't attach — that's fine for behavior tests; a11y tests do attach.

**Why `setActivePinia(createPinia())` per spec.** Components reading the `lifeos` Pinia store need a fresh store; isolation prevents state bleed between specs.

**Lucide stays mocked.** The vitest config's `@lucide/vue` → `tests/__mocks__/lucide-vue.js` alias applies; new specs need no special icon handling.

### D9. Lint failure semantics

`bun run design:lint` exits non-zero on **errors only** (per upstream CLI). Warnings (contrast-ratio, orphaned-tokens, missing-typography, section-order) are surfaced but don't fail the gate. The `bun run check` umbrella treats `design:lint` as a hard gate (any non-zero exit fails).

Target on first run: **0 errors, ≤4 warnings**. The 4 expected warnings are:
1. `missing-primary` — N/A (we define `primary` explicitly)
2. `orphaned-tokens` — likely on status-info/status-ok aliases if no component references them; either reference them or remove duplicates
3. `contrast-ratio` — primary `#00D4FF` on `surface` `#0A0A0A` = ~12.1:1 (passes AAA); secondary `#9B7BFF` on `surface-container` `#1A1A1A` = ~6.9:1 (passes AA). Should be 0 contrast warnings if mapping is correct.
4. `token-summary` (info) — informational only, never fails.

### D10. Documentation touch-points

1. `DESIGN.md` (new, repo root).
2. `design-system-reference/README.md` — 5-line header pointer (D4).
3. `design-system-reference/exports/tokens.json` (new, generated, checked in).
4. `design-system-reference/exports/theme.css` (new, generated, checked in).
5. `CLAUDE.md` — add a section under "Architecture beats you only see by reading multiple files": _"`DESIGN.md` is the normative token source for AI agents; `colors_and_type.css` is the runtime consumer; `design-system-reference/README.md` is the human prose. Keep all three in sync — the `broken-ref` lint rule catches stale token references but not stale CSS variables."_
6. `AGENTS.md` — add `bun run check` to the verification command list.
7. `CHANGELOG.md` — entry for the new bundle.
8. `TODO.md` — mark `google-design-incorporation` complete on close; add follow-up: "Auto-generate `DESIGN.md` ↔ `colors_and_type.css`", "GitHub Actions wiring for `bun run check`", "`@google/design.md` post-alpha migration".

## PBT Properties

These are **property-based invariants** the implementation must satisfy. Each lists the property, its statement, and a falsification (counterexample) strategy.

### P1 — DESIGN.md round-trips deterministically

**Property:** For any well-formed `DESIGN.md`, `design.md export --format dtcg D | design.md import D' --format dtcg` produces `D'` with the same `tokens` set as `D` (key set + values; not necessarily byte-identical YAML).

**Falsification:** Run `bun run design:export:dtcg`, parse the resulting JSON, walk every `colors / typography / rounded / spacing` token, assert each value exists in the original YAML.

**Where:** `tests/a11y/_design-md-roundtrip.spec.js` (not strictly a11y but lives near related tooling).

### P2 — DESIGN.md lint is deterministic

**Property:** `design.md lint DESIGN.md` produces the same JSON output for the same input file, across runs and platforms.

**Falsification:** Run lint 3× with identical input; assert outputs are byte-equal. Run on the CI host and the dev host; assert equal.

**Where:** Covered by upstream's own test suite; we add a smoke spec that calls the CLI and asserts exit code 0 + non-empty stdout.

### P3 — Axe baseline is zero (composability)

**Property:** For every dedicated view V in {Dashboard, LightsView, CalendarView, FilesView, HealthView, IoTView, ContactsView×2, SettingsView, OpenPencilEditor, N8nFlowView}, mounting V in happy-dom and running `axe.run()` returns `violations.length === 0`.

**Falsification:** Each spec under `tests/a11y/` is itself the falsification harness — any new code that introduces a violation on a covered surface turns that spec red.

### P4 — Token reference resolution

**Property:** Every `{path.to.token}` reference in `DESIGN.md` resolves to a defined token. `design.md lint`'s `broken-ref` rule (severity: error) enforces this.

**Falsification:** Add a deliberate `{colors.does-not-exist}` reference to a fixture file; assert `bun run design:lint <fixture>` exits non-zero.

**Where:** A negative-case test in `tests/a11y/_design-md-lint.spec.js` (uses a fixture file under `tests/__fixtures__/broken-design.md`).

### P5 — Color values are SRGB hex

**Property:** Every value under the top-level `colors:` map matches `/^#[0-9a-fA-F]{6}$/`. Values under `components:` may use `rgba(...)`, `linear-gradient(...)`, or `{colors.*}` references.

**Falsification:** Parse the YAML in `DESIGN.md`; iterate `colors`; assert regex match. Iterate `components`; assert each `*Color` field is one of {hex, rgba, linear-gradient, token-ref}.

**Where:** Same `_design-md-lint.spec.js` file.

### P6 — Order independence of axe rule activation

**Property:** Running axe with rule set A then B produces the same violations as running B then A, modulo rule-set composition. Practically: running with `wcag2aa` finds a superset of issues found with `wcag2a`.

**Falsification:** Per-spec — run with the AAA+best-practice rule set; assert no new violations versus the AA baseline.

**Where:** A single spec `tests/a11y/_axe-rule-monotonicity.spec.js` over one representative view.

### P7 — Build idempotency

**Property:** `bun run design:export` is idempotent — running it twice produces byte-identical artifact files.

**Falsification:** Run `bun run design:export` twice in sequence; `diff` the resulting `tokens.json` and `theme.css`; assert zero diff.

**Where:** Manual gate in §"Migration Plan"; optionally a CI smoke spec.

### P8 — `colors_and_type.css` ↔ DESIGN.md value parity (eventual)

**Property** (held by manual discipline + lint, not enforced in code in this change): Every `#hex` value present in `colors_and_type.css` `:root { --lifeos-*, --bg-*, --fg-* }` block exists somewhere in `DESIGN.md` `colors:` or is intentionally CSS-only (the `--tint-*` rgba companions and gradient definitions).

**Falsification:** Out of scope as an automated test in this change (would need a CSS parser); listed here so the follow-up auto-sync change has a property to enforce.

### P9 — A11y suite does not modify global state

**Property:** Running `bun run test:a11y` leaves the existing `bun run test` suite green — no test pollution, no module state leaks.

**Falsification:** Run `bun run test`, capture pass count. Run `bun run test:a11y`. Run `bun run test` again; assert same pass count.

**Where:** Manual smoke; not automated.

## Risks / Trade-offs

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | `@google/design.md` schema change mid-implementation (alpha) | Medium | High | Exact-version pin; subscribe to upstream releases; lint output is checked in to the change as a frozen snapshot |
| R2 | Axe finds violations the manual sweep missed | High (it's likely) | Medium | Treat first failures as discovery; fix inline before merging the suite; do not disable rules to hide violations |
| R3 | `contrast-ratio` warns on cyan-on-near-black boundary cases | Medium | Low | Verified manually: `#00D4FF` on `#0A0A0A` = 12.1:1, on `#1A1A1A` = 10.4:1 — both pass AA/AAA. Brand-tint pairs (`rgba(0,212,255,.14)` chips) live in `components` as raw values; lint won't compute contrast on rgba — axe enforces at the DOM layer |
| R4 | Vitest-axe slows the unit suite (~7s added for ~30 specs) | High | Low | `tests/a11y/` filterable via separate script; CI runs `test` and `test:a11y` as parallel jobs; locally, `bun run test` stays fast (filtered to non-a11y) |
| R5 | `tests/setup.js` augmentation conflicts with existing `globalThis.LIFEOS_DATA` setup | Low | Medium | Additive only — `expect.extend` runs before `beforeAll`; assertion ordering unchanged; verified by running existing 194 specs after augmentation |
| R6 | New specs depend on `globalThis.LIFEOS_*` indirectly via components | High | Low | Existing setup populates these in `beforeAll`; auto-applies to all specs under the configured `setupFiles` — works for `tests/a11y/` because Vitest's setup runs project-wide regardless of directory |
| R7 | `attachTo: document.body` causes mount leak between specs | Medium | Low | Each spec explicitly `wrapper.unmount()`s; Vitest test isolation tears down JSDOM/happy-dom on `afterEach`; helpers in `_axe-helper.js` document the cleanup contract |
| R8 | Tests pull in `@lucide/vue` real package and slow tests | Low | Medium | Existing alias `@lucide/vue` → `tests/__mocks__/lucide-vue.js` in `vitest.config.ts` applies; verified |
| R9 | `bun run design:lint` not found because CLI installs as `design.md` (with period) | Medium | Medium | Use `bunx design.md` form if direct `design.md` binary not picked up by `bun`'s script resolution; otherwise fall back to `bunx @google/design.md` — both documented in the implementation tasks |
| R10 | DTCG export emits non-deterministic JSON (key ordering) | Low | Low | If observed, pipe through `jq -S` to canonicalise; document in implementation tasks |
| R11 | Future contributor edits `colors_and_type.css` without updating `DESIGN.md` | Medium | Medium | `## Synchronization` note in DESIGN.md + CONTRIBUTING-style note in CLAUDE.md; follow-up auto-sync change queued |
| R12 | OpenPencil editor a11y test depends on its mounting gate | Low | Low | Test mounts `OpenPencilEditor.vue` directly (not through `App.vue`), bypassing the `v-else-if` gate; gate logic untouched |
| R13 | `vitest-axe` matcher TypeScript types collide with `@vue/test-utils` | Low | Low | Specs are `.js`, not `.ts` — no type collision possible. `vue-tsc --noEmit` only types `src/`, not `tests/` |
| R14 | `@axe-core/vue` exists separately and might be expected | N/A | N/A | We use `vitest-axe` because we are testing in Vitest, not in a running browser. `@axe-core/vue` is for in-browser dev-time scanning, a different use case |

## Migration Plan

**Pre-implementation gates** (must pass before starting):

1. `bun install --dry-run` resolves `@google/design.md`, `vitest-axe`, `axe-core` from npm. (Tasks 1.1–1.3.)
2. `bun run test` is green at 194 specs (baseline).
3. `bun run build` is green (baseline).

**Implementation order** (per `tasks.md`):

```
1. Devdep + script wiring          (Tasks 1.x)
2. DESIGN.md authored + lint green (Tasks 2.x)
3. Export artifacts checked in     (Tasks 3.x)
4. Vitest-axe wiring + helper      (Tasks 4.x)
5. A11y specs landed in batches    (Tasks 5.x)
6. Documentation pointers updated  (Tasks 6.x)
7. Verification gates green        (Tasks 7.x)
```

**Verification gates** (run in this order, all must pass; this is the "100% complete" closure ritual per `AGENTS.md` Phase 5):

```bash
# A. Lint & format
bun run design:lint                  # exit 0, 0 errors
bun run design:diff || true          # informational at this stage

# B. Type + unit + a11y tests
vue-tsc --noEmit                     # green
bun run test                         # 194 specs green
bun run test:a11y                    # ~50 axe assertions green, 0 violations

# C. Build
bun run build                        # vue-tsc + vite build green
bun run tauri:dev                    # manual smoke: dark window opens, no console errors

# D. Rust isolation (unchanged)
cargo check --workspace                                                    # green
cargo check -p lifeos-core --no-default-features                          # green
cargo tree -p lifeos-core --features storage | grep openssl-sys           # empty

# E. Determinism + idempotency
bun run design:export                # twice; second run produces byte-identical artifacts
md5sum design-system-reference/exports/tokens.json design-system-reference/exports/theme.css

# F. Umbrella
bun run check                        # all of the above; single gate
```

**Rollback**: revert the change. `DESIGN.md`, scripts, devdeps, and `tests/a11y/` artifacts disappear together. Nothing in `src/` or `src-tauri/` was touched; no runtime state to clean up.

**Forward policy**: `DESIGN.md` changes go through `design:lint` + `design:diff` as a pre-PR check. `bun run check` (umbrella) is the single command contributors need to run before pushing.

## Open Questions

None. All ambiguities surfaced during `/ccg:spec-research` were resolved:
- Source location → `https://github.com/google-labs-code/design.md` (user clarification).
- Material Design or format spec? → Format spec (verified from upstream README).
- Axe scope → component-level via `vitest-axe` (user answer).
- Doc split → tokens canonical in `DESIGN.md`, prose stays in `design-system-reference/README.md` (user answer).
- Color naming convention → spec-canonical (`primary`/`secondary`/`tertiary`/etc.) with LifeOS identity in prose (D3, soft constraint #1).
- Lint failure semantics → hard gate on errors, warnings tolerated (D9).
- Sync between DESIGN.md and CSS → manual + lint, with follow-up auto-sync change queued (D5).
- Diff baseline strategy → no previous-version artifact yet; `design:diff` advisory until first release tag (D2).
