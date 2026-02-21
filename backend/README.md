# FXMARK Backend Market-Data Service

Backend service for FXMARK that provides market data via REST and WebSocket, using the Twelve Data API.

## Setup

1. **Clone and install**

   ```bash
   cd backend
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

   Required:

   - `TWELVE_DATA_API_KEY` – Get a free API key at [twelvedata.com](https://twelvedata.com)

   Optional:

   - `REDIS_URL` – Redis connection string (future use; in-memory cache is used when not set)
   - `PORT` – Server port (default: 3000)

3. **Run**

   ```bash
   npm start
   ```

   Or with auto-reload:

   ```bash
   npm run dev
   ```

## API

### REST

- **GET** `/health` – Health check
- **GET** `/api/market/candles?symbol=EURUSD&tf=1m&from=&to=`
  - `symbol` – Internal symbol (EURUSD, XAUUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD)
  - `tf` – Timeframe: 1m, 5m, 15m, 1h, 1d
  - `from` – Start date in UTC (ISO format, optional)
  - `to` – End date in UTC (ISO format, optional)
  - Returns: `[{ time, open, high, low, close, volume }, ...]`

### WebSocket

Connect to `ws://localhost:3000/ws`.

**Server messages**

- `{ type: "tick", data: { symbol, price, open, high, low, close, volume, datetime } }` – Real-time quote updates every ~2 seconds
- `{ type: "candle", data: { ... } }` – Candle updates (when implemented)
- `{ type: "pong" }` – Response to `ping`

**Client messages**

- `{ type: "ping" }` – Keepalive / health check

## Timeframes

- `1m` – 1 minute  
- `5m` – 5 minutes  
- `15m` – 15 minutes  
- `1h` – 1 hour  
- `1d` – 1 day  

All timestamps are in UTC.
