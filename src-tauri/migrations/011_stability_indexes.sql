-- Stability audit: additional indexes for reconciliation, performance, and data integrity.

-- Stock reconciliation queries need to SUM movements per (variant, batch, location)
CREATE INDEX IF NOT EXISTS idx_movements_variant_batch_loc
  ON stock_movements(variant_id, batch_id, location_id);

-- sale_items by variant — needed for product history and return-qty checks
CREATE INDEX IF NOT EXISTS idx_sale_items_variant
  ON sale_items(variant_id);

-- return_items by sale_item — needed for "already returned" checks at scale
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item
  ON return_items(sale_item_id);

-- cash_movements by session — speeds up drawer summaries
CREATE INDEX IF NOT EXISTS idx_cash_movements_session
  ON cash_movements(cash_session_id, type);

-- stock_movements by movement_type — used in transfer receive and reports
CREATE INDEX IF NOT EXISTS idx_movements_type
  ON stock_movements(movement_type);

-- batches covering FEFO sort (variant + expiration + id) for faster allocation
CREATE INDEX IF NOT EXISTS idx_batches_variant_exp
  ON batches(variant_id, expiration_date, id);

-- sale_item_batches by sale_item — used in void and return
CREATE INDEX IF NOT EXISTS idx_sib_sale_item
  ON sale_item_batches(sale_item_id);

-- backups table extended columns (if not yet present, handled by IF NOT EXISTS)
-- Add sha256, size_bytes, app_version, slot to backups for backup verification
-- (These columns may already exist from migration 004; safe to skip if so)
