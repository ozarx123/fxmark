# PAMM Bull Run IB Commission – Inspection Report

**Case:** infomarkdesign@gmail.com (referred by wecorpdigital@gmail.com). Normal trading commission credits wecorpdigital; Bull Run PAMM profit commission does not.

**Scope:** Inspection and trace only. No logic fixes applied. Temporary `[pamm-ib-debug]` logs added for next run.

---

## 1. Referral relationship status

- **Code expectations:**
  - **infomarkdesign** must exist in `users` with `_id` (ObjectId or string).
  - **wecorpdigital** must exist in `users` with its own `_id`.
  - **infomarkdesign.referrerId** must point to wecorpdigital’s user id (same id used as `userId` in IB profile).
  - **wecorpdigital** must have an IB profile in `ib_profiles` with `userId` equal to that same id (ObjectId or string; repo accepts both).

- **Confirmation:** Not verified against the live DB in this inspection. Normal trading commission working implies that for the **trader** user id (infomarkdesign when they trade directly), `getUplineChainForClient(userId)` returns wecorpdigital. So for direct trading, infomarkdesign’s user id format and referrerId/IB setup are valid.

- **Conclusion:** Referral/IB setup is consistent for the **direct trading** path. The open question is whether **PAMM** passes the same user id format as **alloc.followerId** when resolving the IB chain.

---

## 2. Normal trading commission path status

- **Entry:** `backend/modules/trading/positions.service.js` – on full position close (non-PAMM or PAMM path that doesn’t use Bull Run IB), when position has volume, it calls:
  - `ibRepo.getUplineChainForClient(userId)` where **userId = position owner** (the trader).
  - `commissionEngine.calculateForHierarchy(trade, ibIds, userId)` to credit volume-based commission.

- **Why it works for infomarkdesign:** When infomarkdesign closes a **direct** trade, `userId` is the position’s owner id (infomarkdesign’s user id). That same id is used in `getUplineChainForClient(userId)`, so the chain resolves to wecorpdigital and commission is credited. So the normal path is **separate** and **working**; no change suggested there.

---

## 3. Bull Run commission path trace

Step-by-step from closed profitable Bull Run trade:

| Step | Location | What happens |
|------|----------|--------------|
| 1 | `positions.service.js` | On full close, if `account?.type === 'pamm'`, calls `distributionService.distributePammPnl(userId, positionId, pnl, targetAccountId, position)` with `targetAccountId = pos.accountId \|\| accountId`. Here **userId = PAMM manager**, not the investor. |
| 2 | `distribution.service.js` → `distributePammPnl(managerId, positionId, pnl, accountId, position)` | Resolves fund: `getFundByTradingAccountId(accountId) \|\| getManagerByUserId(managerId)`. Gets **fundId**, loads **allocations** with `listAllocationsByManager(fundId, { status: 'active' })`. |
| 3 | Same | `isBullRunFund(manager)` is true if `manager.name` (uppercase) === `'BULL RUN'` or `fundType === 'ai'`. For profit, calls `distributeBullRunProfit(...)`. |
| 4 | `distributeBullRunProfit` | For each allocation with `investorCredit > 0.001`, does ledger/wallet for investor; then if `activeCapital > 0.001` calls **`processPammIbCommissionOnTradeClose(alloc.followerId, activeCapital, fundId, positionId)`**. So **investorId = alloc.followerId**. |
| 5 | `pamm-ib-commission.service.js` → `processPammIbCommissionOnTradeClose(investorId, ...)` | Early exit if any arg missing or capital ≤ 0. Then **`ibIds = getUplineChainForClient(investorId)`**. |
| 6 | `ib.repository.js` → `getUplineChainForClient(clientUserId)` | Looks up **user** by `clientUserId`: first `_id: new ObjectId(idStr)` if 24-char valid ObjectId, else `_id: idStr`. If no user or no **user.referrerId**, returns **[]**. Otherwise walks IB profiles from **referrerId** via **parentId** and returns chain of IB **userId**s. |
| 7 | `pamm-ib-commission.service.js` | If **ibIds.length === 0**, logs `[pamm-ib] No IB chain for investor ...` and **returns**; no commission. Otherwise uses PAMM IB settings, slices to 3 levels, and for each enabled level: wallet credit, transaction, ledger post. |

Critical point: the **investor** in the Bull Run path is identified only by **alloc.followerId**. The chain is built from that id. So:

- **alloc.followerId** must be the same value/type as the **user _id** that has **referrerId** set and that is used in normal trading for infomarkdesign.
- If **followerId** is stored differently (e.g. email, or different id type), **getUplineChainForClient(investorId)** will not find the user (or will find a different one), and the chain can be empty → no Bull Run IB commission.

---

## 4. Exact break point

The failure occurs when **`getUplineChainForClient(investorId)`** returns an empty array in the PAMM Bull Run path, so **`processPammIbCommissionOnTradeClose`** exits without crediting.

Most likely causes at that point:

1. **User not found:** Lookup by `investorId` (= `alloc.followerId`) fails (e.g. `followerId` is not the user’s `_id` – wrong type or value).
2. **No referrerId:** User found but `user.referrerId` is null/undefined.
3. **Referrer has no IB profile:** First referrer id has no row in `ib_profiles`, so the chain never starts.

