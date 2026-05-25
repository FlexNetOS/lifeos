<!-- Parent: ../cross-platform-foundation.md -->
<!-- Generated: 2026-05-25 | Status: document-only, no code changes -->

# Tauri Mobile Readiness Audit

**Date:** 2026-05-25  
**Scope:** LifeOS — Vue 3 + Tauri 2 desktop app at `src-tauri/`  
**Method:** Read-only inspection of config files + `cargo tauri info` output + primary-source doc verification  
**No migration performed.** This is a gap document only.

---

## 1. `cargo tauri info` — raw output

```
[✔] Environment
    - OS: Ubuntu 26.4.0 x86_64 (X64) (ubuntu on wayland)
    ✔ webkit2gtk-4.1: 2.52.3
    ✔ rsvg2: 2.61.3
    ✔ rustc: 1.95.0 (59807616e 2026-04-14)
    ✔ cargo: 1.95.0 (f2d3ce0bd 2026-03-21)
    ✔ rustup: 1.29.0 (28d1352db 2026-03-05)
    ✔ Rust toolchain: stable-x86_64-unknown-linux-gnu (default)
    - node: 24.15.0
    - pnpm: 11.1.2
    - yarn: 1.22.22
    - npm: 11.14.1
    - bun: 1.3.13

[-] Packages
    - tauri 🦀: 2.11.2
    - tauri-build 🦀: 2.6.2
    - wry 🦀: 0.55.1
    - tao 🦀: 0.35.3
    - tauri-cli 🦀: 2.11.1 (outdated, latest: 2.11.2)

[-] Plugins
    - tauri-plugin-shell 🦀: 2.3.5
    - tauri-plugin-fs 🦀: 2.5.1

[-] App
    - build-type: bundle
    - CSP: default-src 'self' tauri:; img-src 'self' tauri: data: asset:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ipc: http://ipc.localhost
    - frontendDist: ../dist
    - devUrl: http://localhost:1420/
```

**Notes on the output:**
- `tauri-cli` on-disk is 2.11.1; `bunx tauri --version` reports 2.11.2 (npm-resolved). The info output uses the Cargo-installed version; the npm-invoked version is current. No action needed.
- No iOS or Android sections appear. This is expected: `tauri ios init` / `tauri android init` have not been run, so no `gen/android/` or `gen/apple/` trees exist.
- Only `webkit2gtk-4.1` is detected — a Linux-desktop-only WebView. This is correct for the current target.

---

## 2. iOS Gap List

### 2.1 `tauri-plugin-mobile-*` — plugin parity

| Item | State | Consequence |
|---|---|---|
| `tauri-plugin-shell` in `Cargo.toml` | **Present** | `shell:default` + `shell:allow-open` are granted in `capabilities/default.json`. On iOS, `tauri-plugin-shell` is compiled in but the iOS sandbox forbids arbitrary process spawning. Any frontend code calling `shell.open()` or `shell.execute()` will silently fail or throw at runtime. The capability must be removed from the mobile grant before a mobile build. |
| `tauri-plugin-fs` in `Cargo.toml` | **Present** | Portable, but path resolution differs. See §2.6. |
| `tauri-plugin-notification` | **Absent** | Not needed for current feature set, but listed here as the most common mobile-only addition. |
| `tauri-plugin-barcode-scanner`, `tauri-plugin-nfc`, etc. | **Absent** | Not needed. Noted only to confirm mobile-only plugins are not accidentally blocking the build. |

Source: `src-tauri/Cargo.toml` (read directly); Tauri 2 plugin registry at https://v2.tauri.app/plugin/

### 2.2 `[lib] crate-type = "staticlib"`

| Item | State | Consequence |
|---|---|---|
| `crate-type = ["staticlib", "cdylib", "rlib"]` | **Present** (`src-tauri/Cargo.toml` line 11) | **Good.** `staticlib` is required for iOS; Tauri's linker on iOS links the Rust lib as a static framework. `cdylib` is needed for Android (`.so`). `rlib` keeps the desktop dev build fast. All three are already declared — no change needed. |

### 2.3 iOS bundle target in `tauri.conf.json`

