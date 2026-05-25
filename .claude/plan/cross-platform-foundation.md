# Cross-Platform Foundation Verification

**Date:** 2026-05-25
**Question (verbatim from user):** *"Verify we are building the right foundation for cross-platform use (e.g., iOS, Android, macOS, Win11, Linux, Pi, ESP32) — not all platforms will hold all features; this is my main workstation that will act as the main app or server; all logins connected via distributed compute; look at Cognitum and RuVector, Exo; I want Rust because it is fast; speed and accuracy are key; Lua is also a good language to embed the app anywhere."*

This document is a **verified recommendation**, not an implementation commit. It pairs primary-source facts with a layered architecture proposal and concrete TODO entries.

---

## TL;DR

**Vue 3 + Tauri 2 is the right *shell* for the workstation, but it is not the *foundation* for the full target list.** ESP32 (no OS, no WebView) and to a lesser degree Pi Zero/3 (RAM-starved for webkit2gtk) cannot host the current app as-is. The honest reframing is:

> **`lifeos-core` (portable Rust crate) + multiple thin shells + `mlua` plugin layer where `std` is available.**

The current repo already has the right *primitives* in place (Tauri 2, `reqwest`/`rustls`, `keyring`, `argon2`, `sysinfo`) — the structural change is to extract domain logic from the Tauri shell into a reusable core crate so the Pi headless daemon and ESP32 firmware can share types, sync protocols, and the MCP client surface.

---

## Verified primary-source facts

### Tauri 2 platform matrix (verified via tauri.app docs)
| Target | Status | Notes |
|---|---|---|
| Linux desktop (webkit2gtk-4.1) | Stable | Current repo target. webkit2gtk has post-2.40 perf regressions but workable. |
| macOS desktop (WKWebView) | Stable | |
| Windows 11 desktop (WebView2) | Stable | WebView2 pre-installed on Win11. |
| iOS (WKWebView) | Stable since 2.0 | Runtime is stable; **plugin parity is uneven** (FS scope behaves differently inside the iOS sandbox; `tauri-plugin-shell` semantics change; tray/menu/global shortcuts absent entirely). Verify per-plugin before promising a feature. |
| Android (system WebView) | Stable since 2.0 | Same caveats. WebView version varies wildly by device (Chromium 90 on cheap hardware vs current on flagships) — test on a low-end target. |
| Raspberry Pi 4 / 5 (Linux aarch64) | Community-verified | `libwebkit2gtk-4.1-dev:arm64` available; cross-compile docs from Mar 2025. |
| Raspberry Pi Zero 2 W / Pi 3 | **Marginal** | 512 MB RAM + webkit2gtk = impractical for the full UI. Headless daemon path preferred. |
| Raspberry Pi Pico (RP2040) | **Not supported** | Microcontroller, no OS. Same category as ESP32. |
| ESP32 / ESP32-S3 / ESP32-C6 etc. | **Not supported, ever** | No WebView, no OS in `no_std` mode. Tauri requires a host OS. |

### ESP32 reality (verified via esp-rs repos)
- **esp-hal** (`no_std`, Espressif-recommended): covers ESP32, ESP32-S2/S3, ESP32-C2/C3/C5/C6/C61, ESP32-H2, ESP32-P4. Async via **Embassy**.
- **esp-idf-hal** (`std`-via-ESP-IDF): community-maintained C-wrapper. Espressif now steers new projects toward `esp-hal`.
- **Lua on ESP32 via Rust (`mlua`): not viable.** `mlua` requires `std` + a C runtime (links against Lua C). Even on `esp-idf-hal` this is unverified territory; the ~256–520 KB ESP32 RAM ceiling makes a full Lua VM impractical.
- **Proven Lua-on-ESP32 path is NodeMCU**, a separate Lua 5.1 C firmware. Not a Rust-app-embedded scripting layer — a different firmware entirely.

