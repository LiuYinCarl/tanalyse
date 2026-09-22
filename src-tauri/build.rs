fn main() {
    // cargo-fuzz 构建时 rustc 会带上 --cfg fuzzing;声明它,
    // 否则正常构建里 #[cfg(not(fuzzing))] 会被 unexpected_cfgs 判为未知条件。
    println!("cargo::rustc-check-cfg=cfg(fuzzing)");
    tauri_build::build()
}