| Item | State | Consequence |
|---|---|---|
| `bundle.targets` in `tauri.conf.json` | `["app", "dmg", "msi", "nsis", "deb", "rpm", "appimage"]` — **desktop-only** | No `ios` target present. `tauri ios init` must be run (from a macOS host) to generate `gen/apple/` and add the Xcode project. This cannot be done from the current Linux host. |

Source: `src-tauri/tauri.conf.json` lines 37–38 (read directly).

### 2.4 `.cargo/config.toml` with iOS target triples

| Item | State | Consequence |
|---|---|---|
| `.cargo/config.toml` at repo root | **Absent** | No `.cargo/` directory exists at `/home/drdave/repos/ubuntu-lifeos/.cargo/` or `/home/drdave/repos/ubuntu-lifeos/src-tauri/.cargo/`. |
| iOS target triples installed via `rustup` | **Absent** | `rustup target list --installed` shows only `wasm32-unknown-unknown` and `x86_64-unknown-linux-gnu`. The following are required and missing: `aarch64-apple-ios`, `aarch64-apple-ios-sim`, `x86_64-apple-ios`. |
| Consequence | — | Without the target triples, `cargo build --target aarch64-apple-ios` will fail immediately. `rustup target add` for these targets must be run on the macOS build host (the triples can be added on Linux for documentation purposes but the compiler cannot produce Apple Mach-O binaries from a Linux host without a cross-compilation SDK). |

Source: Tauri 2 prerequisites — https://v2.tauri.app/start/prerequisites/ (fetched 2026-05-25).

### 2.5 Xcode + signing identity setup

| Item | State | Consequence |
|---|---|---|
| Xcode | **Out of scope for this host** (Linux) | iOS builds require Xcode on macOS. The current build host is `Ubuntu 26.4.0 x86_64`. iOS distribution is blocked until a macOS machine is used. This is an architectural constraint, not a code gap. |
| Apple Developer Program membership | **Unverified** | Required for device provisioning and App Store distribution. Required even for ad-hoc TestFlight. Not required for Simulator-only testing. |
| Code signing identity (`Apple Distribution` cert) | **Unverified** | Must be present in the macOS Keychain on the build host. |
| Provisioning profile for `ai.lifeos.desktop` | **Unverified** | The current `identifier` in `tauri.conf.json` is `ai.lifeos.desktop`. A mobile-targeted identifier should follow reverse-DNS (`ai.lifeos.app` or `com.lifeos.app`) and must be registered in the Apple Developer portal. |
| Cocoapods | **Unverified** | Required on the macOS build host. Per Tauri 2 docs: "Install Homebrew and Cocoapods using Homebrew." |

### 2.6 FS scope behavior under the iOS sandbox

| Item | State | Consequence |
|---|---|---|
| `tauri-plugin-fs` config in `tauri.conf.json` | `"requireLiteralLeadingDot": false` — no explicit `scope` defined | On desktop, `tauri-plugin-fs` is scoped by the capability grant `fs:default`. Path resolution uses `app.path().app_data_dir()` which maps to OS-appropriate locations (`~/.local/share/ai.lifeos.desktop/` on Linux). |
| iOS sandbox | — | On iOS, `app_data_dir()` maps to the app's sandboxed container (`/var/mobile/Containers/Data/Application/<UUID>/Library/Application Support/ai.lifeos.desktop/`). **This is compatible with the current code:** every write in `lib.rs` and `auth.rs` uses `app.path().app_data_dir()` — no hardcoded paths. No path changes required. |
| `fs:default` capability scope | Unverified to be iOS-schema-valid | The current `default.json` references `../gen/schemas/desktop-schema.json`. There is no `ios-schema.json` equivalent yet (it would be generated by `tauri ios init`). The `fs:default` permission identifier must be verified against the iOS capability schema once generated. |

### 2.7 Per-window menu and tray usage

| Item | State | Consequence |
|---|---|---|
| Native menu (`tauri::menu::Menu`) | **Present** — `setup()` in `lib.rs` builds a `Menu` with `MenuItem` for Settings (Cmd+,), `PredefinedMenuItem::quit`, and `PredefinedMenuItem::close_window`. | iOS has no native menu bar. On mobile, `app.set_menu(menu)?` will either be a no-op or compile-error depending on the Tauri version's `#[cfg(desktop)]` guards. The Tauri 2 `tauri::menu` module is gated by `cfg(desktop)` in the upstream source. The `setup()` closure must be wrapped in `#[cfg(desktop)]` or equivalent to compile cleanly for iOS. |
| System tray | **Absent** (intentionally stripped per CLAUDE.md) | No action needed. |
| `open_settings` command emits `lifeos:navigate` | Present | Portable — emitting a window event is platform-agnostic. |

