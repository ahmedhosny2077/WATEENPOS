//! Full-program backup: SQLite snapshot plus every data file (images, license, imports).
//!
//! The live database is copied with SQLite's Online Backup API so WAL is consistent.
//! Sidecar files under the data directory are packed into the same zip so a restore
//! brings back the store logo, product images, license, and catalog dumps.

use crate::db;
use crate::error::{AppError, AppResult};
use crate::paths;
use crate::util::{now_local, set_setting, setting, setting_i64};
use chrono::Datelike;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

fn op_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRow {
    pub id: i64,
    pub created_at: String,
    pub path: String,
    pub file_name: String,
    pub kind: String,
    pub schema_version: i64,
    pub is_valid: bool,
    pub exists: bool,
    pub size_bytes: Option<u64>,
    pub slot: String,
    pub sha256: Option<String>,
    pub app_version: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct BackupMeta {
    created_at: String,
    app_version: String,
    schema_version: i64,
    kind: String,
    slot: String,
    size_bytes: u64,
    sha256: String,
    encrypted: bool,
    #[serde(default)]
    format: String,
    #[serde(default)]
    file_count: u32,
}

pub fn backup_root(conn: &Connection) -> PathBuf {
    let custom = setting(conn, "backup.dir", "");
    let trimmed = custom.trim();
    if trimmed.is_empty() {
        paths::backups_dir()
    } else {
        PathBuf::from(trimmed)
    }
}

pub fn list_recent(conn: &Connection, limit: i64) -> AppResult<Vec<BackupRow>> {
    let sql = if has_column(conn, "backups", "sha256") {
        "SELECT id, created_at, path, kind, schema_version, is_valid,
                IFNULL(slot,''), sha256, size_bytes, app_version
         FROM backups
         ORDER BY id DESC
         LIMIT ?1"
    } else {
        "SELECT id, created_at, path, kind, schema_version, is_valid,
                '', NULL, NULL, NULL
         FROM backups
         ORDER BY id DESC
         LIMIT ?1"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([limit], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, i64>(5)?,
            r.get::<_, String>(6)?,
            r.get::<_, Option<String>>(7)?,
            r.get::<_, Option<i64>>(8)?,
            r.get::<_, Option<String>>(9)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, created_at, path, kind, schema_version, is_valid, slot, sha256, size_col, app_version) =
            row?;
        let p = PathBuf::from(&path);
        let file_name = p
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        let meta = std::fs::metadata(&p).ok();
        out.push(BackupRow {
            id,
            created_at,
            path,
            file_name,
            kind,
            schema_version,
            is_valid: is_valid != 0,
            exists: meta.is_some(),
            size_bytes: size_col
                .map(|n| n as u64)
                .or_else(|| meta.map(|m| m.len())),
            slot: if slot.is_empty() {
                "daily".into()
            } else {
                slot
            },
            sha256,
            app_version,
        });
    }
    Ok(out)
}

pub fn delete_backup(conn: &Connection, id: i64) -> AppResult<()> {
    let path: String = conn
        .query_row("SELECT path FROM backups WHERE id=?1", [id], |r| r.get(0))
        .map_err(|_| AppError::user("النسخة غير موجودة في السجل."))?;
    let file = PathBuf::from(&path);
    let live = paths::db_path();
    let same_live = file
        .canonicalize()
        .ok()
        .zip(live.canonicalize().ok())
        .map(|(a, b)| a == b)
        .unwrap_or(false);
    if same_live {
        return Err(AppError::user("لا يمكن حذف قاعدة البيانات الحالية."));
    }
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| {
            AppError::tech("تعذر حذف ملف النسخة.", e.to_string())
        })?;
    }
    let _ = std::fs::remove_file(paths::sidecar_path(&file));
    conn.execute("DELETE FROM backups WHERE id=?1", [id])?;
    Ok(())
}

pub fn create_backup(conn: &Connection, dest: Option<PathBuf>, kind: &str) -> AppResult<PathBuf> {
    create_backup_with_progress(conn, dest, kind, &mut |_, _| {})
}

