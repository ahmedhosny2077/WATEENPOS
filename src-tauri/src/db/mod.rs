mod migrate;

use crate::error::{AppError, AppResult};
use crate::paths;
use crate::util::{now_local, set_setting, setting};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

const PRAGMAS: &str = "
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=8000;
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    PRAGMA temp_store=MEMORY;
    PRAGMA cache_size=-20000;
    PRAGMA mmap_size=67108864;
    PRAGMA wal_autocheckpoint=1000;
";

pub fn open_pool(db_file: &Path) -> AppResult<DbPool> {
    let manager = SqliteConnectionManager::file(db_file).with_init(|c| {
        c.execute_batch(PRAGMAS)?;
        Ok(())
    });
    Pool::builder()
        .max_size(8)
        .connection_timeout(std::time::Duration::from_secs(8))
        .build(manager)
        .map_err(|e| AppError::tech("تعذر فتح قاعدة البيانات.", e.to_string()))
}

pub fn open_idle_pool() -> AppResult<DbPool> {
    let manager = SqliteConnectionManager::memory().with_init(|c| {
        c.execute_batch("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;")?;
        Ok(())
    });
    Pool::builder()
        .max_size(1)
        .build(manager)
        .map_err(|e| AppError::tech("تعذر تجهيز اتصال مؤقت.", e.to_string()))
}

pub fn initialize() -> AppResult<DbPool> {
    paths::ensure_dirs().map_err(|e| AppError::tech("تعذر إنشاء مجلد البيانات.", e.to_string()))?;
    let db_file = paths::db_path();
    recover_missing_live_file(&db_file)?;
    let existed = db_file.exists();
    let dirty = paths::was_dirty_shutdown();
    if dirty {
        tracing::warn!("crash recovery: previous shutdown was not clean");
    }
    if !existed {
        Connection::open(&db_file)?;
        tracing::info!(path = %db_file.display(), "created new sqlite database");
    }
    paths::mark_runtime_running();
    let pool = open_pool(&db_file)?;
    {
        let conn = pool.get()?;
        tracing::info!(
            path = %db_file.display(),
            sqlite = %sqlite_version(&conn),
            dirty_shutdown = dirty,
            "database opened"
        );
        migrate::run(&conn)?;
        record_dirty_start(&conn, dirty);
        let do_full = dirty || setting(&conn, "db.integrity_on_start", "1") != "0";
        startup_health(&conn, do_full, dirty)?;
    }
    maybe_checkpoint_large_wal(&db_file, &pool);
    Ok(pool)
}

fn recover_missing_live_file(db_file: &Path) -> AppResult<()> {
    if db_file.exists() {
        return Ok(());
    }
    let emergency = paths::backups_dir().join("emergency");
    let Ok(entries) = std::fs::read_dir(&emergency) else {
        return Ok(());
    };
    let mut candidates: Vec<_> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("replaced_") && n.ends_with(".sqlite"))
                .unwrap_or(false)
        })
        .collect();
    candidates.sort();
    if let Some(last) = candidates.last() {
        tracing::error!(
            candidate = %last.display(),
            "live database missing after interrupted replace; restoring the aside copy"
        );
        paths::move_db_set(last, db_file)?;
    }
    Ok(())
}

fn startup_health(conn: &Connection, full: bool, dirty: bool) -> AppResult<()> {
    verify_core_schema(conn)?;
    match quick_check(conn) {
        Ok(()) => {
            let _ = set_setting(conn, "db.last_quick_check_at", &now_local());
        }
        Err(e) => {
            tracing::error!(details = %e.details, "quick_check failed");
            let _ = raw_copy_corrupt_snapshot();
            return Err(e);
        }
    }
    if full {
        match integrity_check(conn) {
            Ok(()) => {
                let _ = set_setting(conn, "db.last_integrity_at", &now_local());
                tracing::info!("integrity check ok");
            }
            Err(e) => {
                tracing::error!(details = %e.details, "integrity check failed — not auto-restoring");
                let _ = raw_copy_corrupt_snapshot();
                return Err(e);
            }
        }
    }
    if dirty {
        tracing::info!("crash recovery: current database passed health checks; no automatic restore");
        stock_reconciliation_check(conn);
    }
    Ok(())
}

fn stock_reconciliation_check(conn: &Connection) {
    match crate::inventory::reconcile_stock(conn) {
        Ok(mismatches) if mismatches.is_empty() => {
            tracing::info!("stock reconciliation: all balances match movement history");
        }
        Ok(mismatches) => {
            tracing::warn!(
                count = mismatches.len(),
                "stock reconciliation: found drifted balances after dirty shutdown — auto-correcting"
            );
            if let Err(e) = crate::inventory::auto_fix_stock_drift(conn, None) {
                tracing::error!(details = %e.details, "stock drift auto-fix failed");
            }
        }
        Err(e) => {
            tracing::warn!(details = %e.details, "stock reconciliation check skipped");
        }
    }
}

fn raw_copy_corrupt_snapshot() -> std::io::Result<()> {
    let live = paths::db_path();
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let dest_dir = paths::backups_dir()
        .join("emergency")
        .join(format!("corrupt-raw-{stamp}"));
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join("data.db");
    std::fs::copy(&live, &dest)?;
    let wal = paths::wal_path(&live);
    if wal.exists() {
        let _ = std::fs::copy(&wal, dest_dir.join("data.db-wal"));
    }
    let shm = paths::shm_path(&live);
    if shm.exists() {
        let _ = std::fs::copy(&shm, dest_dir.join("data.db-shm"));
    }
    tracing::warn!(dest = %dest_dir.display(), "raw snapshot of suspect database copied to emergency");
    Ok(())
}

