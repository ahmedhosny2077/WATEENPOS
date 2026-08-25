use super::{take_conn, AppState};
use crate::auth;
use crate::error::{AppError, AppResult};
use crate::util::{self, setting, setting_i64, store_address_line, store_phone_line, store_tax_line};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

const ROW_LIMIT: i64 = 500;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportKpi {
    pub label: String,
    pub value: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportView {
    pub kind: String,
    pub title: String,
    pub subtitle: String,
    pub store_name: String,
    pub period_label: String,
    pub generated_at: String,
    pub uses_period: bool,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub summary: Vec<ReportKpi>,
    pub footnote: String,
}

#[tauri::command]
pub fn run_report(
    state: State<AppState>,
    kind: String,
    from: String,
    to: String,
) -> AppResult<ReportView> {
    let conn = take_conn(&state)?;
    build_report(&conn, &kind, &from, &to)
}

#[tauri::command]
pub fn pick_report_pdf_path(app: tauri::AppHandle, file_name: String) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name(&file_name)
        .blocking_save_file()
        .and_then(|p| p.as_path().map(|x| x.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn export_report_pdf(
    state: State<AppState>,
    kind: String,
    from: String,
    to: String,
    dest: String,
) -> AppResult<String> {
    let conn = take_conn(&state)?;
    let report = build_report(&conn, &kind, &from, &to)?;
    let dest = PathBuf::from(dest);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let extras = pdf_extras(&conn);
    let html = report_html_full(&report, &extras);
    let tmp = std::env::temp_dir().join(format!("wateen-pos-report-{}.html", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, html)?;
    let result = html_file_to_pdf(&tmp, &dest);
    let _ = std::fs::remove_file(&tmp);
    result?;
    if !dest.exists() || crate::paths::file_size(&dest) < 100 {
        return Err(AppError::user("تعذر إنشاء ملف PDF. تأكد أن Microsoft Edge مثبّت."));
    }
    Ok(dest.to_string_lossy().to_string())
}

fn build_report(conn: &Connection, kind: &str, from: &str, to: &str) -> AppResult<ReportView> {
    auth::require_permission(conn, auth::current_shift_user(conn)?, "reports.view")?;
    if kind == "profit" {
        auth::require_permission(conn, auth::current_shift_user(conn)?, "profit.view")?;
    }
    let from = from.trim();
    let to = to.trim();
    if from.is_empty() || to.is_empty() {
        return Err(AppError::user("حدد فترة التقرير."));
    }
    let end = date_end(to);
    let store = setting(conn, "store.name", "WATEEN POS");
    let generated = util::now_local().replace('T', " ");
    let mut report = match kind {
        "sales" => sales_invoices(conn, from, &end)?,
        "sales_product" => sales_by_product(conn, from, &end)?,
        "top_sellers" => top_sellers_report(conn, from, &end)?,
        "least_sellers" => least_sellers_report(conn, from, &end)?,
        "sales_category" => sales_by_category(conn, from, &end)?,
        "sales_employee" => sales_by_employee(conn, from, &end)?,
        "sales_payment" => sales_by_payment(conn, from, &end)?,
        "profit" => profit_report(conn, from, &end)?,
        "inventory" => inventory_report(conn)?,
        "low_stock" => low_stock_report(conn)?,
        "expiry" => expiry_report(conn)?,
        "slow" => slow_moving_report(conn, to)?,
        "valuation" => valuation_report(conn)?,
        "purchases" => purchases_report(conn, from, to)?,
        "expenses" => expenses_report(conn, from, to)?,
        "suppliers" => suppliers_report(conn)?,
        "customers" => customers_report(conn, from, &end)?,
        "cash" => cash_report(conn, from, &end)?,
        _ => return Err(AppError::user("نوع التقرير غير معروف.")),
    };
    report.kind = kind.to_string();
    report.store_name = store;
    report.generated_at = generated;
    report.period_label = if report.uses_period {
        format!("{from} → {to}")
    } else {
        "لقطة حالية".into()
    };
    if report.rows.len() as i64 >= ROW_LIMIT {
        report.footnote = format!("يُعرض أول {ROW_LIMIT} صف. ضيّق الفترة إذا لزم.");
    }
    Ok(report)
}

fn date_end(to: &str) -> String {
    if to.contains('T') {
        to.to_string()
    } else {
        format!("{to}T23:59:59")
    }
}

fn money(v: i64) -> String {
    let sign = if v < 0 { "-" } else { "" };
    let v = v.abs();
    format!("{sign}{}.{:02} ج.م", v / 100, v % 100)
}

fn qty(v: i64) -> String {
    v.to_string()
}

fn dt(raw: &str) -> String {
    let (d, t) = raw.split_once('T').unwrap_or((raw, ""));
    let parts: Vec<_> = d.split('-').collect();
    if parts.len() != 3 {
        return raw.replace('T', " ");
    }
    let time = t.get(..5).unwrap_or("");
    if time.is_empty() {
        format!("{}/{}/{}", parts[2], parts[1], parts[0])
    } else {
        format!("{}/{}/{} {}", parts[2], parts[1], parts[0], time)
    }
}

fn status_ar(s: &str) -> String {
    match s {
        "completed" | "received" | "closed" => s.replace("completed", "مكتملة")
            .replace("received", "مستلمة")
            .replace("closed", "مغلقة"),
        "voided" => "ملغاة".into(),
        "open" => "مفتوحة".into(),
        "draft" => "مسودة".into(),
        "cancelled" => "ملغاة".into(),
        other => other.to_string(),
    }
}

fn base(title: &str, subtitle: &str, uses_period: bool) -> ReportView {
    ReportView {
        kind: String::new(),
        title: title.into(),
        subtitle: subtitle.into(),
        store_name: String::new(),
        period_label: String::new(),
        generated_at: String::new(),
        uses_period,
        columns: Vec::new(),
        rows: Vec::new(),
        summary: Vec::new(),
        footnote: String::new(),
    }
}

fn sales_invoices(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base(
        "تقرير المبيعات",
        "فواتير البيع المكتملة خلال الفترة.",
        true,
    );
    r.columns = vec![
        "الفاتورة".into(),
        "التاريخ".into(),
        "الكاشير".into(),
        "العميل".into(),
        "الإجمالي".into(),
        "الحالة".into(),
    ];
    let mut stmt = conn.prepare(
        "SELECT s.invoice_number, s.created_at, u.name, IFNULL(c.name,''), s.grand_total, s.status
         FROM sales s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.created_at >= ?1 AND s.created_at <= ?2
         ORDER BY s.id DESC LIMIT ?3",
    )?;
    let mut total = 0i64;
    let mut count = 0i64;
    r.rows = stmt
        .query_map(params![from, end, ROW_LIMIT], |row| {
            let amount: i64 = row.get(4)?;
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    dt(&row.get::<_, String>(1)?),
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    money(amount),
                    status_ar(&row.get::<_, String>(5)?),
                ],
                amount,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, amount)| {
            total += amount;
            count += 1;
            row
        })
        .collect();
    r.summary = vec![
        ReportKpi { label: "عدد الفواتير".into(), value: qty(count) },
        ReportKpi { label: "إجمالي المبيعات".into(), value: money(total) },
    ];
    Ok(r)
}

fn sales_by_product(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base(
        "المبيعات حسب المنتج",
        "الكميات والإيراد والتكلفة الفعلية للدفعة.",
        true,
    );
    r.columns = vec![
        "المنتج".into(),
        "الدرجة".into(),
        "الكمية".into(),
        "الإيراد".into(),
        "الخصم".into(),
        "التكلفة".into(),
        "مجمل الربح".into(),
    ];
    let mut stmt = conn.prepare(
        "SELECT si.product_name, IFNULL(si.variant_name,''), SUM(si.quantity), SUM(si.line_total),
                SUM(si.discount), SUM(si.line_cost), SUM(si.line_total - si.line_cost)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status='completed' AND s.created_at >= ?1 AND s.created_at <= ?2
         GROUP BY si.product_name, si.variant_name
         ORDER BY SUM(si.line_total) DESC LIMIT ?3",
    )?;
    let mut qty_t = 0i64;
    let mut rev = 0i64;
    let mut profit = 0i64;
    r.rows = stmt
        .query_map(params![from, end, ROW_LIMIT], |row| {
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    qty(row.get(2)?),
                    money(row.get(3)?),
                    money(row.get(4)?),
                    money(row.get(5)?),
                    money(row.get(6)?),
                ],
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(6)?,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, q, revenue, gp)| {
            qty_t += q;
            rev += revenue;
            profit += gp;
            row
        })
        .collect();
    r.summary = vec![
        ReportKpi { label: "الكمية".into(), value: qty(qty_t) },
        ReportKpi { label: "الإيراد".into(), value: money(rev) },
        ReportKpi { label: "مجمل الربح".into(), value: money(profit) },
    ];
    Ok(r)
}

fn product_rank_sql(order: &str, extra_where: &str) -> String {
    format!(
        "SELECT si.product_name, IFNULL(si.variant_name,''), SUM(si.quantity), SUM(si.line_total),
                COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.variant_id = si.variant_id), 0)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status='completed' AND s.created_at >= ?1 AND s.created_at <= ?2
         {extra_where}
         GROUP BY si.variant_id, si.product_name, si.variant_name
         ORDER BY {order}
         LIMIT ?3"
    )
}

