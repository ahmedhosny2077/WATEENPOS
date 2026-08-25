# Cosmetics POS — Architecture

**App:** Cosmetics POS `1.0.0`  
**Stack:** Tauri 2 · React 18 · TypeScript · Tailwind CSS · Rust · SQLite  
**Locale:** Arabic RTL first, English-ready i18n  
**Runtime:** Fully offline. No CDN, no cloud, no remote DB.

## Goals (priority order)

Reliability → offline → Windows compatibility → fast POS → data integrity → backup → Arabic UX → maintainable architecture → correct inventory → extensibility.

## Windows compatibility

- **Minimum OS:** Windows 10 version 1809+ (Tauri 2 + WebView2 Evergreen).
- **Installer:** NSIS. WebView2 handled via embedded bootstrapper; production releases should prefer the offline Evergreen installer when shipping to sites without internet during setup.
- **User data:** `%APPDATA%\CosmeticsPOS\` (never under Program Files).
- Uninstall keeps user data by default.
- No Python / Node / Java / Docker / server DB on the customer PC.

## Process model

```
UI (React)  --invoke-->  Tauri commands (Rust)
                              |-- validate + permissions
                              |-- SQLite transactions
                              |-- stock ledger / FEFO / money
                              '-- audit log
```

The frontend never executes SQL. Business rules live in Rust.

## Data directory

```
%APPDATA%\CosmeticsPOS\
  data.db            # production database (WAL)
  images\products\   # local product images
  backups\           # automatic backups
  logs\app.log       # rotated logs
```

## Money

All money is **integer piastres** (`i64`): `1 EGP = 100 piastres`.  
No floating-point for totals, tax, discounts, or profit.

## Inventory

Stock is never a single quantity column on the product.

`Product → Variant → Batch → Location → Quantity`

- Every product has at least one variant (a hidden default variant if the user did not define shades/sizes).
- Every change goes through `stock_movements` inside a DB transaction, then the `stock` balance row is updated in the same transaction.
- **FEFO:** sell earliest *valid* expiration first. Expired batches are not sold by default. Batches without expiry follow `inventory.no_expiry_policy` (`after_dated` default).
- Locations are rows (`store` | `warehouse` | `transit`). Exactly one store, created at first run and not user-deletable. Warehouses can be added later with zero schema changes.

## Transfers

States: `draft → requested → approved → preparing → dispatched → received` plus `rejected` / `cancelled`.

- Draft/request does **not** move stock.
- Dispatch: source location −qty, transit +qty.
- Receive: transit −qty, destination +qty.
- Cancel after dispatch reverses source.

## Identification (no login screen)

Employee picks name → enters PIN → opens a cash shift.  
That employee is the current user until shift close or auto-lock.

PINs are stored as Argon2id PHC strings. Sensitive actions re-prompt PIN (manager override allowed).

## Printing

Thermal receipts print **silently** from Rust via the Windows print spooler / GDI (`DrawTextW` for Arabic). No `window.print()` dialog. Printer failure never rolls back a completed sale.

## Backup / restore

- Manual + automatic (on close, daily, before migrate/import/restore).
- Restore: admin PIN → warn → backup current → validate → replace → integrity check → reload.
- Backups are SQLite vacuum copies plus metadata; restore validates schema version and `PRAGMA integrity_check`.

## Encryption at rest

The live SQLite file uses SQLCipher when the `sqlcipher` Cargo feature compiles on the build machine.  
The default Windows MSVC build uses bundled SQLite plus:

1. DB lives only under the user profile (not Program Files).
2. Automatic backups can be AES-256-GCM encrypted with a key protected by Windows DPAPI.
3. SQLCipher remains a supported feature flag for hardened builds.

## Valuation

Profit uses **actual batch cost** of the units sold (`sale_item_batches.unit_cost`). Reports label this as gross profit on batch cost. Net profit = gross − expenses in the period.

## Phases

See `docs/PROGRESS.md`. Schema: `docs/SCHEMA.md`.
