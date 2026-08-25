use super::{take_conn, take_conn_from, with_backup_op, with_tx, AppState};
use crate::audit;
use crate::auth;
use crate::backup;
use crate::error::{AppError, AppResult};
use crate::paths;
use crate::printing::{self, ReceiptData, ReceiptLine};
use crate::util::{self, setting, setting_i64, set_setting, store_address_line, store_phone_line, store_receipt_footer, store_tax_line};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> AppResult<HashMap<String, String>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let mut map = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<Result<HashMap<_, _>, _>>()?;
    if let Ok(n) = conn.query_row(
        "SELECT next_value FROM sequences WHERE name='sale'",
        [],
        |r| r.get::<_, i64>(0),
    ) {
        map.insert("invoice.next_number".into(), n.to_string());
    }
    Ok(map)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub db_path: String,
    pub backups_dir: String,
    pub logs_dir: String,
    pub sqlite_version: String,
    pub db_size_bytes: u64,
    pub wal_size_bytes: u64,
}

#[tauri::command]
pub fn app_info(state: State<AppState>) -> AppResult<AppInfo> {
    let conn = take_conn(&state)?;
    let backups_dir = backup::backup_root(&conn);
    let live = paths::db_path();
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: paths::data_dir().to_string_lossy().to_string(),
        db_path: live.to_string_lossy().to_string(),
        backups_dir: backups_dir.to_string_lossy().to_string(),
        logs_dir: paths::logs_dir().to_string_lossy().to_string(),
        sqlite_version: crate::db::sqlite_version(&conn),
        db_size_bytes: paths::file_size(&live),
        wal_size_bytes: paths::file_size(&paths::wal_path(&live)),
    })
}

#[tauri::command]
pub fn save_settings(
    state: State<AppState>,
    values: HashMap<String, String>,
    override_pin: Option<String>,
) -> AppResult<()> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "settings.manage", override_pin.as_deref())?;
        if let Some(name) = values.get("store.name").map(|s| s.trim().to_string()) {
            if !name.is_empty() {
                tx.execute(
                    "UPDATE locations SET name = ?1, updated_at = ?2 WHERE type = 'store'",
                    params![name, util::now_local()],
                )?;
            }
        }
        if let Some(prefix) = values.get("invoice.prefix").map(|s| s.trim().to_string()) {
            if !prefix.is_empty() {
                tx.execute("UPDATE sequences SET prefix = ?1 WHERE name = 'sale'", params![prefix])?;
            }
        }
        if let Some(raw) = values.get("invoice.next_number") {
            if let Ok(n) = raw.trim().parse::<i64>() {
                if n >= 1 {
                    tx.execute(
                        "UPDATE sequences SET next_value = MAX(next_value, ?1) WHERE name = 'sale'",
                        params![n],
                    )?;
                }
            }
        }
        for (k, v) in values {
            set_setting(tx, &k, &v)?;
        }
        audit::log(tx, Some(uid), "settings_save", Some("settings"), None, "تحديث الإعدادات", None, None);
        Ok(())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRow {
    pub id: i64,
    pub name: String,
    pub role_id: i64,
    pub role_name: String,
    pub is_active: i64,
}

