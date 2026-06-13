// LifeOS — Tauri 2.x application library
// `lib.rs` holds everything except the platform-specific `main()`. This split is the
// Tauri 2 convention so the same crate can be reused on desktop and mobile targets.
// Native menu, window management, vault command stubs.

mod auth;

// Portable types live in lifeos-core (Stage 1b). The Tauri shell re-uses them
// directly through `#[tauri::command]` return positions — serde derives ride
// along with the struct definitions.
use lifeos_core::storage::{DbHealth, MigrateReport, Storage};
use lifeos_core::types::{AiProvider, AppVersion, TelemetrySnapshot, VaultEntry};
// `tauri::menu::*` is only used inside the `#[cfg(desktop)]` block in `run()`,
// so the imports moved inline there. Mobile builds (iOS/Android) don't compile
// against `tauri::menu`, and a top-level `use` would break them.
use tauri::{Emitter, Manager};

// Stub commands — wire to OS keyring (security-framework on macOS, secret-service
// on Linux, credentials-manager on Windows) in a follow-on round.
#[tauri::command]
fn vault_list() -> Vec<VaultEntry> {
    vec![VaultEntry {
        id: "aws-prod".into(),
        label: "AWS Production".into(),
        kind: "api_key".into(),
        masked_preview: "AKIA…WX5R".into(),
        last_rotated: "2025-04-12".into(),
    }]
}

#[tauri::command]
fn open_settings(window: tauri::Window) -> Result<(), String> {
    window
        .emit("lifeos:navigate", "/settings")
        .map_err(|e| e.to_string())
}

// ---------- State file persistence ----------
// Generic helper for any named JSON blob under <app_data_dir>. The frontend owns
// each slice's schema; this layer stays schema-agnostic so additive UI changes
// don't require a Rust rebuild. Used by lights_state_* and ui_state_*.

fn state_file(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    Ok(dir.join(name))
}

fn read_state_file(app: &tauri::AppHandle, name: &str) -> Result<String, String> {
    let path = state_file(app, name)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::from("{}")),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

fn write_state_file(app: &tauri::AppHandle, name: &str, state: String) -> Result<(), String> {
    let path = state_file(app, name)?;
    std::fs::write(&path, state).map_err(|e| format!("write {}: {e}", path.display()))
}

#[tauri::command]
fn lights_state_read(app: tauri::AppHandle) -> Result<String, String> {
    read_state_file(&app, "lighting.json")
}

#[tauri::command]
fn lights_state_write(app: tauri::AppHandle, state: String) -> Result<(), String> {
    write_state_file(&app, "lighting.json", state)
}

#[tauri::command]
fn ui_state_read(app: tauri::AppHandle) -> Result<String, String> {
    read_state_file(&app, "ui-state.json")
}

#[tauri::command]
fn ui_state_write(app: tauri::AppHandle, state: String) -> Result<(), String> {
    write_state_file(&app, "ui-state.json", state)
}

// ---------- AI provider routing ----------
// Reads `<app_data_dir>/ai.json` for `{ "provider": "claude" | "openai" | "gemini" }`.
// Each provider's API key is fetched from the OS keyring first (service: "lifeos",
// account: "anthropic" | "openai" | "gemini"), with env-var fallback for headless or
// keyring-less environments. The user-facing error message stays calm regardless of
// the underlying failure mode — never leak transport details to the UI.

const AI_ERROR_MSG: &str = "LifeOS couldn't reach the AI provider right now — try again.";

fn ai_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    Ok(dir.join("ai.json"))
}

fn read_provider(app: &tauri::AppHandle) -> AiProvider {
    let path = match ai_file(app) {
        Ok(p) => p,
        Err(_) => return AiProvider::default_provider(),
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return AiProvider::default_provider(),
    };
    let val: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return AiProvider::default_provider(),
    };
    val.get("provider")
        .and_then(|v| v.as_str())
        .and_then(AiProvider::from_str)
        .unwrap_or_else(AiProvider::default_provider)
}

