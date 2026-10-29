//! tanalyse 库入口:启动装配(run)。命令逻辑在 commands.rs,数据在 data_io.rs。

pub mod commands;
pub mod data_io;
pub mod single_instance;

/// 窗口圆角(逻辑像素)。前端 CSS 的 `--window-radius` 必须与此一致:
/// macOS 的 vibrancy 圆角与页面内容都对同一个值取整,不一致会错位。
/// `css_matches_window_radius` 测试会读 style.css 断言两者相等。
/// 窗口为直角(0),不再做圆角窗口。
pub const WINDOW_RADIUS: f64 = 0.0;

/// 按平台应用原生磨砂玻璃效果。
/// macOS 圆角与前端 --window-radius 保持一致,四角由 vibrancy 与内容同时裁直。
#[cfg(not(fuzzing))]
fn apply_window_effects(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use tauri::utils::config::WindowEffectsConfig;
        use tauri::utils::{WindowEffect, WindowEffectState};
        let _ = window.set_effects(WindowEffectsConfig {
            effects: vec![WindowEffect::UnderWindowBackground],
            state: Some(WindowEffectState::Active),
            radius: Some(WINDOW_RADIUS),
            color: None,
        });
    }
    #[cfg(target_os = "windows")]
    {
        // Windows 的原生 Acrylic 是铺满矩形窗口的:无边框透明窗口里,它会在
        // 内容边界之外露出一圈方形毛玻璃;无边框窗口默认的 1px 白边/阴影同样
        // 多出一圈。两样都关掉,窗口观感由"透明窗口 + CSS 底色"给出,
        // 各 Windows 版本一致。
        let _ = window.set_shadow(false);
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
        .plugin(tauri_plugin_notification::init())
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
            // 单实例守卫:同一份数据只允许一个可写实例。两个实例各自把整份数据
            // 读进内存再整体写回,后写者会覆盖先写者;拿不到锁的一方以只读启动。
            let secondary = match single_instance::try_acquire(&data_file) {
                Ok(Some(lock)) => {
                    app.manage(lock); // 持有到进程结束,锁才持续有效
                    false
                }
                Ok(None) => true,
                Err(_) => false, // 锁文件建不出(目录只读等):不阻塞启动,写失败会在保存时报出
            };
            app.manage(commands::AppState {
                data_file: Mutex::new(data_file),
                force_readonly: secondary,
                observed_hash: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(commands::invoke_handler())
        .run(tauri::generate_context!())
        .expect("tanalyse 启动失败");
}

#[cfg(test)]
mod tests {
    use super::WINDOW_RADIUS;

    /// 窗口圆角在前端 CSS 与后端各写一份,这里断言两者没有漂移。
    #[test]
    fn css_matches_window_radius() {
        let css = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/style.css"))
            .expect("读取 src/style.css");
        let after = css
            .split("--window-radius:")
            .nth(1)
            .expect("style.css 缺少 --window-radius");
        let number: String = after
            .chars()
            .skip_while(|c| !c.is_ascii_digit() && *c != '.')
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect();
        let css_radius: f64 = number.parse().expect("解析 --window-radius 失败");
        assert_eq!(css_radius, WINDOW_RADIUS);
    }
}
