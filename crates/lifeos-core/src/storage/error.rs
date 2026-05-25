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
        // Detect SQLite constraint violations and map to domain errors.
        if let sqlx::Error::Database(ref db) = e {
            let msg = db.message();
            if msg.contains("UNIQUE") && msg.contains("accounts.email") {
                return Self::DuplicateEmail;
            }
            if msg.contains("FOREIGN KEY") {
                return Self::ForeignKeyViolation;
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
