//! LifeOS — local account login (Tauri shell wrapper).
//!
//! The pure validators, Argon2 hashing, `AccountRecord` shape, and the
//! `AuthState` session container live in `lifeos_core::auth`. This file owns
//! the five `#[tauri::command]` wrappers that the Vue layer invokes.
//!
//! Storage backend: `lifeos_core::storage::accounts` (SQLite via `Storage`
//! managed in `lib.rs::run()`). The JSON-at-rest helpers (`account.json`) have
//! been retired; one-time migration from any pre-existing `account.json` is
//! handled automatically during startup by `Storage::setup` in `lib.rs`.
//!
//! Tauri command public surfaces (`auth_status` / `auth_signup` / `auth_signin`
//! / `auth_signout` / `auth_reset_vault`) are unchanged from the frontend's
//! perspective.

use lifeos_core::{
    auth::{self, AccountRecord, AuthStatus, ERR_ACCOUNT_EXISTS, ERR_BAD_CREDENTIALS, ERR_NO_ACCOUNT},
    storage::{accounts, Storage},
};

// Re-export so `lib.rs` can keep calling `auth::AuthState::new()` and
// `tauri::State<'_, auth::AuthState>` unchanged.
pub use lifeos_core::auth::AuthState;

#[tauri::command]
pub async fn auth_status(
    state: tauri::State<'_, AuthState>,
    storage: tauri::State<'_, Storage>,
) -> Result<AuthStatus, String> {
    let row = accounts::get_first(storage.pool())
        .await
        .map_err(|e| e.to_string())?;
    let signed_in = state.is_signed_in()?;
    Ok(AuthStatus {
        has_account: row.is_some(),
        account_email: row.as_ref().map(|r| r.email.clone()),
        account_display_name: row.as_ref().map(|r| r.display_name.clone()),
        is_signed_in: signed_in,
    })
}

#[tauri::command]
pub async fn auth_signup(
    state: tauri::State<'_, AuthState>,
    storage: tauri::State<'_, Storage>,
    email: String,
    display_name: String,
    password: String,
) -> Result<AuthStatus, String> {
    let pool = storage.pool();
    if accounts::get_first(pool)
        .await
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err(ERR_ACCOUNT_EXISTS.into());
    }
    // Reuse the existing validation + hashing orchestrator.
    let validated = AccountRecord::new_signup(&email, &display_name, &password)?;
    let row = accounts::insert(pool, &validated.email, &validated.display_name, &validated.password_hash)
        .await
        .map_err(|e| e.to_string())?;
    state.login(&row_to_record(&row))?;
    Ok(AuthStatus {
        has_account: true,
        account_email: Some(row.email),
        account_display_name: Some(row.display_name),
        is_signed_in: true,
    })
}

#[tauri::command]
pub async fn auth_signin(
    state: tauri::State<'_, AuthState>,
    storage: tauri::State<'_, Storage>,
    password: String,
) -> Result<AuthStatus, String> {
    let pool = storage.pool();
    let row = accounts::get_first(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| ERR_NO_ACCOUNT.to_string())?;
    if !auth::verify_password(&password, &row.password_hash) {
        return Err(ERR_BAD_CREDENTIALS.into());
    }
    state.login(&row_to_record(&row))?;
    Ok(AuthStatus {
        has_account: true,
        account_email: Some(row.email),
        account_display_name: Some(row.display_name),
        is_signed_in: true,
    })
}

#[tauri::command]
pub fn auth_signout(state: tauri::State<'_, AuthState>) -> Result<(), String> {
    state.logout()
}

#[tauri::command]
pub async fn auth_reset_vault(
    state: tauri::State<'_, AuthState>,
    storage: tauri::State<'_, Storage>,
) -> Result<(), String> {
    accounts::delete_all(storage.pool())
        .await
        .map_err(|e| e.to_string())?;
    state.logout()
}

/// Convert a `storage::accounts::AccountRow` into the `AccountRecord` shape
/// expected by `AuthState::login`. Only `email` and `display_name` are used
/// by the session; `created_at` is re-encoded to the legacy string format so
/// the struct is valid.
fn row_to_record(row: &accounts::AccountRow) -> AccountRecord {
    AccountRecord {
        email: row.email.clone(),
        display_name: row.display_name.clone(),
        password_hash: row.password_hash.clone(),
        created_at: format!("epoch:{}", row.created_at),
    }
}
