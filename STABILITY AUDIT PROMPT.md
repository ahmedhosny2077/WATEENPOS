STABILITY & RELIABILITY AUDIT — RUN THIS AGAINST THE EXISTING, ALREADY-WORKING APPLICATION

Context: The application is already built and working well in daily use, with a real dataset (25,000+ products already entered). This is not a request to redesign or change behavior — it is a stability audit. Go through every point below, actually test it against the current codebase and a copy of the real database, report what you find, and fix only what is genuinely broken or risky. Do not refactor working code "for style" — the goal is long-term stability, not a rewrite.

For every point: test it for real (don't assume it's fine), report PASS/FAIL with what you found, and if FAIL, fix it and re-test.

1. DATA INTEGRITY UNDER FAILURE
- Simulate power loss / force-kill the app mid-transaction (mid-sale, mid-purchase-invoice, mid-stock-transfer, mid-return). Confirm the database never ends up in a half-written state — every multi-step operation must be wrapped in a single atomic database transaction with proper rollback.
- Force-kill the app while a backup or restore is in progress. Confirm it never leaves a corrupted database file behind, and the app can still start normally afterward.
- Confirm every write path that touches stock (sale, return, transfer, purchase, manual adjustment) goes through the stock ledger — no code path that updates a "current stock" number directly without a ledger entry.

2. STOCK ACCURACY AT SCALE
- On a full copy of the real 25,000+ product database: pick a random sample of ~50 products across different categories/batches, manually recompute their stock from the full ledger history, and confirm it matches what the app displays. Any mismatch is a critical bug.
- Check for orphaned or duplicate ledger entries (e.g. from a past bug, a canceled update, or an interrupted operation) that could be silently inflating or deflating stock over time.
- Confirm FEFO batch selection still behaves correctly at this data volume (correct batch picked, no batch skipped or double-counted).

3. PERFORMANCE AT THE ACTUAL DATA SCALE (not a small test dataset)
- Measure and report actual timings on the real ~25,000+ product database:
  - POS search-as-you-type latency (should feel instant, ideally <150ms).
  - Product list / inventory screen load and scroll performance.
  - Reports covering a full year of sales history.
  - App cold-start time.
- If any of these have degraded compared to when the dataset was smaller, identify the cause (missing index, N+1 query, loading full tables into memory, etc.) and fix it. Confirm proper indexes exist on every column used in POS search, filters, and sorting.
- Check the database file size and confirm nothing is bloating it unnecessarily (e.g. unbounded audit log growth, orphaned image blobs, uncompacted deleted rows).

4. LONG-RUNNING SESSION STABILITY
- Leave the app open and idle for several hours, then resume normal use — confirm no memory growth, no frozen UI, no stale cached data (e.g. stock numbers that don't reflect a later change).
- Run a long POS session (hundreds of sales in one sitting, one shift) and check for memory growth (potential leak) or slowdown over time.
- Confirm the SQLite connection/pool recovers cleanly from being locked or busy (e.g. a backup running while a sale is being processed) instead of throwing an unhandled error.

5. CONCURRENCY (if more than one device/window can write at once)
- If multiple POS windows/devices are possible, run two simultaneous sales of the same low-stock item and confirm stock cannot go negative (or negative-stock behavior matches the configured setting) and neither sale is silently lost.
- Confirm database locking/retry logic exists for SQLite write contention (SQLite allows only one writer at a time) so a second write waits and succeeds instead of failing with an error the user sees.

6. PRINTING RELIABILITY
- Disconnect the thermal printer mid-sale, print with no paper, and print to a printer that was removed from Windows since last used. Confirm the sale always completes and is saved regardless, with a clear error and a manual reprint option — never a silent failure and never a rollback of a completed sale.
- Confirm the silent-printing requirement (no OS print dialog) still holds after all the recent changes.

7. BACKUP & RESTORE INTEGRITY
- Take a backup of the real, full-size database, restore it into a clean environment, and verify the restored data is byte-for-byte/row-for-row consistent with the original (spot-check counts of products, sales, and stock ledger entries).
- Confirm backups of this real data size complete in a reasonable time and don't block or freeze the POS during the backup.
- Confirm old backups are pruned/retained according to the configured retention setting, and disk space doesn't grow unbounded over months of daily backups.

8. UPGRADE PATH
- Take the current production database (with the real data), simulate installing a new version over it, and confirm every past database migration still applies cleanly to this real, larger dataset without data loss or corruption.
- Confirm the app never silently skips a failed migration — it must stop and clearly report the failure rather than starting up against a half-migrated schema.

9. EDGE CASES WORTH RE-CHECKING AT THIS SCALE
- Duplicate or near-duplicate barcodes across the 25,000+ products — confirm the app never lets a scan silently match the wrong product.
- Products with no stock, negative stock (if it can happen), or expired batches — confirm they behave correctly in search, POS, and reports rather than crashing or being silently hidden.
- Very long product names, Arabic/English mixed names, and special characters in the real dataset — confirm they render and print correctly everywhere (POS, receipt, reports) with no layout breakage.

10. ERROR HANDLING & CRASH RECOVERY
- Review all major operations for unhandled exceptions — no operation should be able to crash the whole app; every failure should be caught, logged, and shown to the user as a clear message.
- If the app does crash or is force-closed, confirm it always reopens cleanly afterward with no corrupted state, no stuck locks, and no lost data beyond the single in-progress operation.

DELIVERABLE
For each of the 10 sections above, provide a short report: what was tested, the result, and (for anything fixed) what was changed and how it was re-verified. Do not mark anything as passing without actually having tested it against the real database and application.
