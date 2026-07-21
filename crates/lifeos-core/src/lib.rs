//! LifeOS portable core. See `crates/lifeos-core/Cargo.toml` for the stage roadmap.

pub mod auth;
pub mod mcp;
pub mod types;

// Wave 3 (TODO 1d / C4): feature-gated Lua/Luau plugin host. Behind
// `plugin-host` so the default workspace build stays free of mlua's vendored
// Luau C compile (~30–90s on a cold target/) and the no-mlua surface area is
// preserved for future no_std / WASM slices of the crate.
#[cfg(feature = "plugin-host")]
pub mod plugin;

// Canonical PostgreSQL/RuVector storage. Off for no_std/ESP32 consumers; the
// desktop shell opts in through the `storage` feature.
#[cfg(feature = "storage")]
pub mod storage;

pub const VERSION: &str = "0.1.0";
