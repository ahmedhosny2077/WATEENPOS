# Database schema

Engine: SQLite 3, `PRAGMA foreign_keys=ON`, WAL, `busy_timeout=5000`.  
Migrations: numbered SQL in `src-tauri/migrations/`, applied in order, recorded in `schema_migrations`.  
Money columns: `INTEGER` piastres. Quantities: `INTEGER` units.

## ER overview

```
roles 1--* users
roles *--* permissions (role_permissions)
locations 1--* stock
products 1--* product_variants 1--* barcodes
product_variants 1--* batches 1--* stock
stock unique (variant_id, batch_id, location_id)
batches *--* stock_movements
sales 1--* sale_items 1--* sale_item_batches
purchases 1--* purchase_items → batches
transfers 1--* transfer_items
cash_sessions 1--* cash_movements
```

## Location types

| type       | cardinality                         |
|------------|-------------------------------------|
| store      | exactly one, `is_system=1`          |
| warehouse  | one or more, user-manageable        |
| transit    | one system row for in-flight stock  |

## Movement types

`purchase_receipt`, `transfer_out`, `transfer_in`, `transfer_transit_in`, `transfer_transit_out`, `sale`, `customer_return`, `supplier_return`, `adjustment_increase`, `adjustment_decrease`, `expired_disposal`, `opening_balance`, `correction`, `void_reversal`, `stocktake_adjustment`

## Sequences

`sequences` table allocates invoice numbers inside the same transaction as the document (`UPDATE … RETURNING`). Format `COS-2026-000001`.

## Integrity rules

- Historical sales/purchases/returns/movements/payments/audit logs are never physically deleted.
- Products, customers, suppliers, warehouses: soft deactivate (`is_active`).
- Completed sales are immutable; void/return are compensating documents.
- Sale that cannot deduct stock rolls back entirely.
