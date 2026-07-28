// LifeOS — Tauri 2.x application library
// `lib.rs` holds everything except the platform-specific `main()`. This split is the
// Tauri 2 convention so the same crate can be reused on desktop and mobile targets.
// Native menu, window management, and canonical vault commands.

mod auth;

// Portable types live in lifeos-core (Stage 1b). The Tauri shell re-uses them
// directly through `#[tauri::command]` return positions — serde derives ride
// along with the struct definitions.
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use flexnetos_redb_owner::{read_events, OwnerClient, OwnerService, ProjectionReader};
use lifeos_core::storage::{state, DbHealth, MigrateReport, Storage};
use lifeos_core::types::{AiProvider, AppVersion, TelemetrySnapshot, VaultEntry};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use uuid::Uuid;
// `tauri::menu::*` is only used inside the `#[cfg(desktop)]` block in `run()`,
// so the imports moved inline there. Mobile builds (iOS/Android) don't compile
// against `tauri::menu`, and a top-level `use` would break them.
use tauri::ipc::Channel;
use tauri::{Emitter, Manager};

fn redb_root() -> PathBuf {
    std::env::var_os("LIFEOS_REDB_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/home/flexnetos/meta/var/lib/redb"))
}

#[cfg(test)]
mod terminal_tests {
    use super::engine_room_argv;

