import React, { useState, useEffect } from 'react';

const LOT_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10];

// Mock positions for demo; replace with API data
const MOCK_POSITIONS = [
  { id: 1, symbol: 'EUR/USD', type: 'buy', lots: 1, entryPrice: 1.0845, currentPrice: 1.0862, pnl: 17 },
  { id: 2, symbol: 'XAU/USD', type: 'sell', lots: 0.5, entryPrice: 2620.50, currentPrice: 2618.20, pnl: 115 },
  { id: 3, symbol: 'GBP/USD', type: 'buy', lots: 0.5, entryPrice: 1.2650, currentPrice: 1.2638, pnl: -6 },
];

function formatPnl(pnl) {
  const n = Number(pnl);
  if (n > 0) return { text: `+${n.toFixed(2)}`, cls: 'pnl-profit' };
  if (n < 0) return { text: n.toFixed(2), cls: 'pnl-loss' };
  return { text: '0.00', cls: '' };
}

export default function ActiveTradesModal({ isOpen, positions: propPositions, onClose, onClosePosition }) {
  const [positions, setPositions] = useState(propPositions ?? MOCK_POSITIONS);
  const [livePrices, setLivePrices] = useState({});
  const [closeRow, setCloseRow] = useState(null); // { id, lots }
  const [partialLots, setPartialLots] = useState(0.1);

  useEffect(() => {
    if (propPositions) setPositions(propPositions);
  }, [propPositions]);

  // Simulate live P&L updates
  useEffect(() => {
    if (!isOpen) return;
    const ids = positions.map((p) => p.id);
    const interval = setInterval(() => {
      setLivePrices((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          const drift = (Math.random() - 0.48) * 2; // slight drift
          next[id] = (next[id] ?? 0) + drift;
        });
        return next;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleCloseAll = (pos) => {
    onClosePosition?.({ id: pos.id, symbol: pos.symbol, lots: pos.lots, type: pos.type, partial: false });
    setPositions((prev) => prev.filter((p) => p.id !== pos.id));
  };

  const handlePartialClose = (pos) => {
    const lots = Math.min(partialLots, pos.lots);
    if (lots <= 0) return;
    onClosePosition?.({ id: pos.id, symbol: pos.symbol, lots, type: pos.type, partial: true });
    setPositions((prev) =>
      prev.map((p) => (p.id === pos.id ? { ...p, lots: Math.max(0, p.lots - lots) } : p)).filter((p) => p.lots > 0)
    );
    setCloseRow(null);
  };

  const openCloseRow = (pos) => {
    setCloseRow(pos.id);
    const available = LOT_OPTIONS.filter((l) => l <= pos.lots);
    setPartialLots(available.length ? available[available.length - 1] : pos.lots);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-dialog-trades" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Active trades</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="active-trades-content">
          {positions.length === 0 ? (
            <p className="empty-trades">No open positions</p>
          ) : (
            <div className="trades-table-wrap">
              <table className="trades-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Volume</th>
                    <th>Entry</th>
                    <th>Current</th>
                    <th className="pnl-col">P&L</th>
                    <th>Close</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const pnlOffset = livePrices[pos.id] ?? 0;
                    const pnl = pos.pnl + pnlOffset;
                    const { text: pnlText, cls: pnlCls } = formatPnl(pnl);
                    const currentPrice = pos.type === 'buy' ? pos.currentPrice + pnlOffset * 0.01 : pos.currentPrice - pnlOffset * 0.01;
                    return (
                      <React.Fragment key={pos.id}>
                        <tr>
                          <td className="symbol-cell">{pos.symbol}</td>
                          <td>
                            <span className={`type-badge type-${pos.type}`}>{pos.type}</span>
                          </td>
                          <td>{pos.lots}</td>
                          <td>{pos.entryPrice.toFixed(pos.symbol.includes('XAU') ? 2 : 4)}</td>
                          <td>{currentPrice.toFixed(pos.symbol.includes('XAU') ? 2 : 4)}</td>
                          <td className={`pnl-cell ${pnlCls}`}>{pnlText}</td>
                          <td className="close-cell">
                            <button type="button" className="btn btn-sm btn-sell" onClick={() => handleCloseAll(pos)}>
                              Close all
                            </button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => openCloseRow(pos)}>
                              Partial
                            </button>
                          </td>
                        </tr>
                        {closeRow === pos.id && (
                          <tr className="partial-close-row">
                            <td colSpan={7}>
                              <div className="partial-close-form">
                                <span>Close</span>
                                <select
                                  value={partialLots}
                                  onChange={(e) => setPartialLots(parseFloat(e.target.value))}
                                  className="form-input form-input-sm"
                                >
                                  {LOT_OPTIONS.filter((l) => l <= pos.lots).map((l) => (
                                    <option key={l} value={l}>{l}</option>
                                  ))}
                                </select>
                                <span>lots</span>
                                <button type="button" className="btn btn-sm btn-sell" onClick={() => handlePartialClose(pos)}>
                                  Confirm
                                </button>
                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setCloseRow(null)}>
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
