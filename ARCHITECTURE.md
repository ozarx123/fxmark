# FXMark — System Architecture

## Table of Contents
1. [Overview](#1-overview)
2. [Top-Level Structure](#2-top-level-structure)
3. [Backend](#3-backend)
4. [Frontend](#4-frontend)
5. [Infrastructure](#5-infrastructure)
6. [Data Flow](#6-data-flow)
7. [Key Architectural Patterns](#7-key-architectural-patterns)
8. [Planned / Future Components](#8-planned--future-components)

---

## 1. Overview

FXMark is a **forex/CFD broker platform** with:
- Real-time FX trading (EURUSD, XAUUSD, etc.) powered by Twelve Data
- Full PAMM (Percent Allocation Money Management) fund system
- Multi-level Introducing Broker (IB) commission engine
- Double-entry bookkeeping ledger (GAAP-aligned chart of accounts)
- A-Book / B-Book risk routing (FIX protocol scaffolded)
- AI trading strategy scaffolding (Anthropic Claude SDK integrated)
- Role-based access: `user`, `ib`, `pamm_manager`, `admin`, `superadmin`

**Tech stack summary:**

| Layer | Technology |
|---|---|
| Backend API | Node.js 24 + Express 4, ES Modules |
| Primary Database | MongoDB Atlas (MongoDB 6 driver) |
| Cache | Redis 7 (ioredis) |
| Real-time | Socket.IO 4 + native WebSocket (`ws`) |
| Market Data | Twelve Data REST/WebSocket |
| Frontend | React 18 + Vite 5 + React Router v6 |
| Charts | Lightweight Charts (TradingView-compatible) |
| Hosting | Google Cloud Run (backend) + Vercel (frontend) |
| CI/CD | Google Cloud Build + GitHub Actions |

---

## 2. Top-Level Structure

```
fxmark/
├── backend/              # Node.js/Express API + market data server
├── frontend-web/         # React/Vite client trading portal (production)
├── frontend-admin/       # Legacy admin stub (not active)
├── apps/
│   ├── admin-web/        # Planned: Next.js admin portal
│   ├── client-portal/    # Planned: Next.js client portal
│   └── mobile/           # Planned: Flutter mobile app
├── mobile-app/           # Mobile component stub
├── docker/               # Dockerfiles, docker-compose, deploy scripts
├── database/             # schema.sql (PostgreSQL DDL reference)
├── .github/workflows/    # GitHub Actions CI (frontend)
├── cloudbuild.yaml       # Google Cloud Build (backend → Cloud Run)
├── ARCHITECTURE.md       # This file
├── DEPLOY.md
├── LIVE_DATA_SETUP.md
└── README.md
```

---

## 3. Backend

### 3.1 Entry Points

```
backend/
├── src/
│   ├── index.js          ← PRIMARY entry (npm start)
│   └── main.js           ← Alternative entry
├── core/
│   ├── server.js         ← Thin HTTP bootstrap (wraps app.js)
│   ├── app.js            ← Express app (CORS, body, routes, error handler)
│   └── routes.js         ← All /api/* route mounts
```

**`src/index.js`** is the production entry point:
- Creates Express + HTTP server with Socket.IO and native WebSocket (`/ws`)
- Mounts `/api/market` (market data) and `/api` (all business routes)
- Starts Twelve Data polling or WebSocket stream
- On each price tick: broadcasts to all clients, triggers TP/SL checks on open positions
- Health endpoints: `GET /health`, `GET /health/db`, `GET /health/redis`

### 3.2 API Routes

All routes prefixed `/api`, gated by `requireDb` middleware (verifies MongoDB connected):

| Route | Module | Description |
|---|---|---|
| `/api/auth` | auth | Register, login, logout, refresh token, me |
| `/api/trading` | trading | Orders, positions, trading accounts |
| `/api/wallet` | wallet | Deposit, withdraw, transfer, history |
| `/api/pamm` | pamm | PAMM managers, follow/unfollow, allocations |
| `/api/ib` | ib | IB profile, commissions, payouts |
| `/api/users` | users | User profile, KYC |
| `/api/admin` | admin | Admin management panel |
| `/api/support` | support | Tickets, notifications |
| `/api/finance` | finance | Ledger, reports, reconciliation |
| `/api/market` | market | Live quotes, candles, WebSocket datafeed |

### 3.3 Module Map

```
backend/modules/
├── auth/           JWT auth (bcrypt passwords, refresh token rotation, referral at registration)
├── users/          User CRUD, KYC (Sumsub integration stub)
├── trading/        Orders, positions, margin, execution, multi-account
├── wallet/         Deposit, withdrawal, transfer (all post to ledger)
├── pamm/           PAMM lifecycle, allocation engine, P&L distribution, performance fees
├── ib/             IB commission engine (5-level hierarchy), payout service
├── finance/        Double-entry ledger, chart of accounts, reports, reconciliation
├── admin/          Admin API, trading limits, user/PAMM/IB management, audit logs
├── support/        Tickets, Telegram + WhatsApp stubs, notifications
├── fix-engine/     FIX protocol session, LP connector, price feed, execution reports (stub)
└── risk-management/ A-Book/B-Book routing, exposure manager, hedging (stub)
```

#### Key Module Details

**`trading/`**
- Market orders immediately open a position; limit orders stay `pending`
- Contract sizes: GOLD/XAU = 100 oz/lot, all others = 100,000 units/lot
- On position close: posts P&L to ledger → credits/debits wallet → triggers PAMM distribution → calculates IB commissions → emits real-time trade events
- TP/SL auto-execution runs on every market tick

**`pamm/`**
- Manager registration creates a dedicated `pamm` trading account
- Follower allocates wallet funds → balance locked in PAMM
- On every position close: distribution engine splits P&L proportionally, deducts performance fee, posts ledger entries, updates wallet balances, fires IB commission chain, emits Socket.IO events
- High water mark performance fee (stub — `performance.fee.service.js`)

**`ib/`**
- Multi-level hierarchy (up to 5+ levels deep)
- Default rates: L1 $7/lot, L2 $5, L3 $3, L4 $2, L5 $1 (overridable per admin settings)
- On each trade close: resolves full upline chain, posts commission per level to ledger

**`finance/`**
- Enforces balanced journals (debits = credits ± 0.001 tolerance)
- Every financial event (deposit, withdrawal, P&L, IB commission, PAMM allocation) has a dedicated posting function
- Chart of accounts: Assets (1xxx), Liabilities (2xxx), Equity (3xxx), Revenue (4xxx), Expenses (5xxx)

**`risk-management/`**
- `ai-risk-switch.js`: Decides A-Book vs B-Book per order (currently hardcoded B-Book)
- A-Book routes to external LP via FIX protocol (scaffolded)
- B-Book internalizes the order

### 3.4 Data Models (MongoDB)

| Collection | Key Fields |
|---|---|
| `users` | email, passwordHash, name, role, kycStatus, referrerId, profileComplete |
| `refresh_tokens` | userId, jti, expiresAt |
| `wallets` | userId, currency, balance, locked |
| `wallet_transactions` | walletId, type, amount, currency, status, reference |
| `orders` | userId, accountId, symbol, side, volume, type, price, status, filledVolume |
| `positions` | userId, accountId, symbol, side, volume, openPrice, closePrice, pnl, tp, sl |
| `pamm_managers` | userId, fundName, aum, performanceFee, status |
| `pamm_allocations` | managerId, investorId, amount, realizedPnl |
| `ib_profiles` | userId, parentIbId, level, referralCode |
| `ib_commissions` | ibId, orderId, amount, rate, level |
| `ledger` | accountCode, entityId, debit, credit, currency, referenceType, pammFundId |

### 3.5 Market Data Services

```
backend/src/services/
├── twelveData.js           REST batch quote fetcher
├── twelveDataWebSocket.js  Real-time streaming (TWELVE_DATA_WS=true)
├── cache.js                Redis + in-memory fallback
├── marketDataLogger.js     Tick logging to file
└── tradeEvents.js          Socket.IO user room event emitter
```

### 3.6 AI Trading (Scaffolding)

```
backend/ai-trading/
├── strategy.m5.gold.js     M5 XAUUSD strategy (getSignal → signal/sl/tp)
├── backtesting.engine.js   Equity curve, trade list, Sharpe ratio
├── risk.parameters.js      maxLotPerTrade=0.1, maxDrawdown=10%, dailyLossCap=$100
├── news.filter.js          High-impact event exclusion (stub)
└── break-even.logic.js     Move SL to break-even after X pips (stub)
```

Anthropic Claude SDK (`@anthropic-ai/sdk@0.78.0`) is installed. API key: `ANTHROPIC_API_KEY` env var. Not yet wired to any route — ready for integration.

### 3.7 Background Jobs

| Job | Schedule | Purpose |
|---|---|---|
| `nightly.settlement.js` | Daily (EOD) | P&L reconciliation, daily statements |
| `ib.commission.cron.js` | Periodic | IB commission batch calculation |
| `pamm.performance.cron.js` | Periodic | PAMM performance fee calculation |
| `exposure.sync.js` | Periodic | Net exposure recalculation per symbol |

### 3.8 Environment Variables (`.env`)

| Variable | Purpose |
|---|---|
| `CONNECTION_STRING` | MongoDB Atlas URI |
| `JWT_SECRET` | JWT signing secret |
| `TWELVE_DATA_API_KEY` | Twelve Data market data API key |
| `TWELVE_DATA_WS` | `true` to use WebSocket instead of REST polling |
| `SUBSCRIBED_SYMBOLS` | Comma-separated symbols (default: XAUUSD,EURUSD) |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379`) |
| `PORT` | HTTP server port (default: 3000) |
| `ANTHROPIC_API_KEY` | Claude AI API key |

### 3.9 Key Backend Dependencies

| Package | Purpose |
|---|---|
| `express@^4.21` | HTTP framework |
| `mongodb@^6.21` | MongoDB driver |
| `jsonwebtoken@^9.0` | JWT auth |
| `bcryptjs@^3.0` | Password hashing |
| `socket.io@^4.8` | Real-time WebSocket |
| `ws@^8.18` | Native WebSocket server |
| `ioredis@^5.4` | Redis client |
| `@anthropic-ai/sdk@^0.78` | Claude AI SDK |
| `node-fetch@^3.3` | HTTP client |
| `dotenv@^16.4` | Environment config |

---

## 4. Frontend

**Stack**: React 18, React Router v6, Vite 5, ESM

**Production URL**: Deployed on Vercel (`VITE_API_URL` → Cloud Run backend)

### 4.1 App Structure

```
frontend-web/src/
├── App.jsx               Route definitions + provider nesting
├── AppLayout.jsx         Shared layout shell
├── main.jsx              Vite entry point
├── pages/                All route pages
├── components/           Shared UI components
├── context/              React context providers
├── hooks/                Custom React hooks
├── api/                  Backend API client modules
├── lib/                  Utilities (candleTime, datafeedSocket)
├── config/               Role-route config
└── constants/            Trading, finance, account group constants
```

### 4.2 Provider Nesting

```
AuthProvider
  └── BrowserRouter
        └── MarketDataProvider (WebSocket tick subscription)
              └── AccountProvider (active trading account)
                    └── FinanceProvider (wallet balance)
                          └── ProtectedRoute (auth + role guard)
                                └── Page Components
```

### 4.3 Page Map

**Public:**
- `/` → `Landing.jsx`
- `/auth` → `Auth.jsx` (login/register)
- `/auth/callback` → `AuthCallback.jsx`
- `/profile-setup` → `ProfileSetup.jsx`

**Client (authenticated):**
- `/dashboard` → `Dashboard`
- `/trading` → Trading terminal (charts, orders, positions)
- `/wallet` → Wallet (deposit/withdraw/transfer/history)
- `/finance` → Finance/ledger view
- `/pamm` → PAMM marketplace
- `/pamm/:id` → Fund detail
- `/pamm/manager` → PAMM manager dashboard
- `/pamm/ai` → AI PAMM fund
- `/copy` → Copy trading hub
- `/settings` → Profile settings

**IB (role: `ib`):**
- `/ib` → IB dashboard (commissions, referrals, payouts)

**Admin (role: `admin` / `superadmin`):**
- `/admin` → Admin dashboard
- `/admin/users` → User management
- `/admin/kyc` → KYC review
- `/admin/trading` → Live trading monitor
- `/admin/trader/:id` → Trader detail
- `/admin/financials` → Financial reports
- `/admin/pamm` → PAMM approvals
- `/admin/ib` → IB commission management
- `/admin/liquidity` → A/B-book management
- `/admin/market` → Market data config
- `/admin/leads` → CRM leads
- `/admin/tickets` → Support tickets
- `/admin/broadcast` → User messaging
- `/admin/audit` → Audit log
- `/admin/settings` → Platform settings

### 4.4 Key Components

| Component | Purpose |
|---|---|
| `FxChart.jsx` | Candlestick/line chart (Lightweight Charts). Live ticks via Socket.IO RAF-batched updates. Fallback sample data when API unavailable. |
| `OrderConfirmModalAdvanced.jsx` | Order placement with TP/SL, lot size validation |
| `ProtectedRoute.jsx` | Auth check + role-based access control |
| `WalletBalanceSync.jsx` | Keeps displayed wallet balance in sync |
| `ErrorBoundary.jsx` | React error boundary for graceful failures |

### 4.5 API Client Modules

| Module | Covers |
|---|---|
| `tradingApi.js` | Orders, positions, trading accounts |
| `walletApi.js` | Deposit, withdraw, transfer, history |
| `pammApi.js` | PAMM managers, follow, allocations |
| `ibApi.js` | IB profile, commissions, payouts |
| `financeApi.js` | Ledger entries, balances, reports |
| `adminApi.js` | All admin panel operations |

### 4.6 Frontend Dependencies

| Package | Purpose |
|---|---|
| `react@^18.2` | UI framework |
| `react-router-dom@^6.20` | Client-side routing |
| `lightweight-charts@^4.1` | TradingView-style OHLCV charts |
| `recharts@^2.10` | Admin dashboard charts |
| `socket.io-client@^4.8` | Real-time market data |
| `vite@^5.0` | Build tool |

---

## 5. Infrastructure

### 5.1 Local Development (Docker Compose)

```yaml
services:
  backend:   # Node.js API — port 3000
  mongodb:   # MongoDB 7 — port 27017 (volume: mongodata)
  postgres:  # PostgreSQL 15 — port 5432 (volume: pgdata) [planned]
  redis:     # Redis 7 — port 6379
```

**Redis (standalone Docker for dev):**
```bash
docker run -d --name redis-fxmark -p 6379:6379 --restart unless-stopped redis:alpine
```

### 5.2 Production Infrastructure

```
┌─────────────────────────────┐
│  Vercel (frontend-web)      │
│  React SPA → VITE_API_URL   │
└──────────────┬──────────────┘
               │ HTTPS
┌──────────────▼──────────────┐
│  Google Cloud Run            │
│  fxmark-backend (us-central1)│
│  Port 3000 — public          │
└──────┬───────────┬───────────┘
       │           │
┌──────▼──────┐  ┌─▼──────────┐
│ MongoDB Atlas│  │  Redis     │
│ (primary DB) │  │ (cache)    │
└─────────────┘  └────────────┘
```

### 5.3 CI/CD Pipelines

**Frontend (GitHub Actions → Vercel):**
1. Trigger: push/PR to `main`/`master` with `frontend-web/**` changes
2. Node 20, `npm ci`, `npm run build`
3. Vercel auto-deploys from GitHub integration
4. `VITE_API_URL` injected from GitHub secrets

**Backend (Google Cloud Build):**
1. Trigger: `gcloud builds submit --config=cloudbuild.yaml`
2. Docker image built → pushed to Google Container Registry (`$SHORT_SHA` + `latest`)
3. Deployed to Cloud Run (`fxmark-backend`, `us-central1`, unauthenticated)

---

## 6. Data Flow

### 6.1 Trade Execution Flow

```
Client → POST /api/trading/orders
  └── trading-limits.service (check block/drawdown/daily loss cap)
  └── order.service (validate symbol, side, volume, type)
  └── risk-management/ai-risk-switch (A-Book vs B-Book decision)
      ├── A-Book: fix-engine/lp.connector → external LP via FIX
      └── B-Book: position opened internally
  └── positions.service (create position record)
  └── margin.service (reserve margin from wallet)
```

### 6.2 Position Close Flow

```
Position Close (manual or TP/SL trigger)
  └── positions.service.closePosition()
      ├── Calculate P&L
      ├── finance/ledger.service → post trading P&L journal
      ├── wallet → credit/debit user balance
      ├── pamm/distribution.service → distribute P&L to PAMM investors
      │     ├── Performance fee deducted first
      │     ├── Each investor's share posted to ledger
      │     └── IB commission fired for each investor's upline
      ├── ib/commission.engine → calculate & post IB commission chain
      └── tradeEvents → emit real-time Socket.IO update to user room
```

### 6.3 Market Data Flow

```
Twelve Data API/WebSocket
  └── src/services/twelveData.js (poll) OR twelveDataWebSocket.js (stream)
  └── cache.js (Redis + in-memory fallback)
  └── src/index.js tick handler
      ├── Broadcast tick → Socket.IO clients + /ws WebSocket
      ├── Frontend FxChart (RAF-batched candle update)
      └── TP/SL checker → auto-close qualifying positions
```

### 6.4 Authentication Flow

```
POST /api/auth/register or /api/auth/login
  └── auth.service → bcrypt verify password
  └── Issue JWT access token (7d) + refresh token (30d, stored in MongoDB)
  └── Refresh: POST /api/auth/refresh (JTI rotation — old token invalidated)
  └── Logout: DELETE /api/auth/logout (JTI deleted from DB)
```

---

## 7. Key Architectural Patterns

### Double-Entry Bookkeeping
Every money movement posts a balanced journal. Example — Trade P&L win:
```
DR  Client Funds Liability (2100)   [money leaves client liability]
CR  Wallet Liability       (2110)   [credited to user wallet]
DR  Trading Loss Expense   (5200)   [broker absorbs loss]
CR  Trading Revenue        (4100)   [or records revenue on win]
```

### Real-Time Architecture
- Ticks arrive from Twelve Data → emitted to all Socket.IO rooms
- `FxChart.jsx` subscribes via `getDatafeedSocket()`, batches tick updates with `requestAnimationFrame` to avoid excessive redraws
- Trade events (open/close/fill) emitted to user-specific rooms via `tradeEvents.js`

### Role-Based Access Control
```
Roles: user → ib → pamm_manager → admin → superadmin
Frontend: ProtectedRoute checks auth + allowedRoles[]
Backend: role middleware on admin/ib/pamm routes
```

### ESM Migration State
Backend uses `"type": "module"` (ES Modules). Some older files (`ai-trading/`, `fix-engine/` stubs) still use CommonJS `require`/`module.exports`. Migration is partially complete.

### Dual Database Strategy
- **MongoDB**: Active primary store for all business data
- **PostgreSQL**: Configured but unused — `database/schema.sql` defines reference schema for users, wallets, ledger; likely intended for future analytics or compliance reporting

---

## 8. Planned / Future Components

| Component | Location | Status | Notes |
|---|---|---|---|
| Next.js Admin Portal | `apps/admin-web/` | Planned | Leads, Tickets, KYC, PAMM Controls, Broadcast |
| Flutter Mobile App | `apps/mobile/` | Planned | Multi-language, Phase 1: clients only |
| Claude AI Integration | `backend/utils/` | Ready to wire | SDK installed, `ANTHROPIC_API_KEY` needed |
| AI Trading Strategy | `backend/ai-trading/` | Stub | M5 XAUUSD strategy, backtesting engine |
| FIX Engine / A-Book | `backend/modules/fix-engine/` | Stub | FIX session scaffolded, LP connector needs real credentials |
| KYC (Sumsub) | `backend/modules/users/kyc.service.js` | Stub | `createApplicant`, `getAccessToken`, `getStatus` stubbed |
| Performance Fees | `backend/modules/pamm/performance.fee.service.js` | Stub | High water mark calculation — TODO |
| PostgreSQL Usage | `database/schema.sql` | Schema only | Not used by active Node code |
| Telegram / WhatsApp | `backend/modules/support/` | Stub | Integration files exist, no live credentials |
| Nightly Settlement | `backend/jobs/nightly.settlement.js` | Stub | Logs start/complete, logic TODO |
