import React, { useState, useRef } from 'react';
import * as tradingApi from '../../api/tradingApi';

export default function OrderTicket({
  symbol,
  symbols = [],
  accountId,
  accountNumber,
  marketPrice,
  onOrderPlaced,
  onError,
  className = '',
}) {
  const [volume, setVolume] = useState('0.01');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const sideRef = useRef('BUY');

  const opts = { accountId, accountNumber };

  const handleSubmit = async (e, side) => {
    e.preventDefault();
    sideRef.current = side;
    const vol = parseFloat(volume);
    if (!symbol || !Number.isFinite(vol) || vol <= 0) {
      onError?.('Invalid symbol or volume');
      return;
    }
    setLoading(true);
    setSuccess(false);
    onError?.(null);
    try {
      await tradingApi.placeOrder({
        symbol: symbol.replace(/\//g, ''),
        side: side.toLowerCase(),
        type: side === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL',
        marketOrder: true,
        lots: vol,
        volume: vol,
        price: marketPrice,
        sl: sl ? parseFloat(sl) : undefined,
        tp: tp ? parseFloat(tp) : undefined,
      }, opts);
      setSuccess(true);
      onOrderPlaced?.();
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      onError?.(err.message || 'Order failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`terminal-order-ticket ${className}`}>
      <form className="terminal-order-ticket__form" onSubmit={(e) => e.preventDefault()}>
        <div className="terminal-order-ticket__symbol">
          <label>Symbol</label>
          {symbols.length > 0 ? (
            <select value={symbol} readOnly className="terminal-order-ticket__select">
              {symbols.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          ) : (
            <span className="terminal-order-ticket__symbol-value">{symbol || '—'}</span>
          )}
        </div>
        <div className="terminal-order-ticket__volume">
          <label>Volume (lots)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="terminal-order-ticket__input"
          />
        </div>
        <div className="terminal-order-ticket__sl">
          <label>Stop loss</label>
          <input
            type="number"
            step={symbol?.includes('XAU') ? 0.01 : 0.0001}
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            placeholder="Optional"
            className="terminal-order-ticket__input"
          />
        </div>
        <div className="terminal-order-ticket__tp">
          <label>Take profit</label>
          <input
            type="number"
            step={symbol?.includes('XAU') ? 0.01 : 0.0001}
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            placeholder="Optional"
            className="terminal-order-ticket__input"
          />
        </div>
        <div className="terminal-order-ticket__buttons">
          <button
            type="button"
            disabled={loading}
            className="terminal-order-ticket__btn terminal-order-ticket__btn--buy"
            onClick={(e) => handleSubmit(e, 'BUY')}
          >
            {loading ? '…' : 'Buy'}
          </button>
          <button
            type="button"
            disabled={loading}
            className="terminal-order-ticket__btn terminal-order-ticket__btn--sell"
            onClick={(e) => handleSubmit(e, 'SELL')}
          >
            {loading ? '…' : 'Sell'}
          </button>
        </div>
        {success && <p className="terminal-order-ticket__success">Order placed</p>}
      </form>
    </div>
  );
}
