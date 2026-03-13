import React, { useState } from 'react';

const LOT_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5];

export default function OrderTicketSidebar({
  symbol,
  marketPrice,
  onBuy,
  onSell,
  disabled,
  isAuthenticated,
}) {
  const [side, setSide] = useState('buy');
  const [lots, setLots] = useState(0.1);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated || disabled || loading) return;
    const isMarket = orderType === 'market';
    const price = isMarket ? marketPrice : (parseFloat(limitPrice) || null);
    if (!isMarket && !price) return;
    const sell = side === 'sell';
    setLoading(true);
    try {
      if (sell) await onSell({ symbol, lots, price, marketOrder: isMarket });
      else await onBuy({ symbol, lots, price, marketOrder: isMarket });
    } finally {
      setLoading(false);
    }
  };

  const displayPrice = marketPrice != null ? (symbol?.includes('XAU') ? marketPrice.toFixed(2) : marketPrice.toFixed(4)) : '—';
  const shortSymbol = symbol?.replace('/', '') || '';

  return (
    <div className="terminal-panel order-ticket-sidebar">
      <h3 className="terminal-panel-title">Order</h3>
      <div className="order-ticket-tabs">
        <button
          type="button"
          className={`order-ticket-tab ${side === 'buy' ? 'order-ticket-tab--active order-ticket-tab--buy' : ''}`}
          onClick={() => setSide('buy')}
        >
          Buy
        </button>
        <button
          type="button"
          className={`order-ticket-tab ${side === 'sell' ? 'order-ticket-tab--active order-ticket-tab--sell' : ''}`}
          onClick={() => setSide('sell')}
        >
          Sell
        </button>
      </div>
      <form onSubmit={handleSubmit} className="order-ticket-form">
        <label className="order-ticket-field">
          <span className="order-ticket-label">Amount (lots)</span>
          <select
            value={lots}
            onChange={(e) => setLots(parseFloat(e.target.value))}
            className="order-ticket-input"
            aria-label="Lots"
          >
            {LOT_OPTIONS.map((lot) => (
              <option key={lot} value={lot}>{lot}</option>
            ))}
          </select>
        </label>
        <div className="order-ticket-type">
          <button
            type="button"
            className={`order-ticket-type-btn ${orderType === 'market' ? 'order-ticket-type-btn--active' : ''}`}
            onClick={() => setOrderType('market')}
          >
            Market
          </button>
          <button
            type="button"
            className={`order-ticket-type-btn ${orderType === 'limit' ? 'order-ticket-type-btn--active' : ''}`}
            onClick={() => setOrderType('limit')}
          >
            Limit
          </button>
        </div>
        {orderType === 'limit' && (
          <label className="order-ticket-field">
            <span className="order-ticket-label">Limit price</span>
            <input
              type="number"
              step={symbol?.includes('XAU') ? 0.01 : 0.0001}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={marketPrice != null ? (symbol?.includes('XAU') ? marketPrice.toFixed(2) : marketPrice.toFixed(4)) : ''}
              className="order-ticket-input"
            />
          </label>
        )}
        <button
          type="submit"
          className={`order-ticket-submit order-ticket-submit--${side}`}
          disabled={disabled || loading || (orderType === 'market' && marketPrice == null) || (orderType === 'limit' && !limitPrice)}
        >
          {loading ? '…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${shortSymbol}`}
        </button>
      </form>
      <p className="order-ticket-price-hint">Price: {displayPrice}</p>
    </div>
  );
}
