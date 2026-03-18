import React from 'react';

const LOT_STEP = 0.01;
const MIN_LOT = 0.01;
const MAX_LOT = 100;

export default function QuickTradeBar({
  volume,
  onVolumeChange,
  onSell,
  onBuy,
  loading = false,
  disabled = false,
  className = '',
}) {
  const num = parseFloat(volume) || MIN_LOT;
  const inc = () => onVolumeChange?.(String(Math.min(MAX_LOT, Math.round((num + LOT_STEP) * 100) / 100)));
  const dec = () => onVolumeChange?.(String(Math.max(MIN_LOT, Math.round((num - LOT_STEP) * 100) / 100)));

  return (
    <div className={`quick-trade-bar ${className}`}>
      <button
        type="button"
        className="quick-trade-bar__btn quick-trade-bar__btn--sell"
        disabled={disabled || loading}
        onClick={onSell}
        aria-label="Market sell"
      >
        {loading ? '…' : 'SELL'}
      </button>
      <div className="quick-trade-bar__lot">
        <button type="button" className="quick-trade-bar__lot-btn" onClick={dec} disabled={disabled || num <= MIN_LOT} aria-label="Decrease lot">−</button>
        <span className="quick-trade-bar__lot-value">{Number(num).toFixed(2)}</span>
        <button type="button" className="quick-trade-bar__lot-btn" onClick={inc} disabled={disabled || num >= MAX_LOT} aria-label="Increase lot">+</button>
      </div>
      <button
        type="button"
        className="quick-trade-bar__btn quick-trade-bar__btn--buy"
        disabled={disabled || loading}
        onClick={onBuy}
        aria-label="Market buy"
      >
        {loading ? '…' : 'BUY'}
      </button>
    </div>
  );
}
