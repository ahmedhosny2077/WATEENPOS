use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::util::{next_document_number, now_local};
use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseItemInput {
    pub variant_id: i64,
    pub quantity: i64,
    pub unit_cost: i64,
    pub discount: i64,
    pub batch_number: String,
    pub expiration_date: Option<String>,
    pub production_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivePurchaseInput {
    pub supplier_id: i64,
    pub supplier_invoice_no: Option<String>,
    pub location_id: i64,
    pub invoice_date: String,
    pub due_date: Option<String>,
    pub items: Vec<PurchaseItemInput>,
    pub discount: i64,
    pub tax_total: i64,
    pub paid_total: i64,
    pub payment_method_id: Option<i64>,
    pub notes: Option<String>,
}

pub fn receive_purchase(
    conn: &Connection,
    user_id: i64,
    input: ReceivePurchaseInput,
) -> AppResult<i64> {
    if input.items.is_empty() {
        return Err(AppError::user("أضف بنود المشتريات."));
    }
    let loc_type: String = conn
        .query_row(
            "SELECT type FROM locations WHERE id = ?1 AND is_active = 1",
            [input.location_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::user("موقع الاستلام غير صالح."))?;
    if loc_type != "warehouse" {
        return Err(AppError::user("يتم استلام المشتريات في المخزن فقط."));
    }
    let mut subtotal = 0i64;
    for it in &input.items {
        if it.quantity <= 0 || it.unit_cost < 0 || it.discount < 0 {
            return Err(AppError::user("بيانات بند المشتريات غير صالحة."));
        }
        if it.batch_number.trim().is_empty() {
            return Err(AppError::user("رقم الدفعة مطلوب."));
        }
        subtotal = subtotal
            .checked_add(it.unit_cost.checked_mul(it.quantity).ok_or_else(|| {
                AppError::user("تجاوز حساب المشتريات الحد المسموح.")
            })?)
            .ok_or_else(|| AppError::user("تجاوز حساب المشتريات الحد المسموح."))?;
        subtotal = subtotal
            .checked_sub(it.discount)
            .ok_or_else(|| AppError::user("خصم المشتريات غير صالح."))?;
    }
    let grand = subtotal
        .checked_sub(input.discount)
        .and_then(|v| v.checked_add(input.tax_total))
        .ok_or_else(|| AppError::user("إجمالي المشتريات غير صالح."))?;
    if input.paid_total < 0 || input.paid_total > grand {
        return Err(AppError::user("المبلغ المدفوع غير صالح."));
    }

    let invoice_number = next_document_number(conn, "purchase")?;
    let now = now_local();
    conn.execute(
        "INSERT INTO purchases(invoice_number,supplier_invoice_no,supplier_id,location_id,invoice_date,due_date,status,subtotal,discount,tax_total,grand_total,paid_total,notes,user_id,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,'received',?7,?8,?9,?10,?11,?12,?13,?14,?14)",
        params![
            invoice_number,
            input.supplier_invoice_no,
            input.supplier_id,
            input.location_id,
            input.invoice_date,
            input.due_date,
            subtotal,
            input.discount,
            input.tax_total,
            grand,
            input.paid_total,
            input.notes,
            user_id,
            now
        ],
    )?;
    let purchase_id = conn.last_insert_rowid();

    for it in &input.items {
        conn.execute(
            "INSERT INTO batches(variant_id,batch_number,production_date,expiration_date,unit_cost,qty_received,supplier_id,purchase_id,created_at,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            params![
                it.variant_id,
                it.batch_number,
                it.production_date,
                it.expiration_date,
                it.unit_cost,
                it.quantity,
                input.supplier_id,
                purchase_id,
                now
            ],
        )?;
        let batch_id = conn.last_insert_rowid();
        let line_total = it.unit_cost * it.quantity - it.discount;
        conn.execute(
            "INSERT INTO purchase_items(purchase_id,variant_id,batch_id,batch_number,expiration_date,quantity,unit_cost,discount,tax,line_total)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,0,?9)",
            params![
                purchase_id,
                it.variant_id,
                batch_id,
                it.batch_number,
                it.expiration_date,
                it.quantity,
                it.unit_cost,
                it.discount,
                line_total
            ],
        )?;
        inventory::apply_delta(
            conn,
            it.variant_id,
            batch_id,
            input.location_id,
            it.quantity,
            "purchase_receipt",
            Some("purchase"),
            Some(purchase_id),
            Some(user_id),
            None,
            Some(it.unit_cost),
            true,
        )?;
    }

    conn.execute(
        "INSERT INTO supplier_transactions(supplier_id,occurred_at,type,amount,reference_type,reference_id,user_id)
         VALUES(?1,?2,'purchase',?3,'purchase',?4,?5)",
        params![input.supplier_id, now, grand, purchase_id, user_id],
    )?;
    if input.paid_total > 0 {
        conn.execute(
            "INSERT INTO supplier_transactions(supplier_id,occurred_at,type,amount,reference_type,reference_id,user_id)
             VALUES(?1,?2,'payment',?3,'purchase',?4,?5)",
            params![input.supplier_id, now, -input.paid_total, purchase_id, user_id],
        )?;
    }
    Ok(purchase_id)
}

pub fn opening_balance(
    conn: &Connection,
    user_id: i64,
    variant_id: i64,
    location_id: i64,
    quantity: i64,
    unit_cost: i64,
    batch_number: String,
    expiration_date: Option<String>,
    production_date: Option<String>,
) -> AppResult<i64> {
    if quantity <= 0 {
        return Err(AppError::user("كمية الرصيد الافتتاحي يجب أن تكون أكبر من صفر."));
    }
    let now = now_local();
    conn.execute(
        "INSERT INTO batches(variant_id,batch_number,production_date,expiration_date,unit_cost,qty_received,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?7)",
        params![
            variant_id,
            batch_number,
            production_date,
            expiration_date,
            unit_cost,
            quantity,
            now
        ],
    )?;
    let batch_id = conn.last_insert_rowid();
    inventory::apply_delta(
        conn,
        variant_id,
        batch_id,
        location_id,
        quantity,
        "opening_balance",
        Some("opening"),
        Some(batch_id),
        Some(user_id),
        Some("رصيد افتتاحي"),
        Some(unit_cost),
        true,
    )?;
    Ok(batch_id)
}
