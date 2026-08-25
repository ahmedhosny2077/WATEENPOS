use super::{take_conn, with_tx, AppState};
use crate::audit;
use crate::auth;
use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::purchases;
use crate::util::now_local;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedId {
    pub id: i64,
    pub name: String,
}

#[tauri::command]
pub fn list_categories(state: State<AppState>) -> AppResult<Vec<NamedId>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare(
        "SELECT id, name_ar FROM categories WHERE is_active=1 ORDER BY sort_order, id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(NamedId {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn list_brands(state: State<AppState>) -> AppResult<Vec<NamedId>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare("SELECT id, name FROM brands WHERE is_active=1 ORDER BY name")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(NamedId {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn save_brand(state: State<AppState>, name: String) -> AppResult<i64> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::user("اسم الماركة مطلوب."));
    }
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "products.edit", None)?;
        let now = now_local();
        tx.execute(
            "INSERT INTO brands(name,is_active,created_at,updated_at) VALUES(?1,1,?2,?2)",
            params![name, now],
        )?;
        let id = tx.last_insert_rowid();
        audit::log(tx, Some(uid), "brand_create", Some("brand"), Some(id), &name, None, None);
        Ok(id)
    })
}

#[tauri::command]
pub fn save_category(state: State<AppState>, name: String) -> AppResult<i64> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::user("اسم التصنيف مطلوب."));
    }
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "products.edit", None)?;
        let now = now_local();
        tx.execute(
            "INSERT INTO categories(name_ar,name_en,sort_order,is_active,created_at,updated_at)
             VALUES(?1,?2,0,1,?3,?3)",
            params![name, name, now],
        )?;
        let id = tx.last_insert_rowid();
        audit::log(
            tx,
            Some(uid),
            "category_create",
            Some("category"),
            Some(id),
            &name,
            None,
            None,
        );
        Ok(id)
    })
}

#[tauri::command]
pub fn deactivate_catalog_item(state: State<AppState>, kind: String, id: i64) -> AppResult<()> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "products.edit", None)?;
        let (table, label) = match kind.as_str() {
            "brand" => ("brands", "ماركة"),
            "category" => ("categories", "تصنيف"),
            _ => return Err(AppError::user("نوع غير معروف.")),
        };
        let n = tx.execute(
            &format!("UPDATE {table} SET is_active=0, updated_at=?1 WHERE id=?2"),
            params![now_local(), id],
        )?;
        if n == 0 {
            return Err(AppError::user(format!("تعذر إخفاء ال{label}.")));
        }
        audit::log(
            tx,
            Some(uid),
            "catalog_deactivate",
            Some(&kind),
            Some(id),
            &format!("إخفاء {label}"),
            None,
            None,
        );
        Ok(())
    })
}