---

## 3. Android Gap List

### 3.1 Android target triples

| Item | State | Consequence |
|---|---|---|
| `aarch64-linux-android` | **Absent** from `rustup target list --installed` | Required for 64-bit ARM devices (all modern Android phones). |
| `armv7-linux-androideabi` | **Absent** | Required for 32-bit ARM (older devices; still significant market share in low-end segment). |
| `i686-linux-android` | **Absent** | Required for x86 emulators. |
| `x86_64-linux-android` | **Absent** | Required for x86_64 emulators (Android Studio default). |
| Install command | — | `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` — can be run on the current Linux host. |

### 3.2 `ANDROID_HOME` / `NDK_HOME` environment variables

| Item | State | Consequence |
|---|---|---|
| `ANDROID_HOME` | **NOT_SET** (verified via env probe) | `tauri android dev` and `tauri android build` will fail immediately without this. Requires Android Studio or command-line SDK installation. |
| `NDK_HOME` | **NOT_SET** | Required for NDK-based cross-compilation. Typically `$ANDROID_HOME/ndk/<version>`. |
| `JAVA_HOME` | **NOT_SET** as env var | Java is present (`openjdk version "25.0.3-ea" 2026-04-21`) but `JAVA_HOME` is not exported. Tauri Android tooling uses `JAVA_HOME` to locate `javac`. Must be set: `export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))` or pointed explicitly at the JBR bundled with Android Studio. |

### 3.3 Java JDK requirement

| Item | State | Consequence |
|---|---|---|
| Java present on host | **Yes** — `openjdk 25.0.3-ea` (early-access build) | Tauri's Android Gradle plugin requires JDK 17+. JDK 25 EA satisfies the version floor, but **early-access JDK builds are not recommended for production builds** — they may trigger Gradle compatibility warnings. For stable Android builds, use JDK 17 LTS or JDK 21 LTS (both installable via `apt` or `mise`). |
| `JAVA_HOME` exported | **No** | See §3.2. |

### 3.4 Gradle plugin compatibility

| Item | State | Consequence |
|---|---|---|
| `gen/android/` directory | **Absent** | `tauri android init` has not been run. No `build.gradle`, `gradle-wrapper.properties`, or AGP version is pinned yet. |
| Android Gradle Plugin (AGP) version | **Unverified** | Tauri 2's Android scaffolding pins a tested AGP version at init time. Once generated, the `gradle-wrapper.properties` will specify the Gradle distribution version and `build.gradle` will specify the AGP version. Compatibility with the local JDK must be verified after init. |
| `tauri android init` | Not run | Must be run from this Linux host (Android `init` is not macOS-only, unlike iOS). |

Source: Tauri 2 prerequisites — https://v2.tauri.app/start/prerequisites/ (fetched 2026-05-25).

---

## 4. Per-Command Audit

All commands are declared in `src-tauri/src/lib.rs` and `src-tauri/src/auth.rs`.

