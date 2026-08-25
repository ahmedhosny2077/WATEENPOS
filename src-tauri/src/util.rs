use chrono::Datelike;
use rusqlite::params;
use std::path::Path;

use crate::error::{AppError, AppResult};

pub fn now_local() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn arabic_to_ascii_digit(c: char) -> char {
    match c {
        '٠' | '۰' => '0',
        '١' | '۱' => '1',
        '٢' | '۲' => '2',
        '٣' | '۳' => '3',
        '٤' | '۴' => '4',
        '٥' | '۵' => '5',
        '٦' | '۶' => '6',
        '٧' | '۷' => '7',
        '٨' | '۸' => '8',
        '٩' | '۹' => '9',
        _ => c,
    }
}

pub fn normalize_search_text(raw: &str) -> String {
    raw.trim()
        .chars()
        .map(arabic_to_ascii_digit)
        .collect::<String>()
        .trim()
        .to_string()
}

pub struct DocSearch {
    pub like: String,
    pub compact: String,
    pub serial: i64,
}

pub fn doc_search(query: &str) -> DocSearch {
    let normalized = normalize_search_text(query);
    let like = format!("%{normalized}%");
    let compact_src: String = normalized
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect();
    let compact = if compact_src.is_empty() {
        like.clone()
    } else {
        format!("%{compact_src}%")
    };
    let digits: String = normalized
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let serial = digits.parse::<i64>().ok().filter(|&n| n > 0).unwrap_or(-1);
    DocSearch {
        like,
        compact,
        serial,
    }
}

pub fn current_year() -> i32 {
    chrono::Local::now().year()
}

fn sequence_target(seq: &str) -> Option<(&'static str, &'static str)> {
    match seq {
        "sale" => Some(("sales", "invoice_number")),
        "purchase" => Some(("purchases", "invoice_number")),
        "return" => Some(("returns", "return_number")),
        "transfer" => Some(("transfers", "transfer_number")),
        _ => None,
    }
}

pub fn format_document_number(prefix: &str, year: i32, value: i64, pad: i64) -> String {
    let width = pad.clamp(1, 12) as usize;
    format!("{prefix}-{year}-{value:0width$}")
}

fn max_used_document_number(
    conn: &rusqlite::Connection,
    table: &str,
    column: &str,
    prefix: &str,
    year: i32,
) -> AppResult<i64> {
    let head = format!("{prefix}-{year}-");
    let start = head.len() as i64 + 1;
    let like = format!("{head}%");
    let sql = format!(
        "SELECT COALESCE(MAX(CAST(substr({column}, ?2) AS INTEGER)), 0)
         FROM {table}
         WHERE {column} LIKE ?1"
    );
    Ok(conn.query_row(&sql, params![like, start], |r| r.get(0))?)
}

pub fn next_document_number(conn: &rusqlite::Connection, seq: &str) -> AppResult<String> {
    let (prefix, mut next_value, pad): (String, i64, i64) = conn
        .query_row(
            "SELECT prefix, next_value, pad FROM sequences WHERE name = ?1",
            [seq],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| AppError::user("تعذر إنشاء رقم المستند. أعد المحاولة."))?;
    if next_value < 1 {
        next_value = 1;
    }
    let year = current_year();
    if let Some((table, column)) = sequence_target(seq) {
        let used = max_used_document_number(conn, table, column, &prefix, year)?;
        if next_value <= used {
            next_value = used + 1;
        }
    }
    conn.execute(
        "UPDATE sequences SET next_value = ?1 WHERE name = ?2",
        params![next_value + 1, seq],
    )?;
    Ok(format_document_number(&prefix, year, next_value, pad))
}

pub fn setting(conn: &rusqlite::Connection, key: &str, default: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

pub fn setting_i64(conn: &rusqlite::Connection, key: &str, default: i64) -> i64 {
    setting(conn, key, "").parse().unwrap_or(default)
}

fn join_setting_parts(parts: &[String], sep: &str) -> String {
    parts
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(sep)
}

pub fn store_address_line(conn: &rusqlite::Connection) -> String {
    join_setting_parts(
        &[
            setting(conn, "store.address", ""),
            setting(conn, "store.district", ""),
            setting(conn, "store.city", ""),
        ],
        "، ",
    )
}

pub fn store_phone_line(conn: &rusqlite::Connection) -> String {
    join_setting_parts(
        &[
            setting(conn, "store.phone", ""),
            setting(conn, "store.phone2", ""),
        ],
        " · ",
    )
}

pub fn store_tax_line(conn: &rusqlite::Connection) -> String {
    let tax = setting(conn, "store.tax_number", "");
    let cr = setting(conn, "store.commercial_register", "");
    let mut parts = Vec::new();
    if !tax.trim().is_empty() {
        parts.push(tax.trim().to_string());
    }
    if !cr.trim().is_empty() {
        parts.push(format!("س.ت {}", cr.trim()));
    }
    parts.join(" · ")
}

pub fn store_receipt_footer(conn: &rusqlite::Connection) -> String {
    join_setting_parts(
        &[
            setting(conn, "store.invoice_note", ""),
            setting(conn, "invoice.footer", "شكراً لزيارتكم"),
        ],
        " — ",
    )
}

pub fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn image_data_url(path: &str) -> Option<String> {
    let path = path.trim();
    if path.is_empty() {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() || bytes.len() > 2_000_000 {
        return None;
    }
    let mime = match Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE sequences (name TEXT PRIMARY KEY, prefix TEXT, next_value INTEGER, pad INTEGER);
             CREATE TABLE sales (invoice_number TEXT UNIQUE);
             INSERT INTO sequences VALUES ('sale','COS',1,6);",
        )
        .unwrap();
        c
    }

    #[test]
    fn doc_search_matches_unpadded_and_arabic_digits() {
        let a = doc_search("COS-2026-1");
        assert_eq!(a.serial, 1);
        assert!(a.like.contains("COS-2026-1"));
        let b = doc_search("٠٠٠٠٠١");
        assert_eq!(b.serial, 1);
        let c = doc_search("  12 ");
        assert_eq!(c.serial, 12);
        let empty = doc_search("");
        assert_eq!(empty.like, "%%");
        assert_eq!(empty.serial, -1);
    }

    #[test]
    fn formats_padded_invoice() {
        assert_eq!(format_document_number("COS", 2026, 1, 6), "COS-2026-000001");
        assert_eq!(format_document_number("COS", 2026, 12, 6), "COS-2026-000012");
    }

    #[test]
    fn first_sale_number_is_one() {
        let c = setup();
        let n = next_document_number(&c, "sale").unwrap();
        assert_eq!(n, format_document_number("COS", current_year(), 1, 6));
    }

    #[test]
    fn skips_numbers_already_used() {
        let c = setup();
        let year = current_year();
        c.execute(
            "INSERT INTO sales(invoice_number) VALUES (?1), (?2)",
            params![
                format_document_number("COS", year, 1, 6),
                format_document_number("COS", year, 2, 6)
            ],
        )
        .unwrap();
        let n = next_document_number(&c, "sale").unwrap();
        assert_eq!(n, format_document_number("COS", year, 3, 6));
    }
}
