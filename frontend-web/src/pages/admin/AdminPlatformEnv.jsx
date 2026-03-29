import React, { useState, useEffect, useCallback } from 'react';
import { getPlatformEnv, putPlatformEnv } from '../../api/adminApi';

export default function AdminPlatformEnv() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await getPlatformEnv();
      setData(res);
      setDrafts({});
    } catch (e) {
      setError(e.message || 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveKey = async (key, value) => {
    setSavingKey(key);
    setError('');
    try {
      await putPlatformEnv(key, value);
      await load();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSavingKey(null);
    }
  };

  const renderRow = (row) => {
    const draft = drafts[row.key] !== undefined ? drafts[row.key] : '';
    return (
      <tr key={row.key}>
        <td>
          <code style={{ fontSize: '0.85em' }}>{row.key}</code>
          {row.hasDatabaseOverride && (
            <span className="muted" style={{ marginLeft: '0.35rem', fontSize: '0.75rem' }}>
              DB
            </span>
          )}
        </td>
        <td>
          <span className="muted" style={{ fontSize: '0.85rem' }} title="Masked effective value">
            {row.maskedEffective || '—'}
          </span>
        </td>
        <td style={{ minWidth: '14rem' }}>
          <input
            type="password"
            autoComplete="off"
            className="filter-input"
            style={{ width: '100%' }}
            placeholder={row.hasDatabaseOverride ? 'New value or Clear' : 'Value from .env or set here'}
            value={draft}
            onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
          />
        </td>
        <td style={{ fontSize: '0.8rem', color: 'var(--muted, #888)' }}>
          {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
        </td>
        <td>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={savingKey === row.key || (String(draft).trim() === '' && !row.hasDatabaseOverride)}
            onClick={() => saveKey(row.key, draft)}
            title={
              row.hasDatabaseOverride && String(draft).trim() === ''
                ? 'Remove database override (restart may be needed to restore a value from backend/.env)'
                : undefined
            }
          >
            {savingKey === row.key
              ? 'Saving…'
              : row.hasDatabaseOverride && String(draft).trim() === ''
                ? 'Remove override'
                : 'Save'}
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="page admin-page admin-platform-env">
      <header className="page-header">
        <h1>Environment manager</h1>
        <p className="page-subtitle">
          Super Admin — store API keys and URLs in MongoDB; they override <code>backend/.env</code> for matching names after
          Mongo connects. Restart the server for values read only at cold start.
        </p>
      </header>

      {error && (
        <div className="admin-error" style={{ marginBottom: '1rem' }}>
          {error}
          <button type="button" className="btn-link" style={{ marginLeft: '0.5rem' }} onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : data ? (
        <>
          <section className="admin-section-block">
            <div className="settings-card" style={{ marginBottom: '1rem' }}>
              <p className="muted" style={{ marginBottom: '0.5rem' }}>
                {data.notes?.mergeOrder}
              </p>
              <p className="muted" style={{ marginBottom: '0.5rem' }}>
                {data.notes?.bootstrap}
              </p>
              <p className="muted">{data.notes?.hotUpdate}</p>
            </div>
            <h2 className="section-title">Common keys</h2>
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Effective (masked)</th>
                    <th>New value</th>
                    <th>DB updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>{data.curated?.map(renderRow)}</tbody>
              </table>
            </div>
          </section>

          {data.extra?.length > 0 && (
            <section className="admin-section-block">
              <h2 className="section-title">Additional keys in database</h2>
              <div className="table-wrap">
                <table className="table kpi-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Effective (masked)</th>
                      <th>New value</th>
                      <th>DB updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{data.extra.map(renderRow)}</tbody>
                </table>
              </div>
            </section>
          )}

          <section className="admin-section-block">
            <h2 className="section-title">Custom key</h2>
            <div className="settings-card">
              <p className="muted" style={{ marginBottom: '0.75rem' }}>
                UPPER_SNAKE_CASE only (e.g. <code>MY_VENDOR_API_KEY</code>). Cannot store Mongo connection strings here.
              </p>
              <div className="settings-row">
                <div className="filter-group">
                  <label>Key</label>
                  <input
                    className="filter-input"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    placeholder="KEY_NAME"
                  />
                </div>
                <div className="filter-group" style={{ flex: 1 }}>
                  <label>Value</label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="filter-input"
                    style={{ width: '100%' }}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '0.75rem' }}
                disabled={!customKey.trim() || savingKey === '__custom__'}
                onClick={async () => {
                  setSavingKey('__custom__');
                  setError('');
                  try {
                    await putPlatformEnv(customKey.trim(), customValue);
                    setCustomKey('');
                    setCustomValue('');
                    await load();
                  } catch (e) {
                    setError(e.message || 'Failed');
                  } finally {
                    setSavingKey(null);
                  }
                }}
              >
                {savingKey === '__custom__' ? 'Saving…' : 'Save custom key'}
              </button>
            </div>
          </section>

          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
        </>
      ) : null}
    </div>
  );
}
