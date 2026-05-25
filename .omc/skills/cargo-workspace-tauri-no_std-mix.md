---
name: cargo-workspace-tauri-no_std-mix
description: Setting up a Cargo workspace that contains a Tauri 2 shell, a portable core crate, a headless daemon bin crate, AND a no_std firmware sibling — without breaking the Tauri build pipeline or making the firmware fail resolver-2 std unification.
triggers:
  - cargo workspace
  - cargo workspace member
  - cargo workspace exclude
  - tauri workspace
  - cargo Tauri build root
  - no_std workspace member
  - esp-hal workspace
  - cargo workspace lockfile location
  - mcp-http feature gate dead code
  - feature flag dead code warning
  - default-features = false dead code
---

# Cargo workspace that mixes Tauri + portable Rust + no_std firmware

## The Insight

A "portable Rust core" project usually wants four shapes living next to each other:
- **Tauri 2 desktop shell** (`src-tauri/`) — std, links GUI deps.
- **Portable core crate** (`crates/lifeos-core/`) — std, no Tauri imports, consumed by every other shape.
- **Headless daemon bin** (`crates/lifeos-daemon/`) — std, cross-compiles to `aarch64-unknown-linux-gnu` for Pi.
- **no_std firmware** (`firmware/esp32/`) — bare-metal, RISC-V or Xtensa.

A naive setup throws all of these into one `[workspace] members = [...]` block. **It will fail** the moment you `cargo check --workspace`, because resolver 2 tries to unify features across all members, and `esp-hal`'s `no_std` lock-step is incompatible with `tauri`'s std requirement. The fix is to **explicitly `exclude`** the firmware tree from the workspace and let it carry its own resolver, lockfile, and `rust-toolchain.toml`.

Three independent things have to be right:

1. **Workspace topology**: only the std crates are members. The firmware tree is excluded.
2. **Lockfile location**: Cargo workspace owns the lock at root. If the shell had a committed `src-tauri/Cargo.lock` (Tauri convention pre-workspace), it must move up to the workspace root.
3. **Feature-gate cascade**: any private helper called only from a feature-gated public path must itself be `#[cfg(feature = "...")]`-gated. Workspace consumers that build with `default-features = false` will otherwise emit `dead_code` warnings the original crate never sees.

## Why This Matters

A Cargo workspace that mixes std and `no_std` members **silently accepts the broken `members = [...]` list at parse time**. The failure surfaces only when you try to build the firmware: cargo will attempt to unify features across all workspace members and either pick `std`-flavored features for the no_std crate (breaking the build) or the no_std flavor for the std crates (also breaking the build). Excluding the firmware tree up-front avoids hours of confused debugging.

The lockfile bit is even more silent: if you leave `src-tauri/Cargo.lock` in place after introducing a root workspace, cargo creates a *second* lockfile at the workspace root, the two diverge, and Tauri builds suddenly resolve different versions than the shell tests covered.

The feature-gate cascade only bites cross-feature consumers. Pre-workspace, `cargo check -p lifeos-core` is the only consumer, so a helper used by an `mcp-http`-gated path looks like normal code. Add a daemon that opts out of `mcp-http`, and a `dead_code` warning lights up — the helper is unreachable through any non-gated path.

## Recognition Pattern

Stand up the workspace this way when:
- The Tauri shell currently lives at `src-tauri/` with its own `Cargo.toml` and a committed `Cargo.lock`.
- You want to introduce a portable core crate that the shell, a daemon, and a future mobile shell will all import.
- You also want to scaffold no_std firmware (`esp-hal`, `embassy-executor`) in the same repo.
- The mobile shell will eventually live as its own crate (or as a Tauri Mobile target of the same shell crate) under the same workspace.

## The Approach

**Step 1 — root manifest. `/Cargo.toml`:**

```toml
[workspace]
resolver = "2"
members = [
    "src-tauri",
    "crates/lifeos-core",
    "crates/lifeos-daemon",
]
exclude = [
    # no_std firmware — own rust-toolchain.toml, own bare-metal target.
    # Including it in `members` would force resolver-2 to unify features
    # across std + no_std crates, which never works.
    "firmware/esp32",
]
```

**Step 2 — move the lockfile up.** `git mv src-tauri/Cargo.lock Cargo.lock` (or plain `mv` if not yet committed). Tauri's `cargo tauri dev` / `cargo tauri build` still find the workspace by walking up from `src-tauri/`.

**Step 3 — shell crate declares the path dep:**