| Command | Portable? | Notes |
|---|---|---|
| `vault_list` | ✅ portable as-is | Returns a hardcoded stub `Vec<VaultEntry>`. No OS I/O. When wired to the OS keyring (future work), `keyring` 3.6.3 supports macOS/iOS Keychain and Linux Secret Service, but **not Android**. Android will fall back to the mock credential store (insecure). Flag this before wiring production keyring reads on Android. |
| `open_settings` | ✅ portable as-is | Emits `lifeos:navigate` event via `window.emit()`. Platform-agnostic IPC. Works on all Tauri targets. |
| `lights_state_read` | ✅ portable as-is | Calls `read_state_file(&app, "lighting.json")`. Uses `app.path().app_data_dir()`. Resolves correctly on iOS sandbox and Android data dir. |
| `lights_state_write` | ✅ portable as-is | Same as above. `std::fs::write` to the sandboxed data dir is permitted on both mobile platforms. |
| `ui_state_read` | ✅ portable as-is | Same pattern as `lights_state_read`. |
| `ui_state_write` | ✅ portable as-is | Same pattern as `lights_state_write`. |
| `ai_complete` | ✅ portable as-is | `reqwest` with `rustls-tls` — no `openssl-sys`. Network calls from mobile apps go through the OS networking stack. `rustls` cross-compiles cleanly to all four Android targets and iOS. No changes required. |
| `ai_provider_get` | ✅ portable as-is | Reads `<app_data_dir>/ai.json`. Same sandbox-safe pattern. |
| `ai_provider_set` | ✅ portable as-is | Writes `<app_data_dir>/ai.json`. Same sandbox-safe pattern. |
| `app_version` | ✅ portable as-is | Returns `env!("CARGO_PKG_VERSION")`, `tauri::VERSION`, and `std::env::consts::OS`/`ARCH`. On iOS: `OS = "ios"`, `ARCH = "aarch64"`. On Android: `OS = "android"`. Informational only. |
| `telemetry_read` | ⚠️ needs adjustment | **sysinfo 0.39 lists iOS and Android as supported platforms** (verified via docs.rs — `IS_SUPPORTED_SYSTEM` returns `true` on both). The crate will compile and run. However: (a) `System::uptime()` on Android returns process uptime, not device uptime; (b) `Networks::new_with_refreshed_list()` may return an empty list on iOS due to sandboxed network interface access; (c) `System::host_name()` returns `None` on iOS (no hostname concept); (d) the `std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL)` cold-start prime (≈200ms blocking sleep on the Tauri command thread) is acceptable on desktop but should be moved to a background thread for mobile to avoid ANR/UI-jank on the first paint. **Consequence**: the telemetry widget will show zeroes or partial data on mobile rather than crashing. Not a build blocker, but the widget must be tested on a physical device before shipping. |
| `auth::auth_status` | ✅ portable as-is | Reads `<app_data_dir>/account.json`. Sandbox-safe. |
| `auth::auth_signup` | ✅ portable as-is | Argon2id password hashing via `argon2` crate. `argon2` compiles on all Tauri mobile targets (uses `std` + `alloc`). Writes to `<app_data_dir>/account.json`. |
| `auth::auth_signin` | ✅ portable as-is | Same. |
| `auth::auth_signout` | ✅ portable as-is | In-memory session clear only. |
| `auth::auth_reset_vault` | ✅ portable as-is | `std::fs::remove_file` against the sandbox path. Permitted on both mobile platforms. |

**Native menu setup block** (not a command but in `run()`):

The `setup()` closure in `run()` calls `app.set_menu(menu)`. In Tauri 2, `tauri::menu` is a desktop-only API. The `#[cfg_attr(mobile, tauri::mobile_entry_point)]` attribute is already present on `run()` (line 390 of `lib.rs`), which is correct for the entry point. However, the menu construction block inside `setup()` is not wrapped in `#[cfg(desktop)]`. This will produce a **compile error** on mobile targets because `tauri::menu::Menu`, `MenuItem`, `PredefinedMenuItem`, and `Submenu` are not available in the mobile build. This is the only compile-blocking issue in the current codebase.

---

## 5. Concrete Go/No-Go List

### iOS — items to reach a buildable dev shell

| # | Action | Surface touched | Owner | Blocker dependency |
|---|---|---|---|---|
| iOS-1 | Obtain a macOS build machine (macOS 13+ recommended) | Infrastructure | Developer | All iOS items below require macOS |
| iOS-2 | Install Xcode (full IDE, not just Command Line Tools) on the macOS host | macOS host | Developer | iOS-1 |
| iOS-3 | Install Cocoapods: `brew install cocoapods` on the macOS host | macOS host | Developer | iOS-2 |
| iOS-4 | Add iOS Rust targets: `rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios` | macOS host shell | Developer | iOS-2 |
| iOS-5 | Wrap the `setup()` menu block in `#[cfg(desktop)]` in `src-tauri/src/lib.rs` | `src-tauri/src/lib.rs` | Developer | None — can be done on Linux now |
| iOS-6 | Run `bunx tauri ios init` from the repo root on the macOS host | generates `src-tauri/gen/apple/` | Developer | iOS-3, iOS-4 |
| iOS-7 | Create `src-tauri/capabilities/mobile.json` omitting `shell:*` (see §6) | `src-tauri/capabilities/` | Developer | iOS-6 |
| iOS-8 | Enroll in Apple Developer Program and configure signing identity + provisioning profile for `ai.lifeos.app` (or chosen bundle ID) | Apple Developer portal + macOS Keychain | Developer | iOS-1 |
| iOS-9 | Run `bunx tauri ios dev` targeting the Simulator to verify boot | macOS host + Simulator | Developer | iOS-6, iOS-7 |

