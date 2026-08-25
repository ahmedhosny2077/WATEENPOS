use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub struct AppError {
    pub user_message: String,
    pub details: String,
    pub error_id: String,
}

impl AppError {
    pub fn user(msg: impl Into<String>) -> Self {
        Self {
            user_message: msg.into(),
            details: String::new(),
            error_id: short_id(),
        }
    }

    pub fn tech(user: impl Into<String>, details: impl Into<String>) -> Self {
        let error_id = short_id();
        let details = details.into();
        tracing::error!(error_id = %error_id, details = %details, "app error");
        Self {
            user_message: user.into(),
            details,
            error_id,
        }
    }
}

fn short_id() -> String {
    uuid::Uuid::new_v4().to_string()[..8].to_string()
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.user_message)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.user_message)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        let msg = e.to_string();
        if msg.contains("database is locked") || msg.contains("database is busy") {
            tracing::warn!(details = %msg, "database locked");
            return Self::user("قاعدة البيانات مشغولة. أعد المحاولة.");
        }
        if msg.contains("UNIQUE constraint failed: brands.name") {
            return Self::user("الماركة موجودة مسبقاً.");
        }
        if msg.contains("UNIQUE constraint failed: barcodes.code") {
            return Self::user("الباركود مستخدم بالفعل في منتج آخر.");
        }
        if msg.contains("UNIQUE constraint failed: sales.invoice_number")
            || msg.contains("UNIQUE constraint failed: purchases.invoice_number")
        {
            return Self::user("رقم الفاتورة مكرر. أعد المحاولة.");
        }
        if msg.contains("UNIQUE constraint failed: returns.return_number")
            || msg.contains("UNIQUE constraint failed: transfers.transfer_number")
        {
            return Self::user("الرقم التسلسلي مكرر. أعد المحاولة.");
        }
        if msg.contains("FOREIGN KEY") {
            return Self::user("لا يمكن إتمام العملية لأن السجل مرتبط ببيانات أخرى.");
        }
        if msg.contains("disk I/O error") || msg.contains("disk full") {
            tracing::error!(details = %msg, "disk I/O error");
            return Self::tech(
                "خطأ في القرص. تحقق من المساحة المتاحة أو سلامة القرص.",
                msg,
            );
        }
        if msg.contains("database or disk is full") {
            tracing::error!(details = %msg, "disk full");
            return Self::tech(
                "المساحة ممتلئة. وفّر مساحة في القرص ثم أعد المحاولة.",
                msg,
            );
        }
        Self::tech("حدث خطأ في قاعدة البيانات.", msg)
    }
}

impl From<r2d2::Error> for AppError {
    fn from(e: r2d2::Error) -> Self {
        Self::tech("تعذر الاتصال بقاعدة البيانات.", e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::tech("حدث خطأ في الملفات.", e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
