//! tanalyse 库入口:启动装配(run)。命令逻辑在 commands.rs,数据在 data_io.rs。

pub mod commands;
pub mod data_io;
pub mod single_instance;

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
