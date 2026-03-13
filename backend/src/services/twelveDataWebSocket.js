import WebSocket from 'ws';
import { SYMBOL_MAP } from '../config/symbolMap.js';

/**
 * Twelve Data WebSocket endpoint candidates.
 * The officially documented streaming path is /v1/quotes/price.
 * Requires the "Grow" plan or higher — free plan returns 401/403, not 404.
 * If all return 404, the account plan does not include WebSocket access.
 */
const WS_URL_OPTIONS = [
  'wss://ws.twelvedata.com/v1/quotes/price', // official streaming endpoint (Growth plan+)
  'wss://ws.twelvedata.com/v1/quotes',       // alternate path (some docs)
  'wss://ws.twelvedata.com/v1',              // base v1 fallback
];

/** Phase 2: Heartbeat interval (Twelve Data may require client heartbeat to keep connection alive) */
const HEARTBEAT_INTERVAL_MS = 25000;

/** Map Twelve Data symbol back to internal (XAU/USD → XAUUSD, GOLD → XAUUSD) */
const FROM_TWELVE_SYMBOL = {
  'XAU/USD': 'XAUUSD',
  'GOLD': 'XAUUSD',
  'EUR/USD': 'EURUSD',
  'GBP/USD': 'GBPUSD',
  'USD/JPY': 'USDJPY',
  'USD/CHF': 'USDCHF',
  'USD/CAD': 'USDCAD',
  'AUD/USD': 'AUDUSD',
  'NZD/USD': 'NZDUSD',
};

