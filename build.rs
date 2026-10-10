fn main() {
    napi_build::setup();
    let root = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    std::env::set_var("VCPKG_ROOT", root.join(".native/vcpkg"));
    let target = std::env::var("TARGET").unwrap();
    let triplet = match target.as_str() {
        "aarch64-apple-darwin" => "arm64-osx",
        "x86_64-apple-darwin" => "x64-osx",
        "aarch64-unknown-linux-gnu" => "arm64-linux",
        "x86_64-unknown-linux-gnu" => "x64-linux",
        "x86_64-pc-windows-msvc" => "x64-windows-static-md",
        _ => panic!("Unsupported target: {target}"),
    };
    std::env::set_var("VCPKGRS_TRIPLET", triplet);
    let libzim = vcpkg::Config::new()
        .cargo_metadata(false)
        .emit_includes(true)
        .find_package("libzim")
        .expect("Build bundled libzim first: vp run build:deps (see README.md)");
    let mut build = cxx_build::bridge("native/bridge.rs");
    build.file("native/bridge.cc").include(&root).std("c++17");
    for include in &libzim.include_paths {
        build.include(include);
    }
    // vcpkg's static libzim headers do not require DLL import/export annotations.
    build.define("LZMA_API_STATIC", None).compile("zim_bridge");
    // Emit dependent static archives after the bridge so GNU linkers resolve
    // references introduced by its C++ classes (including RTTI on ARM64).
    for line in &libzim.cargo_metadata {
        // ICU's data archive can appear before icuuc in vcpkg's link order.
        // GNU ld would otherwise leave icudt*_dat unresolved and accidentally
        // borrow Node's ICU data, breaking when Node uses a different ICU version.
        if line == "cargo:rustc-link-lib=icudata" || line == "cargo:rustc-link-lib=icudt" {
            let library = line.strip_prefix("cargo:rustc-link-lib=").unwrap();
            println!("cargo:rustc-link-lib=static:+whole-archive={library}");
            continue;
        }
        println!(
            "{}",
            line.replacen("cargo:rustc-link-lib=", "cargo:rustc-link-lib=static=", 1)
        );
    }
    if target.contains("windows") {
        for lib in ["rpcrt4", "ws2_32", "winmm", "shlwapi", "advapi32"] {
            println!("cargo:rustc-link-lib={lib}");
        }
    }
    println!("cargo:rerun-if-changed=native");
    println!("cargo:rerun-if-changed=vcpkg.json");
    println!("cargo:rerun-if-env-changed=VCPKG_ROOT");
    println!("cargo:rerun-if-env-changed=VCPKGRS_TRIPLET");
}
