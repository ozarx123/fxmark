# Safe Repair Plan: Wallet vs Ledger Reconciliation (Existing Mismatched Users)

**Context:** After code fixes for idempotency and atomicity, this document describes a **safe, non-destructive** strategy to repair the 4 existing mismatched users. **Do not blindly delete financial history.**

---

## 1. Scope

- **Mismatch type:** `ledgerBalance > walletBalance` (classification: wallet update missing).
- **Root causes (already fixed in code):** duplicate ledger posting, missing wallet update in Bull Run profit path, inconsistent transaction reference for reconciliation.
- **Goal:** For each mismatched user, compute the **correct ledger-derived balance** (after removing duplicate ledger impact), then **set wallet balance to that value** (one-time correction). Optionally report and retain duplicate ledger entries for audit; do not delete them without explicit approval and backup.

---

## 2. Principles

- **Never delete ledger or transaction rows** without a written process and backup.
- **Correct wallet to match “true” ledger:** Identify duplicate ledger entries per economic event, compute correct ledger balance (counting each economic event once), then update `wallets.balance` to that value.
- **Report first:** Generate a repair report (per user: duplicate entries, corrected balance, suggested wallet update) and review before applying.
- **Single write per user:** One update to `wallets` per user: set `balance` to the corrected value (and `updatedAt`).

---

## 3. Per-User Repair Steps

### Step A — Identify duplicate ledger entries (WALLET account only)

For the user’s **WALLET** account (`accountCode = '2110'`):

1. Load all ledger entries for the user, `accountCode = '2110'`.
2. Group by **business key:**  
   `(referenceType, referenceId, credit, debit)`  
   (optionally `pammFundId` for PAMM types).
3. For each group with **count > 1**, treat all but one as **duplicates** (e.g. keep earliest `createdAt` as “canonical”, rest as duplicates).
4. Record:
   - Duplicate entry ids (e.g. `_id` or `id`).
   - Sum of **extra** credit/debit from duplicates (e.g. for 3 identical entries, 2 are duplicate → 2 × (credit − debit) is the over-count).

### Step B — Compute correct ledger balance

- **Correct balance** = (sum of all WALLET credits − sum of all WALLET debits) − (sum of credit − debit from **duplicate** entries only).
- Equivalently: compute balance from **canonical** entries only (one per business key).

### Step C — Compare to current wallet

- **Current wallet balance** = `wallets.balance` for that user/currency.
- **Difference** = correct ledger balance − current wallet balance (should be positive for “wallet update missing”).

### Step D — Generate report (no writes)

For each mismatched user output:

- User id, currency.
- Current wallet balance, current ledger balance (raw), correct ledger balance (after dedup).
- List of duplicate ledger entry ids and amounts.
- Suggested new wallet balance (= correct ledger balance).
- Optional: export duplicate entry ids to a JSON file for audit.

### Step E — Apply correction (after approval)

- **Single update per user:**  
  `db.wallets.updateOne(  
    { userId: <userId>, currency: 'USD' },  
    { $set: { balance: <correctLedgerBalance>, updatedAt: new Date() } }  
  )`
- Do **not** delete or modify ledger or transaction documents in this repair.
- Log the update (user, old balance, new balance, timestamp).

---

## 4. Focus Case: userId = 69b7fb805ad28a8befc6c061

- **Wallet:** 3836.59  
- **Ledger (raw):** 3871.76  
- **Difference:** 35.17  

**Confirmed duplicate:**

- **referenceType:** `pamm_dist`
- **referenceId:** `69b9a8e7b73d4bf3fa96ff2e`
- **amount (credit):** 3.88
- **Duplicate ledger entry ids (WALLET leg):**  
  `69b9ad40b73d4bf3fa96ff44`, `69b9ad40b73d4bf3fa96ff42`, `69b9ad40b73d4bf3fa96ff40`  
  (same event credited 3 times → 2 extra credits of 3.88 each = 7.76 over-count if only this set; remaining difference to 35.17 may be other duplicates or missing wallet updates).

**Exact fix path (conceptually):**

1. List all WALLET ledger entries for user `69b7fb805ad28a8befc6c061`.
2. Group by `(referenceType, referenceId, credit, debit)` (and `pammFundId` for `pamm_dist`).
3. For each group with count > 1, mark all but the earliest as duplicate; sum (credit − debit) for duplicates.
4. Correct ledger balance = raw ledger balance − (sum of (credit − debit) over duplicate entries).
5. Set `wallets.balance` for this user/currency to that corrected balance (one update).
6. Do not delete the duplicate ledger rows; keep for audit.

**Code path that created the duplicate (root cause):**

- **File:** `backend/modules/pamm/distribution.service.js`
- **Function:** `distributeBullRunProfit`
- **Issue:** For Bull Run profit, the code called `ledgerService.postPammDistribution(...)` but **did not** call `walletRepo.updateBalance(...)` or `walletRepo.createTransaction(...)`. So the ledger was updated (and could be hit multiple times if `distributePammPnl` ran more than once for the same position, e.g. race or duplicate close), while the wallet was never updated.
- **Duplicate posting:** `distributePammPnl` (and thus `postPammDistribution`) could run multiple times for the same `positionId` if the position close was processed more than once (e.g. concurrent requests before position was marked closed, or duplicate events). There was no idempotency check, so each run inserted new ledger rows for the same (referenceType, referenceId, amount).
- **Fixes applied in code:**
  1. **Idempotency:** `ledger.service.js` — `postPammDistribution` now checks `existsWalletEntryForEvent(followerId, 'pamm_dist', positionId, credit, debit)` and skips posting if already present.
  2. **Wallet + tx:** `distribution.service.js` — Bull Run profit path now also calls `walletRepo.updateBalance(alloc.followerId, 'USD', investorCredit)` and `walletRepo.createTransaction(..., reference: positionId)` so wallet and transaction stay in sync with ledger.

