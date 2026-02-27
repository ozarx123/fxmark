/**
 * MarketDataContext — single data pool for feed streams.
 * Receives ticks, candles, and trade updates in one place, distributes to consumers.
 * One socket connection, shared state.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { subscribeTick, getDatafeedSocket } from '../lib/datafeedSocket.js';

const MarketDataContext = createContext(null);

export function MarketDataProvider({ children }) {
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

    const unsubTick = subscribeTick((tickData) => {
      if (!tickData || typeof tickData !== 'object') return;
      const { symbol, close, price } = tickData;
      const p = close ?? price;
      if (symbol && Number.isFinite(Number(p))) {
        setTicks((prev) => ({ ...prev, [symbol]: { ...tickData, close: Number(p), price: Number(p) } }));
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
  }, []);

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
