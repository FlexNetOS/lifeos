//! Cognitum-Seed MCP client.
//!
//! Current Cognitum SDK documentation identifies the Seed appliance as HTTPS
//! at port `8443`, with REST resources under `/api/v1/...` and MCP available
//! through both HTTP and stdio transports.
//! This client speaks those REST routes through a `Transport` (production:
//! `ReqwestTransport`; tests: in-memory fake) instead of marshalling JSON-RPC
//! over stdio.
//!
//! **Tool-name reconciliation**: the foundation doc named tools
//! `seed_device_status`, `seed_sensor_list`, `seed_thermal_state`,
//! `seed_cognitive_status`, `seed_memory_query`. None of those appear in the
//! live 40-tool list. The closest live equivalents — and the surface this
//! client wraps are:
//! - `seed.cogs.list` → `GET /api/v1/apps` → `cogs_list()`
//! - `seed.sensor.snapshot` → `GET /api/v1/sensor/stream` → `sensor_snapshot()`
//! - `seed.coherence.profile` → `GET /api/v1/coherence/profile` → `coherence_profile()`
//!
//! Response types are deliberately permissive: each wrapper holds a
//! `serde_json::Value` and exposes 1-2 typed accessors plus `raw()` so callers
//! can pull arbitrary fields until Wave 4+ hardens the wire format.

use super::McpError;
#[cfg(feature = "mcp-http")]
use super::ReqwestTransport;
use super::Transport;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Default Cognitum MCP base URL — link-local IP the user's appliance
/// advertises. Includes the `/mcp` suffix because that's the MCP-over-HTTP
/// path; the REST mirror lives at the bare host (no `/mcp`). See
/// `rest_base_from_mcp_url` for how the helper strips the suffix.
pub const DEFAULT_COGNITUM_URL: &str = "https://169.254.42.1:8443/mcp";

/// Translate an MCP-over-HTTP URL into the REST-mirror base URL. The live
/// Cognitum exposes both: `http://169.254.42.1/mcp` for MCP tooling and
/// `http://169.254.42.1` (no `/mcp`) for the REST endpoints this client
/// targets. We accept either form via `LIFEOS_COGNITUM_URL` so the user can
/// paste the URL from the device UI without thinking about the distinction.
///
/// Only the `mcp-http` feature ever calls this — the in-memory tests construct
/// their own transports — so the function (and its test) sit behind the same
/// gate to keep `--no-default-features` warning-free.
#[cfg(feature = "mcp-http")]
fn rest_base_from_mcp_url(url: &str) -> String {
    let trimmed = url.trim_end_matches('/');
    trimmed.strip_suffix("/mcp").unwrap_or(trimmed).to_string()
}

/// Cogs listing response — wraps `GET /api/v1/apps`. Shape verified against
/// the user's live tool catalog only at the field-name level
/// (`seed.cogs.list` mirrors `GET /api/v1/apps`); the JSON layout is
/// **inferred**, so `ids()` is a best-effort extractor that handles both
/// `{"apps":[{"id":"…"}]}` and `[{"id":"…"}]` shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CogsListResponse {
    raw: Value,
}

impl CogsListResponse {
    /// Pull cog identifiers from the response. Walks the two layouts we've
    /// observed in similar appliances; falls back to an empty vec rather than
    /// erroring so callers can render "no cogs" without a panic path.
    pub fn ids(&self) -> Vec<String> {
        let entries = match &self.raw {
            Value::Array(arr) => arr.as_slice(),
            Value::Object(map) => map
                .get("apps")
                .or_else(|| map.get("cogs"))
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            _ => &[],
        };
        entries
            .iter()
            .filter_map(|v| v.get("id").and_then(Value::as_str).map(str::to_string))
            .collect()
    }

    /// Raw response body — escape hatch for fields the typed accessors don't
    /// expose yet. Returned by reference so callers don't pay for a clone
    /// they don't need.
    pub fn raw(&self) -> &Value {
        &self.raw
    }
}

/// Sensor snapshot — decodes the latest JSON event from the SSE
/// `GET /api/v1/sensor/stream` resource. The on-wire channel layout remains
/// open-ended, so callers can inspect the complete event through `raw()`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorSnapshot {
    raw: Value,
}

impl SensorSnapshot {
    /// Timestamp of the most recent sensor frame, if present. Accepts either
    /// a string (ISO-8601 from a Pi-class SBC) or an integer (epoch millis).
    pub fn timestamp(&self) -> Option<String> {
        let v = self
            .raw
            .get("timestamp")
            .or_else(|| self.raw.get("ts"))
            .or_else(|| self.raw.get("time"))?;
        match v {
            Value::String(s) => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            _ => None,
        }
    }

    pub fn raw(&self) -> &Value {
        &self.raw
    }
}

