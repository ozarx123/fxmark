# Archived one-off scripts

Scripts here are kept for rare recovery scenarios but are **not** part of normal operations.

| Script | Notes |
|--------|--------|
| `cleanup-import-opening-balance-1200-duplicates.js` | Only if **true** duplicate rows (identical clones) on 1200 + `bulk_import`. For repeated `referenceId` with different amounts, use `../migrate-bulk-import-ledger-reference-ids.js` instead. |

Run from **backend** directory: `node scripts/archive/cleanup-import-opening-balance-1200-duplicates.js` (see file header).
