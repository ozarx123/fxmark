import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listUsers, getAdminTopTraders } from '../../api/adminApi';
import { useLivePrices, getPriceForSymbol, computePnL } from '../../hooks/useLivePrices';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0);

export default function AdminTradingMonitor() {
  const navigate = useNavigate();
  const { prices: livePrices } = useLivePrices();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [topTraders, setTopTraders] = useState([]);

  const loadUsers = useCallback(async () => {
    if (!search.trim()) {
      setUsers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listUsers({ search: search.trim(), limit: 20 });
      setUsers(list);
    } catch (e) {
      setError(e.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
  }, [loadUsers]);

  const loadTopTraders = useCallback(async () => {
    try {
      const list = await getAdminTopTraders(10);
      setTopTraders(list);
    } catch (e) {
      setTopTraders([]);
    }
  }, []);

  useEffect(() => {
    loadTopTraders();
    const interval = setInterval(loadTopTraders, 15000);
    return () => clearInterval(interval);
  }, [loadTopTraders]);

  const topTradersWithLivePnl = useMemo(() => {
    return topTraders.map((t) => ({
      ...t,
      positions: (t.positions || []).map((p) => {
        const currentPrice = getPriceForSymbol(livePrices, p.symbol) ?? p.currentPrice ?? p.openPrice;
        const pnl = currentPrice != null ? computePnL(p, currentPrice) : (p.pnl ?? 0);
        return { ...p, currentPrice, pnl };
      }),
    }));
  }, [topTraders, livePrices]);

  const handleSelectTrader = (user) => {
    navigate(`/admin/trading-monitor/${user.id}`, { state: { user } });
  };

  return (
    <div className="page admin-page admin-trading-monitor">
      <header className="page-header">
        <h1>Trading monitor</h1>
        <p className="page-subtitle">
          Search users by email or name, or click a trader below to view their activity, positions, and admin actions (block, drawdown limits)
        </p>
      </header>

      {error && (
        <div className="admin-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <section className="admin-section-block">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Top 10 active traders
            {topTradersWithLivePnl.some((t) => t.positions?.some((p) => getPriceForSymbol(livePrices, p.symbol) != null)) && (
              <span className="live-indicator" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6bcf7f', fontWeight: 500 }}>
                ● Live
              </span>
            )}
          </h2>
          <button type="button" className="btn btn-secondary" onClick={loadTopTraders} style={{ fontSize: '0.85rem' }}>
            Refresh
          </button>
        </div>
        <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
          Traders with the most open positions. Refreshes every 15s. Click a trader to view details.
        </p>
        {topTradersWithLivePnl.length === 0 ? (
          <p className="muted">No active traders with open positions.</p>
        ) : (
          <div className="top-traders-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {topTradersWithLivePnl.map((t) => {
              const totalPnl = (t.positions || []).reduce((s, p) => s + (p.pnl ?? 0), 0);
              return (
                <div
                  key={t.id}
                  className="settings-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSelectTrader({ id: t.id, email: t.email, name: t.name })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong>{t.email}</strong>
                    <span className="muted" style={{ fontSize: '0.8rem' }}>{t.positionCount} pos</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {(t.positions || []).slice(0, 5).map((p) => (
                      <span
                        key={p.id}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.4rem',
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: 4,
                        }}
                      >
                        {p.symbol} {p.side} {p.volume}
                        <span className={(p.pnl ?? 0) >= 0 ? 'positive' : 'negative'} style={{ marginLeft: '0.25rem' }}>
                          {formatCurrency(p.pnl)}
                        </span>
                      </span>
                    ))}
                    {(t.positions || []).length > 5 && (
                      <span className="muted" style={{ fontSize: '0.75rem' }}>+{(t.positions || []).length - 5} more</span>
                    )}
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }} className={totalPnl >= 0 ? 'positive' : 'negative'}>
                    Total P&L: {formatCurrency(totalPnl)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-section-block">
        <div className="settings-card">
          <div className="filter-group">
            <label>Search by email or name</label>
            <input
              type="text"
              placeholder="Email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input search-input"
            />
          </div>
          <div className="account-picker">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                className="btn btn-secondary account-pill"
                onClick={() => handleSelectTrader(u)}
              >
                {u.email} {u.name ? ` (${u.name})` : ''}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading && (
        <div className="loading-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Loading…
        </div>
      )}
    </div>
  );
}