fn parse_sensor_event(body: &str) -> Result<Value, McpError> {
    let trimmed = body.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return serde_json::from_str(trimmed)
            .map_err(|e| McpError::Protocol(format!("sensor_snapshot: invalid JSON: {e}")));
    }
    let data = trimmed
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .last()
        .ok_or_else(|| {
            McpError::Protocol("sensor_snapshot: SSE stream had no data event".into())
        })?;
    serde_json::from_str(data)
        .map_err(|e| McpError::Protocol(format!("sensor_snapshot: invalid SSE JSON: {e}")))
}

/// Coherence profile — wraps the REST mirror of `seed.coherence.profile`.
///
/// The `/api/v1/coherence/profile` response. The typed accessor pulls a
/// `score` field when present and the rest stays in `raw()`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoherenceProfile {
    raw: Value,
}

impl CoherenceProfile {
    /// Best-effort coherence score extractor. Returns `None` when the field
    /// is missing or non-numeric; do NOT treat a `None` as "device offline".
    pub fn score(&self) -> Option<f64> {
        self.raw
            .get("score")
            .or_else(|| self.raw.get("coherence"))
            .and_then(Value::as_f64)
    }

    pub fn raw(&self) -> &Value {
        &self.raw
    }
}

/// Read-only Cognitum-Seed client over an arbitrary `Transport`. Construction
/// performs the device status handshake, so a returned client represents a
/// reachable Seed rather than an unprobed URL.
pub struct CognitumClient<T: Transport> {
    transport: T,
    status: Value,
}

impl<T: Transport> CognitumClient<T> {
    /// Probe the device status endpoint before returning a usable client.
    pub fn connect(transport: T) -> Result<Self, McpError> {
        let body = transport.get("/api/v1/status")?;
        let status: Value = serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("status: invalid JSON: {e}")))?;
        Ok(Self { transport, status })
    }

    /// Handshake response from `GET /api/v1/status`.
    pub fn status(&self) -> &Value {
        &self.status
    }

    /// `GET /api/v1/apps` — installed cogs with running state. Mirrors the
    /// `seed.cogs.list` MCP tool.
    pub fn cogs_list(&self) -> Result<CogsListResponse, McpError> {
        let body = self.transport.get("/api/v1/apps")?;
        let raw: Value = serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("cogs_list: invalid JSON: {e}")))?;
        Ok(CogsListResponse { raw })
    }

    /// `GET /api/v1/sensor/stream` — most recent sensor frame. Mirrors the
    /// `seed.sensor.snapshot` MCP tool.
    pub fn sensor_snapshot(&self) -> Result<SensorSnapshot, McpError> {
        let body = self.transport.get("/api/v1/sensor/stream")?;
        let raw = parse_sensor_event(&body)?;
        Ok(SensorSnapshot { raw })
    }

    /// Coherence profile from `/api/v1/coherence/profile`.
    pub fn coherence_profile(&self) -> Result<CoherenceProfile, McpError> {
        let body = self.transport.get("/api/v1/coherence/profile")?;
        let raw: Value = serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("coherence_profile: invalid JSON: {e}")))?;
        Ok(CoherenceProfile { raw })
    }
}

