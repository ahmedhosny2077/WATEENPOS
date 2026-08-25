use crate::error::{AppError, AppResult};
use crate::util::{now_local, setting_i64};
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand::rngs::OsRng;
use rusqlite::Connection;

pub fn hash_pin(pin: &str) -> AppResult<String> {
    validate_pin_format(pin)?;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::tech("تعذر حفظ رمز الدخول.", e.to_string()))
}

pub fn verify_pin_hash(pin: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok()
}

pub fn validate_pin_format(pin: &str) -> AppResult<()> {
    if pin.len() < 4 || pin.len() > 8 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::user("رمز الدخول يجب أن يكون أرقاماً بين 4 و 8 خانات."));
    }
    Ok(())
}

pub fn find_user_by_pin(conn: &Connection, pin: &str) -> AppResult<Option<i64>> {
    let mut stmt = conn.prepare("SELECT id, pin_hash, is_active, pin_locked_until FROM users")?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, Option<String>>(3)?,
        ))
    })?;
    for row in rows {
        let (id, hash, active, locked) = row?;
        if active == 0 {
            continue;
        }
        if let Some(until) = locked {
            if until.as_str() > now_local().as_str() {
                continue;
            }
        }
        if verify_pin_hash(pin, &hash) {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

pub fn register_pin_failure(conn: &Connection, user_id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE users SET failed_pin_attempts = failed_pin_attempts + 1 WHERE id = ?1",
        [user_id],
    )?;
    let attempts: i64 = conn.query_row(
        "SELECT failed_pin_attempts FROM users WHERE id = ?1",
        [user_id],
        |r| r.get(0),
    )?;
    if attempts >= 5 {
        let until = chrono::Local::now() + chrono::Duration::seconds(30);
        conn.execute(
            "UPDATE users SET pin_locked_until = ?1 WHERE id = ?2",
            rusqlite::params![until.format("%Y-%m-%dT%H:%M:%S").to_string(), user_id],
        )?;
    }
    Ok(())
}

pub fn clear_pin_failures(conn: &Connection, user_id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE users SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = ?1",
        [user_id],
    )?;
    Ok(())
}

pub fn current_shift_user(conn: &Connection) -> AppResult<i64> {
    conn.query_row(
        "SELECT user_id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
        [],
        |r| r.get(0),
    )
    .map_err(|_| AppError::user("لا توجد وردية مفتوحة. افتح وردية للمتابعة."))
}

pub fn current_shift_id(conn: &Connection) -> AppResult<i64> {
    conn.query_row(
        "SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
        [],
        |r| r.get(0),
    )
    .map_err(|_| AppError::user("لا توجد وردية مفتوحة."))
}

pub fn user_has_permission(conn: &Connection, user_id: i64, perm: &str) -> AppResult<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users u
         JOIN role_permissions rp ON rp.role_id = u.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE u.id = ?1 AND p.code = ?2 AND u.is_active = 1",
        rusqlite::params![user_id, perm],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

pub fn require_permission(conn: &Connection, user_id: i64, perm: &str) -> AppResult<()> {
    if user_has_permission(conn, user_id, perm)? {
        Ok(())
    } else {
        Err(AppError::user("ليست لديك صلاحية لتنفيذ هذه العملية."))
    }
}

/// Use the shift user, or a manager PIN override when the cashier lacks permission.
pub fn actor_for(
    conn: &Connection,
    perm: &str,
    override_pin: Option<&str>,
) -> AppResult<i64> {
    let shift_user = current_shift_user(conn)?;
    if user_has_permission(conn, shift_user, perm)? {
        return Ok(shift_user);
    }
    let Some(pin) = override_pin else {
        return Err(AppError::user(
            "هذه العملية تحتاج موافقة مدير. أدخل رمز المدير.",
        ));
    };
    let Some(uid) = find_user_by_pin(conn, pin)? else {
        return Err(AppError::user("رمز الدخول غير صحيح."));
    };
    require_permission(conn, uid, perm)?;
    Ok(uid)
}

pub fn discount_limit_bps(conn: &Connection, user_id: i64) -> AppResult<i64> {
    let role: String = conn.query_row(
        "SELECT r.code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?1",
        [user_id],
        |r| r.get(0),
    )?;
    Ok(match role.as_str() {
        "administrator" => 10_000,
        "manager" => setting_i64(conn, "pos.manager_discount_bps", 2000),
        _ => setting_i64(conn, "pos.cashier_discount_bps", 500),
    })
}
