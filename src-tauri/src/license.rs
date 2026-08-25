//! License check matching `license_manager.py` (PROGRAM_ID, alphabet, HMAC, epoch).
use crate::error::{AppError, AppResult};
use chrono::{Duration, Local, Months, NaiveDate};
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;

const PROGRAM_ID: &str = "4394bd0a";
const EMBEDDED_HMAC_SECRET_HEX: &str =
    "4fc09b5b779b79e08613e192e391027dfdada32f3911e43ac2afcba9efa8d895";
const ALPHABET: &str = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TRIAL_MONTHS: u32 = 4;
const LICENSE_FILE: &str = "license.dat";
const TRIAL_FILE: &str = ".trial_info";

type HmacSha256 = Hmac<Sha256>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub status: String,
    pub machine_id: String,
    pub days_remaining: i64,
    pub expiry: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_key: Option<String>,
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(exe) = exe_dir() {
        dirs.push(exe);
    }
    let data = crate::paths::data_dir();
    if !dirs.iter().any(|d| d == &data) {
        dirs.push(data);
    }
    dirs
}

fn first_existing(name: &str) -> Option<PathBuf> {
    for dir in candidate_dirs() {
        let path = dir.join(name);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn write_to_dirs(name: &str, contents: &str) -> Result<(), String> {
    let mut saved = false;
    let mut last_err = String::from("تعذر حفظ الملف");
    for dir in candidate_dirs() {
        let _ = std::fs::create_dir_all(&dir);
        match std::fs::write(dir.join(name), contents) {
            Ok(()) => saved = true,
            Err(e) => last_err = e.to_string(),
        }
    }
    if saved {
        Ok(())
    } else {
        Err(last_err)
    }
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    let cleaned: String = s.chars().filter(|c| !c.is_ascii_whitespace()).collect();
    if cleaned.len() % 2 != 0 {
        return Err("odd hex length".into());
    }
    (0..cleaned.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&cleaned[i..i + 2], 16).map_err(|_| "invalid hex".into())
        })
        .collect()
}

fn hex_encode_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn get_hmac_secret() -> Result<Vec<u8>, String> {
    for dir in candidate_dirs() {
        let key_file = dir.join("hmac_secret.key");
        if !key_file.exists() {
            continue;
        }
        let data = std::fs::read(&key_file).map_err(|e| e.to_string())?;
        let data = trim_bytes(&data);
        if data.len() == 32 {
            return Ok(data);
        }
        let text = String::from_utf8(data).map_err(|e| e.to_string())?;
        return hex_decode(text.trim());
    }
    hex_decode(EMBEDDED_HMAC_SECRET_HEX)
}

fn trim_bytes(data: &[u8]) -> Vec<u8> {
    let start = data
        .iter()
        .position(|b| !b.is_ascii_whitespace())
        .unwrap_or(data.len());
    let end = data
        .iter()
        .rposition(|b| !b.is_ascii_whitespace())
        .map(|i| i + 1)
        .unwrap_or(0);
    if start >= end {
        Vec::new()
    } else {
        data[start..end].to_vec()
    }
}

pub fn get_machine_id() -> String {
    let node = platform_node().unwrap_or_else(fallback_node);
    format!("{node:012X}")
}

fn fallback_node() -> u64 {
    let name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "UNKNOWN".into());
    let hash = Sha256::digest(name.as_bytes());
    let mut node = 0u64;
    for b in hash.iter().take(6) {
        node = (node << 8) | u64::from(*b);
    }
    node | (1 << 40)
}

#[cfg(windows)]
fn platform_node() -> Option<u64> {
    windows_node()
}

#[cfg(not(windows))]
fn platform_node() -> Option<u64> {
    None
}

#[cfg(windows)]
fn windows_node() -> Option<u64> {
    sequential_uuid_node().or_else(adapters_info_node)
}

/// Matches CPython `uuid.getnode()` on Windows: `UuidCreateSequential` then `.node`.
#[cfg(windows)]
fn sequential_uuid_node() -> Option<u64> {
    use windows::core::GUID;
    use windows::Win32::System::Rpc::UuidCreateSequential;

    unsafe {
        let mut guid = GUID::default();
        let status = UuidCreateSequential(&mut guid);
        // RPC_S_OK = 0, RPC_S_UUID_LOCAL_ONLY = 1824
        if status.0 != 0 && status.0 != 1824 {
            return None;
        }
        let n = guid.data4;
        let node = (u64::from(n[2]) << 40)
            | (u64::from(n[3]) << 32)
            | (u64::from(n[4]) << 24)
            | (u64::from(n[5]) << 16)
            | (u64::from(n[6]) << 8)
            | u64::from(n[7]);
        (node != 0).then_some(node)
    }
}

