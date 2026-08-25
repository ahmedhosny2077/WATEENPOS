-- Speed up invoice history per customer (POS auto-created guests included).
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
