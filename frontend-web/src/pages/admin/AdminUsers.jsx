import React, { useState, useEffect, useCallback } from 'react';
import { APPROVAL_STATUSES } from './mockUsersData';
import { listUsers, updateUser, addFundsToWallet, getIbProfiles, putClientReferrer } from '../../api/adminApi';
import { useAuth } from '../../context/AuthContext';
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
];

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [addFundsUser, setAddFundsUser] = useState(null);
  const [assignIbUser, setAssignIbUser] = useState(null);
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

  const handleAddFunds = async (formData) => {
    if (!addFundsUser) return;
    setSaving(true);
    try {
      await addFundsToWallet(addFundsUser.id, formData);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === addFundsUser.id ? { ...u, balance: (u.balance ?? 0) + Number(formData.amount) } : u
        )
      );
      setAddFundsUser(null);
    } catch (err) {
      setError(err.message || 'Failed to add funds');
    } finally {
      setSaving(false);
    }
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
              placeholder="Email, name, or account no.…"
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
                <th>Account no.</th>
                <th>User</th>
                <th>Role</th>
                <th>Approval</th>
                <th>Balance</th>
                <th>Referrer</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No users match the filters.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <code className="admin-user-id" title="users.accountNo (not MT/trading account)">
                        {user.accountNo != null && String(user.accountNo).trim() !== '' ? user.accountNo : '—'}
                      </code>
                    </td>
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
                    <td style={{ maxWidth: '12rem', fontSize: '0.85rem' }}>
                      {user.role === 'user' ? (
                        <>
                          <div>
                            {user.referrerId ? (
                              <code className="admin-user-id" title={user.referrerId}>
                                {user.referrerId.length > 12 ? `${user.referrerId.slice(0, 10)}…` : user.referrerId}
                              </code>
                            ) : (
                              <span className="muted">None</span>
                            )}
                            {user.referralSource ? (
                              <span className="muted"> · {user.referralSource}</span>
                            ) : null}
                          </div>
                          <button type="button" className="btn-link" style={{ paddingLeft: 0 }} onClick={() => setAssignIbUser(user)}>
                            Assign IB
                          </button>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn-link" onClick={() => openEdit(user)}>
                          Edit role
                        </button>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => setAddFundsUser(user)}
                            style={{ marginLeft: '0.5rem' }}
                          >
                            Add funds
                          </button>
                        )}
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

      {addFundsUser && (
        <AddFundsModal
          user={addFundsUser}
          onSave={handleAddFunds}
          onClose={() => setAddFundsUser(null)}
          saving={saving}
        />
      )}

      {assignIbUser && (
        <AssignIbModal
          user={assignIbUser}
          onClose={() => setAssignIbUser(null)}
          onSaved={() => {
            setAssignIbUser(null);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

function AssignIbModal({ user, onClose, onSaved }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIbUserId, setSelectedIbUserId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getIbProfiles({ limit: 200 });
        if (!cancelled) setProfiles(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Failed to load IB list');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedIbUserId) {
      setErr('Select an introducing broker');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await putClientReferrer(user.id, selectedIbUserId, { reason: reason.trim() || undefined });
      onSaved();
    } catch (e2) {
      setErr(e2.message || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Assign introducing broker</h3>
        <p className="modal-subtitle muted">
          Client: <strong>{user.email}</strong>
          {user.accountNo != null && String(user.accountNo).trim() !== '' && (
            <>
              {' '}
              · Account no.: <code className="admin-user-id">{user.accountNo}</code>
            </>
          )}
          {' '}
          · Clearing referrer is not allowed — choose a valid IB.
        </p>
        {err && <p className="auth-error" style={{ marginBottom: '0.5rem' }}>{err}</p>}
        {loading ? (
          <p className="muted">Loading IB profiles…</p>
        ) : (
          <form onSubmit={submit}>
            <div className="filter-group">
              <label>IB (user)</label>
              <select
                className="filter-select"
                value={selectedIbUserId}
                onChange={(e) => setSelectedIbUserId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {profiles.map((p) => (
                  <option key={p.userId} value={String(p.userId)}>
                    {p.email || p.userId} · {p.referralCode || 'no code'}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Reason (optional, audit)</label>
              <input
                type="text"
                className="filter-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="e.g. CRM ticket #123"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || profiles.length === 0}>
                {saving ? 'Saving…' : 'Assign'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AddFundsModal({ user, onSave, onClose, saving }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [reference, setReference] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    onSave({ amount: amt, currency, reference: reference.trim() || undefined });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add funds to {user?.email}</h3>
        {user?.accountNo != null && String(user.accountNo).trim() !== '' && (
          <p className="modal-subtitle muted">
            Account no.: <code className="admin-user-id">{user.accountNo}</code>
          </p>
        )}
        <p className="modal-subtitle">
          Current balance: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(user?.balance ?? 0)}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="filter-group">
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="filter-input"
                required
              />
            </div>
            <div className="filter-group">
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="filter-select">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <div className="filter-group" style={{ marginTop: '0.5rem' }}>
            <label>Reference (optional)</label>
            <input
              type="text"
              placeholder="e.g. Bonus, Manual credit"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !amount || parseFloat(amount) <= 0}>
              {saving ? 'Adding…' : 'Add funds'}
            </button>
          </div>
        </form>
      </div>
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
        <p className="modal-subtitle muted" style={{ marginBottom: '1rem' }}>
          Account no. (login):{' '}
          <code className="admin-user-id" title="users.accountNo">
            {user?.accountNo != null && String(user.accountNo).trim() !== '' ? user.accountNo : '—'}
          </code>
        </p>
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
