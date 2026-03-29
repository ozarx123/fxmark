import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  getIbWallets,
  getIbCommissions,
  getIbSettings,
  updateIbSettings,
  getIbProfiles,
  putIbProfileParent,
  getIbReferralOverview,
  getIbReferrerGaps,
  putClientReferrer,
  getPammIbCommissionSettings,
  updatePammIbCommissionSettings,
  processIbPayout,
} from '../../api/adminApi';

const DEFAULT_RATES = { 1: 7, 2: 5, 3: 3, 4: 2, 5: 1 };
const PAMM_DEFAULTS = { 1: { daily_payout_percent: 0.25, status: 'enabled' }, 2: { daily_payout_percent: 0.15, status: 'enabled' }, 3: { daily_payout_percent: 0.10, status: 'enabled' } };
const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n));

function normalizeStaffRole(role) {
  if (role == null || role === '') return '';
  return String(role).trim().toLowerCase().replace(/\s+/g, '_');
}

export default function AdminIbCommission() {
  const { user } = useAuth();
  const isSuperAdmin = useMemo(() => {
    const r = normalizeStaffRole(user?.role);
    return r === 'superadmin' || r === 'super_admin';
  }, [user?.role]);
  const [wallets, setWallets] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [settings, setSettings] = useState({ ratePerLotByLevel: DEFAULT_RATES, defaultReferrerUserId: '' });
  const [defaultIbMeta, setDefaultIbMeta] = useState({ usesEnvFallback: false, envUserId: null });
  const [ibProfiles, setIbProfiles] = useState([]);
  const [pammSettings, setPammSettings] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultIbSaving, setDefaultIbSaving] = useState(false);
  const [pammSaving, setPammSaving] = useState(false);
  const [error, setError] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(null);
  const [parentModal, setParentModal] = useState({ open: false, ibUserId: '', email: '', parentDraft: '' });
  const [parentSaving, setParentSaving] = useState(false);
  const [overviewModal, setOverviewModal] = useState({ open: false, ibUserId: '', email: '', data: null, loading: false });
  const [gaps, setGaps] = useState(null);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapReferrerModal, setGapReferrerModal] = useState({
    open: false,
    clientUserId: '',
    clientEmail: '',
    referrerEmail: '',
  });
  const [gapReferrerSaving, setGapReferrerSaving] = useState(false);

  const loadData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const pammPromise = isSuperAdmin
        ? getPammIbCommissionSettings().catch(() => null)
        : Promise.resolve(null);
      const [walletsRes, commissionsRes, settingsRes, profilesRes, pammRes] = await Promise.all([
        getIbWallets(),
        getIbCommissions({ limit: 200 }),
        getIbSettings(),
        getIbProfiles({ limit: 200 }).catch(() => []),
        pammPromise,
      ]);
      setWallets(Array.isArray(walletsRes) ? walletsRes : []);
      setLedger(Array.isArray(commissionsRes) ? commissionsRes : []);
      setSettings({
        ratePerLotByLevel: settingsRes?.ratePerLotByLevel || DEFAULT_RATES,
        defaultReferrerUserId: settingsRes?.defaultReferrerUserId != null ? String(settingsRes.defaultReferrerUserId) : '',
      });
      setDefaultIbMeta({
        usesEnvFallback: !!settingsRes?.defaultReferrerUsesEnvFallback,
        envUserId: settingsRes?.envDefaultReferrerUserId || null,
      });
      setIbProfiles(Array.isArray(profilesRes) ? profilesRes : []);
      setPammSettings(pammRes?.levels ? { levels: pammRes.levels } : null);
    } catch (e) {
      setError(e.message || 'Failed to load data');
      setWallets([]);
      setLedger([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveRates = async () => {
    setSaving(true);
    setError('');
    try {
      await updateIbSettings({ ratePerLotByLevel: settings.ratePerLotByLevel });
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDefaultIb = async () => {
    setDefaultIbSaving(true);
    setError('');
    try {
      await updateIbSettings({
        defaultReferrerUserId: (settings.defaultReferrerUserId || '').trim(),
      });
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to save default IB');
    } finally {
      setDefaultIbSaving(false);
    }
  };

  const openParentModal = (row) => {
    setParentModal({
      open: true,
      ibUserId: String(row.userId),
      email: row.email || row.userId,
      parentDraft: row.parentId != null ? String(row.parentId) : '',
    });
  };

  const submitParentModal = async () => {
    setParentSaving(true);
    setError('');
    try {
      const raw = parentModal.parentDraft.trim();
      await putIbProfileParent(parentModal.ibUserId, raw === '' ? null : raw);
      setParentModal({ open: false, ibUserId: '', email: '', parentDraft: '' });
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to update parent');
    } finally {
      setParentSaving(false);
    }
  };

  const openOverviewModal = async (row) => {
    const uid = String(row.userId);
    setOverviewModal({ open: true, ibUserId: uid, email: row.email || uid, data: null, loading: true });
    try {
      const data = await getIbReferralOverview(uid, { limit: 100 });
      setOverviewModal((m) => ({ ...m, data, loading: false }));
    } catch (e) {
      setError(e.message || 'Failed to load referral overview');
      setOverviewModal((m) => ({ ...m, loading: false }));
    }
  };

  const loadGaps = async () => {
    setGapsLoading(true);
    setError('');
    try {
      const data = await getIbReferrerGaps({ limit: 80 });
      setGaps(data);
    } catch (e) {
      setError(e.message || 'Failed to load referrer gaps');
    } finally {
      setGapsLoading(false);
    }
  };

  const openGapReferrerModal = (u) => {
    setGapReferrerModal({
      open: true,
      clientUserId: String(u.id),
      clientEmail: u.email || '',
      referrerEmail: '',
    });
  };

  const submitGapReferrer = async () => {
    const em = gapReferrerModal.referrerEmail.trim();
    if (!em) {
      setError('Enter the introducing broker email (must be an IB account).');
      return;
    }
    setGapReferrerSaving(true);
    setError('');
    try {
      await putClientReferrer(gapReferrerModal.clientUserId, null, {
        referrerEmail: em,
        reason: 'referrer_gaps',
      });
      setGapReferrerModal({ open: false, clientUserId: '', clientEmail: '', referrerEmail: '' });
      await loadGaps();
    } catch (e) {
      setError(e.message || 'Failed to assign referrer');
    } finally {
      setGapReferrerSaving(false);
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

      <section className="admin-section-block">
        <h2 className="section-title">Default IB (direct signups)</h2>
        <div className="settings-card">
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            Users who register without a <code>?ref=</code> link get <code>referrerId</code> set to this IB user id when valid.
            Stored in Mongo (<code>ib_settings</code>). Env <code>DEFAULT_IB_REFERRER_USER_ID</code> applies only if the DB field is empty.
            <code>referralSource</code> on the user will be <code>default</code> or <code>link</code>.
          </p>
          {defaultIbMeta.usesEnvFallback && (
            <p className="muted" style={{ marginBottom: '0.5rem' }}>
              No DB value — env fallback active{defaultIbMeta.envUserId ? ` (${defaultIbMeta.envUserId})` : ''}.
            </p>
          )}
          <div className="filter-group">
            <label>Default referrer user id (must have IB profile)</label>
            <input
              type="text"
              className="filter-input"
              style={{ maxWidth: '28rem' }}
              placeholder="users._id of house IB"
              value={settings.defaultReferrerUserId}
              onChange={(e) => setSettings((s) => ({ ...s, defaultReferrerUserId: e.target.value }))}
            />
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={handleSaveDefaultIb} disabled={defaultIbSaving}>
              {defaultIbSaving ? 'Saving…' : 'Save default IB'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSettings((s) => ({ ...s, defaultReferrerUserId: '' }));
              }}
            >
              Clear field (then save to use env only)
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
            <h2 className="section-title">IB directory & hierarchy</h2>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              Level from <code>ib_profiles.parentId</code> chain. <strong>Direct signups</strong> = count of users with{' '}
              <code>referrerId</code> = this IB. Use referral overview to compare signup list vs commission-based clients.
            </p>
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Level</th>
                    <th>Parent</th>
                    <th>Direct signups</th>
                    <th>Referral code</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ibProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-cell">
                        No IB profiles
                      </td>
                    </tr>
                  ) : (
                    ibProfiles.map((p) => (
                      <tr key={p.id || p.userId}>
                        <td>{p.email || '—'}</td>
                        <td>{p.level ?? '—'}</td>
                        <td>{p.parentEmail || (p.parentId ? String(p.parentId) : '—')}</td>
                        <td>{p.directReferralCount ?? 0}</td>
                        <td>
                          <code style={{ fontSize: '0.85em' }}>{p.referralCode || '—'}</code>
                        </td>
                        <td>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openParentModal(p)}>
                            Set parent
                          </button>{' '}
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openOverviewModal(p)}>
                            Referrals
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section-block">
            <h2 className="section-title">Referrer gaps (orphans & broken links)</h2>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              Users with <code>role=user</code> and no <code>referrerId</code>, or a referrer that is missing / not an IB. Use{' '}
              <strong>Assign IB</strong> and enter the introducing broker <strong>email</strong> (their account must have an IB profile).
            </p>
            <button type="button" className="btn btn-secondary" onClick={loadGaps} disabled={gapsLoading}>
              {gapsLoading ? 'Loading…' : gaps ? 'Refresh gaps' : 'Load gaps'}
            </button>
            {gaps && (
              <div style={{ marginTop: '1rem' }} className="settings-card">
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No referrer ({gaps.noReferrer?.length ?? 0})</h3>
                <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                  <table className="table kpi-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Source</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(gaps.noReferrer || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty-cell">
                            None in sample
                          </td>
                        </tr>
                      ) : (
                        gaps.noReferrer.map((u) => (
                          <tr key={u.id}>
                            <td>{u.email}</td>
                            <td>{u.referralSource || '—'}</td>
                            <td>{u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => openGapReferrerModal(u)}
                              >
                                Assign IB
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Broken referrer ({gaps.brokenReferrer?.length ?? 0})</h3>
                <div className="table-wrap">
                  <table className="table kpi-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>referrerId</th>
                        <th>Issue</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(gaps.brokenReferrer || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty-cell">
                            None in sample
                          </td>
                        </tr>
                      ) : (
                        gaps.brokenReferrer.map((u) => (
                          <tr key={u.id}>
                            <td>{u.email}</td>
                            <td>
                              <code style={{ fontSize: '0.8em' }}>{u.referrerId}</code>
                            </td>
                            <td>{u.issue}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => openGapReferrerModal(u)}
                              >
                                Assign IB
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

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

      {parentModal.open && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="settings-card" style={{ maxWidth: '420px', width: '90%', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Set IB parent (upline)</h3>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              {parentModal.email} — enter parent IB <strong>user id</strong> (must have <code>ib_profiles</code>). Leave empty for root (level 1).
            </p>
            <input
              type="text"
              className="filter-input"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              placeholder="Parent user id or blank = root"
              value={parentModal.parentDraft}
              onChange={(e) => setParentModal((m) => ({ ...m, parentDraft: e.target.value }))}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setParentModal({ open: false, ibUserId: '', email: '', parentDraft: '' })}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={submitParentModal} disabled={parentSaving}>
                {parentSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {gapReferrerModal.open && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div className="settings-card" style={{ maxWidth: '440px', width: '100%', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Assign introducing broker</h3>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              Client: <strong>{gapReferrerModal.clientEmail || gapReferrerModal.clientUserId}</strong>
            </p>
            <label className="filter-group" style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span>IB email (account must have an IB profile)</span>
              <input
                type="email"
                className="filter-input"
                style={{ width: '100%', marginTop: '0.35rem' }}
                placeholder="ib@example.com"
                value={gapReferrerModal.referrerEmail}
                onChange={(e) => setGapReferrerModal((m) => ({ ...m, referrerEmail: e.target.value }))}
                autoComplete="off"
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setGapReferrerModal({ open: false, clientUserId: '', clientEmail: '', referrerEmail: '' })
                }
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={submitGapReferrer} disabled={gapReferrerSaving}>
                {gapReferrerSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {overviewModal.open && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="settings-card" style={{ maxWidth: '900px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Referral overview — {overviewModal.email}</h3>
            {overviewModal.loading ? (
              <p className="muted">Loading…</p>
            ) : overviewModal.data ? (
              <>
                <p className="muted" style={{ fontSize: '0.9rem' }}>{overviewModal.data.directReferralsBySignupNote}</p>
                <div className="table-wrap" style={{ marginBottom: '1.25rem' }}>
                  <table className="table kpi-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Email</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overviewModal.data.directReferralsBySignup || []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="empty-cell">None</td>
                        </tr>
                      ) : (
                        overviewModal.data.directReferralsBySignup.map((r) => (
                          <tr key={r.clientUserId}>
                            <td><code style={{ fontSize: '0.8em' }}>{r.clientUserId}</code></td>
                            <td>{r.clientEmail || '—'}</td>
                            <td>{r.joinedAt ? new Date(r.joinedAt).toLocaleString() : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: '0.9rem' }}>{overviewModal.data.clientsWithCommissionNote}</p>
                <div className="table-wrap">
                  <table className="table kpi-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Email</th>
                        <th>Total commission</th>
                        <th>Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overviewModal.data.clientsWithCommissionActivity || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty-cell">None</td>
                        </tr>
                      ) : (
                        overviewModal.data.clientsWithCommissionActivity.map((r) => (
                          <tr key={r.clientUserId}>
                            <td><code style={{ fontSize: '0.8em' }}>{r.clientUserId}</code></td>
                            <td>{r.clientEmail || '—'}</td>
                            <td>{formatCurrency(r.totalCommission || 0)}</td>
                            <td>{r.tradeCount ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted">No data</p>
            )}
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setOverviewModal({ open: false, ibUserId: '', email: '', data: null, loading: false })}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
