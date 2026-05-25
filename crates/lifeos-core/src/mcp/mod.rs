//! MCP client surface for LifeOS.
//!
//! Stage 1d of the TODO: module scaffolds for the two MCP servers the foundation
//! plan calls out as priority integrations — Cognitum-Seed (custody / sensor
//! appliance) and RuVector (vector DB + GNN inference). Wave 3 fills in the
//! read-only client bodies on top of a shared `Transport` trait.
//!
//! The shared `McpError` is intentionally minimal so cognitum.rs and
//! ruvector.rs converge on a single error vocabulary as they grow. The
//! `Transport` abstraction lets us swap real `reqwest::blocking` for an
//! in-memory fake under `#[cfg(test)]` without dragging HTTP into unit specs.
//!
//! Wave-2 → Wave-3 evidence (recorded in `.omc/handoffs/team-exec-wave2.md`):
//! the live Cognitum endpoint is HTTP (`http://169.254.42.1/mcp`), and every
//! one of the 40 live MCP tools mirrors a REST endpoint. So the cross-platform
//! client speaks REST through `reqwest::blocking`; MCP-over-HTTP stays
//! available later for agents-driving-LifeOS scenarios.

use std::fmt;

/// Common error surface for every MCP client in this module. Kept small so
/// callers don't have to learn server-specific error vocabulary up front.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpError {
    /// The MCP server is not reachable — DNS failure, refused connection,
    /// stdio process exited, transport timeout.
    NotConnected(String),
    /// Server returned a JSON-RPC error or an unexpected payload shape.
    Protocol(String),
    /// Caller asked for a tool / resource the server doesn't expose.
    Unsupported(String),
}

impl fmt::Display for McpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotConnected(s) => write!(f, "mcp: not connected: {s}"),
            Self::Protocol(s) => write!(f, "mcp: protocol error: {s}"),
            Self::Unsupported(s) => write!(f, "mcp: unsupported: {s}"),
        }
    }
}

impl std::error::Error for McpError {}

/// Minimal read-only transport for the REST mirror of an MCP server.
///
/// The single `get` method takes a server-relative path (`/api/v1/apps`,
/// `/api/v1/sensor/stream`, …) and returns the raw response body as a
/// `String`, leaving JSON parsing to the typed wrappers in `cognitum.rs` /
/// `ruvector.rs`. Implementations decide how to map their own transport
/// failures onto `McpError` — production wraps `reqwest::blocking::Client`,
/// tests use an in-memory fake keyed by path.
pub trait Transport {
    fn get(&self, path: &str) -> Result<String, McpError>;
}

#[cfg(feature = "mcp-http")]
mod reqwest_transport {
    use super::{McpError, Transport};

    /// `reqwest::blocking` REST transport. Blocking on purpose: both the
    /// daemon and the Tauri shell can call from worker threads without
    /// dragging tokio into `lifeos-core`. Rustls is selected at the Cargo
    /// feature level (`rustls-tls` + `rustls-tls-native-roots`) so no
    /// `openssl-sys` C build leaks in.
    pub struct ReqwestTransport {
        client: reqwest::blocking::Client,
        base_url: String,
    }

    impl ReqwestTransport {
        /// Build a transport that resolves relative paths against `base_url`.
        /// The base URL should NOT end with a trailing slash; the transport
        /// concatenates `base_url + path` verbatim so callers control whether
        /// the path leads with `/`.
        pub fn new(base_url: impl Into<String>) -> Result<Self, McpError> {
            let client = reqwest::blocking::Client::builder()
                // 5s feels right for an on-device REST mirror; the Cognitum
                // appliance is link-local (169.254.42.1). Wave 4+ can wire a
                // configurable budget if a slower remote provider appears.
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .map_err(|e| McpError::NotConnected(e.to_string()))?;
            Ok(Self {
                client,
                base_url: base_url.into(),
            })
        }

        /// Base URL the transport was constructed with. Exposed for diagnostic
        /// logging; production callers shouldn't need to reach past this.
        pub fn base_url(&self) -> &str {
            &self.base_url
        }
    }

    impl Transport for ReqwestTransport {
        fn get(&self, path: &str) -> Result<String, McpError> {
            let url = format!("{}{}", self.base_url, path);
            let resp = self
                .client
                .get(&url)
                .send()
                .map_err(|e| McpError::NotConnected(e.to_string()))?;
            if !resp.status().is_success() {
                return Err(McpError::Protocol(format!(
                    "GET {url} returned {}",
                    resp.status()
                )));
            }
            resp.text().map_err(|e| McpError::Protocol(e.to_string()))
        }
    }
}

#[cfg(feature = "mcp-http")]
pub use reqwest_transport::ReqwestTransport;

/// In-memory `Transport` fake for unit tests. Keyed by path; missing keys
/// surface as `McpError::NotConnected` so a stray request shows up loud in
/// test output instead of returning empty JSON. Lives in the crate root so
/// both `cognitum.rs` and `ruvector.rs` can reuse it from their test modules
/// without inventing parallel fakes.
#[cfg(test)]
pub(crate) mod test_fake {
    use super::{McpError, Transport};
    use std::collections::HashMap;

    /// Map of `path -> response body`. Construct via `new`, then add canned
    /// responses with `with`. Tests assert on the typed-wrapper output, so
    /// the fake stays deliberately dumb.
    pub struct InMemoryTransport {
        responses: HashMap<String, String>,
    }

    impl InMemoryTransport {
        pub fn new() -> Self {
            Self {
                responses: HashMap::new(),
            }
        }

        /// Builder-style: register a canned response and return self.
        pub fn with(mut self, path: impl Into<String>, body: impl Into<String>) -> Self {
            self.responses.insert(path.into(), body.into());
            self
        }
    }

    impl Transport for InMemoryTransport {
        fn get(&self, path: &str) -> Result<String, McpError> {
            self.responses.get(path).cloned().ok_or_else(|| {
                McpError::NotConnected(format!("no canned response registered for {path}"))
            })
        }
    }
}

pub mod cognitum;
pub mod ruvector;

#[cfg(test)]
mod tests {
    use super::test_fake::InMemoryTransport;
    use super::{McpError, Transport};

    #[test]
    fn in_memory_transport_returns_canned_body() {
        let t = InMemoryTransport::new().with("/api/v1/apps", r#"{"apps":[]}"#);
        assert_eq!(t.get("/api/v1/apps").unwrap(), r#"{"apps":[]}"#);
    }

    #[test]
    fn in_memory_transport_unknown_path_is_not_connected() {
        let t = InMemoryTransport::new();
        match t.get("/missing") {
            Err(McpError::NotConnected(msg)) => assert!(msg.contains("/missing")),
            other => panic!("expected NotConnected, got {other:?}"),
        }
    }
}
