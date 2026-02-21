import React from 'react';

export default function AdminTickets() {
  return (
    <div className="page admin-page">
      <header className="page-header">
        <h1>Tickets</h1>
        <p className="page-subtitle">Support and compliance tickets</p>
      </header>
      <section className="page-content">
        <div className="section-block">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} className="empty-cell">No tickets</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
