//! LifeOS portable core. See `crates/lifeos-core/Cargo.toml` for the stage roadmap.

pub mod auth;
#[cfg(feature = "storage")]
pub mod ingress;
pub mod mcp;
pub mod types;

// Feature-gated Lua/Luau plugin host. Keeping it behind `plugin-host` avoids
// forcing the vendored Luau C compile on no-script consumers and preserves a
// clean no-mlua surface for future no_std/WASM slices.
#[cfg(feature = "plugin-host")]
pub mod plugin;

// Canonical PostgreSQL/RuVector storage. Off for no_std/ESP32 consumers; the
// desktop shell opts in through the `storage` feature.
#[cfg(feature = "storage")]
pub mod storage;

pub const VERSION: &str = "0.1.0";
