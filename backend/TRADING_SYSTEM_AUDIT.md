# Backend Trading System Audit Report

## Updates (in progress / resolved)

| Item | Status |
|------|--------|
| Stuck `pending` market orders on execution failure | **Resolved** — order marked `rejected` with `rejectReason`; HTTP 201 with `status: rejected` |
| `emitTradeUpdate(userId, null)` on close / SLTP | **Resolved** — uses active `accountId` |
| Cross-account position close/modify | **Resolved** — `403` when `position.accountId` ≠ request account |
| Idempotent `POST /trading/orders` | **Resolved** — optional `clientOrderId` + unique index `(userId, accountScope, clientOrderId)` |
| Pre-trade margin | **Partial** — `margin.service.checkMarginForNewPosition` wired into `placeOrder` (market), `openPosition`, pending trigger |
| Zero-equity auto-close | **Resolved** — `enforceEquityFloorForAccounts` enabled in `checkAndExecuteTPLS` for all account types (live wallet balance; demo/PAMM from DB; equity uses all open positions on the account) |
| Real LP / FIX | **Unchanged** — still stub; see §1.8 |

Lifecycle doc: [docs/TRADING_ORDER_LIFECYCLE.md](docs/TRADING_ORDER_LIFECYCLE.md).

## Scope

Verification of: Account engine, Margin calculation, Equity calculation, Order execution flow, Position management, Risk engine, Exposure tracking, Liquidity bridge (FIX/LP). Plus UI ↔ backend order execution connectivity.

---

## 1. Existing Modules

### 1.1 Account engine ✅ (partial)

| Component | Location | Status |
|-----------|----------|--------|
| Account CRUD / resolve | `modules/trading/trading-account.service.js` | **Exists.** `listAccounts`, `getOrCreateDefaultDemo/Live`, `createAccount`, `getAccount`, `getAccountByNumber`, `resolveAccount`. |
| Balance source | Same | Demo: `trading_accounts.balance`. Live: `wallet.repository` balance. |
| Account summary API | `trading-account.controller.js` → `getAccountSummary` | **Exists.** GET `/trading/account-summary`. Returns balance, equity, marginUsed, freeMargin, marginLevel. |

**Gaps:** No dedicated “account engine” for multi-currency or complex account hierarchy; single-currency wallet per user. Sufficient for current demo/live split.

---

### 1.2 Margin calculation ⚠️ (partial / stubbed)

| Component | Location | Status |
|-----------|----------|--------|
| Margin used in summary | `trading-account.service.js` → `getAccountSummary` | **Implemented.** `marginUsed = Σ (volume × contractSize × openPrice) / leverage` per open position. Contract size: XAU 100, forex 100k. |
| Dedicated margin service | `modules/trading/margin.service.js` | **Stub.** `getMargin()` returns zeros; `checkMargin()` always returns `{ allowed: true }`. Not used anywhere. |
| Pre-trade margin check | — | **Missing.** `order.service.placeOrder` and `openPosition` do not call any margin check. Orders can be placed and positions opened regardless of free margin. |
| Margin call / close | `positions.service.js` → `enforceEquityFloorForAccounts` | **Enabled.** Invoked from `checkAndExecuteTPLS` after TP/SL on each tick (only runs when that symbol has open positions). If approximate equity &lt; 0 and there is unrealized loss, closes **all** open positions on that account. Applies to **live, demo, and PAMM**: live balance from wallet; others from `trading_accounts`. Equity = balance + Σ unrealized PnL over **all** open positions (tick price for current symbol; `currentPrice` / `openPrice` for other symbols). |

**Conclusion:** Margin *display* (marginUsed, freeMargin, marginLevel) works. **Zero-equity auto-close** runs on the tick path. Pre-trade margin enforcement may still be partial—see `margin.service.js` and table above.

---

### 1.3 Equity calculation ⚠️ (simplified)

| Component | Location | Status |
|-----------|----------|--------|
| In account summary | `trading-account.service.js` → `getAccountSummary` | **Equity = balance.** No floating PnL. Comment: “Equity = balance server-side (floating PnL would require live prices).” |
| In zero-equity logic | `positions.service.js` → `enforceEquityFloorForAccounts` | **Equity = balance + Σ PnL** over all open positions on the account (mark rules as in §1.2). **Enabled** on each qualifying tick. |

**Conclusion:** GET account-summary still shows **equity = balance** (no floating PnL there). Floating PnL is computed inside `enforceEquityFloorForAccounts` when deciding auto-close. Terminal can show client-side floating PnL; aligning summary API with the same mark methodology is still optional (see §5).

