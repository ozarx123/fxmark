import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as ibApi from '../../api/ibApi';
import { LinkSimple, Copy, Check, UserPlus, CurrencyDollar } from '@phosphor-icons/react';

const formatCurrency = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n ?? 0);

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
};

/** Build combined referral activity log (joinings + commissions) sorted by date desc */
function buildReferralLogs(joinings, commissions, referrals, currency) {
  const clientMap = Object.fromEntries(
    (referrals || []).map((r) => [r.clientUserId, r.clientEmail || r.clientUserId])
  );
  (joinings || []).forEach((j) => {
    clientMap[j.clientUserId] = j.clientEmail || j.clientName || j.clientUserId;
  });
  const logs = [];
  (joinings || []).forEach((j) => {
    logs.push({
      type: 'joined',
      date: j.joinedAt,
      client: j.clientEmail || j.clientName || j.clientUserId || '—',
      clientUserId: j.clientUserId,
    });
  });
  (commissions || []).forEach((c) => {
    logs.push({
      type: 'commission',
      date: c.createdAt,
      client: clientMap[c.clientUserId] || c.clientUserId || '—',
      clientUserId: c.clientUserId,
      amount: c.amount,
      currency: c.currency || currency,
      symbol: c.symbol,
      volume: c.volume,
      status: c.status,
    });
  });
  logs.sort((a, b) => new Date(b.date) - new Date(a.date));
  return logs;
}

