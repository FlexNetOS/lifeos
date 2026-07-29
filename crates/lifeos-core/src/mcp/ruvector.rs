//! RuVector MCP client.
//!
//! The source-aligned production path is `RuvectorMcpClient`, which launches
//! the RuVector MCP server over stdio and calls its JSON-RPC tools. The
//! generic `RuvectorClient<T>` REST shape remains only as an explicit legacy
//! compatibility surface for callers that already provide a transport.
//!
//! Write operations stay out of scope until the semantic-retrieval design
//! lands.

use super::McpError;
#[cfg(feature = "mcp-http")]
use super::ReqwestTransport;
use super::Transport;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

fn collection_path(collection: &str) -> Result<String, McpError> {
    if collection.is_empty()
        || !collection
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(McpError::Unsupported(
            "collection names must be a single URL-safe path segment".into(),
        ));
    }
    Ok(format!("/collections/{collection}"))
}

/// Vector DB stats returned by either the source-aligned MCP client or the
/// legacy REST compatibility client.
///
/// Path unverified — confirm against live RuVector once endpoint is reachable.
/// Best guess `/api/vector_db/stats`. Typed accessor pulls a single `count`
/// (also best-guess), with `raw()` available for everything else.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorDbStats {
    raw: Value,
}

impl VectorDbStats {
    /// Best-effort vector count extractor. Looks at the most plausible field
    /// names; returns `None` rather than erroring so a missing field renders
    /// as "unknown" instead of a hard failure.
    pub fn count(&self) -> Option<u64> {
        self.raw
            .get("count")
            .or_else(|| self.raw.get("vectors"))
            .or_else(|| self.raw.get("total"))
            .and_then(Value::as_u64)
    }

    pub fn raw(&self) -> &Value {
        &self.raw
    }
}

/// GNN cache stats returned by either the source-aligned MCP client or the
/// legacy REST compatibility client.
///
/// Path unverified — confirm against live RuVector once endpoint is reachable.
/// Best guess `/api/gnn/cache_stats`. Typed accessor pulls a single
/// `hit_rate` (also best-guess) and `raw()` carries the rest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GnnCacheStats {
    raw: Value,
}

impl GnnCacheStats {
    /// Cache hit-rate, 0.0–1.0. Best-effort; returns `None` for absent or
    /// non-numeric fields.
    pub fn hit_rate(&self) -> Option<f64> {
        self.raw
            .get("hit_rate")
            .or_else(|| self.raw.get("hitRate"))
            .and_then(Value::as_f64)
    }

    pub fn raw(&self) -> &Value {
        &self.raw
    }
}

/// Read-only RuVector client over an arbitrary `Transport`. Mirrors the
/// `CognitumClient<T>` shape so the daemon and Tauri shell can use the same
/// pattern for both servers.
pub struct RuvectorClient<T: Transport> {
    transport: T,
}

impl<T: Transport> RuvectorClient<T> {
    /// Wrap an existing `Transport`. No handshake — Wave 3 reads only.
    pub fn connect(transport: T) -> Result<Self, McpError> {
        Ok(Self { transport })
    }

    /// Upsert points through RuVector's server collection route.
    /// `points` must contain the server's `{"points":[...]}` payload.
    pub fn upsert_points(&self, collection: &str, points: Value) -> Result<Value, McpError> {
        let path = format!("{}/points", collection_path(collection)?);
        let body = self.transport.put(&path, &points)?;
        serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("upsert_points: invalid JSON: {e}")))
    }

    /// Search points through RuVector's server collection route.
    /// The request accepts the server's `vector`, `k`, and optional filter fields.
    pub fn search_points(&self, collection: &str, request: Value) -> Result<Value, McpError> {
        let path = format!("{}/points/search", collection_path(collection)?);
        let body = self.transport.post(&path, &request)?;
        serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("search_points: invalid JSON: {e}")))
    }

    /// Fetch one point by its collection-local id.
    pub fn get_point(&self, collection: &str, id: &str) -> Result<Value, McpError> {
        if id.is_empty() || id.contains('/') {
            return Err(McpError::Unsupported(
                "point ids must not be empty or contain '/'".into(),
            ));
        }
        let path = format!("{}/points/{id}", collection_path(collection)?);
        let body = self.transport.get(&path)?;
        serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("get_point: invalid JSON: {e}")))
    }

    /// Legacy REST compatibility accessor. The production protocol is
    /// `RuvectorMcpClient::vector_db_stats`; this method is not source-aligned.
    pub fn vector_db_stats(&self) -> Result<VectorDbStats, McpError> {
        let body = self.transport.get("/api/vector_db/stats")?;
        let raw: Value = serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("vector_db_stats: invalid JSON: {e}")))?;
        Ok(VectorDbStats { raw })
    }

    /// Legacy REST compatibility accessor. The production protocol is
    /// `RuvectorMcpClient::gnn_cache_stats`; this method is not source-aligned.
    pub fn gnn_cache_stats(&self) -> Result<GnnCacheStats, McpError> {
        let body = self.transport.get("/api/gnn/cache_stats")?;
        let raw: Value = serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("gnn_cache_stats: invalid JSON: {e}")))?;
        Ok(GnnCacheStats { raw })
    }
}

