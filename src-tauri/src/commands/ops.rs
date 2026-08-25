use super::{take_conn, with_tx, AppState};
use crate::audit;
use crate::auth;
use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::purchases::{ReceivePurchaseInput, receive_purchase};
use crate::sales::{CompleteSaleInput, ReturnLineInput, complete_sale, return_sale, void_sale};
use crate::transfers::{TransferItemInput, execute_transfer, finish_transfer, quick_to_store, set_status};
use crate::util::{doc_search, now_local};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[tauri::command]
pub fn pos_complete_sale(
    state: State<AppState>,
    input: CompleteSaleInput,
    override_pin: Option<String>,
) -> AppResult<crate::sales::CompletedSale> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "sales.create", override_pin.as_deref())?;
        let result = complete_sale(tx, uid, input)?;
        audit::log(
            tx,
            Some(uid),
            "sale_create",
            Some("sale"),
            Some(result.id),
            &result.invoice_number,
            None,
            None,
        );
        Ok(result)
    })
}

#[tauri::command]
pub fn pos_void_sale(
    state: State<AppState>,
    sale_id: i64,
    reason: String,
    override_pin: Option<String>,
) -> AppResult<()> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "sales.void", override_pin.as_deref())?;
        void_sale(tx, uid, sale_id, &reason)?;
        audit::log(tx, Some(uid), "sale_void", Some("sale"), Some(sale_id), &reason, None, None);
        Ok(())
    })
}

#[tauri::command]
pub fn pos_return_sale(
    state: State<AppState>,
    sale_id: i64,
    lines: Vec<ReturnLineInput>,
    reason: Option<String>,
    override_pin: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "sales.return", override_pin.as_deref())?;
        let id = return_sale(tx, uid, sale_id, lines, reason.clone())?;
        audit::log(
            tx,
            Some(uid),
            "sale_return",
            Some("return"),
            Some(id),
            reason.as_deref().unwrap_or("مرتجع"),
            None,
            None,
        );
        Ok(id)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleListRow {
    pub id: i64,
    pub invoice_number: String,
    pub grand_total: i64,
    pub status: String,
    pub created_at: String,
    pub cashier: String,
    pub customer: Option<String>,
    pub item_count: i64,
    pub returned_qty: i64,
}

fn map_sale_list_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<SaleListRow> {
    Ok(SaleListRow {
        id: r.get(0)?,
        invoice_number: r.get(1)?,
        grand_total: r.get(2)?,
        status: r.get(3)?,
        created_at: r.get(4)?,
        cashier: r.get(5)?,
        customer: r.get(6)?,
        item_count: r.get(7)?,
        returned_qty: r.get(8)?,
    })
}

const SALE_LIST_SQL: &str = "SELECT s.id, s.invoice_number, s.grand_total, s.status, s.created_at, u.name,
            c.name,
            (SELECT COALESCE(SUM(si.quantity),0) FROM sale_items si WHERE si.sale_id = s.id),
            (SELECT COALESCE(SUM(ri.quantity),0) FROM return_items ri JOIN sale_items si ON si.id = ri.sale_item_id WHERE si.sale_id = s.id)
     FROM sales s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN customers c ON c.id = s.customer_id";

