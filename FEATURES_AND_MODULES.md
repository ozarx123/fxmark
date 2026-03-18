# FXMARK — Completed Features and Modules

This document lists **features and modules that are already implemented** in the project (backend, frontend-web, and supporting pieces).

---

## Backend modules (API)

### 1. **Auth** (`/api/auth`)
- User registration (signup) and login (email/password)
- JWT access + refresh tokens; logout
- **Email verification**: send on signup, verify via link, resend; **mandatory** (login/refresh rejected until verified)
- Google OAuth (redirect + callback)
- `GET /me` (current user)
- Routes: `register`, `signup`, `login`, `refresh`, `logout`, `me`, `verify-email` (GET/POST), `resend-verification`

### 2. **Users** (`/api/users`)
- User profile: get and update
- KYC: get status, submit (with file upload)
- Routes: `profile` (GET/PATCH), `kyc` (GET), `kyc/submit` (POST)

### 3. **Trading** (`/api/trading`)
- **Trading accounts**: list, create, get, account summary (with `X-Account-Id` / `X-Account-Number` header resolution)
- **Orders**: place (market, limit, buy/sell limit/stop), list, get, update (TP/SL), cancel
- **Positions**: open/closed positions, get, update TP/SL, close position
- Execution routing: A-Book / B-Book / Hybrid rules (admin-configurable)
- CRM/trading permission checks (KYC, daily loss limits, symbol, account)
- Pending-orders engine (triggers on price)
- Routes: `accounts`, `account-summary`, `accounts/:accountId`, `orders`, `orders/:orderId`, `positions`, `positions/closed`, `positions/:positionId`, etc.

### 4. **Wallet** (`/api/wallet`)
- Balance, deposits, withdrawals, trades, transfers
- Create deposit, confirm deposit; request withdrawal, process withdrawal
- Transfer: lookup recipient, execute transfer
- Routes: `balance`, `deposits`, `withdrawals`, `trades`, `transfers`, `deposits` (POST), `deposits/:id/confirm`, `withdrawals` (POST), `withdrawals/:id/process`, `transfer/lookup`, `transfer` (POST)

### 5. **PAMM (Fund/Manager)** (`/api/pamm`)
- Managers: list, get profile, get manager’s trades; register as manager, update profile
- Funds: fund detail (allocations, performance, follow/unfollow)
- Follow/unfollow, add funds, withdraw
- Manager: my funds, allocations, follower trades, investors, trades; create/get PAMM trading account
- Allocation engine, distribution service, performance fee service
- Routes: `managers`, `managers/me`, `managers/:managerId`, `managers/:managerId/trades`, `funds/:fundId`, `follow`, `unfollow`, `add-funds`, `withdraw`, etc.

### 6. **Finance** (`/api/finance`)
- **Ledger**: entries, balances, P&amp;L, reconciliation; PAMM fund ledger
- **Chart of accounts**: list
- **Reports**: daily, monthly; statements
- Double-entry ledger, P&amp;L service, reconciliation service
- Routes: `ledger/entries`, `ledger/balances`, `ledger/pnl`, `ledger/reconciliation`, `ledger/pamm/:fundId`, `chart-of-accounts`, `reports/daily`, `reports/monthly`, `statements`

### 7. **Admin** (`/api/admin`)
- **Users**: list, update; **Leads**
- **PAMM**: list managers, approve manager; privacy toggle; **Broadcast**
- **KYC**: override
- **Wallets**: add funds (superadmin)
- **IB**: profiles, commissions, wallets, settings (GET/PUT), payout (admin process)
- **Trading monitor**: top traders; per-user summary, accounts, wallet, positions (open/closed), orders; admin close position / cancel order; trading limits (GET/PUT); account config (GET/PUT)
- **Execution mode**: A-Book / B-Book / Hybrid (GET/PUT); hybrid rules (GET/PUT)
- **Logs**: summary, list files, download, get log entries
- Routes: `leads`, `users`, `users/:id`, `pamm/managers`, `pamm/managers/:id`, `kyc-override`, `pamm-privacy`, `broadcast`, `wallets/:userId/add-funds`, `ib/*`, `trading/*`, `execution-mode`, `hybrid-rules`, `logs/*`

### 8. **Support** (`/api/support`)
- Tickets: create, list, reply
- Notification service (email channel); Telegram and WhatsApp integrations
- Routes: `tickets` (POST/GET), `tickets/:id/reply` (POST)

### 9. **IB (Introducing Brokers)** (`/api/ib`)
- Profile: get, register, update
- Balance, stats, commissions, payouts, referrals, referral joinings
- Request payout
- Commission engine, level calculator, payout service
- Routes: `profile`, `register`, `balance`, `stats`, `commissions`, `payouts`, `referrals`, `referrals/joinings`, `payouts` (POST)

