import React, { useState, useEffect } from 'react';
import { listUsers, updateUser } from '../../api/adminApi';

export default function AdminKyc() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [rejectReason, setRejectReason] = useState({});
  const [actionLoading, setActionLoading] = useState({});

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const params = statusFilter ? { kycStatus: statusFilter } : {};
      const list = await listUsers(params);
      setQueue(list);
    } catch (e) {
      setError(e.message || 'Failed to load users');
      setQueue([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [statusFilter]);

  const setRejectReasonFor = (id, value) => setRejectReason((prev) => ({ ...prev, [id]: value }));

  const handleApprove = async (user) => {
    const id = user.id;
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await updateUser(id, { kycStatus: 'approved' });
      setQueue((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      setError(e.message || 'Failed to approve');
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleReject = async (user) => {
    const id = user.id;
    const reason = rejectReason[id]?.trim() || 'Document verification failed';
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await updateUser(id, { kycStatus: 'rejected', kycRejectedReason: reason });
      setQueue((prev) => prev.filter((u) => u.id !== id));
      setRejectReason((prev) => ({ ...prev, [id]: '' }));
    } catch (e) {
      setError(e.message || 'Failed to reject');
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="page admin-page admin-kyc">
      <header className="page-header">
        <h1>Compliance & KYC</h1>
        <p className="page-subtitle">Review and approve or reject user KYC submissions</p>
      </header>

      <section className="admin-section-block">
        <h2 className="section-title">KYC queue</h2>
        <div className="settings-card">
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
          {error && <p className="form-error">{error}</p>}
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Submitted</th>
                    <th>Rejection reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-cell">No users with this status</td>
                    </tr>
                  ) : (
                    queue.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name || u.email?.split('@')[0] || '—'}</strong>
                          <br />
                          <span className="muted">{u.email}</span>
                        </td>
                        <td>
                          {u.kycSubmittedAt
                            ? new Date(u.kycSubmittedAt).toLocaleString()
                            : '—'}
                        </td>
                        <td>
                          {statusFilter === 'rejected' && u.kycRejectedReason ? (
                            <span className="muted">{u.kycRejectedReason}</span>
                          ) : (u.approvalStatus || u.kycStatus) === 'pending' ? (
                            <input
                              type="text"
                              placeholder="Reason (shown to user if rejected)"
                              value={rejectReason[u.id] ?? ''}
                              onChange={(e) => setRejectReasonFor(u.id, e.target.value)}
                              className="filter-input remarks-input"
                            />
                          ) : '—'}
                        </td>
                        <td>
                          {(u.approvalStatus || u.kycStatus) === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleApprove(u)}
                                disabled={actionLoading[u.id]}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleReject(u)}
                                disabled={actionLoading[u.id]}
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