pub fn create_backup_with_progress(
    conn: &Connection,
    dest: Option<PathBuf>,
    kind: &str,
    progress: &mut impl FnMut(u8, &'static str),
) -> AppResult<PathBuf> {
    let _guard = op_lock()
        .lock()
        .map_err(|_| AppError::user("عملية نسخ أو استعادة قيد التنفيذ."))?;
    tracing::info!(kind, "backup started");
    match create_backup_inner(conn, dest, kind, progress) {
        Ok(p) => {
            progress(100, "تم حفظ النسخة");
            tracing::info!(path = %p.display(), kind, "backup completed");
            Ok(p)
        }
        Err(e) => {
            tracing::error!(kind, details = %e.details, "backup failed");
            Err(e)
        }
    }
}

fn slot_for_kind(kind: &str) -> &'static str {
    match kind {
        "emergency" | "pre-migrate" | "pre-restore" | "pre-import" => "emergency",
        "periodic" | "startup" | "exit" | "shift-close" | "manual" => "daily",
        _ => "daily",
    }
}

fn stamp_name() -> String {
    format!(
        "backup_{}.zip",
        chrono::Local::now().format("%Y-%m-%d_%H-%M-%S")
    )
}

fn unique_path(dest: PathBuf) -> PathBuf {
    let dest = ensure_zip_ext(dest);
    if !dest.exists() {
        return dest;
    }
    let parent = dest.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = dest
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "backup".into());
    for i in 1..80 {
        let candidate = parent.join(format!("{stem}-{i}.zip"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!(
        "backup_{}.zip",
        chrono::Local::now().format("%Y-%m-%d_%H-%M-%S-%3f")
    ))
}

fn ensure_zip_ext(path: PathBuf) -> PathBuf {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("zip") => path,
        _ => path.with_extension("zip"),
    }
}

fn create_backup_inner(
    conn: &Connection,
    dest: Option<PathBuf>,
    kind: &str,
    progress: &mut impl FnMut(u8, &'static str),
) -> AppResult<PathBuf> {
    paths::ensure_dirs()?;
    progress(6, "جاري تجهيز النسخة");
    let managed = dest.is_none();
    let slot = slot_for_kind(kind);
    let dest = match dest {
        Some(p) => ensure_zip_ext(p),
        None => {
            let root = backup_root(conn);
            paths::ensure_backup_slots(&root)?;
            unique_path(root.join(slot).join(stamp_name()))
        }
    };
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let zip_tmp = {
        let mut t = dest.as_os_str().to_os_string();
        t.push(".partial");
        PathBuf::from(t)
    };
    let sqlite_tmp = {
        let mut t = dest.as_os_str().to_os_string();
        t.push(".db.partial");
        PathBuf::from(t)
    };
    let _ = std::fs::remove_file(&zip_tmp);
    let _ = std::fs::remove_file(&sqlite_tmp);

    progress(22, "نسخ قاعدة البيانات");
    conn.backup(rusqlite::DatabaseName::Main, &sqlite_tmp, None)
        .map_err(|e| AppError::tech("فشل إنشاء النسخة الاحتياطية.", e.to_string()))?;
    if let Err(e) = validate_sqlite_file(&sqlite_tmp, false) {
        let _ = std::fs::remove_file(&sqlite_tmp);
        return Err(e);
    }

    progress(44, "جمع الشعار والملفات");
    let data_root = live_data_dir(conn);
    let files = collect_sidecar_files(&data_root, conn);
    let file_count = files.len() as u32;
    let created_at = now_local();
    let version = db::schema_version(conn);
    let app_version = env!("CARGO_PKG_VERSION").to_string();
    let manifest = serde_json::json!({
        "format": "wateen-pos-full-v1",
        "created_at": created_at,
        "app_version": app_version,
        "schema_version": version,
        "kind": kind,
        "slot": slot,
        "complete": true,
        "file_count": file_count,
        "files": files.iter().map(|(_, rel)| rel.clone()).collect::<Vec<_>>(),
    });

    progress(68, "حفظ الأرشيف");
    if let Err(e) = pack_full_backup(&sqlite_tmp, &files, &zip_tmp, &manifest) {
        let _ = std::fs::remove_file(&zip_tmp);
        let _ = std::fs::remove_file(&sqlite_tmp);
        return Err(e);
    }
    let _ = std::fs::remove_file(&sqlite_tmp);

    progress(84, "التحقق من الملف");
    if let Err(e) = zip_has_database(&zip_tmp) {
        let _ = std::fs::remove_file(&zip_tmp);
        return Err(e);
    }
    paths::atomic_replace(&zip_tmp, &dest)?;

    progress(92, "إنهاء الحفظ");
    let sha = file_sha256(&dest)?;
    let size = paths::file_size(&dest);
    let meta = BackupMeta {
        created_at: created_at.clone(),
        app_version: app_version.clone(),
        schema_version: version,
        kind: kind.to_string(),
        slot: slot.to_string(),
        size_bytes: size,
        sha256: sha.clone(),
        encrypted: false,
        format: "full-zip".into(),
        file_count,
    };
    write_sidecar(&dest, &meta)?;
    record_backup(conn, &dest, kind, slot, version, &sha, size, &app_version, &created_at)?;
    let _ = set_setting(conn, "backup.last_success_at", &created_at);

    if managed {
        promote_retention_copies(conn, &dest)?;
        rotate(conn)?;
    }
    Ok(dest)
}

fn live_data_dir(conn: &Connection) -> PathBuf {
    if let Ok(mut stmt) = conn.prepare("PRAGMA database_list") {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                let name: String = row.get(1).unwrap_or_default();
                let file: String = row.get(2).unwrap_or_default();
                if name == "main" && !file.is_empty() {
                    if let Some(parent) = Path::new(&file).parent() {
                        return parent.to_path_buf();
                    }
                }
            }
        }
    }
    paths::data_dir()
}

