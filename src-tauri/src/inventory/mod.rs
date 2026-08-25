use crate::error::{AppError, AppResult};
use crate::util::{now_local, setting};
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone)]
pub struct Allocation {
    pub batch_id: i64,
    pub quantity: i64,
    pub unit_cost: i64,
    pub expiration_date: Option<String>,
    pub batch_number: String,
}

pub fn apply_delta(
    conn: &Connection,
    variant_id: i64,
    batch_id: i64,
    location_id: i64,
    delta: i64,
    movement_type: &str,
    reference_type: Option<&str>,
    reference_id: Option<i64>,
    user_id: Option<i64>,
    reason: Option<&str>,
    unit_cost: Option<i64>,
    allow_negative: bool,
) -> AppResult<i64> {
    if delta == 0 {
        return Err(AppError::user("كمية الحركة يجب ألا تكون صفراً."));
    }
    let now = now_local();
    conn.execute(
        "INSERT INTO stock_movements(
            occurred_at, variant_id, batch_id, location_id, quantity_delta,
            movement_type, reference_type, reference_id, user_id, reason, unit_cost, created_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?1)",
        params![
            now,
            variant_id,
            batch_id,
            location_id,
            delta,
            movement_type,
            reference_type,
            reference_id,
            user_id,
            reason,
            unit_cost
        ],
    )?;

    conn.execute(
        "INSERT INTO stock(variant_id, batch_id, location_id, quantity, updated_at)
         VALUES(?1,?2,?3,0,?4)
         ON CONFLICT(variant_id, batch_id, location_id) DO NOTHING",
        params![variant_id, batch_id, location_id, now],
    )?;

    conn.execute(
        "UPDATE stock SET quantity = quantity + ?1, updated_at = ?2
         WHERE variant_id = ?3 AND batch_id = ?4 AND location_id = ?5",
        params![delta, now, variant_id, batch_id, location_id],
    )?;

    let qty: i64 = conn.query_row(
        "SELECT quantity FROM stock WHERE variant_id = ?1 AND batch_id = ?2 AND location_id = ?3",
        params![variant_id, batch_id, location_id],
        |r| r.get(0),
    )?;
    if qty < 0 && !allow_negative {
        return Err(AppError::user("الكمية غير كافية في هذا الموقع."));
    }
    Ok(qty)
}

pub fn available_qty(conn: &Connection, variant_id: i64, location_id: i64) -> AppResult<i64> {
    let today = crate::util::today();
    let qty: i64 = conn.query_row(
        "SELECT COALESCE(SUM(s.quantity), 0)
         FROM stock s
         JOIN batches b ON b.id = s.batch_id
         WHERE s.variant_id = ?1 AND s.location_id = ?2 AND s.quantity > 0
           AND (b.expiration_date IS NULL OR b.expiration_date >= ?3)",
        params![variant_id, location_id, today],
        |r| r.get(0),
    )?;
    Ok(qty)
}

pub fn store_location_id(conn: &Connection) -> AppResult<i64> {
    conn.query_row(
        "SELECT id FROM locations WHERE type = 'store' AND is_active = 1 LIMIT 1",
        [],
        |r| r.get(0),
    )
    .map_err(|_| AppError::user("لم يتم العثور على موقع المتجر."))
}

/// Sellable quantity at the store for `variant_expr` (e.g. `v.id`).
/// `today_param` is a rusqlite placeholder such as `?5`.
pub fn sql_sellable_store_qty(variant_expr: &str, today_param: &str) -> String {
    format!(
        "COALESCE((SELECT SUM(s.quantity) FROM stock s
          JOIN locations l ON l.id = s.location_id
          JOIN batches b ON b.id = s.batch_id
          WHERE s.variant_id = {variant_expr} AND l.type = 'store' AND s.quantity > 0
            AND (b.expiration_date IS NULL OR b.expiration_date >= {today_param})), 0)"
    )
}

pub fn variant_qtys(conn: &Connection, variant_id: i64) -> AppResult<(i64, i64)> {
    let today = crate::util::today();
    let store: i64 = conn.query_row(
        "SELECT COALESCE(SUM(s.quantity), 0)
         FROM stock s
         JOIN locations l ON l.id = s.location_id
         JOIN batches b ON b.id = s.batch_id
         WHERE s.variant_id = ?1 AND l.type = 'store' AND s.quantity > 0
           AND (b.expiration_date IS NULL OR b.expiration_date >= ?2)",
        params![variant_id, today],
        |r| r.get(0),
    )?;
    let warehouse: i64 = conn.query_row(
        "SELECT COALESCE(SUM(s.quantity), 0)
         FROM stock s
         JOIN locations l ON l.id = s.location_id
         JOIN batches b ON b.id = s.batch_id
         WHERE s.variant_id = ?1 AND l.type = 'warehouse' AND s.quantity > 0
           AND (b.expiration_date IS NULL OR b.expiration_date >= ?2)",
        params![variant_id, today],
        |r| r.get(0),
    )?;
    Ok((store, warehouse))
}

