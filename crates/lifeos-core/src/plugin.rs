//! Lua/Luau plugin host — Wave 3 spike.
//!
//! Embeds Roblox's Luau dialect (via `mlua`) so LifeOS can execute user-authored
//! scripts without dragging arbitrary FFI into the process. Luau is the chosen
//! dialect because it's sandboxed-by-design — third-party scripts get a
//! sealed-table base environment they cannot mutate.
//!
//! # Sandbox model
//!
//! Two layers, applied in this order before any user script runs:
//!
//! 1. **Strip dangerous globals** on the base env. The following names are
//!    overwritten with `nil` so scripts that reference them get a "attempt to
//!    index a nil value" runtime error rather than the real stdlib:
//!
//!    | Global     | Why it's removed                                            |
//!    |------------|-------------------------------------------------------------|
//!    | `io`       | File I/O — `io.open`, `io.popen`, etc.                      |
//!    | `os`       | Process control — `os.execute`, `os.getenv`, `os.remove`.   |
//!    | `package`  | Module loading — `package.loadlib`, `package.path` hacks.   |
//!    | `debug`    | Reflective hooks that can pry into the host's stack frames. |
//!    | `dofile`   | Reads + executes an arbitrary file path.                    |
//!    | `loadfile` | Compiles an arbitrary file path into a function.            |
//!    | `load`     | Compiles a string passed at runtime — bypass for the host.  |
//!
//! 2. **`Lua::sandbox(true)`**. Luau-specific: makes the base env read-only and
//!    gives each user thread a fresh shadowed env. Belt-and-suspenders — even
//!    if a future change to step 1 misses a name, the base env can't be mutated
//!    by the script to re-expose anything.
//!
//! A *fresh* [`PluginHost`] is intentionally cheap to build (vendored Luau VM,
//! no I/O on construction). The Tauri command builds one per call so a
//! misbehaving script can't poison the next caller's globals.
//!
//! # Wave-4 follow-ups
//!
//! - Table return values serialize to `"<table>"`; a future pass should JSON-
//!   encode them via mlua's `serde` feature.
//! - No script-side time limit — `lua.set_interrupt` can wire one in.
//! - No capability injection yet (LifeOS APIs the script *is* allowed to call).

use std::fmt;

/// A configured Luau VM with the dangerous globals already stripped.
///
/// One instance per script execution is the recommended pattern — see the
/// module docs. The struct is `!Send` by default; the `send` feature on mlua
/// flips that so the Tauri command thread can own it briefly.
pub struct PluginHost {
    lua: mlua::Lua,
}

/// Failure modes from compiling or executing a plugin script.
#[derive(Debug)]
pub enum PluginError {
    /// Script could not be parsed (Luau syntax error).
    Compile(String),
    /// Script parsed but raised an error during execution. This includes
    /// "attempt to index a nil value" errors from touching a stripped global,
    /// so end-user-facing messaging treats `Runtime` as the catch-all bucket.
    Runtime(String),
    /// Sandbox could not be installed during [`PluginHost::new`] — either the
    /// Luau VM failed to construct, a global strip failed, or
    /// `Lua::sandbox(true)` rejected the request. Any of these means the host
    /// is unsafe to run third-party code, so callers should refuse to proceed.
    Sandbox(String),
}

impl fmt::Display for PluginError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PluginError::Compile(msg) => write!(f, "plugin compile error: {msg}"),
            PluginError::Runtime(msg) => write!(f, "plugin runtime error: {msg}"),
            PluginError::Sandbox(msg) => write!(f, "plugin sandbox error: {msg}"),
        }
    }
}

impl std::error::Error for PluginError {}

/// Globals removed from the Luau base environment before any script runs.
/// Kept as a `const` so tests and downstream auditors can read the exact list.
pub const STRIPPED_GLOBALS: &[&str] =
    &["io", "os", "package", "debug", "dofile", "loadfile", "load"];

impl PluginHost {
    /// Build a fresh Luau VM with the standard library partially stripped and
    /// `Lua::sandbox(true)` engaged.
    ///
    /// This is the only place the [`STRIPPED_GLOBALS`] list is enforced —
    /// callers that bypass `PluginHost::new()` and hand-roll their own
    /// `mlua::Lua` get an unsafe VM.
    pub fn new() -> Result<Self, PluginError> {
        let lua = mlua::Lua::new();

        // Step 1: strip dangerous globals on the base env. Each set must
        // succeed; if any fails we abort construction so a partial-strip
        // never reaches a caller.
        {
            let globals = lua.globals();
            for name in STRIPPED_GLOBALS {
                globals
                    .set(*name, mlua::Value::Nil)
                    .map_err(|e| PluginError::Sandbox(format!("strip {name}: {e}")))?;
            }
        }

        // Step 2: Luau-only — make the base env read-only and give user threads
        // a shadowed env. Belt-and-suspenders on top of step 1.
        lua.sandbox(true)
            .map_err(|e| PluginError::Sandbox(format!("Lua::sandbox(true): {e}")))?;

        Ok(Self { lua })
    }