/// A source-aligned RuVector MCP stdio client.
///
/// The RuVector server registers its vector/GNN operations as JSON-RPC
/// tools/call methods over stdio. This client keeps one supervised child
/// alive, serializes request/response pairs, and never treats an unverified
/// REST mirror as the production protocol.
pub struct RuvectorMcpClient {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
    io_lock: Mutex<()>,
    next_id: AtomicU64,
}

impl RuvectorMcpClient {
    /// Spawn the configured MCP server and complete the protocol handshake.
    pub fn spawn(binary: &str, args: &[String]) -> Result<Self, McpError> {
        if binary.trim().is_empty() {
            return Err(McpError::NotConnected(
                "RuVector MCP binary must not be empty".into(),
            ));
        }
        let mut command = Command::new(binary);
        command
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if let Ok(cwd) = std::env::var("LIFEOS_RUVECTOR_MCP_CWD") {
            if !cwd.trim().is_empty() {
                command.current_dir(cwd);
            }
        }
        let mut child = command
            .spawn()
            .map_err(|error| McpError::NotConnected(format!("spawn RuVector MCP: {error}")))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| McpError::NotConnected("RuVector MCP stdin unavailable".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| McpError::NotConnected("RuVector MCP stdout unavailable".into()))?;
        let client = Self {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            io_lock: Mutex::new(()),
            next_id: AtomicU64::new(1),
        };
        client.request(
            "initialize",
            serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "lifeos", "version": env!("CARGO_PKG_VERSION")}
            }),
        )?;
        client.notify("notifications/initialized", serde_json::json!({}))?;
        Ok(client)
    }

    /// Spawn from LIFEOS_RUVECTOR_MCP_BIN and optional JSON-array
    /// LIFEOS_RUVECTOR_MCP_ARGS.
    pub fn from_env() -> Result<Self, McpError> {
        let binary = std::env::var("LIFEOS_RUVECTOR_MCP_BIN").map_err(|_| {
            McpError::NotConnected("set LIFEOS_RUVECTOR_MCP_BIN to the pinned server".into())
        })?;
        let args = std::env::var("LIFEOS_RUVECTOR_MCP_ARGS")
            .ok()
            .map(|raw| {
                serde_json::from_str::<Vec<String>>(&raw).map_err(|error| {
                    McpError::Protocol(format!(
                        "LIFEOS_RUVECTOR_MCP_ARGS must be JSON array: {error}"
                    ))
                })
            })
            .transpose()?
            .unwrap_or_default();
        Self::spawn(&binary, &args)
    }

    fn request(&self, method: &str, params: Value) -> Result<Value, McpError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let _io_guard = self
            .io_lock
            .lock()
            .map_err(|_| McpError::Protocol("RuVector MCP I/O lock poisoned".into()))?;
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        {
            let mut stdin = self
                .stdin
                .lock()
                .map_err(|_| McpError::Protocol("RuVector MCP stdin lock poisoned".into()))?;
            writeln!(stdin, "{request}")
                .and_then(|_| stdin.flush())
                .map_err(|error| {
                    McpError::NotConnected(format!("write RuVector MCP request: {error}"))
                })?;
        }
        let mut line = String::new();
        let mut stdout = self
            .stdout
            .lock()
            .map_err(|_| McpError::Protocol("RuVector MCP stdout lock poisoned".into()))?;
        let response = loop {
            line.clear();
            let read = stdout.read_line(&mut line).map_err(|error| {
                McpError::NotConnected(format!("read RuVector MCP response: {error}"))
            })?;
            if read == 0 || line.trim().is_empty() {
                return Err(McpError::NotConnected(
                    "RuVector MCP closed stdout without a response".into(),
                ));
            }
            let response: Value = serde_json::from_str(&line).map_err(|error| {
                McpError::Protocol(format!("RuVector MCP invalid JSON-RPC: {error}"))
            })?;
            // Notifications have no id and may be interleaved with a response
            // while the server is working. They are not the result of this
            // request and must not desynchronise the single outstanding call.
            if response.get("id").and_then(Value::as_u64).is_none() {
                continue;
            }
            break response;
        };
        if response.get("id").and_then(Value::as_u64) != Some(id) {
            return Err(McpError::Protocol(
                "RuVector MCP response id did not match request".into(),
            ));
        }
        if let Some(error) = response.get("error") {
            return Err(McpError::Protocol(format!(
                "RuVector MCP tool error: {error}"
            )));
        }
        response
            .get("result")
            .cloned()
            .ok_or_else(|| McpError::Protocol("RuVector MCP response lacks result".into()))
    }

    fn notify(&self, method: &str, params: Value) -> Result<(), McpError> {
        let _io_guard = self
            .io_lock
            .lock()
            .map_err(|_| McpError::Protocol("RuVector MCP I/O lock poisoned".into()))?;
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| McpError::Protocol("RuVector MCP stdin lock poisoned".into()))?;
        writeln!(stdin, "{request}")
            .and_then(|_| stdin.flush())
            .map_err(|error| {
                McpError::NotConnected(format!("write RuVector MCP notification: {error}"))
            })
    }

    /// Call an exact RuVector MCP tool and decode its text content as JSON.
    pub fn call_tool(&self, name: &str, arguments: Value) -> Result<Value, McpError> {
        if name.trim().is_empty() || !arguments.is_object() {
            return Err(McpError::Unsupported(
                "RuVector MCP tool calls require a name and object arguments".into(),
            ));
        }
        let result = self.request(
            "tools/call",
            serde_json::json!({"name": name, "arguments": arguments}),
        )?;
        if result
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Err(McpError::Protocol(format!(
                "RuVector MCP tool reported an error: {result}"
            )));
        }
        let text = result
            .get("content")
            .and_then(Value::as_array)
            .and_then(|content| {
                content
                    .iter()
                    .find_map(|item| item.get("text").and_then(Value::as_str))
            })
            .ok_or_else(|| McpError::Protocol("RuVector tool result lacks text content".into()))?;
        serde_json::from_str(text).map_err(|error| {
            McpError::Protocol(format!("RuVector tool result is not JSON: {error}"))
        })
    }

    pub fn vector_db_stats(&self, db_path: &str) -> Result<Value, McpError> {
        if db_path.trim().is_empty() {
            return Err(McpError::Unsupported("db_path must not be empty".into()));
        }
        self.call_tool("vector_db_stats", serde_json::json!({"db_path": db_path}))
    }

    pub fn gnn_cache_stats(&self, include_details: bool) -> Result<Value, McpError> {
        self.call_tool(
            "gnn_cache_stats",
            serde_json::json!({"include_details": include_details}),
        )
    }
}

