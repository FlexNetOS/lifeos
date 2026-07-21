use std::fmt;

/// All errors produced by the storage layer.
#[derive(Debug)]
pub enum StorageError {
    /// INSERT into `accounts` violated the UNIQUE constraint on `email`.
    DuplicateEmail,
    /// INSERT into `mempalace_edges` referenced a non-existent node.
    ForeignKeyViolation,
    /// `decode_vector` received a byte slice whose length is not divisible by 4.
    InvalidVectorBytes,
    /// Rust-side guard: `vector_bytes.len() != dim * 4`.
    VectorLengthMismatch,
    /// Migration source JSON could not be parsed as a valid `AccountRecord`.
    CorruptJson,
    /// A command attempted to open a non-PostgreSQL durable store.
    UnsupportedDatabaseUrl,
    /// The runtime database bridge did not supply `LIFEOS_DATABASE_URL`.
    MissingDatabaseUrl,
    /// Storage tests require an explicitly provisioned disposable PostgreSQL URL.
    MissingTestDatabaseUrl,
    /// RuVector must be installed in the dedicated `extensions` schema.
    RequiredExtension,
    /// The durable schema has fewer applied migrations than the embedded set.
    IncompleteMigrations { applied: u32, expected: u32 },
    /// A frontend projection write did not contain valid JSON.
    InvalidProjectionJson,
    /// Underlying sqlx error.
    Sqlx(sqlx::Error),
    /// Filesystem I/O error (archive rename, etc.).
    Io(std::io::Error),
}

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateEmail => write!(f, "an account with that email already exists"),
            Self::ForeignKeyViolation => write!(f, "referenced row does not exist"),
            Self::InvalidVectorBytes => {
                write!(f, "vector byte slice length is not a multiple of 4")
            }
            Self::VectorLengthMismatch => {
                write!(f, "vector bytes length does not match declared dim")
            }
            Self::CorruptJson => write!(f, "account.json is corrupt or has an unexpected shape"),
            Self::UnsupportedDatabaseUrl => {
                write!(f, "LifeOS durable storage requires a PostgreSQL URL")
            }
            Self::MissingDatabaseUrl => {
                write!(f, "LIFEOS_DATABASE_URL is required for durable storage")
            }
            Self::MissingTestDatabaseUrl => {
                write!(f, "LIFEOS_TEST_DATABASE_URL is required for storage tests")
            }
            Self::RequiredExtension => {
                write!(f, "ruvector must be installed in the extensions schema")
            }
            Self::IncompleteMigrations { applied, expected } => write!(
                f,
                "database has {applied} applied migrations but {expected} are required"
            ),
            Self::InvalidProjectionJson => write!(f, "projection payload must be valid JSON"),
            Self::Sqlx(e) => write!(f, "database error: {e}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl std::error::Error for StorageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Sqlx(e) => Some(e),
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<sqlx::Error> for StorageError {
    fn from(e: sqlx::Error) -> Self {
        // PostgreSQL SQLSTATEs keep domain failures independent of locale and
        // server wording.
        if let sqlx::Error::Database(ref db) = e {
            match db.code().as_deref() {
                Some("23505") => {
                    return Self::DuplicateEmail;
                }
                Some("23503") => {
                    return Self::ForeignKeyViolation;
                }
                _ => {}
            }
        }
        Self::Sqlx(e)
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}
