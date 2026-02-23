import React, { useState, useMemo } from 'react';
import { ROLES, APPROVAL_STATUSES, initialUsers } from './mockUsersData';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function AdminUsers() {
  const [users, setUsers] = useState(initialUsers);
  const [roleFilter, setRoleFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (approvalFilter && u.approvalStatus !== approvalFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.email.toLowerCase().includes(q) && !u.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [users, roleFilter, approvalFilter, search]);

  const handleApprove = (user, status) => {
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, approvalStatus: status } : u)));
  };

  const handleSave = (formData) => {
    if (editingUser) {
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...formData } : u))
      );
      setEditingUser(null);
    } else {
      const newUser = {
        id: Math.max(...users.map((u) => u.id), 0) + 1,
        ...formData,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setUsers((prev) => [...prev, newUser]);
    }
    setIsFormOpen(false);
  };

  const handleDelete = (user) => {
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    setDeleteConfirm(null);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const openAdd = () => {
    setEditingUser(null);
    setIsFormOpen(true);
  };

  return (
    <div className="page admin-page admin-users">
      <header className="page-header">
        <h1>Users</h1>
        <p className="page-subtitle">Manage users, roles, approval, balance and trades</p>
      </header>

      {/* Filters and Add */}
      <section className="admin-users-toolbar">
        <div className="users-filters">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input search-input"
            />
          </div>
          <div className="filter-group">
            <label>Role</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Approval</label>
            <select
              value={approvalFilter}
              onChange={(e) => setApprovalFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">All</option>
              {APPROVAL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="users-actions">
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            Add user
          </button>
        </div>
      </section>

      {/* Users table */}
      <section className="users-table-section">
        <div className="table-wrap">
          <table className="table kpi-table users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Approval</th>
                <th>Balance</th>
                <th>No. of trades</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">No users match the filters.</td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <strong>{user.name}</strong>
                        <span className="user-email">{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge role-badge--${ROLES.find((r) => r.value === user.role)?.category || 'client'}`}>{ROLES.find((r) => r.value === user.role)?.label || user.role}</span>
                    </td>
                    <td>
                      <span className={`status-badge status-${user.approvalStatus}`}>
                        {APPROVAL_STATUSES.find((s) => s.value === user.approvalStatus)?.label || user.approvalStatus}
                      </span>
                      {user.approvalStatus === 'pending' && (
                        <div className="approval-actions">
                          <button type="button" className="btn-link btn-approve" onClick={() => handleApprove(user, 'approved')}>Approve</button>
                          <button type="button" className="btn-link btn-reject" onClick={() => handleApprove(user, 'rejected')}>Reject</button>
                        </div>
                      )}
                    </td>
                    <td>{formatCurrency(user.balance)}</td>
                    <td>{user.numberOfTrades}</td>
                    <td>{user.createdAt}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn-link" onClick={() => openEdit(user)}>Edit</button>
                        <button type="button" className="btn-link btn-link-danger" onClick={() => setDeleteConfirm(user)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add/Edit modal */}
      {isFormOpen && (
        <UserFormModal
          user={editingUser}
          onSave={handleSave}
          onClose={() => { setIsFormOpen(false); setEditingUser(null); }}
          roles={ROLES}
          approvalStatuses={APPROVAL_STATUSES}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete user"
        message="Are you sure you want to delete this user? This action cannot be undone."
        referenceDetails={deleteConfirm ? [
          { label: 'Name', value: deleteConfirm.name },
          { label: 'Email', value: deleteConfirm.email },
          { label: 'ID', value: String(deleteConfirm.id) },
        ] : []}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => handleDelete(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

function UserFormModal({ user, onSave, onClose, roles, approvalStatuses }) {
  const [form, setForm] = useState({
    email: user?.email ?? '',
    name: user?.name ?? '',
    role: user?.role ?? 'trader',
    approvalStatus: user?.approvalStatus ?? 'pending',
    balance: user?.balance ?? 0,
    numberOfTrades: user?.numberOfTrades ?? 0,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-modal user-form-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{user ? 'Edit user' : 'Add user'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="filter-group">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="filter-input"
                required
                disabled={!!user}
              />
            </div>
            <div className="filter-group">
              <label>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className="filter-input"
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="filter-group">
              <label>Role</label>
              <select value={form.role} onChange={(e) => update('role', e.target.value)} className="filter-select">
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Approval status</label>
              <select value={form.approvalStatus} onChange={(e) => update('approvalStatus', e.target.value)} className="filter-select">
                {approvalStatuses.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="filter-group">
              <label>Balance (USD)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.balance}
                onChange={(e) => update('balance', Number(e.target.value) || 0)}
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label>No. of trades</label>
              <input
                type="number"
                min={0}
                value={form.numberOfTrades}
                onChange={(e) => update('numberOfTrades', Number(e.target.value) || 0)}
                className="filter-input"
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
