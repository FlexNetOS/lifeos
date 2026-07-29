# lifeos-daemon

Headless LifeOS node. Runs on a Raspberry Pi Zero 2 W or Pi 3 (Pi OS 64-bit / Ubuntu 24.04 arm64) with no GUI and no Tauri shell. It bridges Cognitum-Seed sensor frames into MQTT so the desktop LifeOS app and other network consumers can receive them without sitting on the same wire as the appliance.

## Status

The daemon is an envctl-authorized Cognitum-Seed → PostgreSQL/RuVector → MQTT
bridge. It refuses to start without a database-issued execution context. Every
sensor response is captured as its exact wire bytes through
`lifeos_runtime.append_log_frame` before the derived MQTT payload is published;
read failures are captured on the stderr stream. MQTT's last-will record
publishes retained offline status when the process disappears.

## Purpose

- Live on small SBCs (Pi Zero 2 W, Pi 3, anything `aarch64-unknown-linux-gnu`) that can't host the full Tauri app.
- Poll `lifeos_core::mcp::cognitum::CognitumClient::sensor_snapshot()`, capture the exact response through the database runtime, and forward the derived frame over MQTT.
- Stay headless: no GUI deps, no `gtk`, no `webkit2gtk`, no `librsvg`.
- Stay pure-Rust at the dependency graph level. **No `openssl-sys`.** Rustls only when TLS is needed.

## Dependency posture

`lifeos-core` is pulled with `default-features = false` and explicitly enables
the `mcp-http` feature. The daemon uses `reqwest` with rustls for the Seed REST
mirror and `rumqttc` with its pure-Rust TLS feature set.

The bridge uses [`rumqttc`](https://crates.io/crates/rumqttc) with its
`use-rustls` feature. Avoid `paho-mqtt` (C bindings, drags `openssl-sys`).

## Cross-compile setup

The target is `aarch64-unknown-linux-gnu` — Pi Zero 2 W (Cortex-A53), Pi 3 (Cortex-A53), Pi 4 (Cortex-A72), Pi 5 (Cortex-A76). The Pi Zero 1 / Pi 1 are armv6 (`arm-unknown-linux-gnueabihf`) and out of scope.

### Option A — rustup + Debian cross-gcc

```bash
rustup target add aarch64-unknown-linux-gnu
# `cargo check` does not link, so the host gcc is enough for that command.
# `cargo build` needs the cross linker:
sudo apt install gcc-aarch64-linux-gnu        # provides aarch64-linux-gnu-gcc
cargo check -p lifeos-daemon --target aarch64-unknown-linux-gnu
cargo build -p lifeos-daemon --target aarch64-unknown-linux-gnu --release
```

The crate-local `.cargo/config.toml` already pins the cross target's linker to `aarch64-linux-gnu-gcc`, so once the apt package is installed `cargo build` finds it without extra env vars.

### Option B — `cross` (containerised, no apt required)

```bash
cargo install cross --locked
cross build -p lifeos-daemon --target aarch64-unknown-linux-gnu --release
```

`cross` ships its own toolchain image; useful when the host can't install Debian cross packages.

## Acceptance commands

These commands cover the production binary and its cross-target dependency closure:

```bash
cargo check --workspace                                             # native, full workspace
cargo run -p lifeos-daemon                                          # requires envctl runtime context + live Cognitum/MQTT
rustup target add aarch64-unknown-linux-gnu                         # additive, idempotent
cargo check -p lifeos-daemon --target aarch64-unknown-linux-gnu     # cross check (no link)
```

`cargo build --target aarch64-unknown-linux-gnu` will fail until `gcc-aarch64-linux-gnu` is installed on the host — that's a deliberate trade. `cargo check` is the contract for the scaffold.

## Configuration

Environment variables are the database/envctl-generated projection boundary:

| Variable | Default |
|---|---|
| `LIFEOS_COGNITUM_URL` | `http://169.254.42.1/mcp` |
| `LIFEOS_MQTT_URL` | `mqtt://127.0.0.1:1883` |
| `LIFEOS_MQTT_CLIENT_ID` | `lifeos-daemon-$HOSTNAME` |
| `LIFEOS_DEVICE_ID` | `$HOSTNAME` or `lifeos-node` |
| `LIFEOS_MQTT_TOPIC_PREFIX` | `lifeos/sensor` |
| `LIFEOS_SENSOR_POLL_SECONDS` | `5` |
| `LIFEOS_DATABASE_URL` | envctl-issued PostgreSQL/RuVector URL (required) |
| `LIFEOS_RUNTIME_EXECUTION_ID` | database-issued running execution UUID (required) |
| `LIFEOS_RUNTIME_TENANT_ID` | envctl runtime context (required) |
| `LIFEOS_RUNTIME_IDENTITY_ID` | envctl runtime context (required) |
| `LIFEOS_RUNTIME_GRANT_ID` | envctl runtime context (required) |
| `LIFEOS_RUNTIME_BINDING_JSON` | envctl runtime context (required) |

The bridge publishes `<prefix>/<device-id>/status` and
`<prefix>/<device-id>/snapshot` with QoS 1 and retained payloads. `mqtts://`
is rejected until the deployment supplies an explicit TLS transport policy;
the HTTP Cognitum path already uses rustls.

## What this crate explicitly is NOT

- Not a replacement for the Tauri shell. The desktop app stays the user-facing surface; the daemon is a network peer.
- Not a Cognitum reimplementation. It only consumes Cognitum's REST/MCP surface.
- Not a generic MQTT bridge. The schema is LifeOS-specific; topic shape and payload follow `lifeos_core::types`.
