MASTER_PROMPT.md
Cosmetics POS & Inventory Management System
Master Engineering Prompt — Egypt / Single Store + Main Warehouse / Offline-First
￼
1. ROLE
You are a Senior Software Architect, Product Designer, Full-Stack Engineer, Database Engineer, QA Engineer, and Windows Desktop Application Engineer.
Your task is to design and implement a professional Cosmetics Store Management System for a single retail cosmetics store with one attached warehouse.
This is a production application, not a demo, prototype, mockup, or tutorial.
The application must be reliable enough for daily commercial use in Egypt, including use on older and lower-spec Windows computers.
Do not simplify or omit important business rules.
Do not invent unnecessary enterprise features.
Prioritize:
	1.	Reliability
	2.	Offline operation
	3.	Windows compatibility
	4.	Fast POS operation
	5.	Data integrity
	6.	Easy backup and recovery
	7.	Simple Arabic-first UX
	8.	Maintainable architecture
	9.	Correct inventory accounting
	10.	Future extensibility
￼
2. PRODUCT DEFINITION
Application name:
Cosmetics POS
The system manages:
	●	One retail cosmetics store
	●	One attached/main warehouse
	●	Products
	●	Product variants/shades
	●	Batches
	●	Expiration dates
	●	Barcode
	●	Purchases
	●	Warehouse stock
	●	Store stock
	●	Transfers from warehouse to store
	●	Sales
	●	Returns
	●	Customers
	●	Suppliers
	●	Expenses
	●	Users and permissions
	●	Cash movements
	●	Reports
	●	Backup and restore
	●	Audit logs
	●	Printing
The system must work completely offline.
Internet must NOT be required for:
	●	Employee identification / shift start
	●	POS
	●	Product search
	●	Barcode scanning
	●	Sales
	●	Returns
	●	Inventory
	●	Purchases
	●	Transfers
	●	Customers
	●	Reports
	●	Printing
	●	Backup
	●	Restore
￼
3. TECHNOLOGY STACK
Use the following stack unless a documented technical reason requires a change.
Desktop
Tauri 2
Frontend
	●	React
	●	TypeScript
	●	Tailwind CSS
	●	Component-based architecture
	●	Arabic RTL first
	●	English-ready architecture
Backend / Native Layer
Rust
Rust is responsible for:
	●	Database access
	●	Business rules that should not be trusted to the UI
	●	Transactions
	●	Inventory operations
	●	Backup/restore
	●	File operations
	●	Printing integration where appropriate
	●	Secure local operations
Database
SQLite
Use SQLite as the local production database.
The database must support:
	●	Foreign keys
	●	Transactions
	●	WAL mode where appropriate
	●	Indexes
	●	Constraints
	●	Migration system
	●	Safe concurrent access
Do not use a remote database for the core application.
Do not require PostgreSQL, MySQL, SQL Server, or another server.
￼
4. WINDOWS COMPATIBILITY
The application is intended primarily for Windows computers in Egypt, including older machines.
The engineering goal is:
Maximum practical Windows compatibility.
Do not claim compatibility with every Windows version without testing.
Before final release:
	1.	Determine the minimum officially supported Windows version based on the exact Tauri/WebView2/runtime build.
	2.	Test the release installer on supported Windows versions.
	3.	Test on a low-spec machine.
	4.	Test on a machine with no internet.
	5.	Test installation with limited user privileges where practical.
	6.	Test upgrade without data loss.
	7.	Test uninstall/reinstall without accidental database loss.
	8.	Test printer installation and printing.
Avoid unnecessary modern OS-only APIs.
Do not require:
	●	Python
	●	Node.js
	●	Java
	●	Docker
	●	PostgreSQL
	●	Redis
	●	IIS
	●	Nginx
	●	Internet connection
	●	Cloud account
on the customer’s computer.
The installer must bundle or properly handle all required runtime dependencies.
WebView2 handling must be designed deliberately. Do not assume the customer has a suitable WebView2 runtime.
￼
5. OFFLINE-FIRST REQUIREMENT
Offline operation is a core architectural requirement.
The application must be fully usable without internet.
Never load application-critical assets from:
	●	CDN
	●	Google Fonts
	●	external JavaScript
	●	external CSS
	●	external APIs
All required UI assets must be packaged locally.
The application must not show broken UI because the internet is unavailable.
If an optional online feature is added in the future, it must fail gracefully and never block core POS functionality.
￼
6. STORE & WAREHOUSE MODEL
Single retail store. Do not implement a multi-branch architecture — there is exactly ONE store location, always.
Warehouses are different: the business currently has exactly one warehouse, but may add a second (or more) warehouse in the future without a rebuild.
Requirements:
	1.	Locations must be a real entity/table (id, name, type: store/warehouse, active status) — never hardcoded constants like "store" and "warehouse".
	2.	Stock, stock movements, transfers, and reports must always reference a location_id, never assume there is only one warehouse row.
	3.	Provide a "Manage Warehouses" screen (Settings) to add, rename, or deactivate a warehouse. Adding a warehouse must require zero schema/architecture changes.
	4.	The store location itself is NOT user-manageable — it is fixed and created once at first run.
	5.	V1 UI may present things simply (a single "Warehouse" view) as long as the underlying model already supports more than one.
	6.	Transfers must support any warehouse → store, store → warehouse, and (once a second warehouse exists) warehouse → warehouse movement, using the same generic transfer workflow.
The system must clearly distinguish, per location:
Warehouse Stock (per warehouse)
and
Store Stock
￼
7. CORE INVENTORY MODEL
Inventory must NOT be represented only as one quantity field.
The inventory model must support:
Product → Variant → Batch → Location → Quantity
Example:
Product: Maybelline Fit Me Foundation
Variants:
	●	Shade 110
	●	Shade 115
	●	Shade 120
Batches:
	●	Batch A
	●	Batch B
Locations:
	●	Warehouse
	●	Store
The system must calculate available stock correctly.
￼
8. PRODUCTS
Each product may contain:
	●	Internal ID
	●	SKU
	●	Barcode
	●	Product name Arabic
	●	Product name English
	●	Brand
	●	Category
	●	Subcategory
	●	Product type
	●	Unit
	●	Purchase cost
	●	Retail price
	●	Wholesale price
	●	Minimum stock
	●	Reorder level
	●	Description
	●	Image
	●	Active/inactive status
	●	Tax settings
	●	Created date
	●	Updated date
Products must support optional variants.
￼
9. PRODUCT VARIANTS
Variants are essential for cosmetics.
Examples:
	●	Foundation shade
	●	Lipstick color
	●	Nail polish color
	●	Perfume size
	●	Shampoo size
	●	Hair dye color
Each variant may have:
	●	Variant name
	●	SKU
	●	Barcode
	●	Color/shade code
	●	Size
	●	Unit
	●	Separate price if required
	●	Image if required
	●	Active status
A product may have no variants.
A product may have many variants.
Do not force variants for every product.
￼
10. BARCODE
Barcode support is a major POS requirement.
Support:
	●	USB barcode scanners that behave as keyboards
	●	Manual barcode entry
	●	Barcode search
	●	Multiple barcodes where appropriate
When a barcode is scanned:
	1.	Find matching active product/variant.
	2.	Add it to POS immediately.
	3.	If not found, show a clear error.
	4.	Do not freeze the POS.
	5.	Allow the user to search manually.
