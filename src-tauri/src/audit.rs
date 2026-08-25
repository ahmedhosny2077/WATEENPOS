use crate::util::now_local;
use rusqlite::Connection;

pub fn log(
    conn: &Connection,
    user_id: Option<i64>,
    action: &str,
    entity: Option<&str>,
    entity_id: Option<i64>,
    summary: &str,
    old_value: Option<&str>,
    new_value: Option<&str>,
) {
    let _ = conn.execute(
        "INSERT INTO audit_logs(occurred_at, user_id, action, entity, entity_id, summary, old_value, new_value)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![
            now_local(),
            user_id,
            action,
            entity,
            entity_id,
            summary,
            old_value,
            new_value
        ],
    );
}