// Pull a secret from the OS keyring (service "lifeos") then fall back to an env var.
// keyring crate failures (no secret-service daemon, locked keyring, missing entry) all
// silently route to the env fallback — the goal is *a* working key, not diagnostics.
fn lookup_key(account: &str, env_name: &str) -> Option<String> {
    if let Ok(entry) = keyring::Entry::new("lifeos", account) {
        if let Ok(secret) = entry.get_password() {
            let trimmed = secret.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    std::env::var(env_name)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

async fn call_claude(prompt: &str) -> Result<String, String> {
    let key = lookup_key("anthropic", "ANTHROPIC_API_KEY").ok_or(AI_ERROR_MSG)?;
    let body = serde_json::json!({
        "model": "claude-3-5-sonnet-latest",
        "max_tokens": 1024,
        "messages": [{ "role": "user", "content": prompt }],
    });
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|_| AI_ERROR_MSG.to_string())?;
    if !resp.status().is_success() {
        return Err(AI_ERROR_MSG.into());
    }
    let json: serde_json::Value = resp.json().await.map_err(|_| AI_ERROR_MSG.to_string())?;
    json.get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| {
            arr.iter()
                .find_map(|p| p.get("text").and_then(|t| t.as_str()))
        })
        .map(|s| s.to_string())
        .ok_or_else(|| AI_ERROR_MSG.into())
}

async fn call_openai(prompt: &str) -> Result<String, String> {
    let key = lookup_key("openai", "OPENAI_API_KEY").ok_or(AI_ERROR_MSG)?;
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [{ "role": "user", "content": prompt }],
    });
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|_| AI_ERROR_MSG.to_string())?;
    if !resp.status().is_success() {
        return Err(AI_ERROR_MSG.into());
    }
    let json: serde_json::Value = resp.json().await.map_err(|_| AI_ERROR_MSG.to_string())?;
    json.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AI_ERROR_MSG.into())
}

async fn call_gemini(prompt: &str) -> Result<String, String> {
    let key = lookup_key("gemini", "GEMINI_API_KEY").ok_or(AI_ERROR_MSG)?;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={key}"
    );
    let body = serde_json::json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
    });
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|_| AI_ERROR_MSG.to_string())?;
    if !resp.status().is_success() {
        return Err(AI_ERROR_MSG.into());
    }
    let json: serde_json::Value = resp.json().await.map_err(|_| AI_ERROR_MSG.to_string())?;
    json.pointer("/candidates/0/content/parts/0/text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AI_ERROR_MSG.into())
}

#[tauri::command]
async fn ai_complete(
    app: tauri::AppHandle,
    prompt: String,
    source: String,
) -> Result<String, String> {
    let _ = source; // reserved for future per-surface routing (chat / open-pencil / lights)
    let provider = read_provider(&app);
    match provider {
        AiProvider::Openai => call_openai(&prompt).await,
        AiProvider::Gemini => call_gemini(&prompt).await,
        AiProvider::Claude => call_claude(&prompt).await,
    }
    .map_err(|_| AI_ERROR_MSG.to_string())
}

#[tauri::command]
fn ai_provider_get(app: tauri::AppHandle) -> String {
    read_provider(&app).as_str().to_string()
}

#[tauri::command]
fn ai_provider_set(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let parsed = AiProvider::from_str(&provider)
        .ok_or_else(|| format!("unsupported provider: {provider}"))?;
    let path = ai_file(&app)?;
    let payload = serde_json::json!({ "provider": parsed.as_str() }).to_string();
    std::fs::write(&path, payload).map_err(|e| format!("write {}: {e}", path.display()))
}

// ---------- App version ----------
// Surfaces the LifeOS app version + Tauri runtime version + host target triple
// to the SettingsView "About" card. Pure metadata — no I/O. `AppVersion` lives
// in lifeos-core::types.