```toml
# src-tauri/Cargo.toml
[dependencies]
lifeos-core = { path = "../crates/lifeos-core" }
```

Drop any duplicate deps from `src-tauri` that now ship through lifeos-core (e.g., `argon2` if auth moved into the core).

**Step 4 — feature-gate cascade audit.** For every Cargo feature in `lifeos-core` (e.g., `mcp-http`, `plugin-host`), grep for helpers that are *only* called from the feature-gated public path. Mark them `#[cfg(feature = "...")]` themselves, plus the tests that touch them. Discover this lazily by adding a consumer with `default-features = false` and running `cargo check`:

```toml
# crates/lifeos-daemon/Cargo.toml
[dependencies]
lifeos-core = { path = "../lifeos-core", default-features = false }
```

If the daemon's first `cargo check` lights up `warning: function 'X' is never used` in lifeos-core, gate `X` and its callers. Re-run, watch warnings disappear.

**Step 5 — firmware stays self-contained.** Inside `firmware/esp32/` keep:
- Its own `Cargo.toml` with `[package]` only (no `[workspace]`).
- `rust-toolchain.toml` pinning `channel = "stable"` + `targets = ["riscv32imac-unknown-none-elf"]` (for ESP32-C6/H2/C61) or the matching triple for whichever chip you picked.
- `.cargo/config.toml` pinning the default target and `rustflags = ["-C", "link-arg=-Tlinkall.x"]`.
- `cargo check --target riscv32imac-unknown-none-elf` should run cleanly without any host changes besides `rustup target add riscv32imac-unknown-none-elf`.

## Example: feature-gate cascade fix

Before — produces a dead-code warning when a daemon imports lifeos-core with `default-features = false`:

```rust
// crates/lifeos-core/src/mcp/cognitum.rs

// Called only from the HTTP-feature-gated `from_env()` below.
fn rest_base_from_mcp_url(url: &str) -> String {
    let trimmed = url.trim_end_matches('/');
    trimmed.strip_suffix("/mcp").unwrap_or(trimmed).to_string()
}

#[cfg(feature = "mcp-http")]
impl CognitumClient<ReqwestTransport> {
    pub fn from_env() -> Result<Self, McpError> {
        let raw = std::env::var("LIFEOS_COGNITUM_URL")
            .unwrap_or_else(|_| DEFAULT_COGNITUM_URL.to_string());
        let base = rest_base_from_mcp_url(&raw);
        // ...
    }
}
```

After — helper and its test share the same gate as the consumer:

```rust
#[cfg(feature = "mcp-http")]
fn rest_base_from_mcp_url(url: &str) -> String {
    let trimmed = url.trim_end_matches('/');
    trimmed.strip_suffix("/mcp").unwrap_or(trimmed).to_string()
}

#[cfg(test)]
mod tests {
    // ... other tests stay un-gated

    #[cfg(feature = "mcp-http")]
    #[test]
    fn rest_base_strip_works() {
        assert_eq!(
            rest_base_from_mcp_url("http://169.254.42.1/mcp"),
            "http://169.254.42.1"
        );
    }
}
```

## Acceptance checks worth automating

These five commands together prove the workspace is healthy:

```bash
# 1. Workspace builds with default features (Tauri shell exercises the default-on features).
cargo check --workspace

# 2. The portable core compiles on its own with NO features.
cargo check -p lifeos-core --no-default-features

# 3. Each gated feature compiles on its own.
cargo check -p lifeos-core --no-default-features --features mcp-http
cargo check -p lifeos-core --no-default-features --features plugin-host

# 4. The daemon cross-compiles to the Pi target.
cargo check -p lifeos-daemon --target aarch64-unknown-linux-gnu

# 5. The firmware tree compiles for its bare-metal target.
( cd firmware/esp32 && cargo check --target riscv32imac-unknown-none-elf )
```

Add 1-3 to CI; 4-5 are useful pre-merge checks for any PR that touches the daemon or firmware.

## Anti-patterns

- ❌ **Including `firmware/esp32/` as a workspace member.** Resolver 2 unifies features → breaks no_std.
- ❌ **Leaving `src-tauri/Cargo.lock` in place after introducing the root workspace.** Two lockfiles drift silently.
- ❌ **Gating only the public function but not its private helpers/tests.** Dead-code warnings under `--no-default-features` are real signal: the helper is reachable from no path the consumer sees.
- ❌ **Pulling `openssl-sys` anywhere in this workspace.** Pi cross-compile and any future Tauri Mobile target both hate it. Stay on `rustls` end-to-end.
