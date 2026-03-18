# FXMark Full-Stack Analysis Report

**Scope:** Frontend (React/Vite), Backend (Node/Express), APIs, DB (MongoDB), flows, auth, wallet/ledger/commissions.  
**Constraint:** Analysis only — no rebuilds or architecture changes.

---

## 1. Critical Issues

### 1.1 Withdrawal double-debit race condition
- **Where:** `backend/modules/wallet/withdrawal.service.js` — `processWithdrawal(withdrawalId, userId)`.
- **What:** Two concurrent requests for the same pending withdrawal can both pass the `tx.status === 'pending'` check, both run the transaction, and both call `walletRepo.updateBalance(..., -tx.amount)`. The transaction row is updated to `completed` by both, but the wallet is debited twice.
- **Ledger:** `postWithdrawal` is idempotent by `referenceId` (withdrawalId), so the ledger is not double-posted; only the wallet balance is at risk.
- **Fix direction:** Make processing idempotent: e.g. `findOneAndUpdate` the withdrawal document where `status: 'pending'`, set `status: 'completed'` (and other fields), and only debit wallet + post ledger if that update matched one document. Alternatively use a distributed lock or unique constraint so only one processor can “claim” the withdrawal.

### 1.2 No access-token refresh (session expiry)
- **Where:** Backend returns `refreshToken` on login (`auth.service.js`), and exposes `POST /auth/refresh`. Frontend never stores or uses the refresh token (`AuthContext.jsx`, `Auth.jsx`).
- **What:** When the access token expires, all API calls return 401. There is no automatic refresh and no redirect to login; the user simply sees failures until they manually re-login.
- **Impact:** Poor UX and perceived “random” failures after some time (e.g. 15–60 minutes, depending on JWT expiry).

---

## 2. Major Issues

### 2.1 Auth refresh response does not include user
- **Where:** `backend/modules/auth/auth.service.js` — `refresh()` returns only `{ accessToken, refreshToken }`, not `user`.
- **What:** If the frontend later implements refresh, it would need a separate `/auth/me` call after refresh to update user state (e.g. role, profileComplete, emailVerified). Not blocking but inconsistent with login, which returns user + tokens.

### 2.2 Frontend 401 handling is inconsistent
- **Where:** `frontend-web/src/api/tradingApi.js` returns the string `'Session expired or unauthorized'` on 401; other APIs (e.g. `adminApi.js`) throw with a message. There is no global interceptor that redirects to login or triggers refresh on 401.
- **What:** Some pages may show a generic error; others might show “Session expired…”; none reliably redirect to login or refresh.

### 2.3 Role string inconsistency (backend vs frontend)
- **Where:** Backend uses `superadmin` (one word) everywhere (`admin.routes.js`, DB). Frontend `roleRoutes.js` and `authHelpers.js` also use `super_admin` in places.
- **What:** `ensureUserRole` only overwrites role when `user.role` is falsy; when backend sends `role: 'superadmin'`, it is kept. So `currentUser?.role === 'superadmin'` in AdminUsers is correct. Risk is future code that checks only for `super_admin` and misses real backend value; currently no critical bug found but worth standardising (e.g. one canonical value and map at API boundary).

### 2.4 FinanceContext / getLedgerBalances on error
- **Where:** `FinanceContext.jsx` uses `getLedgerBalances().catch(() => [])` so on API/network error the balances are silently set to `[]`.
- **What:** UI may show empty balances instead of an error state, which can be misleading (e.g. user thinks they have no ledger accounts).

---

## 3. Minor Issues

### 3.1 Deposit confirm flow — double confirm possible
- **Where:** Frontend calls `walletApi.confirmDeposit(depositId)` (e.g. from wallet page). Backend `deposit.service.js` has idempotency by reference; wallet/ledger are protected.
- **What:** If the UI allows multiple “Confirm” clicks before the first response, the user might think they confirmed twice; backend is safe, but UX could show duplicate toasts or loading states. Buttons should be disabled while submitting (partially present; worth verifying on the deposit list).

### 3.2 Trading account when no header sent
- **Where:** `trading-account.middleware.js` uses `X-Account-Id` / `X-Account-Number`; when missing, `resolveAccount(userId, null)` returns default demo account.
- **What:** `getAccountSummary` uses `req.activeAccount?.id` and returns 400 if no active account; but when no header is sent, middleware sets demo, so 400 should not occur. Minor: ensure all trading UIs that need a specific account always send the selected account header (already done in TerminalLayout/AccountContext).

### 3.3 Res.json().catch(() => ({})) on error bodies
- **Where:** Many frontend API helpers do `(await res.json().catch(() => ({}))).error || '...'` when `!res.ok`.
- **What:** If the backend sends a non-JSON body (e.g. HTML error page or empty body), the user sees a generic message. Minor; only affects edge cases (e.g. proxy/network errors).