Barcode uniqueness must be enforced appropriately.
￼
11. BATCHES AND EXPIRATION
Cosmetics may have expiration dates.
Each batch may contain:
	●	Batch ID
	●	Product/variant
	●	Batch number
	●	Production date
	●	Expiration date
	●	Purchase cost
	●	Quantity received
	●	Current quantity
	●	Supplier
	●	Purchase invoice reference
Expiration date may be optional for products that do not require it.
Do not force an expiration date where the business does not use one.
￼
12. FEFO
Implement:
FEFO = First Expired, First Out
When selling a product with multiple batches:
	1.	Prefer the earliest valid expiration date.
	2.	Do not automatically sell expired stock.
	3.	If a batch has no expiration date, handle it according to configurable policy.
	4.	Never silently consume stock from an incorrect batch.
	5.	Record the exact batch used by each sale line.
Example:
Batch A: 20 units — expires 2027-03
Batch B: 30 units — expires 2027-10
Selling 5 units should consume Batch A first.
If the user explicitly selects a batch, respect the permitted manual selection and record it.
￼
13. EXPIRED PRODUCTS
Expired products must be clearly identified.
Default policy:
	●	Do not sell expired batches.
	●	Show them in an expired-stock report.
	●	Allow authorized users to perform an adjustment, disposal, or return.
	●	Record the reason.
	●	Record user and timestamp.
Never silently delete expired stock.
￼
14. STOCK LOCATIONS
Locations are rows in a locations table, each with a type:
STORE (exactly one, fixed)
Retail selling location.
WAREHOUSE (one or more)
Stock storage. The business starts with one warehouse; the "Manage Warehouses" screen (see section 6) allows adding more later.
Each batch can have stock in any number of locations (the store, plus each active warehouse).
Use a stock ledger or equivalent transaction-safe inventory system.
Do not rely only on manually updated totals.
Do not write code that assumes "there are exactly two locations" — always query the active locations list.
￼
15. STOCK LEDGER
Every stock movement must be traceable.
Movement types include:
	●	Purchase receipt
	●	Warehouse to store transfer
	●	Sale
	●	Customer return
	●	Supplier return
	●	Stock adjustment increase
	●	Stock adjustment decrease
	●	Expired/disposal
	●	Opening balance
	●	Correction
Each movement should contain:
	●	ID
	●	Date/time
	●	Product
	●	Variant
	●	Batch
	●	Location
	●	Quantity delta
	●	Movement type
	●	Reference document
	●	User
	●	Reason if applicable
Inventory history must never be ambiguous.
￼
16. STOCK TRANSFER
The primary warehouse/store workflow:
Step 1
Store employee creates a transfer request.
Step 2
Select products and quantities.
Step 3
Warehouse user reviews request.
Step 4
Warehouse approves or rejects.
Step 5
Warehouse prepares the transfer.
Step 6
Transfer is dispatched.
Step 7
Store receives the transfer.
Only after the correct workflow stage should quantities move between locations.
Never deduct warehouse stock at the time a draft request is created.
Do not add stock to store until the store receives the transfer, unless the configured workflow explicitly uses in-transit stock.
Recommended states:
	●	Draft
	●	Requested
	●	Approved
	●	Preparing
	●	Dispatched
	●	Received
	●	Rejected
	●	Cancelled
￼
17. PURCHASES
Purchase workflow:
Supplier → Purchase Invoice → Items → Batches → Warehouse Receipt → Stock Increase
Purchase invoice must contain:
	●	Supplier
	●	Invoice number
	●	Invoice date
	●	Due date if applicable
	●	Items
	●	Quantities
	●	Cost
	●	Discounts
	●	Taxes if applicable
	●	Total
	●	Paid amount
	●	Remaining amount
	●	Payment method
	●	Notes
Receiving a purchase must increase warehouse inventory atomically.
￼
18. PURCHASE COST
Maintain accurate purchase cost.
If the same product is purchased at different costs, batches must retain their own cost.
Do not overwrite historical batch costs when a new purchase price is entered.
For profit calculations, use the actual cost of the sold batch whenever possible.
￼
19. SUPPLIERS
Supplier fields:
	●	Name
	●	Phone
	●	Alternative phone
	●	Address
	●	Tax number if applicable
	●	Notes
	●	Active status
Supplier account:
	●	Purchases
	●	Payments
	●	Returns
	●	Outstanding balance
	●	Transaction history
￼
20. POS
The POS is the most important screen.
It must be extremely fast.
Its layout is a hard requirement — see section 129 for the exact required screen layout (search bar, category shortcuts, cart placement).
The cashier should be able to:
	1.	Scan barcode
	2.	Enter quantity
	3.	Apply permitted discount
	4.	Select payment
	5.	Complete sale
	6.	Print receipt
with minimal clicks.
POS must support:
	●	Barcode
	●	Search
	●	Product categories
	●	Product images optionally
	●	Quantity editing
	●	Item removal
	●	Item discount
	●	Invoice discount
	●	Customer selection
	●	Payment
	●	Hold invoice
	●	Resume invoice
	●	Cancel invoice
	●	Returns
	●	Reprint
￼
21. POS SEARCH
The search bar is the primary way products get into the cart — it must be large, always visible at the top of the POS screen, and never require a click to focus (auto-focused on screen load and after every action).
Placeholder text (Arabic): "ابحث بالاسم أو الباركود"
Search by:
	●	Barcode
	●	Product name
	●	Arabic name
	●	English name
	●	SKU
	●	Brand
	●	Shade
	●	Category
Search should be fast on large product databases.
Use proper indexes.
Do not query the entire database unnecessarily on every keystroke — debounce keystrokes.
Directly under the search bar, show a row of category shortcut chips/buttons (e.g. شامبوهات, اكسسوارات, بامبرز, مكياج, عناية بالبشرة, عطور, ...) driven by the actual categories configured in the system, not hard-coded. Tapping a shortcut instantly filters the product grid to that category (combinable with the search box) to speed up common repeat sales without typing.
See section 129 for the full POS layout this search bar and the category shortcuts belong to.
￼
22. SELLING LOGIC
When completing a sale:
	1.	Validate user permissions.
	2.	Validate stock.
	3.	Determine batches according to FEFO.
	4.	Create sale transaction.
	5.	Create sale lines.
	6.	Create stock movements.
	7.	Update inventory safely.
	8.	Record payment.
	9.	Record customer account if applicable.
	10.	Commit transaction.
	11.	Only after successful commit mark invoice as completed.
	12.	Print receipt.
All financial and inventory changes must occur within an appropriate database transaction.
Never partially complete a sale.
￼
23. ZERO STOCK
Do not allow selling more than available stock by default.
If negative stock is ever allowed, it must be an explicit administrator setting.
The default must be:
Negative stock disabled.
￼
24. SALES RETURNS
Support full and partial returns.
Return must reference the original sale whenever possible.
Return workflow:
	1.	Find original invoice.
	2.	Select item.
	3.	Select quantity.
	4.	Validate return policy.
	5.	Determine refund.
	6.	Restore stock according to policy.
	7.	Record return.
	8.	Update customer account if applicable.
	9.	Record payment/refund.
