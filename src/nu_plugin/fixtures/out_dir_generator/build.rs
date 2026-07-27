use std::{env, fs, path::PathBuf};

fn main() {
    let output = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo sets OUT_DIR"));
    fs::write(
        output.join("generated.rs"),
        "pub const GENERATED_VALUE: &str = \"from-build-script\";\n",
    )
    .expect("write generated source");
    println!("cargo:rerun-if-changed=build.rs");
}
