# WALLET ledger duplicate business-key investigation (read-only)

**Scope:** 11 duplicate groups on `ledger_entries` where `accountCode` = `2110` (WALLET).  
**Business key:** `accountCode` + `entityId` + `referenceType` + `referenceId` (matches intended unique index `wallet_event_unique`).

**Note:** `orderId` is not present on these rows. **`referenceId`** is the ledger business id; for **`pamm_dist`** it is the **closed position id**.

**Follow-up (Type B, post–Type A cleanup):** [WALLET_LEDGER_TYPE_B_DUPLICATE_PLAN.md](./WALLET_LEDGER_TYPE_B_DUPLICATE_PLAN.md)

---

## 1. Duplicate group table

| # | referenceType | referenceId (≈ position) | entityId (investor) | Rows | credit (each) | debit | createdAt window | pammFundId |
|---|---------------|--------------------------|---------------------|------|----------------|-------|------------------|------------|
| 1 | `pamm_dist` | `69b8eae93f1a86aa75dcb5fe` | `699f291212a35103f3f0a869` | 2 | 57.38 | 0 | 2026-03-17 05:48:07.046Z → .108Z (~62 ms) | `69b83f299aacda0c6343b693` |
| 2 | `pamm_dist` | `69b8eae93f1a86aa75dcb5fe` | `699cb012383e9f4609083a31` | 2 | 8.62 | 0 | 05:48:07.211Z → .265Z (~54 ms) | same |
| 3 | `pamm_dist` | `69b8eae83f1a86aa75dcb5fc` | `699f291212a35103f3f0a869` | 2 | 101.57 | 0 | 05:48:50.069Z → .095Z (~26 ms) | same |
| 4 | `pamm_dist` | `69b8eae83f1a86aa75dcb5fc` | `699cb012383e9f4609083a31` | 2 | 15.25 | 0 | 05:48:50.213Z → .261Z (~48 ms) | same |
| 5 | `trade` | `69b865651f2db42ad31f561a` | `699f291212a35103f3f0a869` | 2 | 13.0263… | 0 | 09:32:00.744Z → .748Z (~4 ms) | null |
| 6 | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | `69b7fb805ad28a8befc6c061` | 3 | 3.88 | 0 | 19:36:32.604Z → .618Z (~14 ms) | same fund |
| 7 | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | `69a02aa64655692fb6ae960f` | 3 | 53.77 | 0 | 19:36:33.026Z → .035Z (~9 ms) | same |
| 8 | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | `699f291212a35103f3f0a869` | 3 | 36.82 | 0 | 19:36:33.482Z → .513Z (~31 ms) | same |
| 9 | `pamm_dist` | `69b9a8e7b73d4bf3fa96ff2e` | `699cb012383e9f4609083a31` | 3 | 5.53 | 0 | 19:36:33.781Z → .816Z (~35 ms) | same |
| 10 | `pamm_dist` | `69ba6e27eada85998ce727d0` | `69b7fb805ad28a8befc6c061` | 3 | 4.03 | 0 | 2026-03-18 09:20:12.354Z → .377Z (~23 ms) | same |
| 11 | `pamm_dist` | `69ba6e27eada85998ce727d0` | `69a02aa64655692fb6ae960f` | 3 | 55.92 | 0 | 09:20:13.617Z → .645Z (~28 ms) | same |

All rows: `description` / `reference` null; `currency` USD.

---

## 2. Classification (each group)

| # | Classification |
|---|------------------|
| 1–4 | **True accidental duplicate** — same `entityId` + `referenceType` + `referenceId`, **identical** amounts, timestamps **milliseconds** apart. Intended model is **one** WALLET line per investor per closed position distribution. |
| 5 | **True accidental duplicate** — live **`trade`** P&L credit to wallet; **identical** amounts, **4 ms** apart. Same idempotency key posted twice. |
| 6–9 | **PAMM distribution implementation issue** (same as accidental duplicate at data level): one position (`69b9a8e7…`), **three** identical ledger lines per investor within tens of ms — consistent with **triple post** in one distribution run (retry/concurrency/loop), **not** a valid “three different business events” under the current key. |
| 10–11 | Same as 6–9 for position `69ba6e27…`: **triple duplicate** per affected investor. |

