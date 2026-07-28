// LifeOS — Tauri 2.x application library
// `lib.rs` holds everything except the platform-specific `main()`. This split is the
// Tauri 2 convention so the same crate can be reused on desktop and mobile targets.
// Native menu, window management, vault command stubs.

mod auth;

// Portable types live in lifeos-core (Stage 1b). The Tauri shell re-uses them
// directly through `#[tauri::command]` return positions — serde derives ride
// along with the struct definitions.
use flexnetos_redb_owner::{OwnerClient, ProjectionReader};
use lifeos_core::storage::{state, DbHealth, MigrateReport, Storage};
use lifeos_core::types::{AiProvider, AppVersion, TelemetrySnapshot, VaultEntry};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
// `tauri::menu::*` is only used inside the `#[cfg(desktop)]` block in `run()`,
// so the imports moved inline there. Mobile builds (iOS/Android) don't compile
// against `tauri::menu`, and a top-level `use` would break them.
use tauri::{Emitter, Manager};

fn redb_root() -> PathBuf {
    std::env::var_os("LIFEOS_REDB_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/home/flexnetos/meta/var/lib/redb"))
}

fn hex_bytes(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn seed_vault_secret() -> Result<Vec<u8>, String> {
    let entry = keyring::Entry::new("lifeos", "seed-vault")
        .map_err(|error| format!("seed vault keyring: {error}"))?;
    if let Ok(value) = entry.get_password() {
        let bytes = value.into_bytes();
        if bytes.len() >= 32 {
            return Ok(bytes);
        }
    }
    if let Ok(value) = std::env::var("LIFEOS_SEED_VAULT_SEED") {
        let bytes = value.into_bytes();
        if bytes.len() >= 32 {
            let _ = entry.set_password(&String::from_utf8_lossy(&bytes));
            return Ok(bytes);
        }
    }
    let mut bytes = Vec::with_capacity(32);
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    let encoded = hex_bytes(&bytes);
    entry
        .set_password(&encoded)
        .map_err(|error| format!("seed vault keyring write: {error}"))?;
    Ok(encoded.into_bytes())
}

async fn register_seed_vault(storage: &Storage) -> Result<(), String> {
    let secret = seed_vault_secret()?;
    let digest = Sha256::digest(&secret);
    lifeos_core::storage::seed_vault::register(
        storage.pool(),
        &digest,
        "os-keyring",
        serde_json::json!({
            "algorithm": "sha256",
            "purpose": "lifeos-seed-vault-root",
            "version": 1,
        }),
    )
    .await
    .map(|_| ())
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn redb_projection_read() -> Result<serde_json::Value, String> {
    let projection = ProjectionReader::read(redb_root()).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "localSeq": projection.local_seq,
        "slot": projection.slot,
        "checksum": projection.checksum,
        "degraded": projection.degraded,
        "entries": projection.entries,
    }))
}

#[tauri::command]
fn redb_state_write(key: String, value: String) -> Result<u64, String> {
    let mut client = OwnerClient::connect(redb_root()).map_err(|error| error.to_string())?;
    client.put(&key, &value).map_err(|error| error.to_string())
}

fn envctl_commit_conn() -> Result<String, String> {
    std::env::var("LIFEOS_ENVCTL_COMMIT_CONN")
        .map_err(|_| "LIFEOS_ENVCTL_COMMIT_CONN is required for envctl reconciliation".into())
}

#[tauri::command]
fn envctl_drain(max_batch: Option<usize>) -> Result<envctl_commit_worker::DrainReceipt, String> {
    envctl_commit_worker::drain_and_commit(&envctl_commit_conn()?, max_batch.unwrap_or(500), false)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn envctl_return_projection() -> Result<Vec<(String, String)>, String> {
    envctl_commit_worker::return_projection(&envctl_commit_conn()?, &redb_root())
        .map_err(|error| error.to_string())
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
}

#[derive(Default)]
struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

#[tauri::command]
fn terminal_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, TerminalState>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<String, String> {
    let size = PtySize {
        rows: rows.unwrap_or(24).max(1),
        cols: cols.unwrap_or(80).max(1),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|error| format!("open terminal: {error}"))?;
    let mut command = CommandBuilder::new("yzx");
    command.arg("enter");
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("start yzx enter: {error}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("clone terminal reader: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("open terminal writer: {error}"))?;
    let session_id = uuid::Uuid::new_v4().to_string();
    let event_session = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => {
                    let payload = serde_json::json!({
                        "sessionId": event_session,
                        "bytes": buffer[..length].to_vec(),
                    });
                    if app.emit("lifeos:terminal-output", payload).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(
            "lifeos:terminal-exit",
            serde_json::json!({ "sessionId": event_session }),
        );
    });

    state
        .sessions
        .lock()
        .map_err(|error| format!("terminal state lock: {error}"))?
        .insert(
            session_id.clone(),
            TerminalSession {
                master: pair.master,
                writer,
                child,
            },
        );
    Ok(session_id)
}

#[tauri::command]
fn terminal_write(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|error| format!("terminal state lock: {error}"))?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "terminal session is not active".to_string())?;
    session
        .writer
        .write_all(&bytes)
        .and_then(|_| session.writer.flush())
        .map_err(|error| format!("write terminal input: {error}"))
}

#[tauri::command]
fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|error| format!("terminal state lock: {error}"))?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "terminal session is not active".to_string())?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("resize terminal: {error}"))
}

