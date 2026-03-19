# Type B WALLET ledger duplicates — read-only analysis & repair plan

**Status:** Type B ledger dedupe **executed** via `scripts/cleanup-type-b-wallet-ledger-duplicates.js --apply` (WALLET + paired TRADING_PNL only; **no** `wallets.balance` / `wallet_transactions` changes).  
**TRADING_PNL company leg:** this DB used `entityId: 'system'` (lowercase); the cleanup script matches `company`, `SYSTEM_ACCOUNT`, and `system`.

**Before creating `wallet_event_unique`:** run `node scripts/ensure-wallet-ledger-unique-index.js` (expect **0** duplicate groups), then `node scripts/ensure-wallet-ledger-unique-index.js --create` if approved.

**Context:** Remaining duplicate WALLET business-key groups are Type B style: duplicate `ledger_entries` (2110) rows exist; matching `wallet_transactions` for the same `(userId, type, reference)` are **missing**.

---

## 1. Remaining duplicate group table (WALLET `accountCode` 2110)

There are **8** duplicate business-key groups (all **`pamm_dist`**).

| # | entityId | referenceType | referenceId | Rows | credit (each) | debit | createdAt (first → last) | pammFundId |
|---|----------|---------------|-------------|------|---------------|-------|---------------------------|------------|
| B1 | `699f291212a35103f3f0a869` | `pamm_dist` | `69b8eae93f1a86aa75dcb5fe` | 2 | 57.38 | 0 | 05:48:07.046Z → 05:48:07.108Z | `69b83f299aacda0c6343b693` |
| B2 | `699cb012383e9f4609083a31` | `pamm_dist` | `69b8eae93f1a86aa75dcb5fe` | 2 | 8.62 | 0 | 05:48:07.211Z → 05:48:07.265Z | same |
| B3 | `699f291212a35103f3f0a869` | `pamm_dist` | `69b8eae83f1a86aa75dcb5fc` | 2 | 101.57 | 0 | 05:48:50.069Z → 05:48:50.095Z | same |
| B4 | `699cb012383e9f4609083a31` | `pamm_dist` | `69b8eae83f1a86aa75dcb5fc` | 2 | 15.25 | 0 | 05:48:50.213Z → 05:48:50.261Z | same |
| B5 | `69b7fb805ad28a8befc6c061` | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | 3 | 3.88 | 0 | 19:36:32.604Z → 19:36:32.618Z | same |
| B6 | `69a02aa64655692fb6ae960f` | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | 3 | 53.77 | 0 | 19:36:33.026Z → 19:36:33.035Z | same |
| B7 | `699f291212a35103f3f0a869` | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | 3 | 36.82 | 0 | 19:36:33.482Z → 19:36:33.513Z | same |
| B8 | `699cb012383e9f4609083a31` | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | 3 | 5.53 | 0 | 19:36:33.781Z → 19:36:33.816Z | same |

### Ledger row `_id`s (sorted oldest first)

- **B1:** `69b8eb173f1a86aa75dcb609`, `69b8eb173f1a86aa75dcb60b`
- **B2:** `69b8eb173f1a86aa75dcb60d`, `69b8eb173f1a86aa75dcb60f`
- **B3:** `69b8eb423f1a86aa75dcb613`, `69b8eb423f1a86aa75dcb615`
- **B4:** `69b8eb423f1a86aa75dcb617`, `69b8eb423f1a86aa75dcb619`
- **B5:** `69b9ad40b73d4bf3fa96ff40`, `69b9ad40b73d4bf3fa96ff42`, `69b9ad40b73d4bf3fa96ff44`
- **B6:** `69b9ad41b73d4bf3fa96ff49`, `69b9ad41b73d4bf3fa96ff4b`, `69b9ad41b73d4bf3fa96ff4d`
- **B7:** `69b9ad41b73d4bf3fa96ff52`, `69b9ad41b73d4bf3fa96ff54`, `69b9ad41b73d4bf3fa96ff56`
- **B8:** `69b9ad41b73d4bf3fa96ff58`, `69b9ad41b73d4bf3fa96ff5a`, `69b9ad41b73d4bf3fa96ff5c`

---

## 2. Wallet impact analysis (per group)

| Group | Exact: `userId` + `type` + `reference`≈`referenceId` | ±5s, `type=pamm_dist` | Broader check (main user) |
|-------|------------------------------------------------------|-------------------------|----------------------------|
| B1–B8 | **0** rows | **0** | For `699f291212a35103f3f0a869`: **no** `wallet_transactions` in 05:47:30–05:51:00Z or 19:35:30–19:37:30Z (**any** type) |

**Interpretation**

- **Transaction log:** No rows keyed to these events; no nearby `pamm_dist` in tight windows → closest to **A – not moved at all** in **provable** customer history.
- **Balance deltas:** Not reconstructable without snapshots → **D – unclear** for **balance** proof alone.