### Lua embedding in Rust (verified via mlua docs.rs)
- `mlua` supports Lua 5.1 / 5.2 / 5.3 / 5.4 / 5.5 / LuaJIT / **Luau**.
- Key features: `serde`, `async`, `send`, `vendored` (no system Lua needed), `luau` (Roblox's safer Lua dialect).
- Works on x86_64, aarch64, WASM (`wasm32-unknown-emscripten`).
- **Standard answer** for "embed a scripting language in a Rust app for plugins" on platforms with `std`. Use **Luau** if scripts are user-authored — it sandboxes by design.

### Exo (verified via github.com/exo-explore/exo README)
- **What it is:** Distributed AI inference across heterogeneous personal devices (peer-to-peer, automatic discovery, tensor-parallel model sharding).
- **Stack:** Primary implementation language is **Python**. Svelte UI for the optional web admin, Swift for the macOS-native app, small TypeScript and Rust slivers. Treat it as a Python service, not a polyglot runtime.
- **Platforms:** macOS (primary, dedicated app for Tahoe 26.2+), Linux (CPU-only; GPU support WIP). **iOS, Android, Pi, ESP32 are out of scope or unverified.**
- **Inference only.** No training.
- **Fit for "all logins do distributed compute":** Workable for desktop/laptop fleet. Pi 4/5 Linux nodes *might* participate as CPU-only (untested). Mobile and microcontrollers are not in the model.

### Cognitum-Seed (verified via live MCP calls in this session)
- **`device_id`**: `0e34a5e5-…` (UUID, persistent).
- **Hardware**: A/B firmware slots at `/dev/mmcblk0p2` / `/dev/mmcblk0p3` (SD-card root = **Pi-class SBC**). `freq_mhz: 1000`, thermal zone "Cool" at 35.4°C — consistent with Pi Zero 2 W or Pi 3 class.
- **Roles**: `custody`, `optimizer`, `delivery`.
- **Vector store**: 9044 vectors × **dimension 8** (this is sparse feature space, not LLM embeddings — likely sensor fusion / state vectors).
- **Witness chain**: 20,558 entries (cryptographic attestation log — tamper-evident audit trail).
- **Sensors live on the device**: reed switch (door/window contact), PIR motion, vibration, ADS1115 (4-channel I²C ADC), BME280 (temp/humidity/pressure). 10 total channels.
- **Paired clients**: 3 (already federated).
- **Firmware version**: `0.21.11` — actively maintained.

**Implication: Cognitum already exists as a physical custody+sensor appliance with its own OTA path.** LifeOS should **consume** it via MCP (read sensors, query the dim-8 vector store, follow the witness chain for attestation) — **not reimplement it inside the Tauri app.**

### RuVector (verified via live MCP probe)
- **Surface**: `vector_db_create/insert/search/stats/backup`, `gnn_layer_create/forward/batch_forward/search`, `gnn_compress/decompress`, `gnn_cache_stats`.
- **What it is**: Rust-native vector DB + Graph Neural Network inference engine with model compression. MCP-accessible.
- **Embeddable form factor**: Likely a Rust crate behind the MCP server. Worth confirming whether the underlying crate is `no_std`-capable before assuming ESP32 reuse.

---

## The honest verdict on the current foundation

| Aspect | Current state | Verdict |
|---|---|---|
| Workstation as "main app or server" (the user's stated primary node) | Vue 3 + Tauri 2 desktop on Linux/macOS/Win11 | ✅ **Correct shell.** Keep as-is. |
| iOS / Android shells | None — no `tauri-plugin-mobile-*`, no `iOS`/`android` bundle targets, no `.cargo/config.toml` mobile targets | ⚠️ **Possible but not wired.** Tauri 2 mobile is stable; missing config + native plugin work + UX adaptation for no-tray/no-menu mobile. |
| Pi 4 / 5 (full UI) | Not targeted explicitly, would need cross-compile setup | ✅ **Doable** with cross-compile recipe + arm64 webkit2gtk. |
| Pi Zero / 3 / headless | None | ⚠️ **Wrong tool.** Needs a headless Rust daemon, not the Tauri+webview app. |
| ESP32 endpoints | None | ❌ **Architecturally impossible from Vue/Tauri.** Needs a separate `no_std` Rust firmware (`esp-hal` + Embassy). |
| Rust core reusable across shells | Logic lives in `src-tauri/src/lib.rs` (~15 KB) + `auth.rs` (~8 KB) — **tightly coupled to Tauri** | ⚠️ **Refactor needed.** Domain logic must move out of `src-tauri/` into a separate `lifeos-core` crate. |
| Lua plugin embedding | None | ⚠️ **Easy to add via `mlua`** on workstation/mobile/Pi. **Not viable on ESP32.** |
| Distributed compute | None | ⚠️ **No layer exists.** Exo covers desktop fleet only; mobile/Pi/ESP32 need a separate coordination protocol. |
| Cognitum integration | None — no MCP client, no sensor consumer code | ⚠️ **Missing.** Cognitum already runs and has 3 clients; LifeOS is not yet one of them. |
| RuVector integration | None | ⚠️ **Missing.** Same as above. |

---

## Proposed layered architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LIFEOS PLUGIN LAYER (Lua / Luau via mlua)          │
│         (workstation, mobile, Pi 4/5 — anywhere std is available)       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────┐
│                          lifeos-core  (Rust crate)                      │
│  ─ domain types  ─ sync protocols  ─ account/auth (Argon2)              │
│  ─ MCP client (Cognitum + RuVector)  ─ distributed RPC                  │
│  ─ portable subset compiles with no_std features for ESP32 reuse        │
└──┬──────────────┬────────────────────┬──────────────────┬───────────────┘
   │              │                    │                  │
┌──▼────┐  ┌──────▼────────┐  ┌────────▼────────┐  ┌──────▼──────────┐
│Tauri 2│  │ Tauri 2 Mobile│  │ Headless Rust   │  │ no_std firmware │
│Desktop│  │ iOS / Android │  │ daemon (Pi Zero/│  │ esp-hal + Embas-│
│ Vue 3 │  │   Vue 3       │  │ 3, Linux servers│  │ sy (ESP32 nodes)│
│       │  │               │  │ — Exo + custody │  │ — sensors, MQTT │
└───────┘  └───────────────┘  └─────────────────┘  └─────────────────┘
                                                          │
                                                   ┌──────▼────────┐
                                                   │ NodeMCU/Lua C │
                                                   │ (legacy ESP32 │
                                                   │  if needed)   │
                                                   └───────────────┘

External services consumed via MCP from any node with std:
  • Cognitum-Seed (custody / optimizer / delivery — already running on a Pi)
  • RuVector (vector DB + GNN inference)
  • Exo (distributed inference for the desktop/laptop fleet)
```

### Why this shape (not just "more Rust")

1. **The workstation stays the workstation.** Tauri+Vue is the user's stated "main app." It doesn't move.
2. **`lifeos-core` is the actual foundation.** Once domain logic is in a crate, *every* shell consumes the same types, sync protocols, and MCP clients. New platform = new shell, not a rewrite.
3. **ESP32 is a sensor endpoint, not an app endpoint.** Acknowledging this avoids a rabbit-hole. The portable subset of `lifeos-core` (`#![no_std]` types + serialization) reuses message formats; the ESP32 firmware is a separate small Rust project under `firmware/esp32/`.
4. **Lua plugins are an extension layer, not a portability layer.** Use Lua for user-authored automation rules across workstation/mobile/Pi (where `mlua` works). Don't try to make Lua run on ESP32 to "make Lua portable" — NodeMCU exists for that and is its own firmware.
5. **Distributed compute is heterogeneous, not uniform.** Exo for inference among desktop nodes. Custom MCP/MQTT for sensor + custody federation with Cognitum. Pi nodes can act as both Exo CPU workers and Cognitum bridges.

### Feature reach matrix (user's "not all platforms hold all features")

| Feature | Workstation | macOS/Win11 | iOS/Android | Pi 4/5 UI | Pi Zero daemon | ESP32 |
|---|---|---|---|---|---|---|
| Vue UI / Tauri shell | ✅ | ✅ | ✅ (no tray) | ✅ (cross-compile) | — | — |
| Lua plugins (`mlua`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| MCP clients (Cognitum / RuVector) | ✅ | ✅ | ✅ | ✅ | ✅ | partial (raw msgs only) |
| Exo participant | ✅ | ✅ | ❌ | ✅ (CPU) | ⚠️ unverified | ❌ |
| Sensor ingestion (BME280, PIR, …) | via Cognitum | via Cognitum | via Cognitum | direct GPIO possible | direct GPIO | ✅ direct |
| Custody / witness chain client | ✅ | ✅ | ✅ | ✅ | ✅ | partial |
| Account login (Argon2) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## Risks and tradeoffs surfaced

1. **Refactor cost.** Moving logic from `src-tauri/src/lib.rs` into a `lifeos-core` crate is mechanical but touches every existing `invoke()` call site in the Vue layer. Stage 1 should be a *parallel* crate (the Tauri shell can re-export from it without immediately deleting the inline impls).
2. **Tauri Mobile feature parity is moving.** Don't promise mobile until Tauri 2.x has shipped the specific plugins you need (fs scope behavior on iOS sandbox is the usual surprise).
3. **Exo is Python-first.** Embedding Exo in a Rust app means RPC across processes, not in-process linking. Plan for a separate Exo daemon and IPC.
4. **Cognitum already has 3 paired clients.** Pairing LifeOS with it requires going through the pairing-window protocol (`seed_pair_clients`) — that is a *deliberate user action*, not background magic.
5. **Lua plugin sandbox.** If plugins can come from third parties, use `mlua` with the `luau` feature (Roblox's Luau is designed for sandboxing). Stock Lua 5.4 lets scripts call `os.execute()` unless you strip the standard library.
6. **`tauri-plugin-shell` is in the Cargo.toml.** That's fine on desktop but means *any* renderer code can spawn shells if the capability is granted — audit `capabilities/*.json` before mobile builds where the threat model is different.
7. **Witness chain trust.** Anything LifeOS shows from Cognitum should label it as "attested by device-id …" so the user knows when state is sensor-grounded vs derived.
8. **Item migration.** The Pinia-persisted whitelist (`activeId`, `wsCollapsed`, …) is currently shell-local. Distributed identity needs an account-keyed sync model — that's a `lifeos-core` problem, not a shell problem. Also note the **`.ts`/`.js` sibling contract** in `src/lib/persistence.{ts,js}` (per CLAUDE.md / AGENTS.md): any change to the whitelist or sync model must land in both files until the preview path is retired.

9. **Cognitum dim-8 is NOT an LLM embedding store.** The live device reports `dimension: 8` — that is a sparse feature / state-vector space (sensor fusion, occupancy state, etc.), not the 768–3072-dim space LLM embeddings live in. **RuVector owns semantic retrieval; Cognitum owns custody + attested sensor state.** Do not paper over this by reshaping LLM vectors into Cognitum — it would invalidate the witness chain's data model.

10. **Tauri capability surface is present-tense work, not future work.** `src-tauri/capabilities/default.json` already grants `shell:default` + `shell:allow-open` to the main window. That is desktop-acceptable, but **mobile builds must NOT inherit this capability set unchanged** — the threat model on iOS/Android is different (any compromised webview content can request `shell` if granted). Audit and split capabilities by platform *before* the first mobile build, not after.

---

## Recommended next actions (mapped to TODO.md entries)

These are deliberately *small, verifiable* steps. None require a Vue rewrite.

1. **`lifeos-core` crate scaffold** — Stage-gated split so no single item swallows a session:
   - **1a. Workspace member** — Convert `src-tauri/Cargo.toml` to a Cargo workspace; add empty `crates/lifeos-core/` member with `lib.rs` returning `pub const VERSION: &str = "0.1.0";`. Acceptance: `cargo check -p lifeos-core` passes, `bun test` still green, `bun run tauri:dev` still boots.
   - **1b. Pure types** — Move `Workspace`, `Section`, `Item`, `AiMessage`, `AiProvider` structs into `lifeos-core::types`. No behavior. Tauri shell imports them. Acceptance: `cargo check` + `bun test` green.
   - **1c. Auth move** — Lift `src-tauri/src/auth.rs` (Argon2id) into `lifeos-core::auth`. Tauri shell keeps a thin `#[tauri::command]` wrapper that calls into the core (Tauri commands cannot be re-exported across crates — they must be declared in the shell). Acceptance: existing auth specs still pass.
   - **1d. MCP module stubs** — Add `lifeos-core::mcp::{cognitum, ruvector}` with empty client structs + a `connect()` returning `Result<Self, Error>`. No real wire calls yet. Acceptance: `cargo check -p lifeos-core` passes.

2. **Cognitum MCP client (read-only)** — In `lifeos-core/mcp/cognitum.rs`, wrap the read-only tools (`seed_device_status`, `seed_sensor_list`, `seed_thermal_state`, `seed_cognitive_status`, `seed_memory_query`). No pairing, no writes. Acceptance: a smoke test that connects to a running cognitum-seed MCP and prints device_id + sensor count.

3. **RuVector MCP client (read-only)** — Same shape as Cognitum. `vector_db_stats`, `gnn_cache_stats`. Acceptance: smoke test prints stats.

4. **Tauri Mobile readiness audit (no migration yet)** — Run `cargo tauri info` and document gaps (signing identities, FS scope behavior on iOS sandbox, plugin parity). Output: `.claude/plan/tauri-mobile-readiness.md`. Acceptance: a concrete go/no-go list, not a vague "looks fine."

5. **ESP32 firmware sibling project (placeholder)** — Create `firmware/esp32/` as an empty Cargo project pinned to `esp-hal` + `embassy-executor`. README explains why it's separate (no_std) and what it will do (sensor + actuator endpoint, MQTT/CoAP back to the workstation). **Pick one target chip first** — target triples differ by silicon family:
   - Original ESP32 (Xtensa LX6) → `xtensa-esp32-none-elf` *(needs `+esp` toolchain via `espup`)*
   - ESP32-S2 / S3 (Xtensa LX7) → `xtensa-esp32s2-none-elf` / `xtensa-esp32s3-none-elf` *(needs `+esp`)*
   - ESP32-C2 / C3 (RISC-V) → `riscv32imc-unknown-none-elf` *(stable Rust, no `+esp`)*
   - ESP32-C6 / H2 / C61 (RISC-V) → `riscv32imac-unknown-none-elf` *(stable Rust, no `+esp`)*

   Acceptance: a single target builds an empty `main()` binary. Default recommendation is **ESP32-C6** (RISC-V, stable Rust toolchain, WiFi 6 + Bluetooth LE, currently in-stock).

6. **Lua plugin host spike** — Add `mlua` (feature `luau`, `async`, `vendored`) behind a feature flag in `lifeos-core`. Spike: load a hardcoded Lua script that returns a string; expose it through a Tauri command. Acceptance: clicking a button in the Vue UI runs Lua and shows the return value. **Sandbox first** — strip `io`, `os`, `package` from the global env before any third-party script is executable.

7. **Exo desktop fleet plan** — Document how the workstation's "main app or server" coordinates with a separate Exo daemon (running natively on macOS / Linux nodes). Likely UNIX-socket RPC from `lifeos-core` to `exo` over its existing API. Acceptance: a one-page plan in `.claude/plan/exo-integration.md`, no code yet.

8. **Pi Zero/3 headless daemon target** — Add a `lifeos-daemon` bin crate (no GUI) that uses `lifeos-core` to bridge local sensors → MQTT → workstation. Acceptance: cross-compiles to `aarch64-unknown-linux-gnu` from this host.

9. **Account-keyed sync model for the persistence whitelist** — Today the whitelist lives in `src/lib/persistence.{ts,js}` against `<app_data_dir>/ui-state.json`. For "all logins connected via distributed compute" this must become account-keyed and synced (or at least uploadable). Sketch first; do not change shipped behavior.

10. **Mark current foundation decisions in CHANGELOG.md** — A single entry recording this verification and the layered-foundation decision. Keeps future agents from re-debating settled ground.

---

## What is *not* recommended

- ❌ **Don't rewrite the Vue layer in Rust/Leptos/Dioxus.** Vue is fine for the desktop workstation. Replacing it costs months and buys nothing the layered foundation doesn't already give.
- ❌ **Don't try to make Lua run on ESP32 inside a Rust app.** Use NodeMCU C firmware if you must have Lua on ESP32. Better: keep ESP32 as a pure no_std Rust sensor endpoint, and put the Lua scripting on the workstation that talks to it.
- ❌ **Don't reimplement Cognitum.** It exists, it runs, it has clients. Become a client. Use its witness chain. Don't fork it into the Tauri app.
- ❌ **Don't promise Exo on mobile or microcontrollers.** It's not in the project's scope; pretending otherwise misleads downstream design.
- ❌ **Don't add `openssl-sys`.** `reqwest` is already wired to `rustls` (per CLAUDE.md). Keep it that way for cross-compile sanity (Pi, Tauri Mobile, ESP32 all hate OpenSSL).

---

## Verification signal

This document is *recommendation-mode*. The user asked to **verify the foundation**, not to commit to a refactor. The TODO entries above are stepping-stones that can be picked up one-by-one with normal acceptance criteria (`cargo check`, `bun test`, smoke tests). None require a "big bang" change.

Done when the user (1) reads this, (2) accepts or amends the layered architecture, and (3) picks the first 1–2 TODO items to actually execute next session.
