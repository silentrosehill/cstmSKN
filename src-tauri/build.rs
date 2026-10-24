fn main() {
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=native/sidebar_glass.m");
        cc::Build::new()
            .file("native/sidebar_glass.m")
            .flag("-fobjc-arc")
            .compile("cstmskn_sidebar_glass");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }

    // Embed Info.plist in the Mach-O binary so macOS Authorization Services
    // recognise this as a proper app (required for AuthorizationCreate).
    if cfg!(target_os = "macos") {
        println!("cargo:rerun-if-changed=Info.plist");
        let plist = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("Info.plist");
        println!("cargo:rustc-link-arg=-sectcreate");
        println!("cargo:rustc-link-arg=__TEXT");
        println!("cargo:rustc-link-arg=__info_plist");
        println!("cargo:rustc-link-arg={}", plist.display());
    }
}