**Minimum to reach a Simulator boot**: iOS-1 through iOS-7 (iOS-8 not required for Simulator).

### Android — items to reach a buildable dev shell

| # | Action | Surface touched | Owner | Blocker dependency |
|---|---|---|---|---|
| AND-1 | Add Android Rust targets: `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` | Current Linux host | Developer | None |
| AND-2 | Install Android Studio or Android command-line tools; install SDK Platform, Platform-Tools, NDK (side by side), Build-Tools, Command-line Tools via SDK Manager | Linux host | Developer | None |
| AND-3 | Export `ANDROID_HOME`, `NDK_HOME`, `JAVA_HOME` in `~/.profile` or `~/.bashrc` | Current Linux host environment | Developer | AND-2 |
| AND-4 | Replace early-access JDK 25-EA with a stable JDK (17 LTS or 21 LTS) or verify Gradle compatibility with JDK 25-EA | Current Linux host | Developer | None (optional if Gradle works with EA) |
| AND-5 | Wrap the `setup()` menu block in `#[cfg(desktop)]` in `src-tauri/src/lib.rs` (same fix as iOS-5) | `src-tauri/src/lib.rs` | Developer | None — can be done now |
| AND-6 | Run `bunx tauri android init` from the repo root | generates `src-tauri/gen/android/` | Developer | AND-1, AND-3 |
| AND-7 | Create `src-tauri/capabilities/mobile.json` omitting `shell:*` (see §6) | `src-tauri/capabilities/` | Developer | AND-6 |
| AND-8 | Connect an Android device (developer mode + USB debugging) or start an AVD emulator | Android device / AVD | Developer | AND-2 |
| AND-9 | Run `bunx tauri android dev` to verify boot | Linux host + device/emulator | Developer | AND-6, AND-7, AND-8 |

**Minimum to reach an emulator boot**: AND-1 through AND-7, AND-8 (with AVD), AND-9.

**AND-5 = iOS-5.** One code change unblocks both platforms.

---

## 6. Capabilities-per-Platform Recommendation

**Reviewed file:** `src-tauri/capabilities/default.json`

Current content grants to window `"main"`:

```json
"permissions": [
  "core:default",
  "core:event:default",
  "core:webview:default",
  "core:window:default",
  "core:menu:default",
  "shell:default",
  "shell:allow-open",
  "fs:default"
]
```

**Problem:** `shell:default` and `shell:allow-open` give the renderer the ability to spawn child processes and open URLs via the system shell. On iOS and Android, the OS sandbox prevents arbitrary process spawning anyway, but inheriting these permissions from the desktop set creates an inconsistent threat model and adds unnecessary IPC surface on mobile.

The Tauri 2 capability system supports per-platform capability files. The recommendation is:

**Keep `default.json` as-is for desktop.** Its `$schema` already points at `../gen/schemas/desktop-schema.json`, which is desktop-only.

**Create `src-tauri/capabilities/mobile.json`** with:

```json
{
  "$schema": "../gen/schemas/mobile-schema.json",
  "identifier": "mobile-default",
  "description": "Mobile permission set — shell-spawn grants omitted; only safe IPC surface.",
  "windows": ["main"],
  "platforms": ["iOS", "android"],
  "permissions": [
    "core:default",
    "core:event:default",
    "core:webview:default",
    "core:window:default",
    "fs:default"
  ]
}
```

Omitted from mobile:
- `core:menu:default` — menu API is desktop-only; omitting prevents any accidental renderer call to the menu IPC surface.
- `shell:default` — no child process spawning on mobile.
- `shell:allow-open` — on iOS, opening URLs is done via `tauri-plugin-opener` or a dedicated link-handling plugin, not `shell`. On Android, intent-based URL opening needs its own plugin.

