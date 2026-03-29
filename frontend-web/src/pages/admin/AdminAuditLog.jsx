import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { listAdminAuditLogs } from '../../api/adminApi';

function formatTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export default function AdminAuditLog() {
  const [entries, setEntries] = useState([]);
  const [adminPersistedTotal, setAdminPersistedTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminAuditLogs({ limit: 250 });
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setAdminPersistedTotal(data.adminPersistedTotal != null ? data.adminPersistedTotal : null);
    } catch (e) {
      setError(e?.message || 'Failed to load');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modules = useMemo(() => [...new Set(entries.map((e) => e.module).filter(Boolean))].sort(), [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (moduleFilter && e.module !== moduleFilter) return false;
      if (userFilter && !String(e.user || '').toLowerCase().includes(userFilter.toLowerCase())) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [
          e.action,
          e.entity,
          e.oldValue,
          e.newValue,
          e.module,
          e.source,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, moduleFilter, userFilter, search]);

  return (
    <div className="page admin-page admin-audit-log">
      <header className="page-header">
        <h1>Audit & activity logs</h1>
        <p className="page-subtitle">
          Admin actions stored in the database (who, when, IP where available, change summary). Execution mode /
          hybrid rule changes are included from the broker settings history.
        </p>
        {adminPersistedTotal != null && (
          <p className="muted" style={{ marginTop: '0.35rem', fontSize: '0.9rem' }}>
            Persisted admin events in DB: {adminPersistedTotal}. Showing up to {entries.length} merged rows (newest
            first).
          </p>
        )}
      </header>

      <section className="admin-section-block">
        <div className="settings-card">
          <div className="audit-filters" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div className="filter-group">
              <label>Module</label>
              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="filter-select">
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>User</label>
              <input
                type="text"
                placeholder="Admin email…"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label>Search</label>
              <input
                type="text"
                placeholder="Action, entity, values…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input"
              />
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => load()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <section className="admin-section-block">
          <p className="negative" role="alert">
            {error}
          </p>
        </section>
      )}

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
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    No rows match filters, or no audit data yet. New actions are recorded as admins use the panel.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={`${e.id}-${e.time}`}>
                    <td className="audit-time">{formatTime(e.time)}</td>
                    <td>{e.user}</td>
                    <td>
                      <span className="role-badge role-badge--internal">{e.role}</span>
                    </td>
                    <td>
                      <code>{e.ip || '—'}</code>
                    </td>
                    <td>{e.module}</td>
                    <td>
                      <strong title={e.source ? `source: ${e.source}` : undefined}>{e.action}</strong>
                    </td>
                    <td className="audit-entity-cell">{e.entity}</td>
                    <td className="audit-change audit-change-cell">
                      <span className="audit-old">{String(e.oldValue ?? '—')}</span>
                      <span className="audit-arrow"> → </span>
                      <span className="audit-new">{String(e.newValue ?? '—')}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
