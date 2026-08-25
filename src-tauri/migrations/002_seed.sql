-- Seed reference data (idempotent-safe inserts by fixed ids)

INSERT INTO roles (id, code, name_ar, name_en, is_system) VALUES
  (1, 'administrator', 'مدير النظام', 'Administrator', 1),
  (2, 'manager', 'مدير', 'Manager', 1),
  (3, 'cashier', 'كاشير', 'Cashier', 1),
  (4, 'warehouse_clerk', 'أمين مخزن', 'Warehouse Clerk', 1);

INSERT INTO permissions (id, code, name_ar) VALUES
  (1,  'sales.view', 'عرض المبيعات'),
  (2,  'sales.create', 'إنشاء بيع'),
  (3,  'sales.void', 'إلغاء فاتورة'),
  (4,  'sales.return', 'مرتجع بيع'),
  (5,  'sales.discount', 'تطبيق خصم'),
  (6,  'sales.reprint', 'إعادة طباعة'),
  (7,  'profit.view', 'عرض الربح'),
  (8,  'products.view', 'عرض المنتجات'),
  (9,  'products.edit', 'تعديل المنتجات'),
  (10, 'products.price', 'تعديل الأسعار'),
  (11, 'purchases.view', 'عرض المشتريات'),
  (12, 'purchases.receive', 'استلام مشتريات'),
  (13, 'stock.view', 'عرض المخزون'),
  (14, 'stock.adjust', 'تسوية المخزون'),
  (15, 'stock.count', 'جرد المخزون'),
  (16, 'transfers.view', 'عرض التحويلات'),
  (17, 'transfers.request', 'طلب تحويل'),
  (18, 'transfers.approve', 'اعتماد تحويل'),
  (19, 'transfers.dispatch', 'صرف تحويل'),
  (20, 'transfers.receive', 'استلام تحويل'),
  (21, 'reports.view', 'عرض التقارير'),
  (22, 'backup.create', 'نسخ احتياطي'),
  (23, 'backup.restore', 'استعادة نسخة'),
  (24, 'users.manage', 'إدارة المستخدمين'),
  (25, 'settings.manage', 'إدارة الإعدادات'),
  (26, 'expenses.manage', 'إدارة المصروفات'),
  (27, 'customers.manage', 'إدارة العملاء'),
  (28, 'suppliers.manage', 'إدارة الموردين');

-- administrator: all
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions;

-- manager: all except restore + users
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 2, id FROM permissions WHERE code NOT IN ('backup.restore', 'users.manage');

-- cashier
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 3, id FROM permissions WHERE code IN (
    'sales.view','sales.create','sales.return','sales.discount','sales.reprint',
    'products.view','stock.view','transfers.view','transfers.request','transfers.receive',
    'customers.manage'
  );

-- warehouse clerk
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 4, id FROM permissions WHERE code IN (
    'products.view','purchases.view','purchases.receive',
    'stock.view','stock.adjust','stock.count',
    'transfers.view','transfers.approve','transfers.dispatch','transfers.receive',
    'suppliers.manage'
  );

INSERT INTO units (id, name_ar, name_en) VALUES
  (1, 'قطعة', 'Piece'),
  (2, 'علبة', 'Box'),
  (3, 'زجاجة', 'Bottle'),
  (4, 'طقم', 'Set');

INSERT INTO categories (id, parent_id, name_ar, name_en, sort_order, is_active, created_at, updated_at) VALUES
  (1, NULL, 'مكياج', 'Makeup', 1, 1, datetime('now'), datetime('now')),
  (2, NULL, 'عناية بالبشرة', 'Skincare', 2, 1, datetime('now'), datetime('now')),
  (3, NULL, 'عناية بالشعر', 'Hair Care', 3, 1, datetime('now'), datetime('now')),
  (4, NULL, 'صبغات شعر', 'Hair Color', 4, 1, datetime('now'), datetime('now')),
  (5, NULL, 'عناية بالجسم', 'Body Care', 5, 1, datetime('now'), datetime('now')),
  (6, NULL, 'عطور', 'Fragrance', 6, 1, datetime('now'), datetime('now')),
  (7, NULL, 'عناية بالأظافر', 'Nail Care', 7, 1, datetime('now'), datetime('now')),
  (8, NULL, 'عناية شخصية', 'Personal Care', 8, 1, datetime('now'), datetime('now')),
  (9, NULL, 'اكسسوارات', 'Accessories', 9, 1, datetime('now'), datetime('now')),
  (10, NULL, 'شامبوهات', 'Shampoo', 10, 1, datetime('now'), datetime('now')),
  (11, NULL, 'أخرى', 'Other', 99, 1, datetime('now'), datetime('now'));

INSERT INTO payment_methods (id, code, name_ar, name_en, is_cash, is_active, sort_order) VALUES
  (1, 'cash', 'نقدي', 'Cash', 1, 1, 1),
  (2, 'bank_card', 'بطاقة بنكية', 'Bank card', 0, 1, 2),
  (3, 'transfer', 'تحويل', 'Transfer', 0, 1, 3);

INSERT INTO expense_categories (id, name_ar, name_en) VALUES
  (1, 'إيجار', 'Rent'),
  (2, 'كهرباء', 'Electricity'),
  (3, 'رواتب', 'Salaries'),
  (4, 'مواصلات', 'Transportation'),
  (5, 'صيانة', 'Maintenance'),
  (6, 'تغليف', 'Packaging'),
  (7, 'تسويق', 'Marketing'),
  (8, 'متنوعة', 'Miscellaneous');

INSERT INTO sequences (name, prefix, next_value, pad) VALUES
  ('sale', 'COS', 1, 6),
  ('purchase', 'PUR', 1, 6),
  ('return', 'RET', 1, 6),
  ('transfer', 'TRF', 1, 6);

INSERT INTO settings (key, value) VALUES
  ('currency.code', 'EGP'),
  ('currency.symbol', 'ج.م'),
  ('currency.decimals', '2'),
  ('tax.enabled', '0'),
  ('tax.rate_bps', '1400'),
  ('tax.inclusive', '1'),
  ('inventory.negative_stock', '0'),
  ('inventory.fefo', '1'),
  ('inventory.expiry_warning_days', '90'),
  ('inventory.no_expiry_policy', 'after_dated'),
  ('inventory.return_restock', 'original_batch'),
  ('pos.auto_print', '1'),
  ('pos.receipt_width', '80'),
  ('pos.copies', '1'),
  ('pos.cashier_discount_bps', '500'),
  ('pos.manager_discount_bps', '2000'),
  ('loyalty.enabled', '0'),
  ('loyalty.points_per_100', '1'),
  ('loyalty.min_redeem', '100'),
  ('loyalty.point_value', '1'),
  ('backup.auto_on_close', '1'),
  ('backup.retention', '14'),
  ('security.lock_minutes', '10'),
  ('security.pin_length', '4'),
  ('invoice.prefix', 'COS'),
  ('invoice.footer', 'شكراً لزيارتكم'),
  ('slow_moving.days', '60'),
  ('app.initialized', '0'),
  ('app.demo_data', '0'),
  ('ui.theme', 'light');
