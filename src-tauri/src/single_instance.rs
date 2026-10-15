//! 单实例守卫:同一份数据文件只允许一个可写实例。
//!
//! 用数据文件同目录下的 `*.lock` 做 OS 级排他文件锁(`std::fs::File::try_lock`)。
//! 锁随进程结束由内核自动释放,所以崩溃不会留下"死锁",最多留一个无害的空文件。
//! 两个实例各自把整份数据读进内存再整体写回,后写者会覆盖先写者——这正是要挡的;
//! 拿不到锁的一方改为只读启动,提示用户并拒绝写入。

use std::fs::{File, OpenOptions, TryLockError};
use std::path::{Path, PathBuf};

/// 持有中的实例锁。必须存活到进程结束(交给 Tauri 托管),锁才持续有效。
pub struct InstanceLock {
    /// 只为持有文件描述符:锁随它一起释放;内容不参与判定。
    _file: File,
    path: PathBuf,
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        // 正常退出时清掉锁文件;异常退出时文件锁已由内核释放,残留文件也无害。
        let _ = std::fs::remove_file(&self.path);
    }
}

/// 尝试独占实例锁:
/// - `Ok(Some(lock))`:拿到锁,本实例可写;
/// - `Ok(None)`:已被其它实例占用,应只读启动;
/// - `Err(_)`:锁文件建不出来(如目录只读),不阻塞启动——真正的写失败会在保存时暴露。
pub fn try_acquire(data_file: &Path) -> std::io::Result<Option<InstanceLock>> {
    let path = lock_path(data_file);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false) // 只借文件描述符持有锁,不写内容、不截断
        .read(true)
        .write(true)
        .open(&path)?;
    match file.try_lock() {
        Ok(()) => Ok(Some(InstanceLock { _file: file, path })),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(e)) => Err(e),
    }
}

/// 锁文件与数据文件同目录同名前缀:`tanalyse-data.json` → `tanalyse-data.json.lock`。
fn lock_path(data_file: &Path) -> PathBuf {
    let mut name = data_file
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".lock");
    data_file.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_path_appends_suffix() {
        let p = lock_path(Path::new("/data/tanalyse-data.json"));
        assert_eq!(p, Path::new("/data/tanalyse-data.json.lock"));
    }

    #[test]
    fn second_acquire_is_rejected_until_first_released() {
        let dir = tempfile::tempdir().expect("tempdir");
        let data = dir.path().join("tanalyse-data.json");

        let first = try_acquire(&data)
            .expect("acquire first")
            .expect("first lock");
        // 已持有锁时,再次获取(等价于另一个实例)应被拒绝
        assert!(try_acquire(&data).expect("acquire second").is_none());

        drop(first);
        // 释放后应能重新拿到;同时验证锁文件在 Drop 时被清掉
        assert!(!lock_path(&data).exists());
        assert!(try_acquire(&data).expect("reacquire").is_some());
    }
}
