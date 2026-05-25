# LifeOS App — UI Kit

A hi-fidelity recreation of the LifeOS sidebar shell.  
Modeled after the **FlexNetOS/Sidebar** codebase (the original product mock) with the Ripple brand DNA layered in.

## What's in here

- `index.html` — interactive demo. Click sections in the rail to switch workspaces, expand items, open notifications.
- `App.jsx` — top-level shell, manages active section + collapse state.
- `Sidebar.jsx` — collapsible left rail (logo, search, primary nav, footer).
- `Workspace.jsx` — the secondary panel that swaps content by section.
- `MenuRow.jsx`, `Badge.jsx`, `StatusDot.jsx` — primitives.
- `Dashboard.jsx` — example main-canvas content for the Dashboard section.
- `data.js` — the content map (mirrors the source `getSidebarContent`).

## Source

Lifted from <https://github.com/FlexNetOS/Sidebar> (src/app/components/SidebarDemo.tsx).  
Component implementations are simplified (no Carbon icons; Lucide via CDN), but the visual
language — neutral-900 surfaces, Lexend, status dots, badge logic, expandable items — is preserved.