function toInternalSymbol(twelveSymbol) {
  const key = (twelveSymbol || '').trim();
  const mapped = FROM_TWELVE_SYMBOL[key];
  if (mapped) return mapped;
  const fallback = key ? key.replace(/\//g, '').toUpperCase() : '';
  return fallback || null;
}

function parsePrice(d) {
  const price = parseFloat(d?.price ?? d?.close ?? d?.c ?? d?.p ?? 0);
  return Number.isFinite(price) ? price : 0;
}

/**
 * Twelve Data WebSocket client for real-time price streaming.
 * Phase 2: Subscribe, parse price/quote events, heartbeat, robust message handling.
 */
export function createTwelveDataWebSocket({ apiKey, symbols, onTick, onError }) {
  const symbolList = symbols ?? Object.keys(SYMBOL_MAP);
  const twelveSymbols = symbolList
    .map((s) => SYMBOL_MAP[s.toUpperCase()])
    .filter(Boolean);
  if (twelveSymbols.length === 0) {
    onError?.(new Error('No valid symbols for WebSocket'));
    return null;
  }

  // Phase 2: XAUUSD — add GOLD as fallback (some Twelve Data plans use GOLD for spot gold)
  const hasXAU = twelveSymbols.some((s) => s === 'XAU/USD');
  const symbolsToSubscribe = hasXAU ? [...new Set([...twelveSymbols, 'GOLD'])] : twelveSymbols;

  let ws = null;
  let urlIndex = 0;
  let retrying = false;
  let heartbeatId = null;

  function tryConnect() {
    if (urlIndex >= WS_URL_OPTIONS.length) {
      onError?.(new Error('All WebSocket URLs failed. Twelve Data WebSocket requires the "Grow" plan. REST polling will continue as sole tick source.'));
      return null;
    }

    retrying = false;
    const baseUrl = WS_URL_OPTIONS[urlIndex];
    const sep = baseUrl.includes('?') ? '&' : '?';
    // Some endpoints expect apikey, some api_key; try apikey first (documented)
    const url = `${baseUrl}${sep}apikey=${encodeURIComponent(apiKey.trim())}`;
    const safeUrl = url.replace(/apikey=[^&]+/, 'apikey=***');

    console.log(`[twelveDataWS] Trying URL ${urlIndex + 1}/${WS_URL_OPTIONS.length}: ${safeUrl}`);

    ws = new WebSocket(url, {
      perMessageDeflate: false,
      handshakeTimeout: 10000,
    });

    ws.on('unexpected-response', (req, res) => {
      if (retrying) return;
      retrying = true;
      if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          const msg = parsed?.message || parsed?.msg || body;
          console.warn(`[twelveDataWS] ${res.statusCode} from ${safeUrl}: ${(msg && String(msg).slice(0, 300)) || body?.slice(0, 200) || 'no body'}`);
        } catch {
          console.warn(`[twelveDataWS] ${res.statusCode} from ${safeUrl}: ${body?.slice(0, 200) || 'no body'}`);
        }
        if (res.statusCode === 404) {
          console.warn(`[twelveDataWS] 404 on all paths — WebSocket streaming requires the Twelve Data "Grow" plan ($29/mo). Free plan: REST polling only.`);
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          console.warn(`[twelveDataWS] ${res.statusCode} — API key invalid or plan does not include WebSocket. Upgrade to "Grow" plan.`);
        }
        urlIndex++;
        ws.removeAllListeners();
        ws = null;
        tryConnect();
      });
    });

    ws.on('open', () => {
      console.log(`[twelveDataWS] Connected to ${safeUrl}`);

      // Subscribe (Twelve Data: action + params.symbols; comma-separated or array both documented)
      const subscribePayload = {
        action: 'subscribe',
        params: {
          symbols: symbolsToSubscribe.join(','),  // e.g. "XAU/USD,GOLD"
        },
      };
      ws.send(JSON.stringify(subscribePayload));
      console.log('[twelveDataWS] Subscribed to', symbolsToSubscribe.join(', '));

      // Phase 2: Client heartbeat to keep connection alive
      if (heartbeatId) clearInterval(heartbeatId);
      heartbeatId = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'heartbeat' }));
        }
      }, HEARTBEAT_INTERVAL_MS);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const event = msg.event || msg.type;

        // Twelve Data format: {"event":"price","symbol":"EUR/USD","timestamp":1772352540,"price":1.1816464,...}
        const isPriceMsg = event === 'price' || event === 'quote' || (msg.symbol && (msg.price ?? msg.close ?? msg.c ?? msg.p));
        if (isPriceMsg) {
          let items = [msg];
          if (Array.isArray(msg)) items = msg;
          else if (msg.data) items = Array.isArray(msg.data) ? msg.data : [msg.data];
          const serverReceivedAt = Date.now();
          for (const d of items) {
            const sym = d?.symbol ?? msg?.symbol;
            const price = parsePrice(d);
            const internalSymbol = toInternalSymbol(sym);
            if (internalSymbol && price > 0) {
              const ts = d?.timestamp ?? d?.datetime ?? d?.t;
              const datetime = ts != null
                ? (typeof ts === 'number' ? new Date(ts * 1000).toISOString() : String(ts))
                : new Date().toISOString();
              onTick({
                symbol: internalSymbol,
                price,
                close: price,
                open: parseFloat(d?.open ?? d?.o ?? 0),
                high: parseFloat(d?.high ?? d?.h ?? 0),
                low: parseFloat(d?.low ?? d?.l ?? 0),
                volume: parseFloat(d?.volume ?? d?.v ?? 0),
                datetime,
                source: 'twelvedata_ws',
                providerTs: ts != null
                  ? (typeof ts === 'number' ? ts * 1000 : Date.parse(ts) || null)
                  : null,
                serverReceivedAt,
              });
            }
          }
        } else if ((event === 'subscribe' || event === 'heartbeat') && msg.status === 'ok') {
          if (event === 'subscribe') console.log('[twelveDataWS] Subscription confirmed');
        } else if (msg.status === 'error') {
          console.error('[twelveDataWS]', msg.message || msg);
          onError?.(new Error(msg.message || 'WebSocket error'));
        }
      } catch (err) {
        // ignore parse errors
      }
    });

    ws.on('error', (err) => {
      console.error('[twelveDataWS] Error:', err.message);
      if (!retrying && (err.message?.includes('404') || err.message?.includes('Unexpected'))) {
        retrying = true;
        if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
        urlIndex++;
        if (ws) {
          ws.removeAllListeners();
          ws = null;
        }
        tryConnect();
      } else if (!retrying) {
        onError?.(err);
      }
    });

    ws.on('close', (code, reason) => {
      if (heartbeatId) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
      console.warn('[twelveDataWS] Closed', code, reason?.toString());
    });
  }

  tryConnect();

  return {
    close: () => {
      if (heartbeatId) clearInterval(heartbeatId);
      ws?.close();
    },
    get readyState() {
      return ws?.readyState ?? 0;
    },
  };
}
