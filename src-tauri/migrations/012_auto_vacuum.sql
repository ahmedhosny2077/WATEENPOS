-- Enable incremental auto-vacuum so free pages can be reclaimed periodically
-- without blocking the database for a full VACUUM.
-- Note: changing auto_vacuum requires a one-time VACUUM to take effect.
PRAGMA auto_vacuum=INCREMENTAL;
