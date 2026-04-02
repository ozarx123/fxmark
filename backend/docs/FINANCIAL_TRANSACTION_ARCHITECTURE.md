# Wallet ↔ ledger architecture (production)

## Principles

1. **Customer fund movements** that hit both `wallets.balance` and `ledger_entries` (WALLET account `2110`) must use a **single MongoDB transaction** where the platform supports it (replica set / Atlas).
2. **Central entry points** live in `modules/finance/financial-transaction.service.js` (`atomicInternalTransfer`, `atomicImportOpeningBalanceInSession`, plus post-commit hooks).
3. **Idempotency**: ledger helpers use `existsWalletEntryForEvent` / unique business keys; transfers use stable `referenceId` values (`xfer|...` or client `idempotencyKey`).
4. **Post-commit verification**: `verifyWalletLedgerAfterMutation` runs after deposits, withdrawals, admin credits, transfers, bulk import opening balance, live trade close, profit adjustments, and PAMM IB commission credits. **Mismatches are logged only** (JSON + stack trace); wallet balance is **not** auto-corrected.
5. **Wallet guard**: `wallet.repository` throws `WALLET_GUARD_UNPAIRED` unless mutations run inside `financialTransactionService.runPairedWithTransaction` / `runWithPairedWalletLedgerContext`, or `bypassPairedGuard: true` (scripts/tests only).

## Environment variables

| Variable | Effect |
|----------|--------|
| `FINANCE_ENSURE_WALLET_LEDGER_INDEX=1` | On server start (after Mongo ping), if **no duplicate WALLET ledger keys** exist, create **partial** unique index `wallet_event_unique` on WALLET (`2110`) only (same definition as `scripts/ensure-wallet-ledger-unique-index.js`). |

## Future: ledger as single source of truth

Today the UI still reads **wallet API** for spendable balance. A later migration can:

- Derive available balance from ledger WALLET ± pending holds, or  
- Maintain wallet as a **projection** updated only through **paired** flows: `financial-transaction.service.js` (`runPairedWithTransaction`, `syncWalletToLedgerAfterMutation`, `atomicInternalTransfer`, etc.). Direct `updateBalance` outside paired context is blocked by the repository guard.

## MongoDB transactions

Local **standalone** MongoDB does not support multi-document transactions. Use **Atlas** or a replica set for development if you exercise transfer / import / live close paths.

## Related

- **`docs/WALLET_LEDGER_WORKFLOW_REPORT.md`** (repo root) — workflow diagrams and flow-by-flow mapping to modules; PDF via `npm run report:wallet-ledger` in `docs/architecture`.
