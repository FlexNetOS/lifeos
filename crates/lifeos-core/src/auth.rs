//! Portable Argon2id account authentication.
//!
//! Stage 1c of the TODO: lifted out of `src-tauri/src/auth.rs` so the headless
//! daemon and any future shell can verify a stored account record without
//! linking the Tauri runtime. Everything here is platform-agnostic — no
//! `tauri::*` imports, no filesystem I/O. PostgreSQL identity persistence stays
//! in the shell/core storage boundary; `AccountRecord` is retained solely as
//! the validated legacy-import wire shape.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

pub const ERR_NO_ACCOUNT: &str = "No account exists yet — create one.";
pub const ERR_BAD_CREDENTIALS: &str = "Email or password didn't match.";
pub const ERR_ACCOUNT_EXISTS: &str = "An account already exists on this device.";
pub const ERR_VALIDATION_EMAIL: &str = "Enter a valid email address.";
pub const ERR_VALIDATION_NAME: &str = "Display name can't be empty.";
pub const ERR_VALIDATION_PASSWORD: &str = "Password must be at least 8 characters.";
pub const ERR_INTERNAL: &str = "LifeOS couldn't update the local credential store.";

/// The historical account-record wire shape. Field names are part of the
/// legacy import format — do not rename without a migration plan.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountRecord {
    pub email: String,
    pub display_name: String,
    /// Argon2id PHC string — salt + parameters embedded.
    pub password_hash: String,
    /// Seconds since epoch, formatted as `"epoch:<n>"`. Informational only.
    pub created_at: String,
}

/// Returned to the frontend by every auth command. Mirrors the historical
/// shape exactly so existing `SettingsView` consumers don't need changes.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthStatus {
    pub has_account: bool,
    pub account_email: Option<String>,
    pub account_display_name: Option<String>,
    pub is_signed_in: bool,
}

/// In-memory session. Held inside `AuthState` behind a `Mutex`. Private — the
/// frontend never sees it directly; `AuthStatus` surfaces what it needs.
#[derive(Debug, Clone)]
struct Session {
    #[allow(dead_code)]
    email: String,
    #[allow(dead_code)]
    display_name: String,
}

/// Tauri `manage()`-d state holding the current login session. Reused as-is
/// by the shell via `lifeos_core::auth::AuthState`.
pub struct AuthState {
    session: Mutex<Option<Session>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }

    /// Activate a session for the given account. Returns `Err(ERR_INTERNAL)`
    /// only when the mutex is poisoned (which would itself indicate a prior
    /// panic — exceedingly rare).
    pub fn login(&self, rec: &AccountRecord) -> Result<(), String> {
        let mut session = self.session.lock().map_err(|_| ERR_INTERNAL.to_string())?;
        *session = Some(Session {
            email: rec.email.clone(),
            display_name: rec.display_name.clone(),
        });
        Ok(())
    }

    /// Clear the active session. Idempotent.
    pub fn logout(&self) -> Result<(), String> {
        let mut session = self.session.lock().map_err(|_| ERR_INTERNAL.to_string())?;
        *session = None;
        Ok(())
    }

    /// Whether a session is currently active.
    pub fn is_signed_in(&self) -> Result<bool, String> {
        let session = self.session.lock().map_err(|_| ERR_INTERNAL.to_string())?;
        Ok(session.is_some())
    }
}

impl Default for AuthState {
    fn default() -> Self {
        Self::new()
    }
}

// ---------- Pure validators ----------

pub fn validate_email(s: &str) -> Result<(), String> {
    let t = s.trim();
    if t.is_empty() || !t.contains('@') || !t.contains('.') || t.len() > 254 {
        return Err(ERR_VALIDATION_EMAIL.into());
    }
    Ok(())
}

pub fn validate_name(s: &str) -> Result<(), String> {
    let t = s.trim();
    if t.is_empty() || t.len() > 80 {
        return Err(ERR_VALIDATION_NAME.into());
    }
    Ok(())
}

pub fn validate_password(s: &str) -> Result<(), String> {
    if s.len() < 8 || s.len() > 256 {
        return Err(ERR_VALIDATION_PASSWORD.into());
    }
    Ok(())
}

