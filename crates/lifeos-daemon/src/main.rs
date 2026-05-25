//! lifeos-daemon — headless LifeOS node.
//!
//! Wave-3 scaffold: prints a banner with the crate + core versions and exits.
//! The sensor → MQTT bridge is sketched in the `TODO` below; no MQTT client
//! is wired yet so the cross-compile to `aarch64-unknown-linux-gnu` stays
//! minimal and pure-Rust.

// Imports kept under `#[allow(unused_imports)]` so the type signatures are
// visible from `cargo doc` and IDEs while the bridge body is still a TODO.
// They'll move into the real read loop in Wave 4+.
#[allow(unused_imports)]
use lifeos_core::mcp::cognitum::CognitumClient;
#[allow(unused_imports)]
use lifeos_core::types;

fn main() {
    println!(
        "lifeos-daemon v{} (lifeos-core v{})",
        env!("CARGO_PKG_VERSION"),
        lifeos_core::VERSION
    );
    // TODO(wave-4+): sensor → MQTT bridge.
    //   - Read sensor frames via lifeos_core::mcp::cognitum::CognitumClient::sensor_snapshot()
    //     (requires re-enabling the `mcp-http` feature on the lifeos-core dep).
    //   - Publish to MQTT (recommend rumqttc with rustls feature when wired —
    //     pure-Rust, no openssl-sys).
    //   - Configurable poll interval, retry/backoff, graceful shutdown on
    //     SIGTERM/SIGINT (tokio + tokio::signal once async lands).
}
