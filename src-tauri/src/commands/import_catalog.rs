use super::{with_tx, AppState};
use crate::audit;
use crate::auth;
use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::paths;
use crate::util::now_local;
use rusqlite::{params, OptionalExtension, Transaction};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

const OBF_DUMP_URL: &str =
    "https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz";
const MAX_IMPORT: i64 = 25_000;
const USER_AGENT: &str = "WateenPOS/1.0 (local test catalog; Open Beauty Facts ODbL)";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCatalogResult {
    pub imported: i64,
    pub skipped: i64,
    pub brands: i64,
    pub message: String,
}

struct CatalogRow {
    sku: String,
    name: String,
    brand: Option<String>,
    category: String,
    barcode: Option<String>,
    retail: i64,
    variant_name: String,
    description: Option<String>,
}

enum CatalogFormat {
    ObfGzip,
    ObfTsv,
    IncidbPipe,
}

#[tauri::command]
pub fn pick_catalog_csv(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("كتالوج INCIDB / CSV", &["csv", "gz", "tsv", "txt"])
        .blocking_pick_file()
        .and_then(|p| p.as_path().map(|x| x.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn import_test_catalog(
    state: State<AppState>,
    limit: Option<i64>,
    path: Option<String>,
) -> AppResult<ImportCatalogResult> {
    let limit = limit.unwrap_or(MAX_IMPORT).clamp(1, MAX_IMPORT);
    let source = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => download_obf_dump()?,
    };
    if !source.exists() {
        return Err(AppError::user("ملف الكتالوج غير موجود."));
    }

    with_tx(&state, |tx| {
        let uid = auth::actor_for(tx, "products.edit", None)?;
        let _ = tx.execute_batch("PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY;");
        let now = now_local();
        let store_id = inventory::store_location_id(tx)?;
        let warehouse_id = inventory::warehouse_location_id(tx)?;
        let mut brand_cache = HashMap::new();
        let mut existing_sku = HashSet::new();
        let mut existing_barcodes = HashSet::new();
        {
            let mut stmt = tx.prepare("SELECT sku FROM products WHERE sku IS NOT NULL AND sku != ''")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            for s in rows {
                existing_sku.insert(s?);
            }
        }
        {
            let mut stmt = tx.prepare("SELECT lower(code) FROM barcodes")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            for s in rows {
                existing_barcodes.insert(s?);
            }
        }

        let incidb_brands = load_incidb_brand_names(&source);
        let mut imported = 0i64;
        let mut skipped = 0i64;

        let format = detect_format(&source)?;
        {
            let mut insert_row = |row: CatalogRow| -> AppResult<bool> {
                if imported >= limit {
                    return Ok(false);
                }
                if existing_sku.contains(&row.sku) {
                    skipped += 1;
                    return Ok(true);
                }
                let sku = row.sku.clone();
                insert_catalog_row(
                    tx,
                    &now,
                    store_id,
                    warehouse_id,
                    &mut brand_cache,
                    &mut existing_barcodes,
                    row,
                )?;
                existing_sku.insert(sku);
                imported += 1;
                Ok(true)
            };

            match format {
                CatalogFormat::ObfGzip => {
                    let file = File::open(&source)?;
                    let gz = flate2::read::GzDecoder::new(file);
                    read_obf_rows(gz, &mut insert_row)?;
                }
                CatalogFormat::ObfTsv => {
                    let file = File::open(&source)?;
                    read_obf_rows(file, &mut insert_row)?;
                }
                CatalogFormat::IncidbPipe => {
                    let file = File::open(&source)?;
                    read_incidb_rows(file, &incidb_brands, &mut insert_row)?;
                }
            }
        }

        audit::log(
            tx,
            Some(uid),
            "import_products",
            Some("product"),
            None,
            &format!("استيراد كتالوج اختبار: {imported} منتج"),
            None,
            None,
        );
        Ok(ImportCatalogResult {
            imported,
            skipped,
            brands: brand_cache.len() as i64,
            message: format!(
                "تم إدخال {imported} منتج اختبار (تخطي {skipped}). المصدر: Open Beauty Facts / INCIDB — ODbL."
            ),
        })
    })
}

fn insert_catalog_row(
    tx: &Transaction,
    now: &str,
    store_id: i64,
    warehouse_id: i64,
    brand_cache: &mut HashMap<String, i64>,
    existing_barcodes: &mut HashSet<String>,
    row: CatalogRow,
) -> AppResult<()> {
    let brand_id = if let Some(brand) = row.brand.as_deref() {
        upsert_brand(tx, brand_cache, brand, now)?
    } else {
        None
    };
    let category_id = map_category(&row.category);
    let cost = (row.retail * 45 / 100).max(100);
    let wholesale = (row.retail * 70 / 100).max(200);
    let h = mix64(&row.sku);
    let store_qty = 4 + (h % 16) as i64;
    let warehouse_qty = 10 + ((h / 16) % 50) as i64;

    tx.execute(
        "INSERT INTO products(sku,name_ar,name_en,brand_id,category_id,unit_id,product_type,purchase_cost,retail_price,wholesale_price,min_stock,reorder_level,description,is_active,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,1,'test_catalog',?6,?7,?8,2,5,?9,1,?10,?10)",
        params![
            row.sku,
            row.name,
            row.name,
            brand_id,
            category_id,
            cost,
            row.retail,
            wholesale,
            row.description,
            now
        ],
    )?;
    let product_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO product_variants(product_id,name,sku,retail_price,is_default,is_active,created_at,updated_at)
         VALUES(?1,?2,?3,?4,1,1,?5,?5)",
        params![product_id, row.variant_name, row.sku, row.retail, now],
    )?;
    let variant_id = tx.last_insert_rowid();
    if let Some(code) = row.barcode.as_deref() {
        let key = code.to_lowercase();
        if !existing_barcodes.contains(&key) {
            tx.execute(
                "INSERT OR IGNORE INTO barcodes(variant_id,code,is_primary) VALUES(?1,?2,1)",
                params![variant_id, code],
            )?;
            existing_barcodes.insert(key);
        }
    }
    seed_test_stock(tx, variant_id, store_id, store_qty, cost, now, "S")?;
    seed_test_stock(tx, variant_id, warehouse_id, warehouse_qty, cost, now, "W")?;
    Ok(())
}

fn seed_test_stock(
    tx: &Transaction,
    variant_id: i64,
    location_id: i64,
    quantity: i64,
    unit_cost: i64,
    now: &str,
    tag: &str,
) -> AppResult<()> {
    if quantity <= 0 {
        return Ok(());
    }
    tx.execute(
        "INSERT INTO batches(variant_id,batch_number,unit_cost,qty_received,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?5)",
        params![variant_id, format!("TEST-{tag}-{variant_id}"), unit_cost, quantity, now],
    )?;
    let batch_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO stock(variant_id,batch_id,location_id,quantity,updated_at)
         VALUES(?1,?2,?3,?4,?5)",
        params![variant_id, batch_id, location_id, quantity, now],
    )?;
    Ok(())
}

