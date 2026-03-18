# FXMARK Backend — API docs for Postman

**Base URL:** `{{baseUrl}}` → use `http://localhost:3000` (or set `API_URL` from `.env`).

**Auth:** Most endpoints under `/api` (except auth and some public routes) require:

- **Header:** `Authorization: Bearer <access_token>`
- Get a token via `POST /api/auth/login` with `{ "email": "...", "password": "..." }`; response includes `accessToken` (and optionally `refreshToken`).

**Health (no auth):**

- `GET /api/health` — API ok
- `GET /health/redis` — Redis status (optional)

---

## 1. Auth — `/api/auth`

| Method | Path | Auth | Body / Params | Description |
|--------|------|------|---------------|-------------|
| POST | `/api/auth/register` | No | `{ email, password, ... }` | Register |
| POST | `/api/auth/signup` | No | same as register | Alias for register |
| POST | `/api/auth/login` | No | `{ email, password }` | Login → `accessToken`, `refreshToken` |
| POST | `/api/auth/refresh` | No | `{ refreshToken }` | New access token |
| POST | `/api/auth/logout` | Yes | — | Logout |
| GET | `/api/auth/me` | Yes | — | Current user |
| POST | `/api/auth/change-password` | Yes | `{ currentPassword, newPassword }` | Change password |
| POST | `/api/auth/change-investor-password` | Yes | body | Change investor password |
| GET | `/api/auth/verify-email` | No | query: `token` | Verify email (link) |
| POST | `/api/auth/verify-email` | No | body | Verify email |
| POST | `/api/auth/resend-verification` | No | body | Resend verification email |

---

## 2. Users — `/api/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users/profile` | Yes | Get profile |
| PATCH | `/api/users/profile` | Yes | Update profile |
| GET | `/api/users/kyc` | Yes | Get KYC |
| POST | `/api/users/kyc/submit` | Yes | Submit KYC |

---

## 3. Wallet — `/api/wallet`

| Method | Path | Auth | Body / Params | Description |
|--------|------|------|---------------|-------------|
| GET | `/api/wallet/balance` | Yes | — | Wallet balance |
| GET | `/api/wallet/payment-methods` | Yes | — | Available payment methods |
| GET | `/api/wallet/deposits` | Yes | — | List deposits |
| GET | `/api/wallet/withdrawals` | Yes | — | List withdrawals |
| GET | `/api/wallet/trades` | Yes | — | List trade transactions |
| GET | `/api/wallet/transfers` | Yes | — | List transfers |
| POST | `/api/wallet/deposits` | Yes | `{ amount, currency, reference?, payment_method? }` | Create deposit |
| POST | `/api/wallet/deposits/:id/confirm` | Yes | — | Confirm deposit |
| POST | `/api/wallet/withdrawals` | Yes | `{ amount, currency, destination? }` | Request withdrawal |
| POST | `/api/wallet/withdrawals/:id/process` | Yes | — | Process withdrawal |
| GET | `/api/wallet/transfer/lookup` | Yes | query: recipient | Lookup transfer recipient |
| POST | `/api/wallet/transfer` | Yes | `{ recipientAccountNoOrEmail, amount, currency, verification }` | Execute transfer |

---

## 4. Trading — `/api/trading`

| Method | Path | Auth | Body / Params | Description |
|--------|------|------|---------------|-------------|
| GET | `/api/trading/accounts` | Yes | — | List accounts |
| GET | `/api/trading/account-summary` | Yes | — | Account summary |
| POST | `/api/trading/accounts` | Yes | body | Create account |
| GET | `/api/trading/accounts/:accountId` | Yes | — | Get account |
| POST | `/api/trading/orders` | Yes | order payload | Place order |
| GET | `/api/trading/orders` | Yes | — | List orders |
| GET | `/api/trading/orders/:orderId` | Yes | — | Get order |
| PATCH | `/api/trading/orders/:orderId` | Yes | body | Update order |
| POST | `/api/trading/orders/:orderId/cancel` | Yes | — | Cancel order |
| GET | `/api/trading/positions` | Yes | — | Open positions |
| GET | `/api/trading/positions/closed` | Yes | — | Closed positions |
| GET | `/api/trading/positions/:positionId` | Yes | — | Get position |
| PATCH | `/api/trading/positions/:positionId` | Yes | `{ takeProfit?, stopLoss? }` | Update TP/SL |
| POST | `/api/trading/positions/:positionId/close` | Yes | `{ volume?, closePrice?, pnl? }` | Close position |

---