---

### 1.4 Order execution flow ✅

| Component | Location | Status |
|-----------|----------|--------|
| Place order | `order.service.js` → `placeOrder` | **Full.** Validates symbol, side, volume, type, price (for limit/stop). Creates order in DB. |
| Permission gate | `trading-permission.validator.js` | **Integrated.** `validateTradingPermission(userId, accountId, context)` before order: CRM profile, blocked, KYC, account permissions, symbol category. |
| Daily loss / drawdown | `admin/trading-limits.service.js` → `checkTradingAllowed` | **Integrated.** Called from `positions.service.closePosition` (e.g. before posting PnL to ledger). |
| Market with execution price | `order.service.js` | **Routes to ExecutionRouter.** Requires `executionPrice`; rejects if missing. |
| Execution router | `execution-router.js` | **Exists.** Resolves path: A_BOOK → LP adapter, B_BOOK → internal executor, HYBRID → `hybrid-rules.evaluator` then A or B. |
| Internal (B-Book) executor | `internal-executor.js` | **Implemented.** `executeMarketOrder` → `positionsService.openPosition` + `orderRepo.updateStatus(..., 'filled')`. |
| LP adapter (A-Book) | `liquidity-provider.adapter.js` | **Stub.** Currently does same as internal: `openPosition` + update order to filled. No external LP. |
| Pending orders | `pendingOrders.engine.js` | **Exists.** `checkAndTriggerPendingOrders(symbol, price)` called from tick pipeline (e.g. `backend/src/index.js`). |
| Cancel / update order | `order.service.js` + controller | **Implemented.** Cancel and update price; emit events and trade update. |

**Conclusion:** Order creation, validation, routing, B-Book execution, and pending-order trigger are in place. A-Book path is stub (internal execution only).

---

### 1.5 Position management ✅

| Component | Location | Status |
|-----------|----------|--------|
| Open position | `positions.service.js` → `openPosition` | **Implemented.** Creates position; used by internal executor and LP adapter. |
| Close (full/partial) | `positions.service.js` → `closePosition` | **Implemented.** PnL calc, ledger post (live), wallet update, commission, PAMM, emit `risk_event`. |
| TP/SL evaluation | `positions.service.js` → `evaluateTPLS` | **Implemented.** Pure function; used by TP/SL processor. |
| TP/SL execution | `positions.service.js` → `checkAndExecuteTPLS` | **Implemented.** Invoked from tick pipeline (`src/index.js`) on each tick; closes positions when price hits TP/SL. |
| Update SL/TP | `positions.service.js` → `updatePositionTPLS` | **Implemented.** PATCH positions/:id. |
| Repo / model | `position.repository.js`, `models/position.model.js` | **Exist.** List open/closed, by symbol, with TPLS. |

**Conclusion:** Position lifecycle (open, close, TP/SL, update SL/TP) is implemented and wired to ticks and API.

---

### 1.6 Risk engine ⚠️ (partial)

| Component | Location | Status |
|-----------|----------|--------|
| Trading permission | `trading-permission.validator.js` | **Implemented.** Client/account, KYC, symbol category. |
| Daily loss / drawdown | `admin/trading-limits.service.js` → `checkTradingAllowed` | **Implemented.** Called on close (live PnL post). |
| TP/SL risk | `positions.service.js` → `checkAndExecuteTPLS` | **Implemented.** Per-tick. |
| Zero-equity / margin call | `positions.service.js` → `enforceEquityFloorForAccounts` | **Active.** Called from `checkAndExecuteTPLS` after TP/SL; all account types; see §1.2. |
| Pre-trade risk (margin) | — | **Missing.** No margin or equity check before opening a position. |
| A-Book router | `risk-management/a-book.router.js` | **Stub.** Checks FIX session state; TODO send NewOrderSingle. |
| B-Book router | `risk-management/b-book.router.js` | **Stub.** TODO internal fill or hedge. |
| Hedging service | `risk-management/hedging.service.js` | **Stub.** Calls `aBookRouter.route`; TODO create hedge order. |
| AI risk switch | `risk-management/ai-risk-switch.js` | **Present.** (Not fully traced; can redirect risk.) |

**Conclusion:** Permission and daily-loss checks exist; TP/SL and zero-equity auto-close work on ticks. Pre-trade margin and hedging/risk routers may still be partial or stubbed—see `margin.service` and §1.2.

---

### 1.7 Exposure tracking ❌ (stubbed)

