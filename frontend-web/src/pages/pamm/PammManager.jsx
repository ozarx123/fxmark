import React, { useState, useEffect, useCallback } from 'react';
import { TwitterLogo, LinkedinLogo, FacebookLogo, Copy, ChartLine } from '@phosphor-icons/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ProfileAvatar } from '../../components/ui';
import {
  FUND_STATUS_OPTIONS,
  FUND_TYPE_OPTIONS,
  emptyFund,
  managerPerformanceChartSeed,
} from './pammManagerMockData';
import { getMyFunds, createFund, getMyInvestors, getMyTrades, getPammTradingAccount } from '../../api/pammApi';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const SHARE_URL = typeof window !== 'undefined' ? `${window.location.origin}/pamm` : 'https://fxmark.example.com/pamm';
const SHARE_TEXT = 'Check out my PAMM fund on FXMARK Global — transparent performance, professional execution.';

function apiToFund(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    fundType: m.fundType || 'growth',
    strategy: m.strategy || '',
    status: m.isPublic !== false ? 'open' : 'closed',
    performanceFeePercent: m.performanceFeePercent ?? 0,
    managementFeePercent: 0,
    fundSize: m.fundSize ?? 0,
    currentDeposit: m.currentDeposit ?? 0,
    aum: m.aum ?? 0,
    investors: m.investors ?? 0,
    pnlPercent: m.pnlPercent ?? 0,
    createdAt: m.createdAt,
    approvalStatus: m.approvalStatus ?? 'pending',
    tradingAccountId: m.tradingAccountId ?? null,
  };
}