fn read_obf_rows<R: Read>(
    reader: R,
    insert_row: &mut impl FnMut(CatalogRow) -> AppResult<bool>,
) -> AppResult<()> {
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(b'\t')
        .flexible(true)
        .from_reader(reader);
    let headers = rdr
        .headers()
        .map_err(|e| AppError::tech("تعذر قراءة ترويسة الكتالوج.", e.to_string()))?
        .clone();
    let idx = |name: &str| headers.iter().position(|h| h.eq_ignore_ascii_case(name));
    let i_code = idx("code");
    let i_name = idx("product_name");
    let i_abbr = idx("abbreviated_product_name");
    let i_generic = idx("generic_name");
    let i_brands = idx("brands");
    let i_cat = idx("categories_en").or_else(|| idx("categories"));
    let i_qty = idx("quantity");

    for rec in rdr.records() {
        let rec = rec.map_err(|e| AppError::tech("تعذر قراءة صف من الكتالوج.", e.to_string()))?;
        let get = |i: Option<usize>| {
            i.and_then(|p| rec.get(p))
                .unwrap_or("")
                .trim()
                .to_string()
        };
        let mut name = get(i_name);
        if name.is_empty() {
            name = get(i_abbr);
        }
        if name.is_empty() {
            name = get(i_generic);
        }
        if name.is_empty() {
            continue;
        }
        let code = get(i_code);
        let sku = if code.is_empty() {
            format!("OBF-{}", mix64(&name))
        } else {
            format!("OBF-{code}")
        };
        let brand = first_brand(&get(i_brands));
        let category = get(i_cat);
        let barcode = sanitize_barcode(&code);
        let variant_name = get(i_qty);
        let retail = fallback_price(&sku, &name);
        let cont = insert_row(CatalogRow {
            sku,
            name: clip(&name, 180),
            brand,
            category,
            barcode,
            retail,
            variant_name: clip(&variant_name, 40),
            description: None,
        })?;
        if !cont {
            break;
        }
    }
    Ok(())
}

