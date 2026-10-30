//! Tauri 命令与全局状态。命令保持私有,仅通过 [`invoke_handler`] 注册;
//! 单元测试用 tauri mock runtime 直接调用。

use std::path::PathBuf;
use std::sync::Mutex;

/// 保存冲突:磁盘上的数据文件已被外部程序改动,拒绝覆盖。
/// 前端按这个标识给出专门的本地化提示(见 bridge.ts 的 ERR_SAVE_CONFLICT)。
pub const SAVE_CONFLICT: &str = "stale-file";

/// 全局状态:已解析的数据文件路径。
pub struct AppState {
    pub data_file: Mutex<PathBuf>,
    /// 已有实例在写同一份数据 → 本次以只读启动,避免互相覆盖。
    pub force_readonly: bool,
    /// 最近一次读/写数据文件时记录的内容哈希;用于发现外部修改。
    pub observed_hash: Mutex<Option<u64>>,
}

/// 注册全部命令(在 run() 中传给 Builder)。
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        app_version,
        is_secondary_instance,
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
/// 页面底色由 CSS 变量承担,但原生窗口层的底色仍按外观取色:
/// 不显式同步的话,缩放/首绘瞬间会露出系统主题的底色。
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
    Ok(state
        .data_file
        .lock()
        .map_err(|_| "状态锁损坏".to_string())?
        .clone())
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 是否因"已有实例在运行"而以只读模式启动。
#[tauri::command]
fn is_secondary_instance(state: tauri::State<'_, AppState>) -> bool {
    state.force_readonly
}

#[tauri::command]
fn get_data_path(state: tauri::State<'_, AppState>) -> Result<String, String> {
    data_file_of(&state).map(|p| p.display().to_string())
}

#[tauri::command]
fn load_data(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    let path = data_file_of(&state)?;
    let content = super::data_io::load_json(&path)?;
    // 记下磁盘内容的指纹,保存前据此判断是否被外部改动
    let hash = content.as_deref().map(super::data_io::content_hash);
    *state
        .observed_hash
        .lock()
        .map_err(|_| "状态锁损坏".to_string())? = hash;
    Ok(content)
}

#[tauri::command]
fn save_data(state: tauri::State<'_, AppState>, json: String) -> Result<(), String> {
    let path = data_file_of(&state)?;
    // 保存前比对:磁盘内容若与上次读到的不一致,说明被别的程序改过,拒绝覆盖。
    // 单实例锁挡的是"另一个 tanalyse",这里额外挡住手改 JSON、网盘同步等外部写入。
    let observed = *state
        .observed_hash
        .lock()
        .map_err(|_| "状态锁损坏".to_string())?;
    if super::data_io::disk_hash(&path) != observed {
        return Err(SAVE_CONFLICT.to_string());
    }
    super::data_io::save_json(&path, &json)?;
    *state
        .observed_hash
        .lock()
        .map_err(|_| "状态锁损坏".to_string())? = Some(super::data_io::content_hash(&json));
    Ok(())
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
            data_file: Mutex::new(data_file),
            force_readonly: false,
            observed_hash: Mutex::new(None),
        });
        let state = app.state::<AppState>();

        assert!(!is_secondary_instance(state.clone()));
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

    #[test]
    fn secondary_instance_flag_reported() {
        let app = mock_app();
        app.manage(AppState {
            data_file: Mutex::new(std::path::PathBuf::from("tanalyse-data.json")),
            force_readonly: true,
            observed_hash: Mutex::new(None),
        });
        assert!(is_secondary_instance(app.state::<AppState>()));
    }

    #[test]
    fn save_rejected_when_file_changed_externally() {
        let app = mock_app();
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(DATA_FILE);
        app.manage(AppState {
            data_file: Mutex::new(path.clone()),
            force_readonly: false,
            observed_hash: Mutex::new(None),
        });
        let state = app.state::<AppState>();

        // 启动时文件还不存在 → 记录到 None 指纹
        assert!(matches!(load_data(state.clone()), Ok(None)));
        // 外部程序创建了文件
        std::fs::write(&path, r#"{"version":"1.0.0","external":true}"#).unwrap();

        let err = save_data(state.clone(), r#"{"version":"1.0.0"}"#.to_string()).unwrap_err();
        assert_eq!(err, SAVE_CONFLICT);
        // 关键:磁盘内容没有被覆盖
        assert!(std::fs::read_to_string(&path).unwrap().contains("external"));

        // 重新加载承认外部版本后,又能正常保存
        load_data(state.clone()).unwrap();
        save_data(
            state.clone(),
            r#"{"version":"1.0.0","external":true}"#.to_string(),
        )
        .unwrap();
    }
}
