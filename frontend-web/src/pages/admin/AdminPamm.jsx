import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPammAllocations,
  adminPammDefaults as initialDefaults,
  PAMM_MANAGER_STATUSES,
} from './adminPammMockData';
import { listPammManagers, approvePammManager } from '../../api/adminApi';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const formatPercent = (n) => (n != null ? `${Number(n).toFixed(1)}%` : '—');

export default function AdminPamm() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [defaults, setDefaults] = useState(initialDefaults);
  const [approvalFilter, setApprovalFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [approvingId, setApprovingId] = useState(null);

  const loadManagers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (approvalFilter) params.approvalStatus = approvalFilter;
      const data = await listPammManagers(params);
      setManagers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load PAMM managers');
      setManagers([]);
    } finally {
      setLoading(false);
    }
  }, [approvalFilter]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

  const filteredManagers = useMemo(() => {
    return managers.filter((m) => {
      if (approvalFilter && (m.approvalStatus || 'pending') !== approvalFilter) return false;
      return true;
    });
  }, [managers, approvalFilter]);

  const filteredAllocations = useMemo(() => {
    return adminPammAllocations.filter((a) => {
      if (managerFilter && a.managerId !== managerFilter) return false;
      return true;
    });
  }, [managerFilter]);

  const handleApprove = async (manager, approvalStatus) => {
    setApprovingId(manager.id);
    try {
      await approvePammManager(manager.id, approvalStatus);
      setManagers((prev) =>
        prev.map((m) => (m.id === manager.id ? { ...m, approvalStatus } : m))
      );
    } catch (err) {
      setError(err.message || 'Failed to update');
    } finally {
      setApprovingId(null);
    }
  };

  const saveDefaults = () => {
    alert('Default PAMM settings saved (mock).');
  };

  return (
    <div className="page admin-page admin-pamm">
      <header className="page-header">
        <h1>PAMM management</h1>
        <p className="page-subtitle">Approve PAMM funds, manage managers and allocations</p>
      </header>

      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
          <button type="button" className="btn-link" onClick={() => setError('')} style={{ marginLeft: '0.5rem' }}>Dismiss</button>
        </div>
      )}

      {/* Summary */}
      <section className="admin-section-block">
        <div className="admin-pamm-summary">
          <div className="admin-pamm-stat">
            <span className="admin-pamm-stat-value">{managers.length}</span>
            <span className="admin-pamm-stat-label">Managers</span>
          </div>
          <div className="admin-pamm-stat">
            <span className="admin-pamm-stat-value">{managers.filter((m) => (m.approvalStatus || 'pending') === 'pending').length}</span>
            <span className="admin-pamm-stat-label">Pending approval</span>
          </div>
          <div className="admin-pamm-stat">
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadManagers} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {/* Managers table */}
      <section className="admin-section-block">
        <h2 className="section-title">PAMM managers</h2>
        <div className="filter-group" style={{ marginBottom: '1rem' }}>
          <label>Approval status</label>
          <select
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All</option>
            {PAMM_MANAGER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="table admin-pamm-table">
            <thead>
              <tr>
                <th>Fund</th>
                <th>User ID</th>
                <th>Approval</th>
                <th>Performance fee</th>
                <th>Type</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-cell">Loading…</td></tr>
              ) : filteredManagers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    {managers.length === 0
                      ? 'No PAMM managers yet. Create a fund in PAMM Manager (as a user), or run: npm run seed-pamm'
                      : 'No managers match the filter.'}
                  </td>
                </tr>
              ) : (
                filteredManagers.map((m) => {
                  const status = m.approvalStatus || 'pending';
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                        {m.strategy && <br />}
                        {m.strategy && <span className="muted">{m.strategy.slice(0, 50)}{m.strategy.length > 50 ? '…' : ''}</span>}
                      </td>
                      <td><span className="muted">{m.userId}</span></td>
                      <td>
                        <span className={`admin-pamm-status admin-pamm-status-${status === 'approved' ? 'active' : status === 'rejected' ? 'suspended' : 'pending'}`}>
                          {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'}
                        </span>
                      </td>
                      <td>{m.performanceFeePercent ?? 0}%</td>
                      <td>{m.fundType || '—'}</td>
                      <td>{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}</td>
                      <td>
                        {status === 'pending' && (
                          <span className="row-actions">
                            <button
                              type="button"
                              className="btn-link btn-approve"
                              onClick={() => handleApprove(m, 'approved')}
                              disabled={approvingId === m.id}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-link btn-reject"
                              onClick={() => handleApprove(m, 'rejected')}
                              disabled={approvingId === m.id}
                            >
                              Reject
                            </button>
                          </span>
                        )}
                        {status === 'approved' && (
                          <button
                            type="button"
                            className="btn-link btn-link-danger"
                            onClick={() => handleApprove(m, 'rejected')}
                            disabled={approvingId === m.id}
                          >
                            Reject
                          </button>
                        )}
                        {status === 'rejected' && (
                          <button
                            type="button"
                            className="btn-link btn-approve"
                            onClick={() => handleApprove(m, 'approved')}
                            disabled={approvingId === m.id}
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Allocations */}
      <section className="admin-section-block">
        <h2 className="section-title">Allocations</h2>
        <div className="filter-group" style={{ marginBottom: '1rem' }}>
          <label>Manager</label>
          <select
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All managers</option>
            {managers.filter((m) => (m.approvalStatus || 'pending') === 'approved').map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="table admin-pamm-table">
            <thead>
              <tr>
                <th>Manager</th>
                <th>Investor</th>
                <th>Amount</th>
                <th>Share %</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAllocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.managerName}</td>
                  <td>{a.investorEmail}</td>
                  <td>{formatCurrency(a.amount)}</td>
                  <td>{a.sharePercent}%</td>
                  <td>{a.joinedAt}</td>
                  <td><span className="admin-pamm-status admin-pamm-status-active">{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Defaults & options */}
      <section className="admin-section-block">
        <h2 className="section-title">Default options</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>Default fee and allocation limits for new PAMM managers. Full PAMM feature flags are in Settings.</p>
        <div className="settings-card">
          <div className="settings-row">
            <div className="filter-group">
              <label>Default performance fee (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={defaults.defaultPerformanceFeePercent}
                onChange={(e) => setDefaults((d) => ({ ...d, defaultPerformanceFeePercent: parseFloat(e.target.value) || 0 }))}
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label>Default management fee (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={defaults.defaultManagementFeePercent}
                onChange={(e) => setDefaults((d) => ({ ...d, defaultManagementFeePercent: parseFloat(e.target.value) || 0 }))}
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label>Min allocation (USD)</label>
              <input
                type="number"
                min={0}
                value={defaults.minAllocationUsd}
                onChange={(e) => setDefaults((d) => ({ ...d, minAllocationUsd: parseInt(e.target.value, 10) || 0 }))}
                className="filter-input"
              />
            </div>
          </div>
          <div className="settings-actions">
            <button type="button" className="btn btn-primary" onClick={saveDefaults}>Save defaults</button>
          </div>
        </div>
        <p style={{ marginTop: '1rem' }}>
          <Link to="/admin/settings" className="btn-link">→ PAMM feature flags &amp; kill switch (Settings)</Link>
        </p>
      </section>
    </div>
  );
}
