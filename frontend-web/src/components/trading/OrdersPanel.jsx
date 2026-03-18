import React, { useEffect, useMemo, useState } from 'react';
import * as tradingApi from '../../api/tradingApi';

const PENDING_STATUSES = ['pending', 'placed', 'partial'];
const PENDING_TYPES = ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'];

function normalizeOrders(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    if (Array.isArray(input.orders)) return input.orders;
    if (Array.isArray(input.data)) return input.data;
    if (Array.isArray(input.items)) return input.items;
  }
  return [];
}

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
  filterSymbol = '',
  sortBy = 'time',
  sortDir = 'desc',
  className = '',
}) {
  const [cancellingId, setCancellingId] = useState(null);
  const [modifyId, setModifyId] = useState(null);
  const [modifyPrice, setModifyPrice] = useState('');
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const opts = { accountId, accountNumber };

  const list = useMemo(() => normalizeOrders(orders), [orders]);

  const filteredAndSorted = useMemo(() => {
    let out = filterSymbol
      ? list.filter((o) => (o.symbol || '').toUpperCase().includes(String(filterSymbol).replace(/\//g, '').toUpperCase()))
      : [...list];
    const mult = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      if (sortBy === 'time') {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return mult * (ta - tb);
      }
      if (sortBy === 'symbol') return mult * ((a.symbol || '').localeCompare(b.symbol || ''));
      if (sortBy === 'volume') return mult * ((a.volume ?? a.lots ?? 0) - (b.volume ?? b.lots ?? 0));
      return 0;
    });
    return out;
  }, [list, filterSymbol, sortBy, sortDir]);

  const total = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, page, pageSize]);

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
    const p = order.price ?? order.limitPrice ?? order.triggerPrice ?? order.executionPrice;
    setModifyPrice(p != null ? String(p) : '');
  };

  if (total === 0) {
    return (
      <div className={`terminal-tabs__panel ${className}`}>
        <p className="terminal-tabs__empty">No orders</p>
      </div>
    );
  }

  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(total, page * pageSize);

  return (
    <div className={`terminal-tabs__panel orders-panel ${className}`}>
      {error && <p className="orders-panel__error">{error}</p>}
      <div className="orders-panel__pagination" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <span className="orders-panel__pagination-meta" style={{ opacity: 0.85 }}>
          Showing {startRow}-{endRow} of {total}
        </span>
        <div className="orders-panel__pagination-controls" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ opacity: 0.85 }}>Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const next = Number(e.target.value) || 20;
              setPageSize(next);
              setPage(1);
            }}
            className="terminal-chart-workspace__select"
            style={{ minWidth: 84 }}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            type="button"
            className="terminal-position-row__btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span style={{ opacity: 0.9 }}>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="terminal-position-row__btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
      <div className="orders-panel__table-wrap">
      <table className="terminal-positions-panel__table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>Volume</th>
            <th className="orders-panel__price-header">Price</th>
            <th>SL</th>
            <th>TP</th>
            <th>Time</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((o) => {
            const pending = isPending(o);
            const showModify = modifyId === o.id;
            const orderPrice = o.price ?? o.limitPrice ?? o.triggerPrice ?? o.executionPrice ?? o.filledPrice;
            return (
              <tr key={o.id}>
                <td>{(o.type || 'market').replace(/_/g, ' ')}</td>
                <td>{o.status}</td>
                <td>{o.symbol}</td>
                <td><span className={`terminal-position-row__side terminal-position-row__side--${(o.side || '').toLowerCase()}`}>{o.side}</span></td>
                <td>{o.volume ?? o.lots}</td>
                <td className="orders-panel__price-cell">{orderPrice != null ? formatPrice(orderPrice, o.symbol) : '—'}</td>
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
    </div>
  );
}