Returned products may require:
	●	New batch
	●	Original batch
	●	Quarantine
	●	Non-resellable status
Make this configurable.
Never simply increase stock without a return record.
￼
25. CUSTOMER MANAGEMENT
Customer is optional for ordinary sales.
Fields:
	●	Name
	●	Mobile
	●	Email optional
	●	Address optional
	●	Notes
	●	Loyalty points
	●	Account balance if credit sales are enabled
	●	Created date
POS must allow:
Walk-in customer
without forcing customer creation.
￼
26. LOYALTY
Implement an optional loyalty system.
Settings:
	●	Points per currency amount
	●	Minimum redeemable points
	●	Point value
	●	Expiration if desired
	●	Enable/disable
Do not hard-code loyalty rules.
￼
27. DISCOUNTS
Support:
	●	Item discount
	●	Invoice discount
	●	Percentage
	●	Fixed amount
Permissions must determine who can apply discounts.
Example:
Cashier:
	●	Up to 5%
Manager:
	●	Higher limit
Administrator:
	●	No limit within configured rules
Every discount must be recorded.
￼
28. PROMOTIONS
The system should support configurable promotions such as:
	●	Buy X get Y
	●	Percentage discount
	●	Fixed discount
	●	Product bundle
	●	Category promotion
	●	Brand promotion
	●	Minimum invoice amount
Promotions must not corrupt stock or profit calculations.
￼
29. EXPENSES
Track store expenses:
	●	Rent
	●	Electricity
	●	Salaries
	●	Transportation
	●	Maintenance
	●	Packaging
	●	Marketing
	●	Miscellaneous
Expense fields:
	●	Category
	●	Amount
	●	Date
	●	Payment method
	●	Description
	●	User
	●	Attachment optional
Expenses must appear in financial reports.
￼
30. CASH MANAGEMENT
Support a basic cash register/session model.
At opening:
	●	Opening cash
During session:
	●	Sales cash
	●	Expenses
	●	Cash in
	●	Cash out
	●	Returns/refunds
At closing:
	●	Expected cash
	●	Actual cash
	●	Difference
Store user and timestamp.
￼
31. PAYMENT METHODS
Make payment methods configurable.
Initial defaults:
	●	Cash
	●	Visa
	●	Mastercard
	●	Bank card
	●	Other
The application should support adding/editing payment methods.
Do not integrate with payment gateways unless explicitly requested.
Payment gateway integration is not required for offline POS.
￼
32. TAX / EGYPT
The application is intended for Egypt.
Tax configuration must be flexible.
Do not hard-code one tax rate permanently.
Allow:
	●	Tax enabled/disabled
	●	Tax rate
	●	Inclusive/exclusive pricing
	●	Tax number/business information
	●	Invoice footer information
Tax behavior must be configurable according to the business’s actual legal/accounting requirements.
Do not present the software as automatically guaranteeing tax compliance.
￼
33. EGYPTIAN CURRENCY
Default currency:
EGP — Egyptian Pound
Allow currency formatting.
Do not use floating-point arithmetic for financial calculations where integer minor units or decimal-safe arithmetic is more appropriate.
Money calculations must avoid rounding errors.
￼
34. INVOICES
Invoice numbering must be:
	●	Sequential
	●	Unique
	●	Configurable prefix
	●	Safe against duplication
	●	Transaction-safe
Example:
COS-2026-000001
Do not generate invoice numbers by simply counting visible rows.
￼
35. PRINTING
Support:
Thermal (primary POS printer — must work reliably, this is a hard requirement)
	●	58mm
	●	80mm
	●	ESC/POS-compatible commands (or the equivalent for the chosen printer driver layer)
	●	USB and network/Ethernet thermal printers where the hardware supports it
A4
	●	Standard invoice
	●	Purchase invoice
	●	Reports
SILENT PRINTING IS MANDATORY
POS receipt printing must be silent/direct: send the receipt straight to the selected printer with zero OS print dialog, zero print-preview popup, and zero extra clicks — one action (completing the sale, or pressing reprint) triggers the print.
	●	The cashier must never see a Windows/browser print dialog during normal POS operation.
	●	This applies to the default "auto print on sale complete" flow at minimum; reprints and manual prints should also default to silent printing, with an explicit "preview" action available only where the user opts into it (see section 109 for A4/report preview, which is separate from the thermal receipt flow).
	●	Implement this at the Rust/native layer (raw printer output / OS printing API called directly), not by relying on the webview's print() function, since that always opens a dialog.
	●	If silent printing to the selected printer fails (offline, out of paper, disconnected), show a clear in-app error and offer a manual reprint — never silently drop the receipt, and never block or roll back the completed sale (see section 36).
Receipt should contain:
	●	Store name
	●	Logo
	●	Address
	●	Phone
	●	Tax information if configured
	●	Invoice number
	●	Date/time
	●	Cashier
	●	Items
	●	Quantity
	●	Price
	●	Discount
	●	Total
	●	Payment method
	●	Customer if applicable
	●	Footer
Printing must not be dependent on internet access.
￼
36. PRINTER SETTINGS
Create a settings screen for:
	●	Default thermal printer (58mm/80mm), selected from the list of installed Windows printers
	●	Receipt width
	●	Copies
	●	Auto print (silent, on by default — see section 35)
	●	A4 printer (separate from the thermal receipt printer)
	●	Receipt footer
	●	Logo
	●	Margins where appropriate
Silent printing (no OS dialog) is the default and expected behavior for the thermal receipt printer at all times, not just an option.
If printing fails, show a useful error and keep the completed transaction safe.
Never roll back a successful sale just because the printer failed.
￼
37. DASHBOARD
Dashboard should show:
	●	Today’s sales
	●	Today’s invoices
	●	Today’s profit estimate
	●	Cash sales
	●	Card sales
	●	Purchases
	●	Expenses
	●	Low-stock products
	●	Expiring products
	●	Expired products
	●	Pending warehouse requests
	●	Recent sales
Charts should be lightweight.
Do not overload the dashboard with animations.
￼
38. REPORTS
Reports should include:
Sales
	●	Daily
	●	Weekly
	●	Monthly
	●	Custom date range
	●	By product
	●	By category
	●	By brand
	●	By employee
	●	By payment method
Profit
	●	Revenue
	●	Cost
	●	Gross profit
	●	Discounts
	●	Returns
	●	Expenses
	●	Net result
Inventory
	●	Current stock
	●	Warehouse stock
	●	Store stock
	●	Low stock
	●	Out of stock
	●	Expiring
	●	Expired
	●	Slow-moving
	●	Stock valuation
Purchases
	●	By supplier
	●	By date
	●	By product
	●	Outstanding supplier balances
Customers
	●	Purchases
	●	Returns
	●	Outstanding balances
	●	Loyalty
Cash
	●	Opening
	●	Sales
	●	Expenses
	●	Cash in/out
	●	Closing
	●	Difference
All reports need filtering and export where practical.
￼
39. INVENTORY VALUATION
Support a clearly defined inventory valuation method.
Recommended:
Batch actual cost / weighted cost where appropriate
Document the selected method.
Do not mix calculation methods silently.
Profit reports must clearly state the calculation basis.
￼
40. STOCKTAKE / INVENTORY COUNT
Provide a stock count module.
Workflow:
	1.	Start stock count.
	2.	Select location.
	3.	Scan/search items.
	4.	Enter counted quantity.
	5.	Compare system quantity.
	6.	Show difference.
	7.	Require authorization for adjustment.
	8.	Generate stock adjustment.
	9.	Record reason and user.
