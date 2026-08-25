use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::money::Money;
use crate::util::{now_local, setting, setting_i64};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleLineInput {
    pub variant_id: i64,
    pub quantity: i64,
    pub unit_price: Option<i64>,
    pub discount: i64,
    pub batch_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentInput {
    pub payment_method_id: i64,
    pub amount: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteSaleInput {
    pub lines: Vec<SaleLineInput>,
    pub customer_id: Option<i64>,
    pub invoice_discount: i64,
    pub payments: Vec<PaymentInput>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedSale {
    pub id: i64,
    pub invoice_number: String,
    pub grand_total: i64,
    pub cost_total: i64,
}

pub fn complete_sale(
    conn: &Connection,
    user_id: i64,
    input: CompleteSaleInput,
) -> AppResult<CompletedSale> {
    if input.lines.is_empty() {
        return Err(AppError::user("أضف صنفاً واحداً على الأقل."));
    }
    let location_id = inventory::store_location_id(conn)?;
    let session_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();
    let allow_neg = inventory::negative_allowed(conn);
    let tax_enabled = setting(conn, "tax.enabled", "0") == "1";
    let tax_bps = setting_i64(conn, "tax.rate_bps", 0);
    let tax_inclusive = setting(conn, "tax.inclusive", "1") == "1";

    let mut subtotal = Money(0);
    let mut item_discount_total = Money(0);
    let mut cost_total = Money(0);
    let mut prepared = Vec::new();

    for line in &input.lines {
        if line.quantity <= 0 {
            return Err(AppError::user("الكمية يجب أن تكون أكبر من صفر."));
        }
        if line.discount < 0 {
            return Err(AppError::user("الخصم غير صالح."));
        }
        let (name_ar, variant_name, sku, barcode, default_price, _product_id): (
            String,
            String,
            Option<String>,
            Option<String>,
            i64,
            i64,
        ) = conn.query_row(
            "SELECT p.name_ar, v.name,
                    COALESCE(v.sku, p.sku),
                    (SELECT code FROM barcodes WHERE variant_id = v.id AND is_primary = 1 LIMIT 1),
                    COALESCE(v.retail_price, p.retail_price),
                    p.id
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             WHERE v.id = ?1 AND v.is_active = 1 AND p.is_active = 1",
            [line.variant_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            },
        )
        .map_err(|_| AppError::user("الصنف غير موجود أو غير نشط."))?;

        let unit_price = line.unit_price.unwrap_or(default_price);
        if unit_price < 0 {
            return Err(AppError::user("السعر غير صالح."));
        }
        let alloc = inventory::allocate_fefo(
            conn,
            line.variant_id,
            location_id,
            line.quantity,
            line.batch_id,
        )?;
        let line_gross = Money(unit_price).checked_mul_qty(line.quantity)?;
        if line.discount > line_gross.0 {
            return Err(AppError::user("خصم الصنف أكبر من قيمته."));
        }
        let mut line_cost = Money(0);
        for a in &alloc {
            line_cost = line_cost.checked_add(Money(a.unit_cost).checked_mul_qty(a.quantity)?)?;
        }
        subtotal = subtotal.checked_add(line_gross)?;
        item_discount_total = item_discount_total.checked_add(Money(line.discount))?;
        cost_total = cost_total.checked_add(line_cost)?;
        prepared.push((
            line,
            name_ar,
            variant_name,
            sku,
            barcode,
            unit_price,
            alloc,
            line_gross.0 - line.discount,
            line_cost.0,
        ));
    }

    if input.invoice_discount < 0 {
        return Err(AppError::user("خصم الفاتورة غير صالح."));
    }
    let after_item = subtotal.checked_sub(item_discount_total)?;
    if input.invoice_discount > after_item.0 {
        return Err(AppError::user("خصم الفاتورة أكبر من الإجمالي."));
    }
    let after_disc = after_item.checked_sub(Money(input.invoice_discount))?;
    let limit = crate::auth::discount_limit_bps(conn, user_id)?;
    if after_item.0 > 0 && input.invoice_discount > 0 && limit < 10_000 {
        let allowed = after_item
            .0
            .saturating_mul(limit)
            / 10_000;
        if input.invoice_discount > allowed {
            return Err(AppError::user("الخصم أكبر من الحد المسموح لصلاحيتك."));
        }
    }
    let (tax_total, grand) = if !tax_enabled || tax_bps == 0 {
        (Money(0), after_disc)
    } else if tax_inclusive {
        let tax = after_disc.percent_bps(tax_bps * 100 / (10_000 + tax_bps))?;
        (tax, after_disc)
    } else {
        let tax = after_disc.percent_bps(tax_bps)?;
        (tax, after_disc.checked_add(tax)?)
    };

    let mut paid = 0i64;
    for p in &input.payments {
        if p.amount < 0 {
            return Err(AppError::user("قيمة الدفع غير صالحة."));
        }
        paid = paid
            .checked_add(p.amount)
            .ok_or_else(|| AppError::user("تجاوز مجموع المدفوعات الحد المسموح."))?;
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM payment_methods WHERE id = ?1 AND is_active = 1",
            [p.payment_method_id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::user("طريقة الدفع غير صالحة."));
        }
    }
    if paid < grand.0 {
        return Err(AppError::user("المبلغ المدفوع أقل من إجمالي الفاتورة."));
    }

    let invoice_number = crate::util::next_document_number(conn, "sale")?;

    let now = now_local();
    conn.execute(
        "INSERT INTO sales(invoice_number,status,location_id,customer_id,user_id,cash_session_id,
            subtotal,item_discount_total,invoice_discount,tax_total,grand_total,cost_total,paid_total,notes,created_at)
         VALUES(?1,'completed',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![
            invoice_number,
            location_id,
            input.customer_id,
            user_id,
            session_id,
            subtotal.0,
            item_discount_total.0,
            input.invoice_discount,
            tax_total.0,
            grand.0,
            cost_total.0,
            paid,
            input.notes,
            now
        ],
    )?;
    let sale_id = conn.last_insert_rowid();

    for (line, name_ar, variant_name, sku, barcode, unit_price, alloc, line_total, line_cost) in
        prepared
    {
        conn.execute(
            "INSERT INTO sale_items(sale_id,variant_id,product_name,variant_name,sku,barcode,quantity,unit_price,discount,tax,line_total,line_cost)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11)",
            params![
                sale_id,
                line.variant_id,
                name_ar,
                variant_name,
                sku,
                barcode,
                line.quantity,
                unit_price,
                line.discount,
                line_total,
                line_cost
            ],
        )?;
        let item_id = conn.last_insert_rowid();
        for a in alloc {
            conn.execute(
                "INSERT INTO sale_item_batches(sale_item_id,batch_id,quantity,unit_cost) VALUES(?1,?2,?3,?4)",
                params![item_id, a.batch_id, a.quantity, a.unit_cost],
            )?;
            inventory::apply_delta(
                conn,
                line.variant_id,
                a.batch_id,
                location_id,
                -a.quantity,
                "sale",
                Some("sale"),
                Some(sale_id),
                Some(user_id),
                None,
                Some(a.unit_cost),
                allow_neg,
            )?;
        }
    }

    for p in &input.payments {
        conn.execute(
            "INSERT INTO sale_payments(sale_id,payment_method_id,amount,created_at) VALUES(?1,?2,?3,?4)",
            params![sale_id, p.payment_method_id, p.amount, now],
        )?;
        let is_cash: i64 = conn.query_row(
            "SELECT is_cash FROM payment_methods WHERE id = ?1",
            [p.payment_method_id],
            |r| r.get(0),
        )?;
        if is_cash == 1 {
            if let Some(sid) = session_id {
                conn.execute(
                    "INSERT INTO cash_movements(cash_session_id,occurred_at,type,amount,reference_type,reference_id,user_id)
                     VALUES(?1,?2,'sale_cash',?3,'sale',?4,?5)",
                    params![sid, now, p.amount, sale_id, user_id],
                )?;
            }
        }
    }

    if let Some(cid) = input.customer_id {
        let walk: i64 = conn
            .query_row(
                "SELECT is_walk_in FROM customers WHERE id = ?1",
                [cid],
                |r| r.get(0),
            )
            .unwrap_or(1);
        if walk == 0 && setting(conn, "loyalty.enabled", "0") == "1" {
            let per = setting_i64(conn, "loyalty.points_per_100", 1);
            let points = grand.0 / 100 * per;
            if points > 0 {
                conn.execute(
                    "UPDATE customers SET loyalty_points = loyalty_points + ?1 WHERE id = ?2",
                    params![points, cid],
                )?;
                conn.execute(
                    "INSERT INTO loyalty_transactions(customer_id,occurred_at,points_delta,reason,reference_type,reference_id)
                     VALUES(?1,?2,?3,'sale','sale',?4)",
                    params![cid, now, points, sale_id],
                )?;
            }
        }
        conn.execute(
            "INSERT INTO customer_transactions(customer_id,occurred_at,type,amount,reference_type,reference_id,user_id)
             VALUES(?1,?2,'sale',?3,'sale',?4,?5)",
            params![cid, now, grand.0, sale_id, user_id],
        )?;
    }

    Ok(CompletedSale {
        id: sale_id,
        invoice_number,
        grand_total: grand.0,
        cost_total: cost_total.0,
    })
}

pub fn void_sale(conn: &Connection, user_id: i64, sale_id: i64, reason: &str) -> AppResult<()> {
    let (status, location_id, session_id, customer_id): (String, i64, Option<i64>, Option<i64>) =
        conn.query_row(
            "SELECT status, location_id, cash_session_id, customer_id FROM sales WHERE id = ?1",
            [sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| AppError::user("الفاتورة غير موجودة."))?;
    if status != "completed" {
        return Err(AppError::user("لا يمكن إلغاء هذه الفاتورة."));
    }
    if reason.trim().is_empty() {
        return Err(AppError::user("سبب الإلغاء مطلوب."));
    }
    let allow_neg = inventory::negative_allowed(conn);
    let now = now_local();

    let mut stmt = conn.prepare(
        "SELECT si.variant_id, sib.batch_id, sib.quantity, sib.unit_cost
         FROM sale_items si JOIN sale_item_batches sib ON sib.sale_item_id = si.id
         WHERE si.sale_id = ?1",
    )?;
    let rows: Vec<(i64, i64, i64, i64)> = stmt
        .query_map([sale_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<Result<_, _>>()?;
    drop(stmt);
    for (variant_id, batch_id, qty, cost) in rows {
        inventory::apply_delta(
            conn,
            variant_id,
            batch_id,
            location_id,
            qty,
            "void_reversal",
            Some("sale"),
            Some(sale_id),
            Some(user_id),
            Some(reason),
            Some(cost),
            allow_neg,
        )?;
    }

    conn.execute(
        "UPDATE sales SET status='voided', void_reason=?1, voided_by=?2, voided_at=?3 WHERE id=?4",
        params![reason, user_id, now, sale_id],
    )?;

    if let Some(sid) = session_id {
        conn.execute(
            "INSERT INTO cash_movements(cash_session_id,occurred_at,type,amount,reason,reference_type,reference_id,user_id)
             SELECT ?1, ?2, 'void_reversal', -sp.amount, ?3, 'sale', sp.sale_id, ?4
             FROM sale_payments sp
             JOIN payment_methods pm ON pm.id = sp.payment_method_id
             WHERE sp.sale_id = ?5 AND pm.is_cash = 1",
            params![sid, now, reason, user_id, sale_id],
        )?;
    }
    let _ = customer_id;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnLineInput {
    pub sale_item_id: i64,
    pub quantity: i64,
}

pub fn return_sale(
    conn: &Connection,
    user_id: i64,
    sale_id: i64,
    lines: Vec<ReturnLineInput>,
    reason: Option<String>,
) -> AppResult<i64> {
    if lines.is_empty() {
        return Err(AppError::user("اختر بنود المرتجع."));
    }
    let (status, location_id, customer_id, session_id): (String, i64, Option<i64>, Option<i64>) =
        conn.query_row(
            "SELECT status, location_id, customer_id, cash_session_id FROM sales WHERE id = ?1",
            [sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| AppError::user("الفاتورة غير موجودة."))?;
    if status != "completed" {
        return Err(AppError::user("يمكن عمل مرتجع للفواتير المكتملة فقط."));
    }
    let policy = crate::util::setting(conn, "inventory.return_restock", "original_batch");
    let now = now_local();
    let number = crate::util::next_document_number(conn, "return")?;
    let mut refund_total = 0i64;

    conn.execute(
        "INSERT INTO returns(return_number,sale_id,location_id,customer_id,user_id,cash_session_id,restock_policy,refund_total,reason,created_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,0,?8,?9)",
        rusqlite::params![
            number,
            sale_id,
            location_id,
            customer_id,
            user_id,
            session_id,
            policy,
            reason,
            now
        ],
    )?;
    let return_id = conn.last_insert_rowid();

    for line in lines {
        if line.quantity <= 0 {
            return Err(AppError::user("كمية المرتجع غير صالحة."));
        }
        let (variant_id, sold_qty, unit_price, line_total): (i64, i64, i64, i64) = conn.query_row(
            "SELECT variant_id, quantity, unit_price, line_total FROM sale_items WHERE id = ?1 AND sale_id = ?2",
            rusqlite::params![line.sale_item_id, sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| AppError::user("بند الفاتورة غير موجود."))?;
        let already: i64 = conn.query_row(
            "SELECT COALESCE(SUM(ri.quantity),0) FROM return_items ri
             JOIN returns r ON r.id = ri.return_id
             WHERE ri.sale_item_id = ?1",
            [line.sale_item_id],
            |r| r.get(0),
        )?;
        if already + line.quantity > sold_qty {
            return Err(AppError::user("كمية المرتجع أكبر من الكمية المباعة."));
        }
        let refund = if sold_qty == 0 {
            0
        } else {
            crate::money::div_round(line_total * line.quantity, sold_qty)
        };
        refund_total = refund_total
            .checked_add(refund)
            .ok_or_else(|| AppError::user("تجاوز مبلغ المرتجع الحد المسموح."))?;

        let mut remain = line.quantity;
        let mut stmt = conn.prepare(
            "SELECT batch_id, quantity FROM sale_item_batches WHERE sale_item_id = ?1 ORDER BY id",
        )?;
        let batches: Vec<(i64, i64)> = stmt
            .query_map([line.sale_item_id], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<_, _>>()?;
        drop(stmt);
        let mut last_batch = batches.first().map(|b| b.0);
        for (batch_id, bqty) in batches {
            if remain <= 0 {
                break;
            }
            let take = remain.min(bqty);
            last_batch = Some(batch_id);
            if policy != "quarantine" {
                inventory::apply_delta(
                    conn,
                    variant_id,
                    batch_id,
                    location_id,
                    take,
                    "customer_return",
                    Some("return"),
                    Some(return_id),
                    Some(user_id),
                    reason.as_deref(),
                    Some(unit_price),
                    true,
                )?;
            }
            remain -= take;
        }
        conn.execute(
            "INSERT INTO return_items(return_id,sale_item_id,variant_id,batch_id,quantity,unit_price,refund_amount)
             VALUES(?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![
                return_id,
                line.sale_item_id,
                variant_id,
                last_batch,
                line.quantity,
                unit_price,
                refund
            ],
        )?;
    }

    conn.execute(
        "UPDATE returns SET refund_total = ?1 WHERE id = ?2",
        rusqlite::params![refund_total, return_id],
    )?;
    if let Some(sid) = session_id {
        let cash_paid: i64 = conn.query_row(
            "SELECT COALESCE(SUM(sp.amount),0) FROM sale_payments sp
             JOIN payment_methods pm ON pm.id = sp.payment_method_id
             WHERE sp.sale_id = ?1 AND pm.is_cash = 1",
            [sale_id],
            |r| r.get(0),
        )?;
        let already: i64 = conn.query_row(
            "SELECT COALESCE(SUM(ABS(amount)),0) FROM cash_movements
             WHERE type='refund' AND reference_type='return'
               AND reference_id IN (SELECT id FROM returns WHERE sale_id = ?1 AND id != ?2)",
            rusqlite::params![sale_id, return_id],
            |r| r.get(0),
        )?;
        let cash_left = cash_paid.saturating_sub(already);
        let cash_refund = refund_total.min(cash_left);
        if cash_refund > 0 {
            conn.execute(
                "INSERT INTO cash_movements(cash_session_id,occurred_at,type,amount,reason,reference_type,reference_id,user_id)
                 VALUES(?1,?2,'refund',?3,?4,'return',?5,?6)",
                rusqlite::params![sid, now, -cash_refund, reason, return_id, user_id],
            )?;
        }
    }
    Ok(return_id)
}
