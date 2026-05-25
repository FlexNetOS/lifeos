//! LifeOS ESP32-C6 firmware — minimal Embassy placeholder.
//!
//! This is the sensor/actuator endpoint stub for the LifeOS distributed system.
//! The chip speaks MQTT/CoAP back to the LifeOS workstation; it does NOT run
//! a WebView or any application logic that belongs in lifeos-core.
//!
//! Build: `cd firmware/esp32 && cargo check`
//! Flash: `cargo run --release` (requires espflash installed on host)

#![no_std]
#![no_main]

use embassy_executor::Spawner;
use embassy_time::{Duration, Timer};
use esp_backtrace as _;

// Embed the app descriptor required by the esp-idf bootloader.
esp_bootloader_esp_idf::esp_app_desc!();

/// Background task: heartbeat loop. Replace with sensor-read / MQTT publish logic.
#[embassy_executor::task]
async fn heartbeat() {
    loop {
        // Placeholder: future home of sensor read + MQTT/CoAP publish.
        Timer::after(Duration::from_millis(1_000)).await;
    }
}

/// Entry point. Initializes the HAL, starts the Embassy scheduler, then loops.
/// Note: async Embassy main requires `#[esp_rtos::main]`, not `#[esp_hal::main]`.
#[esp_rtos::main]
async fn main(spawner: Spawner) {
    // Initialize the HAL with default clock/power settings.
    let _peripherals = esp_hal::init(esp_hal::Config::default());

    // Spawn the heartbeat task.
    spawner.spawn(heartbeat().unwrap());

    // Main task: placeholder spin loop. Future home of CoAP/MQTT client init.
    loop {
        Timer::after(Duration::from_millis(5_000)).await;
    }
}
