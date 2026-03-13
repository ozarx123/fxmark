# CRM ↔ Trading platform integration

Enterprise broker integration: CRM as source of truth for account/trader status and permissions.

---

## 1. Existing CRM modules reused

| Module | Location | Reuse |
|--------|----------|--------|
| **User model** | `backend/models/user.model.js` | Reused. Fields: `id`, `email`, `role`, `kycStatus`. No schema change. |
| **User repository** | `backend/modules/users/user.repository.js` | Reused. `findById`, `updateById`, `list(role, kycStatus, search)`. |
| **Trading account repository** | `backend/modules/trading/trading-account.repository.js` | Extended: added CRM fields and `updateAccountConfig`. |
| **User trading limits** | `backend/modules/admin/trading-limits.repository.js`, `trading-limits.service.js` | Reused. `blocked`, `maxDailyLoss`, `maxDrawdownPercent`. `checkTradingAllowed` still used (invoked from validator). |
| **KYC** | `backend/models/user.model.js` (`kycStatus`), `backend/modules/users/kyc.service.js` | Reused. Trading gate uses `user.kycStatus === 'approved'`. KYC service remains stub. |
| **Admin controller/routes** | `backend/modules/admin/admin.controller.js`, `admin.routes.js` | Extended: `getAccountConfig`, `updateAccountConfig`, audit on limits and account config. |
| **Admin UI** | `frontend-web/src/pages/admin/AdminUsers.jsx`, `AdminTraderDetail.jsx` | Reused. Extended: Account config (CRM) section in AdminTraderDetail. |
| **Execution mode** | `backend/modules/trading/execution-mode.service.js`, `execution-router.js` | Reused. No change. Execution group exposed via CRM for future use. |
| **Audit** | `backend/modules/admin/audit.logs.js` | Reused and converted to ESM. Used for trading limits and account config changes. |

---

## 2. Gaps found and addressed

| Gap | Resolution |
|-----|------------|
| No CRM ↔ trading account mapping (accountGroup, executionGroup, riskGroup, leverage) | Added optional fields on `trading_accounts` and `updateAccountConfig` in repo. |
| No account-level trading permission (tradingEnabled, accountBlocked, symbol category) | Added `tradingEnabled`, `accountBlocked`, `canTradeForex`, `canTradeMetals`, `canTradeCrypto` on account; validator enforces. |
| No single source for trading engine to read CRM data | Added `backend/modules/crm/crmIntegration.service.js`. |
| No pre-order validation (client, account, KYC, symbol category) | Added `trading-permission.validator.js`; order flow calls it before creating order. |
| No audit for trading limits / account config changes | Audit on `updateTradingLimits` and `updateAccountConfig`. |
| No admin UI for per-account config | Account config (CRM) section in AdminTraderDetail: leverage, execution group, trading enabled. |

---

## 3. Files created

| File | Purpose |
|------|--------|
| `backend/modules/crm/crmIntegration.service.js` | Single source for trading: `getClientTradingProfile`, `getTradingAccountConfig`, `getTradingPermissions`, `getExecutionGroup`, `getRiskGroup`, `getLeverage`, `getSymbolCategory`. |
| `backend/modules/trading/trading-permission.validator.js` | Pre-order validation: client exists, account exists, not blocked, KYC approved, trading enabled, symbol category allowed; calls `checkTradingAllowed`. |
| `backend/docs/CRM_TRADING_INTEGRATION.md` | This document. |

---

## 4. Files updated

