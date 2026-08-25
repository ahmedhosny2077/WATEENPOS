UPDATE payment_methods SET is_active = 0
WHERE code IN ('visa', 'mastercard', 'other');

UPDATE payment_methods
SET name_ar = 'بطاقة بنكية', name_en = 'Bank card', is_active = 1, sort_order = 2
WHERE code = 'bank_card';

UPDATE payment_methods
SET is_active = 1, sort_order = 1
WHERE code = 'cash';

INSERT INTO payment_methods (code, name_ar, name_en, is_cash, is_active, sort_order)
SELECT 'transfer', 'تحويل', 'Transfer', 0, 1, 3
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE code = 'transfer');