fn fill_ranked_sales(
    conn: &Connection,
    sql: &str,
    from: &str,
    end: &str,
    limit: i64,
) -> AppResult<(Vec<Vec<String>>, i64, i64)> {
    let mut stmt = conn.prepare(sql)?;
    let mut qty_t = 0i64;
    let mut rev = 0i64;
    let mut rank = 0i64;
    let rows = stmt
        .query_map(params![from, end, limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(name, variant, q, revenue, stock)| {
            qty_t += q;
            rev += revenue;
            rank += 1;
            vec![
                qty(rank),
                name,
                variant,
                qty(q),
                money(revenue),
                qty(stock),
            ]
        })
        .collect();
    Ok((rows, qty_t, rev))
}

fn top_sellers_report(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base(
        "المنتجات الأكثر مبيعاً",
        "أعلى الأصناف حسب الكمية المباعة خلال الفترة. راجعها لتعرف ما يجب توفيره دائماً.",
        true,
    );
    r.columns = vec![
        "الترتيب".into(),
        "المنتج".into(),
        "الدرجة".into(),
        "الكمية المباعة".into(),
        "الإيراد".into(),
        "المخزون الحالي".into(),
    ];
    let sql = product_rank_sql("SUM(si.quantity) DESC, SUM(si.line_total) DESC", "");
    let (rows, qty_t, rev) = fill_ranked_sales(conn, &sql, from, end, ROW_LIMIT)?;
    r.rows = rows;
    r.summary = vec![
        ReportKpi { label: "عدد الأصناف".into(), value: qty(r.rows.len() as i64) },
        ReportKpi { label: "الكمية المباعة".into(), value: qty(qty_t) },
        ReportKpi { label: "الإيراد".into(), value: money(rev) },
    ];
    Ok(r)
}

fn least_sellers_report(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base(
        "المنتجات الأقل مبيعاً",
        "الأصناف الموجودة في المخزون مرتبة من الأضعف مبيعاً خلال الفترة — بما فيها ما لم يُبع. مهمة لقرار الشراء.",
        true,
    );
    r.columns = vec![
        "الترتيب".into(),
        "المنتج".into(),
        "الدرجة".into(),
        "الكمية المباعة".into(),
        "الإيراد".into(),
        "المخزون الحالي".into(),
    ];
    let mut stmt = conn.prepare(
        "SELECT p.name_ar, IFNULL(v.name,''), COALESCE(sold.qty, 0), COALESCE(sold.rev, 0),
                COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.variant_id = v.id), 0)
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN (
            SELECT si.variant_id, SUM(si.quantity) qty, SUM(si.line_total) rev
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.status='completed' AND s.created_at >= ?1 AND s.created_at <= ?2
            GROUP BY si.variant_id
         ) sold ON sold.variant_id = v.id
         WHERE p.is_active=1 AND v.is_active=1
           AND COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.variant_id = v.id), 0) > 0
         ORDER BY COALESCE(sold.qty, 0) ASC, COALESCE(sold.rev, 0) ASC, p.name_ar
         LIMIT ?3",
    )?;
    let mut qty_t = 0i64;
    let mut zero = 0i64;
    let mut rank = 0i64;
    r.rows = stmt
        .query_map(params![from, end, ROW_LIMIT], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(name, variant, q, revenue, stock)| {
            qty_t += q;
            if q == 0 {
                zero += 1;
            }
            rank += 1;
            vec![
                qty(rank),
                name,
                variant,
                qty(q),
                money(revenue),
                qty(stock),
            ]
        })
        .collect();
    r.summary = vec![
        ReportKpi { label: "أصناف معروضة".into(), value: qty(r.rows.len() as i64) },
        ReportKpi { label: "بدون مبيعات في الفترة".into(), value: qty(zero) },
        ReportKpi { label: "كمية مباعة لهذه القائمة".into(), value: qty(qty_t) },
    ];
    Ok(r)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductMoverRow {
    pub name: String,
    pub variant_name: String,
    pub quantity: i64,
    pub total: i64,
    pub stock: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductMoversDto {
    pub top: Vec<ProductMoverRow>,
    pub least: Vec<ProductMoverRow>,
}

fn mover_from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProductMoverRow> {
    Ok(ProductMoverRow {
        name: r.get(0)?,
        variant_name: r.get(1)?,
        quantity: r.get(2)?,
        total: r.get(3)?,
        stock: r.get(4)?,
    })
}

#[tauri::command]
pub fn list_product_movers(
    state: State<AppState>,
    from: String,
    to: String,
) -> AppResult<ProductMoversDto> {
    let conn = take_conn(&state)?;
    if let Ok(uid) = auth::current_shift_user(&conn) {
        let ok = auth::user_has_permission(&conn, uid, "products.view")?
            || auth::user_has_permission(&conn, uid, "reports.view")?
            || auth::user_has_permission(&conn, uid, "sales.view")?;
        if !ok {
            return Err(AppError::user("ليست لديك صلاحية لعرض حركة الأصناف."));
        }
    }
    let from = from.trim();
    let to = to.trim();
    if from.is_empty() || to.is_empty() {
        return Err(AppError::user("حدد فترة العرض."));
    }
    let end = date_end(to);
    let top_sql = product_rank_sql("SUM(si.quantity) DESC, SUM(si.line_total) DESC", "");
    let mut top_stmt = conn.prepare(&top_sql)?;
    let top = top_stmt
        .query_map(params![from, end, 8i64], mover_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    let mut least_stmt = conn.prepare(
        "SELECT p.name_ar, IFNULL(v.name,''), COALESCE(sold.qty, 0), COALESCE(sold.rev, 0),
                COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.variant_id = v.id), 0)
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN (
            SELECT si.variant_id, SUM(si.quantity) qty, SUM(si.line_total) rev
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.status='completed' AND s.created_at >= ?1 AND s.created_at <= ?2
            GROUP BY si.variant_id
         ) sold ON sold.variant_id = v.id
         WHERE p.is_active=1 AND v.is_active=1
           AND COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.variant_id = v.id), 0) > 0
         ORDER BY COALESCE(sold.qty, 0) ASC, COALESCE(sold.rev, 0) ASC, p.name_ar
         LIMIT ?3",
    )?;
    let least = least_stmt
        .query_map(params![from, end, 8i64], mover_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ProductMoversDto { top, least })
}

