use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::os::windows::ffi::OsStrExt;
use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    CreateDCW, CreateFontW, DeleteDC, DeleteObject, GetDeviceCaps, SelectObject, SetBkMode,
    TextOutW, ANTIALIASED_QUALITY, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_PITCH, FW_NORMAL,
    HORZRES, LOGPIXELSY, OUT_TT_PRECIS, TRANSPARENT, HDC,
};
use windows::Win32::Graphics::Printing::{
    EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
};

#[repr(C)]
struct DocInfoW {
    cb_size: i32,
    doc_name: *const u16,
    output: *const u16,
    datatype: *const u16,
    fw_type: u32,
}

#[link(name = "gdi32")]
extern "system" {
    fn StartDocW(hdc: HDC, info: *const DocInfoW) -> i32;
    fn StartPage(hdc: HDC) -> i32;
    fn EndPage(hdc: HDC) -> i32;
    fn EndDoc(hdc: HDC) -> i32;
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

fn to_wide(s: &str) -> Vec<u16> {
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

pub fn list_printers() -> AppResult<Vec<PrinterInfo>> {
    unsafe {
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let _ = EnumPrintersW(flags, PCWSTR::null(), 2, None, &mut needed, &mut returned);
        if needed == 0 {
            return Ok(Vec::new());
        }
        let mut buf = vec![0u8; needed as usize];
        if EnumPrintersW(
            flags,
            PCWSTR::null(),
            2,
            Some(buf.as_mut_slice()),
            &mut needed,
            &mut returned,
        )
        .is_err()
        {
            return Ok(Vec::new());
        }
        let slice = std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_2W, returned as usize);
        let mut out = Vec::new();
        for p in slice {
            if p.pPrinterName.is_null() {
                continue;
            }
            let name = p.pPrinterName.to_string().unwrap_or_default();
            if !name.is_empty() {
                out.push(PrinterInfo {
                    name,
                    is_default: false,
                });
            }
        }
        Ok(out)
    }
}

#[derive(Debug, Clone)]
pub struct ReceiptData {
    pub store_name: String,
    pub address: String,
    pub phone: String,
    pub tax_number: String,
    pub invoice_number: String,
    pub datetime: String,
    pub cashier: String,
    pub customer: String,
    pub lines: Vec<ReceiptLine>,
    pub subtotal: String,
    pub discount: String,
    pub tax: String,
    pub total: String,
    pub payment: String,
    pub footer: String,
}

#[derive(Debug, Clone)]
pub struct ReceiptLine {
    pub name: String,
    pub qty: String,
    pub price: String,
}

pub fn print_receipt_silent(printer_name: &str, receipt: &ReceiptData) -> AppResult<()> {
    if printer_name.trim().is_empty() {
        return Err(AppError::user("لم يتم اختيار طابعة الفواتير."));
    }
    let name = printer_name.to_string();
    let data = receipt.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("print-worker".into())
        .spawn(move || {
            let result = unsafe {
                let printer_w = to_wide(&name);
                print_with_dc(PCWSTR(printer_w.as_ptr()), &data)
            };
            let _ = tx.send(result);
        })
        .map_err(|_| AppError::user("تعذر بدء عملية الطباعة."))?;
    match rx.recv_timeout(std::time::Duration::from_secs(15)) {
        Ok(result) => {
            if let Err(ref e) = result {
                tracing::warn!(
                    printer = printer_name,
                    invoice = %receipt.invoice_number,
                    details = %e.details,
                    "print failed — sale is already saved; user can reprint"
                );
            }
            result
        }
        Err(_) => {
            tracing::error!(
                printer = printer_name,
                invoice = %receipt.invoice_number,
                "print timed out after 15s — spooler may be stuck"
            );
            Err(AppError::user(
                "انتهت مهلة الطباعة. تحقق من الطابعة ثم أعد الطباعة من شاشة الفواتير.",
            ))
        }
    }
}

/// Try printing but never propagate failures — sale must not be affected.
/// Returns true if print succeeded.
pub fn try_print_receipt(printer_name: &str, receipt: &ReceiptData) -> bool {
    match print_receipt_silent(printer_name, receipt) {
        Ok(()) => true,
        Err(e) => {
            tracing::warn!(
                printer = printer_name,
                invoice = %receipt.invoice_number,
                error = %e.user_message,
                "print attempt failed silently"
            );
            false
        }
    }
}

unsafe fn print_with_dc(printer: PCWSTR, receipt: &ReceiptData) -> AppResult<()> {
    let hdc = CreateDCW(windows::core::w!("WINSPOOL"), printer, PCWSTR::null(), None);
    if hdc.is_invalid() {
        return Err(AppError::user(
            "تعذر فتح الطابعة. تحقق من اتصال الطابعة ثم أعد الطباعة.",
        ));
    }
    let mut doc_name = to_wide("WATEEN POS Receipt");
    let info = DocInfoW {
        cb_size: std::mem::size_of::<DocInfoW>() as i32,
        doc_name: doc_name.as_mut_ptr(),
        output: std::ptr::null(),
        datatype: std::ptr::null(),
        fw_type: 0,
    };
    if StartDocW(hdc, &info) <= 0 {
        let _ = DeleteDC(hdc);
        return Err(AppError::user("تعذر بدء الطباعة. أعد المحاولة."));
    }
    if StartPage(hdc) <= 0 {
        let _ = EndDoc(hdc);
        let _ = DeleteDC(hdc);
        return Err(AppError::user("تعذر طباعة الصفحة."));
    }

    let dpi = GetDeviceCaps(hdc, LOGPIXELSY);
    let width = GetDeviceCaps(hdc, HORZRES);
    let font_h = (dpi * 11) / 72;
    let font = CreateFontW(
        font_h,
        0,
        0,
        0,
        FW_NORMAL.0 as i32,
        0,
        0,
        0,
        DEFAULT_CHARSET.0 as u32,
        OUT_TT_PRECIS.0 as u32,
        CLIP_DEFAULT_PRECIS.0 as u32,
        ANTIALIASED_QUALITY.0 as u32,
        DEFAULT_PITCH.0 as u32,
        windows::core::w!("Tahoma"),
    );
    let old = SelectObject(hdc, font);
    let _ = SetBkMode(hdc, TRANSPARENT);

    let mut y = dpi / 8;
    let line_h = font_h + dpi / 18;
    let mut lines: Vec<String> = vec![
        receipt.store_name.clone(),
        receipt.address.clone(),
        receipt.phone.clone(),
    ];
    if !receipt.tax_number.is_empty() {
        lines.push(format!("ضريبي: {}", receipt.tax_number));
    }
    lines.push("------------------------------".into());
    lines.push(format!("فاتورة {}", receipt.invoice_number));
    lines.push(receipt.datetime.clone());
    lines.push(format!("الكاشير: {}", receipt.cashier));
    if !receipt.customer.is_empty() {
        lines.push(format!("العميل: {}", receipt.customer));
    }
    lines.push("------------------------------".into());
    for l in &receipt.lines {
        lines.push(format!("{}  {}  {}", l.name, l.qty, l.price));
    }
    lines.push("------------------------------".into());
    lines.push(format!("المجموع: {}", receipt.subtotal));
    if receipt.discount != "0.00" && !receipt.discount.is_empty() {
        lines.push(format!("الخصم: {}", receipt.discount));
    }
    if receipt.tax != "0.00" && !receipt.tax.is_empty() {
        lines.push(format!("الضريبة: {}", receipt.tax));
    }
    lines.push(format!("الإجمالي: {}", receipt.total));
    lines.push(format!("الدفع: {}", receipt.payment));
    lines.push("------------------------------".into());
    lines.push(receipt.footer.clone());

    let margin = dpi / 10;
    for text in lines.into_iter().filter(|s| !s.trim().is_empty()) {
        let wide = to_wide(&text);
        let _ = TextOutW(
            hdc,
            (width - margin - dpi).max(0),
            y,
            &wide[..wide.len().saturating_sub(1)],
        );
        y += line_h;
    }

    let _ = SelectObject(hdc, old);
    if !font.is_invalid() {
        let _ = DeleteObject(font);
    }
    let _ = EndPage(hdc);
    let _ = EndDoc(hdc);
    let _ = DeleteDC(hdc);
    Ok(())
}
