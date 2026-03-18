import React, { useState, useEffect, useCallback } from 'react';
import { getAlerts, resolveAlert } from '../../api/adminApi';

const ALERT_TYPE_LABELS = {
  FRAUD_HIGH: 'High fraud risk',
  RECON_MISMATCH: 'Reconciliation mismatch',
  RAPID_WITHDRAWALS: 'Rapid withdrawals',
  REPEATED_FAILED_ATTEMPTS: 'Repeated failed attempts',
};

function formatDate(d) {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toLocaleString();
}

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('false');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      if (typeFilter) params.type = typeFilter;
      if (resolvedFilter === 'true') params.resolved = 'true';
      if (resolvedFilter === 'false') params.resolved = 'false';
      const list = await getAlerts(params);
      setAlerts(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Failed to load alerts');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, resolvedFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (id) => {
    try {
      await resolveAlert(id);
      load();
    } catch (e) {
      setError(e.message || 'Failed to resolve');
    }
  };

  return (
    <div className="page admin-page admin-alerts">
      <header className="page-header">
        <h1>Alerts</h1>
        <p className="page-subtitle">Critical events: fraud, reconciliation, rapid activity</p>
      </header>

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      <section className="alerts-filters">
        <div className="filter-group">
          <label>Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All</option>
            {Object.entries(ALERT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Status</label>
          <select
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All</option>
            <option value="false">Unresolved</option>
            <option value="true">Resolved</option>
          </select>
        </div>
        <button type="button" className="btn btn-secondary" onClick={load}>
          Refresh
        </button>
      </section>

      <section className="alerts-table-section">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Ref</th>
                  <th>Message</th>
                  <th>User</th>
                  <th>Metadata</th>
                  <th>Created</th>
                  <th>Resolved</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={9}>No alerts</td>
                  </tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.id} className={a.resolved ? 'alert-resolved' : ''}>
                      <td><span className="alert-type">{ALERT_TYPE_LABELS[a.type] || a.type}</span></td>
                      <td><span className={`severity-${(a.severity || 'LOW').toLowerCase()}`}>{a.severity || 'LOW'}</span></td>
                      <td><code className="withdrawal-id">{a.referenceId ? String(a.referenceId).slice(-10) : '—'}</code></td>
                      <td>{a.message}</td>
                      <td>{a.userId || '—'}</td>
                      <td><pre className="alert-meta">{JSON.stringify(a.metadata || {}, null, 0).slice(0, 80)}</pre></td>
                      <td>{formatDate(a.createdAt)}</td>
                      <td>{a.resolved ? formatDate(a.resolvedAt) || 'Yes' : '—'}</td>
                      <td>
                        {!a.resolved && (
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            onClick={() => handleResolve(a.id)}
                          >
                            Mark resolved
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
