import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithAuth } from '../../api/adminApi.js';

const SOURCES = [
  { value: 'feed',   label: 'Twelve Data Feed' },
  { value: 'market', label: 'Market Ticks' },
];

const FEED_EVENTS = ['', 'tick', 'error', 'candles', 'poller_start'];
const SYMBOLS     = ['', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
const LIMITS      = [50, 100, 200, 500];

function fmt(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function latencyBadge(ms) {
  if (ms == null) return null;
  const color = ms < 300 ? '#22c55e' : ms < 800 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{ color, fontFamily: 'monospace', fontSize: '0.78rem' }}>
      {ms}ms
    </span>
  );
}

function EventBadge({ event }) {
  const map = {
    tick:         { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
    error:        { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    candles:      { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    poller_start: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
    poller_stop:  { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  };
  const s = map[event] || { bg: 'rgba(255,255,255,0.1)', color: '#94a3b8' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '0.1rem 0.45rem', borderRadius: 4,
      fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {event || '—'}
    </span>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: '0.9rem 1.1rem', minWidth: 130, flex: '1 1 130px',
    }}>
      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: color || '#fff' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function AdminLogs() {
  const [source,   setSource]   = useState('feed');
  const [symbol,   setSymbol]   = useState('');
  const [event,    setEvent]    = useState('');
  const [limit,    setLimit]    = useState(100);
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');
  const [entries,  setEntries]  = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [files,    setFiles]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ source, limit });
      if (symbol) params.set('symbol', symbol);
      if (event)  params.set('event',  event);
      if (from)   params.set('from',   new Date(from).toISOString());
      if (to)     params.set('to',     new Date(to).toISOString());

      const res = await fetchWithAuth(`/admin/logs?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || res.statusText);
      }
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [source, symbol, event, limit, from, to]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/admin/logs/summary');
      if (res.ok) setSummary(await res.json());
    } catch { /* non-critical */ }
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/admin/logs/files');
      if (res.ok) {
        const d = await res.json();
        setFiles(d.files || []);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchSummary();
    fetchFiles();
  }, [fetchLogs, fetchSummary, fetchFiles]);

  // Auto-refresh every 5 s
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        fetchLogs();
        fetchSummary();
      }, 5000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchLogs, fetchSummary]);

  const feed = summary?.feed;

  return (
    <div className="page admin-page">
      <header className="page-header">
        <h1>Feed Logs</h1>
        <p className="page-subtitle">Twelve Data API ticks, latency, errors and credit usage in real time.</p>
      </header>

      {/* ── Summary cards ── */}
      {feed && (
        <section className="admin-section-block" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <SummaryCard label="Recent ticks"    value={feed.recentTicks}    color="#22c55e" />
            <SummaryCard label="Recent errors"   value={feed.recentErrors}   color={feed.recentErrors > 0 ? '#ef4444' : '#22c55e'} />
            <SummaryCard label="Avg latency"     value={feed.avgLatencyMs != null ? `${feed.avgLatencyMs}ms` : '—'} color={feed.avgLatencyMs > 600 ? '#f59e0b' : '#60a5fa'} />
            <SummaryCard label="Credits / min"   value={feed.creditsThisMin} sub="limit 55" color={feed.creditsThisMin > 45 ? '#f59e0b' : '#c084fc'} />
            <SummaryCard label="In memory"       value={feed.totalInMemory}  color="#94a3b8" />
            {feed.lastTick && (
              <SummaryCard label="Last tick"
                value={Number(feed.lastTick.price).toFixed(feed.lastTick.symbol === 'XAUUSD' ? 2 : 4)}
                sub={`${feed.lastTick.symbol} · ${fmt(feed.lastTick.ts)}`}
                color="#fff"
              />
            )}
          </div>
        </section>
      )}

      {/* ── Filters ── */}
      <section className="admin-section-block" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)} className="filter-select">
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            Symbol
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="filter-select">
              {SYMBOLS.map((s) => <option key={s} value={s}>{s || 'All symbols'}</option>)}
            </select>
          </label>

          {source === 'feed' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
              Event
              <select value={event} onChange={(e) => setEvent(e.target.value)} className="filter-select">
                {FEED_EVENTS.map((e) => <option key={e} value={e}>{e || 'All events'}</option>)}
              </select>
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            Limit
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="filter-select">
              {LIMITS.map((l) => <option key={l} value={l}>{l} rows</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            From
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)}
              className="filter-select" style={{ minWidth: 170 }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            To
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)}
              className="filter-select" style={{ minWidth: 170 }} />
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingBottom: 2 }}>
            <button className="btn btn-primary" onClick={fetchLogs} disabled={loading}>
              {loading ? 'Loading…' : 'Fetch'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto (5s)
            </label>
          </div>
        </div>
      </section>

      {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* ── Log table ── */}
      <section className="admin-section-block" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem' }}>
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            {autoRefresh && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#22c55e' }}>● live</span>}
          </h2>
        </div>
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event</th>
                <th>Symbol</th>
                <th>Price</th>
                <th>Latency</th>
                <th>Credits</th>
                <th>Provider ts</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={8} className="empty-cell">
                  {loading ? 'Loading…' : 'No log entries found. Adjust filters or wait for ticks.'}
                </td></tr>
              ) : (
                entries.map((e, i) => (
                  <tr key={i} style={e.event === 'error' ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                    <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {fmt(e.ts)}
                    </td>
                    <td><EventBadge event={e.event} /></td>
                    <td style={{ fontWeight: 600 }}>{e.symbol || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {e.price != null
                        ? Number(e.price).toFixed(e.symbol === 'XAUUSD' ? 2 : 4)
                        : '—'}
                    </td>
                    <td>{latencyBadge(e.latencyMs)}</td>
                    <td style={{ fontFamily: 'monospace', color: '#c084fc' }}>
                      {e.creditsUsed ?? '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                      {e.providerTs ?? e.datetime ?? '—'}
                    </td>
                    <td style={{ color: e.event === 'error' ? '#ef4444' : 'rgba(255,255,255,0.5)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.event === 'error' ? e.error
                        : e.event === 'candles' ? `${e.barsReturned} bars · tf=${e.tf}`
                        : e.event === 'poller_start' ? `${(e.symbols || []).join(',')} · ${e.intervalMs}ms · ${e.creditsPerMin} cr/min`
                        : e.endpoint ?? ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Log files ── */}
      {files.length > 0 && (
        <section className="admin-section-block">
          <h2 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Log files on disk</h2>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr><th>File</th><th>Size</th><th>Last modified</th><th>Download</th></tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.name}>
                    <td style={{ fontFamily: 'monospace' }}>{f.name}</td>
                    <td>{(f.sizeBytes / 1024).toFixed(1)} KB</td>
                    <td>{fmt(f.modified)}</td>
                    <td>
                      <a
                        href={`${import.meta.env.VITE_API_URL || '/api'}/admin/logs/download?file=${encodeURIComponent(f.name)}`}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
                        download={f.name}
                      >
                        ↓ Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
