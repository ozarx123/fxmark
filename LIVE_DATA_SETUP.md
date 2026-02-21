# FXMARK Live Data Setup (Twelve Data MVP)

## Overview

The FXMARK MVP connects to Twelve Data for live candles and real-time quotes via a backend aggregator. The API key is kept private on the server.

## Architecture

```
[Frontend]  <-- REST (candles) + WebSocket (ticks) -->  [Backend]  <-- Twelve Data API
```

- **Backend** (`backend/`): Express server, REST candles endpoint, WebSocket for ticks, quote poller (2s)
- **Frontend** (`frontend-web/`): TradingView Lightweight Charts, useMarketData hook
- **Symbols**: XAU/USD, EUR/USD, GBP/USD, USD/JPY, USD/CHF, USD/CAD, AUD/USD, NZD/USD
- **Timeframes**: 1m, 5m, 15m, 1h, 1d

## Quick Start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your TWELVE_DATA_API_KEY from https://twelvedata.com
npm start
```

Backend runs on `http://localhost:3000`. WebSocket: `ws://localhost:3000/ws`.

### 2. Frontend

```bash
cd frontend-web
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`. Vite proxies `/api` and `/ws` to the backend.

### 3. Usage

1. Open the Trading page
2. Select symbol (XAU/USD, EUR/USD, etc.) and timeframe (1m, 5m, etc.)
3. Charts load candles from the API and update with live ticks over WebSocket
4. If the API key is missing or the backend is down, a "Data delayed" badge appears and sample data is shown

## API

- **GET** `/api/market/candles?symbol=EURUSD&tf=1m` – Historical candles (symbol in internal format: EURUSD, XAUUSD)
- **WebSocket** `/ws` – Server broadcasts `{ type: 'tick', data: { symbol, price, close, ... } }` every ~2 seconds

## Troubleshooting

- **"Data delayed"**: Backend not running, or `TWELVE_DATA_API_KEY` not set
- **Empty chart**: Check backend logs; Twelve Data free tier has rate limits (8 API calls/min for candles, 8/min for quotes)
- **CORS / WebSocket**: Use the Vite dev server (`npm run dev`), which proxies to the backend
