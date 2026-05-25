# Next session — clone + incorporate Google's `design.md`

User request (verbatim, 2026-05-21):

> "Add plan task for cloning and incorporating Googles DESIGN.md for the next session 'google-labs-code/design.md'"

## Goal

Study Google's `design.md` (under a `google-labs-code` source) and incorporate the parts that strengthen LifeOS's dashboard without diluting its established identity (calm dark-first OS, tri-node arc mark, cyan→purple→green spiral gradient, Lexend + Rigelstar + JetBrains Mono, Lucide icons only, no emoji, sentence case, hover-only transitions).

## Source location — to confirm at start

The path `google-labs-code/design.md` could mean any of:
- `~/_work/repos/google-labs-code/design.md` (workspace canonical path per the `workspace-layout` memory)
- `~/repos/google-labs-code/design.md` (legacy path)
- A GitHub repo to clone (e.g. `github.com/google-labs/code` or `github.com/google/labs-code` — confirm with user)

**First step**: `find ~/_work/repos ~/repos -maxdepth 3 -name design.md -path "*google*"` and confirm the source before reading. If absent, ask the user for the canonical URL/path before cloning anywhere.

## Phase 0 — Locate + Read

- Locate `design.md`. Read top to bottom. Note its sections, code samples, opinions, and any token/component definitions.
- Read alongside `~/repos/ubuntu-lifeos/design-system-reference/README.md` (LifeOS DS spec) and `colors_and_type.css` so the comparison is concrete.
- Summarise in a 1-page diff: "what Google says vs what LifeOS does."

## Phase 1 — Categorise findings

Sort each Google-design item into:
- **Adopt verbatim** — patterns LifeOS lacks and that don't conflict with its identity (e.g. motion timing curves, focus-management patterns, density rules).
- **Adapt** — patterns whose intent transfers but values diverge (e.g. spacing scale, type ramp).
- **Skip** — patterns that conflict with LifeOS's calm dark-first identity (e.g. light mode primacy, vibrant gradients-as-wash, emoji semantics).

Output: a ranked list with rationale per item.

## Phase 2 — Plan integration

For each Adopt/Adapt item:
- Surface area touched (component / token / convention)
- Risk to existing 194 specs
- Risk to current 0-axe-violation baseline
- Estimated complexity (XS / S / M / L)

Group items into 1–3 swarm-shippable batches.

## Phase 3 — Implement (multi-model swarm pattern)

Same `/ecc:multi-frontend` workflow the loop used:
1. Gemini analyzer call to reconfirm batch order
2. 2-3 parallel `Agent(subagent_type=executor)` lanes per batch
3. Per-batch verify gate: `bun run test` + `bun run build` + `cargo build` + axe sweep across all 9 surfaces
4. Inline a11y fixes if regressions appear (the loop hit 4–5 of these; expect more)
5. Update `CHANGELOG.md` with the version bump (e.g. `0.1.5 — Google design incorporation`)

## Phase 4 — Close

- Update `HANDOFF.md` with any new patterns or traps the work surfaced
- Update `TODO.md` to mark the task complete + add any carry-over items
- Emit a closure doc at `.claude/plan/google-design-closure.md`
- Confirm: tests still pass, 0 axe violations, bundle within tolerance, all dedicated views still render

## Anti-list (do NOT do)

- **Don't import a CSS-in-JS framework, Material 3 web components, or any new UI dep** — LifeOS's CSS-tokens + SFC approach is the canonical path. If Google's design.md says "use Material You", we observe but don't adopt.
- **Don't introduce light mode in this pass** — explicitly out of scope per the LifeOS Design System.
- **Don't trade calm-OS aesthetic for vibrant-marketing aesthetic** — gradients, glows, and motion stay tightly budgeted.
- **Don't bloat the bundle** — every new pattern should be cheaper than 5 kB gzip on the app chunk, or it gets pushed to a vendor chunk via `manualChunks`.

## Reference

- LifeOS state-of-app: `.claude/plan/loop-closure.md`
- Operating contract: `AGENTS.md`
- Design system spec: `design-system-reference/README.md`
- Workflow patterns: see `lifeos-workflow` memory entry under `~/.claude/projects/-home-drdave--claude/memory/`