fn read_incidb_rows<R: Read>(
    reader: R,
    brands: &HashMap<String, String>,
    insert_row: &mut impl FnMut(CatalogRow) -> AppResult<bool>,
) -> AppResult<()> {
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(b'|')
        .flexible(true)
        .from_reader(reader);
    let headers = rdr
        .headers()
        .map_err(|e| AppError::tech("تعذر قراءة ترويسة INCIDB.", e.to_string()))?
        .clone();
    let idx = |name: &str| headers.iter().position(|h| h.eq_ignore_ascii_case(name));
    let i_id = idx("product_id");
    let i_brand = idx("brand_id");
    let i_barcode = idx("barcode_ean");
    let i_name = idx("name");
    let i_cat = idx("category");
    let i_price = idx("retail_price_usd");
    let i_ing = idx("raw_ingredient_text");

    for rec in rdr.records() {
        let rec = rec.map_err(|e| AppError::tech("تعذر قراءة صف INCIDB.", e.to_string()))?;
        let get = |i: Option<usize>| {
            i.and_then(|p| rec.get(p))
                .unwrap_or("")
                .trim()
                .to_string()
        };
        let name = get(i_name);
        if name.is_empty() {
            continue;
        }
        let product_id = get(i_id);
        let sku = if product_id.is_empty() {
            format!("INCIDB-{}", mix64(&name))
        } else {
            format!("INCIDB-{product_id}")
        };
        let brand_id = get(i_brand);
        let brand = brands
            .get(&brand_id)
            .cloned()
            .or_else(|| {
                if brand_id.is_empty() {
                    None
                } else {
                    Some(format!("Brand {brand_id}"))
                }
            });
        let barcode = sanitize_barcode(&get(i_barcode));
        let retail = parse_usd(&get(i_price)).unwrap_or_else(|| fallback_price(&sku, &name));
        let desc = get(i_ing);
        let cont = insert_row(CatalogRow {
            sku,
            name: clip(&name, 180),
            brand,
            category: get(i_cat),
            barcode,
            retail,
            variant_name: String::new(),
            description: if desc.is_empty() {
                None
            } else {
                Some(clip(&desc, 2000))
            },
        })?;
        if !cont {
            break;
        }
    }
    Ok(())
}

fn download_obf_dump() -> AppResult<PathBuf> {
    let dir = paths::data_dir().join("imports");
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join("openbeautyfacts.products.csv.gz");
    if dest.exists() && paths::file_size(&dest) > 5_000_000 {
        return Ok(dest);
    }
    let tmp = dest.with_extension("csv.gz.part");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(300))
        .user_agent(USER_AGENT)
        .build();
    let resp = agent
        .get(OBF_DUMP_URL)
        .call()
        .map_err(|e| AppError::user(format!("تعذر تنزيل الكتالوج: {e}")))?;
    let mut reader = resp.into_reader();
    let mut file = File::create(&tmp)?;
    std::io::copy(&mut reader, &mut file)
        .map_err(|e| AppError::tech("تعذر حفظ ملف الكتالوج.", e.to_string()))?;
    file.sync_all()?;
    drop(file);
    if let Err(e) = std::fs::rename(&tmp, &dest) {
        let _ = std::fs::copy(&tmp, &dest);
        let _ = std::fs::remove_file(&tmp);
        if !dest.exists() {
            return Err(AppError::tech("تعذر حفظ ملف الكتالوج.", e.to_string()));
        }
    }
    if paths::file_size(&dest) < 1_000_000 {
        let _ = std::fs::remove_file(&dest);
        return Err(AppError::user("تنزيل الكتالوج غير مكتمل. أعد المحاولة."));
    }
    Ok(dest)
}

