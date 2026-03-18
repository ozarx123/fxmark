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

function PositionCard({ position, onClose, onPartialClose, onModifySLTP, isClosing }) {
  const [showPartial, setShowPartial] = useState(false);
  const [partialVol, setPartialVol] = useState('');
  const [showModify, setShowModify] = useState(false);
  const [modifySL, setModifySL] = useState('');
  const [modifyTP, setModifyTP] = useState('');
  const symbol = position.symbol ?? '';
  const isGold = symbol.includes('XAU');
  const fmt = (p) => (p != null && Number.isFinite(p) ? Number(p).toFixed(isGold ? 2 : 4) : '—');
  const side = position.side || position.type || 'BUY';
  const vol = position.volume ?? position.lots ?? 0;
  const openPrice = position.openPrice ?? position.open_price ?? 0;
  const pnl = position.floatingPnL ?? position.floating_pnl ?? position.pnl ?? 0;
  const profit = (pnl ?? 0) >= 0;
  const sl = position.sl ?? position.sl_price ?? position.stopLoss;
  const tp = position.tp ?? position.tp_price ?? position.takeProfit;
  const handlePartial = () => {
    const v = parseFloat(partialVol);
    if (Number.isFinite(v) && v > 0 && v < vol && position.id) {
      onPartialClose?.(position.id, v);
      setPartialVol('');
      setShowPartial(false);
    }
  };
  const openModify = () => {
    setModifySL(sl != null ? String(sl) : '');
    setModifyTP(tp != null ? String(tp) : '');
    setShowModify(true);
  };
  const handleModify = () => {
    if (!position.id || !onModifySLTP) return;
    const newSL = modifySL.trim() === '' ? null : parseFloat(modifySL);
    const newTP = modifyTP.trim() === '' ? null : parseFloat(modifyTP);
    if (newSL !== null && !Number.isFinite(newSL)) return;
    if (newTP !== null && !Number.isFinite(newTP)) return;
    onModifySLTP(position.id, { stopLoss: newSL ?? undefined, takeProfit: newTP ?? undefined });
    setShowModify(false);
  };
  return (
    <li className="position-card">
      <div className="position-card__row position-card__header">
        <span className="position-card__symbol">{symbol}</span>
        <span className={`position-card__side position-card__side--${side.toLowerCase()}`}>{side}</span>
      </div>
      <div className="position-card__row">
        <span className="position-card__label">Lot</span>
        <span className="position-card__value">{Number(vol).toFixed(2)}</span>
      </div>
      <div className="position-card__row">
        <span className="position-card__label">Entry</span>
        <span className="position-card__value">{fmt(openPrice)}</span>
      </div>
      <div className="position-card__row">
        <span className="position-card__label">PnL</span>
        <span className={`position-card__pnl position-card__pnl--${profit ? 'profit' : 'loss'}`}>
          {profit ? '+' : ''}{Number(pnl ?? 0).toFixed(2)}
        </span>
      </div>
      {showPartial && (
        <div className="position-card__partial">
          <input
            type="number"
            step={0.01}
            min={0}
            max={vol}
            value={partialVol}
            onChange={(e) => setPartialVol(e.target.value)}
            placeholder="Volume"
            className="position-card__input"
          />
          <button type="button" className="position-card__btn position-card__btn--primary" onClick={handlePartial}>Close partial</button>
          <button type="button" className="position-card__btn" onClick={() => setShowPartial(false)}>Cancel</button>
        </div>
      )}
      {showModify && (
        <div className="position-card__partial">
          <input type="number" step={isGold ? 0.01 : 0.0001} placeholder="SL" value={modifySL} onChange={(e) => setModifySL(e.target.value)} className="position-card__input" />
          <input type="number" step={isGold ? 0.01 : 0.0001} placeholder="TP" value={modifyTP} onChange={(e) => setModifyTP(e.target.value)} className="position-card__input" />
          <button type="button" className="position-card__btn position-card__btn--primary" onClick={handleModify}>Save</button>
          <button type="button" className="position-card__btn" onClick={() => setShowModify(false)}>Cancel</button>
        </div>
      )}
      <div className="position-card__actions">
        <button type="button" className="position-card__btn position-card__btn--sell" onClick={() => position.id && onClose?.(position.id)} disabled={isClosing}>
          Close
        </button>
        <button type="button" className="position-card__btn" onClick={() => setShowPartial(true)}>Partial</button>
        <button type="button" className="position-card__btn" onClick={openModify}>SL/TP</button>
      </div>
    </li>
  );
}

