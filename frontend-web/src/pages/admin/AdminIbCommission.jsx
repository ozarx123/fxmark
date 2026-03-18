import React, { useState, useEffect, useCallback } from 'react';
import {
  getIbWallets,
  getIbCommissions,
  getIbSettings,
  updateIbSettings,
  getPammIbCommissionSettings,
  updatePammIbCommissionSettings,
  processIbPayout,
} from '../../api/adminApi';

const DEFAULT_RATES = { 1: 7, 2: 5, 3: 3, 4: 2, 5: 1 };
const PAMM_DEFAULTS = { 1: { daily_payout_percent: 0.25, status: 'enabled' }, 2: { daily_payout_percent: 0.15, status: 'enabled' }, 3: { daily_payout_percent: 0.10, status: 'enabled' } };
const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n));

export default function AdminIbCommission() {
  const [wallets, setWallets] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [settings, setSettings] = useState({ ratePerLotByLevel: DEFAULT_RATES });
  const [pammSettings, setPammSettings] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pammSaving, setPammSaving] = useState(false);
  const [error, setError] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(null);

  const loadData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [walletsRes, commissionsRes, settingsRes, pammRes] = await Promise.all([
        getIbWallets(),
        getIbCommissions({ limit: 200 }),
        getIbSettings(),
        getPammIbCommissionSettings().catch(() => null),
      ]);
      setWallets(Array.isArray(walletsRes) ? walletsRes : []);
      setLedger(Array.isArray(commissionsRes) ? commissionsRes : []);
      setSettings(settingsRes?.ratePerLotByLevel ? { ratePerLotByLevel: settingsRes.ratePerLotByLevel } : { ratePerLotByLevel: DEFAULT_RATES });
      setPammSettings(pammRes?.levels ? { levels: pammRes.levels } : null);
    } catch (e) {
      setError(e.message || 'Failed to load data');
      setWallets([]);
      setLedger([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveRates = async () => {
    setSaving(true);
    setError('');
    try {
      await updateIbSettings(settings.ratePerLotByLevel);
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleProcessPayout = async (userId) => {
    setPayoutLoading(userId);
    setError('');
    try {
      await processIbPayout(userId);
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to process payout');
    } finally {
      setPayoutLoading(null);
    }
  };

  const setRateForLevel = (level, value) => {
    const v = value === '' ? undefined : Number(value);
    setSettings((prev) => ({
      ...prev,
      ratePerLotByLevel: {
        ...(prev.ratePerLotByLevel || DEFAULT_RATES),
        [level]: v,
      },
    }));
  };

  const setPammLevelPercent = (level, value) => {
    const v = value === '' ? '' : Number(value);
    setPammSettings((prev) => {
      const levels = { ...(prev?.levels || PAMM_DEFAULTS) };
      levels[level] = { ...(levels[level] || PAMM_DEFAULTS[level]), daily_payout_percent: v };
      return { levels };
    });
  };

  const setPammLevelStatus = (level, status) => {
    setPammSettings((prev) => {
      const levels = { ...(prev?.levels || PAMM_DEFAULTS) };
      levels[level] = { ...(levels[level] || PAMM_DEFAULTS[level]), status: status === 'disabled' ? 'disabled' : 'enabled' };
      return { levels };
    });
  };

  const handleSavePammRates = async () => {
    if (!pammSettings?.levels) return;
    setPammSaving(true);
    setError('');
    try {
      await updatePammIbCommissionSettings(pammSettings.levels);
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to save PAMM commission settings');
    } finally {
      setPammSaving(false);
    }
  };

  const filteredLedger = statusFilter
    ? ledger.filter((r) => String(r.status || '').toLowerCase() === statusFilter)
    : ledger;

  return (
    <div className="page admin-page admin-ib-commission">
      <header className="page-header">
        <h1>IB & commission</h1>
        <p className="page-subtitle">Commission rates by level, IB wallets, ledger and payout workflow</p>
      </header>

      {error && (
        <div className="admin-error" style={{ marginBottom: '1rem' }}>
          {error}
          <button type="button" className="btn-link" style={{ marginLeft: '0.5rem' }} onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      {/* Setup: commission rates by level */}
      <section className="admin-section-block">
        <h2 className="section-title">Commission setup (rates per lot by level)</h2>
        <div className="settings-card">
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            USD per lot by IB level. Level 1 = top IB, 2 = sub-IB under level 1, etc. Used when an IB profile has no custom rate.
          </p>
          <div className="filter-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            {[1, 2, 3, 4, 5].map((level) => (
              <label key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>Level {level}:</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={settings.ratePerLotByLevel?.[level] ?? ''}
                  onChange={(e) => setRateForLevel(level, e.target.value)}
                  className="filter-input"
                  style={{ width: '4rem' }}
                />
                <span className="muted">USD/lot</span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={handleSaveRates} disabled={saving}>
              {saving ? 'Saving…' : 'Save rates'}
            </button>
          </div>
        </div>
      </section>

      {/* Super Admin: PAMM Bull Run investor IB commission (levels 1–3, % of active capital) */}
      {pammSettings && (
        <section className="admin-section-block">
          <h2 className="section-title">PAMM Investor Commission (Bull Run)</h2>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            Max daily payout % of active investor capital. Level 1 = direct referrer, 2 = parent IB, 3 = grandparent. Commission runs when a Bull Run trade closes.
          </p>
          <div className="settings-card">
            <div className="filter-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              {[1, 2, 3].map((level) => {
                const cfg = pammSettings.levels?.[level] || PAMM_DEFAULTS[level];
                const percent = cfg?.daily_payout_percent ?? PAMM_DEFAULTS[level].daily_payout_percent;
                const status = cfg?.status === 'disabled' ? 'disabled' : 'enabled';
                return (
                  <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>Level {level}:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={percent === '' ? '' : percent}
                      onChange={(e) => setPammLevelPercent(level, e.target.value)}
                      className="filter-input"
                      style={{ width: '4.5rem' }}
                    />
                    <span className="muted">%</span>
                    <button
                      type="button"
                      className={`btn ${status === 'enabled' ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => setPammLevelStatus(level, status === 'enabled' ? 'disabled' : 'enabled')}
                    >
                      {status === 'enabled' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={handleSavePammRates} disabled={pammSaving}>
                {pammSaving ? 'Saving…' : 'Save PAMM commission'}
              </button>
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section className="admin-section-block">
            <h2 className="section-title">IB wallets summary</h2>
            <div className="kpi-cards kpi-cards-overview">
              {wallets.length === 0 ? (
                <p className="muted">No IB profiles yet.</p>
              ) : (
                wallets.map((w) => (
                  <div key={w.userId} className="kpi-card">
                    <h3>{w.email || w.userId}</h3>
                    <p className="kpi-value">{formatCurrency((w.pending || 0) + (w.paid || 0))}</p>
                    <span className="kpi-meta">
                      Pending: {formatCurrency(w.pending)} · Paid: {formatCurrency(w.paid)}
                    </span>
                    {(w.pending || 0) > 0 && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => handleProcessPayout(w.userId)}
                        disabled={payoutLoading === w.userId}
                      >
                        {payoutLoading === w.userId ? 'Processing…' : 'Process payout'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="admin-section-block">
            <h2 className="section-title">Commission ledger</h2>
            <div className="settings-card">
              <div className="filter-group">
                <label>Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>Trade</th>
                    <th>IB (userId)</th>
                    <th>Client</th>
                    <th>Symbol</th>
                    <th>Lots</th>
                    <th>Rate/lot</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Paid at</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-cell">
                        No commission records
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((r) => (
                      <tr key={r.id}>
                        <td>{r.tradeId || '—'}</td>
                        <td><strong>{r.ibId}</strong></td>
                        <td>{r.clientUserId || '—'}</td>
                        <td>{r.symbol || '—'}</td>
                        <td>{r.volume != null ? r.volume : '—'}</td>
                        <td>{r.ratePerLot != null ? formatCurrency(r.ratePerLot) : '—'}</td>
                        <td>{formatCurrency(r.amount)}</td>
                        <td>
                          <span className={`status-badge status-${String(r.status || '').toLowerCase()}`}>
                            {r.status || '—'}
                          </span>
                        </td>
                        <td>{r.paidAt ? new Date(r.paidAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
