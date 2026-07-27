#[cfg(feature = "extra")]
pub const FEATURE_STATE: &str = "extra-enabled";

#[cfg(not(feature = "extra"))]
pub const FEATURE_STATE: &str = "extra-disabled";

#[cfg(unix)]
pub fn platform_name() -> &'static str {
    codedb_fixture_unix_helper::platform_name()
}

#[cfg(not(unix))]
pub fn platform_name() -> &'static str {
    "non-unix"
}
