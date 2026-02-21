import React from 'react';

export default function AdminBroadcast() {
  return (
    <div className="page admin-page">
      <header className="page-header">
        <h1>Broadcast</h1>
        <p className="page-subtitle">Send campaign messages to clients</p>
      </header>
      <section className="page-content">
        <div className="section-block">
          <p className="muted">Create and send broadcast emails or in-app messages.</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }}>New broadcast</button>
        </div>
      </section>
    </div>
  );
}
