use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::util::{next_document_number, now_local};
use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferItemInput {
    pub variant_id: i64,
    pub quantity: i64,
    pub batch_id: Option<i64>,
}

pub fn create_request(
    conn: &Connection,
    user_id: i64,
    from_location_id: i64,
    to_location_id: i64,
    items: Vec<TransferItemInput>,
    notes: Option<String>,
) -> AppResult<i64> {
    if from_location_id == to_location_id {
        return Err(AppError::user("موقع المصدر والوجهة يجب أن يختلفا."));
    }
    if items.is_empty() {
        return Err(AppError::user("أضف أصنافاً للتحويل."));
    }
    let number = next_document_number(conn, "transfer")?;
    let now = now_local();
    conn.execute(
        "INSERT INTO transfers(transfer_number,from_location_id,to_location_id,status,requested_by,notes,requested_at,created_at,updated_at)
         VALUES(?1,?2,?3,'requested',?4,?5,?6,?6,?6)",
        params![number, from_location_id, to_location_id, user_id, notes, now],
    )?;
    let id = conn.last_insert_rowid();
    for it in items {
        if it.quantity <= 0 {
            return Err(AppError::user("كمية التحويل غير صالحة."));
        }
        conn.execute(
            "INSERT INTO transfer_items(transfer_id,variant_id,batch_id,quantity) VALUES(?1,?2,?3,?4)",
            params![id, it.variant_id, it.batch_id, it.quantity],
        )?;
    }
    Ok(id)
}

