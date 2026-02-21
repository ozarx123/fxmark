import React, { useState } from 'react';

const MOCK_QUEUE = [
  { id: 1, userId: 4421, name: 'Mike Wilson', email: 'mike.wilson@example.com', submittedAt: '2025-02-20', docExpiry: '2026-03-15', status: 'Pending', amlFlag: false, remarks: '' },
  { id: 2, userId: 4430, name: 'Sarah Lee', email: 'sarah.lee@example.com', submittedAt: '2025-02-21', docExpiry: '2025-04-01', status: 'Pending', amlFlag: true, remarks: 'High-risk jurisdiction' },
  { id: 3, userId: 4425, name: 'James Brown', email: 'james.b@example.com', submittedAt: '2025-02-19', docExpiry: '2025-12-31', status: 'Pending', amlFlag: false, remarks: '' },
];

const MOCK_EXPIRY_ALERTS = [
  { userId: 4401, name: 'John Doe', docType: 'Passport', expiryDate: '2025-03-01', daysLeft: 8 },
  { userId: 4395, name: 'Anna Smith', docType: 'ID', expiryDate: '2025-03-15', daysLeft: 22 },
];

const MOCK_SUSPICIOUS = [
  { id: 1, userId: 4430, name: 'Sarah Lee', reason: 'High-risk jurisdiction', flaggedAt: '2025-02-21' },
];

export default function AdminKyc() {
  const [remarks, setRemarks] = useState({});
  const [statusFilter, setStatusFilter] = useState('');

  const setRemark = (id, value) => setRemarks((prev) => ({ ...prev, [id]: value }));

  const queue = statusFilter ? MOCK_QUEUE.filter((r) => r.status === statusFilter) : MOCK_QUEUE;

  return (
    <div className="page admin-page admin-kyc">
      <header className="page-header">
        <h1>Compliance & KYC</h1>
        <p className="page-subtitle">KYC approval queue with remarks, document expiry alerts, AML risk flags and suspicious activity</p>
      </header>

      <section className="admin-section-block">
        <h2 className="section-title">Document expiry alerts</h2>
        <div className="settings-card">
          <p className="muted">Documents expiring within 30 days. Review and request renewal.</p>
          <div className="table-wrap">
            <table className="table kpi-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Document</th>
                  <th>Expiry date</th>
                  <th>Days left</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_EXPIRY_ALERTS.map((r) => (
                  <tr key={r.userId}>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.docType}</td>
                    <td>{r.expiryDate}</td>
                    <td><span className={r.daysLeft <= 14 ? 'status-badge status-pending' : ''}>{r.daysLeft} days</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Suspicious activity / AML flags</h2>
        <div className="settings-card">
          <p className="muted">Flagged for review. Resolve or escalate.</p>
          <div className="table-wrap">
            <table className="table kpi-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Reason</th>
                  <th>Flagged</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_SUSPICIOUS.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong> (#{r.userId})</td>
                    <td>{r.reason}</td>
                    <td>{r.flaggedAt}</td>
                    <td><button type="button" className="btn btn-sm btn-secondary">Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">KYC approval queue</h2>
        <div className="settings-card">
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div className="table-wrap">
            <table className="table kpi-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Submitted</th>
                  <th>Doc expiry</th>
                  <th>AML flag</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><br /><span className="muted">{r.email}</span></td>
                    <td>{r.submittedAt}</td>
                    <td>{r.docExpiry}</td>
                    <td>{r.amlFlag ? <span className="status-badge status-rejected">Yes</span> : 'No'}</td>
                    <td>
                      <input
                        type="text"
                        placeholder="Internal remarks..."
                        value={remarks[r.id] ?? r.remarks}
                        onChange={(e) => setRemark(r.id, e.target.value)}
                        className="filter-input remarks-input"
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm btn-primary">Approve</button>
                      <button type="button" className="btn btn-sm btn-secondary">Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