fn should_skip_dir(name: &str) -> bool {
    matches!(name, "backups" | "logs" | "imports")
}

fn should_skip_file(name: &str) -> bool {
    matches!(
        name,
        "app.lock" | "runtime.state" | "data.db" | "data.db-wal" | "data.db-shm"
    ) || name.ends_with(".partial")
        || name.ends_with(".tmp")
        || name.ends_with(".tmp.db")
        || name.starts_with("data.restore-")
        || name.starts_with("data.failed-restore-")
}

fn collect_sidecar_files(root: &Path, conn: &Connection) -> Vec<(PathBuf, String)> {
    let mut out = Vec::new();
    walk_payload_dir(root, root, &mut out);
    for name in ["license.dat", ".trial_info"] {
        if let Some(exe) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        {
            let src = exe.join(name);
            if src.exists() && !out.iter().any(|(_, rel)| rel == &format!("files/{name}")) {
                out.push((src, format!("files/{name}")));
            }
        }
    }
    for src in referenced_paths(conn) {
        if !src.exists() {
            continue;
        }
        if is_under(&src, root) {
            continue;
        }
        let name = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".into());
        let rel = format!("files/external/{name}");
        if !out.iter().any(|(_, r)| r == &rel) {
            out.push((src, rel));
        }
    }
    out
}

fn walk_payload_dir(root: &Path, dir: &Path, out: &mut Vec<(PathBuf, String)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            walk_payload_dir(root, &path, out);
            continue;
        }
        if should_skip_file(&name) {
            continue;
        }
        if let Ok(meta) = path.metadata() {
            let under_images = path.components().any(|c| c.as_os_str() == "images");
            if !under_images && meta.len() > 8 * 1024 * 1024 {
                continue;
            }
        }
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        out.push((path, format!("files/{rel}")));
    }
}

fn referenced_paths(conn: &Connection) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let logo = setting(conn, "store.logo_path", "");
    if !logo.trim().is_empty() {
        out.push(PathBuf::from(logo.trim()));
    }
    for sql in [
        "SELECT DISTINCT image_path FROM products WHERE IFNULL(image_path,'') != ''",
        "SELECT DISTINCT image_path FROM product_variants WHERE IFNULL(image_path,'') != ''",
    ] {
        let Ok(mut stmt) = conn.prepare(sql) else {
            continue;
        };
        let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) else {
            continue;
        };
        for path in rows.flatten() {
            if !path.trim().is_empty() {
                out.push(PathBuf::from(path.trim()));
            }
        }
    }
    out
}

fn is_under(child: &Path, parent: &Path) -> bool {
    let Ok(child) = child.canonicalize() else {
        return false;
    };
    let Ok(parent) = parent.canonicalize() else {
        return false;
    };
    child.starts_with(parent)
}

fn pack_full_backup(
    sqlite: &Path,
    files: &[(PathBuf, String)],
    dest: &Path,
    manifest: &serde_json::Value,
) -> AppResult<()> {
    let file = File::create(dest)?;
    let mut zip = ZipWriter::new(file);
    let opts = FileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file("manifest.json", opts)
        .map_err(|e| AppError::tech("تعذر كتابة أرشيف النسخة.", e.to_string()))?;
    let json = serde_json::to_vec_pretty(manifest)
        .map_err(|e| AppError::tech("تعذر حفظ بيان النسخة.", e.to_string()))?;
    zip.write_all(&json)?;

    let stored = FileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file("data.sqlite", stored)
        .map_err(|e| AppError::tech("تعذر كتابة قاعدة البيانات داخل النسخة.", e.to_string()))?;
    let mut src = File::open(sqlite)?;
    std::io::copy(&mut src, &mut zip)?;

    for (src_path, rel) in files {
        if !src_path.exists() {
            continue;
        }
        if zip.start_file(rel, opts).is_err() {
            tracing::warn!(file = %src_path.display(), "skip file in backup (name)");
            continue;
        }
        match File::open(src_path) {
            Ok(mut f) => {
                if let Err(e) = std::io::copy(&mut f, &mut zip) {
                    tracing::warn!(file = %src_path.display(), error = %e, "skip file in backup");
                }
            }
            Err(e) => tracing::warn!(file = %src_path.display(), error = %e, "skip file in backup"),
        }
    }
    zip.finish()
        .map_err(|e| AppError::tech("تعذر إغلاق أرشيف النسخة.", e.to_string()))?;
    Ok(())
}

