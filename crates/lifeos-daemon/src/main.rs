//! Headless Cognitum-Seed → MQTT bridge for small LifeOS nodes.

use lifeos_core::mcp::cognitum::CognitumClient;
use lifeos_core::mcp::ReqwestTransport;
use lifeos_core::storage::{logs, Storage};
use rumqttc::{Client, LastWill, MqttOptions, QoS};
use serde_json::json;
use std::env;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::runtime::Runtime;
use uuid::Uuid;

#[derive(Debug, Clone)]
struct Config {
    cognitum_url: String,
    mqtt_host: String,
    mqtt_port: u16,
    mqtt_client_id: String,
    device_id: String,
    topic_prefix: String,
    poll_interval: Duration,
    execution_id: Uuid,
}

impl Config {
    fn from_env() -> Result<Self, String> {
        let mqtt_url =
            env::var("LIFEOS_MQTT_URL").unwrap_or_else(|_| "mqtt://127.0.0.1:1883".to_string());
        let (mqtt_host, mqtt_port) = parse_mqtt_url(&mqtt_url)?;
        let device_id = env::var("LIFEOS_DEVICE_ID")
            .or_else(|_| env::var("HOSTNAME"))
            .unwrap_or_else(|_| "lifeos-node".to_string());
        let poll_seconds = env::var("LIFEOS_SENSOR_POLL_SECONDS")
            .unwrap_or_else(|_| "5".to_string())
            .parse::<u64>()
            .map_err(|e| format!("LIFEOS_SENSOR_POLL_SECONDS: {e}"))?;
        if poll_seconds == 0 {
            return Err("LIFEOS_SENSOR_POLL_SECONDS must be greater than zero".into());
        }
        let execution_id = env::var("LIFEOS_RUNTIME_EXECUTION_ID")
            .map_err(|_| "LIFEOS_RUNTIME_EXECUTION_ID is required".to_string())?
            .parse::<Uuid>()
            .map_err(|e| format!("LIFEOS_RUNTIME_EXECUTION_ID: {e}"))?;
        Ok(Self {
            cognitum_url: env::var("LIFEOS_COGNITUM_URL")
                .unwrap_or_else(|_| "http://169.254.42.1/mcp".to_string()),
            mqtt_host,
            mqtt_port,
            mqtt_client_id: env::var("LIFEOS_MQTT_CLIENT_ID")
                .unwrap_or_else(|_| format!("lifeos-daemon-{device_id}")),
            device_id,
            topic_prefix: env::var("LIFEOS_MQTT_TOPIC_PREFIX")
                .unwrap_or_else(|_| "lifeos/sensor".to_string())
                .trim_end_matches('/')
                .to_string(),
            poll_interval: Duration::from_secs(poll_seconds),
            execution_id,
        })
    }
}