#[tauri::command]
pub fn list_sales(
    state: State<AppState>,
    query: Option<String>,
    from: Option<String>,
    to: Option<String>,
    customer_id: Option<i64>,
) -> AppResult<Vec<SaleListRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "sales.view")?;
    let search = doc_search(&query.unwrap_or_default());
    let from = from.unwrap_or_else(|| "1970-01-01".into());
    let to = to.unwrap_or_else(|| "2999-12-31".into());
    let cid = customer_id.unwrap_or(0);
    let sql = format!(
        "{SALE_LIST_SQL}
         WHERE s.created_at >= ?2 AND s.created_at <= ?3 || 'T23:59:59'
           AND (?4 = 0 OR s.customer_id = ?4)
           AND (?1 = '%%'
                OR s.invoice_number LIKE ?1
                OR REPLACE(REPLACE(s.invoice_number, '-', ''), ' ', '') LIKE ?5
                OR (?6 > 0 AND CAST(replace(s.invoice_number, rtrim(s.invoice_number, '0123456789'), '') AS INTEGER) = ?6)
                OR u.name LIKE ?1
                OR IFNULL(c.name,'') LIKE ?1)
         ORDER BY s.id DESC LIMIT 500"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(
            params![search.like, from, to, cid, search.compact, search.serial],
            map_sale_list_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleDetail {
    pub header: SaleListRow,
    pub items: Vec<SaleItemDto>,
    pub payments: Vec<PaymentDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemDto {
    pub id: i64,
    pub product_name: String,
    pub variant_name: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
    pub discount: i64,
    pub line_total: i64,
    pub returned_qty: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDto {
    pub method: String,
    pub amount: i64,
}

#[tauri::command]
pub fn get_sale(state: State<AppState>, id: i64) -> AppResult<SaleDetail> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "sales.view")?;
    let header = conn.query_row(
        &format!("{SALE_LIST_SQL} WHERE s.id=?1"),
        [id],
        map_sale_list_row,
    )?;
    let mut stmt = conn.prepare(
        "SELECT si.id, si.product_name, si.variant_name, si.quantity, si.unit_price, si.discount, si.line_total,
                COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.sale_item_id = si.id), 0)
         FROM sale_items si WHERE si.sale_id=?1",
    )?;
    let items = stmt
        .query_map([id], |r| {
            Ok(SaleItemDto {
                id: r.get(0)?,
                product_name: r.get(1)?,
                variant_name: r.get(2)?,
                quantity: r.get(3)?,
                unit_price: r.get(4)?,
                discount: r.get(5)?,
                line_total: r.get(6)?,
                returned_qty: r.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut stmt = conn.prepare(
        "SELECT pm.name_ar, sp.amount FROM sale_payments sp JOIN payment_methods pm ON pm.id=sp.payment_method_id WHERE sp.sale_id=?1",
    )?;
    let payments = stmt
        .query_map([id], |r| {
            Ok(PaymentDto {
                method: r.get(0)?,
                amount: r.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SaleDetail {
        header,
        items,
        payments,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnListRow {
    pub id: i64,
    pub return_number: String,
    pub invoice_number: Option<String>,
    pub customer: Option<String>,
    pub cashier: String,
    pub refund_total: i64,
    pub reason: Option<String>,
    pub created_at: String,
    pub item_count: i64,
}

#[tauri::command]
pub fn list_returns(state: State<AppState>, query: Option<String>) -> AppResult<Vec<ReturnListRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "sales.view")?;
    let search = doc_search(&query.unwrap_or_default());
    let mut stmt = conn.prepare(
        "SELECT r.id, r.return_number, s.invoice_number, c.name, u.name, r.refund_total, r.reason, r.created_at,
                (SELECT COUNT(*) FROM return_items ri WHERE ri.return_id = r.id)
         FROM returns r
         LEFT JOIN sales s ON s.id = r.sale_id
         LEFT JOIN customers c ON c.id = r.customer_id
         JOIN users u ON u.id = r.user_id
         WHERE ?1 = '%%'
            OR r.return_number LIKE ?1
            OR IFNULL(s.invoice_number,'') LIKE ?1
            OR REPLACE(REPLACE(IFNULL(s.invoice_number,''), '-', ''), ' ', '') LIKE ?2
            OR (?3 > 0 AND CAST(replace(IFNULL(s.invoice_number,''), rtrim(IFNULL(s.invoice_number,''), '0123456789'), '') AS INTEGER) = ?3)
            OR IFNULL(c.name,'') LIKE ?1
            OR IFNULL(r.reason,'') LIKE ?1
         ORDER BY r.id DESC LIMIT 200",
    )?;
    let rows = stmt
        .query_map(params![search.like, search.compact, search.serial], |r| {
            Ok(ReturnListRow {
                id: r.get(0)?,
                return_number: r.get(1)?,
                invoice_number: r.get(2)?,
                customer: r.get(3)?,
                cashier: r.get(4)?,
                refund_total: r.get(5)?,
                reason: r.get(6)?,
                created_at: r.get(7)?,
                item_count: r.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn hold_invoice(
    state: State<AppState>,
    customer_id: Option<i64>,
    invoice_discount: i64,
    items: Vec<(i64, i64, i64, i64)>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        if items.is_empty() {
            return Err(AppError::user("أضف صنفاً واحداً على الأقل قبل التعليق."));
        }
        for (_variant_id, qty, price, disc) in &items {
            if *qty <= 0 {
                return Err(AppError::user("الكمية يجب أن تكون أكبر من صفر."));
            }
            if *price < 0 || *disc < 0 {
                return Err(AppError::user("قيم الفاتورة المعلّقة غير صالحة."));
            }
        }
        let now = now_local();
        tx.execute(
            "INSERT INTO held_invoices(user_id,customer_id,invoice_discount,created_at) VALUES(?1,?2,?3,?4)",
            params![uid, customer_id, invoice_discount, now],
        )?;
        let id = tx.last_insert_rowid();
        for (variant_id, qty, price, disc) in items {
            tx.execute(
                "INSERT INTO held_invoice_items(held_invoice_id,variant_id,quantity,unit_price,discount) VALUES(?1,?2,?3,?4,?5)",
                params![id, variant_id, qty, price, disc],
            )?;
        }
        Ok(id)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldDto {
    pub id: i64,
    pub created_at: String,
    pub item_count: i64,
}

#[tauri::command]
pub fn list_held(state: State<AppState>) -> AppResult<Vec<HeldDto>> {
    let conn = take_conn(&state)?;
    let uid = auth::current_shift_user(&conn)?;
    let mut stmt = conn.prepare(
        "SELECT h.id, h.created_at, (SELECT COUNT(*) FROM held_invoice_items i WHERE i.held_invoice_id=h.id)
         FROM held_invoices h WHERE h.user_id=?1 ORDER BY h.id DESC LIMIT 50",
    )?;
    let rows = stmt
        .query_map([uid], |r| {
            Ok(HeldDto {
                id: r.get(0)?,
                created_at: r.get(1)?,
                item_count: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldLineDto {
    pub variant_id: i64,
    pub name: String,
    pub variant_name: String,
    pub price: i64,
    pub qty: i64,
    pub discount: i64,
    pub store_qty: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldResumeDto {
    pub customer_id: Option<i64>,
    pub invoice_discount: i64,
    pub items: Vec<HeldLineDto>,
}

#[tauri::command]
pub fn resume_held(state: State<AppState>, id: i64) -> AppResult<HeldResumeDto> {
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        let (owner, customer_id, invoice_discount): (i64, Option<i64>, i64) = tx
            .query_row(
                "SELECT user_id, customer_id, invoice_discount FROM held_invoices WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| AppError::user("الفاتورة المعلقة غير موجودة."))?;
        if owner != uid {
            return Err(AppError::user("هذه الفاتورة ليست في ورديتك."));
        }
        let today = crate::util::today();
        let store_sql = inventory::sql_sellable_store_qty("v.id", "?2");
        let mut stmt = tx.prepare(&format!(
            "SELECT i.variant_id, p.name_ar, v.name, i.unit_price, i.quantity, i.discount,
                    {store_sql}
             FROM held_invoice_items i
             JOIN product_variants v ON v.id = i.variant_id
             JOIN products p ON p.id = v.product_id
             WHERE i.held_invoice_id=?1"
        ))?;
        let items = stmt
            .query_map(params![id, today], |r| {
                Ok(HeldLineDto {
                    variant_id: r.get(0)?,
                    name: r.get(1)?,
                    variant_name: r.get(2)?,
                    price: r.get(3)?,
                    qty: r.get(4)?,
                    discount: r.get(5)?,
                    store_qty: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        tx.execute("DELETE FROM held_invoices WHERE id=?1", [id])?;
        Ok(HeldResumeDto {
            customer_id,
            invoice_discount,
            items,
        })
    })
}

#[tauri::command]
pub fn receive_purchase_cmd(
    state: State<AppState>,
    input: ReceivePurchaseInput,
    override_pin: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "purchases.receive", override_pin.as_deref())?;
        let id = receive_purchase(tx, uid, input)?;
        audit::log(tx, Some(uid), "purchase_receive", Some("purchase"), Some(id), "استلام مشتريات", None, None);
        Ok(id)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseRow {
    pub id: i64,
    pub invoice_number: String,
    pub supplier: String,
    pub grand_total: i64,
    pub paid_total: i64,
    pub invoice_date: String,
}

#[tauri::command]
pub fn list_purchases(state: State<AppState>) -> AppResult<Vec<PurchaseRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "purchases.view")?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.invoice_number, s.name, p.grand_total, p.paid_total, p.invoice_date
         FROM purchases p JOIN suppliers s ON s.id=p.supplier_id
         ORDER BY p.id DESC LIMIT 200",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(PurchaseRow {
                id: r.get(0)?,
                invoice_number: r.get(1)?,
                supplier: r.get(2)?,
                grand_total: r.get(3)?,
                paid_total: r.get(4)?,
                invoice_date: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_transfer_cmd(
    state: State<AppState>,
    from_location_id: i64,
    to_location_id: i64,
    items: Vec<TransferItemInput>,
    notes: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "transfers.request", None)?;
        let id = execute_transfer(tx, uid, from_location_id, to_location_id, items, notes)?;
        audit::log(tx, Some(uid), "transfer_complete", Some("transfer"), Some(id), "تحويل مخزون", None, None);
        Ok(id)
    })
}

#[tauri::command]
pub fn complete_transfer_cmd(
    state: State<AppState>,
    transfer_id: i64,
) -> AppResult<()> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "transfers.request", None)?;
        finish_transfer(tx, uid, transfer_id)?;
        audit::log(
            tx,
            Some(uid),
            "transfer_complete",
            Some("transfer"),
            Some(transfer_id),
            "تنفيذ تحويل",
            None,
            None,
        );
        Ok(())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickTransferResult {
    pub store_qty: i64,
    pub warehouse_qty: i64,
}

#[tauri::command]
pub fn quick_transfer_to_store(
    state: State<AppState>,
    variant_id: i64,
    quantity: Option<i64>,
    from_location_id: Option<i64>,
    batch_id: Option<i64>,
) -> AppResult<QuickTransferResult> {
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        let allowed = auth::user_has_permission(tx, uid, "transfers.request")?
            || auth::user_has_permission(tx, uid, "stock.adjust")?
            || auth::user_has_permission(tx, uid, "transfers.dispatch")?;
        if !allowed {
            return Err(AppError::user("ليست لديك صلاحية للتحويل السريع."));
        }
        let (store_qty, warehouse_qty) = quick_to_store(
            tx,
            uid,
            variant_id,
            quantity.unwrap_or(1),
            from_location_id,
            batch_id,
        )?;
        audit::log(
            tx,
            Some(uid),
            "transfer_quick",
            Some("transfer"),
            Some(variant_id),
            "تحويل سريع إلى المتجر",
            None,
            None,
        );
        Ok(QuickTransferResult {
            store_qty,
            warehouse_qty,
        })
    })
}

#[tauri::command]
pub fn advance_transfer(
    state: State<AppState>,
    transfer_id: i64,
    next_status: String,
    reason: Option<String>,
    override_pin: Option<String>,
) -> AppResult<()> {
    let perm = match next_status.as_str() {
        "approved" | "rejected" => "transfers.approve",
        "dispatched" | "preparing" => "transfers.dispatch",
        "received" => "transfers.receive",
        _ => "transfers.view",
    };
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, perm, override_pin.as_deref())?;
        set_status(tx, uid, transfer_id, &next_status, reason.as_deref())?;
        audit::log(
            tx,
            Some(uid),
            "transfer_advance",
            Some("transfer"),
            Some(transfer_id),
            &next_status,
            None,
            None,
        );
        Ok(())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferRow {
    pub id: i64,
    pub transfer_number: String,
    pub from_name: String,
    pub to_name: String,
    pub status: String,
    pub created_at: String,
}

#[tauri::command]
pub fn list_transfers(state: State<AppState>) -> AppResult<Vec<TransferRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "transfers.view")?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.transfer_number, a.name, b.name, t.status, t.created_at
         FROM transfers t
         JOIN locations a ON a.id = t.from_location_id
         JOIN locations b ON b.id = t.to_location_id
         ORDER BY t.id DESC LIMIT 200",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TransferRow {
                id: r.get(0)?,
                transfer_number: r.get(1)?,
                from_name: r.get(2)?,
                to_name: r.get(3)?,
                status: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyRow {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub extra: i64,
    pub is_active: i64,
    pub notes: Option<String>,
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone_alt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tax_number: Option<String>,
    pub sales_count: i64,
}

#[tauri::command]
pub fn list_customers(state: State<AppState>, query: Option<String>) -> AppResult<Vec<PartyRow>> {
    let conn = take_conn(&state)?;
    let like = format!("%{}%", query.unwrap_or_default());
    let mut stmt = conn.prepare(
        "SELECT id, name, mobile, loyalty_points, is_active, notes, address,
                (SELECT COUNT(*) FROM sales s WHERE s.customer_id = customers.id AND s.status != 'voided')
         FROM customers
         WHERE is_walk_in=0 AND (name LIKE ?1 OR IFNULL(mobile,'') LIKE ?1)
         ORDER BY name LIMIT 200",
    )?;
    let rows = stmt
        .query_map([like], |r| {
            Ok(PartyRow {
                id: r.get(0)?,
                name: r.get(1)?,
                phone: r.get(2)?,
                extra: r.get(3)?,
                is_active: r.get(4)?,
                notes: r.get(5)?,
                address: r.get(6)?,
                phone_alt: None,
                tax_number: None,
                sales_count: r.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn map_customer_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<PartyRow> {
    Ok(PartyRow {
        id: r.get(0)?,
        name: r.get(1)?,
        phone: r.get(2)?,
        extra: r.get(3)?,
        is_active: r.get(4)?,
        notes: r.get(5)?,
        address: r.get(6)?,
        phone_alt: None,
        tax_number: None,
        sales_count: 0,
    })
}

#[tauri::command]
pub fn get_customer(state: State<AppState>, id: i64) -> AppResult<Option<PartyRow>> {
    let conn = take_conn(&state)?;
    Ok(conn
        .query_row(
            "SELECT id, name, mobile, loyalty_points, is_active, notes, address,
                    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = customers.id AND s.status != 'voided')
             FROM customers WHERE id = ?1 AND is_walk_in=0",
            [id],
            |r| {
                Ok(PartyRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    phone: r.get(2)?,
                    extra: r.get(3)?,
                    is_active: r.get(4)?,
                    notes: r.get(5)?,
                    address: r.get(6)?,
                    phone_alt: None,
                    tax_number: None,
                    sales_count: r.get(7)?,
                })
            },
        )
        .optional()?)
}

fn phone_digits(phone: &str) -> String {
    phone.chars().filter(|c| c.is_ascii_digit()).collect()
}

fn phone_tail(digits: &str) -> String {
    if digits.len() > 9 {
        digits[digits.len() - 9..].to_string()
    } else {
        digits.to_string()
    }
}

const CUSTOMER_PHONE_SQL: &str = "SELECT id, name, mobile, loyalty_points, is_active, notes, address
     FROM customers
     WHERE is_walk_in=0 AND IFNULL(mobile,'') != ''
       AND (
         replace(replace(replace(replace(mobile,' ',''),'-',''),'+',''),'.','') = ?1
         OR replace(replace(replace(replace(mobile,' ',''),'-',''),'+',''),'.','') LIKE '%' || ?2
       )
     ORDER BY CASE
       WHEN replace(replace(replace(replace(mobile,' ',''),'-',''),'+',''),'.','') = ?1 THEN 0
       ELSE 1
     END, is_active DESC, id
     LIMIT 1";

fn find_customer_by_phone(conn: &Connection, digits: &str) -> AppResult<Option<PartyRow>> {
    if digits.len() < 6 {
        return Ok(None);
    }
    let tail = phone_tail(digits);
    Ok(conn
        .query_row(CUSTOMER_PHONE_SQL, params![digits, tail], map_customer_row)
        .optional()?)
}

fn normalize_customer_name(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn find_customer_by_name(conn: &Connection, name: &str) -> AppResult<Option<PartyRow>> {
    let name = normalize_customer_name(name);
    if name.chars().count() < 2 {
        return Ok(None);
    }
    Ok(conn
        .query_row(
            "SELECT id, name, mobile, loyalty_points, is_active, notes, address
             FROM customers
             WHERE is_walk_in=0 AND (name = ?1 OR trim(name) = ?1)
             ORDER BY CASE WHEN name = ?1 THEN 0 ELSE 1 END, is_active DESC, id
             LIMIT 1",
            params![name],
            map_customer_row,
        )
        .optional()?)
}

fn reactivate_customer(tx: &Connection, row: PartyRow) -> AppResult<PartyRow> {
    if row.is_active == 0 {
        let now = now_local();
        tx.execute(
            "UPDATE customers SET is_active=1, updated_at=?1 WHERE id=?2",
            params![now, row.id],
        )?;
        return Ok(PartyRow {
            is_active: 1,
            ..row
        });
    }
    Ok(row)
}

fn next_auto_customer_name(conn: &Connection) -> AppResult<String> {
    let max_n: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(CAST(SUBSTR(name, LENGTH('عميل ') + 1) AS INTEGER)), 0)
             FROM customers WHERE is_walk_in=0 AND name LIKE 'عميل %'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(format!("عميل {}", max_n + 1))
}

#[tauri::command]
pub fn lookup_customer_phone(state: State<AppState>, phone: String) -> AppResult<Option<PartyRow>> {
    let digits = phone_digits(&phone);
    let conn = take_conn(&state)?;
    find_customer_by_phone(&conn, &digits)
}

#[tauri::command]
pub fn ensure_customer_phone(state: State<AppState>, phone: String) -> AppResult<PartyRow> {
    let digits = phone_digits(&phone);
    if digits.len() < 8 {
        return Err(AppError::user("أدخل رقم هاتف كاملاً لحفظ العميل."));
    }
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        let can_sale = auth::user_has_permission(tx, uid, "sales.create")?;
        let can_manage = auth::user_has_permission(tx, uid, "customers.manage")?;
        if !can_sale && !can_manage {
            return Err(AppError::user("ليست لديك صلاحية إنشاء عميل."));
        }
        if let Some(existing) = find_customer_by_phone(tx, &digits)? {
            return reactivate_customer(tx, existing);
        }
        let name = next_auto_customer_name(tx)?;
        let now = now_local();
        tx.execute(
            "INSERT INTO customers(name, mobile, is_walk_in, is_active, created_at, updated_at)
             VALUES(?1,?2,0,1,?3,?3)",
            params![name, digits, now],
        )?;
        let cid = tx.last_insert_rowid();
        audit::log(
            tx,
            Some(uid),
            "customer_ensure",
            Some("customer"),
            Some(cid),
            &name,
            None,
            None,
        );
        Ok(tx.query_row(
            "SELECT id, name, mobile, loyalty_points, is_active, notes, address FROM customers WHERE id=?1",
            [cid],
            map_customer_row,
        )?)
    })
}

#[tauri::command]
pub fn lookup_customer_name(state: State<AppState>, name: String) -> AppResult<Option<PartyRow>> {
    let conn = take_conn(&state)?;
    find_customer_by_name(&conn, &name)
}

#[tauri::command]
pub fn ensure_customer_name(state: State<AppState>, name: String) -> AppResult<PartyRow> {
    let name = normalize_customer_name(&name);
    if name.chars().count() < 2 {
        return Err(AppError::user("أدخل اسم العميل."));
    }
    let digits = phone_digits(&name);
    if digits.len() >= 8 && name.chars().all(|c| c.is_ascii_digit() || c.is_whitespace() || matches!(c, '+' | '-' | '(' | ')' | '.')) {
        return Err(AppError::user("أدخل رقم هاتف كاملاً لحفظ العميل."));
    }
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        let can_sale = auth::user_has_permission(tx, uid, "sales.create")?;
        let can_manage = auth::user_has_permission(tx, uid, "customers.manage")?;
        if !can_sale && !can_manage {
            return Err(AppError::user("ليست لديك صلاحية إنشاء عميل."));
        }
        if let Some(existing) = find_customer_by_name(tx, &name)? {
            return reactivate_customer(tx, existing);
        }
        let now = now_local();
        tx.execute(
            "INSERT INTO customers(name, mobile, is_walk_in, is_active, created_at, updated_at)
             VALUES(?1,NULL,0,1,?2,?2)",
            params![name, now],
        )?;
        let cid = tx.last_insert_rowid();
        audit::log(
            tx,
            Some(uid),
            "customer_ensure",
            Some("customer"),
            Some(cid),
            &name,
            None,
            None,
        );
        Ok(tx.query_row(
            "SELECT id, name, mobile, loyalty_points, is_active, notes, address FROM customers WHERE id=?1",
            [cid],
            map_customer_row,
        )?)
    })
}

#[tauri::command]
pub fn save_customer(
    state: State<AppState>,
    id: Option<i64>,
    name: String,
    mobile: Option<String>,
    notes: Option<String>,
    address: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "customers.manage", None)?;
        let now = now_local();
        let cid = if let Some(id) = id {
            tx.execute(
                "UPDATE customers SET name=?1, mobile=?2, notes=?3, address=?4, updated_at=?5 WHERE id=?6",
                params![name.trim(), mobile, notes, address, now, id],
            )?;
            id
        } else {
            tx.execute(
                "INSERT INTO customers(name,mobile,notes,address,is_active,created_at,updated_at) VALUES(?1,?2,?3,?4,1,?5,?5)",
                params![name.trim(), mobile, notes, address, now],
            )?;
            tx.last_insert_rowid()
        };
        audit::log(tx, Some(uid), "customer_save", Some("customer"), Some(cid), name.trim(), None, None);
        Ok(cid)
    })
}

#[tauri::command]
pub fn list_suppliers(state: State<AppState>, query: Option<String>) -> AppResult<Vec<PartyRow>> {
    let conn = take_conn(&state)?;
    let like = format!("%{}%", query.unwrap_or_default());
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.phone,
                COALESCE((SELECT SUM(amount) FROM supplier_transactions t WHERE t.supplier_id=s.id),0),
                s.is_active, s.notes, s.address, s.phone_alt, s.tax_number
         FROM suppliers s
         WHERE s.name LIKE ?1 OR IFNULL(s.phone,'') LIKE ?1 OR IFNULL(s.tax_number,'') LIKE ?1
         ORDER BY s.name LIMIT 200",
    )?;
    let rows = stmt
        .query_map([like], |r| {
            Ok(PartyRow {
                id: r.get(0)?,
                name: r.get(1)?,
                phone: r.get(2)?,
                extra: r.get(3)?,
                is_active: r.get(4)?,
                notes: r.get(5)?,
                address: r.get(6)?,
                phone_alt: r.get(7)?,
                tax_number: r.get(8)?,
                sales_count: 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn save_supplier(
    state: State<AppState>,
    id: Option<i64>,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    notes: Option<String>,
    phone_alt: Option<String>,
    tax_number: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "suppliers.manage", None)?;
        let now = now_local();
        let sid = if let Some(id) = id {
            tx.execute(
                "UPDATE suppliers SET name=?1, phone=?2, phone_alt=?3, tax_number=?4, address=?5, notes=?6, updated_at=?7 WHERE id=?8",
                params![name.trim(), phone, phone_alt, tax_number, address, notes, now, id],
            )?;
            id
        } else {
            tx.execute(
                "INSERT INTO suppliers(name,phone,phone_alt,tax_number,address,notes,is_active,created_at,updated_at)
                 VALUES(?1,?2,?3,?4,?5,?6,1,?7,?7)",
                params![name.trim(), phone, phone_alt, tax_number, address, notes, now],
            )?;
            tx.last_insert_rowid()
        };
        audit::log(tx, Some(uid), "supplier_save", Some("supplier"), Some(sid), name.trim(), None, None);
        Ok(sid)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseRow {
    pub id: i64,
    pub category_id: i64,
    pub category: String,
    pub amount: i64,
    pub expense_date: String,
    pub description: Option<String>,
    pub payment_method: Option<String>,
}

#[tauri::command]
pub fn list_expenses(state: State<AppState>) -> AppResult<Vec<ExpenseRow>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare(
        "SELECT e.id, e.category_id, c.name_ar, e.amount, e.expense_date, e.description, p.name_ar
         FROM expenses e
         JOIN expense_categories c ON c.id=e.category_id
         LEFT JOIN payment_methods p ON p.id=e.payment_method_id
         ORDER BY e.expense_date DESC, e.id DESC LIMIT 500",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ExpenseRow {
                id: r.get(0)?,
                category_id: r.get(1)?,
                category: r.get(2)?,
                amount: r.get(3)?,
                expense_date: r.get(4)?,
                description: r.get(5)?,
                payment_method: r.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn list_expense_categories(state: State<AppState>) -> AppResult<Vec<super::catalog::NamedId>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare("SELECT id, name_ar FROM expense_categories WHERE is_active=1")?;
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
pub fn save_expense(
    state: State<AppState>,
    category_id: i64,
    amount: i64,
    expense_date: String,
    description: Option<String>,
    payment_method_id: Option<i64>,
) -> AppResult<i64> {
    if amount <= 0 {
        return Err(AppError::user("مبلغ المصروف غير صالح."));
    }
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "expenses.manage", None)?;
        let sid = auth::current_shift_id(tx).ok();
        let now = now_local();
        tx.execute(
            "INSERT INTO expenses(category_id,amount,expense_date,payment_method_id,description,user_id,cash_session_id,created_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![category_id, amount, expense_date, payment_method_id, description, uid, sid, now],
        )?;
        let id = tx.last_insert_rowid();
        if let Some(session) = sid {
            tx.execute(
                "INSERT INTO cash_movements(cash_session_id,occurred_at,type,amount,reason,reference_type,reference_id,user_id)
                 VALUES(?1,?2,'expense',?3,?4,'expense',?5,?6)",
                params![session, now, -amount, description, id, uid],
            )?;
        }
        Ok(id)
    })
}

#[tauri::command]
pub fn cash_move(
    state: State<AppState>,
    amount: i64,
    reason: String,
    is_in: bool,
) -> AppResult<()> {
    if amount <= 0 {
        return Err(AppError::user("المبلغ غير صالح."));
    }
    let note = reason.trim().to_string();
    if note.is_empty() {
        return Err(AppError::user("أدخل سبب الحركة."));
    }
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        let sid = auth::current_shift_id(tx)?;
        if !is_in {
            let expected: i64 = tx.query_row(
                "SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE cash_session_id = ?1",
                [sid],
                |r| r.get(0),
            )?;
            if amount > expected {
                return Err(AppError::user("المبلغ أكبر من رصيد الصندوق الحالي."));
            }
        }
        let signed = if is_in { amount } else { -amount };
        tx.execute(
            "INSERT INTO cash_movements(cash_session_id,occurred_at,type,amount,reason,user_id)
             VALUES(?1,?2,?3,?4,?5,?6)",
            params![sid, now_local(), if is_in { "cash_in" } else { "cash_out" }, signed, note, uid],
        )?;
        Ok(())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashSessionSummary {
    pub id: i64,
    pub user_name: String,
    pub opened_at: String,
    pub opening_cash: i64,
    pub expected_cash: i64,
    pub sales_in: i64,
    pub refunds: i64,
    pub expenses: i64,
    pub cash_in: i64,
    pub cash_out: i64,
    pub voids: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMoveRow {
    pub id: i64,
    pub session_id: i64,
    pub session_user: String,
    pub session_status: String,
    pub occurred_at: String,
    pub move_type: String,
    pub amount: i64,
    pub reason: Option<String>,
    pub reference_type: Option<String>,
    pub reference_id: Option<i64>,
    pub invoice_number: Option<String>,
    pub return_number: Option<String>,
    pub user_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashDrawer {
    pub open: Option<CashSessionSummary>,
    pub movements: Vec<CashMoveRow>,
}

#[tauri::command]
pub fn list_cash_drawer(state: State<AppState>) -> AppResult<CashDrawer> {
    let conn = take_conn(&state)?;
    if let Ok(uid) = auth::current_shift_user(&conn) {
        auth::require_permission(&conn, uid, "sales.view")?;
    }
    let open = conn
        .query_row(
            "SELECT s.id, u.name, s.opened_at, s.opening_cash,
                    COALESCE((SELECT SUM(amount) FROM cash_movements WHERE cash_session_id = s.id), 0),
                    COALESCE((SELECT SUM(CASE WHEN type='sale_cash' THEN amount ELSE 0 END) FROM cash_movements WHERE cash_session_id = s.id), 0),
                    COALESCE((SELECT SUM(CASE WHEN type='refund' THEN amount ELSE 0 END) FROM cash_movements WHERE cash_session_id = s.id), 0),
                    COALESCE((SELECT SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) FROM cash_movements WHERE cash_session_id = s.id), 0),
                    COALESCE((SELECT SUM(CASE WHEN type='cash_in' THEN amount ELSE 0 END) FROM cash_movements WHERE cash_session_id = s.id), 0),
                    COALESCE((SELECT SUM(CASE WHEN type='cash_out' THEN amount ELSE 0 END) FROM cash_movements WHERE cash_session_id = s.id), 0),
                    COALESCE((SELECT SUM(CASE WHEN type='void_reversal' THEN amount ELSE 0 END) FROM cash_movements WHERE cash_session_id = s.id), 0)
             FROM cash_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.status = 'open'
             LIMIT 1",
            [],
            |r| {
                Ok(CashSessionSummary {
                    id: r.get(0)?,
                    user_name: r.get(1)?,
                    opened_at: r.get(2)?,
                    opening_cash: r.get(3)?,
                    expected_cash: r.get(4)?,
                    sales_in: r.get(5)?,
                    refunds: r.get(6)?,
                    expenses: r.get(7)?,
                    cash_in: r.get(8)?,
                    cash_out: r.get(9)?,
                    voids: r.get(10)?,
                })
            },
        )
        .optional()?;
    let mut stmt = conn.prepare(
        "SELECT m.id, m.cash_session_id, su.name, cs.status, m.occurred_at, m.type, m.amount, m.reason,
                m.reference_type, m.reference_id, sl.invoice_number, ret.return_number, u.name
         FROM cash_movements m
         JOIN cash_sessions cs ON cs.id = m.cash_session_id
         JOIN users su ON su.id = cs.user_id
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN sales sl ON m.reference_type = 'sale' AND sl.id = m.reference_id
         LEFT JOIN returns ret ON m.reference_type = 'return' AND ret.id = m.reference_id
         ORDER BY m.id DESC
         LIMIT 800",
    )?;
    let movements = stmt
        .query_map([], |r| {
            Ok(CashMoveRow {
                id: r.get(0)?,
                session_id: r.get(1)?,
                session_user: r.get(2)?,
                session_status: r.get(3)?,
                occurred_at: r.get(4)?,
                move_type: r.get(5)?,
                amount: r.get(6)?,
                reason: r.get(7)?,
                reference_type: r.get(8)?,
                reference_id: r.get(9)?,
                invoice_number: r.get(10)?,
                return_number: r.get(11)?,
                user_name: r.get(12)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(CashDrawer { open, movements })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayMethod {
    pub id: i64,
    pub name: String,
    pub is_cash: i64,
}

#[tauri::command]
pub fn list_payment_methods(state: State<AppState>) -> AppResult<Vec<PayMethod>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare(
        "SELECT id, name_ar, is_cash FROM payment_methods
         WHERE is_active=1 AND code IN ('cash','bank_card','transfer')
         ORDER BY sort_order",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(PayMethod {
                id: r.get(0)?,
                name: r.get(1)?,
                is_cash: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StocktakeLine {
    pub variant_id: i64,
    pub batch_id: Option<i64>,
    pub counted_qty: i64,
}

#[tauri::command]
pub fn complete_stocktake(
    state: State<AppState>,
    location_id: i64,
    lines: Vec<StocktakeLine>,
    override_pin: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "stock.count", override_pin.as_deref())?;
        let now = now_local();
        tx.execute(
            "INSERT INTO stocktakes(location_id,status,user_id,created_at,completed_at) VALUES(?1,'completed',?2,?3,?3)",
            params![location_id, uid, now],
        )?;
        let sid = tx.last_insert_rowid();
        for line in lines {
            let system_qty: i64 = if let Some(bid) = line.batch_id {
                tx.query_row(
                    "SELECT COALESCE(SUM(quantity),0) FROM stock WHERE variant_id=?1 AND batch_id=?2 AND location_id=?3",
                    params![line.variant_id, bid, location_id],
                    |r| r.get(0),
                )?
            } else {
                tx.query_row(
                    "SELECT COALESCE(SUM(quantity),0) FROM stock WHERE variant_id=?1 AND location_id=?2",
                    params![line.variant_id, location_id],
                    |r| r.get(0),
                )?
            };
            let diff = line.counted_qty - system_qty;
            tx.execute(
                "INSERT INTO stocktake_items(stocktake_id,variant_id,batch_id,system_qty,counted_qty,difference)
                 VALUES(?1,?2,?3,?4,?5,?6)",
                params![sid, line.variant_id, line.batch_id, system_qty, line.counted_qty, diff],
            )?;
            if diff != 0 {
                if let Some(bid) = line.batch_id {
                    crate::inventory::apply_delta(
                        tx,
                        line.variant_id,
                        bid,
                        location_id,
                        diff,
                        "stocktake_adjustment",
                        Some("stocktake"),
                        Some(sid),
                        Some(uid),
                        Some("جرد"),
                        None,
                        crate::inventory::negative_allowed(tx),
                    )?;
                }
            }
        }
        Ok(sid)
    })
}

#[cfg(test)]
mod customer_name_tests {
    use super::normalize_customer_name;

    #[test]
    fn trims_and_collapses_customer_name() {
        assert_eq!(normalize_customer_name("  سارة   أحمد  "), "سارة أحمد");
        assert_eq!(normalize_customer_name("علي"), "علي");
    }
}