**Not** “valid multiple business rows sharing the same key by design”: ledger helpers treat this key as **idempotent one event**.  
**Not** random **data corruption** (garbled fields): rows are **perfect clones** (amounts match exactly).  
**Root cause class:** **double/triple application** of the same posting path before DB uniqueness enforced.

---

## 3. Safe cleanup recommendation (per group)

**General rule:** For each group, economic intent is **one** net WALLET movement for that `(entityId, referenceType, referenceId)`. Duplicates are **excess** ledger credits.

| # | Recommendation |
|---|----------------|
| 1–5 | **Keep earliest** row by `createdAt` (or minimum `_id` if tied); **remove** the later duplicate(s) **only after** finance agrees one credit was intended **and** you reconcile **wallet transactions** + **`wallets.balance`** (ledger sum will drop when extras are removed). |
| 6–11 | Same as above, but **two** extras per investor (three rows → keep one). **Strongly** reconcile whether **wallet** and **`pamm_dist`** txs were also written 2–3×; if wallet only moved once, ledger overstates until deduped. |

**Alternatives (when deletion is uncomfortable):**

- **Compensating entries:** Post offsetting debits to WALLET (and matching contra) per duplicate amount, with a clear `referenceType` like `ledger_correction` — **manual finance review** to approve amounts and narrative.
- **Change business key design:** e.g. include `allocationId` or a unique `distRunId` — **future** prevention only; **does not** fix existing duplicates without migration rules.

---

## 4. Which groups can be auto-cleaned safely?

**None should be auto-deleted with zero human checks**, because:

- Removing duplicate **ledger** rows **lowers** summed WALLET ledger balance for those users.
- **`wallets.balance`** and **`wallet_transactions`** may or may not match that over-posting (depends how many times the app updated the wallet for each duplicate).

**Conditionally safe automation (after checks):**

- **Groups 1–5 (pairs only):** Good candidates for a **scripted** “keep first, delete rest” **after** a dry-run report shows wallet txs and balances align with **one** economic event (or you explicitly accept post-dedup + `repair-wallet-ledger-mismatch` under supervision).
- **Groups 6–11 (triples):** Same logic, but **higher** financial impact if wallets were only credited once — **verify txs** per `reference` = `referenceId` (position id) and type `pamm_dist` before any delete.

---

## 5. Which groups require manual finance review?

| # | Manual review |
|---|----------------|
| **All 11** | Confirm **intended** credit is **one** per `(entity, event)` and approve whether correction is **delete duplicates** vs **compensating entries**. |
| **6–11** | **Higher priority** — triple ledger lines; must confirm **customer wallet** and **transaction history** before changing ledger. |
| **5** (`trade`) | Confirm **single** close P&L for that position for that user (no partial close / split that could justify two lines — data says **identical** clones, so still duplicate). |

---

## Safe next steps (no deletes / no index / no balance changes until approved)

1. For each `(entityId, referenceId)` in the table, query **`wallet_transactions`** for type **`pamm_dist`** or **`trade`** and `reference` matching the position id — **count** rows vs ledger row count.
2. Compare **`wallets.balance`** to **ledger WALLET net** (e.g. `scripts/reconcile-wallet-ledger-audit.js` or `repair-wallet-ledger-mismatch.js` **dry-run** only).
3. After sign-off: dedupe ledger (keep one row per business key) **or** post compensating entries; then `node scripts/ensure-wallet-ledger-unique-index.js` (must report zero duplicates); then `node scripts/ensure-wallet-ledger-unique-index.js --create`; then optionally `FINANCE_ENSURE_WALLET_LEDGER_INDEX=1`.

---

## Related scripts

- `scripts/ensure-wallet-ledger-unique-index.js` — duplicate report / conditional index create  
- `scripts/repair-wallet-ledger-mismatch.js` — wallet vs ledger (does not delete ledger)  
- `docs/FINANCIAL_TRANSACTION_ARCHITECTURE.md` — paired wallet+ledger flows  
