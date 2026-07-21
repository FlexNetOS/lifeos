## Requirements

### Requirement: Canonical PostgreSQL identity storage

The system SHALL provide insert, get-by-email, update-password, and delete
operations against `lifeos_security.identity` in the canonical PostgreSQL
store. Its identity is `id (BIGINT GENERATED ALWAYS AS IDENTITY)`, its email
is unique, and its timestamps are PostgreSQL `TIMESTAMPTZ` values projected to
Unix seconds at the Rust API boundary. SQLite SHALL not be a canonical account
store.

#### Scenario: Insert produces a durable identity

- **WHEN** `accounts::insert(email, display_name, password_hash)` is called
- **THEN** it SHALL return the PostgreSQL-generated identity id
- **AND** `created_at` and `updated_at` SHALL be canonical PostgreSQL times

#### Scenario: Email uniqueness rejects duplicates

- **WHEN** `accounts::insert` is called twice with the same email
- **THEN** the second call SHALL return `Err(StorageError::DuplicateEmail)`
- **AND** PostgreSQL SHALL contain exactly one matching identity

### Requirement: Argon2 hash storage

`password_hash` SHALL store PHC-format values produced by
`lifeos_core::auth::hash_password`. Plaintext credentials SHALL not be written
to PostgreSQL, redb, app-data files, logs, proof artifacts, or model context.

#### Scenario: Stored hash verifies

- **WHEN** a password is hashed, inserted, and read back
- **THEN** `verify_password` SHALL accept the original and reject a wrong one

### Requirement: One-way legacy account import

The system SHALL provide `accounts::migrate_from_json(pool, app_data_dir)` for
a pre-cutover `account.json`. It SHALL capture the exact source bytes in
`lifeos_blob.object` and insert the identity in one PostgreSQL transaction.
It SHALL remove the source only after that commit succeeds.

#### Scenario: Valid legacy source migrates atomically

- **WHEN** no canonical identity exists and `account.json` is valid
- **THEN** the identity and byte-identical raw object SHALL be committed
- **AND** the source file SHALL be retired only after commit

#### Scenario: Existing canonical data fails closed

- **WHEN** canonical identities already exist and a legacy `account.json`
  remains
- **THEN** the source SHALL be retired only if its SHA-256 is already captured
- **AND** an uncaptured source SHALL remain in place and return an error

#### Scenario: Corrupt legacy source remains recoverable

- **WHEN** `account.json` is invalid
- **THEN** import SHALL fail without deleting the source or creating an
  identity

### Requirement: Tauri command surface remains stable

The five `#[tauri::command]` functions `auth_status`, `auth_signup`,
`auth_signin`, `auth_signout`, and `auth_reset_vault` SHALL retain their public
frontend semantics while using PostgreSQL identity storage.

#### Scenario: Signup never recreates account.json

- **WHEN** `auth_signup` succeeds
- **THEN** the identity SHALL exist in PostgreSQL
- **AND** no app-data `account.json` SHALL be created