#[tauri::command]
fn app_version() -> AppVersion {
    AppVersion {
        app: env!("CARGO_PKG_VERSION").to_string(),
        tauri: tauri::VERSION.to_string(),
        target_triple: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
    }
}

// ---------- System telemetry ----------
// One sysinfo::System lives behind a Mutex inside Tauri state so the dashboard
// widget can refresh every 2 s without re-walking /proc each call. We only
// refresh the cheap-but-stateful probes (CPU / memory / network); processes and
// disks stay untouched. Hostname / OS labels come from the static helpers and
// don't need a refresh at all.
//
// CPU caveat: sysinfo computes CPU% from the delta between two refreshes. The
// first call to `telemetry_read` would therefore return 0.0% on a cold cache.
// To make the widget useful on first paint we sleep for
// `MINIMUM_CPU_UPDATE_INTERVAL` between the prime + sample refresh, but only
// when the cached system has never seen a CPU refresh. Subsequent calls are
// near-free (single `refresh_cpu_usage` against the already-warm state).

use std::sync::Mutex;
use sysinfo::{Networks, System, MINIMUM_CPU_UPDATE_INTERVAL};

pub struct TelemetryState {
    sys: Mutex<System>,
    networks: Mutex<Networks>,
    cpu_primed: Mutex<bool>,
}

impl TelemetryState {
    fn new() -> Self {
        Self {
            sys: Mutex::new(System::new()),
            networks: Mutex::new(Networks::new_with_refreshed_list()),
            cpu_primed: Mutex::new(false),
        }
    }
}

// `TelemetrySnapshot` lives in lifeos-core::types so the headless daemon can
// emit the same shape to its own consumers. `TelemetryState` above stays here
// because it wraps `sysinfo::System` behind a Mutex — that's shell-state, not
// portable data.

#[tauri::command]
fn telemetry_read(state: tauri::State<'_, TelemetryState>) -> Result<TelemetrySnapshot, String> {
    // Prime the CPU probe on first call. sysinfo needs two reads
    // `MINIMUM_CPU_UPDATE_INTERVAL` apart to compute a delta — on a cold cache we
    // take the small one-shot latency hit (≈200ms) so the widget shows a real
    // number on first paint instead of a misleading 0.0%.
    {
        let mut primed = state
            .cpu_primed
            .lock()
            .map_err(|e| format!("cpu_primed lock: {e}"))?;
        if !*primed {
            let mut sys = state.sys.lock().map_err(|e| format!("sys lock: {e}"))?;
            sys.refresh_cpu_usage();
            drop(sys);
            std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
            *primed = true;
        }
    }

    let mut sys = state.sys.lock().map_err(|e| format!("sys lock: {e}"))?;
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let cpu_percent = if cpus.is_empty() {
        0.0
    } else {
        let sum: f32 = cpus.iter().map(|c| c.cpu_usage()).sum();
        sum / (cpus.len() as f32)
    };

    let memory_used_bytes = sys.used_memory();
    let memory_total_bytes = sys.total_memory();

    let mut networks = state
        .networks
        .lock()
        .map_err(|e| format!("networks lock: {e}"))?;
    networks.refresh(true);
    let mut network_rx_bytes: u64 = 0;
    let mut network_tx_bytes: u64 = 0;
    for (_iface, data) in networks.iter() {
        network_rx_bytes = network_rx_bytes.saturating_add(data.total_received());
        network_tx_bytes = network_tx_bytes.saturating_add(data.total_transmitted());
    }

    let uptime_seconds = System::uptime();
    let hostname = System::host_name().unwrap_or_else(|| "unknown".into());
    let os_name = System::name().unwrap_or_else(|| "unknown".into());
    let os_version = System::os_version().unwrap_or_else(|| "unknown".into());

    Ok(TelemetrySnapshot {
        cpu_percent,
        memory_used_bytes,
        memory_total_bytes,
        network_rx_bytes,
        network_tx_bytes,
        uptime_seconds,
        hostname,
        os_name,
        os_version,
    })
}

