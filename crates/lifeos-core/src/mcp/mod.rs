//! MCP client surface for LifeOS.
//!
//! Read-only clients for the two MCP-backed servers the foundation plan calls
//! out as priority integrations — Cognitum-Seed (custody / sensor appliance)
//! and RuVector (vector DB + GNN inference). Both use the shared `Transport`
//! trait so production HTTP and deterministic tests share the same contracts.
//!
//! The shared `McpError` is intentionally minimal so cognitum.rs and
//! ruvector.rs converge on a single error vocabulary as they grow. The
//! `Transport` abstraction lets us swap real `reqwest::blocking` for an
//! in-memory fake under `#[cfg(test)]` without dragging HTTP into unit specs.
//!
//! Source-grounded endpoint evidence:
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

    /// Raw GET response bytes for byte-complete ingress callers. The default
    /// preserves compatibility for string-backed test transports; production
    /// transports override it before any text decoding occurs.
    fn get_bytes(&self, path: &str) -> Result<Vec<u8>, McpError> {
        self.get(path).map(String::into_bytes)
    }

    fn post(&self, path: &str, body: &serde_json::Value) -> Result<String, McpError>;
    fn put(&self, path: &str, body: &serde_json::Value) -> Result<String, McpError>;
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
        bearer_token: Option<String>,
    }

    impl ReqwestTransport {
        /// Build a transport that resolves relative paths against `base_url`.
        /// The base URL should NOT end with a trailing slash; the transport
        /// concatenates `base_url + path` verbatim so callers control whether
        /// the path leads with `/`.
        pub fn new(base_url: impl Into<String>) -> Result<Self, McpError> {
            Self::with_bearer(base_url, None)
        }

        /// Build an authenticated transport for a paired Seed appliance.
        /// The bearer is supplied by the envctl/secret projection boundary;
        /// it is never included in diagnostics or receipts.
        pub fn with_bearer(
            base_url: impl Into<String>,
            bearer_token: Option<String>,
        ) -> Result<Self, McpError> {
            Self::with_bearer_and_tls(base_url, bearer_token, false)
        }

        /// Build a transport with an explicit self-signed TLS policy.
        /// `allow_invalid_certs` is never enabled implicitly; production
        /// deployments should provide the device CA through their trust
        /// configuration instead.
        pub fn with_bearer_and_tls(
            base_url: impl Into<String>,
            bearer_token: Option<String>,
            allow_invalid_certs: bool,
        ) -> Result<Self, McpError> {
            let client = reqwest::blocking::Client::builder()
                // 5s feels right for an on-device REST mirror; the Cognitum
                // appliance is link-local (169.254.42.1). Wave 4+ can wire a
                // configurable budget if a slower remote provider appears.
                .timeout(std::time::Duration::from_secs(5))
                .danger_accept_invalid_certs(allow_invalid_certs)
                .build()
                .map_err(|e| McpError::NotConnected(e.to_string()))?;
            Ok(Self {
                client,
                base_url: base_url.into(),
                bearer_token: bearer_token.filter(|token| !token.trim().is_empty()),
            })
        }

        /// Base URL the transport was constructed with. Exposed for diagnostic
        /// logging; production callers shouldn't need to reach past this.
        pub fn base_url(&self) -> &str {
            &self.base_url
        }

        fn request(
            &self,
            request: reqwest::blocking::RequestBuilder,
        ) -> reqwest::blocking::RequestBuilder {
            match self.bearer_token.as_deref() {
                Some(token) => request.bearer_auth(token),
                None => request,
            }
        }
    }

    impl Transport for ReqwestTransport {
        fn get(&self, path: &str) -> Result<String, McpError> {
            let url = format!("{}{}", self.base_url, path);
            let resp = self
                .request(self.client.get(&url))
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

        fn get_bytes(&self, path: &str) -> Result<Vec<u8>, McpError> {
            let url = format!("{}{}", self.base_url, path);
            let resp = self
                .request(self.client.get(&url))
                .send()
                .map_err(|e| McpError::NotConnected(e.to_string()))?;
            if !resp.status().is_success() {
                return Err(McpError::Protocol(format!(
                    "GET {url} returned {}",
                    resp.status()
                )));
            }
            resp.bytes()
                .map(|bytes| bytes.to_vec())
                .map_err(|e| McpError::Protocol(e.to_string()))
        }

        fn post(&self, path: &str, body: &serde_json::Value) -> Result<String, McpError> {
            let url = format!("{}{}", self.base_url, path);
            let resp = self
                .request(self.client.post(&url).json(body))
                .send()
                .map_err(|e| McpError::NotConnected(e.to_string()))?;
            if !resp.status().is_success() {
                return Err(McpError::Protocol(format!(
                    "POST {url} returned {}",
                    resp.status()
                )));
            }
            resp.text().map_err(|e| McpError::Protocol(e.to_string()))
        }

        fn put(&self, path: &str, body: &serde_json::Value) -> Result<String, McpError> {
            let url = format!("{}{}", self.base_url, path);
            let resp = self
                .request(self.client.put(&url).json(body))
                .send()
                .map_err(|e| McpError::NotConnected(e.to_string()))?;
            if !resp.status().is_success() {
                return Err(McpError::Protocol(format!(
                    "PUT {url} returned {}",
                    resp.status()
                )));
            }
            resp.text().map_err(|e| McpError::Protocol(e.to_string()))
        }
    }
}

#[cfg(feature = "mcp-http")]
pub use reqwest_transport::ReqwestTransport;

#[cfg(all(test, feature = "mcp-http"))]
mod reqwest_transport_tests {
    use super::ReqwestTransport;
    use super::Transport;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn bearer_token_is_sent_without_being_part_of_the_url() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                let count = stream.read(&mut chunk).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..count]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8(request).unwrap();
            assert!(request.contains("GET /status HTTP/1.1"));
            assert!(request.contains("authorization: Bearer test-token"));
            assert!(!request.contains("test-token/status"));
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")
                .unwrap();
        });

        let transport = ReqwestTransport::with_bearer(
            format!("http://{address}"),
            Some("test-token".to_string()),
        )
        .unwrap();
        assert_eq!(transport.get("/status").unwrap(), "{}");
        server.join().unwrap();
    }
}

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

        fn post(&self, path: &str, _body: &serde_json::Value) -> Result<String, McpError> {
            self.get(path)
        }

        fn put(&self, path: &str, _body: &serde_json::Value) -> Result<String, McpError> {
            self.get(path)
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

    #[test]
    fn in_memory_transport_supports_write_verbs() {
        let t = InMemoryTransport::new().with("/write", r#"{"ok":true}"#);
        let body = serde_json::json!({"points": []});
        assert_eq!(t.put("/write", &body).unwrap(), r#"{"ok":true}"#);
        assert_eq!(t.post("/write", &body).unwrap(), r#"{"ok":true}"#);
    }
}