## 5. Market (no auth) — `/api/market`

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| GET | `/api/market/candles` | `symbol`, `tf`, `from?`, `to?` | OHLCV candles |
| GET | `/api/market/quote` | `symbol` | Latest quote |
| GET | `/api/market/technical` | `symbol`, `interval?` | RSI, MACD, levels |
| GET | `/api/market/log` | `limit?`, `symbol?` | Market data log |
| GET | `/api/market/feed-log` | `limit?`, `symbol?`, `event?` | Feed log |
| GET | `/api/market/feed-log/summary` | — | Feed log summary |

---

## 6. Finance — `/api/finance`

| Method | Path | Auth | Params | Description |
|--------|------|------|--------|-------------|
| GET | `/api/finance/ledger/entries` | Yes | accountCode, from, to, limit, referenceType | Ledger entries |
| GET | `/api/finance/ledger/balances` | Yes | — | Ledger balances |
| GET | `/api/finance/ledger/pnl` | Yes | — | P&L |
| GET | `/api/finance/ledger/reconciliation` | Yes | — | Reconciliation |
| GET | `/api/finance/ledger/pamm/:fundId` | Yes | — | PAMM fund ledger |
| GET | `/api/finance/chart-of-accounts` | Yes | — | Chart of accounts |
| GET | `/api/finance/reports/daily` | Yes | — | Daily report |
| GET | `/api/finance/reports/monthly` | Yes | — | Monthly report |
| GET | `/api/finance/statements` | Yes | — | Statement |
| GET | `/api/finance/statements.pdf` | Yes | — | Statement PDF |
| GET | `/api/finance/statements.csv` | Yes | — | Statement CSV |

---

## 7. PAMM — `/api/pamm`

| Method | Path | Auth | Body / Params | Description |
|--------|------|------|---------------|-------------|
| GET | `/api/pamm/config` | No | — | PAMM config |
| GET | `/api/pamm/managers` | No | — | List managers |
| GET | `/api/pamm/managers/:managerId` | No | — | Get manager |
| GET | `/api/pamm/managers/:managerId/trades` | No | — | Manager trades |
| GET | `/api/pamm/funds/:fundId` | Optional | — | Fund detail |
| GET | `/api/pamm/managers/me` | Yes | — | My manager profile |
| GET | `/api/pamm/managers/me/funds` | Yes | — | My funds |
| GET | `/api/pamm/managers/me/allocations` | Yes | — | My allocations |
| GET | `/api/pamm/managers/me/follower-trades` | Yes | — | Follower trades |
| GET | `/api/pamm/managers/me/investors` | Yes | — | My investors |
| GET | `/api/pamm/managers/me/trades` | Yes | — | My trades |
| POST | `/api/pamm/managers` | No | body | Register as manager |
| POST | `/api/pamm/managers/me/trading-account` | Yes | body | Create PAMM trading account |
| GET | `/api/pamm/managers/me/trading-account` | Yes | — | Get PAMM trading account |
| PATCH | `/api/pamm/managers/me` | Yes | body | Update manager profile |
| POST | `/api/pamm/accept-terms` | Yes | body | Accept terms |
| POST | `/api/pamm/follow` | Yes | body | Follow fund |
| POST | `/api/pamm/unfollow` | Yes | body | Unfollow |
| POST | `/api/pamm/add-funds` | Yes | `{ allocationId, amount }` | Add funds to allocation |
| POST | `/api/pamm/withdraw` | Yes | `{ allocationId, amount }` | Withdraw from allocation |

---

## 8. IB (Introducing Broker) — `/api/ib`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ib/profile` | Yes | My IB profile |
| POST | `/api/ib/register` | Yes | Register as IB |
| PATCH | `/api/ib/profile` | Yes | Update profile |
| GET | `/api/ib/balance` | Yes | Balance |
| GET | `/api/ib/stats` | Yes | Stats |
| GET | `/api/ib/commissions` | Yes | List commissions |
| GET | `/api/ib/pamm-commissions` | Yes | PAMM commissions |
| GET | `/api/ib/payouts` | Yes | List payouts |
| GET | `/api/ib/referrals` | Yes | Referrals |
| GET | `/api/ib/referrals/joinings` | Yes | Referral joinings |
| POST | `/api/ib/payouts` | Yes | Request payout |

---

## 9. Support — `/api/support`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/support/tickets` | Yes | Create ticket |
| GET | `/api/support/tickets` | Yes | List tickets |
| POST | `/api/support/tickets/:id/reply` | Yes | Reply to ticket |

---

## 10. Admin — `/api/admin`

