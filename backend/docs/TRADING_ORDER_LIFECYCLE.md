# Trading order and position lifecycle

This document maps **order states**, **API actions**, and **WebSocket events** for the FxMark trading stack. It aligns with `modules/trading/order.service.js`, `positions.service.js`, and `src/services/tradeEvents.js`.

## Order states

| Status | Meaning |
|--------|---------|
| `pending` | Order persisted; not yet filled (market awaiting execution, limit/stop awaiting trigger, or legacy limit). |
| `placed` | Optional intermediate state for routed/working orders (if used). |
| `partial` | Partially filled (reserved for future use). |
| `filled` | Fully executed; for market orders, position opened and linked when `positionId` is stored on the order. |
| `cancelled` | User or system cancelled before fill. |
| `rejected` | Execution failed after persist (e.g. router/LP/internal error); **no position** must exist for this order. |

### Transitions (market)

1. `validatePlace` → permission check → optional margin check → **create** `pending`.
2. `executionRouter.route` → success: `filled` + position opened + optional `positionId` on order; failure: **`rejected`** + `rejectReason` (no orphan `pending` without position).

### Transitions (pending stop/limit)

1. Create `pending` (or `placed` if added later).
2. On price trigger: open position → `filled`; on failure → **`rejected`** (stops infinite re-trigger).

### Transitions (cancel)

- From `pending` / `placed` / `partial` → `cancelled`.

## Idempotency

- Optional body field `clientOrderId` (string, client-generated UUID recommended).
- Unique key: `(userId, accountScope, clientOrderId)` with `accountScope = accountId || 'default'`.
- Replay: same payload returns **HTTP 200** with `idempotentReplay: true` and the same logical result (no second position).

## Position invariants

- **Account scope:** If the request includes `activeAccount.id` (via `X-Account-Id`), the position’s `accountId` must match when set; mismatch → **403** (prevents cross-account close/modify).

## HTTP API (summary)

| Method | Path | Effect on state |
|--------|------|-----------------|
| POST | `/trading/orders` | New order → see above |
| POST | `/trading/orders/:id/cancel` | Pending → `cancelled` |
| PATCH | `/trading/orders/:id` | Pending price update |
| POST | `/trading/positions/:id/close` | Position → closed |
| PATCH | `/trading/positions/:id` | SL/TP update |

## WebSocket events

| Event | Payload (summary) | When |
|-------|-------------------|------|
| `trade:update` | `{ positions, orders, at }` scoped by **accountId** when provided | After place/cancel/update order, close position, update SL/TP |
| `order_created` | `{ order, accountId }` | After successful place (when `order` returned) |
| `order_triggered` | Pending order filled by engine | Pending execution path |
| `order_cancelled` | `{ orderId, accountId }` | Cancel |
| `order_update` | Wrapper for above | Same |
| `risk_event` | e.g. `position_closed` | Close via TP/SL/manual |

**Note:** `emitTradeUpdate(userId, accountId)` must use the same **accountId** as the REST client’s active account so the terminal snapshot matches `GET /trading/positions` and `GET /trading/orders`.

## Margin (pre-trade)

- `margin.service.checkMarginForNewPosition(userId, accountId, symbol, volume, openPrice)` runs before market order creation and before `openPosition` (including pending-order triggers).
- Insufficient free margin → **400** with clear message.
