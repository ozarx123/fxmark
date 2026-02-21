import React, { useState, useEffect } from 'react';

const LOT_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10];

const SYMBOLS = [
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'XAU/USD', label: 'XAU/USD (Gold)' },
];

const ORDER_TYPES = [
  { value: 'market', label: 'Market', side: 'both' },
  { value: 'buy_limit', label: 'Buy Limit', side: 'buy' },
  { value: 'buy_stop', label: 'Buy Stop', side: 'buy' },
  { value: 'sell_limit', label: 'Sell Limit', side: 'sell' },
  { value: 'sell_stop', label: 'Sell Stop', side: 'sell' },
];

function getDefaultOrderType(initialType) {
  return initialType === 'sell' ? 'sell_limit' : 'buy_limit';
}

function getTriggerLabel(orderType) {
  switch (orderType) {
    case 'buy_limit': return 'Trigger (≤)';
    case 'buy_stop': return 'Trigger (≥)';
    case 'sell_limit': return 'Trigger (≥)';
    case 'sell_stop': return 'Trigger (≤)';
    default: return 'Trigger';
  }
}

export default function OrderConfirmModalAdvanced({ isOpen, type, symbol: initialSymbol, marketPrice, onConfirm, onClose }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'EUR/USD');
  const [lots, setLots] = useState(0.1);
  const [orderType, setOrderType] = useState(getDefaultOrderType(type));
  const [triggerPrice, setTriggerPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');

  const isAdvancedTab = !type || type === 'advanced';

  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);

  useEffect(() => {
    setOrderType(isAdvancedTab ? 'buy_limit' : getDefaultOrderType(type));
    setTriggerPrice('');
  }, [type, isOpen, isAdvancedTab]);

  const isMarket = orderType === 'market';
  const isPending = !isMarket;
  const orderTypesFiltered = isAdvancedTab ? ORDER_TYPES : ORDER_TYPES.filter((o) => o.side === type || o.side === 'both');

  const handleSubmit = (e) => {
    e.preventDefault();
    const triggerVal = isMarket ? (marketPrice ?? null) : (triggerPrice ? parseFloat(triggerPrice) : null);
    const slVal = sl ? parseFloat(sl) : null;
    const tpVal = tp ? parseFloat(tp) : null;

    if (isPending && !triggerPrice) return;

    onConfirm({
      symbol,
      lots,
      orderType,
      price: triggerVal,
      sl: slVal,
      tp: tpVal,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-dialog-advanced" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Advanced Order</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="order-confirm-form order-confirm-form-compact">
          <div className="form-row">
            <label>
              <span className="form-label">Type</span>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="form-input"
              >
                {orderTypesFiltered.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
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
          </div>
          <div className="form-row">
            <label className={isMarket ? 'form-row-span' : ''}>
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
            {isMarket && marketPrice != null && (
              <p className="form-market-price">Market: <strong>{Number(marketPrice).toFixed(symbol?.includes('XAU') ? 2 : 4)}</strong></p>
            )}
            {isPending && (
              <label>
                <span className="form-label">{getTriggerLabel(orderType)}</span>
                <input
                  type="number"
                  step="0.00001"
                  min="0"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  className="form-input"
                  placeholder="Price"
                  required={isPending}
                />
              </label>
            )}
          </div>
          <div className="form-row">
            <label>
              <span className="form-label form-label-muted">SL</span>
              <input
                type="number"
                step="0.00001"
                min="0"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                className="form-input"
                placeholder="—"
              />
            </label>
            <label>
              <span className="form-label form-label-muted">TP</span>
              <input
                type="number"
                step="0.00001"
                min="0"
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                className="form-input"
                placeholder="—"
              />
            </label>
          </div>

          <div className="modal-actions modal-actions-compact">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className={orderType.startsWith('sell') ? 'btn btn-sell' : 'btn btn-primary'}
              disabled={isPending && !triggerPrice}
            >
              {isMarket ? 'Place' : 'Schedule'} {orderType.replace('_', ' ')} {lots} lots
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
