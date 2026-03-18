import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as adminApi from '../../api/adminApi';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);

export default function AdminBullRun() {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editFund, setEditFund] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadFunds = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await adminApi.listPammFunds();
      setFunds(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Failed to load funds');
      setFunds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFunds();
  }, [loadFunds]);

  const bullRunFund = funds.find(
    (f) =>
      (f.name || '').toUpperCase() === 'BULL RUN' ||
      (f.fundType || '').toLowerCase() === 'ai'
  );

  return (
    <div className="page admin-page admin-bullrun">
      <header className="page-header">
        <h1>Bull Run fund</h1>
        <p className="page-subtitle">Create and manage the PAMM AI (BULL RUN) fund</p>
        <div className="page-header-actions">
          {!bullRunFund && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreateOpen(true)}
            >
              Create BULL RUN fund
            </button>
          )}
        </div>
      </header>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && (
        <>
          {bullRunFund ? (
            <section className="admin-section-block">
              <h2 className="section-title">BULL RUN fund</h2>
              <div className="settings-card">
                <div className="admin-bullrun-card">
                  <div>
                    <h3>{bullRunFund.name}</h3>
                    <p className="muted">
                      Fund ID: <code>{bullRunFund.id}</code> · Type: {bullRunFund.fundType || 'ai'}
                    </p>
                    <p className="muted">
                      Manager user ID: <code>{bullRunFund.userId}</code>
                      {bullRunFund.tradingAccountId && (
                        <> · Trading account: <code>{bullRunFund.tradingAccountId}</code></>
                      )}
                    </p>
                  </div>
                  <div className="admin-bullrun-stats">
                    <div><span className="label">AUM</span><span>{formatCurrency(bullRunFund.aum)}</span></div>
                    <div><span className="label">Investors</span><span>{bullRunFund.investors ?? 0}</span></div>
                    <div><span className="label">Reserve</span><span>{formatCurrency(bullRunFund.reserveBalance)}</span></div>
                    <div>
                      <span className="label">Status</span>
                      <span className={`status-badge status-${(bullRunFund.approvalStatus || 'pending') === 'approved' ? 'approved' : 'pending'}`}>
                        {bullRunFund.approvalStatus || 'pending'}
                      </span>
                    </div>
                  </div>
                  <div className="admin-bullrun-actions">
                    <Link to={`/pamm-ai/fund/${bullRunFund.id}`} className="btn btn-secondary btn-sm" target="_blank" rel="noopener noreferrer">
                      View as investor
                    </Link>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditFund(bullRunFund)}
                    >
                      Edit fund
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="admin-section-block">
              <p className="muted">No BULL RUN fund yet. Create one to enable PAMM AI for users.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCreateOpen(true)}
              >
                Create BULL RUN fund
              </button>
            </section>
          )}

          {funds.length > 0 && (
            <section className="admin-section-block">
              <h2 className="section-title">All PAMM funds</h2>
              <div className="table-wrap">
                <table className="table kpi-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>AUM</th>
                      <th>Investors</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funds.map((f) => (
                      <tr key={f.id}>
                        <td><strong>{f.name}</strong></td>
                        <td>{f.fundType || '—'}</td>
                        <td>{formatCurrency(f.aum)}</td>
                        <td>{f.investors ?? 0}</td>
                        <td>
                          <span className={`status-badge status-${(f.approvalStatus || 'pending') === 'approved' ? 'approved' : 'pending'}`}>
                            {f.approvalStatus || 'pending'}
                          </span>
                        </td>
                        <td>
                          <Link to={`/pamm-ai/fund/${f.id}`} className="btn-link btn-sm" target="_blank" rel="noopener noreferrer">View</Link>
                          {' '}
                          <button type="button" className="btn-link btn-sm" onClick={() => setEditFund(f)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {createOpen && (
        <CreateFundModal
          onClose={() => { setCreateOpen(false); setFormError(''); }}
          onSuccess={() => { setCreateOpen(false); setFormError(''); loadFunds(); }}
          saving={saving}
          setSaving={setSaving}
          formError={formError}
          setFormError={setFormError}
        />
      )}

      {editFund && (
        <EditFundModal
          fund={editFund}
          onClose={() => setEditFund(null)}
          onSuccess={() => { setEditFund(null); loadFunds(); }}
          formError={formError}
          setFormError={setFormError}
        />
      )}
    </div>
  );
}

function CreateFundModal({ onClose, onSuccess, saving, setSaving, formError, setFormError }) {
  const [managerEmail, setManagerEmail] = useState('');
  const [name, setName] = useState('BULL RUN');
  const [fundType, setFundType] = useState('ai');
  const [strategy, setStrategy] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('approved');
  const [currentDeposit, setCurrentDeposit] = useState('0');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const email = managerEmail.trim().toLowerCase();
    if (!email) {
      setFormError('Manager email is required');
      return;
    }
    setSaving(true);
    try {
      await adminApi.createPammFund({
        managerEmail: email,
        name: name.trim() || 'BULL RUN',
        fundType: fundType.trim() || 'ai',
        strategy: strategy.trim(),
        approvalStatus,
        currentDeposit: Number(currentDeposit) || 0,
      });
      onSuccess();
    } catch (err) {
      setFormError(err.message || 'Failed to create fund');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay admin-modal" onClick={onClose}>
      <div className="modal-content modal-content--form" onClick={(e) => e.stopPropagation()}>
        <h3>Create BULL RUN fund</h3>
        <p className="muted">Assign a manager (user) by email. A PAMM trading account will be created. Optionally set an initial deposit (deducted from manager wallet).</p>
        <form onSubmit={handleSubmit}>
          <div className="filter-group">
            <label>Manager email *</label>
            <input
              type="email"
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
              className="filter-input"
              placeholder="e.g. manager@example.com"
              required
            />
          </div>
          <div className="filter-group">
            <label>Fund name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="filter-input"
              placeholder="BULL RUN"
            />
          </div>
          <div className="filter-group">
            <label>Fund type</label>
            <input
              type="text"
              value={fundType}
              onChange={(e) => setFundType(e.target.value)}
              className="filter-input"
              placeholder="ai"
            />
          </div>
          <div className="filter-group">
            <label>Strategy (optional)</label>
            <input
              type="text"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="filter-input"
              placeholder="AI Bull Run"
            />
          </div>
          <div className="filter-group">
            <label>Initial deposit (USD, optional)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={currentDeposit}
              onChange={(e) => setCurrentDeposit(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="filter-group">
            <label>Approval status</label>
            <select
              value={approvalStatus}
              onChange={(e) => setApprovalStatus(e.target.value)}
              className="filter-select"
            >
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create fund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditFundModal({ fund, onClose, onSuccess, formError, setFormError }) {
  const [name, setName] = useState(fund?.name || '');
  const [isPublic, setIsPublic] = useState(fund?.isPublic !== false);
  const [approvalStatus, setApprovalStatus] = useState(fund?.approvalStatus || 'pending');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await adminApi.updatePammFund(fund.id, {
        name: name.trim() || fund.name,
        isPublic,
        approvalStatus,
      });
      onSuccess();
    } catch (err) {
      setFormError(err.message || 'Failed to update fund');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay admin-modal" onClick={onClose}>
      <div className="modal-content modal-content--form" onClick={(e) => e.stopPropagation()}>
        <h3>Edit fund</h3>
        <form onSubmit={handleSubmit}>
          <div className="filter-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="filter-input"
            />
          </div>
          <label className="settings-toggle">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>Public (visible to investors)</span>
          </label>
          <div className="filter-group">
            <label>Approval status</label>
            <select
              value={approvalStatus}
              onChange={(e) => setApprovalStatus(e.target.value)}
              className="filter-select"
            >
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