export default function PositionsPanel({
  accountId,
  accountNumber,
  positions: controlledPositions,
  onPositionsChange,
  onRefresh,
  filterSymbol = '',
  sortBy = 'symbol',
  sortDir = 'asc',
  mobileCards = false,
  className = '',
}) {
  const [internalPositions, setInternalPositions] = useState([]);
  // When parent supplies positions (controlled mode), start with loading false so the table renders immediately
  const [loading, setLoading] = useState(() => controlledPositions == null);
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
    if (controlledPositions != null) {
      setLoading(false);
      return;
    }
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

  const filteredAndSorted = useMemo(() => {
    let list = positionsWithPnl;
    if (filterSymbol) {
      const key = toInternal(filterSymbol);
      list = list.filter((p) => toInternal(p.symbol) === key || (p.symbol || '').toUpperCase().includes(key));
    }
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === 'symbol') return mult * ((a.symbol || '').localeCompare(b.symbol || ''));
      if (sortBy === 'pnl') {
        const pa = a.floatingPnL ?? a.floating_pnl ?? 0;
        const pb = b.floatingPnL ?? b.floating_pnl ?? 0;
        return mult * (pa - pb);
      }
      if (sortBy === 'volume') return mult * ((a.volume ?? a.lots ?? 0) - (b.volume ?? b.lots ?? 0));
      return 0;
    });
  }, [positionsWithPnl, filterSymbol, sortBy, sortDir]);

  const handleClose = async (positionId) => {
    setClosingId(positionId);
    try {
      const pos = (positions || []).find((p) => p.id === positionId);
      const key = pos ? toInternal(pos.symbol) : '';
      const tick = key ? ticks?.[key] : null;
      const closePrice = tick?.close ?? tick?.price ?? pos?.currentPrice ?? pos?.openPrice ?? undefined;
      await tradingApi.closePosition(positionId, undefined, closePrice, opts);
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
      const pos = (positions || []).find((p) => p.id === positionId);
      const key = pos ? toInternal(pos.symbol) : '';
      const tick = key ? ticks?.[key] : null;
      const closePrice = tick?.close ?? tick?.price ?? pos?.currentPrice ?? pos?.openPrice ?? undefined;
      await tradingApi.closePosition(positionId, volume, closePrice, opts);
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

  if (mobileCards) {
    return (
      <div className={`terminal-positions-panel terminal-positions-panel--mobile-cards ${className}`}>
        {loading ? (
          <p className="terminal-positions-panel__empty">Loading…</p>
        ) : error ? (
          <p className="terminal-positions-panel__error">{error}</p>
        ) : filteredAndSorted.length === 0 ? (
          <p className="terminal-positions-panel__empty">No open positions</p>
        ) : (
          <ul className="terminal-positions-panel__cards">
            {filteredAndSorted.map((pos) => (
              <PositionCard
                key={pos.id}
                position={pos}
                onClose={handleClose}
                onPartialClose={handlePartialClose}
                onModifySLTP={handleModifySLTP}
                isClosing={closingId === pos.id}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }

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
          ) : filteredAndSorted.length === 0 ? (
            <tr><td colSpan={10} className="terminal-positions-panel__empty">No open positions</td></tr>
          ) : (
            filteredAndSorted.map((pos) => (
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
