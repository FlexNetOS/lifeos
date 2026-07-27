fn main() {
    println!("cargo:rustc-link-search=native=vendor/lib");
    println!("cargo:rustc-link-lib=static=codedb_fixture_native");
    println!("cargo:rerun-if-changed=vendor/lib");
}
