//! Headless Cognitum-Seed → MQTT bridge for small LifeOS nodes.

use lifeos_core::mcp::cognitum::CognitumClient;
use lifeos_core::mcp::ReqwestTransport;
use rumqttc::{Client, LastWill, MqttOptions, QoS};
use serde_json::json;
use std::env;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
struct Config {
    cognitum_url: String,
    mqtt_host: String,
    mqtt_port: u16,
    mqtt_client_id: String,
    device_id: String,
    topic_prefix: String,
    poll_interval: Duration,
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

fn main() -> Result<(), String> {
    let config = Config::from_env()?;
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
    let (mut mqtt, mut connection) = Client::new(mqtt_options, 32);
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
    loop {
        match cognitum.sensor_snapshot() {
            Ok(snapshot) => {
                let payload = json!({
                    "device_id": config.device_id,
                    "captured_at_ms": now_unix_ms(),
                    "snapshot": snapshot.raw(),
                });
                if let Err(error) =
                    mqtt.publish(&sensor_topic, QoS::AtLeastOnce, true, payload.to_string())
                {
                    eprintln!("lifeos-daemon sensor publish: {error}");
                }
            }
            Err(error) => eprintln!("lifeos-daemon sensor read: {error}"),
        }
        thread::sleep(config.poll_interval);
    }
}