pub fn warehouse_location_id(conn: &Connection) -> AppResult<i64> {
    conn.query_row(
        "SELECT id FROM locations WHERE type = 'warehouse' AND is_active = 1 LIMIT 1",
        [],
        |r| r.get(0),
    )
    .map_err(|_| AppError::user("لم يتم العثور على المخزن."))
}

pub fn transit_location_id(conn: &Connection) -> AppResult<i64> {
    conn.query_row(
        "SELECT id FROM locations WHERE type = 'transit' LIMIT 1",
        [],
        |r| r.get(0),
    )
    .map_err(|_| AppError::user("لم يتم العثور على موقع التحويل."))
}

pub fn negative_allowed(conn: &Connection) -> bool {
    setting(conn, "inventory.negative_stock", "0") == "1"
}

/// FEFO allocation at a location. Does not mutate stock.
pub fn allocate_fefo(
    conn: &Connection,
    variant_id: i64,
    location_id: i64,
    needed: i64,
    explicit_batch_id: Option<i64>,
) -> AppResult<Vec<Allocation>> {
    if needed <= 0 {
        return Err(AppError::user("الكمية يجب أن تكون أكبر من صفر."));
    }
    let today = crate::util::today();
    let no_exp_policy = setting(conn, "inventory.no_expiry_policy", "after_dated");
    let fefo = setting(conn, "inventory.fefo", "1") != "0";

    if let Some(bid) = explicit_batch_id {
        let row = conn
            .query_row(
                "SELECT s.quantity, b.unit_cost, b.expiration_date, b.batch_number
                 FROM stock s JOIN batches b ON b.id = s.batch_id
                 WHERE s.variant_id = ?1 AND s.location_id = ?2 AND s.batch_id = ?3",
                params![variant_id, location_id, bid],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?;
        let Some((qty, cost, exp, num)) = row else {
            return Err(AppError::user("الدفعة المحددة غير موجودة في هذا الموقع."));
        };
        if let Some(ref e) = exp {
            if e.as_str() < today.as_str() {
                return Err(AppError::user("لا يمكن بيع دفعة منتهية الصلاحية."));
            }
        }
        if qty < needed && !negative_allowed(conn) {
            return Err(AppError::user("الكمية غير كافية في الدفعة المحددة."));
        }
        return Ok(vec![Allocation {
            batch_id: bid,
            quantity: needed,
            unit_cost: cost,
            expiration_date: exp,
            batch_number: num,
        }]);
    }

    let order = if !fefo {
        "b.id ASC"
    } else if no_exp_policy == "before_dated" {
        "CASE WHEN b.expiration_date IS NULL THEN 0 ELSE 1 END, b.expiration_date ASC, b.id ASC"
    } else {
        "CASE WHEN b.expiration_date IS NULL THEN 1 ELSE 0 END, b.expiration_date ASC, b.id ASC"
    };
    let sql = format!(
        "SELECT s.batch_id, s.quantity, b.unit_cost, b.expiration_date, b.batch_number
         FROM stock s JOIN batches b ON b.id = s.batch_id
         WHERE s.variant_id = ?1 AND s.location_id = ?2 AND s.quantity > 0
           AND (b.expiration_date IS NULL OR b.expiration_date >= ?3)
         ORDER BY {order}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![variant_id, location_id, today], |r| {
        Ok(Allocation {
            batch_id: r.get(0)?,
            quantity: r.get(1)?,
            unit_cost: r.get(2)?,
            expiration_date: r.get(3)?,
            batch_number: r.get(4)?,
        })
    })?;

    let mut remaining = needed;
    let mut out = Vec::with_capacity(4);
    for row in rows {
        if remaining <= 0 {
            break;
        }
        let mut a = row?;
        let take = remaining.min(a.quantity);
        a.quantity = take;
        remaining -= take;
        out.push(a);
    }
    if remaining > 0 && !negative_allowed(conn) {
        return Err(AppError::user("الكمية غير كافية في المتجر (بعد استبعاد المنتهي)."));
    }
    if remaining > 0 {
        if let Some(last) = out.last_mut() {
            last.quantity += remaining;
        } else {
            return Err(AppError::user("لا يوجد مخزون متاح لهذا الصنف."));
        }
    }
    Ok(out)
}

/// Check stock balance consistency: compare `stock.quantity` against
/// the running total of `stock_movements.quantity_delta` for each
/// (variant_id, batch_id, location_id). Returns a list of mismatches.
pub fn reconcile_stock(conn: &Connection) -> AppResult<Vec<StockMismatch>> {
    let mut stmt = conn.prepare(
        "SELECT s.variant_id, s.batch_id, s.location_id, s.quantity,
                COALESCE((SELECT SUM(sm.quantity_delta)
                          FROM stock_movements sm
                          WHERE sm.variant_id = s.variant_id
                            AND sm.batch_id = s.batch_id
                            AND sm.location_id = s.location_id), 0)
         FROM stock s
         WHERE s.quantity != COALESCE((SELECT SUM(sm.quantity_delta)
                                       FROM stock_movements sm
                                       WHERE sm.variant_id = s.variant_id
                                         AND sm.batch_id = s.batch_id
                                         AND sm.location_id = s.location_id), 0)",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(StockMismatch {
                variant_id: r.get(0)?,
                batch_id: r.get(1)?,
                location_id: r.get(2)?,
                balance_qty: r.get(3)?,
                movements_sum: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Auto-correct stock balances that have drifted from ledger history.
/// Logs a correction movement for audit trail. Returns count of corrections.
pub fn auto_fix_stock_drift(conn: &Connection, user_id: Option<i64>) -> AppResult<usize> {
    let mismatches = reconcile_stock(conn)?;
    let now = crate::util::now_local();
    let mut fixed = 0usize;
    for m in &mismatches {
        let diff = m.movements_sum - m.balance_qty;
        conn.execute(
            "INSERT INTO stock_movements(
                occurred_at, variant_id, batch_id, location_id, quantity_delta,
                movement_type, reference_type, reference_id, user_id, reason, unit_cost, created_at
             ) VALUES(?1,?2,?3,?4,?5,'correction',NULL,NULL,?6,'تصحيح انحراف تلقائي',NULL,?1)",
            params![now, m.variant_id, m.batch_id, m.location_id, diff, user_id],
        )?;
        conn.execute(
            "UPDATE stock SET quantity = ?1, updated_at = ?2
             WHERE variant_id = ?3 AND batch_id = ?4 AND location_id = ?5",
            params![m.movements_sum, now, m.variant_id, m.batch_id, m.location_id],
        )?;
        fixed += 1;
    }
    if fixed > 0 {
        tracing::warn!(count = fixed, "auto-corrected stock drift");
    }
    Ok(fixed)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMismatch {
    pub variant_id: i64,
    pub batch_id: i64,
    pub location_id: i64,
    pub balance_qty: i64,
    pub movements_sum: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn fefo_prefers_earliest_expiry() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("t.db");
        db::initialize_at(&file).unwrap();
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let now = crate::util::now_local();
        conn.execute(
            "INSERT INTO locations(id,name,type,is_system,is_active,created_at,updated_at)
             VALUES(101,'Store','store',1,1,?1,?1),(102,'WH','warehouse',0,1,?1,?1),(103,'T','transit',1,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO products(id,name_ar,retail_price,purchase_cost,is_active,created_at,updated_at)
             VALUES(1,'P',100,50,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO product_variants(id,product_id,name,is_default,is_active,created_at,updated_at)
             VALUES(1,1,'',1,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO batches(id,variant_id,batch_number,expiration_date,unit_cost,qty_received,created_at,updated_at)
             VALUES(1,1,'A','2027-10-01',50,30,?1,?1),(2,1,'B','2027-03-01',50,20,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO stock(variant_id,batch_id,location_id,quantity,updated_at) VALUES(1,1,101,30,?1),(1,2,101,20,?1)",
            [&now],
        )
        .unwrap();
        let alloc = allocate_fefo(&conn, 1, 101, 5, None).unwrap();
        assert_eq!(alloc.len(), 1);
        assert_eq!(alloc[0].batch_id, 2);
        assert_eq!(alloc[0].quantity, 5);
    }

    #[test]
    fn expired_batch_not_sold() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("t.db");
        db::initialize_at(&file).unwrap();
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let now = crate::util::now_local();
        conn.execute(
            "INSERT INTO locations(id,name,type,is_system,is_active,created_at,updated_at)
             VALUES(101,'Store','store',1,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO products(id,name_ar,retail_price,purchase_cost,is_active,created_at,updated_at)
             VALUES(1,'P',100,50,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO product_variants(id,product_id,name,is_default,is_active,created_at,updated_at)
             VALUES(1,1,'',1,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO batches(id,variant_id,batch_number,expiration_date,unit_cost,qty_received,created_at,updated_at)
             VALUES(1,1,'E','2000-01-01',50,10,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO stock(variant_id,batch_id,location_id,quantity,updated_at) VALUES(1,1,101,10,?1)",
            [&now],
        )
        .unwrap();
        let err = allocate_fefo(&conn, 1, 101, 1, None).unwrap_err();
        assert!(err.user_message.contains("غير كافية") || err.user_message.contains("لا يوجد"));
    }
}