| Component | Location | Status |
|-----------|----------|--------|
| Exposure manager | `risk-management/exposure.manager.js` | **Stub.** `getExposure(symbol)` returns `{ symbol, long: 0, short: 0 }`. `syncExposure()` TODO. |
| Sync job | `jobs/exposure.sync.js` | **Calls** `exposureManager.syncExposure()` (no-op). |

**Conclusion:** No real aggregation of open positions by symbol/client for hedging or reporting. Infrastructure only.

---

### 1.8 Liquidity bridge (FIX / LP) ❌ (stubbed)

| Component | Location | Status |
|-----------|----------|--------|
| FIX config | `config/fix.config.js` | **Exists.** Sender/target CompIDs, host, port, credentials from env. |
| FIX session | `fix-engine/fix.session.js` | **Stub.** `connect()` sets state to 'connected'; no real FIX; `send()` TODO. |
| FIX execution report | `fix-engine/execution.report.handler.js` | **Stub.** Routes message via fix.router; TODO persist order, update position, emit. |
| Fix router | `fix-engine/fix.router.js` | **Exists.** (Assumed for routing; not fully read.) |
| LP adapter | `trading/liquidity-provider.adapter.js` | **Stub.** Executes internally; no external LP. |
| Liquidity config | `config/liquidity.config.js` | **Exists.** Default route, symbols, lpEndpoints (empty). |

**Conclusion:** No real FIX or LP connectivity. A-Book and “LP” path execute internally. Config and skeleton are in place for a future FIX/LP integration.

---

## 2. UI ↔ Backend Order Execution

| UI action | Frontend | API | Backend | Result |
|-----------|----------|-----|---------|--------|
| Place order | TradeControlPanel → `tradingApi.placeOrder` | POST `/trading/orders` | trading.controller.placeOrder → order.service.placeOrder → executionRouter (market) or store (pending) | ✅ Connected. |
| Order success | `onOrderPlaced` = loadTradingData | — | — | ✅ Refreshes positions, orders, history, summary. |
| Cancel order | OrdersPanel → `tradingApi.cancelOrder` + onRefresh | POST `/trading/orders/:id/cancel` | cancelOrder → emitTradeUpdate | ✅ Connected. |
| Close position | Chart / PositionsPanel → `tradingApi.closePosition` + onRefresh | POST `/trading/positions/:id/close` | closePosition → emitTradeUpdate | ✅ Connected. |
| Modify SL/TP | Chart / PositionsPanel → `tradingApi.updatePositionTPLS` + onRefresh | PATCH `/trading/positions/:id` | updatePositionTPLS → emitTradeUpdate | ✅ Connected. |
| Account summary | TerminalLayout / AccountSummary | GET `/trading/account-summary` | getAccountSummary (balance, equity=balance, marginUsed, freeMargin, marginLevel) | ✅ Connected. |
| Open positions | TerminalLayout loadTradingData | GET `/trading/positions` | getOpenPositions | ✅ Connected. |
| Closed positions (history) | Same | GET `/trading/positions/closed` | getClosedPositions | ✅ Connected. |
| List orders | Same | GET `/trading/orders` | listOrders | ✅ Connected. |

**Conclusion:** The trading terminal UI is correctly wired to backend order execution, positions, and account summary. No missing endpoints for the current feature set.

---

## 3. Missing Broker Infrastructure

1. **Pre-trade margin check**  
   No call to margin or equity check before creating an order or opening a position. Risk of opening positions beyond available margin.

2. **Real margin service**  
   `margin.service.js` is a stub. `getMargin` and `checkMargin` should use balance, open positions, and (for equity) live prices; `checkMargin` should be used in the order/execution path.

3. **Equity with floating PnL**  
   Account summary equity is balance only. `enforceEquityFloorForAccounts` already uses balance + floating PnL (approximate marks) for auto-close on ticks; exposing the same in **GET account-summary** still needs price feed integration in that layer.

4. **Exposure aggregation**  
   No real long/short exposure by symbol or client. Needed for hedging and risk dashboards.

5. **FIX / LP connectivity**  
   No real FIX session or LP bridge. A-Book is internal-only. Needed for true A-Book and hedging.

6. **Hedging pipeline**  
   Hedging service and A/B-book routers are stubs. No automatic hedge when B-Book exposure exceeds limits.

7. **Margin call enforcement**  
   Zero-equity auto-close runs on ticks (`enforceEquityFloorForAccounts`). No separate proactive margin-level stop-out (e.g. at 100% or 150% margin level) before that floor unless added.