fn is_zip_backup(path: &Path) -> bool {
    if path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("zip"))
        .unwrap_or(false)
    {
        return true;
    }
    let Ok(mut f) = File::open(path) else {
        return false;
    };
    let mut buf = [0u8; 4];
    f.read_exact(&mut buf).is_ok() && &buf == b"PK\x03\x04"
}

fn write_sidecar(dest: &Path, meta: &BackupMeta) -> AppResult<()> {
    let path = paths::sidecar_path(dest);
    let json = serde_json::to_string_pretty(meta)
        .map_err(|e| AppError::tech("تعذر حفظ بيانات النسخة.", e.to_string()))?;
    std::fs::write(path, json)?;
    Ok(())
}

fn read_sidecar(dest: &Path) -> Option<BackupMeta> {
    let raw = std::fs::read_to_string(paths::sidecar_path(dest)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn record_backup(
    conn: &Connection,
    dest: &Path,
    kind: &str,
    slot: &str,
    version: i64,
    sha: &str,
    size: u64,
    app_version: &str,
    created_at: &str,
) -> AppResult<()> {
    let path = dest.to_string_lossy().to_string();
    if has_column(conn, "backups", "sha256") {
        conn.execute(
            "INSERT INTO backups(created_at, path, kind, schema_version, is_valid, notes, sha256, size_bytes, app_version, slot)
             VALUES(?1,?2,?3,?4,1,?5,?6,?7,?8,?9)",
            params![
                created_at,
                path,
                kind,
                version,
                format!("size={size}"),
                sha,
                size as i64,
                app_version,
                slot
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO backups(created_at, path, kind, schema_version, is_valid, notes)
             VALUES(?1,?2,?3,?4,1,?5)",
            params![created_at, path, kind, version, format!("size={size} sha={sha}")],
        )?;
    }
    Ok(())
}

fn has_column(conn: &Connection, table: &str, col: &str) -> bool {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let rows = stmt.query_map([], |r| r.get::<_, String>(1));
    match rows {
        Ok(rows) => rows.filter_map(|x| x.ok()).any(|name| name == col),
        Err(_) => false,
    }
}

pub fn file_sha256(path: &Path) -> AppResult<String> {
    let mut f = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65_536];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn validate_backup(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::user("ملف النسخة الاحتياطية غير موجود."));
    }
    if is_zip_backup(path) {
        let tmp = path.with_extension("validate.db.tmp");
        let _ = std::fs::remove_file(&tmp);
        extract_sqlite_from_zip(path, &tmp)?;
        let result = validate_sqlite_file(&tmp, true);
        let _ = std::fs::remove_file(&tmp);
        return result;
    }
    validate_sqlite_file(path, true)
}

fn zip_has_database(path: &Path) -> AppResult<()> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| AppError::tech("تعذر فتح أرشيف النسخة.", e.to_string()))?;
    let names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();
    let key = if names.iter().any(|n| n == "data.sqlite") {
        "data.sqlite"
    } else if names.iter().any(|n| n == "data.db") {
        "data.db"
    } else {
        return Err(AppError::user("الأرشيف لا يحتوي على قاعدة البيانات."));
    };
    let entry = archive
        .by_name(key)
        .map_err(|_| AppError::user("الأرشيف لا يحتوي على قاعدة البيانات."))?;
    if entry.size() < 1024 {
        return Err(AppError::user("ملف النسخة صغير بشكل غير طبيعي ولا يمكن استخدامه."));
    }
    Ok(())
}

fn validate_sqlite_file(path: &Path, full: bool) -> AppResult<()> {
    let size = paths::file_size(path);
    if size < 1024 {
        return Err(AppError::user("ملف النسخة صغير بشكل غير طبيعي ولا يمكن استخدامه."));
    }
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| AppError::tech("تعذر فتح ملف النسخة.", e.to_string()))?;
    db::quick_check(&conn)?;
    if full {
        db::integrity_check(&conn)?;
    }
    db::verify_core_schema(&conn)?;
    Ok(())
}