Never directly overwrite stock without a movement record.
￼
41. OPENING BALANCE
Provide a safe initial inventory setup.
Administrator can import or enter:
	●	Product
	●	Variant
	●	Batch
	●	Expiration
	●	Cost
	●	Quantity
	●	Location
Opening balance must create inventory movements.
￼
42. IMPORT / EXPORT
Support CSV import/export for:
	●	Products
	●	Variants
	●	Opening stock
	●	Customers
	●	Suppliers
Import must:
	●	Validate columns
	●	Show errors before committing
	●	Prevent accidental duplicates
	●	Provide preview
	●	Allow cancellation
	●	Use transactions
	●	Generate an import report
Never partially import silently.
￼
43. PRODUCT IMAGE STORAGE
Product images should be stored locally.
Do not depend on external image URLs.
Use reasonable image compression/resizing.
Do not load hundreds of large images into memory simultaneously.
Use lazy loading where appropriate.
￼
44. USER MANAGEMENT
Roles:
Administrator
Full access.
Manager
Most operational and reporting access.
Cashier
POS and permitted customer operations.
Warehouse Clerk
Purchases, stock, transfers, stock counts.
Permissions must be granular.
Examples:
	●	View sales
	●	Create sale
	●	Cancel sale
	●	Return sale
	●	Apply discount
	●	View profit
	●	Edit product
	●	Edit price
	●	Receive purchase
	●	Adjust stock
	●	Approve transfer
	●	View reports
	●	Backup
	●	Restore
	●	Manage users
Each user account has a name, role, and a short numeric PIN (no traditional password/login screen — see section 45 and 76).
￼
45. SECURITY
NO traditional username/password login screen. Identification happens through the shift system (see section 76): an employee picks their name/avatar and enters a short PIN to open a shift — that PIN also stands in for authentication for the rest of this document (wherever "login" or "password" is mentioned elsewhere, read it as "PIN-based shift identification").
PINs must never be stored in plain text — hash them the same way passwords would be hashed.
The active shift's employee is the "current user" for permissions and audit logging until the shift is closed or the app is locked.
Sensitive operations still require authorization via PIN, even mid-shift:
	●	Delete/void sale
	●	Stock adjustment
	●	Price change
	●	High discount
	●	Restore backup
	●	User management
For these, prompt for the acting user's PIN (or a manager/administrator PIN if the current shift owner lacks permission) instead of a full re-login.
Support an inactivity auto-lock (configurable minutes) that returns to the "select employee" screen without closing the open shift.
Do not expose database credentials because there are none in the local architecture.
The local SQLite database file must be encrypted at rest (e.g. SQLCipher or equivalent), since the machine is a commercial store PC that could be stolen or copied.
￼
46. AUDIT LOG
Record important actions:
	●	Shift opened
	●	Shift closed
	●	Sale creation
	●	Sale cancellation
	●	Return
	●	Purchase
	●	Stock adjustment
	●	Transfer
	●	Price change
	●	Product modification
	●	User modification
	●	Backup
	●	Restore
Audit log should include:
	●	User
	●	Action
	●	Entity
	●	Entity ID
	●	Timestamp
	●	Summary
	●	Optional old/new values
Audit records should not be casually deletable.
￼
47. SOFT DELETE
For important business records, prefer:
Active/Inactive
or soft deletion.
Never physically delete historical:
	●	Sales
	●	Returns
	●	Purchases
	●	Stock movements
	●	Payments
	●	Audit logs
unless an explicit data-maintenance operation is implemented and protected.
￼
48. DATABASE INTEGRITY
Use:
	●	Foreign keys
	●	NOT NULL where appropriate
	●	UNIQUE constraints
	●	CHECK constraints
	●	Indexes
	●	Transactions
Every business operation must be atomic.
Example:
A sale that creates the invoice but fails to deduct stock is unacceptable.
A transfer that deducts warehouse stock but never records the transfer is unacceptable.
A purchase that creates an invoice but does not update inventory is unacceptable.
￼
49. DATABASE MIGRATIONS
Implement a proper migration mechanism.
Never tell the user to delete the database when changing schema.
Every release must be able to migrate an existing database safely.
Before migrations:
	●	Validate database
	●	Create automatic backup
	●	Apply migration
	●	Verify
	●	Recover if migration fails
￼
50. BACKUP
Backup is mandatory.
Provide:
Manual backup
User chooses destination.
Automatic backup
Configurable schedule, e.g.:
	●	Daily
	●	On application close
	●	Before database migration
Keep configurable number of backup copies.
Backup must include all essential local data.
Recommended backup file:
.backup or .db
with metadata where appropriate.
￼
51. RESTORE
Restore must be protected.
Workflow:
	1.	Require administrator authorization.
	2.	Warn user.
	3.	Create current backup.
	4.	Validate selected backup.
	5.	Restore safely.
	6.	Verify database integrity.
	7.	Restart/reload application if required.
Never overwrite current data blindly.
￼
52. BACKUP SAFETY
A backup is not considered valid merely because a file exists.
Validate:
	●	SQLite integrity
	●	Schema version
	●	Required tables
	●	Migration compatibility
Provide a backup verification operation.
￼
53. APPLICATION UPDATE
Updates must not delete user data.
The installer/update process must preserve:
	●	Database
	●	Product images
	●	Backups
	●	Configuration
Never place production database inside the application installation directory.
￼
54. FILE STRUCTURE
Use a clean project structure similar to:
```text cosmetics-pos/ ├── src/ │   ├── components/ │   ├── layouts/ │   ├── pages/ │   ├── features/ │   │   ├── pos/ │   │   ├── products/ │   │   ├── inventory/ │   │   ├── purchases/ │   │   ├── customers/ │   │   ├── suppliers/ │   │   ├── expenses/ │   │   ├── reports/ │   │   ├── settings/ │   │   └── users/ │   ├── hooks/ │   ├── services/ │   ├── stores/ │   ├── types/ │   ├── utils/ │   └── i18n/ │ ├── src-tauri/ │   ├── src/ │   │   ├── commands/ │   │   ├── db/ │   │   ├── models/ │   │   ├── services/ │   │   ├── inventory/ │   │   ├── sales/ │   │   ├── purchases/ │   │   ├── reports/ │   │   ├── backup/ │   │   └── printing/ │   └── migrations/ │ ├── public/ ├── tests/ └── docs/ ```
Adjust structure if a better architecture is justified.
Do not create a huge monolithic file.
￼
55. UI / UX
The UI must be professional and practical.
Language:
Arabic by default
Direction:
RTL
English should be architecturally supported.

