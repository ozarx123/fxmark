import React, { useState, useEffect } from 'react';
import { TwitterLogo, LinkedinLogo, FacebookLogo, Copy } from '@phosphor-icons/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  myInvestors,
  myFunds as initialFunds,
  FUND_STATUS_OPTIONS,
  FUND_TYPE_OPTIONS,
  emptyFund,
  managerPerformanceChartSeed,
  managerRecentTrades as initialTrades,
} from './pammManagerMockData';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const SHARE_URL = typeof window !== 'undefined' ? `${window.location.origin}/pamm` : 'https://fxmark.example.com/pamm';
const SHARE_TEXT = 'Check out my PAMM fund on FXMARK Global — transparent performance, professional execution.';

export default function PammManager() {
  const [funds, setFunds] = useState([...initialFunds]);
  const [selectedFundId, setSelectedFundId] = useState(null);
  const [creatingNew, setCreatingNew] = useState(funds.length === 0);
  const [createForm, setCreateForm] = useState({ ...emptyFund });
  const [investors] = useState(myInvestors);
  const [copyDone, setCopyDone] = useState(false);
  const [chartData, setChartData] = useState([...managerPerformanceChartSeed]);
  const [trades] = useState(initialTrades);

  const selectedFund = funds.find((f) => f.id === selectedFundId) || null;
  const isCreateMode = creatingNew || funds.length === 0;
  const showList = funds.length > 0 && selectedFundId === null && !creatingNew;
  const displayFund = isCreateMode ? createForm : selectedFund;

  const updateSelectedFund = (updates) => {
    setFunds((prev) => prev.map((f) => (f.id === selectedFundId ? { ...f, ...updates } : f)));
  };

  // Simulate real-time chart updates (append point every 4s)
  useEffect(() => {
    if (selectedFundId == null) return;
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
  }, [selectedFundId]);

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

  return (
    <div className="page pamm-page pamm-manager-page">
      <header className="page-header">
        <h1>PAMM Manager</h1>
        <p className="page-subtitle">Create and manage your fund, investors, and promote your strategy</p>
      </header>

      {/* List of existing funds — only when we have funds and not creating/editing */}
      {showList && (
        <section className="pamm-section pamm-manager-fund-list">
          <h2 className="pamm-section-title">My funds</h2>
          <div className="pamm-manager-list-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreatingNew(true)}
            >
              Create new fund
            </button>
          </div>
          <div className="table-wrap">
            <table className="table pamm-table pamm-manager-table">
              <thead>
                <tr>
                  <th>Fund name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>AUM</th>
                  <th>Investors</th>
                  <th>P&L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {funds.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.name}</strong></td>
                    <td>{FUND_TYPE_OPTIONS.find((o) => o.value === f.fundType)?.label ?? f.fundType}</td>
                    <td>{FUND_STATUS_OPTIONS.find((o) => o.value === f.status)?.label ?? f.status}</td>
                    <td>{formatCurrency(f.aum)}</td>
                    <td>{f.investors}</td>
                    <td className={f.pnlPercent >= 0 ? 'positive' : 'negative'}>
                      {f.pnlPercent >= 0 ? '+' : ''}{f.pnlPercent}%
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedFundId(f.id)}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Create or manage a single fund — form + stats */}
      {(isCreateMode || selectedFundId != null) && (
      <section className="pamm-section pamm-manager-fund">
        <h2 className="pamm-section-title">
          {isCreateMode ? 'Create your fund' : 'My fund'}
        </h2>
        <div className="pamm-manager-fund-grid">
          <div className="pamm-manager-form-wrap">
            <form
              className="pamm-manager-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (isCreateMode) {
                  const newFund = {
                    ...createForm,
                    id: Date.now(),
                    aum: createForm.currentDeposit || 0,
                    investors: 0,
                    pnlPercent: 0,
                    growthYtd: 0,
                    riskScore: 0,
                    riskProfile: '—',
                    createdAt: new Date().toISOString().slice(0, 10),
                  };
                  setFunds((prev) => [...prev, newFund]);
                  setSelectedFundId(newFund.id);
                  setCreatingNew(false);
                  setCreateForm({ ...emptyFund });
                } else {
                  alert('Fund settings saved (mock).');
                }
              }}
            >
              <label>
                <span className="form-label">Fund name</span>
                <input
                  type="text"
                  value={displayFund.name}
                  onChange={(e) =>
                    isCreateMode
                      ? setCreateForm((f) => ({ ...f, name: e.target.value }))
                      : updateSelectedFund({ name: e.target.value })
                  }
                  className="form-input"
                  placeholder="e.g. Alpha Growth"
                  required
                />
              </label>
              <label>
                <span className="form-label">Type of fund</span>
                <select
                  value={displayFund.fundType || 'growth'}
                  onChange={(e) =>
                    isCreateMode
                      ? setCreateForm((f) => ({ ...f, fundType: e.target.value }))
                      : updateSelectedFund({ fundType: e.target.value })
                  }
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
                  value={displayFund.strategy}
                  onChange={(e) =>
                    isCreateMode
                      ? setCreateForm((f) => ({ ...f, strategy: e.target.value }))
                      : updateSelectedFund({ strategy: e.target.value })
                  }
                  className="form-input"
                  rows={4}
                  placeholder="Describe your approach, instruments, risk management..."
                />
              </label>
              <label>
                <span className="form-label">Status</span>
                <select
                  value={displayFund.status}
                  onChange={(e) =>
                    isCreateMode
                      ? setCreateForm((f) => ({ ...f, status: e.target.value }))
                      : updateSelectedFund({ status: e.target.value })
                  }
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
                    value={displayFund.performanceFeePercent}
                    onChange={(e) =>
                      isCreateMode
                        ? setCreateForm((f) => ({ ...f, performanceFeePercent: parseFloat(e.target.value) || 0 }))
                        : updateSelectedFund({ performanceFeePercent: parseFloat(e.target.value) || 0 })
                    }
                    className="form-input"
                  />
                </label>
                <label>
                  <span className="form-label">Management fee (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={displayFund.managementFeePercent}
                    onChange={(e) =>
                      isCreateMode
                        ? setCreateForm((f) => ({ ...f, managementFeePercent: parseFloat(e.target.value) || 0 }))
                        : updateSelectedFund({ managementFeePercent: parseFloat(e.target.value) || 0 })
                    }
                    className="form-input"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span className="form-label">Fund size (USD)</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={displayFund.fundSize || ''}
                    onChange={(e) =>
                      isCreateMode
                        ? setCreateForm((f) => ({ ...f, fundSize: parseFloat(e.target.value) || 0 }))
                        : updateSelectedFund({ fundSize: parseFloat(e.target.value) || 0 })
                    }
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
                    value={displayFund.currentDeposit ?? ''}
                    onChange={(e) =>
                      isCreateMode
                        ? setCreateForm((f) => ({ ...f, currentDeposit: parseFloat(e.target.value) || 0 }))
                        : updateSelectedFund({ currentDeposit: parseFloat(e.target.value) || 0 })
                    }
                    className="form-input"
                    placeholder="Your capital in fund"
                  />
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {isCreateMode ? 'Create fund' : 'Save fund settings'}
                </button>
                {isCreateMode && funds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { setCreatingNew(false); setCreateForm({ ...emptyFund }); }}
                  >
                    Cancel
                  </button>
                )}
                {!isCreateMode && selectedFundId != null && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedFundId(null)}
                  >
                    Back to list
                  </button>
                )}
              </div>
            </form>
          </div>
          <div className="pamm-manager-stats">
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">
                {isCreateMode ? (createForm.fundSize ? formatCurrency(createForm.fundSize) : '—') : formatCurrency(selectedFund?.fundSize)}
              </span>
              <span className="pamm-manager-stat-label">Fund size</span>
            </div>
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">
                {isCreateMode ? (createForm.currentDeposit ? formatCurrency(createForm.currentDeposit) : '—') : formatCurrency(selectedFund?.currentDeposit)}
              </span>
              <span className="pamm-manager-stat-label">Current deposit</span>
            </div>
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">
                {isCreateMode ? '—' : formatCurrency(selectedFund?.aum)}
              </span>
              <span className="pamm-manager-stat-label">AUM</span>
            </div>
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">
                {isCreateMode ? '—' : selectedFund?.investors}
              </span>
              <span className="pamm-manager-stat-label">Investors</span>
            </div>
            <div className="pamm-manager-stat">
              <span className={`pamm-manager-stat-value ${!isCreateMode && selectedFund?.pnlPercent >= 0 ? 'positive' : !isCreateMode && (selectedFund?.pnlPercent ?? 0) < 0 ? 'negative' : ''}`}>
                {isCreateMode ? '—' : `${(selectedFund?.pnlPercent ?? 0) >= 0 ? '+' : ''}${selectedFund?.pnlPercent ?? 0}%`}
              </span>
              <span className="pamm-manager-stat-label">P&L (total)</span>
            </div>
            <div className="pamm-manager-stat">
              <span className="pamm-manager-stat-value">
                {isCreateMode
                  ? (FUND_TYPE_OPTIONS.find((o) => o.value === (createForm.fundType || 'growth'))?.label ?? '—')
                  : (FUND_TYPE_OPTIONS.find((o) => o.value === selectedFund?.fundType)?.label ?? selectedFund?.fundType ?? '—')}
              </span>
              <span className="pamm-manager-stat-label">Fund type</span>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Real-time performance chart — only when a fund is selected */}
      {selectedFundId != null && (
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

      {/* Trade data — only when a fund is selected */}
      {selectedFundId != null && (
        <section className="pamm-section pamm-manager-trades">
          <h2 className="pamm-section-title">Recent trades</h2>
          <div className="table-wrap">
            <table className="table pamm-table pamm-manager-table">
              <thead>
                <tr>
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
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td>{t.time}</td>
                    <td className="symbol-cell">{t.symbol}</td>
                    <td>
                      <span className={`type-badge type-${t.type}`}>{t.type}</span>
                    </td>
                    <td>{t.lots}</td>
                    <td>{t.entryPrice != null ? t.entryPrice.toFixed(t.symbol.includes('XAU') ? 2 : 4) : '—'}</td>
                    <td>{t.exitPrice != null ? t.exitPrice.toFixed(t.symbol.includes('XAU') ? 2 : 4) : '—'}</td>
                    <td className={t.pnl != null && t.pnl >= 0 ? 'positive' : t.pnl != null ? 'negative' : ''}>
                      {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl)}` : '—'}
                    </td>
                    <td><span className="pamm-investor-status">{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Investors — only when a fund is selected */}
      {selectedFundId != null && (
      <section className="pamm-section pamm-manager-investors">
        <h2 className="pamm-section-title">Investors</h2>
        <div className="table-wrap">
          <table className="table pamm-table pamm-manager-table">
            <thead>
              <tr>
                <th>Investor</th>
                <th>Amount</th>
                <th>Share %</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <strong>{inv.name || inv.email}</strong>
                    {inv.name && <br />}
                    {inv.name && <span className="muted">{inv.email}</span>}
                  </td>
                  <td>{formatCurrency(inv.amount)}</td>
                  <td>{inv.sharePercent}%</td>
                  <td>{inv.joinedAt}</td>
                  <td><span className="pamm-investor-status">{inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Share & promote — only when a fund is selected */}
      {selectedFundId != null && (
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
    </div>
  );
}