### 3.4 PAMM follow / addFunds / withdraw modals
- **Where:** `PammFollowModal`, `PammWithdrawModal`, `PammAddFundsModal` use `submitting` and disable the submit button; `PammFundDetail` and `BullRunFundDetailView` pass `onConfirm` that call the API.
- **What:** Double-submit is guarded by `disabled={submitting}`. No critical bug; ensure all such modals keep this pattern.

---

## 4. Broken Flows

- **Email verification → login:** Backend blocks login when `emailVerified !== true` and returns 403 with code `EMAIL_NOT_VERIFIED`; frontend redirects to `/auth/verify-email` and handles resend. Flow is connected.
- **Deposit create → confirm:** Frontend creates deposit then later confirms by ID; backend confirms and credits wallet + ledger (idempotent). Flow is intact.
- **Withdrawal request → process:** Frontend can call process (user or admin depending on design). Backend processes once per withdrawal but has the **race condition** in 1.1; flow is “broken” only under concurrent process calls.
- **PAMM follow (accept terms):** Frontend has `acceptTerms` and backend expects terms acceptance where applicable; params align. No broken flow identified.
- **Trading place order:** Order ticket and quick trade disable buttons with `loading`; account is passed via headers. No broken flow identified.
- **Admin/Super Admin:** Backend restricts bulk import and some actions to `superadmin`; frontend uses `superadmin` for checks. No broken flow identified.

**Summary:** The only flow that is “broken” under concurrency is **withdrawal process** (double debit). All other flows are wired end-to-end; gaps are mainly UX and token refresh.

---

## 5. Risk Areas

### 5.1 Wallet and ledger
- **Wallet:** Double debit on withdrawal process (see 1.1). Deposit and ledger posting are idempotent (referenceId). Transfer and admin credit use ledger idempotency.
- **Ledger:** Idempotency implemented for deposit, withdrawal, transfer, admin_credit (by referenceType + referenceId). Unique index on wallet ledger entries (if applied as per existing plan) further reduces duplicate risk.
- **Reconciliation:** Existing reconciliation/monitoring and repair tooling should be kept; no new inconsistency found beyond the withdrawal race.

### 5.2 Commissions and allocations
- **IB commission:** `commission.engine.js` calculates and persists commission and posts to ledger; no idempotency key on commission creation — if the same trade is fed twice, commission could be double-counted. Mitigation: ensure trade close/commission hook is invoked once per closed trade (single caller).
- **PAMM distribution:** `distribution.service.js` distributes PnL and posts to ledger; triggered from position close. Risk of double distribution if position close is processed twice; caller should ensure single execution per position.
- **PAMM investor IB commission:** Handled in `pamm-ib-commission.service.js`; ensure it is called once per allocation event to avoid duplicate commission.

### 5.3 Authentication and permissions
- **Auth:** JWT in header; no refresh on frontend (see 1.2). Admin routes use `requireAdmin` (admin or superadmin) and `requireSuperAdmin` (superadmin only); frontend route guards use `ADMIN_ROLES` / `IB_ROLES`; aligned.
- **Trading account:** Resolved via middleware from headers; live balance comes from wallet. Consistent.

### 5.4 Frontend–backend connection
- **API base:** Frontend uses `VITE_API_URL || '/api'`; backend mounts core routes at `/api`. Paths match (auth, wallet, trading, finance, admin, ib, pamm).
- **Shapes:** Wallet balance `{ balance, locked, currency }`, ledger entries array, ledger balances array, trading accounts array — all match. No critical mismatch found.
- **Errors:** Backend sends `{ error: string }` or similar; frontend reads `.error` or `.message` and falls back to a generic message. Adequate.

### 5.5 UI state and duplicate actions
- **Order placement:** TradeControlPanel, OrderTicket, QuickTradeBar, and TerminalLayout use `loading` and disable submit/buttons during request. Low risk of duplicate orders from double-click.
- **PAMM follow/addFunds/withdraw:** Modals use `submitting` and disable primary button. Low risk.
- **Finance visibility refresh:** Tab visibility triggers refetch; no duplicate action risk.

### 5.6 Performance and stability
- **No global error boundary:** Uncaught React errors can blank the app; consider a top-level error boundary and optional error reporting.
- **Polling:** Admin logs and similar may poll; acceptable if interval is reasonable.
- **Heavy work:** No obvious N+1 or heavy sync work in the critical path; MongoDB usage is standard.

---

## Summary Table

| Severity   | Count | Main items |
|-----------|-------|------------|
| Critical  | 2     | Withdrawal double-debit race; no token refresh |
| Major     | 4     | Refresh response no user; 401 handling; role consistency; FinanceContext error swallowing |
| Minor     | 4     | Deposit confirm UX; trading default account; error body parsing; PAMM modal guards |
| Broken flow | 1  | Withdrawal process under concurrency |
| Risk areas | 6  | Wallet/ledger, commissions/allocations, auth, API alignment, UI state, performance |

**Recommended order of work:** (1) Fix withdrawal process idempotency/race. (2) Implement refresh-token storage and silent refresh (and optionally add user to refresh response). (3) Global 401 handling and FinanceContext error handling. (4) Standardise role value and improve error display where needed.