---

## 4. Risk Areas

| Risk | Severity | Description |
|------|----------|-------------|
| No pre-trade margin check | **High** | Users can open positions until balance is exhausted or negative if combined with other bugs. |
| Equity = balance only | **Medium** | Summary and any future server-side margin logic underestimate risk when there are large open losses. |
| Margin level stop-out only partial | **Medium** | Zero-equity close exists on ticks; no configurable margin-level stop-out (e.g. 100% / 150%) unless added. |
| A-Book is internal execution | **Medium** | No real pass-through to LP; “A_BOOK” mode is misleading. |
| No exposure aggregation | **Low** | Hedging and net exposure reporting cannot be built on current data. |
| Stub FIX handler | **Low** | If FIX is connected later, execution reports must be implemented or orders/positions will desync. |
| Permission depends on CRM | **Low** | If CRM is down or misconfigured, trading can be blocked or permissions wrong; ensure fallback/graceful behaviour. |

---

## 5. Recommended Architecture Improvements

1. **Integrate margin into the order path**  
   - Implement `margin.service`: `getMargin(userId, accountId)` using balance + open positions + (optional) live prices for equity.  
   - Implement `checkMargin(userId, accountId, symbol, volume)` using required margin and free margin.  
   - In `order.service.placeOrder` (and before `executionRouter.route` for market) or in `internal-executor` / LP adapter before `openPosition`, call `checkMargin`; reject with 400 if insufficient margin.

2. **Equity in account summary**  
   - Add a price source (e.g. last tick per symbol from existing feed).  
   - In `getAccountSummary`, compute equity = balance + Σ floating PnL for account’s open positions.  
   - Optionally cache per account with short TTL to avoid heavy work on every request.

3. **Tune margin / equity risk (beyond zero floor)**  
   - `enforceEquityFloorForAccounts` is **enabled** in `checkAndExecuteTPLS` (or could be moved to a dedicated margin job if tick load is a concern).  
   - Add a margin-level-based close or warn (e.g. when margin level &lt; 100% or 150%) with configurable thresholds and possibly a warning event before close.  
   - Optionally align `getAccountSummary` equity with the same mark methodology as the equity floor.

4. **Exposure manager implementation**  
   - In `exposure.manager.js`, aggregate open positions by symbol (and optionally by account/client): long = Σ buy volume, short = Σ sell volume (or net position).  
   - Persist or expose via API for hedging service and admin.  
   - `syncExposure` job: recalc from positions and write to DB or cache.

5. **Liquidity bridge (FIX/LP)**  
   - Implement real FIX session (e.g. QuickFIX or equivalent): connect, logon, send NewOrderSingle, handle ExecutionReport.  
   - In `execution.report.handler.js`: update order status and position from fills; emit events so UI and risk stay in sync.  
   - LP adapter: for A_BOOK, send to FIX/LP and do not open position internally; create/update position only on fill from execution report.

6. **Hedging from exposure**  
   - When exposure (or net position) exceeds a threshold, call hedging service to send offsetting order to A-Book.  
   - Implement `hedging.service.hedge` and `a-book.router.route` to send real orders via FIX/LP.

7. **Single source of truth for execution mode**  
   - Ensure `execution-mode.service` / `executionMode` is the only place that decides A_BOOK vs B_BOOK vs HYBRID so all execution paths stay consistent.

---

## 6. Summary Table

| Module | Exists | Integrated | Notes |
|--------|--------|------------|-------|
| Account engine | ✅ | ✅ | Summary and resolve; no floating PnL in equity. |
| Margin calculation | ⚠️ | ❌ | Display only; service stubbed; no pre-trade check. |
| Equity calculation | ⚠️ | ⚠️ | Summary = balance; floating PnL used in equity-floor path on ticks. |
| Order execution flow | ✅ | ✅ | Validate → create → route → execute or store; pending engine. |
| Position management | ✅ | ✅ | Open, close, TP/SL, update SL/TP; tick-driven. |
| Risk engine | ⚠️ | ⚠️ | Permission + daily loss + zero-equity close on ticks; pre-trade margin partial. |
| Exposure tracking | ❌ | ❌ | Stubbed. |
| Liquidity bridge (FIX/LP) | ❌ | ❌ | Stubbed; A-Book runs internally. |
| UI ↔ backend | ✅ | ✅ | Orders, positions, summary, close, SL/TP wired. |

---

*Audit completed against the current codebase. Recommendations assume incremental change without full backend rewrite.*
