import React, { useState, useEffect, useCallback } from 'react';
import { APPROVAL_STATUSES } from './mockUsersData';
import { listUsers, updateUser } from '../../api/adminApi';
/** Roles supported by backend (subset for editing) */
const EDITABLE_ROLES = [
  { value: 'user', label: 'User', category: 'client' },
  { value: 'admin', label: 'Admin', category: 'internal' },
  { value: 'superadmin', label: 'Super Admin', category: 'internal' },
  { value: 'support', label: 'Support', category: 'internal' },
  { value: 'finance', label: 'Finance', category: 'internal' },
  { value: 'trader', label: 'Trader', category: 'client' },
  { value: 'master_ib', label: 'Master IB', category: 'ib' },
  { value: 'sub_ib', label: 'Sub IB', category: 'ib' },
  { value: 'pamm_manager', label: 'PAMM Manager', category: 'client' },
];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (roleFilter) params.role = roleFilter;
      if (approvalFilter) params.kycStatus = approvalFilter;
      if (search) params.search = search;
      const data = await listUsers(params);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, approvalFilter, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleApprove = async (user, status) => {
    setSaving(true);
    try {
      await updateUser(user.id, { kycStatus: status });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, approvalStatus: status } : u)));
    } catch (err) {
      setError(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (formData) => {
    if (!editingUser) return;
    setSaving(true);
    try {
      await updateUser(editingUser.id, {
        role: formData.role,
        kycStatus: formData.approvalStatus,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, role: formData.role, approvalStatus: formData.approvalStatus } : u))
      );
      setEditingUser(null);
      setIsFormOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  return (
    <div className="page admin-page admin-users">
      <header className="page-header">
        <h1>Users</h1>
        <p className="page-subtitle">Manage users, roles, and approval status (real data from MongoDB)</p>
      </header>

      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
          <button type="button" className="btn-link" onClick={() => setError('')} style={{ marginLeft: '0.5rem' }}>
            Dismiss
          </button>
        </div>
      )}

      <section className="admin-users-toolbar">
        <div className="users-filters">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input search-input"
            />
          </div>
          <div className="filter-group">
            <label>Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="filter-select">
              <option value="">All roles</option>
              {EDITABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Approval</label>
            <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} className="filter-select">
              <option value="">All</option>
              {APPROVAL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="users-actions">
          <button type="button" className="btn btn-secondary" onClick={loadUsers} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </section>

      <section className="users-table-section">
        <div className="table-wrap">
          <table className="table kpi-table users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Approval</th>
                <th>Balance</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No users match the filters.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <strong>{user.name || user.email?.split('@')[0] || '—'}</strong>
                        <span className="user-email">{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`role-badge role-badge--${EDITABLE_ROLES.find((r) => r.value === user.role)?.category || 'client'}`}
                      >
                        {EDITABLE_ROLES.find((r) => r.value === user.role)?.label || user.role}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-${user.approvalStatus || 'pending'}`}>
                        {APPROVAL_STATUSES.find((s) => s.value === (user.approvalStatus || user.kycStatus))?.label ||
                          user.approvalStatus ||
                          user.kycStatus ||
                          'pending'}
                      </span>
                      {(user.approvalStatus || user.kycStatus) === 'pending' && (
                        <div className="approval-actions">
                          <button
                            type="button"
                            className="btn-link btn-approve"
                            onClick={() => handleApprove(user, 'approved')}
                            disabled={saving}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-link btn-reject"
                            onClick={() => handleApprove(user, 'rejected')}
                            disabled={saving}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{formatCurrency(user.balance ?? 0)}</td>
                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn-link" onClick={() => openEdit(user)}>
                          Edit role
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFormOpen && editingUser && (
        <UserFormModal
          user={editingUser}
          onSave={handleSave}
          onClose={() => {
            setIsFormOpen(false);
            setEditingUser(null);
          }}
          roles={EDITABLE_ROLES}
          approvalStatuses={APPROVAL_STATUSES}
          saving={saving}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, onSave, onClose, roles, approvalStatuses, saving }) {
  const [form, setForm] = useState({
    role: user?.role ?? 'user',
    approvalStatus: user?.approvalStatus ?? user?.kycStatus ?? 'pending',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-modal user-form-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit user: {user?.email}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="filter-group">
              <label>Role</label>
              <select value={form.role} onChange={(e) => update('role', e.target.value)} className="filter-select">
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Approval status</label>
              <select
                value={form.approvalStatus}
                onChange={(e) => update('approvalStatus', e.target.value)}
                className="filter-select"
              >
                {approvalStatuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
