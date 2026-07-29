use anyhow::{Context, Result};
use redb_new::{Database as NewDatabase, TableDefinition as NewTableDefinition};
use redb_old::{Database as OldDatabase, ReadableTable as OldReadableTable, TableDefinition as OldTableDefinition};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const BYTE_TABLES: &[&str] = &[
    "vectors",
    "reflexion_episodes",
    "skills_library",
    "causal_edges",
    "learning_sessions",
];
const TEXT_TABLES: &[&str] = &["metadata", "config"];

#[derive(Debug, Serialize)]
struct TableReceipt {
    table: String,
    kind: &'static str,
    rows: usize,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Serialize)]
struct Receipt {
    schema_version: &'static str,
    source: String,
    destination: String,
    source_format: u8,
    destination_format: u8,
    tables: Vec<TableReceipt>,
    source_sha256: String,
    destination_sha256: String,
}

fn digest_pair(hasher: &mut Sha256, key: &[u8], value: &[u8]) {
    hasher.update((key.len() as u64).to_le_bytes());
    hasher.update(key);
    hasher.update((value.len() as u64).to_le_bytes());
    hasher.update(value);
}

fn copy_bytes(
    source: &OldDatabase,
    destination: &NewDatabase,
    name: &str,
) -> Result<Option<TableReceipt>> {
    let old_txn = source.begin_read()?;
    let old_table = match name {
        "vectors" => old_txn.open_table(OldTableDefinition::<&str, &[u8]>::new(name)),
        "reflexion_episodes" => old_txn.open_table(OldTableDefinition::<&str, &[u8]>::new(name)),
        "skills_library" => old_txn.open_table(OldTableDefinition::<&str, &[u8]>::new(name)),
        "causal_edges" => old_txn.open_table(OldTableDefinition::<&str, &[u8]>::new(name)),
        "learning_sessions" => old_txn.open_table(OldTableDefinition::<&str, &[u8]>::new(name)),
        _ => unreachable!(),
    };
    let old_table = match old_table {
        Ok(table) => table,
        Err(error) if error.to_string().contains("does not exist") => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let mut rows = Vec::new();
    let mut hasher = Sha256::new();
    let mut bytes = 0u64;
    for item in old_table.iter()? {
        let (key, value) = item?;
        let key = key.value().as_bytes().to_vec();
        let value = value.value().to_vec();
        bytes += (key.len() + value.len()) as u64;
        digest_pair(&mut hasher, &key, &value);
        rows.push((key, value));
    }
    drop(old_table);
    drop(old_txn);

    let write_txn = destination.begin_write()?;
    {
        let mut table = write_txn.open_table(NewTableDefinition::<&str, &[u8]>::new(name))?;
        for (key, value) in &rows {
            let key = std::str::from_utf8(key).context("redb key is not UTF-8")?;
            table.insert(key, value.as_slice())?;
        }
    }
    write_txn.commit()?;
    Ok(Some(TableReceipt {
        table: name.to_string(),
        kind: "bytes",
        rows: rows.len(),
        bytes,
        sha256: format!("{:x}", hasher.finalize()),
    }))
}

fn copy_text(
    source: &OldDatabase,
    destination: &NewDatabase,
    name: &str,
) -> Result<Option<TableReceipt>> {
    let old_txn = source.begin_read()?;
    let old_table = match name {
        "metadata" => old_txn.open_table(OldTableDefinition::<&str, &str>::new(name)),
        "config" => old_txn.open_table(OldTableDefinition::<&str, &str>::new(name)),
        _ => unreachable!(),
    };
    let old_table = match old_table {
        Ok(table) => table,
        Err(error) if error.to_string().contains("does not exist") => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let mut rows = Vec::new();
    let mut hasher = Sha256::new();
    let mut bytes = 0u64;
    for item in old_table.iter()? {
        let (key, value) = item?;
        let key = key.value().as_bytes().to_vec();
        let value = value.value().as_bytes().to_vec();
        bytes += (key.len() + value.len()) as u64;
        digest_pair(&mut hasher, &key, &value);
        rows.push((key, value));
    }
    drop(old_table);
    drop(old_txn);

    let write_txn = destination.begin_write()?;
    {
        let mut table = write_txn.open_table(NewTableDefinition::<&str, &str>::new(name))?;
        for (key, value) in &rows {
            let key = std::str::from_utf8(key).context("redb key is not UTF-8")?;
            let value = std::str::from_utf8(value).context("redb value is not UTF-8")?;
            table.insert(key, value)?;
        }
    }
    write_txn.commit()?;
    Ok(Some(TableReceipt {
        table: name.to_string(),
        kind: "text",
        rows: rows.len(),
        bytes,
        sha256: format!("{:x}", hasher.finalize()),
    }))
}

fn file_sha256(path: &Path) -> Result<String> {
    let bytes = fs::read(path)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn main() -> Result<()> {
    let mut args = env::args_os().skip(1);
    let source = PathBuf::from(args.next().context("source redb path required")?);
    let destination = PathBuf::from(args.next().context("destination redb path required")?);
    anyhow::ensure!(args.next().is_none(), "usage: migrate <source-v2.db> <destination-v3.db>");
    anyhow::ensure!(source.is_file(), "source does not exist: {}", source.display());
    anyhow::ensure!(!destination.exists(), "destination already exists: {}", destination.display());
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }

    let source_db = OldDatabase::open(&source).context("open source redb v2 database")?;
    let destination_db = NewDatabase::create(&destination).context("create destination redb v3 database")?;
    let mut tables = Vec::new();
    for name in BYTE_TABLES {
        if let Some(receipt) = copy_bytes(&source_db, &destination_db, name)? {
            tables.push(receipt);
        }
    }
    for name in TEXT_TABLES {
        if let Some(receipt) = copy_text(&source_db, &destination_db, name)? {
            tables.push(receipt);
        }
    }
    drop(destination_db);
    drop(source_db);

    let receipt = Receipt {
        schema_version: "lifeos.ruvector-redb-migration.v1",
        source: source.display().to_string(),
        destination: destination.display().to_string(),
        source_format: 2,
        destination_format: 3,
        source_sha256: file_sha256(&source)?,
        destination_sha256: file_sha256(&destination)?,
        tables,
    };
    println!("{}", serde_json::to_string_pretty(&receipt)?);
    Ok(())
}
