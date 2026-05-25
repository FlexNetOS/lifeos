# lifeos-daemon

Headless LifeOS node. Runs on a Raspberry Pi Zero 2 W or Pi 3 (Pi OS 64-bit / Ubuntu 24.04 arm64) with no GUI and no Tauri shell — just a Rust bin that will eventually bridge Cognitum-Seed sensor frames into an MQTT broker so the desktop LifeOS app (and anything else on the network) can consume them without sitting on the same wire as the appliance.

## Status (Wave 3 scaffold)

This is a **scaffold**. `main()` prints a banner and exits cleanly. The sensor → MQTT bridge body is a `TODO` — see `src/main.rs`. The crate exists so the workspace can already cross-compile to `aarch64-unknown-linux-gnu`; that lets later waves grow the bridge without having to relitigate workspace topology, dependency posture, or target setup.

## Purpose

- Live on small SBCs (Pi Zero 2 W, Pi 3, anything `aarch64-unknown-linux-gnu`) that can't host the full Tauri app.
- Poll `lifeos_core::mcp::cognitum::CognitumClient::sensor_snapshot()` and forward frames over MQTT (subject TBD — likely `lifeos/sensor/<device-id>`).
- Stay headless: no GUI deps, no `gtk`, no `webkit2gtk`, no `librsvg`.
- Stay pure-Rust at the dependency graph level. **No `openssl-sys`.** Rustls only when TLS is needed.

## Dependency posture

`lifeos-core` is pulled with `default-features = false`. That strips the optional `reqwest`-backed `mcp-http` transport from this crate's resolution graph. The scaffold's `main()` only needs the `VERSION` constant and the `CognitumClient<T>` type signatures, both of which compile without the HTTP transport. A later wave that wires a real read loop will flip `default-features` back on (or add a feature-forwarding pass-through) at the same time the MQTT client lands.

When MQTT lands: prefer [`rumqttc`](https://crates.io/crates/rumqttc) with its `use-rustls` feature. Avoid `paho-mqtt` (C bindings, drags `openssl-sys`).

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

## Acceptance command transcript (Wave 3)

These are the four commands that proved the scaffold:

```bash
cargo check --workspace                                             # native, full workspace
cargo run -p lifeos-daemon                                          # banner + clean exit
rustup target add aarch64-unknown-linux-gnu                         # additive, idempotent
cargo check -p lifeos-daemon --target aarch64-unknown-linux-gnu     # cross check (no link)
```

`cargo build --target aarch64-unknown-linux-gnu` will fail until `gcc-aarch64-linux-gnu` is installed on the host — that's a deliberate trade. `cargo check` is the contract for the scaffold.

## Wave 4+ roadmap

In rough order of dependency:

1. **MQTT client wiring.** `rumqttc` with `use-rustls`, configurable broker URL, last-will, retained sensor topics.
2. **Re-enable `lifeos-core` HTTP transport.** Either default-features back on, or add a `mcp-http` feature on this crate that forwards to `lifeos-core/mcp-http`.
3. **Config file.** TOML at `/etc/lifeos/daemon.toml` (system) or `$XDG_CONFIG_HOME/lifeos/daemon.toml` (user). Fields: Cognitum URL, MQTT broker URL, poll interval, device-id, topic prefix.
4. **Async runtime + signal handling.** `tokio` with rt-multi-thread, `tokio::signal::ctrl_c()` + SIGTERM for graceful shutdown that flushes the MQTT outbound queue.
5. **Backoff + retry.** Exponential backoff on Cognitum read failures; MQTT auto-reconnect (rumqttc handles its side).
6. **`systemd` unit.** Drop-in service file in `dist/systemd/` plus install docs.
7. **Observability.** Structured logs to stdout (journald-friendly), optional metrics endpoint.

## What this crate explicitly is NOT

- Not a replacement for the Tauri shell. The desktop app stays the user-facing surface; the daemon is a network peer.
- Not a Cognitum reimplementation. It only consumes Cognitum's REST/MCP surface.
- Not a generic MQTT bridge. The schema is LifeOS-specific; topic shape and payload follow `lifeos_core::types`.