#[cfg(windows)]
fn adapters_info_node() -> Option<u64> {
    use windows::Win32::Foundation::ERROR_BUFFER_OVERFLOW;
    use windows::Win32::NetworkManagement::IpHelper::{GetAdaptersInfo, IP_ADAPTER_INFO};

    unsafe {
        let mut buflen: u32 = 0;
        let rc = GetAdaptersInfo(None, &mut buflen);
        if rc != ERROR_BUFFER_OVERFLOW.0 && rc != 0 {
            return None;
        }
        if buflen == 0 {
            return None;
        }
        let mut buf = vec![0u8; buflen as usize];
        let ptr = buf.as_mut_ptr().cast::<IP_ADAPTER_INFO>();
        let rc = GetAdaptersInfo(Some(ptr), &mut buflen);
        if rc != 0 {
            return None;
        }
        let mut current = ptr;
        while !current.is_null() {
            let adapter = &*current;
            if adapter.AddressLength > 0 {
                let n = (adapter.AddressLength as usize).min(adapter.Address.len());
                let mut node = 0u64;
                for i in 0..n {
                    node = (node << 8) | u64::from(adapter.Address[i]);
                }
                return Some(node);
            }
            current = adapter.Next;
        }
    }
    None
}

fn build_payload(program_id: &str, machine_id: &str, expiry_str: &str) -> Vec<u8> {
    let machine_hash = hex_encode_lower(&Sha256::digest(machine_id.as_bytes()));
    format!("{program_id}|{machine_hash}|{expiry_str}").into_bytes()
}

fn decode_expiry(days_val: u16) -> NaiveDate {
    NaiveDate::from_ymd_opt(2024, 1, 1).expect("epoch") + Duration::days(i64::from(days_val))
}

fn key_decode(key_str: &str) -> Result<(u16, Vec<u8>), String> {
    let clean: String = key_str.replace('-', "").to_uppercase();
    if clean.len() != 16 {
        return Err(format!("Expected 16 characters, got {}", clean.len()));
    }
    let base = ALPHABET.len() as u128;
    let mut num: u128 = 0;
    for ch in clean.chars() {
        let idx = ALPHABET
            .find(ch)
            .ok_or_else(|| "substring not found".to_string())?;
        num = num * base + idx as u128;
    }
    if num > u64::MAX as u128 {
        return Err("int too big to convert".into());
    }
    let raw = (num as u64).to_be_bytes();
    let expiry_days = u16::from_be_bytes([raw[0], raw[1]]);
    Ok((expiry_days, raw[2..].to_vec()))
}

fn hmac_tag(secret: &[u8], payload: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(secret).expect("hmac");
    mac.update(payload);
    mac.finalize().into_bytes()[..6].to_vec()
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut x = 0u8;
    for (l, r) in a.iter().zip(b.iter()) {
        x |= l ^ r;
    }
    x == 0
}

pub fn verify_short_license(
    license_key: &str,
    machine_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    let key = license_key.trim();
    if key.replace('-', "").len() != 16 {
        return Err("صيغة المفتاح غير صحيحة".into());
    }
    let (expiry_days, input_tag) = match key_decode(key) {
        Ok(v) => v,
        Err(e) => return Err(format!("خطأ في فك المفتاح: {e}")),
    };
    let expiry_date = decode_expiry(expiry_days);
    let expiry_str = expiry_date.format("%Y-%m-%d").to_string();
    let owned_mid;
    let machine_id = match machine_id {
        Some(m) => m,
        None => {
            owned_mid = get_machine_id();
            &owned_mid
        }
    };
    let secret = get_hmac_secret().map_err(|e| format!("خطأ في التحقق: {e}"))?;
    let payload = build_payload(PROGRAM_ID, machine_id, &expiry_str);
    let expected_tag = hmac_tag(&secret, &payload);
    if !ct_eq(&input_tag, &expected_tag) {
        return Err("المفتاح غير صالح لهذا الجهاز".into());
    }
    let today = Local::now().date_naive();
    if today > expiry_date {
        return Err("المفتاح منتهي الصلاحية".into());
    }
    let days_remaining = (expiry_date - today).num_days();
    Ok(serde_json::json!({
        "expiry": expiry_str,
        "days_remaining": days_remaining,
        "machine_id": machine_id,
    }))
}

fn save_license(text: &str) -> Result<(), String> {
    write_to_dirs(LICENSE_FILE, text.trim())
}

