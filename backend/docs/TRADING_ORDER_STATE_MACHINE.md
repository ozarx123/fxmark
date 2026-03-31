# Trading order & position state machine (FXMARK)

Short reference aligned with `order.service.js`, `execution-router.js`, `positions.service.js`, and Socket.IO `tradeEvents.js`.

## Order statuses

| Status | Meaning |
|--------|---------|
| `pending` | Record created; not yet filled or rejected (market awaiting route, or pending/stop/limit resting). |
| `placed` | Accepted by internal/LP pipeline where used. |
| `filled` | Fully executed; market orders include `positionId` when execution succeeds. |
| `partial` | Reserved if partial fills are implemented. |
| `cancelled` | User or system cancelled before fill. |
| `rejected` | Execution failed or validation failed after insert; `rejectReason` set. |

## Allowed transitions (market)

- `pending` → `filled` (success path with `positionId`).
- `pending` → `rejected` (router/LP failure, insufficient margin, missing price, or success without `positionId` — treated as failure).
- `pending` → `cancelled` only via explicit cancel on a still-resting order (not applicable for immediate market once routed).

**Forbidden for market:** `filled` without a position when execution mode requires one; `pending` left indefinitely after a failed route (must become `rejected`).

## Pending / limit / stop (resting)

- `pending` → `filled` / `partial` / `cancelled` / `rejected` per engine and LP rules.

## Position lifecycle

- **Opened** — `position` created after successful market execution (B_BOOK internal executor or A_BOOK LP path with `positionId`).
- **Modified** — TP/SL updates via `PATCH /trading/positions/:id`.
- **Closed** — `POST /trading/positions/:id/close`.
- **No position** — failed market execution: order `rejected`, no position row.

## API & events

| Action | HTTP | Order / position | Socket |
|--------|------|-------------------|--------|
| Place order | `POST /trading/orders` | Creates order; market routes then `filled` or `rejected` | `order_created` (if applicable), `trade:update` with `accountId` |
| Cancel | `POST /trading/orders/:id/cancel` | `cancelled` | `order_cancelled`, `trade:update` |
| Close | `POST /trading/positions/:id/close` | Position closed | `trade:update` scoped to `accountId` |
| Modify TP/SL | `PATCH /trading/positions/:id` | Position fields updated | `trade:update` scoped to `accountId` |

`trade:update` payload includes `positions`, `orders` (pending subset), `at`, and **`accountId`** when scoped.

## Idempotency

Optional `clientOrderId` (per user + account scope) replays the same logical result without duplicate orders.
