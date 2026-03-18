# Company Super Wallet

The **company super wallet** is the platform’s main ledger and wallet. It is **owned by the company**, not by any user or superadmin. All company income, expenses, liabilities, and assets connect to this entity.

## Entity

- **Entity ID:** `company` (constant: `ENTITY_COMPANY` in `chart-of-accounts.js`)
- Ledger entries for Cash/Bank (1200), Commission Income (4200), Commission Paid (5100), Trading P&L (6110), etc. use `entityId: 'company'`.
- Legacy entries may still use `entityId: 'SYSTEM_ACCOUNT'`; the ledger repository treats both as the company when querying by `ENTITY_COMPANY`.

## Wallet

- A wallet document with `userId: 'company'` can exist in the `wallets` collection (same schema as user wallets).
- Created on first use via `getOrCreateWallet(ENTITY_COMPANY, 'USD')` from admin-only code.
- **Displayed balance**: The company wallet balance shown in the admin API and UI is **ledger-derived**: it equals the company entity’s **Cash/Bank (1200)** balance. All company cash is held in that ledger account (deposits debit 1200, withdrawals credit 1200). The `wallets` document balance is not used for display; the ledger is the source of truth.

## Access

- **Superadmins and admin-panel roles** have full access: company financials, ledger drill-down, and **GET /api/admin/finance/company-wallet**.
- **End users** cannot access the company entity: wallet and finance routes use `req.user.id`, and a defensive check blocks `userId === ENTITY_COMPANY` on the wallet API.

## Migration

To normalize existing ledger data to the company entity:

```bash
node scripts/migrate-ledger-entity-to-company.js
```

This updates all `ledger_entries` with `entityId: 'SYSTEM_ACCOUNT'` to `entityId: 'company'`.