#[tauri::command]
pub fn list_users(state: State<AppState>) -> AppResult<Vec<UserRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "users.manage")?;
    let mut stmt = conn.prepare(
        "SELECT u.id, u.name, u.role_id, r.name_ar, u.is_active
         FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(UserRow {
                id: r.get(0)?,
                name: r.get(1)?,
                role_id: r.get(2)?,
                role_name: r.get(3)?,
                is_active: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn list_roles(state: State<AppState>) -> AppResult<Vec<super::catalog::NamedId>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare("SELECT id, name_ar FROM roles")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(super::catalog::NamedId {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn save_user(
    state: State<AppState>,
    id: Option<i64>,
    name: String,
    role_id: i64,
    pin: Option<String>,
    is_active: bool,
    override_pin: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let actor = auth::actor_for(tx, "users.manage", override_pin.as_deref())?;
        let now = crate::util::now_local();
        let uid = if let Some(id) = id {
            tx.execute(
                "UPDATE users SET name=?1, role_id=?2, is_active=?3, updated_at=?4 WHERE id=?5",
                params![name.trim(), role_id, is_active as i64, now, id],
            )?;
            if let Some(pin) = pin {
                if !pin.is_empty() {
                    let hash = auth::hash_pin(&pin)?;
                    tx.execute("UPDATE users SET pin_hash=?1 WHERE id=?2", params![hash, id])?;
                }
            }
            id
        } else {
            let pin = pin
                .filter(|p| !p.trim().is_empty())
                .unwrap_or_else(|| "0000".into());
            let hash = auth::hash_pin(&pin)?;
            tx.execute(
                "INSERT INTO users(name,pin_hash,role_id,is_active,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)",
                params![name.trim(), hash, role_id, is_active as i64, now],
            )?;
            tx.last_insert_rowid()
        };
        audit::log(tx, Some(actor), "user_save", Some("user"), Some(uid), name.trim(), None, None);
        Ok(uid)
    })
}

#[tauri::command]
pub fn list_backups(state: State<AppState>) -> AppResult<Vec<backup::BackupRow>> {
    let conn = take_conn(&state)?;
    backup::list_recent(&conn, 40)
}

#[tauri::command]
pub fn delete_backup(state: State<AppState>, id: i64) -> AppResult<()> {
    {
        let conn = take_conn(&state)?;
        auth::require_permission(&conn, auth::current_shift_user(&conn)?, "backup.create")?;
    }
    with_backup_op(&state, || {
        let conn = take_conn_from(&state)?;
        backup::delete_backup(&conn, id)
    })
}

fn emit_backup_progress(app: &AppHandle, pct: u8, label: &str) {
    let _ = app.emit(
        "backup-progress",
        RestoreProgress {
            pct,
            label: label.to_string(),
        },
    );
}

#[tauri::command]
pub fn backup_now(app: AppHandle, state: State<AppState>, dest: Option<String>) -> AppResult<String> {
    {
        let conn = take_conn(&state)?;
        auth::require_permission(&conn, auth::current_shift_user(&conn)?, "backup.create")?;
    }
    emit_backup_progress(&app, 4, "جاري أخذ النسخة");
    with_backup_op(&state, || {
        let conn = take_conn_from(&state)?;
        let path = dest.clone().map(PathBuf::from);
        let app = app.clone();
        let p = backup::create_backup_with_progress(&conn, path, "manual", &mut |pct, label| {
            emit_backup_progress(&app, pct, label);
        })?;
        Ok(p.to_string_lossy().to_string())
    })
}

#[tauri::command]
pub fn emergency_backup(app: AppHandle, state: State<AppState>) -> AppResult<String> {
    {
        let conn = take_conn(&state)?;
        auth::require_permission(&conn, auth::current_shift_user(&conn)?, "backup.create")?;
    }
    emit_backup_progress(&app, 4, "جاري أخذ النسخة");
    with_backup_op(&state, || {
        let conn = take_conn_from(&state)?;
        let app = app.clone();
        let p = backup::create_backup_with_progress(&conn, None, "emergency", &mut |pct, label| {
            emit_backup_progress(&app, pct, label);
        })?;
        Ok(p.to_string_lossy().to_string())
    })
}

#[tauri::command]
pub fn verify_backup_file(path: String) -> AppResult<String> {
    backup::verify_backup(&PathBuf::from(path))
}

#[tauri::command]
pub fn db_health(state: State<AppState>) -> AppResult<crate::db::DbHealth> {
    let conn = take_conn(&state)?;
    crate::db::health_report(&conn)
}

#[tauri::command]
pub fn run_db_maintenance(state: State<AppState>) -> AppResult<()> {
    {
        let conn = take_conn(&state)?;
        auth::require_permission(&conn, auth::current_shift_user(&conn)?, "backup.create")?;
    }
    with_backup_op(&state, || {
        let conn = take_conn_from(&state)?;
        backup::run_maintenance(&conn)
    })
}

#[tauri::command]
pub fn check_stock_integrity(state: State<AppState>) -> AppResult<Vec<crate::inventory::StockMismatch>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "stock.adjust")?;
    crate::inventory::reconcile_stock(&conn)
}

#[tauri::command]
pub fn fix_stock_drift(state: State<AppState>) -> AppResult<usize> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "stock.adjust", None)?;
        crate::inventory::auto_fix_stock_drift(tx, Some(uid))
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreProgress {
    pct: u8,
    label: String,
}