    #[test]
    fn engine_room_argv_matches_the_reattach_contract() {
        assert_eq!(
            engine_room_argv("lifeos-tenant-session"),
            vec![
                "yzx",
                "enter",
                "options",
                "--session-name",
                "lifeos-tenant-session",
                "--attach-to-session",
                "true",
                "--on-force-close",
                "detach",
            ]
        );
    }
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
fn redb_events_read(after_seq: u64) -> Result<serde_json::Value, String> {
    let events = read_events(redb_root(), after_seq).map_err(|error| error.to_string())?;
    Ok(serde_json::json!(events
        .into_iter()
        .map(|event| serde_json::json!({
            "seq": event.seq,
            "slot": event.slot,
            "checksum": event.checksum,
        }))
        .collect::<Vec<_>>()))
}

#[tauri::command]
fn redb_state_write(key: String, value: String) -> Result<u64, String> {
    let mut client = OwnerClient::connect(redb_root()).map_err(|error| error.to_string())?;
    client.put(&key, &value).map_err(|error| error.to_string())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeDbIngestReceipt {
    schema_version: &'static str,
    idempotency_key: String,
    owner_key: String,
    local_seq: u64,
    raw_sha256: String,
    typed_sha256: String,
}

/// Validate and place a complete CodeDB envelope in the authenticated redb
/// owner. PostgreSQL materialization is intentionally not reachable here;
/// envctl remains the sole durable committer.
#[tauri::command]
fn codedb_ingest_envelope(
    envelope: lifeos_core::ingress::CodeDbIngestEnvelope,
) -> Result<CodeDbIngestReceipt, String> {
    envelope.validate().map_err(|error| error.to_string())?;
    let typed_bytes = serde_json::to_vec(&envelope.typed_payload)
        .map_err(|error| format!("encode typed CodeDB payload: {error}"))?;
    let raw_sha256 = format!("{:x}", Sha256::digest(&envelope.raw_bytes));
    let typed_sha256 = format!("{:x}", Sha256::digest(&typed_bytes));
    let idempotency_digest = format!("{:x}", Sha256::digest(envelope.idempotency_key.as_bytes()));
    let owner_key = format!("codedb/ingress/{idempotency_digest}");
    let rendered = serde_json::json!({
        "schemaVersion": lifeos_core::ingress::CODEDB_INGEST_SCHEMA,
        "idempotencyKey": envelope.idempotency_key,
        "rawBytesBase64": BASE64.encode(&envelope.raw_bytes),
        "rawSha256": raw_sha256,
        "typedPayload": envelope.typed_payload,
        "typedSha256": typed_sha256,
        "context": envelope.database_context(),
    });
    let mut owner = OwnerClient::connect(redb_root()).map_err(|error| error.to_string())?;
    let local_seq = owner
        .put(&owner_key, &rendered.to_string())
        .map_err(|error| format!("CodeDB envelope owner write: {error}"))?;
    Ok(CodeDbIngestReceipt {
        schema_version: lifeos_core::ingress::CODEDB_INGEST_SCHEMA,
        idempotency_key: rendered["idempotencyKey"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        owner_key,
        local_seq,
        raw_sha256: rendered["rawSha256"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        typed_sha256: rendered["typedSha256"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    })
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

struct EnvctlReconciler {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl EnvctlReconciler {
    fn start() -> Option<Self> {
        if std::env::var_os("LIFEOS_ENVCTL_COMMIT_CONN").is_none() {
            return None;
        }
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let owner_root = redb_root();
        let thread = std::thread::Builder::new()
            .name("lifeos-envctl-reconciler".into())
            .spawn(move || {
                while !thread_stop.load(Ordering::SeqCst) {
                    if let Ok(conn) = std::env::var("LIFEOS_ENVCTL_COMMIT_CONN") {
                        if let Ok(receipt) =
                            envctl_commit_worker::drain_and_commit(&conn, 500, false)
                        {
                            if !receipt.committed.is_empty() || !receipt.skipped_existing.is_empty()
                            {
                                let _ = envctl_commit_worker::return_projection(&conn, &owner_root);
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_secs(1));
                }
            })
            .ok()?;
        Some(Self {
            stop,
            thread: Some(thread),
        })
    }
}

impl Drop for EnvctlReconciler {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
    output_offset: Arc<AtomicU64>,
    input_offset: Arc<AtomicU64>,
}

#[derive(Default)]
struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

static TERMINAL_FRAME_SEQUENCE: AtomicU64 = AtomicU64::new(1);

fn selected_environment_digest() -> String {
    let mut selected: Vec<_> = std::env::vars()
        .filter(|(name, _)| {
            name.starts_with("LIFEOS_RUNTIME_") || name == "LIFEOS_ENGINE_SESSION_NAME"
        })
        .collect();
    selected.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    let material = selected
        .into_iter()
        .map(|(name, value)| format!("{name}={value}\n"))
        .collect::<String>();
    format!("{:x}", Sha256::digest(material.as_bytes()))
}

fn runtime_lineage(session_id: &str) -> serde_json::Value {
    let value = |name: &str| std::env::var(name).ok();
    serde_json::json!({
        "tenant_id": value("LIFEOS_RUNTIME_TENANT_ID"),
        "identity_id": value("LIFEOS_RUNTIME_IDENTITY_ID"),
        "grant_id": value("LIFEOS_RUNTIME_GRANT_ID"),
        "lease_id": value("LIFEOS_RUNTIME_LEASE_ID"),
        "session_id": session_id,
        "engine_session_name": value("LIFEOS_ENGINE_SESSION_NAME"),
        "request_id": value("LIFEOS_RUNTIME_REQUEST_ID"),
        "execution_id": value("LIFEOS_RUNTIME_EXECUTION_ID"),
        "task_id": value("LIFEOS_RUNTIME_TASK_ID"),
        "branch_id": value("LIFEOS_RUNTIME_BRANCH_ID"),
    })
}

fn append_terminal_spool(envelope: &str) -> Result<(), String> {
    let spool_root = redb_root().join("terminal-spool");
    std::fs::create_dir_all(&spool_root)
        .map_err(|error| format!("create terminal spool: {error}"))?;
    let path = spool_root.join("frames.jsonl");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("open terminal spool: {error}"))?;
    writeln!(file, "{envelope}").map_err(|error| format!("write terminal spool: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("sync terminal spool: {error}"))
}

/// Capture a lossless terminal lifecycle frame through the authenticated owner.
/// If the owner is temporarily unavailable, the exact envelope is fsynced to
/// the emergency spool so output is never silently discarded.
fn capture_terminal_frame(
    session_id: &str,
    frame_kind: &str,
    bytes: &[u8],
    metadata: serde_json::Value,
) -> Result<(), String> {
    let sequence = TERMINAL_FRAME_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let envelope = serde_json::json!({
        "schema_version": "lifeos.terminal-frame.v1",
        "lineage": runtime_lineage(session_id),
        "environment_digest": selected_environment_digest(),
        "cwd": std::env::current_dir().ok().map(|path| path.display().to_string()),
        "session_id": session_id,
        "frame_sequence": sequence,
        "frame_kind": frame_kind,
        "byte_length": bytes.len(),
        "payload_base64": BASE64.encode(bytes),
        "sha256": format!("{:x}", Sha256::digest(bytes)),
        "metadata": metadata,
    });
    let rendered = serde_json::to_string(&envelope)
        .map_err(|error| format!("encode terminal frame: {error}"))?;
    let key = format!("terminal/frame/{session_id}/{sequence:020}");
    match OwnerClient::connect(redb_root()).and_then(|mut owner| owner.put(&key, &rendered)) {
        Ok(_) => Ok(()),
        Err(owner_error) => append_terminal_spool(&rendered).map_err(|spool_error| {
            format!("owner capture failed: {owner_error}; spool failed: {spool_error}")
        }),
    }
}

/// Replay every emergency-spooled frame through deterministic owner keys.
/// The spool remains intact as recoverable evidence; deterministic keys make
/// replay idempotent until envctl acknowledges durable materialization.
#[tauri::command]
fn terminal_replay_spool() -> Result<usize, String> {
    let path = redb_root().join("terminal-spool").join("frames.jsonl");
    if !path.is_file() {
        return Ok(0);
    }
    let text =
        std::fs::read_to_string(&path).map_err(|error| format!("read terminal spool: {error}"))?;
    let mut owner = OwnerClient::connect(redb_root()).map_err(|error| error.to_string())?;
    let mut replayed = 0;
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let envelope: serde_json::Value = serde_json::from_str(line)
            .map_err(|error| format!("decode terminal spool frame: {error}"))?;
        let session_id = envelope
            .get("session_id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "terminal spool frame lacks session_id".to_string())?;
        let sequence = envelope
            .get("frame_sequence")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| "terminal spool frame lacks frame_sequence".to_string())?;
        let key = format!("terminal/frame/{session_id}/{sequence:020}");
        owner
            .put(&key, line)
            .map_err(|error| format!("replay terminal frame: {error}"))?;
        replayed += 1;
    }
    Ok(replayed)
}

fn engine_room_session_name() -> Result<String, String> {
    let name = std::env::var("LIFEOS_ENGINE_SESSION_NAME").map_err(|_| {
        "LIFEOS_ENGINE_SESSION_NAME is required for Engine Room reattachment".to_string()
    })?;
    if name.is_empty()
        || name.len() > 128
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err("LIFEOS_ENGINE_SESSION_NAME is not a valid Zellij session name".into());
    }
    Ok(name)
}

fn engine_room_argv(session_name: &str) -> Vec<String> {
    vec![
        "yzx".into(),
        "enter".into(),
        "options".into(),
        "--session-name".into(),
        session_name.into(),
        "--attach-to-session".into(),
        "true".into(),
        "--on-force-close".into(),
        "detach".into(),
    ]
}

#[tauri::command]
fn terminal_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, TerminalState>,
    cols: Option<u16>,
    rows: Option<u16>,
    on_output: Channel<Vec<u8>>,
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
    let session_name = engine_room_session_name()?;
    let argv = engine_room_argv(&session_name);
    let mut command = CommandBuilder::new(&argv[0]);
    command.args(&argv[1..]);
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
    capture_terminal_frame(
        &session_id,
        "start",
        &[],
        serde_json::json!({"cols": size.cols, "rows": size.rows, "argv": argv}),
    )?;
    let output_offset = Arc::new(AtomicU64::new(0));
    let input_offset = Arc::new(AtomicU64::new(0));
    let reader_output_offset = Arc::clone(&output_offset);
    let event_session = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => {
                    let offset = reader_output_offset.fetch_add(length as u64, Ordering::Relaxed);
                    if let Err(error) = capture_terminal_frame(
                        &event_session,
                        "output",
                        &buffer[..length],
                        serde_json::json!({"stream": "pty", "offset": offset}),
                    ) {
                        let _ = app.emit(
                            "lifeos:terminal-capture-error",
                            serde_json::json!({
                                "sessionId": event_session,
                                "error": error,
                            }),
                        );
                        break;
                    }
                    if let Err(error) = on_output.send(buffer[..length].to_vec()) {
                        let _ = app.emit(
                            "lifeos:terminal-capture-error",
                            serde_json::json!({
                                "sessionId": event_session,
                                "error": format!("PTY output channel closed: {error}"),
                            }),
                        );
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        if let Err(error) = capture_terminal_frame(
            &event_session,
            "exit",
            &[],
            serde_json::json!({"reason": "pty-eof"}),
        ) {
            let _ = app.emit(
                "lifeos:terminal-capture-error",
                serde_json::json!({"sessionId": event_session, "error": error}),
            );
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
                output_offset,
                input_offset,
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
    let offset = session
        .input_offset
        .fetch_add(bytes.len() as u64, Ordering::Relaxed);
    capture_terminal_frame(
        &session_id,
        "input",
        &bytes,
        serde_json::json!({"stream": "pty", "offset": offset}),
    )?;
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
    capture_terminal_frame(
        &session_id,
        "resize",
        &[],
        serde_json::json!({"cols": cols, "rows": rows}),
    )?;
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
    if !sessions.contains_key(&session_id) {
        return Err("terminal session is not active".into());
    }
    capture_terminal_frame(&session_id, "close", &[], serde_json::json!({}))?;
    sessions.remove(&session_id);
    Ok(())
}

#[tauri::command]
async fn vault_list(storage: tauri::State<'_, Storage>) -> Result<Vec<VaultEntry>, String> {
    lifeos_core::storage::vault::list(storage.pool())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn execution_log_frame_append(
    storage: tauri::State<'_, Storage>,
    execution_id: String,
    stream_name: String,
    frame_no: i64,
    byte_offset: i64,
    frame: Vec<u8>,
    context: serde_json::Value,
) -> Result<String, String> {
    let execution_id = parse_vault_uuid(&execution_id, "execution_id")?;
    lifeos_core::storage::logs::append_frame(
        storage.pool(),
        execution_id,
        &stream_name,
        frame_no,
        byte_offset,
        &frame,
        context,
    )
    .await
    .map(|id| id.to_string())
    .map_err(|error| error.to_string())
}

/// Register already-encrypted secret bytes in canonical custody. Plaintext is
/// deliberately not accepted by this IPC boundary; mint/relay authorization
/// remains enforced by PostgreSQL's S16 security procedures.
#[tauri::command]
async fn vault_register_ciphertext(
    storage: tauri::State<'_, Storage>,
    secret_key: String,
    target_scope: serde_json::Value,
    purpose_scope: Vec<String>,
    ciphertext: Vec<u8>,
) -> Result<lifeos_core::storage::security::SecretObjectRegistration, String> {
    lifeos_core::storage::security::register_ciphertext(
        storage.pool(),
        &secret_key,
        target_scope,
        &purpose_scope,
        &ciphertext,
    )
    .await
    .map_err(|error| error.to_string())
}

fn parse_vault_uuid(value: &str, field: &str) -> Result<Uuid, String> {
    Uuid::parse_str(value).map_err(|error| format!("{field}: {error}"))
}

#[tauri::command]
async fn vault_mint_secret(
    storage: tauri::State<'_, Storage>,
    secret_object_id: String,
    ciphertext_object_id: String,
    wrapping_key_ref: String,
    algorithm: String,
    nonce: Vec<u8>,
) -> Result<String, String> {
    let secret_object_id = parse_vault_uuid(&secret_object_id, "secret_object_id")?;
    let ciphertext_object_id = parse_vault_uuid(&ciphertext_object_id, "ciphertext_object_id")?;
    lifeos_core::storage::security::mint_secret(
        storage.pool(),
        secret_object_id,
        ciphertext_object_id,
        &wrapping_key_ref,
        &algorithm,
        &nonce,
    )
    .await
    .map(|id| id.to_string())
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn vault_authorize_secret(
    storage: tauri::State<'_, Storage>,
    identity_id: String,
    task_id: String,
    lease_id: String,
    secret_object_id: String,
    purpose: String,
) -> Result<String, String> {
    let identity_id = parse_vault_uuid(&identity_id, "identity_id")?;
    let task_id = parse_vault_uuid(&task_id, "task_id")?;
    let lease_id = parse_vault_uuid(&lease_id, "lease_id")?;
    let secret_object_id = parse_vault_uuid(&secret_object_id, "secret_object_id")?;
    lifeos_core::storage::security::authorize_secret(
        storage.pool(),
        identity_id,
        task_id,
        lease_id,
        secret_object_id,
        &purpose,
    )
    .await
    .map(|id| id.to_string())
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn vault_relay_secret(
    storage: tauri::State<'_, Storage>,
    secret_version_id: String,
    grant_id: String,
    task_lease_id: String,
    target_identity_id: String,
    purpose: String,
    relay_nonce: Vec<u8>,
) -> Result<String, String> {
    let secret_version_id = parse_vault_uuid(&secret_version_id, "secret_version_id")?;
    let grant_id = parse_vault_uuid(&grant_id, "grant_id")?;
    let task_lease_id = parse_vault_uuid(&task_lease_id, "task_lease_id")?;
    let target_identity_id = parse_vault_uuid(&target_identity_id, "target_identity_id")?;
    lifeos_core::storage::security::relay_secret(
        storage.pool(),
        secret_version_id,
        grant_id,
        task_lease_id,
        target_identity_id,
        &purpose,
        &relay_nonce,
    )
    .await
    .map(|id| id.to_string())
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn vault_rotate_secret(
    storage: tauri::State<'_, Storage>,
    secret_object_id: String,
    ciphertext_object_id: String,
    wrapping_key_ref: String,
    algorithm: String,
    nonce: Vec<u8>,
) -> Result<String, String> {
    let secret_object_id = parse_vault_uuid(&secret_object_id, "secret_object_id")?;
    let ciphertext_object_id = parse_vault_uuid(&ciphertext_object_id, "ciphertext_object_id")?;
    lifeos_core::storage::security::rotate_secret(
        storage.pool(),
        secret_object_id,
        ciphertext_object_id,
        &wrapping_key_ref,
        &algorithm,
        &nonce,
    )
    .await
    .map(|id| id.to_string())
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn vault_revoke_secret(
    storage: tauri::State<'_, Storage>,
    secret_object_id: String,
    reason: String,
) -> Result<String, String> {
    let secret_object_id = parse_vault_uuid(&secret_object_id, "secret_object_id")?;
    lifeos_core::storage::security::revoke_secret(storage.pool(), secret_object_id, &reason)
        .await
        .map(|id| id.to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cow_branch_create(
    storage: tauri::State<'_, Storage>,
    parent_branch: String,
    kind: String,
    purpose: String,
    policy: serde_json::Value,
    creator: String,
) -> Result<String, String> {
    let parent_branch = parse_vault_uuid(&parent_branch, "parent_branch")?;
    let creator = parse_vault_uuid(&creator, "creator")?;
    lifeos_core::storage::branches::create(
        storage.pool(),
        parent_branch,
        &kind,
        &purpose,
        policy,
        creator,
    )
    .await
    .map(|id| id.to_string())
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cow_branch_merge(
    storage: tauri::State<'_, Storage>,
    source_branch: String,
    target_branch: String,
    merge_record: serde_json::Value,
) -> Result<String, String> {
    let source_branch = parse_vault_uuid(&source_branch, "source_branch")?;
    let target_branch = parse_vault_uuid(&target_branch, "target_branch")?;
    lifeos_core::storage::branches::merge(
        storage.pool(),
        source_branch,
        target_branch,
        merge_record,
    )
    .await
    .map(|id| id.to_string())
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cow_branch_resolve(
    storage: tauri::State<'_, Storage>,
    conflict_id: String,
    resolution: serde_json::Value,
) -> Result<String, String> {
    let conflict_id = parse_vault_uuid(&conflict_id, "conflict_id")?;
    lifeos_core::storage::branches::resolve(storage.pool(), conflict_id, resolution)
        .await
        .map(|id| id.to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cow_branch_promote(
    storage: tauri::State<'_, Storage>,
    source_branch: String,
    target_branch: String,
    promotion_record: serde_json::Value,
) -> Result<String, String> {
    let source_branch = parse_vault_uuid(&source_branch, "source_branch")?;
    let target_branch = parse_vault_uuid(&target_branch, "target_branch")?;
    lifeos_core::storage::branches::promote(
        storage.pool(),
        source_branch,
        target_branch,
        promotion_record,
    )
    .await
    .map(|id| id.to_string())
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
    let storage = storage.inner().clone();
    storage.migrate().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let owner = OwnerService::start(redb_root()).map_err(|error| {
                Box::new(std::io::Error::other(format!(
                    "start LifeOS redb owner: {error}"
                ))) as Box<dyn std::error::Error>
            })?;
            app.manage(owner);
            if let Some(reconciler) = EnvctlReconciler::start() {
                app.manage(reconciler);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_list,
            open_settings,
            redb_projection_read,
            redb_events_read,
            redb_state_write,
            codedb_ingest_envelope,
            envctl_drain,
            envctl_return_projection,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_close,
            terminal_replay_spool,
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
            vault_register_ciphertext,
            execution_log_frame_append,
            vault_mint_secret,
            vault_authorize_secret,
            vault_relay_secret,
            vault_rotate_secret,
            vault_revoke_secret,
            cow_branch_create,
            cow_branch_merge,
            cow_branch_resolve,
            cow_branch_promote,
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
