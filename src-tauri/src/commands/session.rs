use super::{take_conn, with_tx, AppState};
use crate::audit;
use crate::auth;
use crate::error::{AppError, AppResult};
use crate::util::{now_local, setting, set_setting};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub initialized: bool,
    pub open_shift: Option<ShiftDto>,
    pub lock_minutes: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShiftDto {
    pub id: i64,
    pub user_id: i64,
    pub user_name: String,
    pub role_code: String,
    pub opening_cash: i64,
    pub opened_at: String,
    pub permissions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeDto {
    pub id: i64,
    pub name: String,
    pub role_name: String,
    pub avatar_color: String,
}

#[tauri::command]
pub fn app_status(state: State<AppState>) -> AppResult<AppStatus> {
    with_tx(&state, |tx| {
        seed_defaults(tx)?;
        let open_shift = load_open_shift(tx).ok();
        let lock_minutes = crate::util::setting_i64(tx, "security.lock_minutes", 10);
        Ok(AppStatus {
            initialized: true,
            open_shift,
            lock_minutes,
        })
    })
}

fn seed_defaults(tx: &rusqlite::Transaction) -> AppResult<()> {
    if setting(tx, "app.initialized", "0") == "1" {
        return Ok(());
    }
    let now = now_local();
    let locations: i64 = tx.query_row("SELECT COUNT(*) FROM locations", [], |r| r.get(0))?;
    if locations == 0 {
        tx.execute(
            "INSERT INTO locations(name, type, is_system, is_active, created_at, updated_at)
             VALUES('المتجر','store',1,1,?1,?1)",
            params![now],
        )?;
        tx.execute(
            "INSERT INTO locations(name, type, is_system, is_active, created_at, updated_at)
             VALUES('المخزن الرئيسي','warehouse',0,1,?1,?1)",
            params![now],
        )?;
        tx.execute(
            "INSERT INTO locations(name, type, is_system, is_active, created_at, updated_at)
             VALUES('تحويل داخلي','transit',1,1,?1,?1)",
            params![now],
        )?;
    }
    let users: i64 = tx.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
    if users == 0 {
        let hash = auth::hash_pin("0000")?;
        tx.execute(
            "INSERT INTO users(name, pin_hash, role_id, avatar_color, is_active, created_at, updated_at)
             VALUES('كاشير',?1,1,'#9B2C4D',1,?2,?2)",
            params![hash, now],
        )?;
    }
    let walk_in: i64 = tx.query_row(
        "SELECT COUNT(*) FROM customers WHERE is_walk_in = 1",
        [],
        |r| r.get(0),
    )?;
    if walk_in == 0 {
        tx.execute(
            "INSERT INTO customers(name, is_walk_in, is_active, created_at, updated_at)
             VALUES('عميل نقدي',1,1,?1,?1)",
            params![now],
        )?;
    }
    if setting(tx, "store.name", "").trim().is_empty() {
        set_setting(tx, "store.name", "المتجر")?;
    }
    set_setting(tx, "app.initialized", "1")?;
    Ok(())
}

fn load_open_shift(conn: &rusqlite::Connection) -> AppResult<ShiftDto> {
    let (id, user_id, opening, opened_at, name, role, color): (
        i64,
        i64,
        i64,
        String,
        String,
        String,
        String,
    ) = conn.query_row(
        "SELECT s.id, s.user_id, s.opening_cash, s.opened_at, u.name, r.code, u.avatar_color
         FROM cash_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN roles r ON r.id = u.role_id
         WHERE s.status = 'open' ORDER BY s.id DESC LIMIT 1",
        [],
        |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
            ))
        },
    )?;
    let mut stmt = conn.prepare(
        "SELECT p.code FROM users u
         JOIN role_permissions rp ON rp.role_id = u.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE u.id = ?1",
    )?;
    let permissions = stmt
        .query_map([user_id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let _ = (name.clone(), color);
    Ok(ShiftDto {
        id,
        user_id,
        user_name: name,
        role_code: role,
        opening_cash: opening,
        opened_at,
        permissions,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunInput {
    pub store_name: String,
    pub address: String,
    pub phone: String,
    pub tax_number: String,
    pub admin_name: String,
    pub admin_pin: Option<String>,
    pub warehouse_name: String,
    pub sample_data: bool,
}

#[tauri::command]
pub fn complete_first_run(state: State<AppState>, input: FirstRunInput) -> AppResult<()> {
    if input.store_name.trim().is_empty() || input.admin_name.trim().is_empty() {
        return Err(AppError::user("اسم المتجر واسم المدير مطلوبان."));
    }
    with_tx(&state, |tx| {
        let initialized = setting(tx, "app.initialized", "0") == "1";
        if initialized {
            return Err(AppError::user("تم إعداد النظام مسبقاً."));
        }
        let now = now_local();
        tx.execute(
            "INSERT INTO locations(name, type, is_system, is_active, created_at, updated_at)
             VALUES(?1,'store',1,1,?2,?2)",
            params![input.store_name.trim(), now],
        )?;
        let wh = if input.warehouse_name.trim().is_empty() {
            "المخزن الرئيسي"
        } else {
            input.warehouse_name.trim()
        };
        tx.execute(
            "INSERT INTO locations(name, type, is_system, is_active, created_at, updated_at)
             VALUES(?1,'warehouse',0,1,?2,?2)",
            params![wh, now],
        )?;
        tx.execute(
            "INSERT INTO locations(name, type, is_system, is_active, created_at, updated_at)
             VALUES('تحويل داخلي','transit',1,1,?1,?1)",
            params![now],
        )?;
        let pin = match input.admin_pin.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => p.to_string(),
            _ => "0000".to_string(),
        };
        let hash = auth::hash_pin(&pin)?;
        tx.execute(
            "INSERT INTO users(name, pin_hash, role_id, avatar_color, is_active, created_at, updated_at)
             VALUES(?1,?2,1,'#9B2C4D',1,?3,?3)",
            params![input.admin_name.trim(), hash, now],
        )?;
        tx.execute(
            "INSERT INTO customers(name, is_walk_in, is_active, created_at, updated_at)
             VALUES('عميل نقدي',1,1,?1,?1)",
            params![now],
        )?;
        set_setting(tx, "store.name", input.store_name.trim())?;
        set_setting(tx, "store.address", input.address.trim())?;
        set_setting(tx, "store.phone", input.phone.trim())?;
        set_setting(tx, "store.tax_number", input.tax_number.trim())?;
        set_setting(tx, "app.initialized", "1")?;
        if input.sample_data {
            set_setting(tx, "app.demo_data", "1")?;
            insert_sample(tx, &now)?;
        }
        audit::log(
            tx,
            Some(1),
            "first_run",
            Some("settings"),
            None,
            "تم إعداد المتجر لأول مرة",
            None,
            None,
        );
        Ok(())
    })
}

fn insert_sample(tx: &rusqlite::Transaction, now: &str) -> AppResult<()> {
    tx.execute(
        "INSERT INTO brands(name,is_active,created_at,updated_at) VALUES('Maybelline',1,?1,?1),('Loreal',1,?1,?1)",
        [now],
    )?;
    tx.execute(
        "INSERT INTO products(sku,name_ar,name_en,brand_id,category_id,unit_id,purchase_cost,retail_price,min_stock,reorder_level,is_active,created_at,updated_at)
         VALUES('DEMO-FITME','كريم أساس Fit Me','Fit Me Foundation',1,1,1,18000,32000,5,10,1,?1,?1)",
        [now],
    )?;
    let pid = tx.last_insert_rowid();
    for (name, sku, price) in [("110", "DEMO-FITME-110", 32000), ("115", "DEMO-FITME-115", 32000)] {
        tx.execute(
            "INSERT INTO product_variants(product_id,name,sku,retail_price,is_default,is_active,created_at,updated_at)
             VALUES(?1,?2,?3,?4,0,1,?5,?5)",
            rusqlite::params![pid, name, sku, price, now],
        )?;
        let vid = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO barcodes(variant_id,code,is_primary) VALUES(?1,?2,1)",
            rusqlite::params![vid, format!("628{vid:0>10}")],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_employees(state: State<AppState>) -> AppResult<Vec<EmployeeDto>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare(
        "SELECT u.id, u.name, r.name_ar, u.avatar_color
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.is_active = 1 ORDER BY u.name",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(EmployeeDto {
                id: r.get(0)?,
                name: r.get(1)?,
                role_name: r.get(2)?,
                avatar_color: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn open_shift(
    state: State<AppState>,
    name: String,
    opening_cash: i64,
) -> AppResult<ShiftDto> {
    if opening_cash < 0 {
        return Err(AppError::user("العهدة الافتتاحية غير صالحة."));
    }
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::user("اكتب اسمك لفتح الوردية."));
    }
    with_tx(&state, |tx| {
        let open: i64 = tx.query_row(
            "SELECT COUNT(*) FROM cash_sessions WHERE status='open'",
            [],
            |r| r.get(0),
        )?;
        if open > 0 {
            return load_open_shift(tx);
        }
        let existing: Option<i64> = tx
            .query_row(
                "SELECT id FROM users WHERE is_active = 1 AND lower(trim(name)) = lower(?1) LIMIT 1",
                [&name],
                |r| r.get(0),
            )
            .ok();
        let user_id = if let Some(id) = existing {
            id
        } else {
            let hash = auth::hash_pin("0000")?;
            let now = now_local();
            tx.execute(
                "INSERT INTO users(name, pin_hash, role_id, avatar_color, is_active, created_at, updated_at)
                 VALUES(?1,?2,1,'#9B2C4D',1,?3,?3)",
                params![name, hash, now],
            )?;
            tx.last_insert_rowid()
        };
        let now = now_local();
        tx.execute(
            "INSERT INTO cash_sessions(user_id,opened_at,opening_cash,status) VALUES(?1,?2,?3,'open')",
            params![user_id, now, opening_cash],
        )?;
        let sid = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO cash_movements(cash_session_id,occurred_at,type,amount,user_id)
             VALUES(?1,?2,'opening',?3,?4)",
            params![sid, now, opening_cash, user_id],
        )?;
        audit::log(
            tx,
            Some(user_id),
            "shift_opened",
            Some("cash_session"),
            Some(sid),
            &format!("فتح وردية: {name}"),
            None,
            None,
        );
        load_open_shift(tx)
    })
}

#[tauri::command]
pub fn close_shift(
    state: State<AppState>,
    actual_cash: i64,
    notes: Option<String>,
) -> AppResult<ShiftDto> {
    if actual_cash < 0 {
        return Err(AppError::user("المبلغ الفعلي غير صالح."));
    }
    with_tx(&state, |tx| {
        let shift = load_open_shift(tx)?;
        let expected: i64 = tx.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE cash_session_id = ?1",
            [shift.id],
            |r| r.get(0),
        )?;
        let diff = actual_cash - expected;
        let now = now_local();
        tx.execute(
            "UPDATE cash_sessions SET status='closed', closed_at=?1, closing_cash_actual=?2, expected_cash=?3, difference=?4, notes=?5 WHERE id=?6",
            params![now, actual_cash, expected, diff, notes, shift.id],
        )?;
        audit::log(
            tx,
            Some(shift.user_id),
            "shift_closed",
            Some("cash_session"),
            Some(shift.id),
            &format!("إغلاق وردية. الفرق {diff}"),
            None,
            None,
        );
        Ok(shift)
    })
}

#[tauri::command]
pub fn unlock_shift(state: State<AppState>) -> AppResult<ShiftDto> {
    let conn = take_conn(&state)?;
    load_open_shift(&conn)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftRow {
    pub id: i64,
    pub user_name: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub opening_cash: i64,
    pub expected_cash: i64,
    pub closing_cash_actual: Option<i64>,
    pub difference: Option<i64>,
    pub status: String,
    pub notes: Option<String>,
    pub sales_count: i64,
    pub sales_total: i64,
}

#[tauri::command]
pub fn list_shifts(state: State<AppState>) -> AppResult<Vec<ShiftRow>> {
    let conn = take_conn(&state)?;
    if let Ok(uid) = auth::current_shift_user(&conn) {
        auth::require_permission(&conn, uid, "sales.view")?;
    }
    let mut stmt = conn.prepare(
        "SELECT s.id, u.name, s.opened_at, s.closed_at, s.opening_cash,
                COALESCE(
                  s.expected_cash,
                  (SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE cash_session_id = s.id)
                ),
                s.closing_cash_actual, s.difference, s.status, s.notes,
                (SELECT COUNT(*) FROM sales sl WHERE sl.cash_session_id = s.id AND sl.status = 'completed'),
                (SELECT COALESCE(SUM(grand_total),0) FROM sales sl WHERE sl.cash_session_id = s.id AND sl.status = 'completed')
         FROM cash_sessions s
         JOIN users u ON u.id = s.user_id
         ORDER BY s.id DESC
         LIMIT 300",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ShiftRow {
                id: r.get(0)?,
                user_name: r.get(1)?,
                opened_at: r.get(2)?,
                closed_at: r.get(3)?,
                opening_cash: r.get(4)?,
                expected_cash: r.get(5)?,
                closing_cash_actual: r.get(6)?,
                difference: r.get(7)?,
                status: r.get(8)?,
                notes: r.get(9)?,
                sales_count: r.get(10)?,
                sales_total: r.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardDto {
    pub sales_today: i64,
    pub invoices_today: i64,
    pub profit_today: i64,
    pub cash_today: i64,
    pub card_today: i64,
    pub purchases_today: i64,
    pub expenses_today: i64,
    pub sales_yesterday: i64,
    pub invoices_yesterday: i64,
    pub expenses_yesterday: i64,
    pub returns_today: i64,
    pub returns_amount_today: i64,
    pub held_count: i64,
    pub customers_count: i64,
    pub low_stock: i64,
    pub expiring: i64,
    pub expired: i64,
    pub pending_transfers: i64,
    pub recent_sales: Vec<RecentSale>,
    pub top_products: Vec<TopProduct>,
    pub low_stock_items: Vec<StockAlert>,
    pub expiring_items: Vec<ExpiryAlert>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentSale {
    pub id: i64,
    pub invoice_number: String,
    pub grand_total: i64,
    pub created_at: String,
    pub user_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProduct {
    pub name: String,
    pub quantity: i64,
    pub total: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAlert {
    pub name: String,
    pub quantity: i64,
    pub min_stock: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpiryAlert {
    pub name: String,
    pub expiration_date: String,
    pub quantity: i64,
}

#[tauri::command]
pub fn dashboard_summary(state: State<AppState>) -> AppResult<DashboardDto> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "sales.view")?;
    let today = crate::util::today();
    let like = format!("{today}%");
    let sales_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total),0) FROM sales WHERE status='completed' AND created_at LIKE ?1",
        [&like],
        |r| r.get(0),
    )?;
    let invoices_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sales WHERE status='completed' AND created_at LIKE ?1",
        [&like],
        |r| r.get(0),
    )?;
    let profit_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total - cost_total),0) FROM sales WHERE status='completed' AND created_at LIKE ?1",
        [&like],
        |r| r.get(0),
    )?;
    let cash_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(sp.amount),0) FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         JOIN payment_methods pm ON pm.id = sp.payment_method_id
         WHERE s.status='completed' AND s.created_at LIKE ?1 AND pm.is_cash=1",
        [&like],
        |r| r.get(0),
    )?;
    let card_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(sp.amount),0) FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         JOIN payment_methods pm ON pm.id = sp.payment_method_id
         WHERE s.status='completed' AND s.created_at LIKE ?1 AND pm.is_cash=0",
        [&like],
        |r| r.get(0),
    )?;
    let purchases_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total),0) FROM purchases WHERE status='received' AND invoice_date = ?1",
        [&today],
        |r| r.get(0),
    )?;
    let expenses_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date = ?1",
        [&today],
        |r| r.get(0),
    )?;
    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let ylike = format!("{yesterday}%");
    let sales_yesterday: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total),0) FROM sales WHERE status='completed' AND created_at LIKE ?1",
        [&ylike],
        |r| r.get(0),
    )?;
    let invoices_yesterday: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sales WHERE status='completed' AND created_at LIKE ?1",
        [&ylike],
        |r| r.get(0),
    )?;
    let expenses_yesterday: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date = ?1",
        [&yesterday],
        |r| r.get(0),
    )?;
    let returns_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM returns WHERE created_at LIKE ?1",
        [&like],
        |r| r.get(0),
    )?;
    let returns_amount_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(refund_total),0) FROM returns WHERE created_at LIKE ?1",
        [&like],
        |r| r.get(0),
    )?;
    let held_count: i64 = conn.query_row("SELECT COUNT(*) FROM held_invoices", [], |r| r.get(0))?;
    let customers_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM customers WHERE is_walk_in=0 AND is_active=1",
        [],
        |r| r.get(0),
    )?;
    let warn = crate::util::setting_i64(&conn, "inventory.expiry_warning_days", 90);
    let until = (chrono::Local::now() + chrono::Duration::days(warn))
        .format("%Y-%m-%d")
        .to_string();
    let expired: i64 = conn.query_row(
        "SELECT COUNT(*) FROM stock s JOIN batches b ON b.id=s.batch_id
         WHERE s.quantity>0 AND b.expiration_date IS NOT NULL AND b.expiration_date < ?1",
        [&today],
        |r| r.get(0),
    )?;
    let expiring: i64 = conn.query_row(
        "SELECT COUNT(*) FROM stock s JOIN batches b ON b.id=s.batch_id
         WHERE s.quantity>0 AND b.expiration_date IS NOT NULL AND b.expiration_date >= ?1 AND b.expiration_date <= ?2",
        params![today, until],
        |r| r.get(0),
    )?;
    let low_stock: i64 = conn.query_row(
        "SELECT COUNT(*) FROM (
            SELECT p.id FROM products p
            JOIN product_variants v ON v.product_id = p.id
            LEFT JOIN stock s ON s.variant_id = v.id
            WHERE p.min_stock > 0
            GROUP BY p.id, p.min_stock
            HAVING SUM(COALESCE(s.quantity,0)) <= p.min_stock AND p.min_stock > 0
         )",
        [],
        |r| r.get(0),
    )?;
    let pending_transfers: i64 = conn.query_row(
        "SELECT COUNT(*) FROM transfers WHERE status IN ('requested','approved','preparing','dispatched')",
        [],
        |r| r.get(0),
    )?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.invoice_number, s.grand_total, s.created_at, u.name
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
         WHERE s.status='completed' ORDER BY s.id DESC LIMIT 8",
    )?;
    let recent_sales = stmt
        .query_map([], |r| {
            Ok(RecentSale {
                id: r.get(0)?,
                invoice_number: r.get(1)?,
                grand_total: r.get(2)?,
                created_at: r.get(3)?,
                user_name: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut top_stmt = conn.prepare(
        "SELECT si.product_name, SUM(si.quantity), SUM(si.line_total)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status='completed' AND s.created_at LIKE ?1
         GROUP BY si.product_name
         ORDER BY SUM(si.quantity) DESC
         LIMIT 5",
    )?;
    let top_products = top_stmt
        .query_map([&like], |r| {
            Ok(TopProduct {
                name: r.get(0)?,
                quantity: r.get(1)?,
                total: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut low_stmt = conn.prepare(
        "SELECT p.name_ar, SUM(COALESCE(s.quantity,0)), p.min_stock
         FROM products p
         JOIN product_variants v ON v.product_id = p.id
         LEFT JOIN stock s ON s.variant_id = v.id
         WHERE p.min_stock > 0
         GROUP BY p.id, p.name_ar, p.min_stock
         HAVING SUM(COALESCE(s.quantity,0)) <= p.min_stock AND p.min_stock > 0
         ORDER BY SUM(COALESCE(s.quantity,0)) ASC
         LIMIT 6",
    )?;
    let low_stock_items = low_stmt
        .query_map([], |r| {
            Ok(StockAlert {
                name: r.get(0)?,
                quantity: r.get(1)?,
                min_stock: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut exp_stmt = conn.prepare(
        "SELECT p.name_ar, b.expiration_date, s.quantity
         FROM stock s
         JOIN batches b ON b.id = s.batch_id
         JOIN product_variants v ON v.id = s.variant_id
         JOIN products p ON p.id = v.product_id
         WHERE s.quantity > 0 AND b.expiration_date IS NOT NULL
           AND b.expiration_date >= ?1 AND b.expiration_date <= ?2
         ORDER BY b.expiration_date ASC
         LIMIT 6",
    )?;
    let expiring_items = exp_stmt
        .query_map(params![today, until], |r| {
            Ok(ExpiryAlert {
                name: r.get(0)?,
                expiration_date: r.get(1)?,
                quantity: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(DashboardDto {
        sales_today,
        invoices_today,
        profit_today,
        cash_today,
        card_today,
        purchases_today,
        expenses_today,
        sales_yesterday,
        invoices_yesterday,
        expenses_yesterday,
        returns_today,
        returns_amount_today,
        held_count,
        customers_count,
        low_stock,
        expiring,
        expired,
        pending_transfers,
        recent_sales,
        top_products,
        low_stock_items,
        expiring_items,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppNotification {
    pub id: String,
    pub kind: String,
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub href: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsDto {
    pub low_stock: i64,
    pub expiring: i64,
    pub expired: i64,
    pub pending_transfers: i64,
    pub total: i64,
    pub items: Vec<AppNotification>,
}

fn notify_label(name: String, variant: String) -> String {
    let v = variant.trim().to_string();
    if v.is_empty() {
        name
    } else {
        format!("{name} — {v}")
    }
}

fn days_between(from: &str, to: &str) -> i64 {
    let a = chrono::NaiveDate::parse_from_str(from, "%Y-%m-%d").ok();
    let b = chrono::NaiveDate::parse_from_str(to, "%Y-%m-%d").ok();
    match (a, b) {
        (Some(a), Some(b)) => (b - a).num_days(),
        _ => 0,
    }
}

fn transfer_status_ar(code: &str) -> String {
    match code {
        "requested" => "مطلوب".into(),
        "approved" => "معتمد".into(),
        "preparing" => "قيد التجهيز".into(),
        "dispatched" => "تم الصرف".into(),
        _ => code.to_string(),
    }
}

#[tauri::command]
pub fn list_notifications(state: State<AppState>) -> AppResult<NotificationsDto> {
    let conn = take_conn(&state)?;
    if let Ok(uid) = auth::current_shift_user(&conn) {
        let ok = auth::user_has_permission(&conn, uid, "stock.view")?
            || auth::user_has_permission(&conn, uid, "products.view")?
            || auth::user_has_permission(&conn, uid, "sales.view")?;
        if !ok {
            return Err(AppError::user("ليست لديك صلاحية لعرض التنبيهات."));
        }
    }
    let show_low = setting(&conn, "alert.low_stock", "1") != "0";
    let show_exp = setting(&conn, "alert.expiry", "1") != "0";
    let show_batch = setting(&conn, "alert.batch_expiry", "1") != "0";
    let today = crate::util::today();
    let warn = crate::util::setting_i64(&conn, "inventory.expiry_warning_days", 90);
    let until = (chrono::Local::now() + chrono::Duration::days(warn))
        .format("%Y-%m-%d")
        .to_string();

    let expired: i64 = conn.query_row(
        "SELECT COUNT(*) FROM stock s JOIN batches b ON b.id=s.batch_id
         WHERE s.quantity>0 AND b.expiration_date IS NOT NULL AND b.expiration_date < ?1",
        [&today],
        |r| r.get(0),
    )?;
    let expiring: i64 = conn.query_row(
        "SELECT COUNT(*) FROM stock s JOIN batches b ON b.id=s.batch_id
         WHERE s.quantity>0 AND b.expiration_date IS NOT NULL AND b.expiration_date >= ?1 AND b.expiration_date <= ?2",
        params![today, until],
        |r| r.get(0),
    )?;
    let low_stock: i64 = conn.query_row(
        "SELECT COUNT(*) FROM (
            SELECT p.id FROM products p
            JOIN product_variants v ON v.product_id = p.id
            LEFT JOIN stock s ON s.variant_id = v.id
            WHERE p.is_active=1 AND p.min_stock > 0
            GROUP BY p.id, p.min_stock
            HAVING SUM(COALESCE(s.quantity,0)) <= p.min_stock AND p.min_stock > 0
         )",
        [],
        |r| r.get(0),
    )?;
    let pending_transfers: i64 = conn.query_row(
        "SELECT COUNT(*) FROM transfers WHERE status IN ('requested','approved','preparing','dispatched')",
        [],
        |r| r.get(0),
    )?;

    let mut items = Vec::new();

    if show_batch && expired > 0 {
        let mut stmt = conn.prepare(
            "SELECT p.name_ar, IFNULL(v.name,''), IFNULL(b.batch_number,''), b.expiration_date, s.quantity, l.name, b.id, s.location_id
             FROM stock s
             JOIN batches b ON b.id = s.batch_id
             JOIN product_variants v ON v.id = s.variant_id
             JOIN products p ON p.id = v.product_id
             JOIN locations l ON l.id = s.location_id
             WHERE s.quantity > 0 AND b.expiration_date IS NOT NULL AND b.expiration_date < ?1
             ORDER BY b.expiration_date ASC
             LIMIT 40",
        )?;
        let rows = stmt.query_map([&today], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
            ))
        })?;
        for row in rows.flatten() {
            let (name, variant, batch, date, qty, loc, batch_id, location_id) = row;
            let ago = days_between(&date, &today);
            let batch_bit = if batch.is_empty() {
                String::new()
            } else {
                format!(" · دفعة {batch}")
            };
            items.push(AppNotification {
                id: format!("expired-{batch_id}-{location_id}"),
                kind: "expired".into(),
                severity: "danger".into(),
                title: notify_label(name, variant),
                detail: format!("منتهٍ منذ {ago} يوم · {qty} قطعة في {loc}{batch_bit}"),
                href: "/inventory".into(),
            });
        }
    }

    if show_exp && expiring > 0 {
        let mut stmt = conn.prepare(
            "SELECT p.name_ar, IFNULL(v.name,''), IFNULL(b.batch_number,''), b.expiration_date, s.quantity, l.name, b.id, s.location_id
             FROM stock s
             JOIN batches b ON b.id = s.batch_id
             JOIN product_variants v ON v.id = s.variant_id
             JOIN products p ON p.id = v.product_id
             JOIN locations l ON l.id = s.location_id
             WHERE s.quantity > 0 AND b.expiration_date IS NOT NULL
               AND b.expiration_date >= ?1 AND b.expiration_date <= ?2
             ORDER BY b.expiration_date ASC
             LIMIT 40",
        )?;
        let rows = stmt.query_map(params![today, until], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
            ))
        })?;
        for row in rows.flatten() {
            let (name, variant, batch, date, qty, loc, batch_id, location_id) = row;
            let left = days_between(&today, &date);
            let when = if left <= 0 {
                "ينتهي اليوم".to_string()
            } else {
                format!("ينتهي خلال {left} يوم")
            };
            let batch_bit = if batch.is_empty() {
                String::new()
            } else {
                format!(" · دفعة {batch}")
            };
            items.push(AppNotification {
                id: format!("expiring-{batch_id}-{location_id}"),
                kind: "expiring".into(),
                severity: "warn".into(),
                title: notify_label(name, variant),
                detail: format!("{when} ({date}) · {qty} قطعة في {loc}{batch_bit}"),
                href: "/inventory".into(),
            });
        }
    }

    if show_low && low_stock > 0 {
        let mut stmt = conn.prepare(
            "SELECT p.id, p.name_ar, SUM(COALESCE(s.quantity,0)), p.min_stock
             FROM products p
             JOIN product_variants v ON v.product_id = p.id
             LEFT JOIN stock s ON s.variant_id = v.id
             WHERE p.is_active=1 AND p.min_stock > 0
             GROUP BY p.id, p.name_ar, p.min_stock
             HAVING SUM(COALESCE(s.quantity,0)) <= p.min_stock AND p.min_stock > 0
             ORDER BY SUM(COALESCE(s.quantity,0)) ASC
             LIMIT 40",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?))
        })?;
        for row in rows.flatten() {
            let (pid, name, qty, min) = row;
            items.push(AppNotification {
                id: format!("low-{pid}"),
                kind: "low_stock".into(),
                severity: if qty <= 0 { "danger".into() } else { "warn".into() },
                title: name,
                detail: format!("المتوفر {qty} · حد التنبيه {min}"),
                href: "/inventory".into(),
            });
        }
    }

    if pending_transfers > 0 {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.transfer_number, t.status, f.name, d.name
             FROM transfers t
             JOIN locations f ON f.id = t.from_location_id
             JOIN locations d ON d.id = t.to_location_id
             WHERE t.status IN ('requested','approved','preparing','dispatched')
             ORDER BY t.id DESC
             LIMIT 20",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
            ))
        })?;
        for row in rows.flatten() {
            let (tid, number, status, from, to) = row;
            items.push(AppNotification {
                id: format!("transfer-{tid}"),
                kind: "transfer".into(),
                severity: "info".into(),
                title: format!("تحويل {number}"),
                detail: format!("{} · من {from} إلى {to}", transfer_status_ar(&status)),
                href: "/inventory".into(),
            });
        }
    }

    let total = (if show_low { low_stock } else { 0 })
        + (if show_exp { expiring } else { 0 })
        + (if show_batch { expired } else { 0 })
        + pending_transfers;

    Ok(NotificationsDto {
        low_stock: if show_low { low_stock } else { 0 },
        expiring: if show_exp { expiring } else { 0 },
        expired: if show_batch { expired } else { 0 },
        pending_transfers,
        total,
        items,
    })
}