pub fn quick_to_store(
    conn: &Connection,
    user_id: i64,
    variant_id: i64,
    quantity: i64,
    from_location_id: Option<i64>,
    batch_id: Option<i64>,
) -> AppResult<(i64, i64)> {
    if quantity <= 0 {
        return Err(AppError::user("كمية التحويل غير صالحة."));
    }
    let to_id = inventory::store_location_id(conn)?;
    let from_id = match from_location_id {
        Some(id) => id,
        None => conn
            .query_row(
                "SELECT s.location_id
                 FROM stock s
                 JOIN locations l ON l.id = s.location_id
                 WHERE s.variant_id = ?1 AND l.type = 'warehouse' AND s.quantity > 0
                 ORDER BY s.quantity DESC
                 LIMIT 1",
                [variant_id],
                |r| r.get(0),
            )
            .map_err(|_| AppError::user("لا توجد كمية في المخزن لهذا الصنف."))?,
    };
    if from_id == to_id {
        return Err(AppError::user("الصنف موجود بالفعل في المتجر."));
    }
    let loc_type: String = conn
        .query_row(
            "SELECT type FROM locations WHERE id = ?1",
            [from_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::user("موقع المصدر غير موجود."))?;
    if loc_type != "warehouse" {
        return Err(AppError::user("التحويل السريع يتم من المخزن إلى المتجر فقط."));
    }
    let avail = inventory::available_qty(conn, variant_id, from_id)?;
    if avail <= 0 {
        return Err(AppError::user("لا توجد كمية في المخزن لهذا الصنف."));
    }
    let qty = quantity.min(avail);
    let id = create_request(
        conn,
        user_id,
        from_id,
        to_id,
        vec![TransferItemInput {
            variant_id,
            quantity: qty,
            batch_id,
        }],
        Some("تحويل سريع إلى المتجر".into()),
    )?;
    finish_transfer(conn, user_id, id)?;
    inventory::variant_qtys(conn, variant_id)
}

pub fn execute_transfer(
    conn: &Connection,
    user_id: i64,
    from_location_id: i64,
    to_location_id: i64,
    items: Vec<TransferItemInput>,
    notes: Option<String>,
) -> AppResult<i64> {
    let id = create_request(conn, user_id, from_location_id, to_location_id, items, notes)?;
    finish_transfer(conn, user_id, id)?;
    Ok(id)
}

pub fn finish_transfer(conn: &Connection, user_id: i64, transfer_id: i64) -> AppResult<()> {
    let status: String = conn
        .query_row(
            "SELECT status FROM transfers WHERE id = ?1",
            [transfer_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::user("أمر التحويل غير موجود."))?;
    match status.as_str() {
        "requested" => {
            set_status(conn, user_id, transfer_id, "approved", None)?;
            set_status(conn, user_id, transfer_id, "preparing", None)?;
            set_status(conn, user_id, transfer_id, "dispatched", None)?;
            set_status(conn, user_id, transfer_id, "received", None)?;
        }
        "approved" => {
            set_status(conn, user_id, transfer_id, "preparing", None)?;
            set_status(conn, user_id, transfer_id, "dispatched", None)?;
            set_status(conn, user_id, transfer_id, "received", None)?;
        }
        "preparing" => {
            set_status(conn, user_id, transfer_id, "dispatched", None)?;
            set_status(conn, user_id, transfer_id, "received", None)?;
        }
        "dispatched" => {
            set_status(conn, user_id, transfer_id, "received", None)?;
        }
        "received" => {}
        _ => return Err(AppError::user("لا يمكن تنفيذ هذا التحويل.")),
    }
    Ok(())
}

pub fn set_status(
    conn: &Connection,
    user_id: i64,
    transfer_id: i64,
    next: &str,
    reason: Option<&str>,
) -> AppResult<()> {
    let (status, from_id, to_id): (String, i64, i64) = conn.query_row(
        "SELECT status, from_location_id, to_location_id FROM transfers WHERE id = ?1",
        [transfer_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .map_err(|_| AppError::user("أمر التحويل غير موجود."))?;

    let allowed = matches!(
        (status.as_str(), next),
        ("requested", "approved")
            | ("requested", "rejected")
            | ("approved", "preparing")
            | ("approved", "cancelled")
            | ("preparing", "dispatched")
            | ("preparing", "cancelled")
            | ("dispatched", "received")
            | ("requested", "cancelled")
            | ("draft", "cancelled")
            | ("draft", "requested")
    );
    if !allowed {
        return Err(AppError::user("لا يمكن تغيير حالة التحويل بهذا الشكل."));
    }
    let now = now_local();
    match next {
        "approved" => {
            conn.execute(
                "UPDATE transfers SET status='approved', approved_by=?1, approved_at=?2, updated_at=?2 WHERE id=?3",
                params![user_id, now, transfer_id],
            )?;
        }
        "rejected" => {
            conn.execute(
                "UPDATE transfers SET status='rejected', reject_reason=?1, updated_at=?2 WHERE id=?3",
                params![reason.unwrap_or("مرفوض"), now, transfer_id],
            )?;
        }
        "preparing" => {
            conn.execute(
                "UPDATE transfers SET status='preparing', updated_at=?1 WHERE id=?2",
                params![now, transfer_id],
            )?;
        }
        "cancelled" => {
            conn.execute(
                "UPDATE transfers SET status='cancelled', updated_at=?1 WHERE id=?2",
                params![now, transfer_id],
            )?;
        }
        "dispatched" => {
            dispatch(conn, user_id, transfer_id, from_id)?;
        }
        "received" => {
            receive(conn, user_id, transfer_id, to_id)?;
        }
        "requested" => {
            conn.execute(
                "UPDATE transfers SET status='requested', requested_at=?1, updated_at=?1 WHERE id=?2",
                params![now, transfer_id],
            )?;
        }
        _ => return Err(AppError::user("حالة غير معروفة.")),
    }
    Ok(())
}

fn load_items(conn: &Connection, transfer_id: i64) -> AppResult<Vec<(i64, i64, Option<i64>, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT id, variant_id, batch_id, quantity FROM transfer_items WHERE transfer_id = ?1",
    )?;
    let rows = stmt
        .query_map([transfer_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn dispatch(conn: &Connection, user_id: i64, transfer_id: i64, from_id: i64) -> AppResult<()> {
    let transit = inventory::transit_location_id(conn)?;
    let allow_neg = inventory::negative_allowed(conn);
    let items = load_items(conn, transfer_id)?;
    for (_id, variant_id, batch_id, qty) in items {
        let alloc = inventory::allocate_fefo(conn, variant_id, from_id, qty, batch_id)?;
        for a in alloc {
            inventory::apply_delta(
                conn,
                variant_id,
                a.batch_id,
                from_id,
                -a.quantity,
                "transfer_out",
                Some("transfer"),
                Some(transfer_id),
                Some(user_id),
                None,
                Some(a.unit_cost),
                allow_neg,
            )?;
            inventory::apply_delta(
                conn,
                variant_id,
                a.batch_id,
                transit,
                a.quantity,
                "transfer_transit_in",
                Some("transfer"),
                Some(transfer_id),
                Some(user_id),
                None,
                Some(a.unit_cost),
                true,
            )?;
        }
    }
    let now = now_local();
    conn.execute(
        "UPDATE transfers SET status='dispatched', dispatched_by=?1, dispatched_at=?2, updated_at=?2 WHERE id=?3",
        params![user_id, now, transfer_id],
    )?;
    Ok(())
}

fn receive(conn: &Connection, user_id: i64, transfer_id: i64, to_id: i64) -> AppResult<()> {
    let transit = inventory::transit_location_id(conn)?;
    let mut stmt = conn.prepare(
        "SELECT variant_id, batch_id, quantity_delta FROM stock_movements
         WHERE reference_type='transfer' AND reference_id=?1 AND movement_type='transfer_transit_in'",
    )?;
    let rows: Vec<(i64, Option<i64>, i64)> = stmt
        .query_map([transfer_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    drop(stmt);
    if rows.is_empty() {
        return Err(AppError::user("لا توجد كميات مرحلة لهذا التحويل."));
    }
    for (variant_id, batch_id, qty) in rows {
        let batch_id = batch_id.ok_or_else(|| AppError::user("دفعة التحويل مفقودة."))?;
        inventory::apply_delta(
            conn,
            variant_id,
            batch_id,
            transit,
            -qty,
            "transfer_transit_out",
            Some("transfer"),
            Some(transfer_id),
            Some(user_id),
            None,
            None,
            false,
        )?;
        inventory::apply_delta(
            conn,
            variant_id,
            batch_id,
            to_id,
            qty,
            "transfer_in",
            Some("transfer"),
            Some(transfer_id),
            Some(user_id),
            None,
            None,
            true,
        )?;
    }
    let now = now_local();
    conn.execute(
        "UPDATE transfers SET status='received', received_by=?1, received_at=?2, updated_at=?2 WHERE id=?3",
        params![user_id, now, transfer_id],
    )?;
    conn.execute(
        "UPDATE transfer_items SET received_quantity = quantity WHERE transfer_id = ?1",
        [transfer_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::inventory;

    fn setup() -> (tempfile::TempDir, rusqlite::Connection) {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("t.db");
        db::initialize_at(&file).unwrap();
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let now = crate::util::now_local();
        conn.execute(
            "INSERT INTO locations(id,name,type,is_system,is_active,created_at,updated_at)
             VALUES(1,'المتجر','store',1,1,?1,?1),(2,'المخزن','warehouse',0,1,?1,?1),(3,'تحويل','transit',1,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users(id,name,pin_hash,role_id,is_active,created_at,updated_at)
             VALUES(1,'مدير','x',1,1,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO products(id,name_ar,retail_price,purchase_cost,is_active,created_at,updated_at)
             VALUES(1,'صبغة',100,50,1,?1,?1)",
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
             VALUES(1,1,'B1','2027-12-01',50,10,?1,?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO stock(variant_id,batch_id,location_id,quantity,updated_at) VALUES(1,1,2,10,?1)",
            [&now],
        )
        .unwrap();
        (dir, conn)
    }

    #[test]
    fn quick_to_store_moves_one_unit() {
        let (_dir, conn) = setup();
        let (store, warehouse) = quick_to_store(&conn, 1, 1, 1, Some(2), Some(1)).unwrap();
        assert_eq!(store, 1);
        assert_eq!(warehouse, 9);
        let status: String = conn
            .query_row("SELECT status FROM transfers ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(status, "received");
        assert_eq!(inventory::available_qty(&conn, 1, 1).unwrap(), 1);
        assert_eq!(inventory::available_qty(&conn, 1, 2).unwrap(), 9);
    }
}