fn load_saved_license() -> Option<String> {
    let path = first_existing(LICENSE_FILE)?;
    let text = std::fs::read_to_string(path).ok()?;
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn init_trial() {
    if first_existing(TRIAL_FILE).is_some() {
        return;
    }
    let data = serde_json::json!({
        "start_date": Local::now().format("%Y-%m-%d").to_string(),
        "machine_id": get_machine_id(),
    });
    let _ = write_to_dirs(TRIAL_FILE, &data.to_string());
}

fn get_trial_info() -> Option<serde_json::Value> {
    let path = first_existing(TRIAL_FILE)?;
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn trial_end_date(start: NaiveDate) -> NaiveDate {
    start
        .checked_add_months(Months::new(TRIAL_MONTHS))
        .unwrap_or(start + Duration::days(120))
}

fn get_trial_status() -> (bool, i64) {
    init_trial();
    let Some(info) = get_trial_info() else {
        return (false, 0);
    };
    let Some(start_s) = info.get("start_date").and_then(|v| v.as_str()) else {
        return (false, 0);
    };
    let Ok(start) = NaiveDate::parse_from_str(start_s, "%Y-%m-%d") else {
        return (false, 0);
    };
    let remaining = (trial_end_date(start) - Local::now().date_naive()).num_days().max(0);
    (remaining > 0, remaining)
}

pub fn evaluate_license() -> LicenseStatus {
    let machine_id = get_machine_id();
    if let Some(saved) = load_saved_license() {
        if let Ok(result) = verify_short_license(&saved, Some(&machine_id)) {
            let expiry = result["expiry"].as_str().unwrap_or("").to_string();
            let days_remaining = result["days_remaining"].as_i64().unwrap_or(0);
            return LicenseStatus {
                status: "licensed".into(),
                machine_id,
                days_remaining,
                expiry: Some(expiry.clone()),
                message: format!("مُرخّص — ينتهي في {expiry}"),
                license_key: Some(saved),
            };
        }
    }
    let (active, days_remaining) = get_trial_status();
    if active {
        return LicenseStatus {
            status: "trial".into(),
            machine_id,
            days_remaining,
            expiry: None,
            message: format!("فترة تجريبية — متبقي {days_remaining} يوم"),
            license_key: None,
        };
    }
    LicenseStatus {
        status: "expired".into(),
        machine_id,
        days_remaining: 0,
        expiry: None,
        message: "انتهت الفترة التجريبية — يرجى تفعيل الترخيص".into(),
        license_key: None,
    }
}

pub fn activate(key: &str) -> AppResult<LicenseStatus> {
    let machine_id = get_machine_id();
    match verify_short_license(key, Some(&machine_id)) {
        Ok(_) => {
            save_license(key).map_err(|e| AppError::tech("تعذر حفظ ملف الترخيص.", e))?;
            Ok(evaluate_license())
        }
        Err(msg) => Err(AppError::user(msg)),
    }
}

#[tauri::command]
pub fn check_license() -> AppResult<LicenseStatus> {
    Ok(evaluate_license())
}

#[tauri::command]
pub fn activate_license(key: String) -> AppResult<LicenseStatus> {
    activate(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_key(expiry_days: u16, tag: &[u8]) -> String {
        let mut raw = [0u8; 8];
        raw[..2].copy_from_slice(&expiry_days.to_be_bytes());
        raw[2..].copy_from_slice(&tag[..6]);
        let mut num = u64::from_be_bytes(raw);
        let alphabet = ALPHABET.as_bytes();
        let mut chars = [0u8; 16];
        for i in (0..16).rev() {
            chars[i] = alphabet[(num % 32) as usize];
            num /= 32;
        }
        String::from_utf8(chars.to_vec()).unwrap()
    }

    fn make_key(machine: &str, expiry_days: u16) -> String {
        let expiry = decode_expiry(expiry_days).format("%Y-%m-%d").to_string();
        let secret = hex_decode(EMBEDDED_HMAC_SECRET_HEX).unwrap();
        let payload = build_payload(PROGRAM_ID, machine, &expiry);
        let tag = hmac_tag(&secret, &payload);
        encode_key(expiry_days, &tag)
    }

    #[test]
    fn decode_roundtrip() {
        let tag = vec![1, 2, 3, 4, 5, 6];
        let key = encode_key(10000, &tag);
        let (days, out) = key_decode(&key).unwrap();
        assert_eq!(days, 10000);
        assert_eq!(out, tag);
    }

    #[test]
    fn valid_key_for_machine() {
        let machine = "AABBCCDDEEFF";
        let key = make_key(machine, 20000);
        assert_eq!(key, "AAAE6JCUMHCC7KDH");
        let dashed = format!(
            "{}-{}-{}-{}",
            &key[0..4],
            &key[4..8],
            &key[8..12],
            &key[12..16]
        );
        let info = verify_short_license(&dashed, Some(machine)).unwrap();
        assert_eq!(info["machine_id"], machine);
        assert!(info["days_remaining"].as_i64().unwrap() > 0);
    }

    #[test]
    fn rejects_other_machine() {
        let key = make_key("AABBCCDDEEFF", 20000);
        let err = verify_short_license(&key, Some("001122334455")).unwrap_err();
        assert_eq!(err, "المفتاح غير صالح لهذا الجهاز");
    }

    #[test]
    fn rejects_expired_key() {
        let machine = "AABBCCDDEEFF";
        let key = make_key(machine, 0);
        let err = verify_short_license(&key, Some(machine)).unwrap_err();
        assert_eq!(err, "المفتاح منتهي الصلاحية");
    }

    #[test]
    fn rejects_bad_format() {
        let err = verify_short_license("ABC", Some("AABBCCDDEEFF")).unwrap_err();
        assert_eq!(err, "صيغة المفتاح غير صحيحة");
    }

}