#[cfg(feature = "mcp-http")]
impl CognitumClient<ReqwestTransport> {
    /// Build a client from `LIFEOS_COGNITUM_URL` (or `DEFAULT_COGNITUM_URL`
    /// when the env var is missing). Strips the `/mcp` suffix so the
    /// transport targets the REST mirror; see `rest_base_from_mcp_url`.
    pub fn from_env() -> Result<Self, McpError> {
        let raw = std::env::var("LIFEOS_COGNITUM_URL")
            .unwrap_or_else(|_| DEFAULT_COGNITUM_URL.to_string());
        let base = rest_base_from_mcp_url(&raw);
        let transport = ReqwestTransport::new(base)?;
        Self::connect(transport)
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_fake::InMemoryTransport;
    use super::*;

    #[test]
    fn connect_returns_a_client() {
        let t = InMemoryTransport::new().with("/api/v1/status", r#"{"ok":true}"#);
        let client = CognitumClient::connect(t).unwrap();
        assert_eq!(
            client.status().get("ok").and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn cogs_list_parses_object_shape() {
        let t = InMemoryTransport::new()
            .with("/api/v1/status", r#"{"ok":true}"#)
            .with(
                "/api/v1/apps",
                r#"{"apps":[{"id":"cog-a","running":true},{"id":"cog-b","running":false}]}"#,
            );
        let client = CognitumClient::connect(t).unwrap();
        let resp = client.cogs_list().unwrap();
        assert_eq!(resp.ids(), vec!["cog-a", "cog-b"]);
        // raw() escape hatch still exposes everything.
        assert!(resp.raw().get("apps").is_some());
    }

    #[test]
    fn cogs_list_parses_array_shape() {
        let t = InMemoryTransport::new()
            .with("/api/v1/status", r#"{"ok":true}"#)
            .with("/api/v1/apps", r#"[{"id":"x"},{"id":"y"},{"id":"z"}]"#);
        let client = CognitumClient::connect(t).unwrap();
        assert_eq!(client.cogs_list().unwrap().ids(), vec!["x", "y", "z"]);
    }

    #[test]
    fn sensor_snapshot_extracts_timestamp_string() {
        let t = InMemoryTransport::new()
            .with("/api/v1/status", r#"{"ok":true}"#)
            .with(
                "/api/v1/sensor/stream",
                r#"{"timestamp":"2026-05-25T12:00:00Z","temp":21.4}"#,
            );
        let client = CognitumClient::connect(t).unwrap();
        let snap = client.sensor_snapshot().unwrap();
        assert_eq!(snap.timestamp().as_deref(), Some("2026-05-25T12:00:00Z"));
    }

    #[test]
    fn sensor_snapshot_extracts_latest_sse_event() {
        let t = InMemoryTransport::new()
            .with("/api/v1/status", r#"{"ok":true}"#)
            .with(
                "/api/v1/sensor/stream",
                "event: sensor\ndata: {\"ts\":1748131200000}\n\nevent: sensor\ndata: {\"timestamp\":\"2026-05-25T12:00:00Z\"}\n",
            );
        let client = CognitumClient::connect(t).unwrap();
        assert_eq!(
            client.sensor_snapshot().unwrap().timestamp().as_deref(),
            Some("2026-05-25T12:00:00Z")
        );
    }

    #[test]
    fn sensor_snapshot_extracts_timestamp_epoch() {
        let t = InMemoryTransport::new()
            .with("/api/v1/status", r#"{"ok":true}"#)
            .with("/api/v1/sensor/stream", r#"{"ts":1748131200000}"#);
        let client = CognitumClient::connect(t).unwrap();
        assert_eq!(
            client.sensor_snapshot().unwrap().timestamp().as_deref(),
            Some("1748131200000")
        );
    }

    #[test]
    fn coherence_profile_parses_score() {
        let t = InMemoryTransport::new()
            .with("/api/v1/status", r#"{"ok":true}"#)
            .with("/api/v1/coherence/profile", r#"{"score":0.87,"notes":""}"#);
        let client = CognitumClient::connect(t).unwrap();
        assert_eq!(client.coherence_profile().unwrap().score(), Some(0.87));
    }

    #[test]
    fn invalid_json_surfaces_as_protocol_error() {
        let t = InMemoryTransport::new()
            .with("/api/v1/status", r#"{"ok":true}"#)
            .with("/api/v1/apps", "not json");
        let client = CognitumClient::connect(t).unwrap();
        match client.cogs_list() {
            Err(McpError::Protocol(msg)) => assert!(msg.contains("cogs_list")),
            other => panic!("expected Protocol error, got {other:?}"),
        }
    }

    #[cfg(feature = "mcp-http")]
    #[test]
    fn rest_base_strip_works() {
        assert_eq!(
            rest_base_from_mcp_url("http://169.254.42.1/mcp"),
            "http://169.254.42.1"
        );
        assert_eq!(
            rest_base_from_mcp_url("http://169.254.42.1/mcp/"),
            "http://169.254.42.1"
        );
        assert_eq!(
            rest_base_from_mcp_url("http://169.254.42.1"),
            "http://169.254.42.1"
        );
        assert_eq!(
            rest_base_from_mcp_url("http://example.com:8080/mcp"),
            "http://example.com:8080"
        );
    }

    /// Live smoke test — skipped by default (`#[ignore]`) and silently
    /// returns when `LIFEOS_COGNITUM_URL` is unset so it stays out of CI.
    /// Run with `LIFEOS_COGNITUM_URL=http://169.254.42.1/mcp cargo test
    /// -p lifeos-core -- --ignored cognitum_from_env_smoke`.
    #[test]
    #[ignore]
    #[cfg(feature = "mcp-http")]
    fn cognitum_from_env_smoke() {
        if std::env::var("LIFEOS_COGNITUM_URL").is_err() {
            return;
        }
        let client = CognitumClient::from_env().expect("from_env must build a client");
        match client.cogs_list() {
            Ok(resp) => {
                println!("cognitum cogs_list: {} ids", resp.ids().len());
                for id in resp.ids() {
                    println!("  - {id}");
                }
            }
            Err(e) => println!("cognitum cogs_list failed (live device may be offline): {e}"),
        }
        match client.sensor_snapshot() {
            Ok(snap) => println!(
                "cognitum sensor timestamp: {:?}",
                snap.timestamp().as_deref()
            ),
            Err(e) => println!("cognitum sensor_snapshot failed: {e}"),
        }
    }
}
