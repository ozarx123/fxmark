import React, { useState, memo } from 'react';

const formatPrice = (p, isGold) => (p != null ? Number(p).toFixed(isGold ? 2 : 4) : '—');
const formatPnl = (pnl) => {
  if (pnl == null) return '—';
  const n = Number(pnl);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
};
const formatPriceDiff = (diff, isGold) => {
  if (diff == null) return '—';
  const n = Number(diff);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(isGold ? 2 : 4)}`;
};

function PositionRow({
  position,
  onClose,
  onPartialClose,
  onModifySLTP,
  isClosing,
}) {
  const [partialVolume, setPartialVolume] = useState('');
  const [showPartial, setShowPartial] = useState(false);
  const [showModify, setShowModify] = useState(false);
  const [modifySL, setModifySL] = useState('');
  const [modifyTP, setModifyTP] = useState('');

  const symbol = position.symbol ?? '';
  const isGold = symbol.includes('XAU') || symbol.includes('GOLD');
  const side = position.side || position.type || 'BUY';
  const volume = position.volume ?? position.lots ?? 0;
  const openPrice = position.openPrice ?? position.open_price ?? 0;
  const currentPrice = position.currentPrice ?? position.current_price ?? openPrice;
  const floatingPnL = position.floatingPnL ?? position.floating_pnl ?? position.pnl ?? 0;
  const priceDiff = position.priceDiff ?? null;
  const sl = position.sl ?? position.sl_price ?? position.stopLoss;
  const tp = position.tp ?? position.tp_price ?? position.takeProfit;
  const id = position.id;

  const profit = (floatingPnL ?? 0) >= 0;

  const handleClose = () => {
    if (id) onClose?.(id);
  };

  const handlePartialClose = () => {
    const vol = parseFloat(partialVolume);
    if (Number.isFinite(vol) && vol > 0 && vol < volume && id) {
      onPartialClose?.(id, vol);
      setPartialVolume('');
      setShowPartial(false);
    }
  };

  const openModify = () => {
    setModifySL(sl != null ? String(sl) : '');
    setModifyTP(tp != null ? String(tp) : '');
    setShowModify(true);
  };

  const handleModifySLTP = () => {
    if (!id || !onModifySLTP) return;
    const newSL = modifySL.trim() === '' ? null : parseFloat(modifySL);
    const newTP = modifyTP.trim() === '' ? null : parseFloat(modifyTP);
    if (newSL !== null && !Number.isFinite(newSL)) return;
    if (newTP !== null && !Number.isFinite(newTP)) return;
    onModifySLTP(id, { stopLoss: newSL ?? undefined, takeProfit: newTP ?? undefined });
    setShowModify(false);
  };

  return (
    <tr className="terminal-position-row">
      <td>{symbol}</td>
      <td><span className={`terminal-position-row__side terminal-position-row__side--${side.toLowerCase()}`}>{side}</span></td>
      <td>{volume}</td>
      <td>{formatPrice(openPrice, isGold)}</td>
      <td>{formatPrice(currentPrice, isGold)}</td>
      <td className={priceDiff != null && priceDiff >= 0 ? 'terminal-position-row__pnl--profit' : priceDiff != null ? 'terminal-position-row__pnl--loss' : ''}>
        {formatPriceDiff(priceDiff, isGold)}
      </td>
      <td className={profit ? 'terminal-position-row__pnl--profit' : 'terminal-position-row__pnl--loss'}>
        {formatPnl(floatingPnL)}
      </td>
      <td>{sl != null ? formatPrice(sl, isGold) : '—'}</td>
      <td>{tp != null ? formatPrice(tp, isGold) : '—'}</td>
      <td className="terminal-position-row__actions">
        {showModify ? (
          <>
            <input
              type="number"
              step={isGold ? 0.01 : 0.0001}
              value={modifySL}
              onChange={(e) => setModifySL(e.target.value)}
              placeholder="SL"
              className="terminal-position-row__partial-input"
            />
            <input
              type="number"
              step={isGold ? 0.01 : 0.0001}
              value={modifyTP}
              onChange={(e) => setModifyTP(e.target.value)}
              placeholder="TP"
              className="terminal-position-row__partial-input"
            />
            <button type="button" className="terminal-position-row__btn" onClick={handleModifySLTP}>Apply</button>
            <button type="button" className="terminal-position-row__btn" onClick={() => setShowModify(false)}>Cancel</button>
          </>
        ) : showPartial ? (
          <>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={volume}
              value={partialVolume}
              onChange={(e) => setPartialVolume(e.target.value)}
              placeholder="Lots"
              className="terminal-position-row__partial-input"
            />
            <button type="button" className="terminal-position-row__btn terminal-position-row__btn--partial" onClick={handlePartialClose} disabled={isClosing}>
              Close
            </button>
            <button type="button" className="terminal-position-row__btn" onClick={() => setShowPartial(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="terminal-position-row__btn terminal-position-row__btn--close" onClick={handleClose} disabled={isClosing}>
              Close
            </button>
            <button type="button" className="terminal-position-row__btn" onClick={() => setShowPartial(true)}>Partial</button>
            <button type="button" className="terminal-position-row__btn" onClick={openModify}>Modify SL/TP</button>
          </>
        )}
      </td>
    </tr>
  );
}

export default memo(PositionRow);
