---
name: lifeos-design
description: Use this skill to generate well-branded interfaces and assets for LifeOS, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files (`colors_and_type.css`, `preview/`, `ui_kits/lifeos_app/`, `fonts/`, `assets/`).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out of this folder and create static HTML files for the user to view. Always:

1. Link or copy `colors_and_type.css` and use the CSS variables — never hard-code hex values.
2. Copy `assets/lifeos-mark.png` (1024) or `assets/lifeos-mark-256.png` (256) when you need the brand mark — the emblem has neon glow baked in and renders best on near-black surfaces. Use `assets/lifeos-mark-256.png` for favicons and small UI slots; use `assets/lifeos-mark.png` as the Tauri icon source. For a full hero use `assets/lifeos-primary-lockup.png`. Copy `fonts/Rigelstar.ttf` when you need the display face.
3. Pull components from `ui_kits/lifeos_app/` (Sidebar, Workspace, MenuRow, StatCard, etc) rather than recreating them.
4. Use Lucide via CDN (`https://unpkg.com/lucide@0.475.0/...`) for iconography.
5. Default to the dark theme: `var(--bg-0)` page, `var(--bg-2)` cards, `var(--fg-1)` text.

If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions (audience, surface, tone, size, variations), and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

**Brand DNA in one line:** Calm dark-first OS · tri-node arc mark · cyan→purple→green spiral gradient as the only chromatic moment · Lexend for everything except a Rigelstar display wordmark · never use emoji.

**Execution discipline:** This is a *design* skill, but agent work on this repo always follows the root operating contract (`../CLAUDE.md` / `../AGENTS.md`, top-of-file) — Boil-the-Ocean as the target, Karpathy guidelines as the execution style. Apply both even when generating throwaway mocks: surface assumptions, stay surgical, define a verifiable success criterion, and finish the asked-for scope completely without expanding it.
