# Loop iter 1 — persistence + toasts + telemetry

Gemini session: `22809d0b-5042-4598-82c9-8f07e01f69a4`. Shipped 2026-05-21.

## Lanes

| Lane | Outcome |
|---|---|
| I1-A Persistence engine | `tauriPersistence(opts)` Pinia plugin + `ui_state_read` / `ui_state_write` Tauri commands + extracted `state_file(name)` helper. Whitelist persists 10 keys (activeId, wsCollapsed, sectionByWs, aiAvatarHidden, aiChatOpen, avatarPos, aiProvider, teamOrder, sectionOrder, itemOrder). 5 new specs. Punted: hydration→write echo (benign single redundant write at startup). |
| I1-B Toast notification system | `useToasts` Pinia store + `<ToastContainer />` (Teleport-mounted, 4 variants: info/success/warn/error). Replaced `comingSoon` AI-chat-spam pattern across Dashboard + LightsView. 14 new specs. |
| I1-C Telemetry widget | `sysinfo 0.32` Rust dep + `telemetry_read` Tauri command (cached `System` + `Networks` behind Mutex). New `TelemetryWidget.vue` mounts below the stats-grid on Dashboard, polls every 2s, no-ops + shows placeholder pill outside Tauri. 3 new specs. |

## Verification

| Check | Result |
|---|---|
| `bun run test` | 117 / 117 across 17 files (was 93 → +24) |
| `bun run build` | app 135.86 kB / gzip 42.81 kB · lucide 64.18 kB / gzip 11.90 kB. Clean. |
| `cargo build --manifest-path=src-tauri/Cargo.toml` | Clean (one new dep: sysinfo 0.32) |
| Playwright: toast renders on CTA click | ✓ 6 [class*=toast] elements active |
| Playwright: TelemetryWidget mounted on Dashboard | ✓ (placeholder mode outside Tauri) |
| axe-core full sweep (Dashboard with toast open) | **0 violations** (0 serious / 0 moderate) |

## Bundle delta

| Chunk | Iter 0 | Iter 1 | Δ |
|---|---|---|---|
| App | 128 / 40 kB | 136 / 43 kB | +8 / +3 kB |
| Lucide | 63 / 12 kB | 64 / 12 kB | +1 / +0 kB (Clock + MemoryStick) |
| CSS | 81 / 14 kB | 86 / 15 kB | +5 / +1 kB |
| **Vendor total gzip** | ~92 kB | ~100 kB | +8 kB |

## Production-readiness scorecard

| Capability | Before | After |
|---|---|---|
| UI state survives reload | ❌ | ✅ (Tauri-backed) |
| Non-blocking user feedback | ❌ AI-chat spam | ✅ Toast system |
| Live system metrics | ❌ | ✅ CPU / mem / network / uptime (Tauri only) |
| Rust ↔ Vue round-trip proven on a new surface | ✅ Lights only | ✅ Lights + Telemetry + UI state |