// ---------- Argon2id hashing ----------

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| ERR_INTERNAL.into())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    let parsed = match PasswordHash::new(hash) {
        Ok(p) => p,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// Seconds-since-epoch timestamp, formatted as `"epoch:<n>"`. Avoids pulling
/// `chrono` for an informational field. Returns `"epoch:0"` if the system
/// clock is before the Unix epoch (impossible on any sane host).
pub fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("epoch:{secs}")
}

// ---------- Orchestrators ----------

impl AccountRecord {
    /// Build a fresh `AccountRecord` from raw signup inputs. Performs all
    /// validation + password hashing in one step so callers can't construct an
    /// invalid record. Pure — no I/O.
    pub fn new_signup(email: &str, display_name: &str, password: &str) -> Result<Self, String> {
        validate_email(email)?;
        validate_name(display_name)?;
        validate_password(password)?;
        let password_hash = hash_password(password)?;
        Ok(Self {
            email: email.trim().to_string(),
            display_name: display_name.trim().to_string(),
            password_hash,
            created_at: now_iso(),
        })
    }
}

/// Build an `AuthStatus` from an optional stored record + the active session
/// flag. Used by the shell's `auth_status` command and indirectly by all the
/// other commands when they return their post-operation snapshot.
pub fn status_from_record(rec: Option<&AccountRecord>, is_signed_in: bool) -> AuthStatus {
    AuthStatus {
        has_account: rec.is_some(),
        account_email: rec.map(|r| r.email.clone()),
        account_display_name: rec.map(|r| r.display_name.clone()),
        is_signed_in,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_email_shape() {
        assert!(validate_email("alex@lifeos.ai").is_ok());
        assert!(validate_email("").is_err());
        assert!(validate_email("no-at-symbol").is_err());
        assert!(validate_email("missing-dot@x").is_err());
    }

    #[test]
    fn validates_name() {
        assert!(validate_name("Alex").is_ok());
        assert!(validate_name("").is_err());
        assert!(validate_name("   ").is_err());
    }

    #[test]
    fn validates_password() {
        assert!(validate_password("longenough").is_ok());
        assert!(validate_password("short").is_err());
        assert!(validate_password("").is_err());
    }

    #[test]
    fn hash_verifies_roundtrip() {
        let h = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password("correct horse battery staple", &h));
        assert!(!verify_password("wrong password", &h));
    }

    #[test]
    fn hash_is_phc_string() {
        let h = hash_password("longenough").unwrap();
        assert!(h.starts_with("$argon2"), "expected PHC prefix, got {h}");
    }

    #[test]
    fn signup_orchestrator_builds_valid_record() {
        let rec = AccountRecord::new_signup("alex@lifeos.ai", "Alex", "longenough").unwrap();
        assert_eq!(rec.email, "alex@lifeos.ai");
        assert_eq!(rec.display_name, "Alex");
        assert!(rec.password_hash.starts_with("$argon2"));
        assert!(rec.created_at.starts_with("epoch:"));
        assert!(verify_password("longenough", &rec.password_hash));
    }

    #[test]
    fn signup_rejects_bad_inputs() {
        assert!(AccountRecord::new_signup("", "Alex", "longenough").is_err());
        assert!(AccountRecord::new_signup("alex@lifeos.ai", "", "longenough").is_err());
        assert!(AccountRecord::new_signup("alex@lifeos.ai", "Alex", "short").is_err());
    }

    #[test]
    fn auth_state_login_and_logout() {
        let state = AuthState::new();
        assert!(!state.is_signed_in().unwrap());
        let rec = AccountRecord::new_signup("alex@lifeos.ai", "Alex", "longenough").unwrap();
        state.login(&rec).unwrap();
        assert!(state.is_signed_in().unwrap());
        state.logout().unwrap();
        assert!(!state.is_signed_in().unwrap());
    }

    #[test]
    fn status_from_record_shapes() {
        let rec = AccountRecord::new_signup("alex@lifeos.ai", "Alex", "longenough").unwrap();
        let s = status_from_record(Some(&rec), true);
        assert!(s.has_account);
        assert_eq!(s.account_email.as_deref(), Some("alex@lifeos.ai"));
        assert!(s.is_signed_in);

        let s = status_from_record(None, false);
        assert!(!s.has_account);
        assert!(s.account_email.is_none());
        assert!(!s.is_signed_in);
    }
}
