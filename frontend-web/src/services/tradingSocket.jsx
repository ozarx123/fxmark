/**
 * Trading WebSocket — centralizes order_update, position_update, balance_update, risk_event.
 * Uses the same Socket.IO connection as the market datafeed (datafeedSocket).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getDatafeedSocket } from '../lib/datafeedSocket.js';

const TradingSocketContext = createContext(null);

export function TradingSocketProvider({ children }) {
  const [balanceUpdate, setBalanceUpdate] = useState(null);
  const [positionUpdates, setPositionUpdates] = useState([]);
  const [orderUpdates, setOrderUpdates] = useState([]);
  const [riskEvents, setRiskEvents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getDatafeedSocket();
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const onBalance = (data) => {
      if (data && typeof data === 'object') setBalanceUpdate({ ...data, at: Date.now() });
    };
    const onPosition = (data) => {
      if (data && typeof data === 'object') {
        setPositionUpdates((prev) => {
          const next = prev.filter((p) => p.id !== data.id);
          if (data.status !== 'CLOSED') next.push(data);
          return next;
        });
      }
    };
    const onOrder = (data) => {
      if (data && typeof data === 'object') {
        setOrderUpdates((prev) => {
          const next = prev.filter((o) => o.id !== data.id);
          next.push(data);
          return next.slice(-100);
        });
      }
    };
    const onRisk = (data) => {
      if (data && typeof data === 'object') {
        setRiskEvents((prev) => [...prev.slice(-50), { ...data, at: Date.now() }]);
      }
    };

    socket.on('balance_update', onBalance);
    socket.on('position_update', onPosition);
    socket.on('order_update', onOrder);
    socket.on('risk_event', onRisk);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('balance_update', onBalance);
      socket.off('position_update', onPosition);
      socket.off('order_update', onOrder);
      socket.off('risk_event', onRisk);
      setConnected(false);
    };
  }, []);

  const value = {
    connected,
    balanceUpdate,
    positionUpdates,
    orderUpdates,
    riskEvents,
    clearRiskEvents: useCallback(() => setRiskEvents([]), []),
  };

  return (
    <TradingSocketContext.Provider value={value}>
      {children}
    </TradingSocketContext.Provider>
  );
}

export function useTradingSocket() {
  const ctx = useContext(TradingSocketContext);
  return ctx ?? {
    connected: false,
    balanceUpdate: null,
    positionUpdates: [],
    orderUpdates: [],
    riskEvents: [],
    clearRiskEvents: () => {},
  };
}
