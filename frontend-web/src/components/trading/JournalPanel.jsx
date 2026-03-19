import React, { useState, useMemo, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'fxmark_journal_notes';

const EVENT_TYPES = {
  order: 'Order',
  position: 'Position',
  risk: 'Risk',
  system: 'System',
};

function loadStoredNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function JournalPanel({
  orders = [],
  positions = [],
  history = [],
  journalEntries = [],
  className = '',
}) {
  const [filter, setFilter] = useState('all');
  const [localEntries, setLocalEntries] = useState([]);
  const [notes, setNotes] = useState(loadStoredNotes);
  const [editingNoteId, setEditingNoteId] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (_) { /* ignore */ }
  }, [notes]);

  const setNote = useCallback((entryId, text) => {
    if (!entryId) return;
    setNotes((prev) => {
      const next = { ...prev };
      if (text) next[entryId] = text;
      else delete next[entryId];
      return next;
    });
  }, []);

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

  const historyEvents = useMemo(() => {
    return (history || []).map((h) => ({
      id: h.id ? `hist-${h.id}` : `hist-${h.closedAt}-${(h.symbol || '').replace(/\//g, '')}-${h.side}`,
      type: 'position',
      time: h.closedAt ? new Date(h.closedAt).toLocaleString() : '',
      message: `Closed ${h.side} ${h.volume} ${h.symbol} @ ${h.closePrice ?? '—'} — PnL ${(h.realizedPnl ?? h.pnl) != null ? Number(h.realizedPnl ?? h.pnl).toFixed(2) : '—'}`,
      severity: ((h.realizedPnl ?? h.pnl) != null && (h.realizedPnl ?? h.pnl) >= 0) ? 'success' : 'warning',
      source: 'history',
    }));
  }, [history]);

  const allEntries = useMemo(() => {
    const fromApi = Array.isArray(journalEntries) ? journalEntries : [];
    const combined = [...fromApi, ...derivedEvents, ...historyEvents, ...localEntries];
    return combined
      .sort((a, b) => (b.time || '').localeCompare(a.time || ''))
      .slice(0, 100);
  }, [journalEntries, derivedEvents, historyEvents, localEntries]);

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
          filtered.map((e, i) => {
            const entryId = e.id;
            const note = entryId ? notes[entryId] : '';
            const isEditing = editingNoteId === entryId;
            return (
              <div key={e.id || `entry-${i}`} className={`journal-panel__entry journal-panel__entry--${e.severity || 'info'}`}>
                <span className="journal-panel__entry-time">{e.time}</span>
                <span className="journal-panel__entry-type">{EVENT_TYPES[e.type] || e.type}</span>
                <span className="journal-panel__entry-msg">{e.message || JSON.stringify(e)}</span>
                {entryId && (
                  <div className="journal-panel__note">
                    {isEditing ? (
                      <>
                        <textarea
                          className="journal-panel__note-input"
                          value={note || ''}
                          onChange={(ev) => setNote(entryId, ev.target.value)}
                          onBlur={() => setEditingNoteId(null)}
                          placeholder="Add a note..."
                          rows={2}
                          autoFocus
                        />
                        <button type="button" className="journal-panel__note-save" onClick={() => setEditingNoteId(null)}>Done</button>
                      </>
                    ) : (
                      <>
                        {note ? <p className="journal-panel__note-text">{note}</p> : null}
                        <button type="button" className="journal-panel__note-add" onClick={() => setEditingNoteId(entryId)}>
                          {note ? 'Edit note' : 'Add note'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <p className="journal-panel__muted">Notes are stored locally (browser). Journal links to trade history. Backend journal API optional.</p>
    </div>
  );
}
