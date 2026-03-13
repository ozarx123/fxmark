import React, { useState, useMemo } from 'react';

const EVENT_TYPES = {
  order: 'Order',
  position: 'Position',
  risk: 'Risk',
  system: 'System',
};

export default function JournalPanel({
  orders = [],
  positions = [],
  journalEntries = [],
  className = '',
}) {
  const [filter, setFilter] = useState('all');
  const [localEntries, setLocalEntries] = useState([]);

  const derivedEvents = useMemo(() => {
    const events = [];
    (orders || []).slice(0, 20).forEach((o) => {
      events.push({
        id: `order-${o.id}`,
        type: 'order',
        time: o.createdAt ? new Date(o.createdAt).toLocaleString() : '',
        message: `${o.side} ${o.volume} ${o.symbol} — ${o.status || 'placed'}`,
        severity: 'info',
      });
    });
    (positions || []).forEach((p) => {
      events.push({
        id: `pos-${p.id}`,
        type: 'position',
        time: p.openedAt ? new Date(p.openedAt).toLocaleString() : '',
        message: `Open ${p.side} ${p.volume} ${p.symbol} @ ${p.openPrice ?? p.open_price ?? '—'}`,
        severity: 'info',
      });
    });
    return events.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  }, [orders, positions]);

  const allEntries = useMemo(() => {
    const fromApi = Array.isArray(journalEntries) ? journalEntries : [];
    const combined = [...fromApi, ...derivedEvents, ...localEntries];
    return combined.slice(0, 100);
  }, [journalEntries, derivedEvents, localEntries]);

  const filtered = filter === 'all'
    ? allEntries
    : allEntries.filter((e) => e.type === filter);

  return (
    <div className={`journal-panel ${className}`}>
      <h3 className="journal-panel__title">Journal</h3>
      <div className="journal-panel__toolbar">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="journal-panel__filter"
        >
          <option value="all">All</option>
          {Object.entries(EVENT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="journal-panel__list">
        {filtered.length === 0 ? (
          <p className="journal-panel__empty">No events yet. Order and position events will appear here.</p>
        ) : (
          filtered.map((e) => (
            <div key={e.id || Math.random()} className={`journal-panel__entry journal-panel__entry--${e.severity || 'info'}`}>
              <span className="journal-panel__entry-time">{e.time}</span>
              <span className="journal-panel__entry-type">{EVENT_TYPES[e.type] || e.type}</span>
              <span className="journal-panel__entry-msg">{e.message || JSON.stringify(e)}</span>
            </div>
          ))
        )}
      </div>
      <p className="journal-panel__muted">Backend journal API integration: optional. Events are derived from orders and positions when not available.</p>
    </div>
  );
}
