//! 数据文件 IO:可移植路径解析、原子保存、备份轮换、导入导出。
//! 纯逻辑与 IO 分离,便于单元测试与模糊测试(`parse_and_validate`)。

use std::path::{Path, PathBuf};

/// 数据文件名。可移植模式下与可执行文件放在同一目录。
pub const DATA_FILE_NAME: &str = "tanalyse-data.json";

/// 探测目录是否可写(创建并删除探针文件)。
pub fn dir_is_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".tanalyse-probe-{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// 解析数据文件路径:
/// 优先放在可执行文件同目录(可移植,配置与程序在一起);
/// 目录只读(如 /Applications)时回退到用户配置目录。
pub fn resolve_data_file(exe: &Path, fallback_dir: &Path) -> PathBuf {
    match exe.parent() {
        Some(dir) if dir_is_writable(dir) => dir.join(DATA_FILE_NAME),
        _ => fallback_dir.join(DATA_FILE_NAME),
    }
}

/// 校验 JSON 合法性。
pub fn validate_json(json: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str(json).map_err(|e| format!("JSON 无效: {e}"))
}

/// 模糊测试目标:输入是任意字符串,合法 JSON 且带字符串 version 字段才算通过。
pub fn parse_and_validate(json: &str) -> bool {
    match validate_json(json) {
        Ok(v) => v.get("version").is_some_and(|x| x.is_string()),
        Err(_) => false,
    }
}

/// 读取数据文件。不存在返回 None,损坏等其他错误返回 Err。
pub fn load_json(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读取失败: {e}")),
    }
}

/// 原子保存:先写临时文件,再把旧文件拷贝为 .bak,最后用一次 rename 原子替换。
/// 这样任何时刻数据文件本身都存在(崩溃最坏只损失 .bak 缺失或滞后一版)。
pub fn save_json(path: &Path, json: &str) -> Result<(), String> {
    validate_json(json)?;
    let dir = path.parent().ok_or_else(|| "路径无效".to_string())?;
    std::fs::create_dir_all(dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("写入临时文件失败: {e}"))?;
    if path.exists() {
        let bak = path.with_extension("json.bak");
        let _ = std::fs::copy(path, &bak);
    }
    std::fs::rename(&tmp, path).map_err(|e| format!("替换数据文件失败: {e}"))?;
    Ok(())
}

/// 导出到用户选择的路径(分享用)。
pub fn export_to(path: &Path, json: &str) -> Result<(), String> {
    validate_json(json)?;
    std::fs::write(path, json).map_err(|e| format!("导出失败: {e}"))
}

/// 从用户选择的路径导入。
pub fn import_from(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("导入失败: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tempdir() -> tempfile::TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    #[test]
    fn resolve_prefers_writable_exe_dir() {
        let dir = tempdir();
        let exe = dir.path().join("tanalyse");
        let fallback = tempdir();
        let resolved = resolve_data_file(&exe, fallback.path());
        assert_eq!(resolved, dir.path().join(DATA_FILE_NAME));
    }

    #[test]
    fn resolve_falls_back_when_exe_dir_unwritable() {
        let dir = tempdir();
        let readonly = dir.path().join("readonly");
        fs::create_dir_all(&readonly).unwrap();
        let mut perm = fs::metadata(&readonly).unwrap().permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            perm.set_mode(0o555);
            fs::set_permissions(&readonly, perm).unwrap();
        }
        let fallback = tempdir();
        let resolved = resolve_data_file(&readonly.join("tanalyse"), fallback.path());
        assert_eq!(resolved, fallback.path().join(DATA_FILE_NAME));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perm = fs::metadata(&readonly).unwrap().permissions();
            perm.set_mode(0o755);
            fs::set_permissions(&readonly, perm).unwrap();
        }
    }

    #[test]
    fn save_load_roundtrip() {
        let dir = tempdir();
        let path = dir.path().join(DATA_FILE_NAME);
        assert!(matches!(load_json(&path), Ok(None)));
        save_json(&path, r#"{"version":"1.0.0"}"#).unwrap();
        assert_eq!(load_json(&path).unwrap().unwrap(), r#"{"version":"1.0.0"}"#);
    }

    #[test]
    fn save_rejects_invalid_json() {
        let dir = tempdir();
        let path = dir.path().join(DATA_FILE_NAME);
        assert!(save_json(&path, "{oops").is_err());
        assert!(!path.exists());
    }

    #[test]
    fn save_rotates_backup() {
        let dir = tempdir();
        let path = dir.path().join(DATA_FILE_NAME);
        save_json(&path, r#"{"version":"1.0.0"}"#).unwrap();
        save_json(&path, r#"{"version":"1.0.1"}"#).unwrap();
        let bak = path.with_extension("json.bak");
        assert!(bak.exists());
        assert!(load_json(&bak).unwrap().unwrap().contains("1.0.0"));
        assert!(load_json(&path).unwrap().unwrap().contains("1.0.1"));
    }

    #[test]
    fn save_creates_missing_dirs() {
        let dir = tempdir();
        let path = dir.path().join("a/b/c").join(DATA_FILE_NAME);
        save_json(&path, "null").unwrap();
        assert!(path.exists());
    }

    #[test]
    fn export_import_roundtrip() {
        let dir = tempdir();
        let path = dir.path().join("share.json");
        export_to(&path, r#"{"version":"1.0.0","entries":{}}"#).unwrap();
        assert_eq!(
            import_from(&path).unwrap(),
            r#"{"version":"1.0.0","entries":{}}"#
        );
    }

    #[test]
    fn parse_and_validate_accepts_only_versioned_json() {
        assert!(parse_and_validate(r#"{"version":"1.0.0"}"#));
        assert!(!parse_and_validate(r#"{"nope":1}"#));
        assert!(!parse_and_validate("{broken"));
        assert!(!parse_and_validate(""));
    }
}
