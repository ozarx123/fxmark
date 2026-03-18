import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  getProfitCommissionContext,
  postProfitCommissionAdjustment,
} from '../../api/adminApi.js';

function ProfitCommissionAdjustModal({ ctx, userId, onClose, onApplied }) {
  const [reason, setReason] = useState('');
  const [pammAllocationId, setPammAllocationId] = useState('');
  const [pammRealizedPnlDelta, setPammRealizedPnlDelta] = useState('');
  const [walletProfitCreditUsd, setWalletProfitCreditUsd] = useState('');
  const [ibCommissionPendingUsd, setIbCommissionPendingUsd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const alloc = ctx?.pammAllocations;
    if (alloc?.length === 1) setPammAllocationId(alloc[0].allocationId);
    else if (alloc?.length > 1) setPammAllocationId(alloc[0].allocationId);
    else setPammAllocationId('');
  }, [ctx]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const body = {
        reason: reason.trim(),
        pammAllocationId: pammAllocationId.trim() || undefined,
        pammRealizedPnlDelta:
          pammRealizedPnlDelta === '' ? undefined : Number(pammRealizedPnlDelta),
        walletProfitCreditUsd:
          walletProfitCreditUsd === '' ? undefined : Number(walletProfitCreditUsd),
        ibCommissionPendingUsd:
          ibCommissionPendingUsd === '' ? undefined : Number(ibCommissionPendingUsd),
      };
      await postProfitCommissionAdjustment(userId, body);
      setSuccessMsg('Adjustment applied successfully. Context refreshed below.');
      onApplied?.();
      setReason('');
      setPammRealizedPnlDelta('');
      setWalletProfitCreditUsd('');
      setIbCommissionPendingUsd('');
    } catch (err) {
      setSubmitError(err.message || 'Adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

  return (
    <div
      className="modal-overlay admin-profit-commission-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profit-commission-modal-title"
    >
      <div
        className="modal-content admin-modal admin-profit-commission-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-profit-modal-header">
          <div>
            <h3 id="profit-commission-modal-title">Apply adjustment</h3>
            <p className="modal-subtitle muted">
              {ctx?.user?.name || '—'} · {ctx?.user?.email}
            </p>
            <p className="modal-subtitle muted">
              User ID: <code className="admin-user-id">{userId}</code>
              {' · '}
              Wallet {fmt(ctx?.walletUsd)}
              {ctx?.hasIbProfile ? ' · IB profile' : ''}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="admin-profit-modal-body">
          <form onSubmit={handleSubmit}>
            <div className="admin-profit-modal-section">
              <h4 className="admin-profit-modal-section-title">Audit</h4>
              <div className="filter-group">
                <label htmlFor="pca-reason">Reason (min 10 characters)</label>
                <textarea
                  id="pca-reason"
                  className="filter-input admin-profit-textarea"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Correcting duplicate distribution — ticket #1234"
                  required
                  minLength={10}
                />
              </div>
            </div>

            <div className="admin-profit-modal-section">
              <h4 className="admin-profit-modal-section-title">PAMM — realized P&amp;L</h4>
              <div className="form-row admin-profit-form-row">
                <div className="filter-group">
                  <label htmlFor="pca-pnl">Delta (USD, + or −)</label>
                  <input
                    id="pca-pnl"
                    type="number"
                    step="0.01"
                    className="filter-input"
                    value={pammRealizedPnlDelta}
                    onChange={(e) => setPammRealizedPnlDelta(e.target.value)}
                    placeholder="Leave empty to skip"
                  />
                </div>
                <div className="filter-group">
                  <label htmlFor="pca-alloc">Allocation</label>
                  {ctx?.pammAllocations?.length > 0 ? (
                    <select
                      id="pca-alloc"
                      className="filter-select"
                      value={pammAllocationId}
                      onChange={(e) => setPammAllocationId(e.target.value)}
                    >
                      {ctx.pammAllocations.map((a) => (
                        <option key={a.allocationId} value={a.allocationId}>
                          {a.fundName} — P&amp;L {a.realizedPnl} — {a.allocationId.slice(0, 8)}…
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="pca-alloc"
                      type="text"
                      className="filter-input"
                      value={pammAllocationId}
                      onChange={(e) => setPammAllocationId(e.target.value)}
                      placeholder="Allocation ID (if adjusting P&amp;L)"
                    />
                  )}
                </div>
              </div>
              <p className="muted admin-profit-hint">Required if P&amp;L delta is non-zero.</p>
            </div>

            <div className="admin-profit-modal-section">
              <h4 className="admin-profit-modal-section-title">Wallet</h4>
              <div className="filter-group">
                <label htmlFor="pca-wallet">Profit credit (USD)</label>
                <input
                  id="pca-wallet"
                  type="number"
                  step="0.01"
                  min="0"
                  className="filter-input"
                  value={walletProfitCreditUsd}
                  onChange={(e) => setWalletProfitCreditUsd(e.target.value)}
                  placeholder="Positive only — ledger + balance"
                />
              </div>
            </div>

            <div className="admin-profit-modal-section">
              <h4 className="admin-profit-modal-section-title">IB commission</h4>
              <div className="filter-group">
                <label htmlFor="pca-ib">Pending commission (USD)</label>
                <input
                  id="pca-ib"
                  type="number"
                  step="0.01"
                  min="0"
                  className="filter-input"
                  value={ibCommissionPendingUsd}
                  onChange={(e) => setIbCommissionPendingUsd(e.target.value)}
                  disabled={!ctx?.hasIbProfile}
                  placeholder={
                    ctx?.hasIbProfile ? 'Adds pending row + receivables ledger' : 'No IB profile'
                  }
                />
              </div>
            </div>

            {submitError && <p className="form-error admin-profit-modal-error">{submitError}</p>}
            {successMsg && <p className="form-success admin-profit-modal-success">{successMsg}</p>}

            <div className="modal-actions admin-profit-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Applying…' : 'Apply adjustment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminProfitCommissionAdjust() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';

  const [userId, setUserId] = useState('');
  const [ctx, setCtx] = useState(null);
  const [ctxError, setCtxError] = useState('');
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const loadContext = useCallback(async () => {
    const id = userId.trim();
    if (!id) {
      setCtxError('Enter a user ID');
      return;
    }
    setLoadingCtx(true);
    setCtxError('');
    setCtx(null);
    try {
      const data = await getProfitCommissionContext(id);
      setCtx(data);
    } catch (e) {
      setCtxError(e.message || 'Failed to load context');
    } finally {
      setLoadingCtx(false);
    }
  }, [userId]);

  const onApplied = useCallback(() => {
    loadContext();
  }, [loadContext]);

  if (!isSuperAdmin) {
    return (
      <div className="admin-page">
        <h1>Profit &amp; commission adjustment</h1>
        <p className="muted">Super Admin only.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-profit-commission-page">
      <div className="admin-page-header">
        <h1>Profit &amp; commission adjustment</h1>
        <p className="muted admin-profit-page-desc">
          Atomic updates: <code>pamm_allocations</code> realized P&amp;L, wallet + ledger (
          <code>admin_profit_adjustment</code>), and/or <code>ib_commissions</code> + ledger. Load a user,
          review context, then open the form.
        </p>
      </div>

      <div className="card card--neutral admin-profit-toolbar-card">
        <div className="admin-profit-toolbar">
          <div className="filter-group admin-profit-user-field">
            <label htmlFor="pca-userid">User ID</label>
            <input
              id="pca-userid"
              className="filter-input"
              placeholder="Mongo user ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div className="admin-profit-toolbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadContext}
              disabled={loadingCtx || !userId.trim()}
            >
              {loadingCtx ? 'Loading…' : 'Load context'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setModalOpen(true)}
              disabled={!ctx || loadingCtx}
              title={!ctx ? 'Load context first' : ''}
            >
              Apply adjustment…
            </button>
          </div>
        </div>
        {ctxError && <p className="form-error" style={{ marginTop: '0.75rem' }}>{ctxError}</p>}
      </div>

      {ctx && (
        <div className="card card--neutral admin-profit-context-card">
          <h2 className="admin-card-title">User context</h2>
          <div className="admin-profit-context-meta">
            <div>
              <span className="muted">Name</span>
              <p className="admin-profit-context-value">{ctx.user?.name || '—'}</p>
            </div>
            <div>
              <span className="muted">Email</span>
              <p className="admin-profit-context-value">{ctx.user?.email}</p>
            </div>
            <div>
              <span className="muted">Wallet (USD)</span>
              <p className="admin-profit-context-value">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                  Number(ctx.walletUsd) || 0
                )}
              </p>
            </div>
            <div>
              <span className="muted">IB profile</span>
              <p className="admin-profit-context-value">{ctx.hasIbProfile ? 'Yes' : 'No'}</p>
            </div>
          </div>
          {ctx.pammAllocations?.length > 0 ? (
            <div className="table-wrap admin-profit-table-wrap">
              <table className="table pamm-table">
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th>Allocation ID</th>
                    <th>Balance</th>
                    <th>Realized P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {ctx.pammAllocations.map((a) => (
                    <tr key={a.allocationId}>
                      <td>{a.fundName}</td>
                      <td>
                        <code className="admin-profit-code">{a.allocationId}</code>
                      </td>
                      <td>{a.allocatedBalance}</td>
                      <td>{a.realizedPnl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              No active PAMM allocations.
            </p>
          )}
        </div>
      )}

      {modalOpen && ctx && (
        <ProfitCommissionAdjustModal
          ctx={ctx}
          userId={userId.trim()}
          onClose={() => setModalOpen(false)}
          onApplied={onApplied}
        />
      )}
    </div>
  );
}
