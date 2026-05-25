//! RuVector MCP client.
//!
//! Wave 3 mirrors the Cognitum client shape: a generic `RuvectorClient<T>`
//! that speaks REST over an arbitrary `Transport`. RuVector's REST surface is
//! **not visible to LifeOS yet** — we know from the live MCP probe that the
//! tool catalog includes `vector_db_stats` and `gnn_cache_stats`, but the
//! corresponding HTTP paths are unverified. Best-guess paths are flagged in
//! doc comments and TODOs so Wave 4+ can correct them against a reachable
//! endpoint.
//!
//! Write operations stay out of scope until the semantic-retrieval design
//! lands.

use super::McpError;
#[cfg(feature = "mcp-http")]
use super::ReqwestTransport;
use super::Transport;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Vector DB stats — wraps the REST mirror of `vector_db_stats`.
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

/// GNN cache stats — wraps the REST mirror of `gnn_cache_stats`.
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

    /// Vector DB stats. **Path unverified — confirm against live RuVector
    /// before relying on this in production.** Best guess
    /// `/api/vector_db/stats`.
    // TODO(wave-4): replace path once the RuVector REST endpoint is reachable.
    pub fn vector_db_stats(&self) -> Result<VectorDbStats, McpError> {
        let body = self.transport.get("/api/vector_db/stats")?;
        let raw: Value = serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("vector_db_stats: invalid JSON: {e}")))?;
        Ok(VectorDbStats { raw })
    }

    /// GNN cache stats. **Path unverified — confirm against live RuVector
    /// before relying on this in production.** Best guess
    /// `/api/gnn/cache_stats`.
    // TODO(wave-4): replace path once the RuVector REST endpoint is reachable.
    pub fn gnn_cache_stats(&self) -> Result<GnnCacheStats, McpError> {
        let body = self.transport.get("/api/gnn/cache_stats")?;
        let raw: Value = serde_json::from_str(&body)
            .map_err(|e| McpError::Protocol(format!("gnn_cache_stats: invalid JSON: {e}")))?;
        Ok(GnnCacheStats { raw })
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
