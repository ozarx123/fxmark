import React, { useState, useEffect } from 'react';

export default function AdminMarket() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ status: 'error' }));
  }, []);

  return (
    <div className="page admin-page">
      <header className="page-header">
        <h1>Market data</h1>
        <p className="page-subtitle">Provider status and WebSocket connections</p>
      </header>
      <section className="page-content">
        <div className="section-block">
          <h2>Backend status</h2>
          <p className="muted">
            {status?.status === 'ok' ? (
              <span style={{ color: '#2ecc71' }}>Connected</span>
            ) : (
              <span style={{ color: '#e74c3c' }}>Unavailable or not running</span>
            )}
          </p>
        </div>
        <div className="section-block">
          <h2>Provider (Twelve Data)</h2>
          <p className="muted">API key configured on backend. Quote poller: XAUUSD every 15s.</p>
        </div>
      </section>
    </div>
  );
}