fn extract_sqlite_from_zip(zip_path: &Path, dest: &Path) -> AppResult<()> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| AppError::tech("تعذر فتح أرشيف النسخة.", e.to_string()))?;
    let names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();
    let key = if names.iter().any(|n| n == "data.sqlite") {
        "data.sqlite"
    } else if names.iter().any(|n| n == "data.db") {
        "data.db"
    } else {
        return Err(AppError::user("الأرشيف لا يحتوي على قاعدة البيانات."));
    };
    let mut entry = archive
        .by_name(key)
        .map_err(|_| AppError::user("الأرشيف لا يحتوي على قاعدة البيانات."))?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut out = File::create(dest)?;
    std::io::copy(&mut entry, &mut out)?;
    Ok(())
}

fn restore_payload_files(zip_path: &Path) -> AppResult<u32> {
    let data = paths::data_dir();
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| AppError::tech("تعذر فتح أرشيف النسخة.", e.to_string()))?;
    let mut n = 0u32;
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        if name == "data.sqlite" || name == "data.db" || name == "manifest.json" {
            continue;
        }
        let rel = name.strip_prefix("files/").unwrap_or(name.as_str());
        let Some(dest) = safe_join(&data, rel) else {
            tracing::warn!(name, "skip unsafe path in backup zip");
            continue;
        };
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
        n += 1;
    }
    Ok(n)
}

fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim_start_matches('/');
    let path = Path::new(rel);
    if path.is_absolute() || path.components().any(|c| matches!(c, Component::Prefix(_) | Component::ParentDir | Component::RootDir)) {
        return None;
    }
    Some(base.join(path))
}

fn remap_restored_paths(conn: &Connection) {
    let data = paths::data_dir();
    let images = data.join("images");
    let current = setting(conn, "store.logo_path", "");
    if !current.trim().is_empty() {
        let name = Path::new(current.trim()).file_name();
        if let Some(name) = name {
            let dest = images.join(name);
            if dest.exists() {
                let _ = set_setting(conn, "store.logo_path", &dest.to_string_lossy());
            }
        }
    }
}

fn copy_license_next_to_exe() {
    let Some(exe) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    else {
        return;
    };
    let data = paths::data_dir();
    for name in ["license.dat", ".trial_info"] {
        let src = data.join(name);
        if src.exists() {
            let _ = std::fs::copy(&src, exe.join(name));
        }
    }
}

pub fn verify_backup(path: &Path) -> AppResult<String> {
    validate_backup(path)?;
    let sha = file_sha256(path)?;
    if let Some(meta) = read_sidecar(path) {
        if !meta.sha256.is_empty() && !sha.eq_ignore_ascii_case(&meta.sha256) {
            return Err(AppError::user(
                "بصمة SHA-256 لا تطابق الملف. النسخة قد تكون معدّلة أو تالفة.",
            ));
        }
    }
    Ok(sha)
}

fn promote_retention_copies(conn: &Connection, daily_file: &Path) -> AppResult<()> {
    let root = backup_root(conn);
    let now = chrono::Local::now();
    let name = daily_file
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| stamp_name());
    if !slot_has_same_iso_week(&root.join("weekly"), now) {
        copy_verified(daily_file, &root.join("weekly").join(&name))?;
    }
    if !slot_has_same_month(&root.join("monthly"), now) {
        copy_verified(daily_file, &root.join("monthly").join(&name))?;
    }
    Ok(())
}

fn copy_verified(src: &Path, dest: &Path) -> AppResult<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        return Ok(());
    }
    std::fs::copy(src, dest)?;
    let side = paths::sidecar_path(src);
    if side.exists() {
        let _ = std::fs::copy(&side, paths::sidecar_path(dest));
    }
    Ok(())
}

