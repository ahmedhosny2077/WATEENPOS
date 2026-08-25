use crate::error::{AppError, AppResult};
use crate::paths;
use std::fs::{File, OpenOptions};
use std::path::Path;

/// Keeps an exclusive lock file open so a second POS process cannot share the live WAL.
pub struct InstanceLock {
    _file: File,
}

pub fn acquire() -> AppResult<InstanceLock> {
    paths::ensure_dirs()?;
    acquire_at(&paths::data_dir().join("app.lock"))
}

pub fn acquire_at(path: &Path) -> AppResult<InstanceLock> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut opts = OpenOptions::new();
    opts.create(true).read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        opts.share_mode(0);
    }
    let file = opts.open(path).map_err(|_| {
        AppError::user("البرنامج يعمل بالفعل. أغلق النسخة الأخرى ثم أعد المحاولة.")
    })?;
    tracing::info!(path = %path.display(), "instance lock acquired");
    Ok(InstanceLock { _file: file })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_process_cannot_take_lock() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.lock");
        let first = acquire_at(&path).unwrap();
        let second = acquire_at(&path);
        assert!(second.is_err(), "second instance must be rejected");
        drop(first);
        assert!(acquire_at(&path).is_ok());
    }
}
