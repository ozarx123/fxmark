import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as tradingApi from '../../api/tradingApi';
import { useTradingSocket } from '../../services/tradingSocket';
import { useMarketDataContext } from '../../context/MarketDataContext';
import { computeFloatingPnL, getPriceDifference } from '../../lib/positionPnL';
import PositionRow from './PositionRow';

function toInternal(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}

function mergePositionWithPrice(pos, ticks) {
  const key = toInternal(pos.symbol);
  const tick = ticks?.[key];
  const currentPrice = tick?.close ?? tick?.price ?? pos.currentPrice ?? pos.openPrice ?? pos.open_price;
  const openPrice = pos.openPrice ?? pos.open_price ?? 0;
  const volume = pos.volume ?? pos.lots ?? 0;
  const side = pos.side || pos.type || 'BUY';
  const floatingPnL = currentPrice != null && openPrice
    ? computeFloatingPnL({ ...pos, openPrice, volume, side }, currentPrice)
    : pos.floatingPnL ?? pos.floating_pnl ?? pos.pnl ?? 0;
  const priceDiff = getPriceDifference({ ...pos, openPrice, side }, currentPrice);
  return {
    ...pos,
    openPrice,
    currentPrice,
    floatingPnL,
    priceDiff,
    volume,
    side,
  };
}

export default function PositionsPanel({
  accountId,
  accountNumber,
  positions: controlledPositions,
  onPositionsChange,
  onRefresh,
  className = '',
}) {
  const [internalPositions, setInternalPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closingId, setClosingId] = useState(null);
  const { ticks } = useMarketDataContext();
  const { positionUpdates } = useTradingSocket();
  const opts = { accountId, accountNumber };

  const positions = controlledPositions != null ? controlledPositions : internalPositions;
  const setPositions = onPositionsChange ?? setInternalPositions;

  const ticksRef = useRef(ticks);
  ticksRef.current = ticks;
  const [tickVersion, setTickVersion] = useState(0);
  const rafScheduledRef = useRef(false);

  useEffect(() => {
    if (!ticks || Object.keys(ticks).length === 0) return;
    if (rafScheduledRef.current) return;
    rafScheduledRef.current = true;
    const raf = requestAnimationFrame(() => {
      rafScheduledRef.current = false;
      setTickVersion((v) => v + 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [ticks]);

  const load = useCallback(async () => {
    if (!accountId && !accountNumber) return;
    setLoading(true);
    setError(null);
    try {
      const data = await tradingApi.getOpenPositions({}, opts);
      const list = Array.isArray(data) ? data : [];
      setPositions(list);
    } catch (e) {
      setError(e.message);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, accountNumber, setPositions]);

  useEffect(() => {
    if (controlledPositions != null) return;
    load();
  }, [load, controlledPositions != null]);

  useEffect(() => {
    if (!positionUpdates?.length) return;
    setPositions((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      positionUpdates.forEach((u) => {
        if (u.status === 'CLOSED') byId.delete(u.id);
        else byId.set(u.id, { ...byId.get(u.id), ...u });
      });
      return Array.from(byId.values());
    });
  }, [positionUpdates, setPositions]);

  const positionsWithPnl = useMemo(
    () => positions.map((p) => mergePositionWithPrice(p, ticksRef.current ?? ticks)),
    [positions, tickVersion, ticks]
  );

  const handleClose = async (positionId) => {
    setClosingId(positionId);
    try {
      await tradingApi.closePosition(positionId, undefined, undefined, opts);
      if (controlledPositions != null && onRefresh) onRefresh();
      else await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setClosingId(null);
    }
  };

  const handlePartialClose = async (positionId, volume) => {
    setClosingId(positionId);
    try {
      await tradingApi.closePosition(positionId, volume, undefined, opts);
      if (controlledPositions != null && onRefresh) onRefresh();
      else await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setClosingId(null);
    }
  };

  const handleModifySLTP = async (positionId, { takeProfit, stopLoss }) => {
    try {
      await tradingApi.updatePositionTPLS(positionId, { takeProfit, stopLoss }, opts);
      if (controlledPositions != null && onRefresh) onRefresh();
      else await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className={`terminal-positions-panel ${className}`}>
      <table className="terminal-positions-panel__table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Volume</th>
            <th>Open</th>
            <th>Current</th>
            <th>Δ Price</th>
            <th>Floating PnL</th>
            <th>SL</th>
            <th>TP</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="terminal-positions-panel__empty">Loading…</td></tr>
          ) : error ? (
            <tr><td colSpan={10} className="terminal-positions-panel__error">{error}</td></tr>
          ) : positionsWithPnl.length === 0 ? (
            <tr><td colSpan={10} className="terminal-positions-panel__empty">No open positions</td></tr>
          ) : (
            positionsWithPnl.map((pos) => (
              <PositionRow
                key={pos.id}
                position={pos}
                onClose={handleClose}
                onPartialClose={handlePartialClose}
                onModifySLTP={handleModifySLTP}
                isClosing={closingId === pos.id}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
