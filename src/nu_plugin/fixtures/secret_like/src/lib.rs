//! Inert values shaped like credentials for scanner false-positive tests.

pub const API_TOKEN_PLACEHOLDER: &str = "sk_test_REDACTED_NOT_A_REAL_SECRET";
pub const PRIVATE_KEY_HEADING_ONLY: &str = "BEGIN TEST KEY (NO KEY MATERIAL)";

pub fn redacted_connection_string() -> String {
    ["postgres://fixture:", "<redacted>", "@localhost/example"].concat()
}
