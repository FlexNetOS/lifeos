# Loop iter 3 — HealthView + IoTView + NotificationsDrawer

Shipped 2026-05-21.

## Lanes

| Lane | Outcome |
|---|---|
| I3-A HealthView | Personal → Health surface. 4 metric cards (Steps, Sleep, Heart, Active) + sleep bar chart (7-night SVG) + activity rings (7 days × 3 rings) + heart-rate sparkline + right rail snapshot + LifeOS suggest. Tokens-only. +7 specs. |
| I3-B IoTView | Home → IoT surface. Room filter radiogroup chips + device list (online-first, signal bars, low-battery accessible label) + right rail signal strength card + latency pill. +13 specs. |
| I3-C NotificationsDrawer | Right-side drawer triggered by the bell rail-footer icon. Mark-all-read + dismiss + persistent unread badge. Open/dismissed/read state in persistence whitelist. +10 specs. |

## Post-swarm a11y fixes

| Surface | Finding | Fix |
|---|---|---|
| /Health | moderate:`landmark-complementary-is-top-level` | `<aside class="health-rail">` → `<section role="region">` |
| /IoT | moderate:`landmark-complementary-is-top-level` + `heading-order` | `<aside>` → `<section role="region">`; `<h3 class="iot-rail-head">` → `<h2>` |
| NotificationsDrawer open | serious:`color-contrast` (13 nodes) — `--fg-4` text on dark surface | Bumped to `--fg-3` (~7.5:1 contrast) |

## Verification

| Check | Result |
|---|---|
| `bun run test` | **180 / 180 across 23 files** (was 150 → +30) |
| `bun run build` | app 179.76 kB / gzip 54.60 kB. Clean. |
| `cargo build --manifest-path=src-tauri/Cargo.toml` | Clean (no new Rust deps) |
| axe-core sweep across 8 surfaces (Dashboard, Lights, Calendar, Files, Health, IoT, Settings, KeyboardHelp open) | **0 violations** |

## Bundle delta

| Chunk | Iter 2 | Iter 3 | Δ |
|---|---|---|---|
| App | 154 / 48 kB | 180 / 55 kB | +26 / +7 kB |
| Lucide | 64 / 12 kB | 67 / 12 kB | +3 / 0 kB (Footprints + Car + Server + Speaker + Trees + bell, x, sparkles) |

## Production-readiness scorecard

| Capability | Before | After |
|---|---|---|
| Dedicated subsection views | 4 | **7** (added Health, IoT, NotificationsDrawer as a dedicated surface) |
| Bell icon does something useful | ❌ routes to empty workspace | ✅ opens persistent notifications drawer |
| Real Pinia → Tauri persistence keys | 10 | **13** (+ notificationsDrawerOpen, dismissedNotificationIds, readNotificationIds) |
| Toasts + Drawer separation | One channel (AI chat) | Two channels (ephemeral toasts + persistent drawer inbox) |
