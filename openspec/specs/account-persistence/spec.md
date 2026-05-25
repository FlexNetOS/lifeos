## ADDED Requirements

### Requirement: Accounts table CRUD

The system SHALL provide insert / get-by-email / update-password / delete operations against an `accounts` table whose columns are `id (INTEGER PK AUTOINCREMENT)`, `email (TEXT UNIQUE NOT NULL)`, `display_name (TEXT NOT NULL)`, `password_hash (TEXT NOT NULL)`, `created_at (INTEGER NOT NULL)`, `updated_at (INTEGER NOT NULL)`.

#### Scenario: Insert produces auto-incremented id

- **WHEN** `accounts::insert(email, display_name, password_hash)` is called against an empty table
- **THEN** the returned `AccountRow` SHALL have `id == 1`
- **AND** `created_at` and `updated_at` SHALL be equal and SHALL be set to the current Unix timestamp in seconds

#### Scenario: Email uniqueness invariant rejects duplicates

- **WHEN** `accounts::insert` is called twice with the same `email`
- **THEN** the second call SHALL return `Err(StorageError::DuplicateEmail)`
- **AND** the table SHALL contain exactly one row

#### Scenario: Get-by-email round-trip

- **WHEN** `accounts::get_by_email(email)` is called after an `insert` with that email
- **THEN** the returned `Option<AccountRow>` SHALL be `Some` with `display_name` and `password_hash` matching the inserted values

#### Scenario: Update bumps updated_at

- **WHEN** `accounts::update_password(id, new_hash)` is called on an existing row
- **THEN** `password_hash` SHALL equal `new_hash` on the next read
- **AND** `updated_at` SHALL be greater than or equal to `created_at`

### Requirement: Argon2 hash storage

The `password_hash` column SHALL store PHC-format strings produced by `lifeos_core::auth::hash_password`. Stored hashes SHALL verify against the original password via `lifeos_core::auth::verify_password`.

#### Scenario: Stored hash verifies against original password

- **WHEN** a password is hashed with `lifeos_core::auth::hash_password`, inserted into the `accounts` table, and re-read
- **THEN** `lifeos_core::auth::verify_password(original_password, stored_hash)` SHALL return `true`
- **AND** `lifeos_core::auth::verify_password(wrong_password, stored_hash)` SHALL return `false`

### Requirement: One-time `account.json` to database migration

The system SHALL provide `Storage::migrate_from_json(app_data_dir)` that performs a one-time copy of a pre-existing `<app_data_dir>/account.json` into the `accounts` table.

#### Scenario: Empty table plus existing JSON triggers migration

- **WHEN** the `accounts` table is empty and `<app_data_dir>/account.json` contains a valid `AccountRecord`
- **THEN** `migrate_from_json` SHALL insert one row matching the JSON
- **AND** the JSON file SHALL be renamed to `account.json.migrated-<RFC3339-UTC>` (colons replaced with hyphens)
- **AND** the function SHALL return `Ok(MigrateOutcome::Migrated)`

#### Scenario: Populated table is a no-op even if JSON exists

- **WHEN** the `accounts` table contains at least one row and `<app_data_dir>/account.json` also exists
- **THEN** `migrate_from_json` SHALL NOT modify the table
- **AND** the JSON file SHALL NOT be renamed
- **AND** the function SHALL return `Ok(MigrateOutcome::AlreadyMigrated)`

#### Scenario: No JSON file is a no-op

- **WHEN** the `accounts` table is empty and `<app_data_dir>/account.json` does not exist
- **THEN** `migrate_from_json` SHALL return `Ok(MigrateOutcome::NoSource)`

#### Scenario: Corrupt JSON leaves file untouched and table empty

- **WHEN** `<app_data_dir>/account.json` exists but contains invalid JSON
- **THEN** `migrate_from_json` SHALL return `Err(MigrateError::CorruptJson)`
- **AND** the JSON file SHALL NOT be renamed
- **AND** the `accounts` table SHALL remain empty

#### Scenario: Insert failure rolls back transaction

- **WHEN** the JSON parses but the DB insert fails (e.g. disk full mid-write)
- **THEN** the entire migration SHALL be wrapped in a transaction that is rolled back
- **AND** the JSON file SHALL NOT be renamed
- **AND** the `accounts` table SHALL remain empty

### Requirement: Tauri command surface preserved

The five `#[tauri::command]` functions `auth_status`, `auth_signup`, `auth_signin`, `auth_signout`, `auth_reset_vault` SHALL keep their exact parameter and return signatures. Only the storage backend swap is visible.

#### Scenario: Signup writes to database, not JSON

- **WHEN** `auth_signup(email, display_name, password)` is called on a fresh installation
- **THEN** the new row SHALL appear in the `accounts` table
- **AND** no `<app_data_dir>/account.json` file SHALL be written

#### Scenario: Signin reads from database

- **WHEN** `auth_signin(password)` is called against a database with one `accounts` row
- **THEN** the password SHALL be verified against the stored hash
- **AND** the `AuthState` SHALL transition to signed-in on success

#### Scenario: Reset vault deletes the accounts row but preserves migration archives

- **WHEN** `auth_reset_vault()` is called
- **THEN** every row in `accounts` SHALL be deleted
- **AND** any `<app_data_dir>/account.json.migrated-*` archive files SHALL remain in place (audit trail preserved)
