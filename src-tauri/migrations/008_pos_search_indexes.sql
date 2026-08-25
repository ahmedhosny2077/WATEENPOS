-- Indexes that POS search and barcode lookup actually use.
-- Existing UNIQUE(barcodes.code) already covers exact barcode scans.

CREATE INDEX IF NOT EXISTS idx_products_active_name ON products(is_active, name_ar);
CREATE INDEX IF NOT EXISTS idx_products_active_cat ON products(is_active, category_id);
CREATE INDEX IF NOT EXISTS idx_variants_active_product ON product_variants(is_active, product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku_nocase ON product_variants(sku COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_sku_nocase ON products(sku COLLATE NOCASE);