DESIGN QUALITY BAR — this is a hard requirement, not a nice-to-have:
The finished application must look and feel like a real, commercially designed Egyptian POS product — the kind a design agency would ship — never like an unstyled, default, "obviously AI-generated" scaffold.
	●	Define and use a real design system before building screens: a specific color palette (not default framework blue/gray), a defined type scale, a spacing scale, and a small set of reusable components (buttons, inputs, cards, badges, tables) applied consistently everywhere.
	●	Do not ship raw default component-library styling (e.g. unstyled shadcn/Tailwind defaults, default browser form controls, default Bootstrap look). Every component must be intentionally themed.
	●	Pick a real typeface for Arabic (a proper Arabic-optimized font, not the OS fallback) and pair it with a matching Latin font for English/numbers.
	●	Use a coherent visual identity: a defined accent color for primary actions, consistent icon set (single icon library, consistent stroke width/size), consistent corner radii, consistent shadows/elevation.
	●	Avoid generic placeholder feel: no lorem-ipsum-like spacing, no default favicon, no unstyled empty states, no mismatched fonts between screens.
	●	Polish is expected in the details: hover/active/focus states, loading skeletons instead of blank screens, smooth (but minimal, non-distracting) micro-interactions, proper empty/error states with illustrations or icons, not just plain text.

Design principles:
	●	Clean
	●	Fast
	●	Modern
	●	Professional
	●	Low visual noise
	●	Large touch-friendly controls where useful
	●	Keyboard-friendly POS
	●	Clear tables
	●	Clear status badges
	●	Consistent dialogs
	●	Strong validation
	●	No unnecessary animations
Avoid excessive gradients, glass effects, huge shadows, or decorative elements that slow down older hardware.
￼
56. MAIN NAVIGATION
Recommended navigation:
	1.	الرئيسية
	2.	نقطة البيع
	3.	المنتجات
	4.	المخزون
	5.	المشتريات
	6.	العملاء
	7.	الموردون
	8.	المصروفات
	9.	التقارير
	10.	المستخدمون
	11.	الإعدادات
	12.	النسخ الاحتياطي
The UI should hide unauthorized sections.
￼
57. POS KEYBOARD SUPPORT
Provide keyboard shortcuts.
Examples:
	●	F2 search
	●	F4 customer
	●	F8 payment
	●	F9 hold invoice
	●	Esc close dialog
	●	Enter confirm
	●	Delete remove item
Use configurable shortcuts where practical.
Barcode scanner input must work naturally.
￼
58. ERROR HANDLING
Never show raw Rust/database errors to ordinary users.
Translate technical errors into useful messages.
Example:
Bad:
SQLITE_CONSTRAINT_FOREIGNKEY
Good:
“لا يمكن حذف المنتج لأنه مرتبط بعمليات بيع سابقة.”
For unexpected errors:
	●	Show user-friendly message.
	●	Log technical details locally.
	●	Include error ID if useful.
￼
59. LOGGING
Local logs should include:
	●	Application errors
	●	Database errors
	●	Printer errors
	●	Backup errors
	●	Migration errors
Do not log passwords or sensitive authentication information.
Implement log rotation so logs do not grow indefinitely.
￼
60. PERFORMANCE
Target fast operation on older computers.
Rules:
	●	Use pagination for large tables.
	●	Avoid loading all products at once.
	●	Use database indexes.
	●	Debounce search where appropriate.
	●	Cache small reference datasets.
	●	Avoid expensive React rerenders.
	●	Avoid huge image assets.
	●	Keep dashboard queries efficient.
	●	Keep POS operations minimal.
A database with tens of thousands of products should remain usable.
￼
61. RESPONSIVENESS
The primary environment is desktop Windows.
Support common POS resolutions such as:
	●	1366x768
	●	1600x900
	●	1920x1080
Do not make the interface dependent on ultra-wide screens.
The POS should remain usable at 1366x768.
￼
62. DATA VALIDATION
Validate at both UI and backend levels.
Examples:
	●	Negative quantity
	●	Invalid price
	●	Invalid discount
	●	Duplicate barcode
	●	Missing product
	●	Invalid batch
	●	Expired batch
	●	Insufficient stock
	●	Invalid payment
	●	Duplicate invoice number
Never trust frontend validation alone.
￼
63. TRANSACTION RULES
All critical operations must use database transactions.
Especially:
	●	Sales
	●	Returns
	●	Purchases
	●	Transfers
	●	Stock adjustments
	●	Payments
	●	Cash closing
If any step fails:
rollback the entire business operation.
￼
64. CONCURRENCY
Even though the system is for one store, multiple devices may eventually be used.
The first release may operate on a single local machine.
If local-network multi-terminal support is not explicitly implemented, do not pretend SQLite is a multi-PC server.
Architecture should remain clean enough to evolve later.
￼
65. DO NOT IMPLEMENT CLOUD BY DEFAULT
No mandatory:
	●	Firebase
	●	Supabase
	●	Appwrite
	●	AWS
	●	Vercel
	●	Cloud database
Cloud backup can be considered as a future optional module.
Core application must remain local.
￼
66. SETTINGS
Settings should include:
Store
	●	Name
	●	Address
	●	Phone
	●	Logo
	●	Tax number
	●	Invoice footer
Currency
	●	Currency name
	●	Symbol
	●	Decimal places
Default:
EGP
Inventory
	●	Negative stock
	●	FEFO
	●	Expiration warning days
	●	Default location
	●	Stock adjustment policy
POS
	●	Auto print
	●	Receipt width
	●	Default customer
	●	Discount limits
Backup
	●	Automatic backup
	●	Backup folder
	●	Retention count
Security
	●	Auto-lock inactivity timeout
	●	PIN length/policy
￼
67. EXPIRATION WARNINGS
Configurable warning period.
Default:
90 days
Statuses:
	●	Expired
	●	Critical
	●	Expiring soon
	●	Valid
Allow the administrator to change the number of warning days.
￼
68. SLOW-MOVING PRODUCTS
A report should identify products with no sales during a configurable period.
Example:
	●	No sale for 30 days
	●	No sale for 60 days
	●	No sale for 90 days
Do not hard-code the period.
￼
69. PRODUCT PROFITABILITY
Provide product-level profitability:
	●	Units sold
	●	Revenue
	●	Discount
	●	Cost
	●	Gross profit
	●	Margin percentage
Use actual batch cost when possible.
Clearly distinguish:
Gross Profit
from:
Net Profit after expenses
￼
70. REPORT EXPORT
Support export where practical:
	●	CSV
	●	PDF
	●	Print
Do not require an online service.
Exports must use local libraries.
￼
71. SEARCH AND FILTERING
Every important list should support:
	●	Search
	●	Date filter
	●	Category filter
	●	Brand filter
	●	Status filter
	●	Location filter where relevant
Avoid unnecessarily complex filter panels.
￼
72. PRODUCT CATALOG
Provide a product catalog screen.
Display:
	●	Image
	●	Name
	●	Brand
	●	Category
	●	Variant
	●	Price
	●	Store stock
	●	Warehouse stock
	●	Expiration warning
Allow quick add-to-cart from catalog if useful.
￼
73. PRODUCT CREATION UX
Creating a product should be simple.
Suggested tabs:
Basic
Name, category, brand.
Pricing
Purchase and selling prices.
Barcode
Barcode/SKU.
Variants
Shades/sizes/colors.
Inventory
Minimum stock.
Batches
Batch information when receiving stock.
Do not make the user fill irrelevant fields.
￼
74. SUPPLIER PURCHASE HISTORY
From a supplier page, show:
	●	Total purchases
	●	Paid
	●	Remaining
	●	Recent invoices
	●	Returns
	●	Payment history