#[tauri::command]
pub fn restore_backup(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    override_pin: Option<String>,
) -> AppResult<()> {
    let backup_path = PathBuf::from(&path);
    let _ = app.emit(
        "backup-restore-progress",
        RestoreProgress {
            pct: 4,
            label: "جاري التحقق من ملف النسخة".into(),
        },
    );
    backup::verify_backup(&backup_path)?;
    {
        let conn = take_conn(&state)?;
        let uid = match override_pin.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
            Some(pin) => auth::find_user_by_pin(&conn, pin)?
                .ok_or_else(|| AppError::user("رمز المدير غير صحيح."))?,
            None => auth::current_shift_user(&conn)?,
        };
        auth::require_permission(&conn, uid, "backup.restore")?;
        audit::log(
            &conn,
            Some(uid),
            "restore",
            Some("backup"),
            None,
            "استعادة نسخة احتياطية",
            None,
            Some(&path),
        );
    }
    with_backup_op(&state, || {
        backup::restore_to_live(&state.pool, &backup_path, |pct, label| {
            let _ = app.emit(
                "backup-restore-progress",
                RestoreProgress {
                    pct,
                    label: label.to_string(),
                },
            );
        })
    })
}

#[tauri::command]
pub fn pick_backup_path(app: tauri::AppHandle, save: bool) -> Option<String> {
    if save {
        app.dialog()
            .file()
            .add_filter("نسخة كاملة", &["zip"])
            .add_filter("قاعدة بيانات فقط", &["sqlite", "backup", "db"])
            .set_file_name("wateen-pos.zip")
            .blocking_save_file()
            .and_then(|p| p.as_path().map(|x| x.to_string_lossy().to_string()))
    } else {
        app.dialog()
            .file()
            .add_filter("نسخة كاملة", &["zip"])
            .add_filter("قاعدة بيانات فقط", &["sqlite", "backup", "db"])
            .blocking_pick_file()
            .and_then(|p| p.as_path().map(|x| x.to_string_lossy().to_string()))
    }
}

#[tauri::command]
pub fn pick_backup_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|p| p.as_path().map(|x| x.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_printers_cmd() -> AppResult<Vec<printing::PrinterInfo>> {
    printing::list_printers()
}

#[tauri::command]
pub fn print_test_page(state: State<AppState>) -> AppResult<()> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "settings.manage")?;
    let printer = setting(&conn, "printer.thermal", "");
    if printer.is_empty() {
        return Err(AppError::user("اختر الطابعة الحرارية أولاً."));
    }
    let receipt = ReceiptData {
        store_name: setting(&conn, "store.name", "WATEEN POS"),
        address: store_address_line(&conn),
        phone: store_phone_line(&conn),
        tax_number: store_tax_line(&conn),
        invoice_number: "TEST".into(),
        datetime: util::now_local(),
        cashier: "اختبار".into(),
        customer: String::new(),
        lines: vec![ReceiptLine {
            name: "صنف تجريبي".into(),
            qty: "1".into(),
            price: "0.00".into(),
        }],
        subtotal: "0.00".into(),
        discount: "0.00".into(),
        tax: "0.00".into(),
        total: "0.00".into(),
        payment: "اختبار طباعة".into(),
        footer: store_receipt_footer(&conn),
    };
    printing::print_receipt_silent(&printer, &receipt)
}