fn sales_by_category(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base("المبيعات حسب التصنيف", "تجميع فواتير الفترة حسب تصنيف المنتج.", true);
    r.columns = vec!["التصنيف".into(), "الكمية".into(), "الإيراد".into(), "التكلفة".into(), "مجمل الربح".into()];
    let mut stmt = conn.prepare(
        "SELECT IFNULL(c.name_ar,'بدون تصنيف'), SUM(si.quantity), SUM(si.line_total), SUM(si.line_cost)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN product_variants v ON v.id = si.variant_id
         JOIN products p ON p.id = v.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.status='completed' AND s.created_at >= ?1 AND s.created_at <= ?2
         GROUP BY c.id, c.name_ar
         ORDER BY SUM(si.line_total) DESC LIMIT ?3",
    )?;
    let mut rev = 0i64;
    r.rows = stmt
        .query_map(params![from, end, ROW_LIMIT], |row| {
            let revenue: i64 = row.get(2)?;
            let cost: i64 = row.get(3)?;
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    qty(row.get(1)?),
                    money(revenue),
                    money(cost),
                    money(revenue - cost),
                ],
                revenue,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, revenue)| {
            rev += revenue;
            row
        })
        .collect();
    r.summary = vec![ReportKpi { label: "إجمالي الإيراد".into(), value: money(rev) }];
    Ok(r)
}

