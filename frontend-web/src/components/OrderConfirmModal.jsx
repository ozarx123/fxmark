import React, { useState, useEffect } from 'react';
import { SYMBOLS, LOT_OPTIONS, LOT_PRESETS, formatPrice } from '../constants/trading';
import ConfirmDialog from './ConfirmDialog';

export default function OrderConfirmModal({ isOpen, type, symbol: initialSymbol, marketPrice, onConfirm, onClose }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'EUR/USD');
  const [lots, setLots] = useState(0.1);
  const [price, setPrice] = useState('');
  const [useMarket, setUseMarket] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirmOrder = () => {
    const priceVal = useMarket ? (marketPrice ?? null) : (parseFloat(price) || null);
    onConfirm({ symbol, lots, price: priceVal, marketOrder: useMarket });
    onClose();
  };

  if (!isOpen) return null;

  const isBuy = type === 'buy';
  const displayPrice = useMarket ? marketPrice : (parseFloat(price) || null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog order-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isBuy ? 'Buy' : 'Sell'} order</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="order-confirm-form order-confirm-form-optimized">
          <div className="form-row">
            <label>
              <span className="form-label">Symbol</span>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="form-input"
                aria-label="Symbol"
              >
                {SYMBOLS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label">Volume (lots)</span>
              <select
                value={lots}
                onChange={(e) => setLots(parseFloat(e.target.value))}
                className="form-input"
                required
                aria-label="Lots"
              >
                {LOT_OPTIONS.map((lot) => (
                  <option key={lot} value={lot}>{lot}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="lot-presets">
            {LOT_PRESETS.map((lot) => (
              <button
                key={lot}
                type="button"
                className={`lot-preset-btn ${lots === lot ? 'active' : ''}`}
                onClick={() => setLots(lot)}
              >
                {lot}
              </button>
            ))}
          </div>

          <div className="order-type-toggle">
            <span className="form-label">Order type</span>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-option ${useMarket ? 'active' : ''}`}
                onClick={() => setUseMarket(true)}
              >
                Market
              </button>
              <button
                type="button"
                className={`toggle-option ${!useMarket ? 'active' : ''}`}
                onClick={() => setUseMarket(false)}
              >
                Limit
              </button>
            </div>
          </div>

          {useMarket && marketPrice != null && (
            <p className="form-market-price">
              Execution at market: <strong>{formatPrice(marketPrice, symbol)}</strong>
            </p>
          )}
          {!useMarket && (
            <label className="form-row-span">
              <span className="form-label">Limit price</span>
              <input
                type="number"
                step="0.00001"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="form-input"
                placeholder={marketPrice != null ? `e.g. ${formatPrice(marketPrice, symbol)}` : 'Enter price'}
                required={!useMarket}
              />
            </label>
          )}

          <div className="order-summary">
            <span className="order-summary-text">
              {isBuy ? 'Buy' : 'Sell'} <strong>{lots}</strong> lots <strong>{symbol}</strong>
              {displayPrice != null && ` @ ${formatPrice(displayPrice, symbol)}`}
            </span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className={isBuy ? 'btn btn-primary' : 'btn btn-sell'}>
              Confirm {isBuy ? 'Buy' : 'Sell'}
            </button>
          </div>
        </form>

        <ConfirmDialog
          isOpen={showConfirm}
          title={`Confirm ${isBuy ? 'Buy' : 'Sell'} order`}
          message="Please confirm the order details below before placing."
          referenceDetails={[
            { label: 'Symbol', value: symbol },
            { label: 'Volume', value: `${lots} lots` },
            { label: 'Order type', value: useMarket ? 'Market' : 'Limit' },
            { label: 'Price', value: displayPrice != null ? formatPrice(displayPrice, symbol) : '—' },
          ]}
          confirmLabel={isBuy ? 'Place buy order' : 'Place sell order'}
          variant="primary"
          onConfirm={handleConfirmOrder}
          onClose={() => setShowConfirm(false)}
        />
      </div>
    </div>
  );
}