impl Drop for RuvectorMcpClient {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(feature = "mcp-http")]
impl RuvectorClient<ReqwestTransport> {
    /// Build a client from `LIFEOS_RUVECTOR_URL`. There is no sensible default
    /// — the foundation doc records the MCP tool surface but the HTTP host is
    /// site-specific — so a missing or empty env var surfaces as a
    /// `NotConnected` error.
    pub fn from_env() -> Result<Self, McpError> {
        let raw = std::env::var("LIFEOS_RUVECTOR_URL").unwrap_or_default();
        if raw.trim().is_empty() {
            return Err(McpError::NotConnected(
                "set LIFEOS_RUVECTOR_URL to a real endpoint".to_string(),
            ));
        }
        let base = raw.trim_end_matches('/').to_string();
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
        let t = InMemoryTransport::new();
        assert!(RuvectorClient::connect(t).is_ok());
    }

    #[test]
    fn vector_db_stats_extracts_count() {
        let t =
            InMemoryTransport::new().with("/api/vector_db/stats", r#"{"count":12345,"dim":768}"#);
        let client = RuvectorClient::connect(t).unwrap();
        let stats = client.vector_db_stats().unwrap();
        assert_eq!(stats.count(), Some(12345));
        // raw() escape hatch carries everything we didn't type.
        assert_eq!(stats.raw().get("dim").and_then(Value::as_u64), Some(768));
    }

    #[test]
    fn vector_db_stats_missing_count_returns_none() {
        let t = InMemoryTransport::new().with("/api/vector_db/stats", r#"{"dim":768}"#);
        let client = RuvectorClient::connect(t).unwrap();
        assert_eq!(client.vector_db_stats().unwrap().count(), None);
    }

    #[test]
    fn gnn_cache_stats_extracts_hit_rate() {
        let t = InMemoryTransport::new()
            .with("/api/gnn/cache_stats", r#"{"hit_rate":0.42,"size":256}"#);
        let client = RuvectorClient::connect(t).unwrap();
        let stats = client.gnn_cache_stats().unwrap();
        assert_eq!(stats.hit_rate(), Some(0.42));
    }

    #[test]
    fn gnn_cache_stats_camel_case_alias() {
        let t = InMemoryTransport::new().with("/api/gnn/cache_stats", r#"{"hitRate":0.99}"#);
        let client = RuvectorClient::connect(t).unwrap();
        assert_eq!(client.gnn_cache_stats().unwrap().hit_rate(), Some(0.99));
    }

    #[test]
    fn invalid_json_surfaces_as_protocol_error() {
        let t = InMemoryTransport::new().with("/api/vector_db/stats", "<html>nope</html>");
        let client = RuvectorClient::connect(t).unwrap();
        match client.vector_db_stats() {
            Err(McpError::Protocol(msg)) => assert!(msg.contains("vector_db_stats")),
            other => panic!("expected Protocol error, got {other:?}"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn stdio_client_runs_initialize_and_tool_calls_against_a_supervised_child() {
        let server = r#"
IFS= read -r line || exit 1
printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05"}}'
IFS= read -r line || exit 1
IFS= read -r line || exit 1
printf '%s\n' '{"jsonrpc":"2.0","id":null,"error":{"code":-32601,"message":"Method not found"}}'
printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}'
printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"image","data":"ignored"},{"type":"text","text":"{\"count\":42}"}]}}'
IFS= read -r line || exit 1
printf '%s\n' '{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"hit_rate\":0.75}"}]}}'
"#;
        let client =
            RuvectorMcpClient::spawn("sh", &["-c".to_string(), server.to_string()]).unwrap();
        assert_eq!(
            client.vector_db_stats("/var/lib/lifeos/vectors").unwrap()["count"],
            42
        );
        assert_eq!(client.gnn_cache_stats(true).unwrap()["hit_rate"], 0.75);
    }

    #[test]
    #[cfg(feature = "mcp-http")]
    fn from_env_blank_url_is_not_connected() {
        // SAFETY: tests run single-threaded per binary; we restore the env
        // var on every exit path.
        let prev = std::env::var("LIFEOS_RUVECTOR_URL").ok();
        // SAFETY: single-threaded test access to the process env.
        unsafe {
            std::env::set_var("LIFEOS_RUVECTOR_URL", "");
        }
        let result = RuvectorClient::from_env();
        // Restore before asserting so a failing assert doesn't leak state.
        match prev {
            Some(v) => unsafe { std::env::set_var("LIFEOS_RUVECTOR_URL", v) },
            None => unsafe { std::env::remove_var("LIFEOS_RUVECTOR_URL") },
        }
        match result {
            Err(McpError::NotConnected(msg)) => assert!(msg.contains("LIFEOS_RUVECTOR_URL")),
            Err(other) => panic!("expected NotConnected, got {other:?}"),
            Ok(_) => panic!("expected NotConnected error, got Ok"),
        }
    }
}