#[tauri::command]
fn terminal_close(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|error| format!("terminal state lock: {error}"))?;
    sessions
        .remove(&session_id)
        .map(|_| ())
        .ok_or_else(|| "terminal session is not active".to_string())
}

#[tauri::command]
async fn vault_list(storage: tauri::State<'_, Storage>) -> Result<Vec<VaultEntry>, String> {
    lifeos_core::storage::vault::list(storage.pool())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_settings(window: tauri::Window) -> Result<(), String> {
    window
        .emit("lifeos:navigate", "/settings")
        .map_err(|e| e.to_string())
}

// ---------- Durable projection persistence ----------
// The frontend owns each slice's schema, while PostgreSQL/RuVector remains the
// one canonical durable product-data boundary. These command names intentionally
// remain stable for the existing Vue persistence and lighting stores.

#[tauri::command]
async fn lights_state_read(storage: tauri::State<'_, Storage>) -> Result<String, String> {
    state::read(storage.pool(), "lighting-state")
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn lights_state_write(
    storage: tauri::State<'_, Storage>,
    state: String,
) -> Result<(), String> {
    state::write(storage.pool(), "lighting-state", &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ui_state_read(storage: tauri::State<'_, Storage>) -> Result<String, String> {
    state::read(storage.pool(), "ui-state")
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ui_state_write(storage: tauri::State<'_, Storage>, state: String) -> Result<(), String> {
    state::write(storage.pool(), "ui-state", &state)
        .await
        .map_err(|e| e.to_string())
}

// ---------- AI provider routing ----------
// Reads the canonical `lifeos_runtime.projection` row `ai-provider` for
// `{ "provider": "claude" | "openai" | "gemini" }`.
// Each provider's API key is fetched from the OS keyring first (service: "lifeos",
// account: "anthropic" | "openai" | "gemini"), with env-var fallback for headless or
// keyring-less environments. The user-facing error message stays calm regardless of
// the underlying failure mode — never leak transport details to the UI.

const AI_ERROR_MSG: &str = "LifeOS couldn't reach the AI provider right now — try again.";

async fn read_provider(storage: &Storage) -> Result<AiProvider, String> {
    let raw = state::read(storage.pool(), "ai-provider")
        .await
        .map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("invalid persisted AI-provider projection: {e}"))?;
    Ok(val
        .get("provider")
        .and_then(|v| v.as_str())
        .and_then(AiProvider::from_str)
        .unwrap_or_else(AiProvider::default_provider))
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
    storage: tauri::State<'_, Storage>,
    prompt: String,
    source: String,
) -> Result<String, String> {
    let _ = source; // reserved for future per-surface routing (chat / open-pencil / lights)
    let provider = read_provider(&storage)
        .await
        .map_err(|_| AI_ERROR_MSG.to_string())?;
    match provider {
        AiProvider::Openai => call_openai(&prompt).await,
        AiProvider::Gemini => call_gemini(&prompt).await,
        AiProvider::Claude => call_claude(&prompt).await,
    }
    .map_err(|_| AI_ERROR_MSG.to_string())
}

#[tauri::command]
async fn ai_provider_get(storage: tauri::State<'_, Storage>) -> Result<String, String> {
    Ok(read_provider(&storage).await?.as_str().to_string())
}

#[tauri::command]
async fn ai_provider_set(
    storage: tauri::State<'_, Storage>,
    provider: String,
) -> Result<(), String> {
    let parsed = AiProvider::from_str(&provider)
        .ok_or_else(|| format!("unsupported provider: {provider}"))?;
    let payload = serde_json::json!({ "provider": parsed.as_str() }).to_string();
    state::write(storage.pool(), "ai-provider", &payload)
        .await
        .map_err(|e| e.to_string())
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

// ---------- Lua plugin host ----------
// Thin pass-through to `lifeos_core::plugin::PluginHost`. A fresh host is built
// per call so a script cannot poison the next caller's globals; the host has
// no filesystem, process, network, or application capability injection.
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
            redb_projection_read,
            redb_state_write,
            envctl_drain,
            envctl_return_projection,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_close,
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
        .manage(TerminalState::default())
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
                let storage = tauri::async_runtime::block_on(async {
                    let s = Storage::from_runtime_env()
                        .await
                        .map_err(|e| e.to_string())?;
                    s.migrate().await.map_err(|e| e.to_string())?;
                    s.verify_required_extensions()
                        .await
                        .map_err(|e| e.to_string())?;
                    register_seed_vault(&s).await?;
                    for (file_name, projection_key) in [
                        ("ui-state.json", "ui-state"),
                        ("lighting.json", "lighting-state"),
                        ("ai.json", "ai-provider"),
                    ] {
                        state::migrate_from_json_file(
                            s.pool(),
                            &app_data_dir,
                            file_name,
                            projection_key,
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                    }
                    lifeos_core::storage::accounts::migrate_from_json(s.pool(), &app_data_dir)
                        .await
                        .map_err(|e| e.to_string())?;
                    lifeos_core::storage::legacy_sqlite::migrate_from_sqlite(
                        s.pool(),
                        &app_data_dir.join("lifeos.db"),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                    Ok::<Storage, String>(s)
                })
                .map_err(|e| {
                    format!("LifeOS couldn't initialize canonical PostgreSQL/RuVector storage — see logs. ({e})")
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
