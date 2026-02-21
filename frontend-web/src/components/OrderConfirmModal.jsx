import React, { useState, useEffect } from 'react';

const LOT_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10];

const SYMBOLS = [
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'XAU/USD', label: 'XAU/USD (Gold)' },
];

export default function OrderConfirmModal({ isOpen, type, symbol: initialSymbol, marketPrice, onConfirm, onClose }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'EUR/USD');
  const [lots, setLots] = useState(0.1);
  const [price, setPrice] = useState('');
  const [useMarket, setUseMarket] = useState(true);

  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const priceVal = useMarket ? (marketPrice ?? null) : (parseFloat(price) || null);
    onConfirm({ symbol, lots, price: priceVal, marketOrder: useMarket });
    onClose();
  };

  if (!isOpen) return null;

  const isBuy = type === 'buy';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Confirm {isBuy ? 'Buy' : 'Sell'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="order-confirm-form">
          <label>
            <span className="form-label">Symbol</span>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="form-input"
            >
              {SYMBOLS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Lots</span>
            <select
              value={lots}
              onChange={(e) => setLots(parseFloat(e.target.value))}
              className="form-input"
              required
            >
              {LOT_OPTIONS.map((lot) => (
                <option key={lot} value={lot}>{lot}</option>
              ))}
            </select>
          </label>
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={useMarket}
              onChange={(e) => setUseMarket(e.target.checked)}
            />
            <span>Market order</span>
          </label>
          {useMarket && marketPrice != null && (
            <p className="form-market-price">
              Market price: <strong>{Number(marketPrice).toFixed(symbol?.includes('XAU') ? 2 : 4)}</strong>
            </p>
          )}
          {!useMarket && (
            <label>
              <span className="form-label">Price</span>
              <input
                type="number"
                step="0.00001"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="form-input"
                placeholder="Limit price"
              />
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className={isBuy ? 'btn btn-primary' : 'btn btn-sell'}>
              {isBuy ? 'Buy' : 'Sell'} {lots} lots
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
