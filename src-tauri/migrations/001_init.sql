-- Cosmetics POS initial schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  avatar_color TEXT NOT NULL DEFAULT '#9B2C4D',
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE locations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  type TEXT NOT NULL CHECK (type IN ('store', 'warehouse', 'transit')),
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE units (
  id INTEGER PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku TEXT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  brand_id INTEGER REFERENCES brands(id),
  category_id INTEGER REFERENCES categories(id),
  product_type TEXT,
  unit_id INTEGER REFERENCES units(id),
  purchase_cost INTEGER NOT NULL DEFAULT 0,
  retail_price INTEGER NOT NULL DEFAULT 0,
  wholesale_price INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  image_path TEXT,
  tax_rate_bps INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL DEFAULT '',
  sku TEXT,
  color_code TEXT,
  size TEXT,
  unit_id INTEGER REFERENCES units(id),
  retail_price INTEGER,
  wholesale_price INTEGER,
  purchase_cost INTEGER,
  image_path TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE barcodes (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  code TEXT NOT NULL COLLATE NOCASE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  UNIQUE (code)
);

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  phone_alt TEXT,
  address TEXT,
  tax_number TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  account_balance INTEGER NOT NULL DEFAULT 0,
  is_walk_in INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE batches (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  batch_number TEXT NOT NULL,
  production_date TEXT,
  expiration_date TEXT,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  qty_received INTEGER NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id),
  purchase_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE stock (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (variant_id, batch_id, location_id)
);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  batch_id INTEGER REFERENCES batches(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  quantity_delta INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  user_id INTEGER REFERENCES users(id),
  reason TEXT,
  unit_cost INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE sequences (
  name TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  next_value INTEGER NOT NULL,
  pad INTEGER NOT NULL DEFAULT 6
);

CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_cash INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_invoice_no TEXT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'received', 'cancelled')),
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL DEFAULT 0,
  paid_total INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  batch_id INTEGER REFERENCES batches(id),
  batch_number TEXT,
  expiration_date TEXT,
  quantity INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL
);

CREATE TABLE supplier_transactions (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  occurred_at TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  notes TEXT,
  user_id INTEGER REFERENCES users(id)
);

CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('completed', 'voided')),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  cash_session_id INTEGER,
  subtotal INTEGER NOT NULL,
  item_discount_total INTEGER NOT NULL DEFAULT 0,
  invoice_discount INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL,
  cost_total INTEGER NOT NULL DEFAULT 0,
  paid_total INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  void_reason TEXT,
  voided_by INTEGER REFERENCES users(id),
  voided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  product_name TEXT NOT NULL,
  variant_name TEXT,
  sku TEXT,
  barcode TEXT,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,
  line_cost INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sale_item_batches (
  id INTEGER PRIMARY KEY,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  quantity INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL
);

CREATE TABLE sale_payments (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE returns (
  id INTEGER PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  sale_id INTEGER REFERENCES sales(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  cash_session_id INTEGER,
  restock_policy TEXT NOT NULL DEFAULT 'original_batch',
  refund_total INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE return_items (
  id INTEGER PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id INTEGER REFERENCES sale_items(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  batch_id INTEGER REFERENCES batches(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  refund_amount INTEGER NOT NULL
);

CREATE TABLE transfers (
  id INTEGER PRIMARY KEY,
  transfer_number TEXT NOT NULL UNIQUE,
  from_location_id INTEGER NOT NULL REFERENCES locations(id),
  to_location_id INTEGER NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL CHECK (status IN (
    'draft', 'requested', 'approved', 'preparing', 'dispatched', 'received', 'rejected', 'cancelled'
  )),
  requested_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  dispatched_by INTEGER REFERENCES users(id),
  received_by INTEGER REFERENCES users(id),
  reject_reason TEXT,
  notes TEXT,
  requested_at TEXT,
  approved_at TEXT,
  dispatched_at TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE transfer_items (
  id INTEGER PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES transfers(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  batch_id INTEGER REFERENCES batches(id),
  quantity INTEGER NOT NULL,
  received_quantity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE customer_transactions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  occurred_at TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  points_delta INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  notes TEXT,
  user_id INTEGER REFERENCES users(id)
);

CREATE TABLE loyalty_transactions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  occurred_at TEXT NOT NULL,
  points_delta INTEGER NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id INTEGER
);

CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  amount INTEGER NOT NULL,
  expense_date TEXT NOT NULL,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  description TEXT,
  attachment_path TEXT,
  user_id INTEGER REFERENCES users(id),
  cash_session_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE cash_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  opening_cash INTEGER NOT NULL DEFAULT 0,
  closing_cash_actual INTEGER,
  expected_cash INTEGER,
  difference INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  notes TEXT
);

CREATE TABLE cash_movements (
  id INTEGER PRIMARY KEY,
  cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
  occurred_at TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  user_id INTEGER REFERENCES users(id)
);

CREATE TABLE promotions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  percent_bps INTEGER,
  fixed_amount INTEGER,
  buy_qty INTEGER,
  get_qty INTEGER,
  min_invoice INTEGER,
  category_id INTEGER REFERENCES categories(id),
  brand_id INTEGER REFERENCES brands(id),
  product_id INTEGER REFERENCES products(id),
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  is_valid INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  old_price INTEGER NOT NULL,
  new_price INTEGER NOT NULL,
  reason TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE held_invoices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  customer_id INTEGER REFERENCES customers(id),
  invoice_discount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE held_invoice_items (
  id INTEGER PRIMARY KEY,
  held_invoice_id INTEGER NOT NULL REFERENCES held_invoices(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stocktakes (
  id INTEGER PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
  user_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE stocktake_items (
  id INTEGER PRIMARY KEY,
  stocktake_id INTEGER NOT NULL REFERENCES stocktakes(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  batch_id INTEGER REFERENCES batches(id),
  system_qty INTEGER NOT NULL,
  counted_qty INTEGER,
  difference INTEGER
);

CREATE INDEX idx_products_name_ar ON products(name_ar);
CREATE INDEX idx_products_name_en ON products(name_en);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_barcodes_code ON barcodes(code);
CREATE INDEX idx_barcodes_variant ON barcodes(variant_id);
CREATE INDEX idx_stock_variant_location ON stock(variant_id, location_id);
CREATE INDEX idx_stock_batch ON stock(batch_id);
CREATE INDEX idx_batches_variant ON batches(variant_id);
CREATE INDEX idx_batches_exp ON batches(expiration_date);
CREATE INDEX idx_movements_variant ON stock_movements(variant_id, occurred_at);
CREATE INDEX idx_movements_ref ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_sales_created ON sales(created_at);
CREATE INDEX idx_sales_number ON sales(invoice_number);
CREATE INDEX idx_sales_user ON sales(user_id, created_at);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id, invoice_date);
CREATE INDEX idx_transfers_status ON transfers(status);
CREATE INDEX idx_customers_mobile ON customers(mobile);
CREATE INDEX idx_audit_time ON audit_logs(occurred_at);
CREATE INDEX idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