---

## Backend — Supporting / internal

- **Email**: Nodemailer-based service (e.g. Gmail SMTP); used for verification and notifications
- **Risk management**: A-Book router, B-Book router, exposure manager, hedging service, AI risk switch; hybrid rules evaluator for routing
- **FIX engine**: FIX session, router, LP connector, price feed, execution report handler (integration points for liquidity provider)
- **CRM**: CRM integration service (trading permissions, etc.)
- **Jobs**: `nightly.settlement`, `exposure.sync`, `ib.commission.cron`, `pamm.performance.cron`
- **AI trading** (logic/strategy): backtesting engine, news filter, M5 gold strategy, break-even logic, risk parameters
- **Config**: MongoDB, Redis, env, FIX, liquidity (default route)
- **Core**: Express app, CORS, JSON, request ID, error handler; JWT auth middleware; DB middleware; route aggregation

---

## Backend — Market data (in `src/`)

- REST market routes (e.g. quotes)
- WebSocket: tick broadcast, market data logging
- TwelveData and Finnhub: REST + WebSocket feeds; cache (Redis when available)
- Pending-orders engine and position checks wired into the main server

---

## Frontend (frontend-web) — Pages and features

### Auth & onboarding
- **Landing** (`/`)
- **Auth** (`/auth`): Login, signup (email/password), Google OAuth; redirect after login; email verification required (redirect to verify-email on 403)
- **Auth callback** (`/auth/callback`): OAuth callback
- **Verify email** (`/auth/verify-email`): Verify from link (`?token=...`), success/error, resend form (pre-filled from state or user)
- **Profile setup** (`/auth/profile-setup`): Post-login profile completion

### Client app (protected; email verification required)
- **Dashboard** (`/dashboard`)
- **Wallet** (`/wallet`): Balance, deposits, withdrawals, transfers; gateway redirect (`/gateway-redirect`)
- **Trading** (`/trading`, `/trading/terminal`): Trading UI with TradingSocketProvider
- **PAMM**: List (`/pamm`), PAMM AI (`/pamm-ai`), fund detail (`/pamm/fund/:fundId`), manager (`/pamm/manager` for PAMM manager role); follow/unfollow, add funds, withdraw modals
- **Copy trading**: Hub (`/copy`), following (`/copy/following`), manager (`/copy/manager`), master profile (`/copy/master/:slug`)
- **IB** (`/ib`): For IB roles — profile, balance, commissions, payouts, referrals, register
- **Finance** (`/finance`): Ledger, reports, statements (user-facing)
- **Settings** (`/settings/profile`): Profile and KYC

### Admin (admin role)
- **Admin layout** with nav; role-based access (`ADMIN_ROLES`)
- **Dashboard** (`/admin`)
- **Financials** (`/admin/financials`)
- **Trading monitor** (`/admin/trading-monitor`, `/admin/trading-monitor/:userId`)
- **Users** (`/admin/users`)
- **IB commission** (`/admin/ib-commission`)
- **Audit log** (`/admin/audit`)
- **PAMM** (`/admin/pamm`)
- **Liquidity** (`/admin/liquidity`)
- **Leads** (`/admin/leads`)
- **Tickets** (`/admin/tickets`)
- **KYC** (`/admin/kyc`)
- **Broadcast** (`/admin/broadcast`)
- **Market** (`/admin/market`)
- **Logs** (`/admin/logs`)
- **Settings** (`/admin/settings`)

### UI & infrastructure
- **ProtectedRoute**: Auth required, email verification required, profile setup redirect, role-based (admin, PAMM manager, IB)
- **Contexts**: Auth, MarketData, Account, Finance; TradingSocketProvider
- **Components**: FxChart, wallet sync, modals (order confirm, deposit/withdraw, transfer, history, etc.), icons, layout
- **API clients**: tradingApi, walletApi, financeApi, adminApi, pammApi, ibApi

---

## Summary table

| Area           | Backend | Frontend (web) |
|----------------|--------|-----------------|
| Auth + email   | ✅     | ✅              |
| Users + KYC    | ✅     | ✅ (profile, settings) |
| Trading        | ✅     | ✅ (trading + terminal) |
| Wallet         | ✅     | ✅              |
| PAMM           | ✅     | ✅ (list, AI, fund, manager) |
| Copy trading   | —      | ✅ (hub, following, manager, master) |
| Finance        | ✅     | ✅ (user + admin) |
| Admin          | ✅     | ✅ (full admin panel) |
| Support        | ✅     | ✅ (tickets in admin) |
| IB             | ✅     | ✅ (client + admin) |
| Market data    | ✅     | ✅ (context, chart, live) |

---

*Generated from the current codebase. For deployment and env setup, see README.md, DEPLOY.md, and LIVE_DATA_SETUP.md.*
