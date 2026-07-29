//! Execute one database-authorized network-control plan.
//!
//! The database is the authority: this process can only obtain a plan through
//! `start_network_plan`, invokes the exact argv returned by that procedure, and
//! records the complete result through `record_network_effect`.

use lifeos_core::storage::{network, Storage};
use serde_json::{json, Value};
use std::env;
use std::process::{Command, Output};
use uuid::Uuid;

fn argv(value: &Value) -> Result<Vec<String>, String> {
    let values = value
        .get("argv")
        .and_then(Value::as_array)
        .ok_or_else(|| "network request must contain an argv array".to_string())?;
    if values.is_empty() {
        return Err("network argv must not be empty".into());
    }
    values
        .iter()
        .map(|item| {
            let arg = item
                .as_str()
                .ok_or_else(|| "network argv entries must be strings".to_string())?;
            if arg.is_empty() || arg.contains('\0') {
                return Err("network argv contains an invalid entry".into());
            }
            Ok(arg.to_string())
        })
        .collect()
}

fn run(binary: &str, args: &[String]) -> Result<Output, String> {
    let (command, rest) = args
        .split_first()
        .ok_or_else(|| "network argv must not be empty".to_string())?;
    Command::new(binary)
        .arg(command)
        .args(rest)
        .output()
        .map_err(|error| format!("spawn {binary}: {error}"))
}

fn effect(output: &Output) -> Value {
    json!({
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
        "stdout_bytes": output.stdout.clone(),
        "stderr_bytes": output.stderr.clone(),
        "success": output.status.success(),
    })
}

#[tokio::main]
async fn main() -> Result<(), String> {
    let plan_id = env::args()
        .nth(1)
        .ok_or_else(|| "usage: lifeos-network-control-executor <plan-uuid>".to_string())
        .and_then(|value| Uuid::parse_str(&value).map_err(|error| format!("plan id: {error}")))?;
    let binary = env::var("LIFEOS_NETCTL_BIN")
        .unwrap_or_else(|_| "/home/flexnetos/.nix-profile/bin/netctl".to_string());
    let storage = Storage::from_runtime_env()
        .await
        .map_err(|error| error.to_string())?;
    let plan = network::start_plan(storage.pool(), plan_id)
        .await
        .map_err(|error| error.to_string())?;
    let request = argv(&plan.request).map_err(|error| format!("request: {error}"))?;
    let rollback =
        argv(&plan.rollback_request).map_err(|error| format!("rollback request: {error}"))?;
    let output = run(&binary, &request)?;
    let main_effect = effect(&output);
    let (status, exit_code, rollback_effect) = if output.status.success() {
        ("succeeded", output.status.code(), None)
    } else {
        let rollback_output = run(&binary, &rollback)?;
        let rollback_ok = rollback_output.status.success();
        (
            if rollback_ok { "rolled_back" } else { "failed" },
            output.status.code(),
            Some(effect(&rollback_output)),
        )
    };
    let effect_id = network::record_effect(
        storage.pool(),
        plan_id,
        status,
        exit_code,
        main_effect,
        rollback_effect,
        &format!("{plan_id}:result"),
    )
    .await
    .map_err(|error| error.to_string())?;
    println!(
        "{}",
        json!({"plan_id": plan_id, "effect_id": effect_id, "status": status})
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::argv;
    use serde_json::json;

    #[test]
    fn argv_preserves_order_and_bytes_as_text() {
        assert_eq!(
            argv(&json!({"argv": ["status", "--json"]})).unwrap(),
            vec!["status", "--json"]
        );
    }

    #[test]
    fn argv_rejects_shell_like_or_empty_shapes() {
        assert!(argv(&json!({"argv": []})).is_err());
        assert!(argv(&json!({"argv": [1]})).is_err());
        assert!(argv(&json!({"argv": [""]})).is_err());
    }
}