fn maybe_checkpoint_large_wal(db_file: &Path, pool: &DbPool) {
    let wal = paths::wal_path(db_file);
    let size = paths::file_size(&wal);
    const LIMIT: u64 = 8 * 1024 * 1024;
    if size > LIMIT {
        if let Ok(conn) = pool.get() {
            tracing::info!(wal_bytes = size, "WAL is large; running passive checkpoint");
            let _ = checkpoint_passive(&conn);
        }
    }
}

pub fn sqlite_version(conn: &Connection) -> String {
    conn.query_row("SELECT sqlite_version()", [], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "unknown".into())
}

pub fn quick_check(conn: &Connection) -> AppResult<()> {
    let result: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if result != "ok" {
        return Err(AppError::tech(
            "تم اكتشاف مشكلة محتملة في قاعدة البيانات. أنشئ نسخة طوارئ ثم استعد من آخر نسخة صالحة.",
            result,
        ));
    }
    Ok(())
}

pub fn integrity_check(conn: &Connection) -> AppResult<()> {
    let result: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if result != "ok" {
        return Err(AppError::tech(
            "قاعدة البيانات تالفة. استخدمي الاستعادة من نسخة احتياطية صالحة. لم يتم حذف أي بيانات.",
            result,
        ));
    }
    Ok(())
}

pub fn verify_core_schema(conn: &Connection) -> AppResult<()> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sales'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if n == 0 {
        return Err(AppError::tech(
            "جداول النظام غير مكتملة.",
            "missing sales table",
        ));
    }
    Ok(())
}

pub fn checkpoint_passive(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);")?;
    Ok(())
}

pub fn checkpoint_truncate(conn: &Connection) -> AppResult<()> {
    match conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);") {
        Ok(()) => Ok(()),
        Err(e) => {
            tracing::warn!(error = %e, "TRUNCATE checkpoint failed; trying PASSIVE");
            checkpoint_passive(conn)
        }
    }
}

pub fn initialize_at(db_file: &Path) -> AppResult<DbPool> {
    if let Some(parent) = db_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let pool = open_pool(db_file)?;
    let conn = pool.get()?;
    migrate::run(&conn)?;
    Ok(pool)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbHealth {
    pub ok: bool,
    pub dirty_shutdown: bool,
    pub path: String,
    pub sqlite_version: String,
    pub schema_version: i64,
    pub app_version: String,
    pub journal_mode: String,
    pub synchronous: String,
    pub foreign_keys: bool,
    pub busy_timeout_ms: i64,
    pub wal_autocheckpoint: i64,
    pub db_size_bytes: u64,
    pub wal_size_bytes: u64,
    pub last_integrity_at: String,
    pub last_quick_check_at: String,
    pub last_backup_at: String,
    pub last_backup_path: String,
    pub warning: Option<String>,
}

pub fn health_report(conn: &Connection) -> AppResult<DbHealth> {
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .unwrap_or_else(|_| "unknown".into());
    let sync_code: i64 = conn
        .query_row("PRAGMA synchronous", [], |r| r.get(0))
        .unwrap_or(0);
    let synchronous = match sync_code {
        0 => "OFF",
        1 => "NORMAL",
        2 => "FULL",
        3 => "EXTRA",
        _ => "unknown",
    }
    .to_string();
    let foreign_keys: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
        .unwrap_or(0);
    let busy_timeout_ms: i64 = conn
        .query_row("PRAGMA busy_timeout", [], |r| r.get(0))
        .unwrap_or(5000);
    let wal_autocheckpoint: i64 = conn
        .query_row("PRAGMA wal_autocheckpoint", [], |r| r.get(0))
        .unwrap_or(0);
    let live = paths::db_path();
    let (last_backup_at, last_backup_path) = conn
        .query_row(
            "SELECT created_at, path FROM backups WHERE is_valid=1 ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .unwrap_or_default();
    let warning = if synchronous == "OFF" {
        Some("synchronous=OFF غير مسموح — سلامة البيانات في خطر.".into())
    } else if journal_mode.to_lowercase() != "wal" {
        Some(format!("وضع اليومية الحالي {journal_mode} وليس WAL."))
    } else if foreign_keys == 0 {
        Some("المفاتيح الأجنبية غير مفعّلة.".into())
    } else {
        None
    };
    let dirty_shutdown = setting(conn, "db.last_start_was_dirty", "0") == "1";
    Ok(DbHealth {
        ok: warning.is_none(),
        dirty_shutdown,
        path: live.to_string_lossy().to_string(),
        sqlite_version: sqlite_version(conn),
        schema_version: migrate::current_version(conn),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        journal_mode,
        synchronous,
        foreign_keys: foreign_keys != 0,
        busy_timeout_ms,
        wal_autocheckpoint,
        db_size_bytes: paths::file_size(&live),
        wal_size_bytes: paths::file_size(&paths::wal_path(&live)),
        last_integrity_at: setting(conn, "db.last_integrity_at", ""),
        last_quick_check_at: setting(conn, "db.last_quick_check_at", ""),
        last_backup_at,
        last_backup_path,
        warning,
    })
}

pub fn record_dirty_start(conn: &Connection, dirty: bool) {
    let _ = set_setting(conn, "db.last_start_was_dirty", if dirty { "1" } else { "0" });
}

pub fn schema_version(conn: &Connection) -> i64 {
    migrate::current_version(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pragmas_prefer_integrity() {
        let dir = tempfile::tempdir().unwrap();
        let pool = initialize_at(&dir.path().join("t.db")).unwrap();
        let conn = pool.get().unwrap();
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode.to_lowercase(), "wal");
        let sync: i64 = conn
            .query_row("PRAGMA synchronous", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sync, 2, "FULL");
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
        let version = schema_version(&conn);
        assert!(version >= 4);
    }
}
