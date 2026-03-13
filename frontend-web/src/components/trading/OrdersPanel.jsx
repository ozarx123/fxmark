import React, { useState } from 'react';
import * as tradingApi from '../../api/tradingApi';

const PENDING_STATUSES = ['pending', 'placed', 'partial'];
const PENDING_TYPES = ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'];

function isPending(order) {
  const status = (order.status || '').toLowerCase();
  const type = (order.type || '').toLowerCase();
  return PENDING_STATUSES.includes(status) && PENDING_TYPES.includes(type);
}

function formatPrice(p, symbol) {
  if (p == null) return '—';
  const isGold = (symbol || '').includes('XAU');
  return Number(p).toFixed(isGold ? 2 : 4);
}

export default function OrdersPanel({
  orders = [],
  accountId,
  accountNumber,
  onRefresh,
  className = '',
}) {
  const [cancellingId, setCancellingId] = useState(null);
  const [modifyId, setModifyId] = useState(null);
  const [modifyPrice, setModifyPrice] = useState('');
  const [error, setError] = useState(null);

  const opts = { accountId, accountNumber };

  const handleCancel = async (orderId) => {
    setCancellingId(orderId);
    setError(null);
    try {
      await tradingApi.cancelOrder(orderId, opts);
      onRefresh?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setCancellingId(null);
    }
  };

  const handleModifyPrice = async (orderId) => {
    const p = parseFloat(modifyPrice);
    if (!Number.isFinite(p) || p <= 0) {
      setError('Enter a valid price');
      return;
    }
    setError(null);
    try {
      await tradingApi.updateOrderPrice(orderId, p, opts);
      setModifyId(null);
      setModifyPrice('');
      onRefresh?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const openModify = (order) => {
    setModifyId(order.id);
    setModifyPrice(order.price != null ? String(order.price) : '');
  };

  if (!Array.isArray(orders) || orders.length === 0) {
    return (
      <div className={`terminal-tabs__panel ${className}`}>
        <p className="terminal-tabs__empty">No orders</p>
      </div>
    );
  }

  return (
    <div className={`terminal-tabs__panel orders-panel ${className}`}>
      {error && <p className="orders-panel__error">{error}</p>}
      <table className="terminal-positions-panel__table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>Volume</th>
            <th>Price</th>
            <th>SL</th>
            <th>TP</th>
            <th>Time</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const pending = isPending(o);
            const showModify = modifyId === o.id;
            return (
              <tr key={o.id}>
                <td>{(o.type || 'market').replace(/_/g, ' ')}</td>
                <td>{o.status}</td>
                <td>{o.symbol}</td>
                <td><span className={`terminal-position-row__side terminal-position-row__side--${(o.side || '').toLowerCase()}`}>{o.side}</span></td>
                <td>{o.volume ?? o.lots}</td>
                <td>{o.price != null ? formatPrice(o.price, o.symbol) : '—'}</td>
                <td>{o.stopLoss != null ? formatPrice(o.stopLoss, o.symbol) : '—'}</td>
                <td>{o.takeProfit != null ? formatPrice(o.takeProfit, o.symbol) : '—'}</td>
                <td>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}</td>
                <td className="terminal-position-row__actions">
                  {pending && (
                    showModify ? (
                      <>
                        <input
                          type="number"
                          step={o.symbol?.includes('XAU') ? 0.01 : 0.0001}
                          value={modifyPrice}
                          onChange={(e) => setModifyPrice(e.target.value)}
                          className="terminal-position-row__partial-input"
                          placeholder="Price"
                        />
                        <button type="button" className="terminal-position-row__btn" onClick={() => handleModifyPrice(o.id)}>Apply</button>
                        <button type="button" className="terminal-position-row__btn" onClick={() => { setModifyId(null); setModifyPrice(''); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="terminal-position-row__btn" onClick={() => handleCancel(o.id)} disabled={cancellingId === o.id}>
                          {cancellingId === o.id ? '…' : 'Cancel'}
                        </button>
                        <button type="button" className="terminal-position-row__btn" onClick={() => openModify(o)}>Modify</button>
                      </>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