| File | Changes |
|------|--------|
| `backend/modules/trading/trading-account.repository.js` | Optional CRM fields in `create`; `updateAccountConfig(id, userId, update)`; `findById` unchanged. |
| `backend/modules/trading/order.service.js` | Replaced direct `checkTradingAllowed` with `validateTradingPermission(userId, accountId, { symbol, volume })` before order create. |
| `backend/modules/admin/admin.controller.js` | Import audit; audit in `updateTradingLimits`; `getAccountConfig`, `updateAccountConfig` with audit. |
| `backend/modules/admin/admin.routes.js` | GET/PUT `/trading/users/:userId/accounts/:accountId/config`. |
| `backend/modules/admin/audit.logs.js` | Converted to ESM (`import`/`export`) for use in admin controller. |
| `backend/modules/trading/execution-router.js` | Comment added: per-account execution group available via crmIntegration for future use. |
| `frontend-web/src/api/adminApi.js` | `getAdminAccountConfig(userId, accountId)`, `updateAdminAccountConfig(userId, accountId, body)`. |
| `frontend-web/src/pages/admin/AdminTraderDetail.jsx` | Account config (CRM) section: account selector, leverage, execution group, trading enabled, Save. |

---

## 5. New fields (trading_accounts)

Stored only when set; defaults applied in `crmIntegration.service` when absent:

- `accountGroup` (string, optional)
- `executionGroup` (string, optional)
- `riskGroup` (string, optional)
- `leverage` (number, optional; default 500 in integration)
- `tradingEnabled` (boolean, default true)
- `accountBlocked` (boolean, default false)
- `canTradeForex` (boolean, default true)
- `canTradeMetals` (boolean, default true)
- `canTradeCrypto` (boolean, default true)

---

## 6. Trading validation flow

1. **placeOrder(userId, body, accountId)** in `order.service.js`:
   - Validates payload (symbol, side, volume, type, etc.).
   - **validateTradingPermission(userId, accountId, { symbol, volume })**:
     - `getClientTradingProfile(userId)`: client exists, `!blocked`, `kycStatus === 'approved'`.
     - If `accountId`: `getTradingPermissions(accountId, userId)`: account exists, `!accountBlocked`, `tradingEnabled`, symbol category allowed (forex/metals/crypto), leverage set.
     - **checkTradingAllowed(userId)** (daily loss / drawdown).
   - On failure: throw with `statusCode` (403/404) and clear message; log event.
   - On success: create order, then for market with execution price → `executionRouter.route(order, execPrice)`.

2. **Close position / other flows**: Still use `checkTradingAllowed` only (e.g. in `positions.service.js`). No change.

---

## 7. Admin sync points

| Action | Where | Effect on trading |
|--------|------|-------------------|
| Block / unblock trader | AdminTraderDetail → `updateAdminTradingLimits(userId, { blocked })` | `user_trading_limits.blocked` updated. Next order fails validator. |
| Max daily loss / drawdown | Same → `updateAdminTradingLimits(userId, { maxDailyLoss, maxDrawdownPercent })` | Enforced by `checkTradingAllowed` (called from validator). |
| User role / KYC | Admin Users → `updateUser(id, { role, kycStatus })` | `kycStatus === 'approved'` required by validator. |
| Account config (leverage, execution group, trading enabled, etc.) | AdminTraderDetail → `updateAdminAccountConfig(userId, accountId, body)` | `trading_accounts` updated. Next order for that account uses new config via `crmIntegration`. |

No separate propagation step: trading engine reads from DB (via CRM integration and limits) on each request.

---

## 8. Compatibility with existing trading engine

- **Terminal / order ticket**: Unchanged. Same `placeOrder` API; validation and execution path are internal.
- **Pending orders**: Unchanged; validator runs only for new orders; pending trigger flow unchanged.
- **Positions / balance**: Unchanged; execution router and internal executor unchanged.
- **WebSocket / market data**: Unchanged.
- **Execution mode (A_BOOK / B_BOOK / HYBRID)**: Unchanged. Global mode only; per-account `executionGroup` is available for future use via `crmIntegration.getExecutionGroup(accountId, userId)`.

---

## 9. Execution group / execution mode

- **Global execution mode**: Still in `settings.broker_execution_settings` (A_BOOK, B_BOOK, HYBRID). Unchanged.
- **Per-account execution group**: Stored on `trading_accounts.executionGroup`, readable via `crmIntegration.getExecutionGroup(accountId, userId)`. Execution router does not use it yet; ready for group-level overrides (e.g. route by account or group to a specific LP).