// ---------- Lua plugin host (Wave 3 spike) ----------
// Thin pass-through to `lifeos_core::plugin::PluginHost`. A fresh host is built
// per call so a misbehaving script can't poison the next caller's globals; the
// Luau VM is cheap to construct (no I/O, vendored) so this is fine for the
// spike. Errors are flattened to strings — the calm-error UI contract lives at
// the Vue layer, this Rust surface stays mechanical.
#[tauri::command]
fn plugin_run(script: String) -> Result<String, String> {
    let host = lifeos_core::plugin::PluginHost::new().map_err(|e| e.to_string())?;
    host.run(&script).map_err(|e| e.to_string())
}

// ---------- Storage health / maintenance commands ----------

#[tauri::command]
async fn db_health(storage: tauri::State<'_, Storage>) -> Result<DbHealth, String> {
    storage.health().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_migrate(storage: tauri::State<'_, Storage>) -> Result<MigrateReport, String> {
    storage.migrate().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            vault_list,
            open_settings,
            lights_state_read,
            lights_state_write,
            ui_state_read,
            ui_state_write,
            ai_complete,
            ai_provider_get,
            ai_provider_set,
            app_version,
            telemetry_read,
            auth::auth_status,
            auth::auth_signup,
            auth::auth_signin,
            auth::auth_signout,
            auth::auth_reset_vault,
            plugin_run,
            db_health,
            db_migrate
        ])
        .manage(TelemetryState::new())
        .manage(auth::AuthState::new())
        .setup(|app| {
            // ── Storage initialization ──────────────────────────────────────
            // Runs synchronously (via block_on) before the event loop starts so
            // every command handler can safely assume `State<Storage>` is ready.
            {
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|e| format!("app_data_dir: {e}"))?;
                std::fs::create_dir_all(&app_data_dir)
                    .map_err(|e| format!("create_dir_all: {e}"))?;

                let db_path = app_data_dir.join("lifeos.db");
                let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

                let storage = tauri::async_runtime::block_on(async {
                    let s = Storage::new(&db_url).await.map_err(|e| e.to_string())?;
                    s.migrate().await.map_err(|e| e.to_string())?;
                    lifeos_core::storage::accounts::migrate_from_json(s.pool(), &app_data_dir)
                        .await
                        .map_err(|e| e.to_string())?;
                    Ok::<Storage, String>(s)
                })
                .map_err(|e| {
                    format!(
                        "LifeOS couldn't initialize storage at {} — see logs. ({e})",
                        db_path.display()
                    )
                })?;

                app.manage(storage);
            }

            // Native menu — Cmd-Q quit, Cmd-W close, Cmd-, settings.
            // Mobile (iOS / Android) doesn't expose a menu surface — `tauri::menu`
            // is desktop-only and including it under `tauri::mobile_entry_point`
            // fails to compile on those targets. The mobile readiness audit at
            // `.claude/plan/tauri-mobile-readiness.md` flagged this as the one
            // compile blocker for the iOS/Android dev shells; the `#[cfg(desktop)]`
            // gate is the surgical fix.
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

                let handle = app.handle();
                let settings_item =
                    MenuItem::with_id(handle, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
                let quit_item = PredefinedMenuItem::quit(handle, None)?;
                let close_item = PredefinedMenuItem::close_window(handle, None)?;

                let app_submenu = Submenu::with_items(
                    handle,
                    "LifeOS",
                    true,
                    &[&settings_item, &close_item, &quit_item],
                )?;
                let menu = Menu::with_items(handle, &[&app_submenu])?;
                app.set_menu(menu)?;
                app.on_menu_event(move |app, event| {
                    if event.id() == "settings" {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit("lifeos:navigate", "/settings");
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LifeOS application");
}