    /// Compile + execute `script`, then coerce its return value to a string.
    ///
    /// Coercion rules (the Wave-4 follow-up replaces #4 with a real
    /// serializer):
    ///
    /// 1. `nil` → `""`
    /// 2. `string` → the string verbatim
    /// 3. `integer` / `number` → `to_string()`
    /// 4. `table` → `"<table>"` placeholder
    /// 5. `boolean` → `"true"` / `"false"`
    /// 6. anything else (function, userdata, thread, light userdata, …) →
    ///    `"<unknown>"`
    pub fn run(&self, script: &str) -> Result<String, PluginError> {
        let chunk = self.lua.load(script);
        let value: mlua::Value = chunk.eval().map_err(classify_lua_error)?;
        Ok(coerce_to_string(value))
    }
}

/// Map an mlua error onto our coarser PluginError taxonomy. Syntax errors come
/// back from `lua.load(...).eval(...)` as `Error::SyntaxError`; everything else
/// (runtime panics, indexing nil, explicit `error("...")` calls) lands in
/// `Runtime`.
fn classify_lua_error(err: mlua::Error) -> PluginError {
    match &err {
        mlua::Error::SyntaxError { message, .. } => PluginError::Compile(message.clone()),
        _ => PluginError::Runtime(err.to_string()),
    }
}

fn coerce_to_string(value: mlua::Value) -> String {
    match value {
        mlua::Value::Nil => String::new(),
        mlua::Value::String(s) => s.to_str().map(|cow| cow.to_string()).unwrap_or_default(),
        mlua::Value::Integer(i) => i.to_string(),
        mlua::Value::Number(n) => n.to_string(),
        mlua::Value::Boolean(b) => b.to_string(),
        mlua::Value::Table(_) => "<table>".to_string(),
        _ => "<unknown>".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_string_literal() {
        let host = PluginHost::new().expect("host construction");
        let out = host.run(r#"return "hello""#).expect("script ok");
        assert_eq!(out, "hello");
    }

    #[test]
    fn coerces_integer_return() {
        let host = PluginHost::new().expect("host construction");
        let out = host.run("return 1 + 2").expect("script ok");
        assert_eq!(out, "3");
    }

    #[test]
    fn coerces_nil_return_to_empty_string() {
        let host = PluginHost::new().expect("host construction");
        let out = host.run("return nil").expect("script ok");
        assert_eq!(out, "");
    }

    #[test]
    fn coerces_table_return_to_placeholder() {
        let host = PluginHost::new().expect("host construction");
        let out = host.run("return {1, 2, 3}").expect("script ok");
        assert_eq!(out, "<table>");
    }

    #[test]
    fn os_execute_is_sandboxed() {
        let host = PluginHost::new().expect("host construction");
        let err = host
            .run(r#"return os.execute("ls")"#)
            .expect_err("os was stripped, script should fail");
        // Indexing a nil global is a runtime error in Luau.
        assert!(matches!(err, PluginError::Runtime(_)), "got {err:?}");
    }

    #[test]
    fn io_open_is_sandboxed() {
        let host = PluginHost::new().expect("host construction");
        let err = host
            .run(r#"return io.open("/etc/passwd")"#)
            .expect_err("io was stripped, script should fail");
        assert!(matches!(err, PluginError::Runtime(_)), "got {err:?}");
    }

    #[test]
    fn package_is_sandboxed() {
        let host = PluginHost::new().expect("host construction");
        let err = host
            .run(r#"return package.loadlib("/tmp/x", "init")"#)
            .expect_err("package was stripped, script should fail");
        assert!(matches!(err, PluginError::Runtime(_)), "got {err:?}");
    }

    #[test]
    fn debug_is_sandboxed() {
        let host = PluginHost::new().expect("host construction");
        let err = host
            .run("return debug.getinfo(1)")
            .expect_err("debug was stripped, script should fail");
        assert!(matches!(err, PluginError::Runtime(_)), "got {err:?}");
    }

    #[test]
    fn load_is_sandboxed() {
        let host = PluginHost::new().expect("host construction");
        // `load` would let a script compile arbitrary code passed at runtime —
        // the exact escape hatch sandboxing must close.
        let err = host
            .run(r#"return load("return 1")()"#)
            .expect_err("load was stripped, script should fail");
        assert!(matches!(err, PluginError::Runtime(_)), "got {err:?}");
    }

    #[test]
    fn syntax_error_classified_as_compile() {
        let host = PluginHost::new().expect("host construction");
        let err = host
            .run("return *")
            .expect_err("malformed script should not compile");
        assert!(matches!(err, PluginError::Compile(_)), "got {err:?}");
    }

    #[test]
    fn explicit_error_call_classified_as_runtime() {
        let host = PluginHost::new().expect("host construction");
        let err = host
            .run(r#"error("boom")"#)
            .expect_err("error() should bubble up");
        assert!(matches!(err, PluginError::Runtime(_)), "got {err:?}");
    }

    #[test]
    fn stripped_globals_list_matches_doc() {
        // Keep the documented list in sync with what `new()` enforces.
        assert_eq!(
            STRIPPED_GLOBALS,
            &["io", "os", "package", "debug", "dofile", "loadfile", "load"]
        );
    }

    #[test]
    fn safe_stdlib_still_works() {
        // Sanity: the parts of the stdlib we *didn't* strip should still be
        // callable. `string` and `math` are pure (no I/O, no process), so they
        // stay reachable — that's the whole point of selective stripping.
        let host = PluginHost::new().expect("host construction");
        let out = host
            .run(r#"return string.upper("hello")"#)
            .expect("string lib still reachable");
        assert_eq!(out, "HELLO");

        let out = host
            .run("return math.floor(3.7)")
            .expect("math lib still reachable");
        assert_eq!(out, "3");
    }
}
