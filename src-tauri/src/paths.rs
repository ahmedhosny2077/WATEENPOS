use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};

pub fn data_dir() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs_fallback());
    let new_dir = base.join("WateenPOS");
    let old_dir = base.join("CosmeticsPOS");
    if !new_dir.exists() && old_dir.exists() {
        let _ = std::fs::rename(&old_dir, &new_dir);
    }
    new_dir
}

fn dirs_fallback() -> PathBuf {
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
    PathBuf::from(home)
        .join("AppData")
        .join("Roaming")
        .join("WateenPOS")
}

pub fn db_path() -> PathBuf {
    data_dir().join("data.db")
}

pub fn images_dir() -> PathBuf {
    data_dir().join("images").join("products")
}

pub fn backups_dir() -> PathBuf {
    data_dir().join("backups")
}

pub fn logs_dir() -> PathBuf {
    data_dir().join("logs")
}

pub fn shutdown_state_path() -> PathBuf {
    data_dir().join("runtime.state")
}

pub fn wal_path(db: &Path) -> PathBuf {
    append_suffix(db, "-wal")
}

pub fn shm_path(db: &Path) -> PathBuf {
    append_suffix(db, "-shm")
}

pub fn sidecar_path(file: &Path) -> PathBuf {
    append_suffix(file, ".meta.json")
}

fn append_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

pub fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

pub fn ensure_dirs() -> std::io::Result<()> {
    std::fs::create_dir_all(data_dir())?;
    std::fs::create_dir_all(images_dir())?;
    std::fs::create_dir_all(backups_dir())?;
    std::fs::create_dir_all(logs_dir())?;
    for slot in ["daily", "weekly", "monthly", "emergency"] {
        std::fs::create_dir_all(backups_dir().join(slot))?;
    }
    Ok(())
}

pub fn ensure_backup_slots(root: &Path) -> std::io::Result<()> {
    for slot in ["daily", "weekly", "monthly", "emergency"] {
        std::fs::create_dir_all(root.join(slot))?;
    }
    Ok(())
}

pub fn was_dirty_shutdown() -> bool {
    match std::fs::read_to_string(shutdown_state_path()) {
        Ok(s) => s.trim() == "running",
        Err(_) => false,
    }
}

pub fn mark_runtime_running() {
    if let Err(e) = std::fs::write(shutdown_state_path(), "running") {
        tracing::warn!(error = %e, "could not write runtime state");
    }
}

pub fn mark_runtime_clean() {
    if let Err(e) = std::fs::write(shutdown_state_path(), "clean") {
        tracing::warn!(error = %e, "could not mark clean shutdown");
    }
}

/// Replace `dest` with `src` on the same volume. On Windows this uses MoveFileEx
/// so the destination is never left as a truncated 0-byte file.
pub fn atomic_replace(src: &Path, dest: &Path) -> AppResult<()> {
    if src == dest {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let src_s = HSTRING::from(src.to_string_lossy().as_ref());
        let dest_s = HSTRING::from(dest.to_string_lossy().as_ref());
        unsafe {
            MoveFileExW(
                &src_s,
                &dest_s,
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
            .map_err(|e| AppError::tech("تعذر استبدال ملف قاعدة البيانات.", e.to_string()))?;
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        if dest.exists() {
            std::fs::remove_file(dest)?;
        }
        std::fs::rename(src, dest)?;
        Ok(())
    }
}

pub fn move_db_set(from: &Path, to: &Path) -> AppResult<()> {
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(from, to)?;
    let wal = wal_path(from);
    if wal.exists() {
        if let Err(e) = std::fs::rename(&wal, wal_path(to)) {
            tracing::warn!(error = %e, "could not move WAL with database file");
        }
    }
    let shm = shm_path(from);
    if shm.exists() {
        if let Err(e) = std::fs::rename(&shm, shm_path(to)) {
            tracing::warn!(error = %e, "could not move SHM with database file");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_replace_overwrites_dest() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src.db");
        let dest = dir.path().join("dest.db");
        std::fs::write(&src, b"new-contents").unwrap();
        std::fs::write(&dest, b"old").unwrap();
        atomic_replace(&src, &dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"new-contents");
        assert!(!src.exists());
    }
}
