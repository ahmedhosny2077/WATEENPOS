use crate::error::{AppError, AppResult};
use crate::paths;
use crate::util::{now_local, setting};
use rusqlite::Connection;

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../../migrations/001_init.sql")),
    (2, include_str!("../../migrations/002_seed.sql")),
    (3, include_str!("../../migrations/003_payments.sql")),
    (4, include_str!("../../migrations/004_db_protection.sql")),
    (5, include_str!("../../migrations/005_more_settings.sql")),
    (6, include_str!("../../migrations/006_settings_ui.sql")),
    (7, include_str!("../../migrations/007_nav_collapse.sql")),
    (8, include_str!("../../migrations/008_pos_search_indexes.sql")),
    (9, include_str!("../../migrations/009_sales_customer_index.sql")),
    (10, include_str!("../../migrations/010_pos_display_mode.sql")),
    (11, include_str!("../../migrations/011_stability_indexes.sql")),
    (12, include_str!("../../migrations/012_auto_vacuum.sql")),
];

pub fn run(conn: &Connection) -> AppResult<i64> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        );",
    )?;
    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    for (version, sql) in MIGRATIONS {
        if *version <= current {
            continue;
        }
        auto_backup_before_migrate(conn, current)?;
        let tx = conn.unchecked_transaction()?;
        if let Err(e) = tx.execute_batch(sql) {
            tracing::error!(version, error = %e, "migration failed; rolling back");
            return Err(AppError::tech(
                "فشل تحديث قاعدة البيانات. لم يتم تغيير بياناتك.",
                e.to_string(),
            ));
        }
        tx.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES(?1, ?2)",
            rusqlite::params![version, now_local()],
        )?;
        tx.commit()?;
        tracing::info!(version, "applied database migration");
    }
    let latest = MIGRATIONS.last().map(|m| m.0).unwrap_or(0);
    Ok(latest)
}

fn auto_backup_before_migrate(conn: &Connection, current: i64) -> AppResult<()> {
    if current == 0 {
        return Ok(());
    }
    if setting(conn, "backup.before_migrate", "1") == "0" {
        return Ok(());
    }
    paths::ensure_dirs()?;
    let dest = paths::backups_dir().join("emergency").join(format!(
        "backup_{}_pre-migrate-v{}.sqlite",
        chrono::Local::now().format("%Y-%m-%d_%H-%M-%S"),
        current
    ));
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    tracing::info!(dest = %dest.display(), from_version = current, "emergency backup before migration");
    conn.backup(rusqlite::DatabaseName::Main, &dest, None)
        .map_err(|e| AppError::tech("فشل نسخة الطوارئ قبل التحديث.", e.to_string()))?;
    let check = Connection::open(&dest)
        .ok()
        .and_then(|c| {
            c.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
                .ok()
        })
        .unwrap_or_default();
    if check != "ok" {
        let _ = std::fs::remove_file(&dest);
        tracing::error!("pre-migrate backup failed integrity; aborting migration");
        return Err(AppError::tech(
            "تعذر إنشاء نسخة طوارئ قبل التحديث. لم يتم تغيير البيانات.",
            check,
        ));
    }
    let _ = conn.execute(
        "INSERT INTO backups(created_at, path, kind, schema_version, is_valid, notes)
         VALUES(?1,?2,'pre-migrate',?3,1,'emergency before schema migration')",
        rusqlite::params![now_local(), dest.to_string_lossy().to_string(), current],
    );
    Ok(())
}

pub fn current_version(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}