fn parse_backup_date(path: &Path) -> Option<chrono::NaiveDate> {
    let name = path.file_name()?.to_str()?;
    let rest = name.strip_prefix("backup_")?;
    let date = rest.get(0..10)?;
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

fn slot_has_same_iso_week(dir: &Path, now: chrono::DateTime<chrono::Local>) -> bool {
    let week = now.iso_week();
    list_backup_files(dir).into_iter().any(|p| {
        parse_backup_date(&p)
            .map(|d| {
                let iso = d.iso_week();
                iso.year() == week.year() && iso.week() == week.week()
            })
            .unwrap_or(false)
    })
}

fn slot_has_same_month(dir: &Path, now: chrono::DateTime<chrono::Local>) -> bool {
    list_backup_files(dir).into_iter().any(|p| {
        parse_backup_date(&p)
            .map(|d| d.year() == now.year() && d.month() == now.month())
            .unwrap_or(false)
    })
}

fn list_backup_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return files;
    };
    for e in entries.filter_map(|e| e.ok()) {
        let p = e.path();
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
        if matches!(ext, "zip" | "sqlite" | "backup" | "db") {
            files.push(p);
        }
    }
    files.sort_by_key(|p| std::cmp::Reverse(p.file_name().map(|n| n.to_os_string())));
    files
}

fn rotate(conn: &Connection) -> AppResult<()> {
    let root = backup_root(conn);
    let keep_daily = setting_i64(conn, "backup.keep_daily", 10);
    let keep_weekly = setting_i64(conn, "backup.keep_weekly", 4);
    let keep_monthly = setting_i64(conn, "backup.keep_monthly", 12);
    let keep_emergency = setting_i64(conn, "backup.keep_emergency", 20);
    rotate_dir(&root.join("daily"), keep_daily);
    rotate_dir(&root.join("weekly"), keep_weekly);
    rotate_dir(&root.join("monthly"), keep_monthly);
    rotate_dir(&root.join("emergency"), keep_emergency);
    let legacy_keep = setting_i64(conn, "backup.retention", 14);
    rotate_dir(&root, legacy_keep);
    Ok(())
}

fn rotate_dir(dir: &Path, keep: i64) {
    if keep <= 0 {
        return;
    }
    let mut files = list_backup_files(dir);
    if files.len() as i64 <= keep {
        return;
    }
    files.sort_by_key(|p| {
        std::fs::metadata(p)
            .and_then(|m| m.modified())
            .ok()
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });
    let extra = files.len() - keep as usize;
    for f in files.iter().take(extra) {
        let _ = std::fs::remove_file(f);
        let _ = std::fs::remove_file(paths::sidecar_path(f));
    }
}

pub fn periodic_due(conn: &Connection) -> bool {
    let interval = setting_i64(conn, "backup.interval_minutes", 360);
    if interval <= 0 {
        return false;
    }
    let last = setting(conn, "backup.last_success_at", "");
    if last.is_empty() {
        return true;
    }
    let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(&last, "%Y-%m-%dT%H:%M:%S") else {
        return true;
    };
    use chrono::TimeZone;
    let then = chrono::Local
        .from_local_datetime(&ndt)
        .single()
        .unwrap_or_else(chrono::Local::now);
    chrono::Local::now()
        .signed_duration_since(then)
        .num_minutes()
        >= interval
}

pub fn should_startup_backup(conn: &Connection) -> bool {
    if setting(conn, "backup.auto_on_start", "1") == "0" {
        return false;
    }
    let last = setting(conn, "backup.last_success_at", "");
    if last.starts_with(&crate::util::today()) {
        return false;
    }
    true
}

pub fn should_exit_backup(conn: &Connection) -> bool {
    if setting(conn, "backup.on_exit", "1") == "0" {
        return false;
    }
    let last = setting(conn, "backup.last_success_at", "");
    let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(&last, "%Y-%m-%dT%H:%M:%S") else {
        return true;
    };
    use chrono::TimeZone;
    let then = chrono::Local
        .from_local_datetime(&ndt)
        .single()
        .unwrap_or_else(chrono::Local::now);
    chrono::Local::now()
        .signed_duration_since(then)
        .num_minutes()
        >= 2
}