fn sales_by_employee(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base("المبيعات حسب الموظف", "إجمالي الفواتير المكتملة لكل كاشير.", true);
    r.columns = vec!["الموظف".into(), "عدد الفواتير".into(), "الإجمالي".into()];
    let mut stmt = conn.prepare(
        "SELECT u.name, COUNT(*), COALESCE(SUM(s.grand_total),0)
         FROM sales s JOIN users u ON u.id = s.user_id
         WHERE s.status='completed' AND s.created_at >= ?1 AND s.created_at <= ?2
         GROUP BY u.id, u.name
         ORDER BY SUM(s.grand_total) DESC",
    )?;
    let mut total = 0i64;
    r.rows = stmt
        .query_map(params![from, end], |row| {
            let amount: i64 = row.get(2)?;
            Ok((
                vec![row.get::<_, String>(0)?, qty(row.get(1)?), money(amount)],
                amount,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, amount)| {
            total += amount;
            row
        })
        .collect();
    r.summary = vec![ReportKpi { label: "الإجمالي".into(), value: money(total) }];
    Ok(r)
}

fn sales_by_payment(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base("المبيعات حسب طريقة الدفع", "توزيع مبالغ الدفع على الفواتير المكتملة.", true);
    r.columns = vec!["طريقة الدفع".into(), "عدد العمليات".into(), "المبلغ".into()];
    let mut stmt = conn.prepare(
        "SELECT pm.name_ar, COUNT(*), COALESCE(SUM(sp.amount),0)
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         JOIN payment_methods pm ON pm.id = sp.payment_method_id
         WHERE s.status='completed' AND s.created_at >= ?1 AND s.created_at <= ?2
         GROUP BY pm.id, pm.name_ar
         ORDER BY SUM(sp.amount) DESC",
    )?;
    let mut total = 0i64;
    r.rows = stmt
        .query_map(params![from, end], |row| {
            let amount: i64 = row.get(2)?;
            Ok((
                vec![row.get::<_, String>(0)?, qty(row.get(1)?), money(amount)],
                amount,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, amount)| {
            total += amount;
            row
        })
        .collect();
    r.summary = vec![ReportKpi { label: "إجمالي الدفعات".into(), value: money(total) }];
    Ok(r)
}

fn profit_report(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base(
        "تقرير الربح والخسارة",
        "التكلفة = تكلفة الدفعة الفعلية المباعة. الصافي بعد المصروفات.",
        true,
    );
    let revenue: i64 = conn.query_row(
        "SELECT COALESCE(SUM(grand_total),0) FROM sales WHERE status='completed' AND created_at>=?1 AND created_at<=?2",
        params![from, end],
        |row| row.get(0),
    )?;
    let cost: i64 = conn.query_row(
        "SELECT COALESCE(SUM(cost_total),0) FROM sales WHERE status='completed' AND created_at>=?1 AND created_at<=?2",
        params![from, end],
        |row| row.get(0),
    )?;
    let discounts: i64 = conn.query_row(
        "SELECT COALESCE(SUM(item_discount_total+invoice_discount),0) FROM sales WHERE status='completed' AND created_at>=?1 AND created_at<=?2",
        params![from, end],
        |row| row.get(0),
    )?;
    let returns: i64 = conn.query_row(
        "SELECT COALESCE(SUM(refund_total),0) FROM returns WHERE created_at>=?1 AND created_at<=?2",
        params![from, end],
        |row| row.get(0),
    )?;
    let to_date = end.get(..10).unwrap_or(end);
    let expenses: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date>=?1 AND expense_date<=?2",
        params![from, to_date],
        |row| row.get(0),
    )?;
    let gross = revenue - cost - returns;
    let net = gross - expenses;
    r.columns = vec!["البند".into(), "المبلغ".into()];
    r.rows = vec![
        vec!["الإيراد".into(), money(revenue)],
        vec!["تكلفة البضاعة المباعة".into(), money(cost)],
        vec!["الخصومات".into(), money(discounts)],
        vec!["المرتجعات".into(), money(returns)],
        vec!["مجمل الربح".into(), money(gross)],
        vec!["المصروفات".into(), money(expenses)],
        vec!["صافي النتيجة".into(), money(net)],
    ];
    r.summary = vec![
        ReportKpi { label: "الإيراد".into(), value: money(revenue) },
        ReportKpi { label: "مجمل الربح".into(), value: money(gross) },
        ReportKpi { label: "صافي النتيجة".into(), value: money(net) },
    ];
    Ok(r)
}

fn inventory_report(conn: &Connection) -> AppResult<ReportView> {
    let mut r = base("المخزون الحالي", "الكميات حسب الموقع والدفعة. لا يشمل الصفري.", false);
    r.columns = vec![
        "المنتج".into(),
        "الدرجة".into(),
        "الموقع".into(),
        "الدفعة".into(),
        "الصلاحية".into(),
        "الكمية".into(),
        "القيمة".into(),
    ];
    let mut stmt = conn.prepare(
        "SELECT p.name_ar, IFNULL(v.name,''), l.name, b.batch_number, IFNULL(b.expiration_date,''),
                s.quantity, s.quantity * b.unit_cost
         FROM stock s
         JOIN product_variants v ON v.id = s.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN batches b ON b.id = s.batch_id
         JOIN locations l ON l.id = s.location_id
         WHERE s.quantity != 0
         ORDER BY p.name_ar, l.name LIMIT ?1",
    )?;
    let mut units = 0i64;
    let mut value = 0i64;
    r.rows = stmt
        .query_map([ROW_LIMIT], |row| {
            let q: i64 = row.get(5)?;
            let val: i64 = row.get(6)?;
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    qty(q),
                    money(val),
                ],
                q,
                val,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, q, val)| {
            units += q;
            value += val;
            row
        })
        .collect();
    r.summary = vec![
        ReportKpi { label: "إجمالي الكمية".into(), value: qty(units) },
        ReportKpi { label: "قيمة المخزون".into(), value: money(value) },
    ];
    Ok(r)
}

fn low_stock_report(conn: &Connection) -> AppResult<ReportView> {
    let mut r = base("نواقص المخزون", "منتجات وصلت إلى حد إعادة الطلب أو أقل.", false);
    r.columns = vec!["المنتج".into(), "الكمية".into(), "الحد الأدنى".into()];
    let mut stmt = conn.prepare(
        "SELECT p.name_ar, SUM(COALESCE(s.quantity,0)), p.min_stock
         FROM products p
         JOIN product_variants v ON v.product_id = p.id
         LEFT JOIN stock s ON s.variant_id = v.id
         WHERE p.is_active=1 AND p.min_stock > 0
         GROUP BY p.id, p.name_ar, p.min_stock
         HAVING p.min_stock > 0 AND SUM(COALESCE(s.quantity,0)) <= p.min_stock
         ORDER BY SUM(COALESCE(s.quantity,0)) ASC LIMIT ?1",
    )?;
    r.rows = stmt
        .query_map([ROW_LIMIT], |row| {
            Ok(vec![
                row.get::<_, String>(0)?,
                qty(row.get(1)?),
                qty(row.get(2)?),
            ])
        })?
        .filter_map(|x| x.ok())
        .collect();
    r.summary = vec![ReportKpi { label: "عدد الأصناف".into(), value: qty(r.rows.len() as i64) }];
    Ok(r)
}

fn expiry_report(conn: &Connection) -> AppResult<ReportView> {
    let mut r = base(
        "تقرير الصلاحية",
        "الدفعات المنتهية والتي ستنتهي ضمن فترة التحذير.",
        false,
    );
    r.columns = vec![
        "المنتج".into(),
        "الموقع".into(),
        "الدفعة".into(),
        "تاريخ الانتهاء".into(),
        "الكمية".into(),
        "الحالة".into(),
    ];
    let today = crate::util::today();
    let warn = setting_i64(conn, "inventory.expiry_warning_days", 90);
    let until = (chrono::Local::now() + chrono::Duration::days(warn))
        .format("%Y-%m-%d")
        .to_string();
    let mut stmt = conn.prepare(
        "SELECT p.name_ar, l.name, b.batch_number, b.expiration_date, s.quantity,
                CASE WHEN b.expiration_date < ?1 THEN 'منتهي' ELSE 'قارب على الانتهاء' END
         FROM stock s
         JOIN batches b ON b.id = s.batch_id
         JOIN product_variants v ON v.id = s.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN locations l ON l.id = s.location_id
         WHERE s.quantity > 0 AND b.expiration_date IS NOT NULL AND b.expiration_date <= ?2
         ORDER BY b.expiration_date ASC LIMIT ?3",
    )?;
    let mut expired = 0i64;
    r.rows = stmt
        .query_map(params![today, until, ROW_LIMIT], |row| {
            let status: String = row.get(5)?;
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    qty(row.get(4)?),
                    status.clone(),
                ],
                status,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, status)| {
            if status == "منتهي" {
                expired += 1;
            }
            row
        })
        .collect();
    r.summary = vec![
        ReportKpi { label: "الصفوف".into(), value: qty(r.rows.len() as i64) },
        ReportKpi { label: "منتهٍ".into(), value: qty(expired) },
        ReportKpi { label: "أيام التحذير".into(), value: qty(warn) },
    ];
    Ok(r)
}

fn slow_moving_report(conn: &Connection, as_of: &str) -> AppResult<ReportView> {
    let days = setting_i64(conn, "slow_moving.days", 60);
    let mut r = base(
        "المنتجات الراكدة",
        &format!("لا مبيعات خلال آخر {days} يوماً (قابل للتعديل من الإعدادات)."),
        false,
    );
    r.columns = vec!["المنتج".into(), "الكمية الحالية".into(), "آخر بيع".into()];
    let cutoff = chrono::NaiveDate::parse_from_str(as_of, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.checked_sub_signed(chrono::Duration::days(days)))
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| as_of.to_string());
    let mut stmt = conn.prepare(
        "SELECT p.name_ar,
                COALESCE((SELECT SUM(s.quantity) FROM stock s JOIN product_variants v ON v.id=s.variant_id WHERE v.product_id=p.id),0),
                (SELECT MAX(sl.created_at) FROM sale_items si
                 JOIN sales sl ON sl.id = si.sale_id
                 JOIN product_variants v ON v.id = si.variant_id
                 WHERE v.product_id = p.id AND sl.status='completed')
         FROM products p
         WHERE p.is_active=1
         ORDER BY p.name_ar LIMIT ?1",
    )?;
    r.rows = stmt
        .query_map([ROW_LIMIT], |row| {
            let last: Option<String> = row.get(2)?;
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    qty(row.get(1)?),
                    last.clone().map(|s| dt(&s)).unwrap_or_else(|| "لا يوجد".into()),
                ],
                last,
            ))
        })?
        .filter_map(|x| x.ok())
        .filter(|(_, last)| match last {
            None => true,
            Some(s) => s.as_str() < cutoff.as_str(),
        })
        .map(|(row, _)| row)
        .collect();
    r.summary = vec![
        ReportKpi { label: "عدد الأصناف".into(), value: qty(r.rows.len() as i64) },
        ReportKpi { label: "بدون بيع منذ".into(), value: cutoff },
    ];
    Ok(r)
}

