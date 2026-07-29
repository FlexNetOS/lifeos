//! Execute one database-authorized Weave or runner request.
//!
//! PostgreSQL/RuVector owns dispatch and fencing. This process only claims a
//! lease-bound request, executes the exact argv without a shell, and records
//! the complete byte-preserving result through the coordination procedures.

use lifeos_core::storage::{coordination, Storage};
use serde_json::{json, Value};
use std::env;
use std::process::{Command, Output};
use uuid::Uuid;

fn argv(request: &Value) -> Result<Vec<String>, String> {
    let values = request
        .get("argv")
        .and_then(Value::as_array)
        .ok_or_else(|| "coordination request must contain an argv array".to_string())?;
    if values.is_empty() {
        return Err("coordination argv must not be empty".into());
    }
    values
        .iter()
        .map(|item| {
            let arg = item
                .as_str()
                .ok_or_else(|| "coordination argv entries must be strings".to_string())?;
            if arg.is_empty() || arg.contains('\0') {
                return Err("coordination argv contains an invalid entry".into());
            }
            Ok(arg.to_string())
        })
        .collect()
}

fn run(request: &Value) -> Result<Output, String> {
    let args = argv(request)?;
    let (program, args) = args
        .split_first()
        .ok_or_else(|| "coordination argv must not be empty".to_string())?;
    Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("spawn {program}: {error}"))
}

fn result(output: &Output) -> Value {
    json!({
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
        "stdout_bytes": output.stdout,
        "stderr_bytes": output.stderr,
        "exit_code": output.status.code(),
        "success": output.status.success(),
    })
}

fn spawn_error(error: String) -> Value {
    json!({"success": false, "exit_code": null, "error": error})
}

#[tokio::main]
async fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let kind = args.next().ok_or_else(|| {
        "usage: lifeos-coordination-executor <weave|runner> <job-uuid>".to_string()
    })?;
    let job_id = args
        .next()
        .ok_or_else(|| "missing job uuid".to_string())
        .and_then(|value| Uuid::parse_str(&value).map_err(|error| format!("job id: {error}")))?;
    if args.next().is_some() || !matches!(kind.as_str(), "weave" | "runner") {
        return Err("usage: lifeos-coordination-executor <weave|runner> <job-uuid>".into());
    }

    let storage = Storage::from_runtime_env()
        .await
        .map_err(|error| error.to_string())?;
    let (receipt_id, status) = match kind.as_str() {
        "weave" => {
            let attempt = coordination::start_weave_job(storage.pool(), job_id)
                .await
                .map_err(|error| error.to_string())?;
            let (value, status) = match run(&attempt.request) {
                Ok(output) => (
                    result(&output),
                    if output.status.success() {
                        "succeeded"
                    } else {
                        "failed"
                    },
                ),
                Err(error) => (spawn_error(error), "failed"),
            };
            let key = format!("{job_id}:{}:result", attempt.attempt_id);
            (
                coordination::record_weave_attempt(
                    storage.pool(),
                    job_id,
                    attempt.attempt_id,
                    status,
                    value,
                    &key,
                )
                .await
                .map_err(|error| error.to_string())?,
                status,
            )
        }
        "runner" => {
            let job = coordination::start_runner_job(storage.pool(), job_id)
                .await
                .map_err(|error| error.to_string())?;
            let (value, status) = match run(&job.request) {
                Ok(output) => (
                    result(&output),
                    if output.status.success() {
                        "succeeded"
                    } else {
                        "failed"
                    },
                ),
                Err(error) => (spawn_error(error), "failed"),
            };
            let key = format!("{job_id}:result");
            (
                coordination::record_runner_receipt(storage.pool(), job_id, status, value, &key)
                    .await
                    .map_err(|error| error.to_string())?,
                status,
            )
        }
        _ => unreachable!(),
    };
    println!(
        "{}",
        json!({"kind": kind, "job_id": job_id, "receipt_id": receipt_id, "status": status})
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::argv;
    use serde_json::json;

    #[test]
    fn argv_is_exact_and_shell_free() {
        assert_eq!(
            argv(&json!({"argv": ["/bin/echo", "ok"]})).unwrap(),
            ["/bin/echo", "ok"]
        );
        assert!(argv(&json!({"argv": []})).is_err());
        assert!(argv(&json!({"argv": [1]})).is_err());
        assert!(argv(&json!({"argv": ["sh", "-c", "echo nope"]})).is_ok());
    }
}
