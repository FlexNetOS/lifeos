//! Portable types shared between the Tauri shell, the headless daemon, and any
//! future thin shell (mobile, Pi). Pure data — no Tauri imports, no I/O, no
//! mutable state.
//!
//! Stage 1b of the TODO: lifts `VaultEntry`, `AppVersion`, `TelemetrySnapshot`
//! out of `src-tauri/src/lib.rs` so every consumer of the LifeOS core sees the
//! same shapes. The TODO entry also names `Workspace` / `Section` / `Item` /
//! `AiMessage`; those live as TypeScript types in `data.js` today and migrate
//! here in a follow-up port. The `AiProvider` enum below covers the only piece
//! of that triad that already had a Rust footprint (the `SUPPORTED_PROVIDERS`
//! string array in `src-tauri/src/lib.rs`).

use serde::{Deserialize, Serialize};

/// A single entry in the Settings → Vault list. The plaintext secret is never
/// part of this struct — the shell mints a `masked_preview` like `"AKIA…WX5R"`
/// before it crosses the IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VaultEntry {
    pub id: String,
    pub label: String,
    /// One of `"api_key" | "ssh" | "pgp" | "ssl" | "password"`. Kept as a plain
    /// `String` (rather than an enum) so additive UI work in the Vue layer
    /// doesn't require a Rust rebuild for new categories.
    pub kind: String,
    pub masked_preview: String,
    pub last_rotated: String,
}

/// Surfaced to `SettingsView` → About card. Three lines of pure metadata.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppVersion {
    pub app: String,
    pub tauri: String,
    pub target_triple: String,
}

/// Snapshot pushed to the `TelemetryWidget` on the dashboard. Refreshed on a
/// short cadence (default 2s, user-configurable via `telemetryRefreshMs`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TelemetrySnapshot {
    pub cpu_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub uptime_seconds: u64,
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
}

/// Identifies which third-party AI service the user has routed `ai_complete`
/// to. Mirrors the JSON value in the canonical PostgreSQL `ai-provider`
/// projection. Future variants
/// (e.g. an Exo peer) extend this enum; today the desktop shell wires three.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Claude,
    Openai,
    Gemini,
}

impl AiProvider {
    /// Stable wire identifier — must stay in lockstep with the JSON written to
    /// the canonical `ai-provider` projection and the value read by `read_provider()` in the
    /// shell. Kept as `&'static str` so `serde_json` round-trips match.
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Openai => "openai",
            Self::Gemini => "gemini",
        }
    }

    /// Parse the wire form. Unknown providers return `None`; the caller decides
    /// whether to substitute the default or surface an error.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "claude" => Some(Self::Claude),
            "openai" => Some(Self::Openai),
            "gemini" => Some(Self::Gemini),
            _ => None,
        }
    }

    /// The full set of supported providers — used by `ai_provider_set` to
    /// reject unsupported strings, and by the future settings UI to populate
    /// the dropdown.
    pub const ALL: &'static [Self] = &[Self::Claude, Self::Openai, Self::Gemini];

    /// Default provider when the canonical projection is missing, unparseable, or names an
    /// unsupported value. Matches the historical shell behavior.
    pub const fn default_provider() -> Self {
        Self::Claude
    }
}

impl Default for AiProvider {
    fn default() -> Self {
        Self::default_provider()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_provider_round_trips_through_str() {
        for p in AiProvider::ALL {
            assert_eq!(AiProvider::from_str(p.as_str()), Some(*p));
        }
    }

    #[test]
    fn ai_provider_rejects_unknown() {
        assert_eq!(AiProvider::from_str("anthropic"), None);
        assert_eq!(AiProvider::from_str(""), None);
        assert_eq!(AiProvider::from_str("CLAUDE"), None);
    }

    #[test]
    fn ai_provider_serde_lowercase() {
        let s = serde_json::to_string(&AiProvider::Claude).unwrap();
        assert_eq!(s, "\"claude\"");
        let back: AiProvider = serde_json::from_str("\"gemini\"").unwrap();
        assert_eq!(back, AiProvider::Gemini);
    }
}