#[tauri::command]
pub fn pick_store_logo(app: tauri::AppHandle) -> AppResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .add_filter("صورة", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file()
        .and_then(|p| p.as_path().map(|x| x.to_path_buf()));
    let Some(src) = picked else {
        return Ok(None);
    };
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    if !["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) {
        return Err(AppError::user("صيغة الصورة غير مدعومة."));
    }
    let dir = paths::data_dir().join("images");
    std::fs::create_dir_all(&dir)?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("store-logo.") || name.starts_with("store-logo-") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    let dest = dir.join(format!(
        "store-logo-{}.{}",
        chrono::Local::now().format("%Y%m%d%H%M%S"),
        ext
    ));
    std::fs::copy(&src, &dest)
        .map_err(|e| AppError::tech("تعذر حفظ الشعار.", e.to_string()))?;
    Ok(Some(dest.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn store_logo_src(path: String) -> AppResult<Option<String>> {
    Ok(crate::util::image_data_url(&path))
}

#[tauri::command]
pub fn print_sale_receipt(state: State<AppState>, sale_id: i64) -> AppResult<()> {
    let conn = take_conn(&state)?;
    let printer = setting(&conn, "printer.thermal", "");
    if printer.is_empty() {
        return Err(AppError::user("اختر طابعة الفواتير من الإعدادات."));
    }
    let (number, created, cashier, customer, sub, disc, tax, total): (
        String,
        String,
        String,
        String,
        i64,
        i64,
        i64,
        i64,
    ) = conn.query_row(
        "SELECT s.invoice_number, s.created_at, u.name, IFNULL(c.name,''),
                s.subtotal, s.item_discount_total + s.invoice_discount, s.tax_total, s.grand_total
         FROM sales s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.id = ?1",
        [sale_id],
        |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
            ))
        },
    )?;
    let mut stmt = conn.prepare(
        "SELECT product_name || CASE WHEN IFNULL(variant_name,'')='' THEN '' ELSE ' - ' || variant_name END,
                quantity, line_total FROM sale_items WHERE sale_id=?1",
    )?;
    let lines: Vec<ReceiptLine> = stmt
        .query_map([sale_id], |r| {
            Ok(ReceiptLine {
                name: r.get(0)?,
                qty: r.get::<_, i64>(1)?.to_string(),
                price: format_money(r.get(2)?),
            })
        })?
        .collect::<Result<_, _>>()?;
    let pay: String = conn
        .query_row(
            "SELECT GROUP_CONCAT(pm.name_ar || ' ' || sp.amount, '، ')
             FROM sale_payments sp JOIN payment_methods pm ON pm.id=sp.payment_method_id
             WHERE sp.sale_id=?1",
            [sale_id],
            |r| r.get::<_, Option<String>>(0),
        )?
        .unwrap_or_default();
    let receipt = ReceiptData {
        store_name: setting(&conn, "store.name", "WATEEN POS"),
        address: store_address_line(&conn),
        phone: store_phone_line(&conn),
        tax_number: store_tax_line(&conn),
        invoice_number: number,
        datetime: created,
        cashier,
        customer,
        lines,
        subtotal: format_money(sub),
        discount: format_money(disc),
        tax: format_money(tax),
        total: format_money(total),
        payment: pay,
        footer: store_receipt_footer(&conn),
    };
    printing::print_receipt_silent(&printer, &receipt)?;
    let copies = setting_i64(&conn, "pos.copies", 1).clamp(1, 5);
    for _ in 1..copies {
        printing::try_print_receipt(&printer, &receipt);
    }
    Ok(())
}

fn format_money(p: i64) -> String {
    let neg = p < 0;
    let p = p.abs();
    let s = format!("{}.{:02}", p / 100, p % 100);
    if neg {
        format!("-{s}")
    } else {
        s
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportTotals {
    pub revenue: i64,
    pub cost: i64,
    pub discounts: i64,
    pub returns: i64,
    pub expenses: i64,
    pub gross: i64,
    pub net: i64,
}

#[tauri::command]
pub fn report_profit(state: State<AppState>, from: String, to: String) -> AppResult<ReportTotals> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "profit.view")?;
    let revenue: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total),0) FROM sales WHERE status='completed' AND created_at>=?1 AND created_at<=?2||'T23:59:59'",
        params![from, to],
        |r| r.get(0),
    )?;
    let cost: i64 = conn.query_row(
        "SELECT COALESCE(SUM(cost_total),0) FROM sales WHERE status='completed' AND created_at>=?1 AND created_at<=?2||'T23:59:59'",
        params![from, to],
        |r| r.get(0),
    )?;
    let discounts: i64 = conn.query_row(
        "SELECT COALESCE(SUM(item_discount_total+invoice_discount),0) FROM sales WHERE status='completed' AND created_at>=?1 AND created_at<=?2||'T23:59:59'",
        params![from, to],
        |r| r.get(0),
    )?;
    let returns: i64 = conn.query_row(
        "SELECT COALESCE(SUM(refund_total),0) FROM returns WHERE created_at>=?1 AND created_at<=?2||'T23:59:59'",
        params![from, to],
        |r| r.get(0),
    )?;
    let expenses: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date>=?1 AND expense_date<=?2",
        params![from, to],
        |r| r.get(0),
    )?;
    let gross = revenue - cost - returns;
    Ok(ReportTotals {
        revenue,
        cost,
        discounts,
        returns,
        expenses,
        gross,
        net: gross - expenses,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRow {
    pub id: i64,
    pub occurred_at: String,
    pub user_name: Option<String>,
    pub action: String,
    pub summary: String,
}

#[tauri::command]
pub fn list_audit(state: State<AppState>) -> AppResult<Vec<AuditRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "reports.view")?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.occurred_at, u.name, a.action, a.summary
         FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
         ORDER BY a.id DESC LIMIT 300",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AuditRow {
                id: r.get(0)?,
                occurred_at: r.get(1)?,
                user_name: r.get(2)?,
                action: r.get(3)?,
                summary: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn export_products_csv(state: State<AppState>, dest: String) -> AppResult<()> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "products.view")?;
    let mut wtr = csv::Writer::from_path(&dest)
        .map_err(|e| AppError::tech("تعذر كتابة الملف.", e.to_string()))?;
    wtr.write_record(["name_ar", "sku", "barcode", "price", "brand", "category"])
        .map_err(|e| AppError::tech("تعذر كتابة الملف.", e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT p.name_ar, COALESCE(v.sku,p.sku), IFNULL((SELECT code FROM barcodes WHERE variant_id=v.id AND is_primary=1),'') ,
                COALESCE(v.retail_price,p.retail_price), IFNULL(b.name,''), IFNULL(c.name_ar,'')
         FROM product_variants v
         JOIN products p ON p.id=v.product_id
         LEFT JOIN brands b ON b.id=p.brand_id
         LEFT JOIN categories c ON c.id=p.category_id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok([
            r.get::<_, String>(0)?,
            r.get::<_, String>(1).unwrap_or_default(),
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?.to_string(),
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
        ])
    })?;
    for row in rows {
        let rec = row?;
        wtr.write_record(&rec)
            .map_err(|e| AppError::tech("تعذر كتابة الملف.", e.to_string()))?;
    }
    wtr.flush()
        .map_err(|e| AppError::tech("تعذر كتابة الملف.", e.to_string()))?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvProduct {
    pub name_ar: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub price: i64,
}

