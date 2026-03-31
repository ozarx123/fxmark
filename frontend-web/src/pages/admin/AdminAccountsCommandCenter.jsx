import React, { useState, useEffect, useCallback } from 'react';
import {
  getFraudDashboardStats,
  getWithdrawals,
  getWithdrawalDetail,
  updateWithdrawalStatus,
  completeWithdrawal,
  getWithdrawalApprovalSettings,
  updateWithdrawalApprovalSettings,
  getActivity,
  getLatestReconciliation,
  getAlerts,
  resolveAlert,
} from '../../api/adminApi';

function formatDate(d) {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toLocaleString();
}
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount ?? 0);
}
function riskClass(score) {
  if (score == null) return '';
  if (score >= 70) return 'risk-high';
  if (score >= 41) return 'risk-medium';
  return 'risk-low';
}

export default function AdminAccountsCommandCenter() {
  const [stats, setStats] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [activity, setActivity] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recon, setRecon] = useState(null);
  const [approvalSettings, setApprovalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [queueTab, setQueueTab] = useState('review');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ autoApproveSmallWithdrawals: false, autoApproveThresholdUsd: 100 });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, withdrawalsRes, activityRes, alertsRes, reconRes, settingsRes] = await Promise.all([
        getFraudDashboardStats(),
        getWithdrawals({ limit: 200 }),
        getActivity(80),
        getAlerts({ limit: 50, resolved: 'false' }),
        getLatestReconciliation().catch(() => ({ run: null })),
        getWithdrawalApprovalSettings(),
      ]);
      setStats(statsRes);
      setWithdrawals(Array.isArray(withdrawalsRes) ? withdrawalsRes : []);
      setActivity(Array.isArray(activityRes) ? activityRes : []);
      setAlerts(Array.isArray(alertsRes) ? alertsRes : []);
      setRecon(reconRes?.run ?? null);
      setApprovalSettings(settingsRes);
      setSettingsForm({
        autoApproveSmallWithdrawals: !!settingsRes?.autoApproveSmallWithdrawals,
        autoApproveThresholdUsd: Number(settingsRes?.autoApproveThresholdUsd) ?? 100,
      });
    } catch (e) {
      setError(e.message || 'Failed to load command center');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    getWithdrawalDetail(detailId).then(setDetail).catch(() => setDetail(null));
  }, [detailId]);

  const handleStatusChange = async (id, status) => {
    setActionLoading(true);
    try {
      await updateWithdrawalStatus(id, status, adminNote);
      setAdminNote('');
      setDetail(null);
      setDetailId(null);
      loadAll();
    } catch (e) {
      setError(e.message || 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteWithdrawal = async (id) => {
    if (!window.confirm('Are you sure funds are sent to user?')) return;
    setActionLoading(true);
    setError('');
    try {
      const data = await completeWithdrawal(id);
      const w = data.withdrawal;
      if (w) {
        setWithdrawals((prev) => prev.map((row) => (row.id === id ? { ...row, ...w } : row)));
        setDetail((d) => (d && d.id === id ? { ...d, ...w } : d));
      }
      await loadAll();
    } catch (e) {
      setError(e.message || 'Completion failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      await updateWithdrawalApprovalSettings(settingsForm);
      setApprovalSettings(settingsForm);
      loadAll();
    } catch (e) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResolveAlert = async (id) => {
    try {
      await resolveAlert(id);
      loadAll();
    } catch (e) {
      setError(e.message || 'Failed to resolve alert');
    }
  };

  const byStatus = {
    review: withdrawals.filter((w) => w.status === 'review'),
    approved: withdrawals.filter((w) => w.status === 'approved'),
    rejected: withdrawals.filter((w) => w.status === 'rejected'),
    completed: withdrawals.filter((w) => w.status === 'completed'),
  };
  const depositsAndCredits = activity.filter((a) => a.type === 'deposit' || a.type === 'admin_credit');
  const highRiskUsers = [...new Map(withdrawals.filter((w) => (w.fraudRiskScore ?? 0) >= 70).map((w) => [w.userId, { userId: w.userId, score: w.fraudRiskScore, flags: w.fraudRiskFlags || [] }])).values()];

  if (loading && !stats) {
    return (
      <div className="page admin-page admin-command-center">
        <p className="muted">Loading command center…</p>
      </div>
    );
  }

  return (
    <div className="page admin-page admin-command-center">
      <header className="page-header">
        <h1>Accounts command center</h1>
        <p className="page-subtitle">Withdrawal approval, activity feed, fraud watchlist, alerts & reconciliation</p>
      </header>

      {error && (
        <div className="admin-error" role="alert">{error}</div>
      )}

      {/* SECTION 1: Summary cards */}
      <section className="fraud-summary-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="fraud-card"><span className="fraud-card-value">{stats?.totalWithdrawalsToday ?? '—'}</span><span className="fraud-card-label">Withdrawals today</span></div>
        <div className="fraud-card"><span className="fraud-card-value">{withdrawals.filter((w) => w.status === 'completed').length}</span><span className="fraud-card-label">Completed</span></div>
        <div className="fraud-card"><span className="fraud-card-value">{activity.filter((a) => a.type === 'deposit').length}</span><span className="fraud-card-label">Deposits (recent)</span></div>
        <div className="fraud-card"><span className="fraud-card-value">{activity.filter((a) => a.type === 'admin_credit').length}</span><span className="fraud-card-label">Admin credits</span></div>
        <div className="fraud-card"><span className="fraud-card-value risk-high">{stats?.highRiskToday ?? '—'}</span><span className="fraud-card-label">High risk today</span></div>
        <div className="fraud-card"><span className="fraud-card-value">{alerts.length}</span><span className="fraud-card-label">Open alerts</span></div>
        <div className="fraud-card"><span className="fraud-card-value">{recon?.mismatchCount ?? '—'}</span><span className="fraud-card-label">Recon mismatches</span></div>
      </section>

      {/* SECTION 2: Approval settings */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Withdrawal approval settings</h2>
        <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={settingsForm.autoApproveSmallWithdrawals}
              onChange={(e) => setSettingsForm((s) => ({ ...s, autoApproveSmallWithdrawals: e.target.checked }))}
            />
            Auto-approve small withdrawals
          </label>
          <label>
            Threshold (USD)
            <input
              type="number"
              min={0}
              step={1}
              className="filter-input"
              style={{ width: 100, marginLeft: 8 }}
              value={settingsForm.autoApproveThresholdUsd}
              onChange={(e) => setSettingsForm((s) => ({ ...s, autoApproveThresholdUsd: Number(e.target.value) || 0 }))}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleSaveSettings} disabled={settingsSaving}>
            {settingsSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: '0.9rem' }}>
          ON: amount ≤ threshold → approved; &gt; threshold → review. OFF: all → review. Approve does not move funds; only user process does.
        </p>
      </section>

      {/* SECTION 3: Live activity feed */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Live activity feed</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Type</th>
                <th>User</th>
                <th>Amount</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {activity.length === 0 ? (
                <tr><td colSpan={8}>No recent activity</td></tr>
              ) : (
                activity.slice(0, 30).map((a) => (
                  <tr key={a.id} className={riskClass(a.fraudRiskScore)}>
                    <td><code className="withdrawal-id">{a.id?.slice(-8)}</code></td>
                    <td>{a.type}</td>
                    <td>{a.userId}</td>
                    <td>{formatCurrency(a.amount, a.currency)}</td>
                    <td>{a.currency}</td>
                    <td><span className={`status-badge status-${a.status || 'pending'}`}>{a.status || '—'}</span></td>
                    <td><span className={`risk-badge ${riskClass(a.fraudRiskScore)}`}>{a.fraudRiskScore ?? '—'}</span></td>
                    <td>{formatDate(a.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4: Withdrawal queue */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Withdrawal queue</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {['review', 'approved', 'rejected', 'completed'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`btn btn-sm ${queueTab === tab ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setQueueTab(tab)}
            >
              {tab} ({byStatus[tab]?.length ?? 0})
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>User</th>
                <th>Amount</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(byStatus[queueTab] || []).length === 0 ? (
                <tr><td colSpan={7}>No withdrawals in {queueTab}</td></tr>
              ) : (
                (byStatus[queueTab] || []).map((w) => (
                  <tr key={w.id} className={riskClass(w.fraudRiskScore)}>
                    <td><code className="withdrawal-id">{w.id?.slice(-8)}</code></td>
                    <td>{w.userId}</td>
                    <td>{formatCurrency(w.amount, w.currency)}</td>
                    <td><span className={`risk-badge ${riskClass(w.fraudRiskScore)}`}>{w.fraudRiskScore ?? '—'}</span></td>
                    <td><span className={`status-badge status-${w.status}`}>{w.status}</span></td>
                    <td>{formatDate(w.createdAt)}</td>
                    <td>
                      <button type="button" className="btn btn-sm" onClick={() => setDetailId(w.id)}>View</button>
                      {w.status === 'pending' && (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => handleStatusChange(w.id, 'review')} disabled={actionLoading}>To review</button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleStatusChange(w.id, 'rejected')} disabled={actionLoading}>Reject</button>
                        </>
                      )}
                      {w.status === 'review' && (
                        <>
                          <button type="button" className="btn btn-sm btn-success" onClick={() => handleStatusChange(w.id, 'approved')} disabled={actionLoading}>Approve</button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleStatusChange(w.id, 'rejected')} disabled={actionLoading}>Reject</button>
                        </>
                      )}
                      {w.status === 'approved' && (
                        <>
                          <button type="button" className="btn btn-sm btn-success" onClick={() => handleCompleteWithdrawal(w.id)} disabled={actionLoading}>Complete</button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleStatusChange(w.id, 'rejected')} disabled={actionLoading}>Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Funds move only when user calls Process (after approval).</p>
      </section>

      {/* SECTION 5: Deposits / credits */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Deposits &amp; admin credits</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Id</th><th>Type</th><th>User</th><th>Amount</th><th>Status</th><th>Time</th></tr>
            </thead>
            <tbody>
              {depositsAndCredits.length === 0 ? (
                <tr><td colSpan={6}>No deposits or admin credits in recent activity</td></tr>
              ) : (
                depositsAndCredits.slice(0, 20).map((a) => (
                  <tr key={a.id}>
                    <td><code>{a.id?.slice(-8)}</code></td>
                    <td>{a.type}</td>
                    <td>{a.userId}</td>
                    <td>{formatCurrency(a.amount, a.currency)}</td>
                    <td><span className={`status-badge status-${a.status || '—'}`}>{a.status || '—'}</span></td>
                    <td>{formatDate(a.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 6: Fraud watchlist */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Fraud watchlist (high risk)</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>User</th><th>Risk score</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {highRiskUsers.length === 0 ? (
                <tr><td colSpan={3}>No high-risk users in current withdrawals</td></tr>
              ) : (
                highRiskUsers.map((u) => (
                  <tr key={u.userId} className="risk-high">
                    <td>{u.userId}</td>
                    <td><span className="risk-badge risk-high">{u.score}</span></td>
                    <td>{(u.flags || []).join(', ') || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 7: Alerts */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Alerts</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Type</th><th>Severity</th><th>Message</th><th>Ref</th><th>Action</th></tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr><td colSpan={5}>No open alerts</td></tr>
              ) : (
                alerts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.type}</td>
                    <td><span className={`severity-${(a.severity || 'LOW').toLowerCase()}`}>{a.severity || 'LOW'}</span></td>
                    <td>{a.message}</td>
                    <td><code>{a.referenceId ? String(a.referenceId).slice(-8) : '—'}</code></td>
                    <td><button type="button" className="btn btn-sm btn-success" onClick={() => handleResolveAlert(a.id)}>Resolve</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 8: Reconciliation */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Reconciliation</h2>
        {recon ? (
          <div>
            <p><strong>Last run</strong> {formatDate(recon.checkedAt)}</p>
            <p><strong>Mismatch count</strong> {recon.mismatchCount ?? 0}</p>
            <p><strong>Wallets scanned</strong> {recon.walletsScanned ?? '—'}</p>
          </div>
        ) : (
          <p className="muted">No reconciliation runs yet.</p>
        )}
      </section>

      {/* SECTION 9: Admin log (from withdrawal audit fields) */}
      <section className="command-section" style={{ marginBottom: '1.5rem' }}>
        <h2>Admin log (recent approve/reject)</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Withdrawal</th><th>Action</th><th>By</th><th>Time</th></tr>
            </thead>
            <tbody>
              {withdrawals
                .filter((w) => w.approvedBy || w.rejectedBy)
                .slice(0, 15)
                .map((w) => (
                  <tr key={w.id}>
                    <td><code>{w.id?.slice(-8)}</code></td>
                    <td>{w.approvedAt ? 'Approved' : 'Rejected'}</td>
                    <td>{w.approvedBy || w.rejectedBy || '—'}</td>
                    <td>{formatDate(w.approvedAt || w.rejectedAt)}</td>
                  </tr>
                ))}
              {withdrawals.filter((w) => w.approvedBy || w.rejectedBy).length === 0 && (
                <tr><td colSpan={4}>No admin actions in list</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 10: Detail drawer */}
      {detail && (
        <div className="drawer-overlay" onClick={() => setDetailId(null)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Withdrawal {detail.id?.slice(-8)}</h3>
              <button type="button" className="btn btn-sm" onClick={() => setDetailId(null)}>Close</button>
            </div>
            <div className="drawer-body">
              <p><strong>User</strong> {detail.userId}</p>
              <p><strong>Amount</strong> {formatCurrency(detail.amount, detail.currency)}</p>
              <p><strong>Status</strong> <span className={`status-badge status-${detail.status}`}>{detail.status}</span></p>
              <p><strong>Risk score</strong> <span className={`risk-badge ${riskClass(detail.fraudRiskScore)}`}>{detail.fraudRiskScore ?? '—'}</span></p>
              <p><strong>Flags</strong> {(detail.fraudRiskFlags || []).join(', ') || '—'}</p>
              <p><strong>Created</strong> {formatDate(detail.createdAt)}</p>
              <p><strong>Completed</strong> {formatDate(detail.completedAt)}</p>
              {(detail.approvedBy || detail.approvedAt) && (
                <p><strong>Approved by</strong> {detail.approvedBy || '—'} at {formatDate(detail.approvedAt)}</p>
              )}
              {(detail.rejectedBy || detail.rejectedAt) && (
                <p><strong>Rejected by</strong> {detail.rejectedBy || '—'} at {formatDate(detail.rejectedAt)}</p>
              )}
              {detail.adminNote && <p><strong>Admin note</strong> {detail.adminNote}</p>}
              <hr />
              <label className="filter-group" style={{ display: 'block', marginBottom: 8 }}>
                <span>Admin note (optional)</span>
                <textarea
                  className="filter-input"
                  style={{ width: '100%', minHeight: 64 }}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Reason for approve or reject"
                  maxLength={2000}
                />
              </label>
              <p><strong>Flow</strong> pending → review → approved → Complete (admin) → completed</p>
              {detail.status === 'pending' && (
                <div className="drawer-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => handleStatusChange(detail.id, 'review')} disabled={actionLoading}>Send to review</button>
                  <button type="button" className="btn btn-danger" onClick={() => handleStatusChange(detail.id, 'rejected')} disabled={actionLoading}>Reject</button>
                </div>
              )}
              {detail.status === 'review' && (
                <div className="drawer-actions">
                  <button type="button" className="btn btn-success" onClick={() => handleStatusChange(detail.id, 'approved')} disabled={actionLoading}>Approve</button>
                  <button type="button" className="btn btn-danger" onClick={() => handleStatusChange(detail.id, 'rejected')} disabled={actionLoading}>Reject</button>
                </div>
              )}
              {detail.status === 'approved' && (
                <div className="drawer-actions">
                  <button type="button" className="btn btn-success" onClick={() => handleCompleteWithdrawal(detail.id)} disabled={actionLoading}>Complete</button>
                  <button type="button" className="btn btn-danger" onClick={() => handleStatusChange(detail.id, 'rejected')} disabled={actionLoading}>Reject (before payout)</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