The fact that **normal** commission works for infomarkdesign implies that when the **same** user id (as used for the position owner in direct trading) is passed to `getUplineChainForClient`, the chain is non-empty. So the break is specifically that **alloc.followerId** in the Bull Run path is either not equal to that user id or not in a form the repository accepts (e.g. ObjectId vs string, or stored as email).

---

## 5. Root cause

- **Root cause:** In the Bull Run PAMM flow, the IB chain is resolved using **alloc.followerId** as the client user id. If **followerId** is not the same as the investor’s **user _id** (value and/or type), or if the allocation was created with a different identifier (e.g. email), **getUplineChainForClient** returns [] and PAMM IB commission is never credited.
- **Secondary possibility:** Data issue (referrerId or IB profile missing) specific to how the investor is stored in PAMM context; less likely given normal commission works for the same referred client.

---

## 6. Files / functions involved

| File | Functions / spots |
|------|--------------------|
| `backend/modules/trading/positions.service.js` | Position close handling; call to `distributePammPnl(..., targetAccountId, ...)`. |
| `backend/modules/pamm/distribution.service.js` | `distributePammPnl`, `isBullRunFund`, `distributeBullRunProfit`; call to `processPammIbCommissionOnTradeClose(alloc.followerId, ...)`. |
| `backend/modules/ib/pamm-ib-commission.service.js` | `processPammIbCommissionOnTradeClose`; call to `getUplineChainForClient(investorId)`; early return when `ibIds.length === 0`. |
| `backend/modules/ib/ib.repository.js` | `getUplineChainForClient(clientUserId)` – user lookup by _id, referrerId, then IB profile chain. |
| `backend/modules/pamm/pamm.repository.js` | `getFundByTradingAccountId`, `listAllocationsByManager` (source of `alloc.followerId`). |
| `backend/modules/pamm/pamm.service.js` | `follow` → `createAllocation(followerId, fundId, amount)` – defines how **followerId** is stored (from API/auth, typically `req.user.id`). |

---

## 7. Whether the issue is due to

- **Data problem:** Possible (e.g. referrerId or IB profile missing for the id used in PAMM).
- **ID type mismatch:** **Most likely.** `alloc.followerId` might be string while `users._id` is ObjectId (or vice versa), or `followerId` might be email/other and not match `_id` at all.
- **Missing settings:** Unlikely; if the chain were non-empty, PAMM IB settings would be used; the log shows “No IB chain” exit.
- **Logic bug:** Possible (e.g. wrong id passed into Bull Run IB path); trace shows the only client id used for the chain is `alloc.followerId`.
- **Wallet/ledger issue:** Only after chain is non-empty; currently execution never reaches wallet/ledger credit for Bull Run IB because the chain is empty.

---

## 8. Minimal safe fix recommendation

1. **Verify data:** Run one Bull Run close with the added `[pamm-ib-debug]` logs. Confirm:
   - `alloc.followerId` and its type for infomarkdesign.
   - Whether `getUplineChainForClient` finds the user and what `referrerId` is.
   - Whether the first referrer has an IB profile (and chain length).
2. **If followerId ≠ user _id:** Ensure the Bull Run path resolves **investor user _id** from **alloc.followerId** (e.g. if followerId is email, look up user by email and use `user._id`), then call `processPammIbCommissionOnTradeClose(userId, ...)` with that resolved id. Alternatively, ensure allocations always store the same id as `users._id` (e.g. in `pamm.service.js` follow(), persist `req.user.id` or its canonical string form).
3. **If type mismatch only:** In `getUplineChainForClient`, or before calling it from the PAMM service, normalize `clientUserId` to the same format used for `users._id` (e.g. always pass 24-char ObjectId string when the id is a valid ObjectId).
4. **If referrerId/IB profile missing:** Fix data so infomarkdesign’s `referrerId` points to wecorpdigital’s user id and wecorpdigital has an IB profile with that `userId`.

Do **not** change normal trading commission path or refactor unrelated code.

---

## 9. No fix implemented

No logic fix has been applied. Only temporary **`[pamm-ib-debug]`** logs were added in:

- `distribution.service.js`: entry of `distributePammPnl` (managerId, positionId, pnl, accountId); after fund resolve (fundId, name, fundType); after allocations load (count, followerIds + types); bullRun/isProfit/allocations count; inside Bull Run profit loop (followerId, type, activeCapital, investorCredit, willCallPammIb).
- `pamm-ib-commission.service.js`: entry (investorId, type, activeCapital, fundId, positionId); early exit; after `getUplineChainForClient` (ibChainLength, ibChain); PAMM IB settings; before each IB credit (ibId, level, commissionAmount, percent).
- `ib.repository.js`: inside `getUplineChainForClient` – when user not found (clientUserId, idStr, objectIdValid); when user has no referrerId; when user and referrerId found (clientUserId, referrerId).

After the next Bull Run profitable close, inspect server logs for these lines to confirm the exact break point and then apply the minimal fix above.