#[tauri::command]
pub fn import_products_csv(
    state: State<AppState>,
    rows: Vec<CsvProduct>,
    commit: bool,
) -> AppResult<String> {
    if rows.is_empty() {
        return Err(AppError::user("لا توجد صفوف للاستيراد."));
    }
    let mut errors = 0i64;
    for r in &rows {
        if r.name_ar.trim().is_empty() || r.price < 0 {
            errors += 1;
        }
    }
    if !commit {
        return Ok(format!(
            "معاينة: {} صف، أخطاء: {}. لم يتم الحفظ.",
            rows.len(),
            errors
        ));
    }
    if errors > 0 {
        return Err(AppError::user(
            "يوجد صفوف غير صالحة. صحح الملف قبل الحفظ.",
        ));
    }
    backup::create_backup(&*take_conn(&state)?, None, "pre-import")?;
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "products.edit", None)?;
        let now = crate::util::now_local();
        for r in &rows {
            tx.execute(
                "INSERT INTO products(sku,name_ar,retail_price,purchase_cost,is_active,created_at,updated_at)
                 VALUES(?1,?2,?3,0,1,?4,?4)",
                params![r.sku, r.name_ar.trim(), r.price, now],
            )?;
            let pid = tx.last_insert_rowid();
            tx.execute(
                "INSERT INTO product_variants(product_id,name,sku,retail_price,is_default,is_active,created_at,updated_at)
                 VALUES(?1,'',?2,?3,1,1,?4,?4)",
                params![pid, r.sku, r.price, now],
            )?;
            let vid = tx.last_insert_rowid();
            if let Some(code) = &r.barcode {
                if !code.trim().is_empty() {
                    tx.execute(
                        "INSERT INTO barcodes(variant_id,code,is_primary) VALUES(?1,?2,1)",
                        params![vid, code.trim()],
                    )?;
                }
            }
        }
        audit::log(
            tx,
            Some(uid),
            "import_products",
            Some("product"),
            None,
            &format!("استيراد {} منتج", rows.len()),
            None,
            None,
        );
        Ok(format!("تم استيراد {} منتج.", rows.len()))
    })
}

const FACTORY_RESET_PHRASE: &str = "حذف";

