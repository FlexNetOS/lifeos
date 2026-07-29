use lifeos_core::mcp::ruvector::RuvectorMcpClient;
use serde_json::json;
use std::env;

fn main() -> Result<(), String> {
    let db_path = env::var("LIFEOS_RUVECTOR_MCP_DB").map_err(|_| {
        "LIFEOS_RUVECTOR_MCP_DB must name the authorized server-local database".to_string()
    })?;
    let client = RuvectorMcpClient::from_env().map_err(|error| error.to_string())?;
    let vector_db = client
        .vector_db_stats(&db_path)
        .map_err(|error| error.to_string())?;
    let gnn_cache = client
        .gnn_cache_stats(true)
        .map_err(|error| error.to_string())?;
    println!(
        "{}",
        json!({
            "status": "ruvector-mcp-live-pass",
            "db_path": db_path,
            "vector_db": vector_db,
            "gnn_cache": gnn_cache,
        })
    );
    Ok(())
}
