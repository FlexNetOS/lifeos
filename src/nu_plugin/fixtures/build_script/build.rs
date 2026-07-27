fn main() {
    println!("cargo:rerun-if-changed=build-input.txt");
    println!("cargo:rustc-env=CODEDB_BUILD_FIXTURE=enabled");
}
