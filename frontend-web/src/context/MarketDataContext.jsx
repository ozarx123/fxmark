/**
 * MarketDataContext — single data pool for feed streams.
 * Receives ticks, candles, and trade updates in one place, distributes to consumers.
 * One socket connection, shared state.
 * Re-subscribes when token changes (after login) so a new socket is created with auth.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { subscribeTick, getDatafeedSocket } from '../lib/datafeedSocket.js';
import { useAuth } from './AuthContext.jsx';

const MarketDataContext = createContext(null);

export function MarketDataProvider({ children }) {
  const { token } = useAuth();
  const [ticks, setTicks] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [connected, setConnected] = useState(false);
  const [tradeSnapshot, setTradeSnapshot] = useState(null);

  useEffect(() => {
    const socket = getDatafeedSocket();
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const toInternalSymbol = (s) => String(s || '').replace(/\//g, '').toUpperCase();
    const unsubTick = subscribeTick((tickData) => {
      if (!tickData || typeof tickData !== 'object') return;
      const { symbol, close, price, providerTs, serverReceivedAt, serverBroadcastAt } = tickData;
      const p = close ?? price;
      if (symbol && Number.isFinite(Number(p))) {
        const key = toInternalSymbol(symbol);
        const now = Date.now();
        const latency = {
          providerToServerMs: providerTs && serverReceivedAt ? serverReceivedAt - providerTs : null,
          serverToClientMs: serverBroadcastAt ? now - serverBroadcastAt : null,
          endToEndMs: providerTs ? now - providerTs : null,
        };
        setTicks((prev) => ({
          ...prev,
          [key]: {
            ...tickData,
            close: Number(p),
            price: Number(p),
            latency,
          },
        }));
        setLastUpdate(new Date());
      }
    });

    const onTradeUpdate = (data) => {
      if (data && typeof data === 'object') {
        setTradeSnapshot({
          positions: Array.isArray(data.positions) ? data.positions : [],
          orders: Array.isArray(data.orders) ? data.orders : [],
          at: data.at || new Date().toISOString(),
        });
      }
    };
    socket.on('trade:update', onTradeUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('trade:update', onTradeUpdate);
      unsubTick();
      setConnected(false);
    };
  }, [token]);

  const value = { ticks, lastUpdate, connected, tradeSnapshot };
  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}

export function useMarketDataContext() {
  const ctx = useContext(MarketDataContext);
  if (!ctx) throw new Error('useMarketDataContext must be used within MarketDataProvider');
  return ctx;
}

/** Consume trade snapshot from WebSocket (positions, orders). Replaces REST polling. */
export function useTradeSnapshot() {
  const { tradeSnapshot } = useMarketDataContext();
  return tradeSnapshot;
}

