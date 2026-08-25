mod catalog;
mod import_catalog;
mod ops;
mod reports;
mod session;
mod system;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use r2d2::PooledConnection;
use r2d2_sqlite::SqliteConnectionManager;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

pub use catalog::*;
pub use import_catalog::*;
pub use ops::*;
pub use reports::*;
pub use session::*;
pub use system::*;

pub struct AppState {
    pub pool: Mutex<DbPool>,
    pub backup_lock: Mutex<()>,
    pub shutting_down: AtomicBool,
    pub backup_running: AtomicBool,
}

impl AppState {
    pub fn new(pool: DbPool) -> Self {
        Self {
            pool: Mutex::new(pool),
            backup_lock: Mutex::new(()),
            shutting_down: AtomicBool::new(false),
            backup_running: AtomicBool::new(false),
        }
    }
}

struct RunningGuard<'a>(&'a AtomicBool);
impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub fn with_backup_op<T>(state: &AppState, f: impl FnOnce() -> AppResult<T>) -> AppResult<T> {
    if state.shutting_down.load(Ordering::SeqCst) {
        return Err(AppError::user("النظام يُغلق الآن."));
    }
    if state
        .backup_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::user("عملية نسخ أو استعادة قيد التنفيذ."));
    }
    let _running = RunningGuard(&state.backup_running);
    let _lock = state.backup_lock.lock().unwrap_or_else(|p| p.into_inner());
    f()
}

fn pool_clone(state: &AppState) -> AppResult<DbPool> {
    let guard = state.pool.lock().unwrap_or_else(|p| p.into_inner());
    Ok(guard.clone())
}

pub fn take_conn_from(
    state: &AppState,
) -> AppResult<PooledConnection<SqliteConnectionManager>> {
    if state.shutting_down.load(Ordering::SeqCst) {
        return Err(AppError::user("النظام يُغلق الآن."));
    }
    let pool = pool_clone(state)?;
    let mut delay = 20u64;
    for attempt in 0..6 {
        match pool.get() {
            Ok(c) => return Ok(c),
            Err(e) => {
                let msg = e.to_string().to_lowercase();
                if msg.contains("timeout") || msg.contains("locked") || msg.contains("busy") {
                    if attempt < 5 {
                        std::thread::sleep(Duration::from_millis(delay));
                        delay = (delay * 2).min(400);
                        continue;
                    }
                    tracing::warn!(attempt, "database locked, exhausted retries");
                }
                return Err(AppError::from(e));
            }
        }
    }
    Err(AppError::user("قاعدة البيانات مشغولة. أعد المحاولة."))
}

pub fn take_conn(
    state: &tauri::State<AppState>,
) -> AppResult<PooledConnection<SqliteConnectionManager>> {
    take_conn_from(state)
}

pub fn with_tx<T>(
    state: &tauri::State<AppState>,
    f: impl FnOnce(&rusqlite::Transaction) -> AppResult<T>,
) -> AppResult<T> {
    let mut conn = take_conn(state)?;
    let tx = conn.transaction()?;
    match f(&tx) {
        Ok(value) => {
            tx.commit()?;
            Ok(value)
        }
        Err(e) => {
            tracing::warn!(error_id = %e.error_id, details = %e.details, "transaction rollback");
            let _ = tx.rollback();
            Err(e)
        }
    }
}

pub fn maybe_periodic_backup(state: &AppState) -> AppResult<()> {
    {
        let conn = take_conn_from(state)?;
        if !crate::backup::periodic_due(&conn) {
            return Ok(());
        }
    }
    with_backup_op(state, || {
        let conn = take_conn_from(state)?;
        crate::backup::create_backup(&conn, None, "periodic")?;
        Ok(())
    })
}

pub fn maybe_startup_backup(state: &AppState) -> AppResult<()> {
    {
        let conn = take_conn_from(state)?;
        if !crate::backup::should_startup_backup(&conn) {
            return Ok(());
        }
    }
    with_backup_op(state, || {
        let conn = take_conn_from(state)?;
        crate::backup::create_backup(&conn, None, "startup")?;
        Ok(())
    })
}

pub fn maybe_wal_checkpoint(state: &AppState) -> AppResult<()> {
    let live = crate::paths::db_path();
    let wal = crate::paths::wal_path(&live);
    let wal_size = crate::paths::file_size(&wal);
    if wal_size < 4 * 1024 * 1024 {
        return Ok(());
    }
    let conn = take_conn_from(state)?;
    if wal_size > 32 * 1024 * 1024 {
        tracing::warn!(wal_mb = wal_size / (1024 * 1024), "WAL very large; truncate checkpoint");
        let _ = crate::db::checkpoint_truncate(&conn);
    } else {
        crate::db::checkpoint_passive(&conn)?;
    }
    Ok(())
}

pub fn maybe_incremental_vacuum(state: &AppState) -> AppResult<()> {
    let conn = take_conn_from(state)?;
    let last = crate::util::setting(&conn, "db.last_vacuum_at", "");
    let today = crate::util::today();
    if !last.is_empty() {
        if let Some(days_since) = days_between(&last, &today) {
            if days_since < 7 {
                return Ok(());
            }
        }
    }
    let page_count: i64 = conn
        .query_row("PRAGMA page_count", [], |r| r.get(0))
        .unwrap_or(0);
    let free_pages: i64 = conn
        .query_row("PRAGMA freelist_count", [], |r| r.get(0))
        .unwrap_or(0);
    if free_pages * 100 / page_count.max(1) < 10 {
        return Ok(());
    }
    tracing::info!(free_pages, page_count, "running incremental vacuum");
    conn.execute_batch("PRAGMA incremental_vacuum(2000);")?;
    let _ = crate::util::set_setting(&conn, "db.last_vacuum_at", &today);
    Ok(())
}

fn days_between(from: &str, to: &str) -> Option<i64> {
    let f = chrono::NaiveDate::parse_from_str(from.get(..10)?, "%Y-%m-%d").ok()?;
    let t = chrono::NaiveDate::parse_from_str(to.get(..10)?, "%Y-%m-%d").ok()?;
    Some((t - f).num_days())
}

pub fn graceful_shutdown(state: &AppState) {
    state.shutting_down.store(true, Ordering::SeqCst);
    let started = std::time::Instant::now();
    while state.backup_running.load(Ordering::SeqCst) && started.elapsed() < Duration::from_secs(25)
    {
        std::thread::sleep(Duration::from_millis(100));
    }
    let _lock = state.backup_lock.lock().unwrap_or_else(|p| p.into_inner());
    let pool = state.pool.lock().unwrap_or_else(|p| p.into_inner());
    if let Ok(conn) = pool.get() {
        if crate::backup::should_exit_backup(&conn) {
            tracing::info!("backup on exit");
            let _ = crate::backup::create_backup(&conn, None, "exit");
        }
        let _ = crate::db::checkpoint_truncate(&conn);
    }
    crate::paths::mark_runtime_clean();
    tracing::info!("database closed");
}
