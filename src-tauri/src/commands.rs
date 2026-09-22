//! Tauri 命令与全局状态。命令保持私有,仅通过 [`invoke_handler`] 注册;
//! 单元测试用 tauri mock runtime 直接调用。

use std::path::PathBuf;
use std::sync::Mutex;

/// 全局状态:已解析的数据文件路径。
pub struct AppState {
    pub data_file: Mutex<Option<PathBuf>>,
}

/// 注册全部命令(在 run() 中传给 Builder)。
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        app_version,
        set_window_theme,
        get_data_path,
        load_data,
        save_data,
        export_data_to,
        import_data_from
    ]
}

/// 主题名 → 原生窗口外观。无法识别(含 "system")时返回 None,交还系统决定。
fn parse_window_theme(name: &str) -> Option<tauri::Theme> {
    match name {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    }
}

/// 让原生窗口外观跟随应用主题。
///
/// macOS 的 vibrancy(NSVisualEffectView)与 Windows 的 Acrylic 都按窗口外观取材质:
/// 若只改页面里的 CSS 变量,原生那层仍停留在系统主题,深色模式会变成浑浊的中间灰。
#[tauri::command]
fn set_window_theme<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    theme: String,
) -> Result<(), String> {
    window
        .set_theme(parse_window_theme(&theme))
        .map_err(|e| e.to_string())
}

fn data_file_of(state: &tauri::State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .data_file
        .lock()
        .map_err(|_| "状态锁损坏".to_string())?
        .clone()
        .ok_or_else(|| "数据文件未初始化".to_string())
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_data_path(state: tauri::State<'_, AppState>) -> Result<String, String> {
    data_file_of(&state).map(|p| p.display().to_string())
}

#[tauri::command]
fn load_data(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    super::data_io::load_json(&data_file_of(&state)?)
}

#[tauri::command]
fn save_data(state: tauri::State<'_, AppState>, json: String) -> Result<(), String> {
    super::data_io::save_json(&data_file_of(&state)?, &json)
}

#[tauri::command]
fn export_data_to(path: String, json: String) -> Result<(), String> {
    super::data_io::export_to(std::path::Path::new(&path), &json)
}

#[tauri::command]
fn import_data_from(path: String) -> Result<String, String> {
    super::data_io::import_from(std::path::Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::Manager;

    const DATA_FILE: &str = "tanalyse-data.json";

    fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("mock app")
    }

    #[test]
    fn app_version_matches_cargo_pkg() {
        assert_eq!(app_version(), env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn parse_window_theme_maps_known_modes() {
        assert!(matches!(
            parse_window_theme("light"),
            Some(tauri::Theme::Light)
        ));
        assert!(matches!(
            parse_window_theme("dark"),
            Some(tauri::Theme::Dark)
        ));
        // 未知/系统:交还系统决定(None),而不是误判成浅色
        assert!(parse_window_theme("system").is_none());
        assert!(parse_window_theme("").is_none());
    }

    #[test]
    fn set_window_theme_applies_to_mock_window() {
        let app = mock_app();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
            .build()
            .expect("mock window");
        assert!(set_window_theme(window.clone(), "dark".to_string()).is_ok());
        assert!(set_window_theme(window, "system".to_string()).is_ok());
    }

    #[test]
    fn data_commands_roundtrip() {
        let app = mock_app();
        let dir = tempfile::tempdir().expect("tempdir");
        let data_file = dir.path().join(DATA_FILE);
        app.manage(AppState {
            data_file: Mutex::new(Some(data_file)),
        });
        let state = app.state::<AppState>();

        assert!(get_data_path(state.clone())
            .unwrap()
            .ends_with("tanalyse-data.json"));
        assert!(matches!(load_data(state.clone()), Ok(None)));

        save_data(state.clone(), r#"{"version":"1.0.0"}"#.to_string()).unwrap();
        assert_eq!(
            load_data(state.clone()).unwrap().unwrap(),
            r#"{"version":"1.0.0"}"#
        );
        assert!(save_data(state.clone(), "{broken".to_string()).is_err());

        // 未初始化状态应报错(manage 不会替换已有状态,用全新 app)
        let fresh = mock_app();
        fresh.manage(AppState {
            data_file: Mutex::new(None),
        });
        let empty = fresh.state::<AppState>();
        assert!(get_data_path(empty.clone()).is_err());
        assert!(load_data(empty).is_err());
    }

    #[test]
    fn export_import_commands_roundtrip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("share.json");
        export_data_to(
            path.display().to_string(),
            r#"{"version":"1.0.0"}"#.to_string(),
        )
        .unwrap();
        assert_eq!(
            import_data_from(path.display().to_string()).unwrap(),
            r#"{"version":"1.0.0"}"#
        );
        assert!(import_data_from(dir.path().join("nope.json").display().to_string()).is_err());
    }
}
