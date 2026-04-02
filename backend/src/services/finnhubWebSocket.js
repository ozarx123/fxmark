import WebSocket from 'ws';
import { TO_FINNHUB, FROM_FINNHUB } from '../config/finnhubSymbols.js';

const RECONNECT_BASE_MS = 2000;
/** Cap for normal disconnects; 429 / rate-limit uses longer waits below */
const RECONNECT_MAX_MS = 120_000;
/** Finnhub returns 429 on WS upgrade when reconnecting too fast — wait at least this long */
const RATE_LIMIT_MIN_DELAY_MS = 60_000;

/**
 * How long to wait with no incoming trade messages before the stream is
 * considered stale (connection alive but Finnhub stopped sending prices).
 * Triggers onDisconnect('stale') so the fallback chain can take over.
 */
const STALE_TIMEOUT_MS = 45_000;

/**
 * Create and manage a Finnhub WebSocket price feed.
 *
 * Callbacks:
 *   onTick(tick)          — normalised internal tick
 *   onConnect()           — called when the WS opens and subscribes
 *   onDisconnect(reason)  — called on close or stale ('close' | 'stale')
 *   onError(err)          — called on WS error events
 *
 * Auto-reconnect with exponential back-off (2 s → 4 s → … → 30 s max).
 *
 * @returns {{ close(): void, readyState: number } | null}
 */
export function createFinnhubWebSocket({ apiKey, symbols, onTick, onConnect, onDisconnect, onError }) {
  if (!apiKey) {
    onError?.(new Error('FINNHUB_API_KEY not set'));
    return null;
  }

  // Map requested internal symbols to Finnhub format; skip unknowns
  const finnhubSymbols = [...new Set(
    (symbols ?? []).map((s) => TO_FINNHUB[s.toUpperCase()]).filter(Boolean)
  )];

  if (finnhubSymbols.length === 0) {
    onError?.(new Error('No supported Finnhub symbols in SUBSCRIBED_SYMBOLS'));
    return null;
  }

  let ws             = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer = null;
  let staleTimer     = null;
  let destroyed      = false;

  // Track last logged price per symbol to suppress log noise during tick bursts
  const lastLoggedPrice = new Map(); // internalSymbol → price

  // ── Stale-stream watchdog ──────────────────────────────────────────────────
  // Resets on every valid trade message. Fires if Finnhub goes silent.
  function resetStaleTimer() {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      console.warn('[FINNHUB] No ticks for 45 s — stream is stale, triggering reconnect');
      onDisconnect?.('stale');
      // Force-close so the 'close' handler fires and schedules reconnect
      ws?.terminate();
    }, STALE_TIMEOUT_MS);
  }

  function clearStaleTimer() {
    if (staleTimer) { clearTimeout(staleTimer); staleTimer = null; }
  }

  // ── Connection ────────────────────────────────────────────────────────────
  function connect() {
    if (destroyed) return;

    clearStaleTimer();

    // Only one live socket: tear down any previous instance before opening a new one
    if (ws) {
      try {
        ws.removeAllListeners();
      } catch (_) {
        /* ignore */
      }
      try {
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
      } catch (_) {
        /* ignore */
      }
      ws = null;
    }

    const url = `wss://ws.finnhub.io?token=${apiKey}`;
    console.log(`[FINNHUB] Connecting to wss://ws.finnhub.io?token=***`);

    ws = new WebSocket(url, { handshakeTimeout: 10_000 });

    ws.on('open', () => {
      console.log('FINNHUB_CONNECTED');
      reconnectDelay = RECONNECT_BASE_MS; // reset back-off on successful connection

      // Subscribe to each symbol individually (Finnhub API requirement)
      for (const sym of finnhubSymbols) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      }
      console.log(`[FINNHUB] Subscribed to: ${finnhubSymbols.join(', ')}`);

      onConnect?.();
      resetStaleTimer(); // start watching for stale stream
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore non-JSON frames (ping/pong)
      }

      // Ping-pong: Finnhub sends {"type":"ping"} occasionally
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // Only process trade messages
      if (msg.type !== 'trade' || !Array.isArray(msg.data) || msg.data.length === 0) return;

      resetStaleTimer(); // fresh data → stream is alive

      const serverReceivedAt = Date.now();

      for (const d of msg.data) {
        const internalSymbol = FROM_FINNHUB[d.s];
        if (!internalSymbol) continue; // unknown symbol — skip

        const price = parseFloat(d.p);
        if (!Number.isFinite(price) || price <= 0) continue;

        // Finnhub timestamps are milliseconds since epoch
        const tsMs     = typeof d.t === 'number' ? d.t : serverReceivedAt;
        const datetime = new Date(tsMs).toISOString();

        // Log only when the price actually changes — suppresses burst noise
        if (lastLoggedPrice.get(internalSymbol) !== price) {
          lastLoggedPrice.set(internalSymbol, price);
          console.log(`FINNHUB_TICK ${internalSymbol} ${price}`);
        }

        onTick({
          symbol:          internalSymbol,
          price,
          close:           price,
          open:            price,
          high:            price,
          low:             price,
          volume:          parseFloat(d.v ?? 0),
          datetime,
          timestamp:       tsMs,
          source:          'finnhub_ws',
          serverReceivedAt,
        });
      }
    });

    ws.on('error', (err) => {
      const msg = String(err?.message || err);
      console.error(`FINNHUB_ERROR: ${msg}`);
      onError?.(err);
      // Rate-limit on handshake (429) — avoid tight reconnect loops that keep failing
      if (/\b429\b|rate\s*limit/i.test(msg)) {
        reconnectDelay = Math.max(reconnectDelay, RATE_LIMIT_MIN_DELAY_MS);
        console.warn(
          `[FINNHUB] WebSocket handshake rate-limited — next reconnect in ≥${RATE_LIMIT_MIN_DELAY_MS / 1000}s (with jitter)`
        );
      }
      // 'close' event always fires after 'error', so reconnect is handled there
    });

    ws.on('close', (code, reason) => {
      clearStaleTimer();
      const why = reason?.toString() || '—';
      console.warn(`[FINNHUB] Disconnected (code=${code} reason=${why})`);
      onDisconnect?.('close');

      if (!destroyed) {
        scheduleReconnect();
      }
    });
  }

  // ── Auto-reconnect with exponential back-off ──────────────────────────────
  function scheduleReconnect() {
    if (destroyed) return;
    const jitter = Math.floor(Math.random() * 2500);
    const waitMs = reconnectDelay + jitter;
    console.log(`FINNHUB_RECONNECTING in ${waitMs}ms…`);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      connect();
    }, waitMs);
  }

  connect();

  return {
    close() {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearStaleTimer();
      ws?.close();
    },
    get readyState() {
      return ws?.readyState ?? WebSocket.CLOSED;
    },
  };
}
