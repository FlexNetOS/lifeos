use lifeos_core::storage::{branches, Storage};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = std::env::var("LIFEOS_DATABASE_URL")
        .map_err(|_| "LIFEOS_DATABASE_URL is required for schema migration")?;
    let storage = Storage::new(&database_url).await?;
    let migration = storage.migrate().await?;
    let health = storage.health().await?;
    let cow = branches::capability_report(storage.pool()).await?;

    println!(
        "{}",
        serde_json::to_string(&serde_json::json!({
            "status": "completed",
            "database": health,
            "migration": {
                "applied": migration.applied,
                "total": migration.total,
            },
            "cow_branch_runtime": cow,
        }))?
    );
    Ok(())
}
