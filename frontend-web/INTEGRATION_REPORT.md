# FXMARK Trading Terminal — End-to-End Integration Report

## 1. Verified data flow

### Chart → Order panel → Trading API → Backend → Positions → Risk panel → Notifications

| Step | Component | Connection | Status |
|------|-----------|------------|--------|
| 1 | **Chart** (FxChart / ChartWorkspace) | Symbol, market price, positions, pending orders from TerminalLayout. Close / modify SL-TP trigger API then refresh. | ✅ Connected |
| 2 | **Order panel** (TradeControlPanel) | Receives `symbol`, `marketPrice`, `accountId`, `equity`. Calls `tradingApi.placeOrder()`, then `onOrderPlaced()` (= `loadTradingData`). | ✅ Connected |
| 3 | **Trading API** (tradingApi.js) | `placeOrder` → POST `/trading/orders`. `closePosition`, `updatePositionTPLS`, `cancelOrder`, `listOrders`, `getOpenPositions`, `getClosedPositions`, `getAccountSummary` all use same auth + account headers. | ✅ Connected |
| 4 | **Backend order execution** | trading.controller: placeOrder → order.service → emitOrderCreated + emitTradeUpdate. cancelOrder / closePosition / updatePositionTPLS → emitTradeUpdate. positions.service (TP/SL close) → emitRiskEvent only. | ✅ Connected (see gap below) |
| 5 | **Positions** | TerminalLayout holds `positions` (and `positionsWithPnl`). Updated by: (1) `loadTradingData()` (REST), (2) Socket `order_created` / `order_triggered` / `order_cancelled` / `trade:update` / `risk_event` → loadTradingData. PositionsPanel (when controlled) also merges `positionUpdates` from TradingSocket into parent state. | ✅ Connected |
| 6 | **Risk panel** (RiskRadar) | Receives `balance`, `equity`, `marginUsed`, `freeMargin`, `marginLevel` from `accountSummary`, and `positionsWithPnl`. accountSummary updated by loadTradingData and by `balanceUpdate` (TradingSocket). | ✅ Connected |
| 7 | **Notifications** | useTradeNotifications: (1) Order filled → from MarketDataContext `tradeSnapshot` (socket `trade:update`). (2) TP/SL / position closed → from TradingSocket `riskEvents`. TerminalLayout maps notification → addToast; orderError → addToast; margin warning → addToast. | ✅ Connected |

---

## 2. Trading actions → what gets updated

| Action | Positions | Orders | History | Risk panel | Notifications |
|--------|-----------|--------|--------|------------|----------------|
| **Place order** | ✅ loadTradingData after API + socket order_created | ✅ same | ✅ same | ✅ same (summary + positionsWithPnl) | ✅ onOrderSuccess toast |
| **Order filled** (pending → fill) | ✅ order_triggered → loadTradingData | ✅ same | ✅ same | ✅ same | ✅ “Order filled” from tradeSnapshot |
| **Cancel order** | ✅ loadTradingData (OrdersPanel onRefresh) | ✅ same | N/A | ✅ same | — |
| **Close position** (chart or panel) | ✅ API then loadTradingData; backend emitTradeUpdate | ✅ same | ✅ same | ✅ same | — (optional: could add toast) |
| **Modify SL/TP** (chart or panel) | ✅ API then loadTradingData; backend emitTradeUpdate | N/A | N/A | ✅ same | — |
| **Break-even** | ✅ API then loadTradingData | N/A | N/A | ✅ same | — |
| **TP/SL hit** (server-side) | ✅ risk_event → loadTradingData (fixed) | ✅ same | ✅ same | ✅ same | ✅ “Position CLOSED (TP/SL)” from riskEvents |

---

## 3. Fix applied

**Missing connection:** After a **TP/SL hit** (or any `risk_event`), the backend only emitted `risk_event`. TerminalLayout did not subscribe to `risk_event` or `trade:update`, so it did not refresh positions, orders, or history when a position was closed by the server.

**Change in `TerminalLayout.jsx`:** Socket subscription now calls `loadTradingData()` on:

- `order_created`
- `order_triggered`
- `order_cancelled`
- **`trade:update`**
- **`risk_event`**

So every trading-related push from the backend triggers a full refresh (positions, orders, history, account summary). Risk panel and notifications were already correct; they now stay in sync with data after TP/SL.

---

## 4. Backend note (no change required)

- After **manual** close/order/cancel/SL-TP update, the backend emits **trade:update** (and order_* where relevant). Frontend now refreshes on **trade:update** and **risk_event**.
- After **TP/SL close**, the backend only emits **risk_event** (positions.service.js does not call `emitTradeUpdate`). The frontend now refreshes on **risk_event**, so positions, history, and risk panel update without any backend change. Optionally, the backend could also call `emitTradeUpdate` after TP/SL close for consistency with other flows.

---

## 5. UI modules — no isolation

| Module | Data source | Refresh trigger |
|--------|-------------|-----------------|
| Chart (positions, orders on chart) | TerminalLayout positionsWithPnl, pendingOrders | loadTradingData on order/close/modify + socket |
| TradeControlPanel | symbol, marketPrice, accountId, equity from layout | onOrderPlaced = loadTradingData |
| PositionsPanel | positions from TerminalTabs (layout state); positionUpdates from socket merged when controlled | onRefresh = loadTradingData; close/modify call onRefresh |
| OrdersPanel | orders from TerminalTabs (layout state) | onRefresh = loadTradingData; cancel calls onRefresh |
| TerminalTabs (History) | history from layout | Refreshed whenever loadTradingData runs |
| RiskRadar | accountSummary + positionsWithPnl from layout | Updated when layout state updates (loadTradingData + balanceUpdate) |
| AccountSummary | REST load + balanceUpdate (TradingSocket) | load on mount; balance_update from socket |
| Toasts | addToast from layout; useTradeNotifications → notification effect | Order success, order error, margin warning, trade snapshot, risk_event |

All of the above use the same account context, same trading API, and shared layout state or socket events; none rely on isolated local state for critical trading data.

---

## 6. Summary

- **Chart → order panel → trading API → backend execution** is wired and verified.
- **Positions, orders, history, risk panel, and notifications** all update on place order, cancel, close, modify SL/TP, break-even, and (after the fix) on **TP/SL hit** and **trade:update**.
- **Fix:** TerminalLayout now subscribes to **trade:update** and **risk_event** and calls **loadTradingData** so that server-driven closes (e.g. TP/SL) update positions, orders, history, and risk panel in one place.
- No UI module is left in isolation; trading actions flow through a single refresh path and shared state.
