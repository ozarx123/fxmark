import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPammManagers as initialManagers,
  adminPammAllocations,
  adminPammDefaults as initialDefaults,
  PAMM_MANAGER_STATUSES,
} from './adminPammMockData';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const formatPercent = (n) => (n != null ? `${Number(n).toFixed(1)}%` : '—');

export default function AdminPamm() {
  const [managers, setManagers] = useState(initialManagers);
  const [defaults, setDefaults] = useState(initialDefaults);
  const [statusFilter, setStatusFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [feeEditId, setFeeEditId] = useState(null);
  const [editPerfFee, setEditPerfFee] = useState('');
  const [editMgmtFee, setEditMgmtFee] = useState('');

  const filteredManagers = useMemo(() => {
    return managers.filter((m) => {
      if (statusFilter && m.status !== statusFilter) return false;
      return true;
    });
  }, [managers, statusFilter]);

  const filteredAllocations = useMemo(() => {
    return adminPammAllocations.filter((a) => {
      if (managerFilter && a.managerId !== Number(managerFilter)) return false;
      return true;
    });
  }, [managerFilter]);

  const totalAum = managers.reduce((s, m) => s + (m.aum || 0), 0);
  const totalInvestors = managers.reduce((s, m) => s + (m.investors || 0), 0);

  const handleStatusChange = (manager, newStatus) => {
    setManagers((prev) =>
      prev.map((m) => (m.id === manager.id ? { ...m, status: newStatus } : m))
    );
  };

  const openFeeEdit = (m) => {
    setFeeEditId(m.id);
    setEditPerfFee(String(m.performanceFeePercent));
    setEditMgmtFee(String(m.managementFeePercent));
  };

  const saveFeeEdit = () => {
    if (!feeEditId) return;
    const perf = parseFloat(editPerfFee);
    const mgmt = parseFloat(editMgmtFee);
    setManagers((prev) =>
      prev.map((m) =>
        m.id === feeEditId
          ? {
              ...m,
              performanceFeePercent: isNaN(perf) ? m.performanceFeePercent : perf,
              managementFeePercent: isNaN(mgmt) ? m.managementFeePercent : mgmt,
            }
          : m
      )
    );
    setFeeEditId(null);
    setEditPerfFee('');
    setEditMgmtFee('');
  };

  const cancelFeeEdit = () => {
    setFeeEditId(null);
    setEditPerfFee('');
    setEditMgmtFee('');
  };

  const saveDefaults = () => {
    // In real app: API call
    alert('Default PAMM settings saved (mock).');
  };

  return (
    <div className="page admin-page admin-pamm">
      <header className="page-header">
        <h1>PAMM management</h1>
        <p className="page-subtitle">Manage PAMM managers, allocations, fees and defaults</p>
      </header>

      {/* Summary */}
      <section className="admin-section-block">
        <div className="admin-pamm-summary">
          <div className="admin-pamm-stat">
            <span className="admin-pamm-stat-value">{managers.length}</span>
            <span className="admin-pamm-stat-label">Managers</span>
          </div>
          <div className="admin-pamm-stat">
            <span className="admin-pamm-stat-value">{formatCurrency(totalAum)}</span>
            <span className="admin-pamm-stat-label">Total AUM</span>
          </div>
          <div className="admin-pamm-stat">
            <span className="admin-pamm-stat-value">{totalInvestors}</span>
            <span className="admin-pamm-stat-label">Investors</span>
          </div>
        </div>
      </section>

      {/* Managers table */}
      <section className="admin-section-block">
        <h2 className="section-title">PAMM managers</h2>
        <div className="filter-group" style={{ marginBottom: '1rem' }}>
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
                <th>Manager</th>
                <th>Status</th>
                <th>AUM</th>
                <th>Investors</th>
                <th>Performance fee</th>
                <th>Mgmt fee</th>
                <th>P&L %</th>
                <th>Risk</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredManagers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    <br />
                    <span className="muted">{m.email}</span>
                  </td>
                  <td>
                    <span className={`admin-pamm-status admin-pamm-status-${m.status}`}>
                      {m.status === 'active' ? 'Active' : m.status === 'suspended' ? 'Suspended' : 'Pending'}
                    </span>
                  </td>
                  <td>{formatCurrency(m.aum)}</td>
                  <td>{m.investors}</td>
                  <td>
                    {feeEditId === m.id ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={editPerfFee}
                        onChange={(e) => setEditPerfFee(e.target.value)}
                        className="filter-input"
                        style={{ width: '4rem' }}
                      />
                    ) : (
                      `${m.performanceFeePercent}%`
                    )}
                  </td>
                  <td>
                    {feeEditId === m.id ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={editMgmtFee}
                        onChange={(e) => setEditMgmtFee(e.target.value)}
                        className="filter-input"
                        style={{ width: '4rem' }}
                      />
                    ) : (
                      `${m.managementFeePercent}%`
                    )}
                  </td>
                  <td className={m.pnlPercent >= 0 ? 'positive' : 'negative'}>{formatPercent(m.pnlPercent)}</td>
                  <td>{m.riskProfile}</td>
                  <td>
                    {feeEditId === m.id ? (
                      <span className="row-actions">
                        <button type="button" className="btn-link" onClick={saveFeeEdit}>Save</button>
                        <button type="button" className="btn-link" onClick={cancelFeeEdit}>Cancel</button>
                      </span>
                    ) : (
                      <span className="row-actions">
                        <button type="button" className="btn-link" onClick={() => openFeeEdit(m)}>Edit fees</button>
                        {m.status === 'pending' && (
                          <>
                            <button type="button" className="btn-link btn-approve" onClick={() => handleStatusChange(m, 'active')}>Approve</button>
                            <button type="button" className="btn-link btn-reject" onClick={() => handleStatusChange(m, 'suspended')}>Reject</button>
                          </>
                        )}
                        {m.status === 'active' && (
                          <button type="button" className="btn-link btn-link-danger" onClick={() => handleStatusChange(m, 'suspended')}>Suspend</button>
                        )}
                        {m.status === 'suspended' && (
                          <button type="button" className="btn-link btn-approve" onClick={() => handleStatusChange(m, 'active')}>Activate</button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
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
            {managers.map((m) => (
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