fn detect_format(path: &Path) -> AppResult<CatalogFormat> {
    let mut f = File::open(path)?;
    let mut magic = [0u8; 2];
    let n = f.read(&mut magic)?;
    if n >= 2 && magic[0] == 0x1f && magic[1] == 0x8b {
        return Ok(CatalogFormat::ObfGzip);
    }
    let mut rest = String::new();
    let mut buf = BufReader::new(f);
    buf.read_line(&mut rest)?;
    let head = format!("{}{}", String::from_utf8_lossy(&magic), rest);
    if head.contains("brand_id") && !head.contains("product_id") {
        return Err(AppError::user("اختر ملف products.csv وليس brands.csv."));
    }
    if head.contains("product_id") && (head.contains('|') || head.contains("barcode_ean")) {
        Ok(CatalogFormat::IncidbPipe)
    } else {
        Ok(CatalogFormat::ObfTsv)
    }
}

fn load_incidb_brand_names(products_path: &Path) -> HashMap<String, String> {
    let Some(dir) = products_path.parent() else {
        return HashMap::new();
    };
    let path = dir.join("brands.csv");
    let Ok(file) = File::open(path) else {
        return HashMap::new();
    };
    let mut map = HashMap::new();
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(b'|')
        .flexible(true)
        .from_reader(file);
    for rec in rdr.records().flatten() {
        let id = rec.get(0).unwrap_or("").trim();
        let name = rec.get(1).unwrap_or("").trim();
        if !id.is_empty() && !name.is_empty() && id != "brand_id" {
            map.insert(id.to_string(), name.to_string());
        }
    }
    map
}

fn upsert_brand(
    tx: &Transaction,
    cache: &mut HashMap<String, i64>,
    name: &str,
    now: &str,
) -> AppResult<Option<i64>> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    let name = clip(name, 120);
    let key = name.to_lowercase();
    if let Some(id) = cache.get(&key) {
        return Ok(Some(*id));
    }
    if let Some(id) = tx
        .query_row(
            "SELECT id FROM brands WHERE name = ?1 COLLATE NOCASE",
            params![name],
            |r| r.get::<_, i64>(0),
        )
        .optional()?
    {
        cache.insert(key, id);
        return Ok(Some(id));
    }
    tx.execute(
        "INSERT INTO brands(name,is_active,created_at,updated_at) VALUES(?1,1,?2,?2)",
        params![name, now],
    )?;
    let id = tx.last_insert_rowid();
    cache.insert(key, id);
    Ok(Some(id))
}

fn map_category(raw: &str) -> i64 {
    let l = raw.to_ascii_lowercase();
    if l.contains("shampoo") {
        10
    } else if l.contains("hair-color")
        || l.contains("hair colour")
        || l.contains("hair-colour")
        || l.contains("dye")
        || l.contains("coloration")
    {
        4
    } else if l.contains("hair") || l.contains("conditioner") {
        3
    } else if l.contains("nail") {
        7
    } else if l.contains("perfume")
        || l.contains("fragrance")
        || l.contains("eau-de")
        || l.contains("eau de")
    {
        6
    } else if l.contains("makeup")
        || l.contains("make-up")
        || l.contains("lipstick")
        || l.contains("mascara")
        || l.contains("foundation")
        || l.contains("eyeshadow")
    {
        1
    } else if l.contains("body") || l.contains("shower") || l.contains("bath") || l.contains("soap")
    {
        5
    } else if l.contains("skin")
        || l.contains("face")
        || l.contains("cream")
        || l.contains("serum")
        || l.contains("moistur")
        || l.contains("skincare")
    {
        2
    } else {
        11
    }
}

fn first_brand(raw: &str) -> Option<String> {
    let part = raw
        .split([',', ';'])
        .map(str::trim)
        .find(|s| !s.is_empty())?;
    Some(clip(part, 120))
}

fn sanitize_barcode(code: &str) -> Option<String> {
    let code: String = code.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if (8..=20).contains(&code.len()) {
        Some(code)
    } else {
        None
    }
}

fn parse_usd(s: &str) -> Option<i64> {
    let v: f64 = s.trim().parse().ok()?;
    if !v.is_finite() || v <= 0.0 {
        return None;
    }
    Some(((v * 50.0 * 100.0) as i64).clamp(500, 500_000))
}

fn fallback_price(sku: &str, name: &str) -> i64 {
    let h = mix64(&format!("{sku}|{name}"));
    7500 + ((h % 375) as i64) * 100
}

fn mix64(s: &str) -> u64 {
    let mut h = 14_695_981_039_346_656_037u64;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(1_099_511_628_211);
    }
    h
}

fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}