**Classification (A/B/C/D)**

- **A:** ledger duplicated + **no** matching/nearby wallet tx evidence → **all 8** (with **D** caveat on balance).

---

## 3. Main user `699f291212a35103f3f0a869` — duplicate `referenceId`s & impact

| Rank | referenceId | Dup rows | Per-row credit | Excess ledger net (keep 1 row) |
|------|---------------|----------|----------------|--------------------------------|
| 1 | `69b8eae83f1a86aa75dcb5fc` | 2 | 101.57 | **101.57** |
| 2 | `69b9a8e7b73d4bf3fa96ff2e` | 3 | 36.82 | **73.64** |
| 3 | `69b8eae93f1a86aa75dcb5fe` | 2 | 57.38 | **57.38** |

**Sum of excess WALLET-2110 credits** (one row kept per key): **232.59 USD**.

**Snapshot (post Type A, pre Type B)**

| Field | Value |
|-------|--------|
| `wallets.balance` (USD) | 14643.9973 |
| Ledger WALLET net | 14799.9888 |
| wallet − ledger | **−155.99** |

Removing duplicate-only ledger credits **without** changing wallet **lowers** ledger toward wallet (order-of-magnitude: ~14800 → ~14567 vs wallet ~14644). Supports “ledger overstated vs wallet” but **does not** prove wallet never moved without tx → **no blind delete** without approval.

---

## 4. Safe repair recommendation (one action per group)

If finance agrees these are **pure duplicate journals** (identical amounts, same key, ms apart), **do not** use compensating entries.

**Recommended action (B1–B8):**

1. **WALLET (2110):** keep **earliest** row per business key; delete the rest.
2. **TRADING_PNL (4100):** in the **same** change-set, delete matching duplicate legs on **company / `SYSTEM_ACCOUNT`** (`entityId` ∈ `{ company, SYSTEM_ACCOUNT }` — this DB uses **`SYSTEM_ACCOUNT`**), same `referenceType`, `referenceId`, `pammFundId`, **debit = WALLET credit**, **credit = 0**; keep earliest, delete extras. Count removed **must** equal WALLET rows removed.

**Not recommended:** blind `wallets.balance` adjustment until ledger is correct and reconcile **dry-run** is reviewed.

---

## 5. Auto-repair eligibility

| Category | Groups |
|----------|--------|
| Strong evidence for **scripted ledger+PNL dedupe** (after written approval) | **B1–B8** |
| **Not** safe unattended | **All** — require pre-delete count checks and ideally Mongo transaction |
| Manual finance approval | **All** if policy requires sign-off on ledger delete |

**Do not** auto-repair wallet balance in this phase.

---

## 6. Manual review

- Default: **approval-gated** for all 8.
- Extra review if someone claims customers were credited **without** `wallet_transactions`.

---

## 7. Exact repair plan (execution checklist)

### Per group (B1–B8)

1. **WALLET leg** — **Keep:** first `_id` in §1 table; **Remove:** remaining `_id`s in that group.
2. **TRADING_PNL leg** — Query as above; **Keep:** oldest; **Remove:** N−1 (pairs) or N−2 (triples); **assert** removed PNL count = removed WALLET count.
3. **`wallet_transactions`** — **None** to delete for these keys; **do not** change `wallets.balance` in this step.

### After repair (verification only)

- `node scripts/ensure-wallet-ledger-unique-index.js` — duplicate count should drop.
- `node scripts/repair-wallet-ledger-mismatch.js` — **dry-run** per affected `entityId`.
- **Do not** create unique index until **zero** duplicates.
- **Do not** `repair-wallet-ledger-mismatch.js --apply` until finance approves.

### Suggested execution order (when approved)

1. **B1–B4** (two positions, two investors).
2. **B5–B8** (one position `69b9a8e7…`, four investors — verify PNL sets per amount **3.88 / 53.77 / 36.82 / 5.53**).

---

## Related docs & scripts

- [WALLET_LEDGER_DUPLICATE_INVESTIGATION.md](./WALLET_LEDGER_DUPLICATE_INVESTIGATION.md) — original 11-group investigation.
- [FINANCIAL_TRANSACTION_ARCHITECTURE.md](./FINANCIAL_TRANSACTION_ARCHITECTURE.md)
- `scripts/cleanup-type-a-wallet-duplicates.js` — **Type A** executed pattern (WALLET + paired PNL).
- `scripts/ensure-wallet-ledger-unique-index.js`
- `scripts/repair-wallet-ledger-mismatch.js`

---

## Compliance note

This document records **analysis and planned steps** only. **No deletes**, **no balance writes**, and **no unique index** creation are implied by storing this file.
