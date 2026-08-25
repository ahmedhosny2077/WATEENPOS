ALTER TABLE backups ADD COLUMN sha256 TEXT;
ALTER TABLE backups ADD COLUMN size_bytes INTEGER;
ALTER TABLE backups ADD COLUMN app_version TEXT;
ALTER TABLE backups ADD COLUMN slot TEXT;

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('backup.auto_on_start', '1'),
  ('backup.interval_minutes', '360'),
  ('backup.dir', ''),
  ('backup.keep_daily', '10'),
  ('backup.keep_weekly', '4'),
  ('backup.keep_monthly', '12'),
  ('backup.keep_emergency', '20'),
  ('backup.on_exit', '1'),
  ('backup.before_migrate', '1'),
  ('backup.last_success_at', ''),
  ('db.integrity_on_start', '1'),
  ('db.last_integrity_at', ''),
  ('db.last_quick_check_at', '');
