<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# src

## Purpose
Rust source for the LifeOS Tauri shell. All command handlers, PostgreSQL-backed projection state, AI provider routing, native menu, and system telemetry live in `lib.rs`. `main.rs` is the platform-specific entry point (Windows subsystem flag + a single call into `lifeos_lib::run()`).

## Key Files
| File | Description |
|------|-------------|
| `main.rs` | Entry point. `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` suppresses the Windows console window in release. Calls `lifeos_lib::run()`. |
| `lib.rs` | Everything else. Sections: `VaultEntry` + `vault_list` stub; PostgreSQL projection handlers used by `lights_state_read` / `lights_state_write` / `ui_state_read` / `ui_state_write`; AI provider routing (`call_claude` / `call_openai` / `call_gemini`, with keyring-then-env-var key lookup via `lookup_key`); `ai_complete` / `ai_provider_get` / `ai_provider_set` commands; startup migration of pre-cutover app-data files into PostgreSQL; `app_version` metadata; `TelemetryState` + `telemetry_read` (sysinfo CPU/memory/network/uptime, with a prime+sleep on first call to avoid the misleading 0.0% cold reading); the native menu in `run()` (`Cmd-Q quit`, `Cmd-W close`, `Cmd-, settings` → emits `lifeos:navigate /settings`). |

## For AI Agents

### Working In This Directory
- **All command handlers live in `lib.rs`** — the Tauri 2 convention for desktop+mobile reuse. Do not split into multiple files without a coordinated plan; the `invoke_handler!` list at the bottom of `run()` is the single source of truth for which commands are exposed.
- AI provider list (`SUPPORTED_PROVIDERS`) MUST stay in sync with `AI_PROVIDERS` in `../../src/stores/lifeos.ts` and `../../src/stores/lifeos.js`.
- The user-facing error for any AI failure is the **literal** string `"LifeOS couldn't reach the AI provider right now — try again."` — bound to `AI_ERROR_MSG`. Never leak transport diagnostics to the JS layer.
- Key lookup prefers OS keyring (`service: "lifeos"`, account: `"anthropic"` / `"openai"` / `"gemini"`) with env-var fallback (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`). Either path is sufficient; both missing → `AI_ERROR_MSG`.
- PostgreSQL/RuVector is the only durable product-data boundary. New persisted slices go through `lifeos_core::storage::state`; app-data paths may be read only by the one-time legacy import and must never become a new write target.
- `TelemetryState` primes the CPU probe on first call by refreshing once, sleeping `MINIMUM_CPU_UPDATE_INTERVAL`, then refreshing again. This 200ms one-shot cost is intentional; subsequent calls are near-free. Don't remove the prime without verifying the widget shows a real number on first paint.

### Verification
```bash
cargo check                       # fast type check from src-tauri/
cargo clippy -- -D warnings       # lint
```

## Dependencies

### Internal
- Consumed by frontend `invoke(...)` calls in `../../src/stores/lifeos.{ts,js}`, `../../src/lib/persistence.{ts,js}`, `../../src/components/SettingsView.vue`, `../../src/components/TelemetryWidget.vue`, `../../src/components/LightsView.vue`.

### External
- `tauri@2` (menu, manager, emitter)
- `keyring@3`, `reqwest@0.12` (rustls-tls), `serde@1`, `serde_json@1`, `sysinfo@0.32`

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