#[tauri::command]
pub fn list_units(state: State<AppState>) -> AppResult<Vec<NamedId>> {
    let conn = take_conn(&state)?;
    let mut stmt = conn.prepare("SELECT id, name_ar FROM units WHERE is_active=1")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(NamedId {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductListRow {
    pub id: i64,
    pub variant_id: i64,
    pub name: String,
    pub variant_name: String,
    pub brand: Option<String>,
    pub category: Option<String>,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub price: i64,
    pub store_qty: i64,
    pub warehouse_qty: i64,
    pub image_path: Option<String>,
    pub is_active: i64,
}

fn require_products_view(conn: &Connection) -> AppResult<()> {
    if let Ok(uid) = auth::current_shift_user(conn) {
        auth::require_permission(conn, uid, "products.view")?;
    }
    Ok(())
}

fn map_product_row(r: &Row<'_>) -> rusqlite::Result<ProductListRow> {
    Ok(ProductListRow {
        id: r.get(0)?,
        variant_id: r.get(1)?,
        name: r.get(2)?,
        variant_name: r.get(3)?,
        brand: r.get(4)?,
        category: r.get(5)?,
        sku: r.get(6)?,
        barcode: r.get(7)?,
        price: r.get(8)?,
        store_qty: r.get(9)?,
        warehouse_qty: r.get(10)?,
        image_path: r.get(11)?,
        is_active: r.get(12)?,
    })
}

fn product_select_sql(today_ph: &str) -> String {
    let store_sql = inventory::sql_sellable_store_qty("v.id", today_ph);
    format!(
        "SELECT p.id, v.id, p.name_ar, v.name, b.name, c.name_ar,
                COALESCE(v.sku, p.sku),
                (SELECT code FROM barcodes WHERE variant_id=v.id AND is_primary=1 LIMIT 1),
                COALESCE(v.retail_price, p.retail_price),
                {store_sql},
                COALESCE((SELECT SUM(s.quantity) FROM stock s JOIN locations l ON l.id=s.location_id WHERE s.variant_id=v.id AND l.type='warehouse'),0),
                COALESCE(v.image_path, p.image_path),
                CASE WHEN p.is_active=1 AND v.is_active=1 THEN 1 ELSE 0 END
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN categories c ON c.id = p.category_id"
    )
}

fn query_product_rows(
    conn: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> AppResult<Vec<ProductListRow>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(params, map_product_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn find_variant_id(conn: &Connection, code: &str) -> AppResult<Option<i64>> {
    if let Some(id) = conn
        .query_row(
            "SELECT variant_id FROM barcodes WHERE code = ?1 LIMIT 1",
            [code],
            |r| r.get(0),
        )
        .optional()?
    {
        return Ok(Some(id));
    }
    let id = conn
        .query_row(
            "SELECT v.id FROM product_variants v
             JOIN products p ON p.id = v.product_id
             WHERE v.is_active=1 AND p.is_active=1
               AND (v.sku = ?1 COLLATE NOCASE OR p.sku = ?1 COLLATE NOCASE)
             ORDER BY v.is_default DESC, v.id
             LIMIT 1",
            [code],
            |r| r.get(0),
        )
        .optional()?;
    Ok(id)
}

fn fetch_by_variant(
    conn: &Connection,
    variant_id: i64,
    category_id: i64,
) -> AppResult<Option<ProductListRow>> {
    let today = crate::util::today();
    let sql = format!(
        "{} WHERE v.id = ?2 AND (?3 = 0 OR p.category_id = ?3) LIMIT 1",
        product_select_sql("?1")
    );
    Ok(query_product_rows(conn, &sql, params![today, variant_id, category_id])?.pop())
}

enum NameMatch {
    Prefix,
    Contains,
}

fn search_catalog(
    conn: &Connection,
    query: &str,
    category_id: i64,
    active_only: bool,
    mode: NameMatch,
    limit: i64,
    offset: i64,
) -> AppResult<Vec<ProductListRow>> {
    let today = crate::util::today();
    let like = match mode {
        NameMatch::Prefix => format!("{query}%"),
        NameMatch::Contains => format!("%{query}%"),
    };
    let active = if active_only { 1 } else { 0 };
    let barcode_clause = match mode {
        NameMatch::Contains if !query.is_empty() => {
            " OR v.id IN (SELECT variant_id FROM barcodes WHERE code LIKE ?4)"
        }
        _ => "",
    };
    let brand_clause = match mode {
        NameMatch::Contains => " OR IFNULL(b.name,'') LIKE ?4",
        NameMatch::Prefix => "",
    };
    let sql = format!(
        "{} WHERE (?2 = 0 OR p.category_id = ?2)
            AND (?5 = 0 OR (p.is_active=1 AND v.is_active=1))
            AND (?3 = '' OR p.name_ar LIKE ?4 OR IFNULL(p.name_en,'') LIKE ?4 OR IFNULL(v.name,'') LIKE ?4
                 OR IFNULL(v.sku,'') LIKE ?4 OR IFNULL(p.sku,'') LIKE ?4{brand_clause}{barcode_clause})
         ORDER BY p.name_ar, v.id
         LIMIT ?6 OFFSET ?7",
        product_select_sql("?1"),
    );
    query_product_rows(
        conn,
        &sql,
        params![today, category_id, query, like, active, limit, offset],
    )
}

#[tauri::command]
pub fn list_products(
    state: State<AppState>,
    query: Option<String>,
    category_id: Option<i64>,
    page: Option<i64>,
) -> AppResult<Vec<ProductListRow>> {
    let conn = take_conn(&state)?;
    require_products_view(&conn)?;
    let page = page.unwrap_or(0).max(0);
    let q = query.unwrap_or_default();
    search_catalog(
        &conn,
        q.trim(),
        category_id.unwrap_or(0),
        false,
        NameMatch::Contains,
        80,
        page * 80,
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogStats {
    pub products: i64,
    pub variants: i64,
    pub categories: i64,
    pub brands: i64,
    pub out_of_store: i64,
    pub warehouse_only: i64,
    pub low_stock: i64,
}

#[tauri::command]
pub fn catalog_stats(state: State<AppState>) -> AppResult<CatalogStats> {
    let conn = take_conn(&state)?;
    let today = crate::util::today();
    let products: i64 = conn.query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))?;
    let variants: i64 =
        conn.query_row("SELECT COUNT(*) FROM product_variants", [], |r| r.get(0))?;
    let categories: i64 = conn.query_row(
        "SELECT COUNT(*) FROM categories WHERE is_active=1",
        [],
        |r| r.get(0),
    )?;
    let brands: i64 = conn.query_row("SELECT COUNT(*) FROM brands WHERE is_active=1", [], |r| {
        r.get(0)
    })?;
    let out_of_store: i64 = conn.query_row(
        "SELECT COUNT(*) FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE p.is_active=1 AND v.is_active=1
           AND COALESCE((
             SELECT SUM(s.quantity) FROM stock s
             JOIN locations l ON l.id = s.location_id
             JOIN batches b ON b.id = s.batch_id
             WHERE s.variant_id = v.id AND l.type = 'store' AND s.quantity > 0
               AND (b.expiration_date IS NULL OR b.expiration_date >= ?1)
           ), 0) = 0",
        [&today],
        |r| r.get(0),
    )?;
    let warehouse_only: i64 = conn.query_row(
        "SELECT COUNT(*) FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE p.is_active=1 AND v.is_active=1
           AND COALESCE((
             SELECT SUM(s.quantity) FROM stock s
             JOIN locations l ON l.id = s.location_id
             JOIN batches b ON b.id = s.batch_id
             WHERE s.variant_id = v.id AND l.type = 'store' AND s.quantity > 0
               AND (b.expiration_date IS NULL OR b.expiration_date >= ?1)
           ), 0) = 0
           AND COALESCE((
             SELECT SUM(s.quantity) FROM stock s
             JOIN locations l ON l.id = s.location_id
             WHERE s.variant_id = v.id AND l.type = 'warehouse' AND s.quantity > 0
           ), 0) > 0",
        [&today],
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
    Ok(CatalogStats {
        products,
        variants,
        categories,
        brands,
        out_of_store,
        warehouse_only,
        low_stock,
    })
}

#[tauri::command]
pub fn search_products(
    state: State<AppState>,
    query: String,
    category_id: Option<i64>,
    active_only: Option<bool>,
) -> AppResult<Vec<ProductListRow>> {
    let conn = take_conn(&state)?;
    require_products_view(&conn)?;
    let q = query.trim();
    let cat = category_id.unwrap_or(0);
    let active = active_only.unwrap_or(false);
    if !q.is_empty() {
        if let Some(id) = find_variant_id(&conn, q)? {
            if let Some(row) = fetch_by_variant(&conn, id, cat)? {
                if !active || row.is_active == 1 {
                    return Ok(vec![row]);
                }
            }
        }
    }
    let mut rows = search_catalog(&conn, q, cat, active, NameMatch::Prefix, 80, 0)?;
    if q.is_empty() || rows.len() >= 80 || q.chars().count() < 2 {
        return Ok(rows);
    }
    let mut seen: HashSet<i64> = rows.iter().map(|r| r.variant_id).collect();
    let extra = search_catalog(&conn, q, cat, active, NameMatch::Contains, 80, 0)?;
    for row in extra {
        if seen.insert(row.variant_id) {
            rows.push(row);
            if rows.len() >= 80 {
                break;
            }
        }
    }
    Ok(rows)
}

#[tauri::command]
pub fn lookup_barcode(state: State<AppState>, code: String) -> AppResult<ProductListRow> {
    let conn = take_conn(&state)?;
    let code = code.trim();
    if code.is_empty() {
        return Err(AppError::user("أدخل باركود."));
    }
    let id = find_variant_id(&conn, code)?
        .ok_or_else(|| AppError::user("الصنف غير موجود."))?;
    let row = fetch_by_variant(&conn, id, 0)?.ok_or_else(|| AppError::user("الصنف غير موجود أو غير نشط."))?;
    if row.is_active != 1 {
        return Err(AppError::user("الصنف غير موجود أو غير نشط."));
    }
    Ok(row)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantInput {
    pub id: Option<i64>,
    pub name: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub color_code: Option<String>,
    pub size: Option<String>,
    pub retail_price: Option<i64>,
    pub is_active: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProductInput {
    pub id: Option<i64>,
    pub name_ar: String,
    pub name_en: Option<String>,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub brand_id: Option<i64>,
    pub category_id: Option<i64>,
    pub unit_id: Option<i64>,
    pub purchase_cost: i64,
    pub retail_price: i64,
    pub wholesale_price: i64,
    pub min_stock: i64,
    pub reorder_level: i64,
    pub description: Option<String>,
    pub is_active: bool,
    pub variants: Vec<VariantInput>,
    #[serde(default)]
    pub opening_store_qty: i64,
    #[serde(default)]
    pub opening_warehouse_qty: i64,
}

#[tauri::command]
pub fn save_product(state: State<AppState>, input: SaveProductInput) -> AppResult<i64> {
    if input.name_ar.trim().is_empty() {
        return Err(AppError::user("اسم المنتج مطلوب."));
    }
    if input.retail_price < 0 || input.purchase_cost < 0 {
        return Err(AppError::user("السعر غير صالح."));
    }
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "products.edit", None)?;
        let now = now_local();
        let product_id = if let Some(id) = input.id {
            tx.execute(
                "UPDATE products SET sku=?1,name_ar=?2,name_en=?3,brand_id=?4,category_id=?5,unit_id=?6,
                 purchase_cost=?7,retail_price=?8,wholesale_price=?9,min_stock=?10,reorder_level=?11,
                 description=?12,is_active=?13,updated_at=?14 WHERE id=?15",
                params![
                    input.sku,
                    input.name_ar.trim(),
                    input.name_en,
                    input.brand_id,
                    input.category_id,
                    input.unit_id,
                    input.purchase_cost,
                    input.retail_price,
                    input.wholesale_price,
                    input.min_stock,
                    input.reorder_level,
                    input.description,
                    input.is_active as i64,
                    now,
                    id
                ],
            )?;
            id
        } else {
            tx.execute(
                "INSERT INTO products(sku,name_ar,name_en,brand_id,category_id,unit_id,purchase_cost,retail_price,wholesale_price,min_stock,reorder_level,description,is_active,created_at,updated_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)",
                params![
                    input.sku,
                    input.name_ar.trim(),
                    input.name_en,
                    input.brand_id,
                    input.category_id,
                    input.unit_id,
                    input.purchase_cost,
                    input.retail_price,
                    input.wholesale_price,
                    input.min_stock,
                    input.reorder_level,
                    input.description,
                    input.is_active as i64,
                    now
                ],
            )?;
            tx.last_insert_rowid()
        };

        let mut variant_ids = Vec::new();
        if input.variants.is_empty() {
            variant_ids.push(upsert_variant(
                tx,
                product_id,
                None,
                "",
                input.sku.clone(),
                input.barcode.clone(),
                None,
                None,
                Some(input.retail_price),
                true,
                true,
                &now,
            )?);
        } else {
            for v in &input.variants {
                variant_ids.push(upsert_variant(
                    tx,
                    product_id,
                    v.id,
                    &v.name,
                    v.sku.clone(),
                    v.barcode.clone(),
                    v.color_code.clone(),
                    v.size.clone(),
                    v.retail_price,
                    v.id.is_none() && v.name.is_empty(),
                    v.is_active,
                    &now,
                )?);
            }
        }
        if input.id.is_none() {
            if let Some(&vid) = variant_ids.first() {
                seed_opening(
                    tx,
                    uid,
                    vid,
                    input.opening_store_qty,
                    input.opening_warehouse_qty,
                    input.purchase_cost,
                )?;
            }
        }
        audit::log(
            tx,
            Some(uid),
            "product_save",
            Some("product"),
            Some(product_id),
            input.name_ar.trim(),
            None,
            None,
        );
        Ok(product_id)
    })
}

fn seed_opening(
    tx: &rusqlite::Transaction,
    uid: i64,
    variant_id: i64,
    store_qty: i64,
    warehouse_qty: i64,
    unit_cost: i64,
) -> AppResult<()> {
    if store_qty < 0 || warehouse_qty < 0 {
        return Err(AppError::user("الكمية غير صالحة."));
    }
    if store_qty > 0 {
        let loc = inventory::store_location_id(tx)?;
        purchases::opening_balance(
            tx,
            uid,
            variant_id,
            loc,
            store_qty,
            unit_cost,
            format!("OPEN-S-{variant_id}"),
            None,
            None,
        )?;
    }
    if warehouse_qty > 0 {
        let loc = inventory::warehouse_location_id(tx)?;
        purchases::opening_balance(
            tx,
            uid,
            variant_id,
            loc,
            warehouse_qty,
            unit_cost,
            format!("OPEN-W-{variant_id}"),
            None,
            None,
        )?;
    }
    Ok(())
}

fn upsert_variant(
    tx: &rusqlite::Transaction,
    product_id: i64,
    id: Option<i64>,
    name: &str,
    sku: Option<String>,
    barcode: Option<String>,
    color: Option<String>,
    size: Option<String>,
    price: Option<i64>,
    is_default: bool,
    is_active: bool,
    now: &str,
) -> AppResult<i64> {
    let vid = if let Some(id) = id {
        tx.execute(
            "UPDATE product_variants SET name=?1,sku=?2,color_code=?3,size=?4,retail_price=?5,is_active=?6,updated_at=?7 WHERE id=?8",
            params![name, sku, color, size, price, is_active as i64, now, id],
        )?;
        id
    } else {
        tx.execute(
            "INSERT INTO product_variants(product_id,name,sku,color_code,size,retail_price,is_default,is_active,created_at,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            params![product_id, name, sku, color, size, price, is_default as i64, is_active as i64, now],
        )?;
        tx.last_insert_rowid()
    };
    if let Some(code) = barcode {
        let code = code.trim();
        if !code.is_empty() {
            let conflict: Option<(i64, String)> = tx
                .query_row(
                    "SELECT b.variant_id, p.name_ar
                     FROM barcodes b
                     JOIN product_variants v ON v.id = b.variant_id
                     JOIN products p ON p.id = v.product_id
                     WHERE b.code = ?1 COLLATE NOCASE AND b.variant_id != ?2",
                    params![code, vid],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            if let Some((_other_vid, other_name)) = conflict {
                return Err(AppError::user(format!(
                    "الباركود «{}» مستخدم بالفعل في المنتج «{}». لا يمكن تكرار نفس الباركود.",
                    code, other_name
                )));
            }
            tx.execute("DELETE FROM barcodes WHERE variant_id=?1 AND is_primary=1", [vid])?;
            tx.execute(
                "INSERT INTO barcodes(variant_id,code,is_primary) VALUES(?1,?2,1)",
                params![vid, code],
            )?;
        }
    }
    Ok(vid)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationDto {
    pub id: i64,
    pub name: String,
    pub type_name: String,
    pub is_system: i64,
    pub is_active: i64,
}

#[tauri::command]
pub fn list_locations(state: State<AppState>) -> AppResult<Vec<LocationDto>> {
    let conn = take_conn(&state)?;
    let mut stmt =
        conn.prepare("SELECT id, name, type, is_system, is_active FROM locations ORDER BY type, id")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(LocationDto {
                id: r.get(0)?,
                name: r.get(1)?,
                type_name: r.get(2)?,
                is_system: r.get(3)?,
                is_active: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn save_warehouse(
    state: State<AppState>,
    id: Option<i64>,
    name: String,
    is_active: bool,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::current_shift_user(tx)?;
        let allowed = auth::user_has_permission(tx, uid, "stock.adjust")?
            || auth::user_has_permission(tx, uid, "settings.manage")?;
        if !allowed {
            return Err(AppError::user("ليست لديك صلاحية لإدارة المخازن."));
        }
        let now = now_local();
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::user("اسم المخزن مطلوب."));
        }
        let skip_id = id.unwrap_or(0);
        let dup: i64 = tx.query_row(
            "SELECT COUNT(*) FROM locations
             WHERE type='warehouse' AND name = ?1 COLLATE NOCASE AND id != ?2",
            params![name, skip_id],
            |r| r.get(0),
        )?;
        if dup > 0 {
            return Err(AppError::user("يوجد مخزن بنفس الاسم."));
        }
        if !is_active {
            let other_active: i64 = tx.query_row(
                "SELECT COUNT(*) FROM locations
                 WHERE type='warehouse' AND is_active=1 AND id != ?1",
                [skip_id],
                |r| r.get(0),
            )?;
            if other_active == 0 {
                return Err(AppError::user("لا يمكن إيقاف آخر مخزن نشط."));
            }
        }
        let wid = if let Some(id) = id {
            let t: String = tx.query_row("SELECT type FROM locations WHERE id=?1", [id], |r| r.get(0))?;
            if t != "warehouse" {
                return Err(AppError::user("لا يمكن تعديل موقع المتجر من هنا."));
            }
            tx.execute(
                "UPDATE locations SET name=?1, is_active=?2, updated_at=?3 WHERE id=?4",
                params![name, is_active as i64, now, id],
            )?;
            id
        } else {
            tx.execute(
                "INSERT INTO locations(name,type,is_system,is_active,created_at,updated_at)
                 VALUES(?1,'warehouse',0,?2,?3,?3)",
                params![name, is_active as i64, now],
            )?;
            tx.last_insert_rowid()
        };
        audit::log(tx, Some(uid), "warehouse_save", Some("location"), Some(wid), name, None, None);
        Ok(wid)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockRow {
    pub variant_id: i64,
    pub product_name: String,
    pub variant_name: String,
    pub batch_id: i64,
    pub batch_number: String,
    pub expiration_date: Option<String>,
    pub location_id: i64,
    pub location_name: String,
    pub quantity: i64,
    pub unit_cost: i64,
}

#[tauri::command]
pub fn list_stock(
    state: State<AppState>,
    location_id: Option<i64>,
    query: Option<String>,
) -> AppResult<Vec<StockRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "stock.view")?;
    let like = format!("%{}%", query.unwrap_or_default());
    let loc = location_id.unwrap_or(0);
    let mut stmt = conn.prepare(
        "SELECT v.id, p.name_ar, v.name, b.id, b.batch_number, b.expiration_date, l.id, l.name, s.quantity, b.unit_cost
         FROM stock s
         JOIN product_variants v ON v.id = s.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN batches b ON b.id = s.batch_id
         JOIN locations l ON l.id = s.location_id
         WHERE s.quantity != 0
           AND (?1 = 0 OR s.location_id = ?1)
           AND (?2 = '%%' OR p.name_ar LIKE ?2 OR v.name LIKE ?2 OR v.sku LIKE ?2 OR b.batch_number LIKE ?2
                OR EXISTS (SELECT 1 FROM barcodes bc WHERE bc.variant_id = v.id AND bc.code LIKE ?2))
         ORDER BY p.name_ar, b.expiration_date LIMIT 500",
    )?;
    let rows = stmt
        .query_map(params![loc, like], |r| {
            Ok(StockRow {
                variant_id: r.get(0)?,
                product_name: r.get(1)?,
                variant_name: r.get(2)?,
                batch_id: r.get(3)?,
                batch_number: r.get(4)?,
                expiration_date: r.get(5)?,
                location_id: r.get(6)?,
                location_name: r.get(7)?,
                quantity: r.get(8)?,
                unit_cost: r.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn adjust_stock(
    state: State<AppState>,
    variant_id: i64,
    batch_id: i64,
    location_id: i64,
    quantity_delta: i64,
    reason: String,
    override_pin: Option<String>,
) -> AppResult<()> {
    if reason.trim().is_empty() {
        return Err(AppError::user("سبب التسوية مطلوب."));
    }
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "stock.adjust", override_pin.as_deref())?;
        let mt = if quantity_delta > 0 {
            "adjustment_increase"
        } else {
            "adjustment_decrease"
        };
        inventory::apply_delta(
            tx,
            variant_id,
            batch_id,
            location_id,
            quantity_delta,
            mt,
            Some("adjustment"),
            None,
            Some(uid),
            Some(reason.trim()),
            None,
            inventory::negative_allowed(tx),
        )?;
        audit::log(
            tx,
            Some(uid),
            "stock_adjust",
            Some("stock"),
            Some(variant_id),
            reason.trim(),
            None,
            None,
        );
        Ok(())
    })
}

#[tauri::command]
pub fn opening_balance(
    state: State<AppState>,
    variant_id: i64,
    location_id: i64,
    quantity: i64,
    unit_cost: i64,
    batch_number: String,
    expiration_date: Option<String>,
) -> AppResult<i64> {
    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "stock.adjust", None)?;
        crate::purchases::opening_balance(
            tx,
            uid,
            variant_id,
            location_id,
            quantity,
            unit_cost,
            batch_number,
            expiration_date,
            None,
        )
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementRow {
    pub id: i64,
    pub occurred_at: String,
    pub product_name: String,
    pub batch_number: Option<String>,
    pub location_name: String,
    pub quantity_delta: i64,
    pub movement_type: String,
    pub reason: Option<String>,
    pub user_name: Option<String>,
}

#[tauri::command]
pub fn list_movements(state: State<AppState>, variant_id: Option<i64>) -> AppResult<Vec<MovementRow>> {
    let conn = take_conn(&state)?;
    auth::require_permission(&conn, auth::current_shift_user(&conn)?, "stock.view")?;
    let vid = variant_id.unwrap_or(0);
    let mut stmt = conn.prepare(
        "SELECT m.id, m.occurred_at, p.name_ar, b.batch_number, l.name, m.quantity_delta, m.movement_type, m.reason, u.name
         FROM stock_movements m
         JOIN product_variants v ON v.id = m.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN locations l ON l.id = m.location_id
         LEFT JOIN batches b ON b.id = m.batch_id
         LEFT JOIN users u ON u.id = m.user_id
         WHERE (?1 = 0 OR m.variant_id = ?1)
         ORDER BY m.id DESC LIMIT 300",
    )?;
    let rows = stmt
        .query_map([vid], |r| {
            Ok(MovementRow {
                id: r.get(0)?,
                occurred_at: r.get(1)?,
                product_name: r.get(2)?,
                batch_number: r.get(3)?,
                location_name: r.get(4)?,
                quantity_delta: r.get(5)?,
                movement_type: r.get(6)?,
                reason: r.get(7)?,
                user_name: r.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