pub fn restore_to_live(
    pool: &Mutex<db::DbPool>,
    backup_path: &Path,
    mut progress: impl FnMut(u8, &'static str),
) -> AppResult<()> {
    let _guard = op_lock()
        .lock()
        .map_err(|_| AppError::user("عملية نسخ أو استعادة قيد التنفيذ."))?;
    tracing::info!(path = %backup_path.display(), "restore started");
    let result = restore_to_live_inner(pool, backup_path, &mut progress);
    match &result {
        Ok(()) => {
            progress(100, "اكتملت الاستعادة");
            tracing::info!("restore completed");
        }
        Err(e) => tracing::error!(details = %e.details, "restore failed"),
    }
    result
}

fn restore_to_live_inner(
    pool: &Mutex<db::DbPool>,
    backup_path: &Path,
    progress: &mut impl FnMut(u8, &'static str),
) -> AppResult<()> {
    progress(6, "جاري التحقق من ملف النسخة");
    verify_backup(backup_path)?;
    let live = paths::db_path();
    let zip = is_zip_backup(backup_path);

    progress(16, "أخذ نسخة أمان من الوضع الحالي");
    {
        let guard = pool
            .lock()
            .map_err(|_| AppError::user("النظام مشغول."))?;
        let conn = guard
            .get()
            .map_err(|e| AppError::tech("تعذر الاتصال بقاعدة البيانات.", e.to_string()))?;
        create_backup_inner(&conn, None, "emergency", &mut |_, _| {})?;
    }

    progress(32, "قراءة بيانات النسخة");
    let sqlite_src = if zip {
        let extracted = live.with_file_name(format!(
            "data.restore-sqlite-{}.tmp.db",
            uuid::Uuid::new_v4()
        ));
        extract_sqlite_from_zip(backup_path, &extracted)?;
        extracted
    } else {
        backup_path.to_path_buf()
    };

    progress(46, "تجهيز قاعدة البيانات");
    let temp = live.with_file_name(format!("data.restore-{}.tmp.db", uuid::Uuid::new_v4()));
    let _ = std::fs::remove_file(&temp);
    {
        let src = Connection::open_with_flags(&sqlite_src, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| AppError::tech("تعذر فتح النسخة.", e.to_string()))?;
        src.backup(rusqlite::DatabaseName::Main, &temp, None)
            .map_err(|e| AppError::tech("فشلت الاستعادة إلى ملف مؤقت.", e.to_string()))?;
    }
    if zip {
        let _ = std::fs::remove_file(&sqlite_src);
    }
    if let Err(e) = validate_sqlite_file(&temp, true) {
        let _ = std::fs::remove_file(&temp);
        return Err(e);
    }

    progress(62, "استبدال البيانات الحالية");
    {
        let idle = db::open_idle_pool()?;
        let mut guard = pool
            .lock()
            .map_err(|_| AppError::user("النظام مشغول."))?;
        let old = std::mem::replace(&mut *guard, idle);
        drop(old);
    }
    std::thread::sleep(Duration::from_millis(150));

    if live.exists() {
        if let Ok(c) = Connection::open(&live) {
            let _ = db::checkpoint_truncate(&c);
        }
    }

    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let aside = paths::backups_dir()
        .join("emergency")
        .join(format!("replaced_{stamp}.sqlite"));
    if live.exists() {
        paths::move_db_set(&live, &aside)?;
    }

    if let Err(e) = paths::atomic_replace(&temp, &live) {
        if aside.exists() && !live.exists() {
            let _ = paths::move_db_set(&aside, &live);
        }
        return Err(e);
    }

    if let Err(e) = validate_sqlite_file(&live, true) {
        tracing::error!("restored live database failed validation; reverting");
        let failed = live.with_file_name(format!("data.failed-restore-{stamp}.db"));
        let _ = std::fs::rename(&live, &failed);
        if aside.exists() {
            let _ = paths::move_db_set(&aside, &live);
        }
        {
            let mut guard = pool
                .lock()
                .map_err(|_| AppError::user("النظام مشغول."))?;
            *guard = db::open_pool(&live)?;
        }
        return Err(e);
    }

    progress(80, "استعادة الشعار والصور والملفات");
    if zip {
        if let Err(e) = restore_payload_files(backup_path) {
            tracing::warn!(details = %e.details, "restored database but some files could not be copied");
        }
        copy_license_next_to_exe();
    }

    progress(92, "تشغيل البرنامج على النسخة المستعادة");
    {
        let mut guard = pool
            .lock()
            .map_err(|_| AppError::user("النظام مشغول."))?;
        *guard = db::open_pool(&live)?;
        if let Ok(conn) = guard.get() {
            remap_restored_paths(&conn);
        }
    }
    Ok(())
}

pub fn run_maintenance(conn: &Connection) -> AppResult<()> {
    let _guard = op_lock()
        .lock()
        .map_err(|_| AppError::user("عملية نسخ أو استعادة قيد التنفيذ."))?;
    db::quick_check(conn)?;
    db::checkpoint_passive(conn)?;
    rotate(conn)?;
    prune_audit_logs(conn);
    let _ = set_setting(conn, "db.last_quick_check_at", &now_local());
    Ok(())
}

fn prune_audit_logs(conn: &Connection) {
    let keep_days = setting_i64(conn, "audit.keep_days", 365);
    if keep_days <= 0 {
        return;
    }
    let cutoff = chrono::Local::now() - chrono::Duration::days(keep_days);
    let cutoff_str = cutoff.format("%Y-%m-%dT%H:%M:%S").to_string();
    match conn.execute(
        "DELETE FROM audit_logs WHERE occurred_at < ?1",
        [&cutoff_str],
    ) {
        Ok(n) if n > 0 => {
            tracing::info!(deleted = n, keep_days, "pruned old audit logs");
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::set_setting;

    fn test_db() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("data.db");
        crate::db::initialize_at(&file).unwrap();
        let conn = Connection::open(&file).unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )
        .unwrap();
        set_setting(&conn, "backup.dir", dir.path().join("backups").to_str().unwrap()).unwrap();
        (dir, conn)
    }

    #[test]
    fn backup_is_valid_and_checksummed() {
        let (_dir, conn) = test_db();
        let path = create_backup(&conn, None, "manual").unwrap();
        assert!(path.exists());
        validate_backup(&path).unwrap();
        let sha = verify_backup(&path).unwrap();
        assert_eq!(sha.len(), 64);
        let meta = read_sidecar(&path).expect("sidecar");
        assert_eq!(meta.sha256, sha);
        assert!(!meta.encrypted);
    }

    #[test]
    fn restore_to_temp_keeps_integrity() {
        let dir = tempfile::tempdir().unwrap();
        let live = dir.path().join("live.db");
        crate::db::initialize_at(&live).unwrap();
        let conn = Connection::open(&live).unwrap();
        set_setting(&conn, "store.name", "original").unwrap();
        let backup = create_backup(&conn, Some(dir.path().join("b.zip")), "manual").unwrap();
        set_setting(&conn, "store.name", "changed").unwrap();
        drop(conn);

        let restored = dir.path().join("restored.db");
        extract_sqlite_from_zip(&backup, &restored).unwrap();
        validate_sqlite_file(&restored, true).unwrap();
        let check = Connection::open(&restored).unwrap();
        let name = crate::util::setting(&check, "store.name", "");
        assert_eq!(name, "original");
    }

    #[test]
    fn rotation_keeps_last_n_daily() {
        let (_dir, conn) = test_db();
        set_setting(&conn, "backup.keep_daily", "2").unwrap();
        set_setting(&conn, "backup.keep_weekly", "99").unwrap();
        set_setting(&conn, "backup.keep_monthly", "99").unwrap();
        let root = backup_root(&conn);
        for kind in ["manual", "periodic", "startup"] {
            create_backup(&conn, None, kind).unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        rotate(&conn).unwrap();
        let daily = list_backup_files(&root.join("daily"));
        assert!(daily.len() <= 2, "daily files: {}", daily.len());
    }

    #[test]
    fn backup_includes_sidecar_files() {
        let (dir, conn) = test_db();
        let images = dir.path().join("images");
        std::fs::create_dir_all(&images).unwrap();
        let logo = images.join("store-logo-test.png");
        std::fs::write(&logo, b"fakepng").unwrap();
        set_setting(&conn, "store.logo_path", logo.to_str().unwrap()).unwrap();
        let path = create_backup(&conn, None, "manual").unwrap();
        assert_eq!(path.extension().and_then(|e| e.to_str()), Some("zip"));
        let file = File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();
        assert!(names.iter().any(|n| n == "data.sqlite"), "{names:?}");
        assert!(
            names.iter().any(|n| n.contains("store-logo-test.png")),
            "{names:?}"
        );
        let _ = archive.by_name("manifest.json").unwrap();
    }

    #[test]
    fn reject_corrupt_tiny_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("bad.sqlite");
        std::fs::write(&p, b"nope").unwrap();
        assert!(validate_backup(&p).is_err());
    }

    #[test]
    fn checksum_mismatch_is_rejected() {
        let (_dir, conn) = test_db();
        let path = create_backup(&conn, None, "manual").unwrap();
        let mut meta = read_sidecar(&path).unwrap();
        meta.sha256 = "0".repeat(64);
        write_sidecar(&path, &meta).unwrap();
        assert!(verify_backup(&path).is_err());
        validate_backup(&path).unwrap();
    }

    #[test]
    fn delete_backup_removes_file_and_row() {
        let (_dir, conn) = test_db();
        let path = create_backup(&conn, None, "manual").unwrap();
        assert!(path.exists());
        let id: i64 = conn
            .query_row("SELECT id FROM backups ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
            .unwrap();
        delete_backup(&conn, id).unwrap();
        assert!(!path.exists());
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM backups WHERE id=?1", [id], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
