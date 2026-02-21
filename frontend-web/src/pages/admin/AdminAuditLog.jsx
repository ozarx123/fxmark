import React, { useState } from 'react';

const MOCK_AUDIT_ENTRIES = [
  { id: 1, time: '2025-02-21 14:32:01', user: 'admin@fxmark.com', role: 'Admin', ip: '192.168.1.10', action: 'Withdrawal approval', entity: 'WD-8821', oldValue: 'Pending', newValue: 'Approved', module: 'Financials' },
  { id: 2, time: '2025-02-21 14:28:00', user: 'compliance@fxmark.com', role: 'Compliance Officer', ip: '192.168.1.12', action: 'KYC verified', entity: 'User #4421', oldValue: 'Pending', newValue: 'Approved', module: 'KYC' },
  { id: 3, time: '2025-02-21 14:15:22', user: 'dealer@fxmark.com', role: 'Dealing Desk', ip: '192.168.1.15', action: 'Close position', entity: '10001234 / XAUUSD', oldValue: 'Open', newValue: 'Closed', module: 'Trading Monitor' },
  { id: 4, time: '2025-02-21 13:55:00', user: 'admin@fxmark.com', role: 'Admin', ip: '192.168.1.10', action: 'Routing change', entity: 'Symbol XAUUSD', oldValue: 'A-Book', newValue: 'B-Book', module: 'Liquidity' },
  { id: 5, time: '2025-02-21 13:40:11', user: 'finance@fxmark.com', role: 'Finance Manager', ip: '192.168.1.11', action: 'Deposit approval', entity: 'DEP-9921', oldValue: 'Pending', newValue: 'Credited', module: 'Financials' },
  { id: 6, time: '2025-02-21 12:00:00', user: 'super.admin@fxmark.com', role: 'Super Admin', ip: '10.0.0.1', action: 'User role changed', entity: 'user@example.com', oldValue: 'trader', newValue: 'sub_ib', module: 'Users' },
];

export default function AdminAuditLog() {
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [search, setSearch] = useState('');

  const modules = [...new Set(MOCK_AUDIT_ENTRIES.map((e) => e.module))];
  const filtered = MOCK_AUDIT_ENTRIES.filter((e) => {
    if (moduleFilter && e.module !== moduleFilter) return false;
    if (userFilter && !e.user.toLowerCase().includes(userFilter.toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.action.toLowerCase().includes(q) && !e.entity.toLowerCase().includes(q) && !e.oldValue?.toLowerCase().includes(q) && !e.newValue?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="page admin-page admin-audit-log">
      <header className="page-header">
        <h1>Audit & activity logs</h1>
        <p className="page-subtitle">Track admin actions: who, when, IP, old value → new value. Deposit/withdraw approvals, routing changes.</p>
      </header>

      <section className="admin-section-block">
        <div className="settings-card">
          <div className="audit-filters">
            <div className="filter-group">
              <label>Module</label>
              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="filter-select">
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>User</label>
              <input type="text" placeholder="User email..." value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="filter-input" />
            </div>
            <div className="filter-group">
              <label>Search</label>
              <input type="text" placeholder="Action or entity..." value={search} onChange={(e) => setSearch(e.target.value)} className="filter-input" />
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <div className="table-wrap">
          <table className="table kpi-table audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Role</th>
                <th>IP</th>
                <th>Module</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Old → New</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="audit-time">{e.time}</td>
                  <td>{e.user}</td>
                  <td><span className="role-badge role-badge--internal">{e.role}</span></td>
                  <td><code>{e.ip}</code></td>
                  <td>{e.module}</td>
                  <td><strong>{e.action}</strong></td>
                  <td>{e.entity}</td>
                  <td className="audit-change">{e.oldValue} → {e.newValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
