import React from 'react';

export default function Ib() {
  return (
    <div className="page ib-page">
      <header className="page-header">
        <h1>Introducing Broker</h1>
        <p className="page-subtitle">Commission and payouts</p>
      </header>
      <section className="page-content">
        <div className="cards-row">
          <div className="card">
            <h3>Pending commission</h3>
            <p className="card-value">0.00</p>
            <span className="card-label">USD</span>
          </div>
          <div className="card">
            <h3>Paid out</h3>
            <p className="card-value">0.00</p>
            <span className="card-label">USD</span>
          </div>
          <div className="card">
            <h3>Level</h3>
            <p className="card-value">—</p>
            <span className="card-label">IB level</span>
          </div>
        </div>
        <div className="section-block">
          <h2>Referrals</h2>
          <p className="muted">Clients referred under your IB link.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Joined</th>
                  <th>Commission</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3} className="empty-cell">No referrals yet</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-block">
          <button type="button" className="btn btn-primary">Request payout</button>
        </div>
      </section>
    </div>
  );
}
