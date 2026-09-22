//! tanalyse 库入口:启动装配(run)。命令逻辑在 commands.rs,数据在 data_io.rs。

pub mod commands;
pub mod data_io;

/// 按平台应用原生磨砂玻璃效果。
/// 圆角与前端 --window-radius 保持一致,窗口四角由 vibrancy 与内容同时裁圆。
#[cfg(not(fuzzing))]
fn apply_window_effects(window: &tauri::WebviewWindow) {
    // 只有 macOS/Windows 分支用到;Linux 下这条 import 会被 -D warnings 判成未使用
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use tauri::utils::config::WindowEffectsConfig;
    #[cfg(target_os = "macos")]
    {
        use tauri::utils::{WindowEffect, WindowEffectState};
        let _ = window.set_effects(WindowEffectsConfig {
            effects: vec![WindowEffect::UnderWindowBackground],
            state: Some(WindowEffectState::Active),
            radius: Some(22.0),
            color: None,
        });
    }
    #[cfg(target_os = "windows")]
    {
        use tauri::utils::{WindowEffect, WindowEffectState};
        let _ = window.set_effects(WindowEffectsConfig {
            effects: vec![WindowEffect::Acrylic],
            state: Some(WindowEffectState::Active),
            radius: Some(22.0),
            color: None,
        });
    }
    #[cfg(target_os = "linux")]
    {
        let _ = window; // Linux 无原生效果,前端使用半透明 + backdrop-filter
    }
}

/// 组装并运行应用。
///
/// 模糊测试只针对 `data_io` 的纯逻辑,不需要(也不应该)拉起 Tauri 上下文:
/// `generate_context!` 会去读前端产物与 tauri.conf.json,在 fuzz 构建下既慢又脆。
/// cargo-fuzz 构建时带 --cfg fuzzing,这里据此裁掉启动胶水。
#[cfg(not(fuzzing))]
pub fn run() {
    use std::sync::Mutex;
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                apply_window_effects(&window);
            }
            // 可移植:数据文件与程序同目录;目录只读则回退到用户配置目录
            let exe = std::env::current_exe().map_err(|e| format!("无法定位程序: {e}"))?;
            let fallback = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("tanalyse"));
            let data_file = data_io::resolve_data_file(&exe, &fallback);
            if let Some(dir) = data_file.parent() {
                std::fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
            }
            app.manage(commands::AppState {
                data_file: Mutex::new(Some(data_file)),
            });
            Ok(())
        })
        .invoke_handler(commands::invoke_handler())
        .run(tauri::generate_context!())
        .expect("tanalyse 启动失败");
}