export default function Ib() {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [joinings, setJoinings] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registerModal, setRegisterModal] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [payouting, setPayouting] = useState(false);
  const [copied, setCopied] = useState(false);

  const referralLink = typeof window !== 'undefined' && user?.id
    ? `${window.location.origin}/auth?ref=${encodeURIComponent(user.id)}`
    : '';

  const handleCopyLink = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = referralLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [referralLink]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const [profRes, balRes, statsRes, refRes, joinRes, commRes, payRes] = await Promise.all([
        ibApi.getMyProfile().catch(() => null),
        ibApi.getBalance().catch(() => null),
        ibApi.getStats().catch(() => null),
        ibApi.listReferrals().catch(() => []),
        ibApi.listReferralJoinings().catch(() => []),
        ibApi.listCommissions().catch(() => []),
        ibApi.listPayouts().catch(() => []),
      ]);
      setProfile(profRes);
      setBalance(balRes || { pending: 0, paid: 0, currency: 'USD' });
      setStats(statsRes || { referralCount: 0, totalEarnings: 0, pending: 0, paid: 0, currency: 'USD' });
      setReferrals(Array.isArray(refRes) ? refRes : []);
      setJoinings(Array.isArray(joinRes) ? joinRes : []);
      setCommissions(Array.isArray(commRes) ? commRes : []);
      setPayouts(Array.isArray(payRes) ? payRes : []);
    } catch (e) {
      setError(e.message || 'Failed to load IB data');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const referralLogs = useMemo(
    () => buildReferralLogs(joinings, commissions, referrals, balance?.currency ?? 'USD'),
    [joinings, commissions, referrals, balance?.currency]
  );

  const handleRegister = async (e) => {
    e?.preventDefault();
    setRegistering(true);
    setError('');
    try {
      await ibApi.registerAsIb({ ratePerLot: 7, currency: 'USD' });
      setRegisterModal(false);
      loadData();
    } catch (e) {
      setError(e.message || 'Failed to register');
    } finally {
      setRegistering(false);
    }
  };

  const handleRequestPayout = async () => {
    setPayouting(true);
    setError('');
    try {
      await ibApi.requestPayout();
      loadData();
    } catch (e) {
      setError(e.message || 'Failed to request payout');
    } finally {
      setPayouting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="page ib-page">
        <header className="page-header">
          <h1>Introducing Broker</h1>
          <p className="page-subtitle">Commission and payouts</p>
        </header>
        <p className="muted">Sign in to access the IB section.</p>
      </div>
    );
  }

  if (!loading && !profile) {
    return (
      <div className="page ib-page">
        <header className="page-header">
          <h1>Introducing Broker</h1>
          <p className="page-subtitle">Commission and payouts</p>
        </header>
        <section className="page-content">
          {error && <p className="form-error">{error}</p>}
          <div className="section-block">
            <h2>Register as IB</h2>
            <p className="muted">Register to start earning commissions from referred clients.</p>
            <button type="button" className="btn btn-primary" onClick={() => setRegisterModal(true)}>
              Register as IB
            </button>
          </div>
          {registerModal && (
            <div className="modal-overlay" onClick={() => setRegisterModal(false)}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Register as IB</h2>
                  <button type="button" className="modal-close" onClick={() => setRegisterModal(false)} aria-label="Close">&times;</button>
                </div>
                <form onSubmit={handleRegister}>
                  <p className="muted">Default rate: $7 per lot. You can change this later.</p>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setRegisterModal(false)} disabled={registering}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={registering}>
                      {registering ? 'Registering…' : 'Register'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  const pending = balance?.pending ?? 0;
  const paid = balance?.paid ?? 0;
  const currency = balance?.currency ?? 'USD';
  const referralCount = stats?.referralCount ?? 0;
  const totalEarnings = stats?.totalEarnings ?? (pending + paid);

  return (
    <div className="page ib-page">
      <header className="page-header">
        <h1>Introducing Broker</h1>
        <p className="page-subtitle">Commission and payouts</p>
      </header>
      <section className="page-content">
        {error && <p className="form-error">{error}</p>}
        <div className="ib-referral-generator section-block">
          <h2 className="ib-referral-title">
            <LinkSimple size={22} weight="duotone" />
            Referral link
          </h2>
          <p className="ib-referral-desc">Share this link with clients. When they sign up and trade, you earn commission.</p>
          <div className="ib-referral-link-wrap">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="ib-referral-input"
              aria-label="Referral link"
            />
            <button
              type="button"
              className="btn btn-primary ib-referral-copy"
              onClick={handleCopyLink}
              disabled={!referralLink}
              title="Copy link"
            >
              {copied ? <Check size={20} weight="bold" /> : <Copy size={20} weight="regular" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="ib-referral-hint">Use this link in emails, social media, or your website.</p>
        </div>
        <div className="cards-row">
          <div className="card">
            <h3>Referrals</h3>
            <p className="card-value">{loading ? '…' : referralCount}</p>
            <span className="card-label">Total signups</span>
          </div>
          <div className="card">
            <h3>Total earnings</h3>
            <p className="card-value">{loading ? '…' : formatCurrency(totalEarnings, currency)}</p>
            <span className="card-label">{currency}</span>
          </div>
          <div className="card">
            <h3>Pending commission</h3>
            <p className="card-value">{loading ? '…' : formatCurrency(pending, currency)}</p>
            <span className="card-label">{currency}</span>
          </div>
          <div className="card">
            <h3>Paid out</h3>
            <p className="card-value">{loading ? '…' : formatCurrency(paid, currency)}</p>
            <span className="card-label">{currency}</span>
          </div>
          <div className="card">
            <h3>Level</h3>
            <p className="card-value">{loading ? '…' : (profile?.level ?? '—')}</p>
            <span className="card-label">IB level</span>
          </div>
        </div>
        <div className="section-block">
          <h2>Referral logs</h2>
          <p className="muted">Chronological activity: signups and commission events.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Client</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {referralLogs.length === 0 ? (
                  <tr><td colSpan={4} className="empty-cell">No referral activity yet</td></tr>
                ) : (
                  referralLogs.map((log, i) => (
                    <tr key={log.type === 'joined' ? `j-${log.clientUserId}` : `c-${log.date}-${i}`}>
                      <td>{formatDate(log.date)}</td>
                      <td>
                        {log.type === 'joined' ? (
                          <span className="referral-log-badge referral-log-joined">
                            <UserPlus size={14} /> Joined
                          </span>
                        ) : (
                          <span className="referral-log-badge referral-log-commission">
                            <CurrencyDollar size={14} /> Commission
                          </span>
                        )}
                      </td>
                      <td>{log.client}</td>
                      <td>
                        {log.type === 'joined' ? '—' : (
                          <>
                            {formatCurrency(log.amount, log.currency)}
                            {log.symbol && ` · ${log.symbol}`}
                            {log.volume != null && ` · ${log.volume} lots`}
                            {log.status && <span className={`status-badge status-${log.status}`} style={{ marginLeft: '0.5rem' }}>{log.status}</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-block">
          <h2>Referral joinings</h2>
          <p className="muted">Users who signed up using your referral link.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {joinings.length === 0 ? (
                  <tr><td colSpan={2} className="empty-cell">No referral joinings yet</td></tr>
                ) : (
                  joinings.map((j) => (
                    <tr key={j.clientUserId}>
                      <td>{j.clientEmail || j.clientName || j.clientUserId || '—'}</td>
                      <td>{formatDate(j.joinedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-block">
          <h2>Referrals with commission</h2>
          <p className="muted">Clients who have traded and generated commission for you.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Joined</th>
                  <th>Trades</th>
                  <th>Commission</th>
                </tr>
              </thead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr><td colSpan={4} className="empty-cell">No commissions from referrals yet</td></tr>
                ) : (
                  referrals.map((r) => (
                    <tr key={r.clientUserId}>
                      <td>{r.clientEmail || r.clientUserId || '—'}</td>
                      <td>{formatDate(r.joinedAt || r.firstCommissionAt)}</td>
                      <td>{r.tradeCount ?? 0}</td>
                      <td>{formatCurrency(r.totalCommission, currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-block">
          <h2>Recent commissions</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Symbol</th>
                  <th>Volume</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr><td colSpan={5} className="empty-cell">No commissions yet</td></tr>
                ) : (
                  commissions.slice(0, 20).map((c) => (
                    <tr key={c.id}>
                      <td>{formatDate(c.createdAt)}</td>
                      <td>{c.symbol || '—'}</td>
                      <td>{c.volume ?? 0}</td>
                      <td>{formatCurrency(c.amount, c.currency)}</td>
                      <td><span className={`status-badge status-${c.status}`}>{c.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-block">
          <h2>Payouts</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.length === 0 ? (
                  <tr><td colSpan={3} className="empty-cell">No payouts yet</td></tr>
                ) : (
                  payouts.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.requestedAt)}</td>
                      <td>{formatCurrency(p.amount, p.currency)}</td>
                      <td><span className={`status-badge status-${p.status}`}>{p.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-block">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRequestPayout}
            disabled={loading || payouting || pending <= 0}
          >
            {payouting ? 'Requesting…' : 'Request payout'}
          </button>
          {pending <= 0 && <span className="muted" style={{ marginLeft: '0.5rem' }}>No pending commission</span>}
        </div>
      </section>
    </div>
  );
}