The `mobile-schema.json` is generated by `tauri ios init` / `tauri android init`. Do not create `mobile.json` until those schemas exist; the build will reject a capability file that references a nonexistent schema.

**Source reviewed:** `src-tauri/capabilities/default.json` (read directly, 2026-05-25).

---

## 7. Dependency Mobile-Portability Summary

| Crate | Version | iOS | Android | Notes |
|---|---|---|---|---|
| `tauri` | 2.11.2 | ✅ | ✅ | Mobile-stable since Tauri 2.0. |
| `tauri-plugin-fs` | 2.5.1 | ✅ | ✅ | Portable; sandbox path differs but `app_data_dir()` handles it. |
| `tauri-plugin-shell` | 2.3.5 | ⚠️ | ⚠️ | Compiles; iOS/Android sandbox silently blocks process spawning. Must be excluded from mobile capabilities. |
| `serde` / `serde_json` | 1.x | ✅ | ✅ | Pure Rust, no platform deps. |
| `reqwest` | 0.13 (rustls, no openssl-sys) | ✅ | ✅ | `rustls-tls` cross-compiles cleanly. No OpenSSL C dependency. |
| `keyring` | 3.6.3 | ✅ | ❌ | iOS: Apple Keychain via `apple-native` feature — supported. Android: not in the supported platform list for v3; falls back to in-memory mock store (insecure). Android keyring requires `android-keyring` crate or a different secret-storage approach. Flag before wiring production key reads. |
| `sysinfo` | 0.39.2 | ⚠️ | ⚠️ | Both listed as supported platforms. Compiles and runs. Partial data on iOS (hostname=None, network interfaces may be empty due to sandbox). CPU delta-prime sleep should move off the main thread for mobile ANR avoidance. Not a build blocker. |
| `argon2` | 0.5 | ✅ | ✅ | Pure Rust + alloc. No platform deps. |

---

## 8. Verdict

**yellow** — specific items first.

The codebase is closer to mobile-ready than average for a Tauri 2 desktop app:

- `crate-type = ["staticlib", "cdylib", "rlib"]` is already correct.
- `#[cfg_attr(mobile, tauri::mobile_entry_point)]` is already present.
- All file I/O goes through `app_data_dir()` — no hardcoded paths.
- `reqwest` uses `rustls` — no OpenSSL cross-compile trap.
- `argon2`, `serde`, core auth/state commands are all portable.

**One compile blocker exists today:** the native menu construction in `setup()` is not wrapped in `#[cfg(desktop)]`. This is a one-line fix.

**iOS path is macOS-gated** by Apple's toolchain requirements. Cannot proceed from this Linux host beyond the `#[cfg(desktop)]` fix and capability file authoring.

**Android path can start now** on this Linux host: install the NDK, export env vars, add target triples, run `tauri android init`. Estimated time to first emulator boot after setup: 1–2 hours of toolchain installation + `tauri android dev` run.

**`keyring` on Android is the only hard dependency gap** that affects a shipped feature (AI provider key storage). The mock fallback compiles, but it stores nothing persistently. This must be resolved before production Android builds, not before the dev shell.

---

## Source References

- `src-tauri/Cargo.toml` — dependency declarations (read directly)
- `src-tauri/tauri.conf.json` — bundle targets, CSP, window config (read directly)
- `src-tauri/capabilities/default.json` — capability grants (read directly)
- `src-tauri/src/lib.rs` — command implementations, menu setup, mobile entry point (read directly)
- `src-tauri/src/auth.rs` — auth command implementations (read directly)
- `.claude/plan/cross-platform-foundation.md` — layered architecture rationale, prior iOS/Android caveats (read directly; lines 28–29, 153–159 specifically)
- Tauri 2 prerequisites: https://v2.tauri.app/start/prerequisites/ (fetched 2026-05-25)
- Tauri 2 CLI reference: https://v2.tauri.app/reference/cli/ (fetched 2026-05-25)
- sysinfo 0.39.2 docs: https://docs.rs/sysinfo/0.39.2/sysinfo/ (fetched 2026-05-25) — confirmed iOS + Android in supported platform list
- keyring 3.6.3 docs: https://docs.rs/keyring/3.6.3/keyring/ (fetched 2026-05-25) — confirmed iOS supported, Android not supported (mock fallback)
