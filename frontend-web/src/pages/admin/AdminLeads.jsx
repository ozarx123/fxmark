import React from 'react';

export default function AdminLeads() {
  return (
    <div className="page admin-page">
      <header className="page-header">
        <h1>Leads</h1>
        <p className="page-subtitle">Manage signup and contact leads</p>
      </header>
      <section className="page-content">
        <div className="section-block">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="empty-cell">No leads</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