---

## 5. DB unique index (wallet ledger idempotency)

- **Index:** Partial unique `wallet_event_unique` on `(accountCode, entityId, referenceType, referenceId)` for **WALLET (`2110`)** rows only (`partialFilterExpression`). Defined in `ledger.model.js` as `WALLET_LEDGER_UNIQUE_INDEX`; **not** applied by `ensure-indexes.js` (so existing deployments are not broken if duplicates exist).
- **Creation:** Run `node scripts/ensure-wallet-ledger-unique-index.js` to **report** duplicate WALLET entries by that business key. Run with `--create` to create the index **only when no duplicates exist**; otherwise the script exits with a report and does not create the index.
- **If duplicates exist:** Index creation is blocked. Resolve by: (1) running the repair script (`--dry-run` then `--apply`) to correct wallet balances; (2) optionally resolving duplicate ledger rows via a separate, approved process (this plan does not delete ledger rows); (3) re-run `ensure-wallet-ledger-unique-index.js --create`.
- **Credit/debit not in key:** One economic event = one wallet leg; the same (entityId, referenceType, referenceId) must not appear more than once for WALLET. Including amount would allow same event with different amounts to be stored multiple times; we prevent any second row for the same event.

---

## 6. Repair script usage

**Script:** `scripts/repair-wallet-ledger-mismatch.js`

- **Dry-run (default):**  
  `node scripts/repair-wallet-ledger-mismatch.js`  
  or  
  `node scripts/repair-wallet-ledger-mismatch.js --dry-run`  
  → Lists mismatched users, raw/corrected ledger balance, duplicate groups and entry ids, suggested new wallet balance. No DB writes.

- **Apply:**  
  `node scripts/repair-wallet-ledger-mismatch.js --apply`  
  → For each mismatched user, updates `wallets.balance` and `updatedAt` to the corrected ledger balance. Does **not** delete any ledger or transaction rows.

- **Single user (e.g. focus case):**  
  `node scripts/repair-wallet-ledger-mismatch.js --user=69b7fb805ad28a8befc6c061`  
  `node scripts/repair-wallet-ledger-mismatch.js --user=69b7fb805ad28a8befc6c061 --apply`

- **Export report:**  
  `node scripts/repair-wallet-ledger-mismatch.js --export=report.json`  
  `node scripts/repair-wallet-ledger-mismatch.js --apply --export=report.json`

---

## 7. Monitoring command (ongoing)

**Script:** `scripts/reconcile-wallet-ledger-monitor.js`

- **Human-readable:**  
  `node scripts/reconcile-wallet-ledger-monitor.js`  
  → Reports: mismatch users (wallet vs ledger), duplicate WALLET ledger business keys, orphan refs (ledger without tx / tx without ledger). No fixes applied.

- **JSON:**  
  `node scripts/reconcile-wallet-ledger-monitor.js --json`

Run periodically (e.g. cron or after deployments) to detect new mismatches or duplicates.

---

## 8. Focus-case expected corrected result path

- **User:** `69b7fb805ad28a8befc6c061`
- **Run:**  
  `node scripts/repair-wallet-ledger-mismatch.js --user=69b7fb805ad28a8befc6c061`
- **Expected output (dry-run):**  
  - Wallet balance: 3836.59  
  - Raw ledger balance: 3871.76  
  - Corrected ledger balance: (3871.76 − total excess from all duplicate groups)  
  - Duplicate adjustment: sum of excess amounts per duplicate group  
  - At least one duplicate group with `referenceType: pamm_dist`, `referenceId: 69b9a8e7b73d4bf3fa96ff2e`, three entry ids including `69b9ad40b73d4bf3fa96ff44`, `69b9ad40b73d4bf3fa96ff42`, `69b9ad40b73d4bf3fa96ff40`, excess 7.76 (2 × 3.88) for that group.  
- **Apply:**  
  `node scripts/repair-wallet-ledger-mismatch.js --user=69b7fb805ad28a8befc6c061 --apply`  
  → Sets wallet balance to the corrected ledger balance; duplicate ledger rows are left in place.

---

## 9. Reference alignment (reconciliation matching)

Keep these rules so ledger and transaction records can be matched:

- **admin_credit:** ledger `referenceId` = transaction id; transaction `reference` = same id (txId).
- **deposit:** ledger `referenceId` = depositId; transaction `reference` = depositId on confirm.
- **withdrawal:** ledger `referenceId` = withdrawalId; transaction `reference` = withdrawalId on process.
- **pamm_dist:** ledger `referenceId` = positionId; transaction `reference` = positionId.

Any new wallet-affecting code paths must set transaction `reference` to the same value used as ledger `referenceId` for that event.

---

## 10. Summary

| Step | Action |
|------|--------|
| 1 | Identify duplicate WALLET ledger entries by business key. |
| 2 | Compute correct ledger balance (deduplicated). |
| 3 | Report: current wallet, raw ledger, correct balance, duplicate ids. |
| 4 | After approval: single `wallets` update per user to correct balance. |
| 5 | Do not delete ledger or transaction records; retain for audit. |

This preserves all legitimate financial history and only corrects the stored wallet balance to match the intended single-pass ledger state.

---

## 11. Business key for duplicates

Duplicate detection and the DB unique index use the same business key: **accountCode, entityId, referenceType, referenceId** (no credit/debit, no pammFundId). One row per (user, type, refId) for the WALLET account.
