import React, { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';

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
  const [closeRow, setCloseRow] = useState(null); // position id for partial row
  const [partialLots, setPartialLots] = useState(0.1);
  const [closeConfirm, setCloseConfirm] = useState(null); // { pos, partial: false }
  const [partialConfirm, setPartialConfirm] = useState(null); // { pos, lots }

  useEffect(() => {
    if (propPositions) setPositions(propPositions);
  }, [propPositions]);

  const handleCloseAllClick = (pos) => {
    setCloseConfirm({ pos, partial: false });
  };

  const handleCloseAllConfirm = () => {
    if (!closeConfirm) return;
    const pos = closeConfirm.pos;
    onClosePosition?.({ id: pos.id, symbol: pos.symbol, lots: pos.lots, type: pos.type, partial: false, currentPrice: pos.currentPrice });
    setPositions((prev) => prev.filter((p) => p.id !== pos.id));
    setCloseConfirm(null);
  };

  const handlePartialCloseClick = (pos) => {
    const lots = Math.min(partialLots, pos.lots);
    if (lots <= 0) return;
    setPartialConfirm({ pos, lots });
  };

  const handlePartialCloseConfirm = () => {
    if (!partialConfirm) return;
    const { pos, lots } = partialConfirm;
    onClosePosition?.({ id: pos.id, symbol: pos.symbol, lots, type: pos.type, partial: true, currentPrice: pos.currentPrice });
    setPositions((prev) =>
      prev.map((p) => (p.id === pos.id ? { ...p, lots: Math.max(0, p.lots - lots) } : p)).filter((p) => p.lots > 0)
    );
    setCloseRow(null);
    setPartialConfirm(null);
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
                    const pnl = pos.pnl ?? 0;
                    const { text: pnlText, cls: pnlCls } = formatPnl(pnl);
                    const currentPrice = pos.currentPrice ?? pos.entryPrice ?? 0;
                    return (
                      <React.Fragment key={pos.id}>
                        <tr>
                          <td className="symbol-cell">{pos.symbol}</td>
                          <td>
                            <span className={`type-badge type-${pos.type}`}>{pos.type}</span>
                          </td>
                          <td>{pos.lots}</td>
                          <td>{(pos.entryPrice ?? 0).toFixed(pos.symbol?.includes('XAU') ? 2 : 4)}</td>
                          <td>{Number(currentPrice).toFixed(pos.symbol?.includes('XAU') ? 2 : 4)}</td>
                          <td className={`pnl-cell ${pnlCls}`}>{pnlText}</td>
                          <td className="close-cell">
                            <button type="button" className="btn btn-sm btn-sell" onClick={() => handleCloseAllClick(pos)}>
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
                                <button type="button" className="btn btn-sm btn-sell" onClick={() => handlePartialCloseClick(pos)}>
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

        <ConfirmDialog
          isOpen={!!closeConfirm}
          title="Close position"
          message="Are you sure you want to close this position? This cannot be undone."
          referenceDetails={closeConfirm ? [
            { label: 'Symbol', value: closeConfirm.pos.symbol },
            { label: 'Type', value: closeConfirm.pos.type.toUpperCase() },
            { label: 'Volume', value: `${closeConfirm.pos.lots} lots` },
            { label: 'Entry price', value: (closeConfirm.pos.entryPrice ?? 0).toFixed(closeConfirm.pos.symbol?.includes('XAU') ? 2 : 4) },
            { label: 'Current P&L', value: `${(closeConfirm.pos.pnl ?? 0) >= 0 ? '+' : ''}${(closeConfirm.pos.pnl ?? 0).toFixed(2)}` },
          ] : []}
          confirmLabel="Close position"
          variant="danger"
          onConfirm={handleCloseAllConfirm}
          onClose={() => setCloseConfirm(null)}
        />

        <ConfirmDialog
          isOpen={!!partialConfirm}
          title="Partial close"
          message="Confirm partial close with the following details."
          referenceDetails={partialConfirm ? [
            { label: 'Symbol', value: partialConfirm.pos.symbol },
            { label: 'Type', value: partialConfirm.pos.type.toUpperCase() },
            { label: 'Total volume', value: `${partialConfirm.pos.lots} lots` },
            { label: 'Close volume', value: `${partialConfirm.lots} lots` },
            { label: 'Entry price', value: (partialConfirm.pos.entryPrice ?? 0).toFixed(partialConfirm.pos.symbol?.includes('XAU') ? 2 : 4) },
          ] : []}
          confirmLabel="Close partial"
          variant="primary"
          onConfirm={handlePartialCloseConfirm}
          onClose={() => setPartialConfirm(null)}
        />
      </div>
    </div>
  );
}