fn parse_mqtt_url(raw: &str) -> Result<(String, u16), String> {
    let authority = raw
        .strip_prefix("mqtt://")
        .or_else(|| raw.strip_prefix("mqtts://"))
        .ok_or_else(|| "LIFEOS_MQTT_URL must start with mqtt:// or mqtts://".to_string())?;
    if raw.starts_with("mqtts://") {
        return Err("mqtts:// is not enabled; use mqtt:// or configure a TLS transport".into());
    }
    let authority = authority.split('/').next().unwrap_or_default();
    let (host, port) = authority
        .rsplit_once(':')
        .map(|(host, port)| {
            port.parse::<u16>()
                .map(|port| (host.to_string(), port))
                .map_err(|e| format!("LIFEOS_MQTT_URL port: {e}"))
        })
        .transpose()?
        .unwrap_or_else(|| (authority.to_string(), 1883));
    if host.is_empty() {
        return Err("LIFEOS_MQTT_URL host is empty".into());
    }
    Ok((host, port))
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn capture(
    runtime: &Runtime,
    storage: &Storage,
    execution_id: Uuid,
    stream: &str,
    frame_no: &mut i64,
    byte_offset: &mut i64,
    bytes: &[u8],
    context: serde_json::Value,
) -> Result<(), String> {
    runtime
        .block_on(logs::append_frame(
            storage.pool(),
            execution_id,
            stream,
            *frame_no,
            *byte_offset,
            bytes,
            context,
        ))
        .map_err(|e| format!("capture {stream} frame {}: {e}", *frame_no))?;
    *frame_no += 1;
    *byte_offset +=
        i64::try_from(bytes.len()).map_err(|_| "captured frame is too large".to_string())?;
    Ok(())
}

fn main() -> Result<(), String> {
    let config = Config::from_env()?;
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("create storage runtime: {e}"))?;
    let storage = runtime
        .block_on(Storage::from_runtime_env())
        .map_err(|e| format!("open envctl-bound PostgreSQL runtime: {e}"))?;
    let cognitum_url = config.cognitum_url.clone();
    let cognitum = CognitumClient::<ReqwestTransport>::from_env().map_err(|e| {
        format!(
            "Cognitum handshake failed for {cognitum_url}: {e}; set LIFEOS_COGNITUM_URL to the device MCP URL"
        )
    })?;

    let mut mqtt_options =
        MqttOptions::new(&config.mqtt_client_id, &config.mqtt_host, config.mqtt_port);
    mqtt_options.set_keep_alive(Duration::from_secs(30));
    let status_topic = format!("{}/{}/status", config.topic_prefix, config.device_id);
    mqtt_options.set_last_will(LastWill::new(
        status_topic.clone(),
        r#"{"status":"offline"}"#,
        QoS::AtLeastOnce,
        true,
    ));
    let (mqtt, mut connection) = Client::new(mqtt_options, 32);
    thread::spawn(move || {
        for event in connection.iter() {
            if let Err(error) = event {
                eprintln!("lifeos-daemon MQTT connection: {error}");
                break;
            }
        }
    });

    mqtt.publish(
        &status_topic,
        QoS::AtLeastOnce,
        true,
        json!({"status":"online", "device_id": config.device_id, "at_ms": now_unix_ms()})
            .to_string(),
    )
    .map_err(|e| format!("publish online status: {e}"))?;

    let sensor_topic = format!("{}/{}/snapshot", config.topic_prefix, config.device_id);
    let mut stdout_frame_no = 0_i64;
    let mut stdout_offset = 0_i64;
    let mut stderr_frame_no = 0_i64;
    let mut stderr_offset = 0_i64;
    loop {
        match cognitum.sensor_snapshot() {
            Ok(snapshot) => {
                let captured_at_ms = now_unix_ms();
                capture(
                    &runtime,
                    &storage,
                    config.execution_id,
                    "stdout",
                    &mut stdout_frame_no,
                    &mut stdout_offset,
                    snapshot.wire_bytes(),
                    json!({
                        "schema_version": "lifeos.daemon.sensor-frame.v1",
                        "device_id": config.device_id,
                        "source": "cognitum.sensor_snapshot",
                        "captured_at_ms": captured_at_ms,
                        "content_type": "application/json-or-sse",
                    }),
                )?;
                let payload = json!({
                    "device_id": config.device_id,
                    "captured_at_ms": captured_at_ms,
                    "snapshot": snapshot.raw(),
                });
                if let Err(error) =
                    mqtt.publish(&sensor_topic, QoS::AtLeastOnce, true, payload.to_string())
                {
                    eprintln!("lifeos-daemon sensor publish: {error}");
                }
            }
            Err(error) => {
                let error_bytes = error.to_string().into_bytes();
                capture(
                    &runtime,
                    &storage,
                    config.execution_id,
                    "stderr",
                    &mut stderr_frame_no,
                    &mut stderr_offset,
                    &error_bytes,
                    json!({
                        "schema_version": "lifeos.daemon.sensor-error.v1",
                        "device_id": config.device_id,
                        "source": "cognitum.sensor_snapshot",
                        "captured_at_ms": now_unix_ms(),
                    }),
                )?;
                eprintln!("lifeos-daemon sensor read: {error}");
            }
        }
        thread::sleep(config.poll_interval);
    }
}