All admin routes require an authenticated user with admin role. Some require **superadmin** (e.g. add funds, bulk import, PAMM IB commission settings).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/leads` | Admin | Leads |
| GET | `/api/admin/users` | Admin | List users |
| PATCH | `/api/admin/users/:id` | Admin | Update user |
| POST | `/api/admin/kyc-override` | Admin | KYC override |
| POST | `/api/admin/broadcast` | Admin | Broadcast |
| GET | `/api/admin/finance/company` | Admin | Query `from`, `to` — platform-wide ledger (company financials) |
| GET | `/api/admin/finance/ledger-entries` | Admin | Query `from`, `to`, optional `accountCode`, `referenceType`, `accountClass` (revenue\|expense\|pl), `limit` |
| POST | `/api/admin/wallets/:userId/add-funds` | Superadmin | Add funds to wallet |
| GET | `/api/admin/users/:userId/profit-commission-context` | Superadmin | PAMM allocs, wallet, IB flag for adjustment form |
| POST | `/api/admin/users/:userId/profit-commission-adjustment` | Superadmin | Body: `reason` (min 10 chars), optional `pammAllocationId` + `pammRealizedPnlDelta`, `walletProfitCreditUsd`, `ibCommissionPendingUsd` — single Mongo transaction |
| GET | `/api/admin/ib/profiles` | Admin | IB profiles |
| GET | `/api/admin/ib/commissions` | Admin | IB commissions |
| GET | `/api/admin/ib/wallets` | Admin | IB wallets |
| GET | `/api/admin/ib/settings` | Admin | IB settings |
| PUT | `/api/admin/ib/settings` | Admin | Update IB settings |
| GET | `/api/admin/ib/pamm-investor-commission` | Superadmin | PAMM IB commission settings |
| PUT | `/api/admin/ib/pamm-investor-commission` | Superadmin | Update PAMM IB commission |
| POST | `/api/admin/ib/:userId/payout` | Admin | Process IB payout |
| GET | `/api/admin/trading/top-traders` | Admin | Top traders |
| GET | `/api/admin/trading/users/:userId/summary` | Admin | User trading summary |
| GET | `/api/admin/trading/users/:userId/accounts` | Admin | User accounts |
| GET | `/api/admin/trading/users/:userId/wallet` | Admin | User wallet |
| GET | `/api/admin/trading/users/:userId/positions` | Admin | User positions |
| GET | `/api/admin/trading/users/:userId/positions/closed` | Admin | Closed positions |
| GET | `/api/admin/trading/users/:userId/orders` | Admin | User orders |
| POST | `/api/admin/trading/users/:userId/positions/:positionId/close` | Admin | Admin close position |
| POST | `/api/admin/trading/users/:userId/orders/:orderId/cancel` | Admin | Admin cancel order |
| GET | `/api/admin/trading/users/:userId/limits` | Admin | Trading limits |
| PUT | `/api/admin/trading/users/:userId/limits` | Admin | Update limits |
| GET | `/api/admin/trading/users/:userId/accounts/:accountId/config` | Admin | Account config |
| PUT | `/api/admin/trading/users/:userId/accounts/:accountId/config` | Admin | Update account config |
| GET | `/api/admin/execution-mode` | Admin | Execution mode |
| PUT | `/api/admin/execution-mode` | Admin | Update execution mode |
| GET | `/api/admin/hybrid-rules` | Admin | Hybrid rules |
| PUT | `/api/admin/hybrid-rules` | Admin | Update hybrid rules |
| GET | `/api/admin/logs/summary` | Admin | Logs summary |
| GET | `/api/admin/logs/files` | Admin | Log files |
| GET | `/api/admin/logs/download` | Admin | query: file |
| GET | `/api/admin/logs` | Admin | Logs |
| GET | `/api/admin/payments/settings` | Admin | Payment settings |
| PUT | `/api/admin/payments/settings` | Admin | Update payment settings |
| GET | `/api/admin/bulk-import/config` | Superadmin | Bulk import config |
| POST | `/api/admin/bulk-import` | Superadmin | Bulk import |
| GET | `/api/admin/pamm/distribution-runs` | Admin | PAMM distribution audit runs (`?limit=50`) |
| GET | `/api/admin/pamm/distribution-runs/:positionId` | Admin | Distribution runs for one position |
| GET | `/api/admin/pamm/funds` | Admin | List PAMM funds |
| POST | `/api/admin/pamm/funds` | Admin | Create PAMM fund |
| GET | `/api/admin/pamm/funds/:fundId` | Admin | Get PAMM fund |
| PATCH | `/api/admin/pamm/funds/:fundId` | Admin | Update PAMM fund |

---

## Postman environment variables

Create a Postman environment with:

| Variable | Initial / Current Value | Description |
|---------|-------------------------|-------------|
| `baseUrl` | `http://localhost:3000` | Backend base URL |
| `accessToken` | (empty, set after login) | JWT from login |
| `refreshToken` | (empty, optional) | For refresh flow |
| `userId` | (optional) | For path params e.g. admin |

**After login:** copy `accessToken` from the response into the `accessToken` environment variable, and set the collection/auth to use `Authorization: Bearer {{accessToken}}`.