export default function PammManager() {
  const [funds, setFunds] = useState([]);
  const [selectedFundId, setSelectedFundId] = useState(null);
  const [pammAccounts, setPammAccounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({ ...emptyFund });
  const [investors, setInvestors] = useState([]);
  const [trades, setTrades] = useState([]);
  const [copyDone, setCopyDone] = useState(false);
  const [chartData, setChartData] = useState([...managerPerformanceChartSeed]);
  const [saving, setSaving] = useState(false);

  const selectedFund = selectedFundId ? funds.find((f) => f.id === selectedFundId) : funds[0];
  const fund = selectedFund || null;
  const pammAccount = fund?.id ? pammAccounts[fund.id] : null;
  const hasFunds = funds.length > 0;

  const loadFunds = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await getMyFunds();
      const normalized = (list || []).map((m) => apiToFund(m));
      setFunds(normalized);
      if (normalized.length > 0) {
        setSelectedFundId((prev) => {
          const valid = prev && normalized.some((f) => f.id === prev);
          return valid ? prev : normalized[0].id;
        });
      } else {
        setSelectedFundId(null);
      }
      const accMap = {};
      for (const f of normalized) {
        const acc = await getPammTradingAccount(f.id).catch(() => null);
        if (acc) accMap[f.id] = acc;
      }
      setPammAccounts(accMap);
    } catch (err) {
      setError(err.message || 'Failed to load funds');
      setFunds([]);
    } finally {
      setLoading(false);
    }
  };

  const loadInvestors = useCallback(async () => {
    if (!selectedFundId) return;
    try {
      const list = await getMyInvestors(selectedFundId);
      setInvestors(Array.isArray(list) ? list : []);
    } catch {
      setInvestors([]);
    }
  }, [selectedFundId]);

  const loadTrades = useCallback(async () => {
    if (!selectedFundId) return;
    try {
      const list = await getMyTrades(selectedFundId);
      setTrades(Array.isArray(list) ? list : []);
    } catch {
      setTrades([]);
    }
  }, [selectedFundId]);

  useEffect(() => {
    loadFunds();
  }, []);

  useEffect(() => {
    loadInvestors();
    loadTrades();
  }, [loadInvestors, loadTrades]);

  // Simulate real-time chart updates (append point every 4s)
  useEffect(() => {
    if (!fund) return;
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      setChartData((prev) => {
        const last = prev[prev.length - 1];
        const nextValue = last ? last.value + (Math.random() - 0.48) * 0.4 : 100;
        const next = [...prev, { time: timeStr, value: Math.round(nextValue * 10) / 10 }];
        return next.length > 30 ? next.slice(-30) : next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [fund]);

  const handleCopyLink = () => {
    const text = `${SHARE_TEXT} ${SHARE_URL}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  };

  const shareLinks = [
    {
      name: 'Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`,
      icon: TwitterLogo,
    },
    {
      name: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
      icon: LinkedinLogo,
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
      icon: FacebookLogo,
    },
  ];

  if (loading) {
    return (
      <div className="page pamm-page pamm-manager-page">
        <header className="page-header">
          <h1>PAMM Manager</h1>
          <p className="page-subtitle">Create and manage your fund, investors, and promote your strategy</p>
        </header>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page pamm-page pamm-manager-page">
      <header className="page-header">
        <h1>PAMM Manager</h1>
        <p className="page-subtitle">Create and manage your fund, investors, and promote your strategy</p>
      </header>

      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
          <button type="button" className="btn-link" onClick={() => setError('')} style={{ marginLeft: '0.5rem' }}>
            Dismiss
          </button>
        </div>
      )}

      {fund && (fund.approvalStatus || 'pending') === 'pending' && (
        <div className="auth-error" style={{ marginBottom: '1rem', background: 'rgba(255,193,7,0.15)', borderColor: 'rgba(255,193,7,0.5)' }}>
          <strong>Pending admin approval.</strong> Your fund is under review. It will be visible to investors and accept followers once approved by an administrator.
        </div>
      )}

      {/* When no funds: show create form first */}
      {!hasFunds && (
        <section className="pamm-section pamm-create-cta">
          <div className="pamm-create-cta-card">
            <h2>Create your PAMM fund</h2>
            <p>Set up your fund to attract investors. A PAMM trading account will be created automatically.</p>
            <form
              className="pamm-manager-form pamm-create-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setError('');
                try {
                  const created = await createFund(createForm);
                  const newFund = apiToFund(created);
                  setFunds((prev) => [newFund, ...prev]);
                  setSelectedFundId(newFund.id);
                  setCreateForm({ ...emptyFund });
                  const acc = await getPammTradingAccount(newFund.id).catch(() => null);
                  setPammAccounts((prev) => (acc ? { ...prev, [newFund.id]: acc } : prev));
                } catch (err) {
                  setError(err.message || 'Failed to create fund');
                } finally {
                  setSaving(false);
                }
              }}
            >
              <label>
                <span className="form-label">Fund name</span>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="form-input"
                  placeholder="e.g. Alpha Growth"
                  required
                />
              </label>
              <label>
                <span className="form-label">Type of fund</span>
                <select
                  value={createForm.fundType || 'growth'}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fundType: e.target.value }))}
                  className="form-input"
                >
                  {FUND_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="form-label">Strategy description</span>
                <textarea
                  value={createForm.strategy}
                  onChange={(e) => setCreateForm((f) => ({ ...f, strategy: e.target.value }))}
                  className="form-input"
                  rows={3}
                  placeholder="Describe your approach, instruments, risk management..."
                />
              </label>
              <label>
                <span className="form-label">Status</span>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
                  className="form-input"
                >
                  {FUND_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  <span className="form-label">Performance fee (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={createForm.performanceFeePercent}
                    onChange={(e) => setCreateForm((f) => ({ ...f, performanceFeePercent: parseFloat(e.target.value) || 0 }))}
                    className="form-input"
                  />
                </label>
                <label>
                  <span className="form-label">Fund size (USD)</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={createForm.fundSize || ''}
                    onChange={(e) => setCreateForm((f) => ({ ...f, fundSize: parseFloat(e.target.value) || 0 }))}
                    className="form-input"
                    placeholder="Target or max size"
                  />
                </label>
                <label>
                  <span className="form-label">Current deposit (USD)</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={createForm.currentDeposit ?? ''}
                    onChange={(e) => setCreateForm((f) => ({ ...f, currentDeposit: parseFloat(e.target.value) || 0 }))}
                    className="form-input"
                    placeholder="Your capital in fund"
                  />
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-lg pamm-create-fund-btn" disabled={saving}>
                  {saving ? 'Creating…' : 'Create fund'}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* When has funds: show fund summary, trading account, chart, trades, investors, share first */}
      {fund && pammAccount && (
        <section className="pamm-section pamm-trading-account-link">
          <h2 className="pamm-section-title">PAMM trading account</h2>
          <p className="pamm-section-desc">
            Your fund is linked to a dedicated trading account (created with your fund). Account No: {pammAccount.accountNumber}
          </p>
          <div className="pamm-trading-account-card">
            <div className="pamm-trading-account-row">
              <div className="pamm-trading-account-info">
                <strong>{pammAccount.name || 'PAMM Account'}</strong>
                <span className="muted">Account No: {pammAccount.accountNumber || pammAccount.id}</span>
                <span className="pamm-trading-account-balance">{formatCurrency(pammAccount.balance ?? 0)}</span>
              </div>
              <a href="/trading" className="btn btn-primary">
                <ChartLine weight="bold" size={18} />
                Trade
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Fund summary — read-only, list when multiple funds */}
      {hasFunds && fund && (
        <section className="pamm-section pamm-manager-fund-list">
          <h2 className="pamm-section-title">My fund{funds.length > 1 ? 's' : ''}</h2>
          {funds.length > 1 && (
            <div className="pamm-fund-selector" style={{ marginBottom: '1rem' }}>
              <label>
                <span className="form-label">Active fund</span>
                <select
                  value={selectedFundId || ''}
                  onChange={(e) => setSelectedFundId(e.target.value)}
                  className="form-input"
                  style={{ maxWidth: 280 }}
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="table-wrap">
            <table className="table pamm-table pamm-manager-table">
              <thead>
                <tr>
                  <th>Fund name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Fund size</th>
                  <th>AUM</th>
                  <th>Investors</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>{fund.name}</strong></td>
                  <td>{FUND_TYPE_OPTIONS.find((o) => o.value === fund.fundType)?.label ?? fund.fundType}</td>
                  <td>{FUND_STATUS_OPTIONS.find((o) => o.value === fund.status)?.label ?? fund.status}</td>
                  <td>{formatCurrency(fund.fundSize)}</td>
                  <td>{formatCurrency(fund.aum)}</td>
                  <td>{fund.investors}</td>
                  <td className={fund.pnlPercent >= 0 ? 'positive' : 'negative'}>
                    {fund.pnlPercent >= 0 ? '+' : ''}{fund.pnlPercent}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="pamm-manager-stats">
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">{formatCurrency(fund.fundSize)}</span>
              <span className="pamm-manager-stat-label">Fund size</span>
            </div>
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">{formatCurrency(fund.currentDeposit)}</span>
              <span className="pamm-manager-stat-label">Current deposit</span>
            </div>
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">{formatCurrency(fund.aum)}</span>
              <span className="pamm-manager-stat-label">AUM</span>
            </div>
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">{fund.investors}</span>
              <span className="pamm-manager-stat-label">Investors</span>
            </div>
            <div className="pamm-manager-stat">
              <span className={`pamm-manager-stat-value ${fund.pnlPercent >= 0 ? 'positive' : 'negative'}`}>
                {fund.pnlPercent >= 0 ? '+' : ''}{fund.pnlPercent}%
              </span>
              <span className="pamm-manager-stat-label">P&L (total)</span>
            </div>
          </div>
        </section>
      )}

      {/* Real-time performance chart — only when a fund exists */}
      {fund && (
        <section className="pamm-section pamm-manager-performance">
          <h2 className="pamm-section-title">Real-time performance</h2>
          <p className="pamm-manager-chart-hint">Equity curve (index 100 = start). Updates every few seconds.</p>
          <div className="pamm-manager-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pammManagerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--fxmark-orange)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--fxmark-orange)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'var(--fxmark-dark-grey)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.9)' }}
                  formatter={(value) => [value, 'Index']}
                />
                <Area type="monotone" dataKey="value" stroke="var(--fxmark-orange)" strokeWidth={2} fill="url(#pammManagerGrad)" name="Equity" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Trade data — only when a fund exists */}
      {fund && (
        <section className="pamm-section pamm-manager-trades">
          <h2 className="pamm-section-title">Recent trades</h2>
          <div className="table-wrap">
            <table className="table pamm-table pamm-manager-table">
              <thead>
                <tr>
                  <th>Trade ID</th>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Lots</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>P&L</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr><td colSpan={9} className="empty-cell">No trades yet.</td></tr>
                ) : (
                  trades.map((t) => (
                    <tr key={t.id}>
                      <td><code className="trade-id">{t.positionId || t.id}</code></td>
                      <td>{t.createdAt ? new Date(t.createdAt).toLocaleTimeString() : '—'}</td>
                      <td className="symbol-cell">{t.symbol || '—'}</td>
                      <td>
                        <span className={`type-badge type-${(t.side || '').toLowerCase()}`}>{t.side || '—'}</span>
                      </td>
                      <td>{t.volume ?? '—'}</td>
                      <td>{t.price != null ? Number(t.price).toFixed(4) : '—'}</td>
                      <td>—</td>
                      <td className={t.pnl != null && t.pnl >= 0 ? 'positive' : t.pnl != null ? 'negative' : ''}>
                        {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl)}` : '—'}
                      </td>
                      <td><span className="pamm-investor-status">—</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Investors — only when a fund exists */}
      {fund && (
        <section className="pamm-section pamm-manager-investors">
          <h2 className="pamm-section-title">Investors</h2>
          <div className="table-wrap">
            <table className="table pamm-table pamm-manager-table">
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Allocation ID</th>
                  <th>Amount</th>
                  <th>Share %</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {investors.length === 0 ? (
                  <tr><td colSpan={6} className="empty-cell">No investors yet. Share your fund to attract followers.</td></tr>
                ) : (
                  investors.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <div className="pamm-investor-cell">
                          <ProfileAvatar name={inv.followerName || inv.followerId} size={36} />
                          <div>
                            <strong>{inv.followerName || 'Investor'}</strong>
                            <br />
                            <span className="muted">{inv.followerId}</span>
                          </div>
                        </div>
                      </td>
                      <td><code className="allocation-id">{inv.id}</code></td>
                      <td>{formatCurrency(inv.allocatedBalance ?? 0)}</td>
                      <td>—</td>
                      <td>{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '—'}</td>
                      <td><span className="pamm-investor-status">{inv.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Share & promote — only when a fund exists */}
      {fund && (
        <section className="pamm-section pamm-manager-share">
          <h2 className="pamm-section-title">Share & promote</h2>
          <p className="pamm-manager-share-intro">Share your fund with potential investors. Use the link or post to social media.</p>
          <div className="pamm-manager-share-link-wrap">
            <input
              type="text"
              readOnly
              value={SHARE_URL}
              className="form-input pamm-manager-share-input"
            />
            <button
              type="button"
              className="btn btn-secondary pamm-manager-share-copy"
              onClick={handleCopyLink}
            >
              <Copy weight="bold" size={18} />
              {copyDone ? ' Copied!' : ' Copy link'}
            </button>
          </div>
          <div className="pamm-manager-social">
            <span className="pamm-manager-social-label">Share on</span>
            <div className="pamm-manager-social-btns">
              {shareLinks.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pamm-manager-social-btn"
                  aria-label={`Share on ${s.name}`}
                  title={`Share on ${s.name}`}
                >
                  <s.icon weight="fill" size={24} />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Create another fund — when manager has funds, show at bottom */}
      {hasFunds && (
        <section className="pamm-section pamm-create-cta pamm-create-another">
          <div className="pamm-create-cta-card">
            <h2>Create another fund</h2>
            <p>Add a new fund to attract more investors. Each fund has its own trading account.</p>
            <form
              className="pamm-manager-form pamm-create-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setError('');
                try {
                  const created = await createFund(createForm);
                  const newFund = apiToFund(created);
                  setFunds((prev) => [newFund, ...prev]);
                  setSelectedFundId(newFund.id);
                  setCreateForm({ ...emptyFund });
                  const acc = await getPammTradingAccount(newFund.id).catch(() => null);
                  setPammAccounts((prev) => (acc ? { ...prev, [newFund.id]: acc } : prev));
                } catch (err) {
                  setError(err.message || 'Failed to create fund');
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div className="form-row">
                <label>
                  <span className="form-label">Fund name</span>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    className="form-input"
                    placeholder="e.g. Alpha Growth"
                    required
                  />
                </label>
                <label>
                  <span className="form-label">Type</span>
                  <select
                    value={createForm.fundType || 'growth'}
                    onChange={(e) => setCreateForm((f) => ({ ...f, fundType: e.target.value }))}
                    className="form-input"
                  >
                    {FUND_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="form-label">Performance fee (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={createForm.performanceFeePercent}
                    onChange={(e) => setCreateForm((f) => ({ ...f, performanceFeePercent: parseFloat(e.target.value) || 0 }))}
                    className="form-input"
                  />
                </label>
              </div>
              <label>
                <span className="form-label">Strategy description</span>
                <textarea
                  value={createForm.strategy}
                  onChange={(e) => setCreateForm((f) => ({ ...f, strategy: e.target.value }))}
                  className="form-input"
                  rows={2}
                  placeholder="Describe your approach..."
                />
              </label>
              <div className="form-row">
                <label>
                  <span className="form-label">Fund size (USD)</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={createForm.fundSize || ''}
                    onChange={(e) => setCreateForm((f) => ({ ...f, fundSize: parseFloat(e.target.value) || 0 }))}
                    className="form-input"
                    placeholder="Target size"
                  />
                </label>
                <label>
                  <span className="form-label">Current deposit (USD)</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={createForm.currentDeposit ?? ''}
                    onChange={(e) => setCreateForm((f) => ({ ...f, currentDeposit: parseFloat(e.target.value) || 0 }))}
                    className="form-input"
                    placeholder="Your capital"
                  />
                </label>
                <label>
                  <span className="form-label">Status</span>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
                    className="form-input"
                  >
                    {FUND_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary pamm-create-fund-btn" disabled={saving}>
                  {saving ? 'Creating…' : 'Create fund'}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