fn valuation_report(conn: &Connection) -> AppResult<ReportView> {
    let mut r = base(
        "تقييم المخزون",
        "القيمة = الكمية × تكلفة الدفعة الفعلية.",
        false,
    );
    r.columns = vec!["المنتج".into(), "الكمية".into(), "القيمة".into()];
    let mut stmt = conn.prepare(
        "SELECT p.name_ar, SUM(s.quantity), SUM(s.quantity * b.unit_cost)
         FROM stock s
         JOIN product_variants v ON v.id = s.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN batches b ON b.id = s.batch_id
         WHERE s.quantity != 0
         GROUP BY p.id, p.name_ar
         ORDER BY SUM(s.quantity * b.unit_cost) DESC LIMIT ?1",
    )?;
    let mut value = 0i64;
    r.rows = stmt
        .query_map([ROW_LIMIT], |row| {
            let val: i64 = row.get(2)?;
            Ok((
                vec![row.get::<_, String>(0)?, qty(row.get(1)?), money(val)],
                val,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, val)| {
            value += val;
            row
        })
        .collect();
    r.summary = vec![ReportKpi { label: "إجمالي القيمة".into(), value: money(value) }];
    Ok(r)
}

fn purchases_report(conn: &Connection, from: &str, to: &str) -> AppResult<ReportView> {
    let mut r = base("تقرير المشتريات", "فواتير المشتريات المستلمة خلال الفترة.", true);
    r.columns = vec![
        "الفاتورة".into(),
        "التاريخ".into(),
        "المورد".into(),
        "الإجمالي".into(),
        "المدفوع".into(),
        "المتبقي".into(),
        "الحالة".into(),
    ];
    let mut stmt = conn.prepare(
        "SELECT p.invoice_number, p.invoice_date, s.name, p.grand_total, p.paid_total, p.status
         FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.invoice_date >= ?1 AND p.invoice_date <= ?2
         ORDER BY p.invoice_date DESC, p.id DESC LIMIT ?3",
    )?;
    let mut total = 0i64;
    let mut due = 0i64;
    r.rows = stmt
        .query_map(params![from, to, ROW_LIMIT], |row| {
            let grand: i64 = row.get(3)?;
            let paid: i64 = row.get(4)?;
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    dt(&row.get::<_, String>(1)?),
                    row.get::<_, String>(2)?,
                    money(grand),
                    money(paid),
                    money(grand - paid),
                    status_ar(&row.get::<_, String>(5)?),
                ],
                grand,
                grand - paid,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, grand, rest)| {
            total += grand;
            due += rest;
            row
        })
        .collect();
    r.summary = vec![
        ReportKpi { label: "إجمالي المشتريات".into(), value: money(total) },
        ReportKpi { label: "المتبقي للموردين".into(), value: money(due) },
    ];
    Ok(r)
}

fn expenses_report(conn: &Connection, from: &str, to: &str) -> AppResult<ReportView> {
    let mut r = base("تقرير المصروفات", "مصروفات الفترة حسب التصنيف.", true);
    r.columns = vec!["التاريخ".into(), "التصنيف".into(), "الوصف".into(), "المبلغ".into()];
    let mut stmt = conn.prepare(
        "SELECT e.expense_date, c.name_ar, IFNULL(e.description,''), e.amount
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id
         WHERE e.expense_date >= ?1 AND e.expense_date <= ?2
         ORDER BY e.expense_date DESC, e.id DESC LIMIT ?3",
    )?;
    let mut total = 0i64;
    r.rows = stmt
        .query_map(params![from, to, ROW_LIMIT], |row| {
            let amount: i64 = row.get(3)?;
            Ok((
                vec![
                    dt(&row.get::<_, String>(0)?),
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    money(amount),
                ],
                amount,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, amount)| {
            total += amount;
            row
        })
        .collect();
    r.summary = vec![ReportKpi { label: "إجمالي المصروفات".into(), value: money(total) }];
    Ok(r)
}

fn suppliers_report(conn: &Connection) -> AppResult<ReportView> {
    let mut r = base("أرصدة الموردين", "صافي حركات الموردين حتى الآن.", false);
    r.columns = vec!["المورد".into(), "الهاتف".into(), "الرصيد".into()];
    let mut stmt = conn.prepare(
        "SELECT s.name, IFNULL(s.phone,''),
                COALESCE((SELECT SUM(amount) FROM supplier_transactions t WHERE t.supplier_id=s.id),0)
         FROM suppliers s
         WHERE s.is_active=1
         ORDER BY s.name LIMIT ?1",
    )?;
    let mut total = 0i64;
    r.rows = stmt
        .query_map([ROW_LIMIT], |row| {
            let bal: i64 = row.get(2)?;
            Ok((
                vec![row.get::<_, String>(0)?, row.get::<_, String>(1)?, money(bal)],
                bal,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, bal)| {
            total += bal;
            row
        })
        .collect();
    r.summary = vec![ReportKpi { label: "صافي الأرصدة".into(), value: money(total) }];
    Ok(r)
}

fn customers_report(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base("تقرير العملاء", "مشتريات ومرتجعات الفترة مع الرصيد ونقاط الولاء.", true);
    r.columns = vec![
        "العميل".into(),
        "الجوال".into(),
        "المشتريات".into(),
        "المرتجعات".into(),
        "الرصيد".into(),
        "النقاط".into(),
    ];
    let mut stmt = conn.prepare(
        "SELECT c.name, IFNULL(c.mobile,''),
                COALESCE((SELECT SUM(s.grand_total) FROM sales s WHERE s.customer_id=c.id AND s.status='completed' AND s.created_at>=?1 AND s.created_at<=?2),0),
                COALESCE((SELECT SUM(rt.refund_total) FROM returns rt WHERE rt.customer_id=c.id AND rt.created_at>=?1 AND rt.created_at<=?2),0),
                c.account_balance, c.loyalty_points
         FROM customers c
         WHERE c.is_walk_in=0
         ORDER BY c.name LIMIT ?3",
    )?;
    let mut sales_t = 0i64;
    r.rows = stmt
        .query_map(params![from, end, ROW_LIMIT], |row| {
            let sales: i64 = row.get(2)?;
            Ok((
                vec![
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    money(sales),
                    money(row.get(3)?),
                    money(row.get(4)?),
                    qty(row.get(5)?),
                ],
                sales,
            ))
        })?
        .filter_map(|x| x.ok())
        .map(|(row, sales)| {
            sales_t += sales;
            row
        })
        .collect();
    r.summary = vec![
        ReportKpi { label: "عدد العملاء".into(), value: qty(r.rows.len() as i64) },
        ReportKpi { label: "مشتريات الفترة".into(), value: money(sales_t) },
    ];
    Ok(r)
}

fn cash_report(conn: &Connection, from: &str, end: &str) -> AppResult<ReportView> {
    let mut r = base(
        "تقرير الصندوق والورديات",
        "افتتاحي، المتوقع، الفعلي، والفرق لكل وردية في الفترة.",
        true,
    );
    r.columns = vec![
        "الموظف".into(),
        "الفتح".into(),
        "الإغلاق".into(),
        "افتتاحي".into(),
        "متوقع".into(),
        "فعلي".into(),
        "الفرق".into(),
        "الحالة".into(),
    ];
    let mut stmt = conn.prepare(
        "SELECT u.name, s.opened_at, IFNULL(s.closed_at,''), s.opening_cash,
                IFNULL(s.expected_cash,0), s.closing_cash_actual, s.difference, s.status
         FROM cash_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.opened_at >= ?1 AND s.opened_at <= ?2
         ORDER BY s.id DESC LIMIT ?3",
    )?;
    r.rows = stmt
        .query_map(params![from, end, ROW_LIMIT], |row| {
            let actual: Option<i64> = row.get(5)?;
            let diff: Option<i64> = row.get(6)?;
            Ok(vec![
                row.get::<_, String>(0)?,
                dt(&row.get::<_, String>(1)?),
                {
                    let c: String = row.get(2)?;
                    if c.is_empty() { "—".into() } else { dt(&c) }
                },
                money(row.get(3)?),
                money(row.get(4)?),
                actual.map(money).unwrap_or_else(|| "—".into()),
                diff.map(money).unwrap_or_else(|| "—".into()),
                status_ar(&row.get::<_, String>(7)?),
            ])
        })?
        .filter_map(|x| x.ok())
        .collect();
    r.summary = vec![ReportKpi { label: "عدد الورديات".into(), value: qty(r.rows.len() as i64) }];
    Ok(r)
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

struct PdfExtras {
    address: String,
    phone: String,
    tax_number: String,
    logo_src: String,
}

fn pdf_extras(conn: &Connection) -> PdfExtras {
    PdfExtras {
        address: store_address_line(conn),
        phone: store_phone_line(conn),
        tax_number: store_tax_line(conn),
        logo_src: crate::util::image_data_url(&setting(conn, "store.logo_path", "")).unwrap_or_default(),
    }
}

fn is_numeric_cell(c: &str) -> bool {
    let t = c.trim();
    if t.is_empty() || t == "—" {
        return false;
    }
    t.contains("ج.م")
        || t.chars()
            .all(|ch| ch.is_ascii_digit() || matches!(ch, '.' | ',' | '-' | '%'))
}

fn status_class(c: &str) -> Option<&'static str> {
    match c.trim() {
        "مكتملة" | "مستلمة" | "مغلقة" => Some("ok"),
        "مفتوحة" => Some("open"),
        "ملغاة" | "مسودة" => Some("bad"),
        _ => None,
    }
}

fn td_html(c: &str) -> String {
    let e = esc(c);
    if let Some(cls) = status_class(c) {
        return format!("<td><span class=\"badge {cls}\">{e}</span></td>");
    }
    if is_numeric_cell(c) {
        return format!("<td class=\"num\" dir=\"ltr\">{e}</td>");
    }
    format!("<td>{e}</td>")
}

#[cfg(test)]
fn report_html(r: &ReportView) -> String {
    report_html_full(
        r,
        &PdfExtras {
            address: String::new(),
            phone: String::new(),
            tax_number: String::new(),
            logo_src: String::new(),
        },
    )
}

fn report_html_full(r: &ReportView, extras: &PdfExtras) -> String {
    let kpis = r
        .summary
        .iter()
        .map(|k| {
            format!(
                "<div class=\"kpi\"><div class=\"kl\">{}</div><div class=\"kv\" dir=\"ltr\">{}</div></div>",
                esc(&k.label),
                esc(&k.value)
            )
        })
        .collect::<String>();
    let head = r
        .columns
        .iter()
        .map(|c| format!("<th>{}</th>", esc(c)))
        .collect::<String>();
    let cols = r.columns.len().max(1);
    let body = if r.rows.is_empty() {
        format!(
            "<tr class=\"empty\"><td colspan=\"{cols}\"><div class=\"empty-box\">لا توجد بيانات لهذه الفترة.</div></td></tr>"
        )
    } else {
        r.rows
            .iter()
            .map(|row| {
                let cells = row.iter().map(|c| td_html(c)).collect::<String>();
                format!("<tr>{cells}</tr>")
            })
            .collect::<String>()
    };
    let initial = r
        .store_name
        .chars()
        .next()
        .map(|c| c.to_string())
        .unwrap_or_else(|| "م".into());
    let brand_mark = if extras.logo_src.is_empty() {
        format!("<div class=\"mark\">{}</div>", esc(&initial))
    } else {
        format!(
            "<img class=\"logo\" src=\"{}\" alt=\"\"/>",
            extras.logo_src
        )
    };
    let mut contacts = Vec::new();
    if !extras.address.trim().is_empty() {
        contacts.push(esc(&extras.address));
    }
    if !extras.phone.trim().is_empty() {
        contacts.push(esc(&extras.phone));
    }
    if !extras.tax_number.trim().is_empty() {
        contacts.push(format!("الرقم الضريبي: {}", esc(&extras.tax_number)));
    }
    let contact_html = if contacts.is_empty() {
        String::new()
    } else {
        format!("<div class=\"contact\">{}</div>", contacts.join(" · "))
    };
    let kpis_block = if r.summary.is_empty() {
        String::new()
    } else {
        format!("<section class=\"kpis\">{kpis}</section>")
    };
    let foot = if r.footnote.trim().is_empty() {
        String::new()
    } else {
        format!("<div class=\"note\">{}</div>", esc(&r.footnote))
    };
    format!(
        r##"<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<style>
  @page {{ size: A4; margin: 10mm 10mm 12mm; }}
  * {{ box-sizing: border-box; }}
  html, body {{
    margin: 0;
    padding: 0;
    color: #1e293b;
    background: #fff;
    font-family: "Segoe UI", Tahoma, "Traditional Arabic", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  .page {{ padding: 4px 2px 0; }}
  .banner {{
    background: linear-gradient(135deg, #4a1426 0%, #9b2c4d 72%);
    color: #fff;
    border-radius: 14px;
    padding: 18px 20px 16px;
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 16px;
  }}
  .brand {{ display: flex; align-items: center; gap: 12px; min-width: 0; }}
  .logo, .mark {{
    width: 58px; height: 58px; border-radius: 14px; flex-shrink: 0;
    background: rgba(255,255,255,.14);
    border: 1px solid rgba(255,255,255,.22);
  }}
  .logo {{ object-fit: contain; background: #fff; }}
  .mark {{
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 800; color: #fde7c7;
  }}
  .eyebrow {{
    font-size: 10px; letter-spacing: .18em; color: #f0d2a8; margin: 0 0 4px;
  }}
  h1 {{ font-size: 22px; margin: 0; line-height: 1.25; color: #fff; }}
  .sub {{ font-size: 11px; margin: 4px 0 0; color: rgba(255,255,255,.82); }}
  .contact {{ font-size: 10px; margin-top: 6px; color: rgba(255,255,255,.72); }}
  .meta {{
    display: flex; flex-direction: column; justify-content: center; gap: 6px;
    min-width: 190px;
  }}
  .pill {{
    background: rgba(255,255,255,.12);
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 9px;
    padding: 7px 10px;
    font-size: 10px;
    color: #fff;
  }}
  .pill b {{ display: block; color: #f0d2a8; font-size: 9px; font-weight: 700; margin-bottom: 2px; }}
  .kpis {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
    margin: 14px 0 16px;
    width: 100%;
  }}
  .kpi {{
    background: #fffafb;
    border: 1px solid #f0d7df;
    border-inline-start: 4px solid #9b2c4d;
    border-radius: 12px;
    padding: 12px 14px;
    min-height: 64px;
  }}
  .kl {{ font-size: 11px; color: #8a5060; font-weight: 700; }}
  .kv {{ font-size: 18px; font-weight: 800; margin-top: 6px; color: #4a1426; }}
  .block-title {{
    display: flex; align-items: center; justify-content: space-between;
    margin: 0 0 8px;
    font-size: 12px; font-weight: 800; color: #4a1426;
  }}
  .block-title span {{
    display: inline-block; width: 8px; height: 8px; border-radius: 99px;
    background: #c4a265; margin-inline-end: 6px;
  }}
  .table-wrap {{
    width: 100%;
    border: 1px solid #edd5dc;
    border-radius: 12px;
    overflow: hidden;
  }}
  table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
  th {{
    text-align: right;
    background: #4a1426;
    color: #fff;
    font-weight: 700;
    padding: 9px 8px;
  }}
  td {{
    border-bottom: 1px solid #f3e6ea;
    padding: 8px;
    vertical-align: middle;
  }}
  tbody tr:nth-child(even) td {{ background: #fdf7f8; }}
  tbody tr:last-child td {{ border-bottom: 0; }}
  td.num {{ font-weight: 800; color: #9b2c4d; white-space: nowrap; }}
  .badge {{
    display: inline-block;
    border-radius: 99px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 800;
  }}
  .badge.ok {{ background: #ecfdf5; color: #047857; }}
  .badge.open {{ background: #fff7ed; color: #c2410c; }}
  .badge.bad {{ background: #fef2f2; color: #b91c1c; }}
  .empty td {{ background: #fff !important; padding: 28px 8px; }}
  .empty-box {{ text-align: center; color: #94a3b8; font-size: 12px; }}
  .note {{ margin-top: 10px; font-size: 10px; color: #9b2c4d; }}
  .footer {{
    margin-top: 16px;
    padding-top: 10px;
    border-top: 2px solid #4a1426;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 10px;
    color: #64748b;
  }}
  .footer b {{ color: #4a1426; }}
</style>
</head>
<body>
  <div class="page">
    <header class="banner">
      <div class="brand">
        {mark}
        <div>
          <div class="eyebrow">WATEEN POS</div>
          <h1>{title}</h1>
          <div class="sub">{subtitle}</div>
          {contact}
        </div>
      </div>
      <div class="meta">
        <div class="pill"><b>المنشأة</b>{store}</div>
        <div class="pill"><b>الفترة</b>{period}</div>
        <div class="pill"><b>تاريخ الإصدار</b>{when}</div>
      </div>
    </header>
    {kpis}
    <div class="block-title"><div><span></span>تفاصيل التقرير</div><div>{count} صف</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr>{head}</tr></thead>
        <tbody>{body}</tbody>
      </table>
    </div>
    {foot}
    <div class="footer">
      <div>تقرير صادر من <b>نظام إدارة مستحضرات التجميل</b></div>
      <div>{store}</div>
    </div>
  </div>
</body>
</html>"##,
        title = esc(&r.title),
        subtitle = esc(&r.subtitle),
        store = esc(&r.store_name),
        period = esc(&r.period_label),
        when = esc(&r.generated_at),
        mark = brand_mark,
        contact = contact_html,
        kpis = kpis_block,
        head = head,
        body = body,
        foot = foot,
        count = r.rows.len(),
    )
}

fn html_file_to_pdf(html: &Path, dest: &Path) -> AppResult<()> {
    let browser = find_chromium().ok_or_else(|| {
        AppError::user("تعذر تصدير PDF. ثبّت Microsoft Edge أو Google Chrome على الجهاز.")
    })?;
    let url = path_to_file_url(html);
    let pdf_arg = format!("--print-to-pdf={}", dest.display());
    let status = Command::new(&browser)
        .args([
            "--headless",
            "--disable-gpu",
            "--no-first-run",
            "--no-pdf-header-footer",
            "--no-sandbox",
            pdf_arg.as_str(),
            url.as_str(),
        ])
        .status()
        .map_err(|e| AppError::tech("تعذر تشغيل المتصفح لإنشاء PDF.", e.to_string()))?;
    if !status.success() {
        return Err(AppError::user("فشل إنشاء ملف PDF من التقرير."));
    }
    Ok(())
}

fn find_chromium() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ];
    candidates.iter().map(PathBuf::from).find(|p| p.exists())
}

fn path_to_file_url(path: &Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    let encoded = s.replace(' ', "%20").replace('&', "%26");
    if encoded.starts_with('/') {
        format!("file://{encoded}")
    } else {
        format!("file:///{encoded}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_escapes_and_contains_title() {
        let r = ReportView {
            kind: "sales".into(),
            title: "تقرير <مبيعات>".into(),
            subtitle: "اختبار".into(),
            store_name: "متجر".into(),
            period_label: "2026-01-01 → 2026-01-31".into(),
            generated_at: "2026-01-31 10:00".into(),
            uses_period: true,
            columns: vec!["أ".into()],
            rows: vec![vec!["قيمة & أخرى".into()]],
            summary: vec![ReportKpi { label: "عدد".into(), value: "1".into() }],
            footnote: String::new(),
        };
        let html = report_html(&r);
        assert!(html.contains("تقرير &lt;مبيعات&gt;"));
        assert!(html.contains("قيمة &amp; أخرى"));
        assert!(html.contains("dir=\"rtl\""));
        assert!(html.contains("class=\"banner\""));
        assert!(html.contains("class=\"kpis\""));
        assert!(html.contains("print-color-adjust: exact"));
    }
}