￼
75. CUSTOMER PURCHASE HISTORY
From customer page:
	●	Total purchases
	●	Number of invoices
	●	Returns
	●	Loyalty points
	●	Account balance
	●	Last purchase
	●	Favorite products where useful
￼
76. CASHIER SHIFT
Mandatory — this is the application's identification mechanism (there is no separate login screen; see section 45).
On app start (and after auto-lock or the previous shift is closed), show a "select employee" screen: pick your name/avatar, enter your PIN, then open a shift with an opening cash amount.
While a shift is open, the shift owner is the "current user" for permissions and audit logging.
At close:
	●	Expected
	●	Actual
	●	Difference
Any operation requiring a higher permission than the current shift owner has (e.g. a discount above the cashier's limit) must prompt for a manager/administrator PIN rather than switching shifts.
The manager can review closed shifts.
￼
77. DATA RECOVERY
The application should provide recovery-friendly behavior.
If the application crashes during a transaction:
	●	SQLite transaction must rollback automatically.
	●	Database must remain consistent.
	●	On next startup, run integrity checks where appropriate.
Do not implement risky custom recovery that can overwrite valid data.
￼
78. FIRST RUN
On first launch:
	1.	Show welcome screen.
	2.	Ask for store information.
	3.	Create the administrator profile (name + PIN — no password/login screen, see section 45).
	4.	Set currency to EGP.
	5.	Configure printer optionally.
	6.	Offer sample data only if explicitly selected.
	7.	Create database.
	8.	Create first backup configuration.
	9.	Enter dashboard.
Do not force internet registration.
￼
79. DEMO DATA
If demo/sample data is included:
	●	It must be clearly marked.
	●	It must be optional.
	●	It must never mix with real production data accidentally.
￼
80. INSTALLER
Produce a professional Windows installer.
Requirements:
	●	Clear application name
	●	Version number
	●	Start menu shortcut
	●	Desktop shortcut optional
	●	Uninstaller
	●	Application icon
	●	No terminal window
	●	No developer dependencies
Installation must not overwrite production database.
￼
81. DATA LOCATION
Application executable files and user data must be separated.
Recommended:
```text Application: C:\Program Files\Cosmetics POS\  User Data: %APPDATA%\CosmeticsPOS\ ```
or an appropriate Windows application-data location.
Use a clearly defined data directory.
￼
82. UNINSTALL BEHAVIOR
Uninstall must warn users before removing data.
Prefer:
	●	Remove application
	●	Keep user data by default
Provide documentation for full data removal.
Never silently destroy business data during uninstall.
￼
83. VERSIONING
Use semantic versioning:
MAJOR.MINOR.PATCH
Example:
1.0.0
Every release should document:
	●	Changes
	●	Bug fixes
	●	Database migrations
	●	Compatibility
￼
84. TESTING
Create automated tests for business logic.
Minimum critical tests:
Sales
	●	Normal sale
	●	Multiple quantities
	●	Insufficient stock
	●	FEFO
	●	Expired batch
	●	Discount
	●	Payment
Returns
	●	Full return
	●	Partial return
	●	Invalid return quantity
Purchases
	●	Receive stock
	●	Multiple batches
	●	Different costs
Transfers
	●	Request
	●	Approve
	●	Dispatch
	●	Receive
	●	Cancel
Inventory
	●	Adjustment
	●	Stock count
	●	Opening balance
Database
	●	Migration
	●	Backup
	●	Restore
	●	Integrity
￼
85. ACCEPTANCE TESTS
The final product must pass scenarios such as:
Scenario 1
Create product.
Scenario 2
Receive 100 units into warehouse.
Scenario 3
Transfer 20 units to store.
Scenario 4
Sell 5 units.
Scenario 5
Verify store stock = 15.
Scenario 6
Return 2 units.
Scenario 7
Verify store stock = 17 according to return policy.
Scenario 8
Create two batches with different expiration dates.
Scenario 9
Sell product and verify FEFO.
Scenario 10
Attempt to sell expired stock.
Expected: Sale blocked unless authorized policy explicitly allows it.
Scenario 11
Backup database.
Scenario 12
Create additional sales.
Scenario 13
Restore backup.
Expected: Data returns to backup state without corrupting database.
￼
86. SECURITY TESTS
Test:
	●	Wrong PIN
	●	Unauthorized page
	●	Unauthorized discount
	●	Unauthorized stock adjustment
	●	Unauthorized restore
	●	Unauthorized user creation
	●	Inactivity auto-lock
	●	Opening a new shift while one is already open
￼
87. PRINTER TESTS
Test:
	●	58mm
	●	80mm
	●	A4
	●	Printer unavailable
	●	Printer disconnected
	●	Reprint
	●	Arabic text
	●	Long product names
	●	Large invoice
A printer error must not destroy the sale.
￼
88. LOW-END DEVICE TEST
Test on the lowest supported environment.
Measure:
	●	Startup time
	●	POS search
	●	Barcode scan
	●	Sale completion
	●	Report generation
	●	Backup
	●	Restore
Avoid unnecessary resource consumption.
￼
89. UI LANGUAGE
All visible UI text should be centralized.
Do not hard-code Arabic strings throughout components.
Use i18n architecture.
Default:
Arabic
Future:
English
Support RTL/LTR correctly.
￼
90. DATE AND TIME
Use local Windows time by default.
Display date in a familiar Egyptian format.
Store timestamps in a consistent internal format.
Never use ambiguous date strings internally.
￼
91. NUMBER FORMATTING
Use appropriate formatting for:
	●	Currency
	●	Quantity
	●	Percentage
	●	Dates
Avoid binary floating-point issues in money calculations.
￼
92. EMPTY STATES
Every empty screen needs a useful message.
Example:
“لا توجد منتجات حتى الآن”
with:
“إضافة منتج”
Do not leave blank white areas.
￼
93. CONFIRMATION DIALOGS
Use confirmation for destructive actions.
Examples:
	●	Cancel invoice
	●	Return
	●	Stock adjustment
	●	Delete/inactivate product
	●	Restore backup
The dialog must explain consequences.
￼
94. NOTIFICATION SYSTEM
Use lightweight notifications for:
	●	Sale completed
	●	Purchase received
	●	Transfer received
	●	Backup completed
	●	Backup failed
	●	Low stock
	●	Expiration warnings
Do not overuse notifications.
￼
95. ARCHITECTURAL RULE
Keep business logic out of React components where possible.
Frontend:
	●	Presentation
	●	User interaction
	●	State
Rust/backend:
	●	Business rules
	●	Transactions
	●	Database
	●	Security-sensitive operations
This prevents UI code from becoming a business-logic monolith.
￼
96. DATABASE ACCESS RULE
Do not expose arbitrary SQL execution to the frontend.
Use explicit commands/services.
Example:
	●	create_product
	●	search_products
	●	create_sale
	●	complete_sale
	●	return_sale
	●	receive_purchase
	●	request_transfer
	●	approve_transfer
	●	receive_transfer
	●	adjust_stock
	●	backup_database
	●	restore_database
Validate all inputs in Rust.
￼
97. API/COMMAND DESIGN
Tauri commands should be:
	●	Small
	●	Explicit
	●	Typed
	●	Validated
	●	Permission-aware
	●	Transaction-safe
Avoid a generic command such as:
execute_sql(query)
for normal application operations.
￼
98. DATABASE SCHEMA
At minimum consider tables/entities:
	●	users
	●	roles
	●	permissions
	●	role_permissions
	●	user_roles
	●	products
	●	product_variants
	●	brands
	●	categories
	●	units
	●	barcodes
	●	batches
	●	locations
	●	stock
	●	stock_movements
	●	suppliers
	●	supplier_transactions
	●	purchases
	●	purchase_items
	●	customers
	●	customer_transactions
	●	sales
	●	sale_items
	●	sale_item_batches
	●	returns
	●	return_items
	●	transfers
	●	transfer_items
	●	payments
	●	payment_methods
	●	expenses
	●	expense_categories
	●	cash_sessions
	●	cash_movements
	●	promotions
	●	loyalty_transactions
	●	settings
	●	audit_logs
	●	backups
	●	migrations metadata
Do not blindly create every table if a better normalized design exists.
Avoid unnecessary duplication.
￼
99. DATABASE DESIGN PRINCIPLES
Use normalized data where appropriate.
Avoid:
	●	Storing comma-separated IDs
	●	JSON as a replacement for relational structure
	●	Repeating product names in every stock record when IDs suffice
JSON may be used only where it provides clear value and does not compromise integrity.
￼
100. PRODUCT CATEGORIES
Initial categories may include:
	●	Makeup
	●	Skincare
	●	Hair Care
	●	Hair Color
	●	Body Care
	●	Fragrance
	●	Nail Care
	●	Personal Care
	●	Accessories
	●	Other
Allow user customization.
￼
101. BRANDS
Brands are separate entities.
Examples can be imported later.
Do not hard-code brand names into business logic.
￼
102. INVENTORY ALERTS
Alerts:
	●	Out of stock
	●	Below minimum
	●	Expiring soon
	●	Expired
	●	Slow moving
The dashboard should make these visible.
￼
103. INVENTORY MOVEMENT DETAILS
For every movement, the user should be able to see:
	●	What changed?
	●	By how much?
	●	From where?
	●	To where?
	●	Which batch?
	●	Why?
	●	Who?
	●	When?
	●	Reference invoice/transfer?
￼
104. BUSINESS RULE: PRICE HISTORY
Track important selling-price changes.
When price changes:
	●	Store current price.
	●	Preserve history.
	●	Record user.
	●	Record date/time.
	●	Optionally record reason.
Historical invoices must retain the actual sale price.
Never recalculate old invoices using current product prices.
￼
105. BUSINESS RULE: PURCHASE HISTORY
Historical purchase invoices must retain:
	●	Actual cost
	●	Quantity
	●	Discount
	●	Tax
	●	Supplier
	●	Batch
Changing current product cost must not modify old purchases.
￼
106. BUSINESS RULE: HISTORICAL SALES
Historical sales must remain immutable except through controlled return/void processes.
Do not directly edit completed sales.
￼
107. BUSINESS RULE: VOIDING SALES
A completed sale should not be deleted.
Use:
	●	Void/cancel
	●	Reversal
	●	Return
according to the business scenario.
Record the reason and user.
￼
108. REPORT PERFORMANCE
Large reports should use efficient queries.
Do not calculate everything in React.
Heavy calculations should be done in the backend/database layer.
￼
109. PRINT PREVIEW
Where practical, provide preview before printing reports and A4 invoices.
Thermal receipts may use direct print for speed.
￼
110. ACCESSIBILITY
Use:
	●	Readable Arabic font
	●	Adequate contrast
	●	Keyboard navigation
	●	Clear focus states
	●	Large enough controls
	●	Meaningful error messages
Do not use color alone to communicate critical information.
￼
111. NO UNNECESSARY DEPENDENCIES
Every dependency must have a reason.
Before adding a library:
	1.	Explain why it is needed.
	2.	Check maintenance quality.
	3.	Check Windows compatibility.
	4.	Check bundle/resource impact.
	5.	Check offline compatibility.
	6.	Prefer stable lightweight libraries.
￼
112. NO INTERNET ASSUMPTIONS
Do not:
	●	Fetch exchange rates
	●	Fetch product data
	●	Fetch images
	●	Fetch fonts
	●	Validate licenses online
	●	Require cloud login
during normal operation.
￼
113. LICENSE / ACTIVATION
Do not implement online activation in version 1.
The application should work locally after installation.
If licensing is added later, it must not make the core architecture dependent on internet access.
￼
114. DOCUMENTATION
Create documentation for:
	●	Installation
	●	First run
	●	Backup
	●	Restore
	●	Printer setup
	●	Product management
	●	Purchasing
	●	Transfers
	●	Sales
	●	Returns
	●	Inventory count
	●	User permissions
	●	Troubleshooting
Documentation should be Arabic-first.
￼
115. DEVELOPMENT RULE
Do not build everything in one huge step.
Work in controlled phases.
Recommended phases:
Phase 1
Project foundation.
Phase 2
Database and migrations.
Phase 3
Authentication and permissions.
Phase 4
Products, brands, categories, variants, barcodes.
Phase 5
Inventory, batches, FEFO.
Phase 6
Purchases and suppliers.
Phase 7
POS and sales.
Phase 8
Returns.
Phase 9
Warehouse/store transfers.
Phase 10
Customers and loyalty.
Phase 11
Expenses and cash sessions.
Phase 12
Reports.
Phase 13
Printing.
Phase 14
Backup/restore.
Phase 15
Performance and Windows compatibility.
Phase 16
Packaging and final QA.
￼
116. PHASE COMPLETION RULE
Do not mark a phase complete merely because code exists.
A phase is complete only when:
	●	Feature works
	●	Validation works
	●	Error handling works
	●	Database transactions work
	●	Permissions work
	●	UI works
	●	Tests exist
	●	Regression test passes
	●	No obvious console errors
	●	Documentation is updated
￼
117. CODE QUALITY
Write production-quality code.
Avoid:
	●	TODO placeholders
	●	Fake implementations
	●	Empty handlers
	●	Hard-coded test values
	●	Duplicate business logic
	●	Huge components
	●	Magic numbers
	●	Hidden side effects
Do not claim a feature is complete if it is only mocked.
￼
118. ERROR RECOVERY
Every critical operation should fail safely.
Example:
If sale transaction fails:
	●	No invoice should be partially committed.
	●	No stock should be partially deducted.
	●	User should receive a clear message.
	●	Technical error should be logged.
￼
119. DATABASE BACKUP BEFORE RISKY OPERATIONS
Automatically back up before:
	●	Schema migration
	●	Restore
	●	Major import
	●	Potential destructive maintenance
￼
120. IMPORT SAFETY
Before importing thousands of products:
	●	Validate file
	●	Show count
	●	Show invalid rows
	●	Show duplicates
	●	Ask confirmation
	●	Backup database
	●	Run transaction
	●	Report result
￼
121. SAMPLE BUSINESS FLOW
Typical day:
Morning
Cashier opens cash session.
Warehouse
Receives supplier shipment.
Warehouse
Adds batches and expiration dates.
Store
Requests 20 units.
Warehouse
Approves and dispatches.
Store
Receives stock.
Customer
Buys cosmetics.
POS
Scans barcode.
System
Uses correct batch according to FEFO.
Customer
Pays cash/card.
POS
Completes transaction and prints receipt.
Evening
Manager reviews:
	●	Sales
	●	Profit
	●	Expenses
	●	Cash
	●	Low stock
	●	Expiration alerts
End of day
Cashier closes session.
Backup
Automatic backup runs.
￼
122. FUTURE EXTENSIBILITY
Do not implement now unless requested:
	●	Multiple branches
	●	Cloud synchronization
	●	Online store
	●	Mobile application
	●	Supplier portal
	●	Customer mobile app
	●	Online payment gateway
	●	AI recommendations
	●	E-commerce marketplace integration
But keep architecture clean enough that these could be added later.
￼
123. WHAT NOT TO DO
Do NOT:
	●	Use Django for this version.
	●	Use Electron unless a documented blocker makes Tauri unsuitable.
	●	Require a local web server.
	●	Require internet.
	●	Store database in Program Files.
	●	Use external CDN assets.
	●	Use floating-point money calculations carelessly.
	●	Directly overwrite inventory quantities without stock movements.
	●	Delete historical transactions.
	●	Put all business logic in React.
	●	Put all code in one file.
	●	Use fake buttons.
	●	Generate reports from incomplete data.
	●	silently ignore errors.
	●	assume modern Windows hardware.
￼
124. FINAL QUALITY STANDARD
The final product should feel like a real commercial POS application.
The user should be able to install it on a supported Windows computer in Egypt and immediately:
	1.	Create the store.
	2.	Create products.
	3.	Add stock to warehouse.
	4.	Transfer stock to store.
	5.	Sell products.
	6.	Print invoices.
	7.	Handle returns.
	8.	Manage suppliers.
	9.	Track customers.
	10.	Track expenses.
	11.	View reports.
	12.	Backup the database.
	13.	Restore the database.
without internet.
￼
125. IMPLEMENTATION INSTRUCTION TO THE AI DEVELOPER
When implementing this project:
	1.	Read the entire specification before coding.
	2.	Do not skip requirements because they appear later.
	3.	Identify contradictions before implementation.
	4.	Choose the simplest robust solution.
	5.	Keep all business-critical logic transaction-safe.
	6.	Explain architectural decisions briefly when they matter.
	7.	Never replace a required feature with a mock.
	8.	Never remove a feature without explicit approval.
	9.	Keep a progress file.
	10.	Keep database migrations versioned.
	11.	Add tests as features are implemented.
	12.	Test on the lowest supported Windows environment.
	13.	Build the installer before declaring the project complete.
	14.	Test installation on a clean Windows machine.
	15.	Test the application with internet disabled.
	16.	Test backup and restore.
	17.	Test printing.
	18.	Test Arabic RTL.
	19.	Test barcode scanners.
	20.	Test real inventory workflows.
￼
126. DEFINITION OF DONE
The project is DONE only when:
	●	Production build exists.
	●	Windows installer exists.
	●	Application launches without developer tools.
	●	Database initializes correctly.
	●	Admin can open a shift with their PIN (no login screen).
	●	Permissions work.
	●	Products work.
	●	Variants work.
	●	Barcodes work.
	●	Batches work.
	●	Expiration works.
	●	FEFO works.
	●	Warehouse works.
	●	Store stock works.
	●	Transfers work.
	●	Purchases work.
	●	Suppliers work.
	●	POS works.
	●	Sales work.
	●	Returns work.
	●	Customers work.
	●	Expenses work.
	●	Cash sessions work.
	●	Reports work.
	●	Printing works.
	●	Backup works.
	●	Restore works.
	●	Audit log works.
	●	Error handling works.
	●	Offline operation works.
	●	Windows compatibility is tested.
	●	Low-spec performance is acceptable.
	●	Database migrations work.
	●	No critical data-loss bugs remain.
￼
127. FIRST DEVELOPMENT TASK
Before writing application code:
	1.	Analyze this specification.
	2.	Produce a concise implementation plan.
	3.	Produce the final database ERD/schema plan.
	4.	Produce the project folder structure.
	5.	Define migration strategy.
	6.	Define inventory transaction strategy.
	7.	Define FEFO strategy.
	8.	Define authentication/permission strategy.
	9.	Define printing strategy.
	10.	Define backup/restore strategy.
	11.	Define Windows compatibility strategy.
	12.	Define test strategy.
Then begin implementation phase by phase.
Do not start by creating random UI screens.
The database model and business rules must be established first.
￼
128. IMPORTANT FINAL INSTRUCTION
This system handles real commercial inventory and money.
Data integrity is more important than visual complexity.
If forced to choose between:
	●	Fancy UI and correct inventory
choose correct inventory.
If forced to choose between:
	●	New feature and reliable backup
choose reliable backup.
If forced to choose between:
	●	More dependencies and simpler offline operation
choose simpler offline operation.
If forced to choose between:
	●	Faster development and maintainable architecture
choose maintainable architecture.
Build a system that a real cosmetics store can depend on every day.

129. POS SCREEN LAYOUT (REQUIRED)
This section is a hard, literal layout requirement for the POS screen — do not redesign it away. It works with the RTL Arabic layout (section 55/89).

Top: Search bar
\t●\tOne large, prominent search input spanning the top of the product area.
\t●\tPlaceholder (Arabic): "ابحث بالاسم أو الباركود"
\t●\tAlways focused by default; barcode scanner input lands here automatically.
\t●\tTyping filters the product grid live (debounced); scanning a barcode adds the matched item to the cart immediately and clears the search box for the next scan.

Directly below the search bar: Category shortcuts
\t●\tA horizontal row (or wrap) of tappable category shortcut chips generated from the real category list — examples: شامبوهات، اكسسوارات، بامبرز، مكياج، عناية بالبشرة، عطور، عناية بالشعر.
\t●\tTapping a shortcut instantly shows all products in that category in the grid below, so a cashier can reach a whole category in one tap instead of typing.
\t●\tShortcuts must be visually distinct (chip/pill style, clear selected state) and remain reachable by keyboard for keyboard-driven cashiers.
\t●\tA product grid (or list) fills the remaining central area, organized and uncluttered: image (if available), name, price, and stock/availability indicator per item, in a consistent card style — not a bare unstyled list.

Left side of the screen: Cart / current invoice panel
\t●\tA dedicated, clearly separated panel fixed to the left side of the screen containing the current invoice: line items (name, quantity, unit price, line total, remove), subtotal, discount, tax if applicable, and grand total.
\t●\tQuantity must be editable inline per line without leaving the cart panel.
\t●\tBelow the cart lines: customer selection, invoice-level discount, hold/resume/cancel invoice actions, and the primary "إتمام البيع" (complete sale) action — large, unmistakable, always visible without scrolling.
\t●\tThe cart panel must stay visually organized even with many line items (its own internal scroll, sticky totals/action buttons at the bottom).

Overall screen requirements
\t●\tThe whole screen must feel purpose-built and organized, not a generic form — clear visual hierarchy between search/categories (top), product browsing (center), and the cart/checkout (left).
\t●\tNo unnecessary scrolling to complete a normal sale: search or tap a category → tap a product (or scan) → adjust quantity if needed → complete sale, all without leaving the screen.
\t●\tRespect section 61 (must remain usable at 1366x768) and section 55's design-quality bar — this layout should look like a purpose-designed retail POS, not a default admin dashboard repurposed for selling.
