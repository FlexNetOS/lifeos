# LifeOS ESP32-C6 Firmware

Bare-metal `no_std` Rust firmware for the ESP32-C6 sensor/actuator endpoint.

## Why this exists

From the LifeOS cross-platform foundation plan:

> ESP32 is a sensor endpoint, not an app endpoint. The firmware is a separate
> small Rust project under `firmware/esp32/`. It speaks MQTT/CoAP back to the
> workstation. `lifeos-core`'s portable `#![no_std]` types + serialization
> reuses message formats across both the workstation and the firmware.

Concretely: the ESP32-C6 reads physical sensors (BME280, PIR, reed switches,
ADC channels), packages the readings, and publishes them over MQTT or CoAP to
the LifeOS workstation. It does **not** run a WebView, a Vue app, or any
business logic from `lifeos-core` — those live on the workstation. The
firmware is a thin, reliable sensor bridge.

## Why it is a separate Cargo project (not a workspace member)

The `ubuntu-lifeos` root will become a Cargo workspace in TODO item 1a.
Mixing `no_std` firmware crates and `std` workspace members complicates
Cargo's feature resolver: `std` features can bleed into `no_std` deps
through shared transitive dependencies, breaking the `no_std` build silently.

Keeping `firmware/esp32/` self-contained:
- guarantees `cargo check` always targets `riscv32imac-unknown-none-elf`
- prevents accidental `std` contamination
- lets the firmware use a pinned `rust-toolchain.toml` without affecting
  the rest of the workspace

When TODO 1a lands, revisit whether a `[workspace.exclude]` entry is
sufficient or whether the standalone layout should be preserved permanently.

## Why ESP32-C6 specifically

- **Stable Rust toolchain** — RISC-V (`riscv32imac-unknown-none-elf`) works
  with `rustc stable`. Xtensa variants (original ESP32, S2, S3) require the
  `+esp` toolchain installed via `espup`, which is not on this host.
- **WiFi 6 (802.11ax) + Bluetooth LE 5.3** — suitable for home-automation
  sensor nodes that need both protocols.
- **Currently in-stock** — widely available from Espressif and distributors
  as of 2025/2026.
- **esp-hal 1.x first-class support** — `esp32c6` feature is fully supported
  in `esp-hal` 1.1.1 + `esp-rtos` 0.3.0.

## Dependency versions pinned

| Crate | Version | Role |
|---|---|---|
| `esp-hal` | 1.1.1 | Bare-metal HAL for ESP32-C6 |
| `esp-rtos` | 0.3.0 | Embassy executor + time driver integration |
| `esp-bootloader-esp-idf` | 0.5.0 | App descriptor macro (`esp_app_desc!`) |
| `esp-backtrace` | 0.19.0 | Panic handler + optional backtrace |
| `esp-println` | 0.17.0 | `print!`/`println!` over UART/JTAG |
| `embassy-executor` | 0.10.0 | Async task executor |
| `embassy-time` | 0.5.0 | Async timers (`Timer::after`) |

Note: `esp-hal-embassy` (0.9.1) is the **older** 0.x-era companion crate.
The 1.x family uses `esp-rtos` instead. Do not add `esp-hal-embassy` to this
project.

`esp-hal` 1.1.1 requires `rustc >= 1.88.0`. The `rust-toolchain.toml` pins
to `stable`, which resolves to 1.95.0 on this host — compatible.

The `unstable` feature is explicitly enabled on `esp-hal`. This is required
because `esp-rtos` internally uses `esp-hal` unstable APIs and enables the
`requires-unstable` sentinel feature. The build script enforces that if
`requires-unstable` is set, `unstable` must also be opt-in from the end-user
crate. This is intentional: esp-hal signals "you are using internal APIs;
acknowledge it explicitly."

## Build

### Prerequisites (one-time, already done on this host)

```bash
rustup target add riscv32imac-unknown-none-elf
```

The `rust-toolchain.toml` declares this target, so a fresh checkout will
trigger rustup to install it automatically on first build.

### Check (no hardware needed)

```bash
cd firmware/esp32
cargo check
# or explicitly:
cargo check --target riscv32imac-unknown-none-elf
```

Expected output: `Finished 'dev' profile` with zero errors.

### Build a binary

```bash
cargo build --release
```

The output ELF is at `target/riscv32imac-unknown-none-elf/release/lifeos-esp32`.

### Flash to hardware

Requires `espflash` (not installed on the build host — install separately):

```bash
cargo install espflash
cargo run --release          # builds then calls espflash via .cargo/config.toml runner
# or directly:
espflash flash --monitor target/riscv32imac-unknown-none-elf/release/lifeos-esp32
```

### Debug with probe-rs

```bash
cargo install probe-rs-tools
probe-rs run --chip ESP32-C6 target/riscv32imac-unknown-none-elf/debug/lifeos-esp32
```

## Lua on ESP32

**Not viable.** `mlua` requires `std` and a C runtime. Even on the heavier
`esp-idf-hal` (`std`-via-ESP-IDF) path, the ~256–520 KB ESP32-C6 RAM ceiling
makes a full Lua VM impractical. Use `mlua` with the `luau` feature on
workstation/mobile/Pi where `std` is available. NodeMCU is the proven
Lua-on-ESP32 path, but it is a different firmware entirely — not an embedded
scripting layer within a Rust app.

## What comes next (not in this placeholder)

- [ ] BME280 / AHT20 temperature+humidity driver (`embedded-hal` traits)
- [ ] PIR motion sensor interrupt handler
- [ ] WiFi station mode initialization (`esp-wifi` crate)
- [ ] MQTT client (`rust-mqtt` or `embedded-mqtt`)
- [ ] `lifeos-core` shared message types for sensor payloads (zero-copy,
      `serde` + `postcard`)
- [ ] OTA update stub (esp-hal storage layer)