const WIPE_SQL: &str = "
DELETE FROM sale_item_batches;
DELETE FROM sale_payments;
DELETE FROM return_items;
DELETE FROM returns;
DELETE FROM sale_items;
DELETE FROM sales;
DELETE FROM purchase_items;
DELETE FROM supplier_transactions;
DELETE FROM purchases;
DELETE FROM transfer_items;
DELETE FROM transfers;
DELETE FROM stocktake_items;
DELETE FROM stocktakes;
DELETE FROM stock_movements;
DELETE FROM stock;
DELETE FROM held_invoice_items;
DELETE FROM held_invoices;
DELETE FROM barcodes;
DELETE FROM price_history;
DELETE FROM promotions;
DELETE FROM batches;
DELETE FROM product_variants;
DELETE FROM products;
DELETE FROM brands;
DELETE FROM customer_transactions;
DELETE FROM loyalty_transactions;
DELETE FROM expenses;
DELETE FROM cash_movements;
DELETE FROM cash_sessions;
DELETE FROM suppliers;
DELETE FROM customers WHERE is_walk_in=0;
UPDATE sequences SET next_value = 1;
UPDATE settings SET value = '0' WHERE key = 'app.demo_data';
";

#[tauri::command]
pub fn factory_reset(state: State<AppState>, confirmation: String) -> AppResult<()> {
    if confirmation.trim() != FACTORY_RESET_PHRASE {
        return Err(AppError::user("اكتب كلمة التأكيد «حذف» كما هي للمتابعة."));
    }
    {
        let conn = take_conn(&state)?;
        let uid = auth::current_shift_user(&conn)?;
        auth::require_permission(&conn, uid, "settings.manage")?;
    }
    with_backup_op(&state, || {
        let conn = take_conn_from(&state)?;
        backup::create_backup(&conn, None, "pre-reset")?;
        Ok(())
    })?;
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        auth::require_permission(tx, uid, "settings.manage")?;
        tx.execute_batch(WIPE_SQL)?;
        let _ = tx.execute_batch(
            "DELETE FROM sqlite_sequence WHERE name IN (
                'sale_item_batches','sale_payments','return_items','returns','sale_items','sales',
                'purchase_items','supplier_transactions','purchases','transfer_items','transfers',
                'stocktake_items','stocktakes','stock_movements','stock','held_invoice_items',
                'held_invoices','barcodes','price_history','batches','product_variants','products',
                'brands','customer_transactions','loyalty_transactions','expenses','cash_movements',
                'cash_sessions','promotions','suppliers','customers'
            );",
        );
        let walk_in: i64 = tx.query_row(
            "SELECT COUNT(*) FROM customers WHERE is_walk_in=1",
            [],
            |r| r.get(0),
        )?;
        if walk_in == 0 {
            let now = util::now_local();
            tx.execute(
                "INSERT INTO customers(name, is_walk_in, is_active, created_at, updated_at)
                 VALUES('عميل نقدي',1,1,?1,?1)",
                params![now],
            )?;
        }
        audit::log(
            tx,
            Some(uid),
            "factory_reset",
            Some("settings"),
            None,
            "إعادة ضبط المصنع: مسح المنتجات والمبيعات والمخزون",
            None,
            None,
        );
        Ok(())
    })
}

#[tauri::command]
pub fn check_update() -> AppResult<crate::updater::UpdateCheck> {
    crate::updater::check_for_update()
}

#[tauri::command]
pub fn download_and_install_update(url: String, app: AppHandle) -> AppResult<()> {
    std::thread::Builder::new()
        .name("updater-download".into())
        .spawn(move || {
            let result = crate::updater::download_update(&url, |progress| {
                let _ = app.emit("update-progress", &progress);
            });
            match result {
                Ok(path) => {
                    let _ = app.emit("update-ready", true);
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Err(e) = crate::updater::install_and_restart(&path) {
                        tracing::error!("install failed: {}", e.details);
                        let _ = app.emit("update-error", &e.user_message);
                    }
                }
                Err(e) => {
                    tracing::error!("download failed: {}", e.details);
                    let _ = app.emit("update-error", &e.user_message);
                }
            }
        })
        .map_err(|e| AppError::tech("فشل بدء التنزيل", format!("{e}")))?;
    Ok(())
}

#[tauri::command]
pub fn get_just_updated() -> Option<(String, String)> {
    crate::updater::check_just_updated()
}

#[tauri::command]
pub fn clear_just_updated() {
    crate::updater::clear_just_updated();
}

#[allow(dead_code)]
fn _use_util() {
    let _ = util::today();
}
