import React, { useState, useMemo } from 'react';
import { ROLES } from './mockUsersData';
import { PERMISSION_GROUPS, getDefaultRolePermissions } from './mockPermissionsData';
import {
  PAMM_FLAG_SCOPES,
  PAMM_FLAGS_INVESTOR_VIEW,
  PAMM_FLAGS_INVESTOR_ACTIONS,
  PAMM_FLAGS_MANAGER_RISK,
  PAMM_FLAGS_ADMIN,
  getDefaultPammFlags,
} from './pammFeatureFlagsData';

export default function AdminSettings() {
  const [timezone, setTimezone] = useState('UTC');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [companyName, setCompanyName] = useState('FXMARK');
  const [supportEmail, setSupportEmail] = useState('support@fxmark.com');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [defaultLeverage, setDefaultLeverage] = useState(100);
  const [minLotSize, setMinLotSize] = useState(0.01);
  const [maxLotSize, setMaxLotSize] = useState(100);
  const [minWithdrawal, setMinWithdrawal] = useState(50);
  const [maxWithdrawalPerDay, setMaxWithdrawalPerDay] = useState(50000);
  const [approvalAboveAmount, setApprovalAboveAmount] = useState(10000);
  const [defaultPaymentGateway, setDefaultPaymentGateway] = useState('stripe');
  const [minDeposit, setMinDeposit] = useState(20);
  const [maxDeposit, setMaxDeposit] = useState(100000);
  const [depositFeeType, setDepositFeeType] = useState('none');
  const [depositFeeValue, setDepositFeeValue] = useState(0);
  const [withdrawalFeeType, setWithdrawalFeeType] = useState('fixed');
  const [withdrawalFeeValue, setWithdrawalFeeValue] = useState(25);
  const [settlementDays, setSettlementDays] = useState(1);
  const [requireKycBeforeTrading, setRequireKycBeforeTrading] = useState(true);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
  const [require2FAAdmin, setRequire2FAAdmin] = useState(false);
  const [passwordMinLength, setPasswordMinLength] = useState(8);
  const [automationMode, setAutomationMode] = useState('AUTO');
  const [autoDepositApproval, setAutoDepositApproval] = useState(false);
  const [autoIbCommission, setAutoIbCommission] = useState(true);
  const [autoRouting, setAutoRouting] = useState(true);
  const [defaultIbCommission, setDefaultIbCommission] = useState(0.5);
  const [maxLeverageDefault, setMaxLeverageDefault] = useState(500);
  const [marginCallLevel, setMarginCallLevel] = useState(80);

  const CRON_SCHEDULES = [
    { value: 'off', label: 'Disabled' },
    { value: '*/15 * * * *', label: 'Every 15 minutes' },
    { value: '0 * * * *', label: 'Every hour' },
    { value: '0 */6 * * *', label: 'Every 6 hours' },
    { value: '0 0 * * *', label: 'Daily at 00:00' },
    { value: '5 0 * * *', label: 'Daily at 00:05' },
    { value: '0 1 * * *', label: 'Daily at 01:00' },
    { value: '0 2 * * *', label: 'Daily at 02:00' },
    { value: '0 8 * * *', label: 'Daily at 08:00' },
  ];

  const [cronJobs, setCronJobs] = useState([
    { id: 'kpi_aggregation', name: 'KPI daily aggregation', description: 'Aggregate leads, FTD, deposits, lots into kpi_daily_summary', schedule: '5 0 * * *', enabled: true, lastRun: '2025-02-21 00:05' },
    { id: 'report_snapshot', name: 'Report snapshot', description: 'Daily snapshot for reports and reconciliation', schedule: '0 1 * * *', enabled: true, lastRun: '2025-02-21 01:00' },
    { id: 'session_cleanup', name: 'Session cleanup', description: 'Expire old sessions and tokens', schedule: '0 */6 * * *', enabled: true, lastRun: '2025-02-21 06:00' },
    { id: 'email_digest', name: 'Email digest', description: 'Send daily summary to admins', schedule: '0 8 * * *', enabled: false, lastRun: '—' },
    { id: 'balance_reconciliation', name: 'Balance reconciliation', description: 'Reconcile client balances with ledger', schedule: '0 2 * * *', enabled: true, lastRun: '2025-02-21 02:00' },
    { id: 'commission_calc', name: 'Commission calculation', description: 'Calculate IB commission for the day', schedule: '5 0 * * *', enabled: true, lastRun: '2025-02-21 00:05' },
  ]);

  const updateCronJob = (id, field, value) => {
    setCronJobs((prev) => prev.map((job) => (job.id === id ? { ...job, [field]: value } : job)));
  };

  const [paymentGateways, setPaymentGateways] = useState([
    { id: 'stripe', name: 'Stripe', type: 'Card', enabled: true, configured: true, testMode: true },
    { id: 'paypal', name: 'PayPal', type: 'E-wallet', enabled: true, configured: true, testMode: false },
    { id: 'bank_transfer', name: 'Bank transfer', type: 'Bank', enabled: true, configured: true, testMode: false },
    { id: 'skrill', name: 'Skrill', type: 'E-wallet', enabled: false, configured: false, testMode: false },
    { id: 'neteller', name: 'Neteller', type: 'E-wallet', enabled: false, configured: false, testMode: false },
  ]);

  const updateGateway = (id, field, value) => {
    setPaymentGateways((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };

  const defaultRolePermissions = useMemo(() => getDefaultRolePermissions(), []);
  const [rolePermissions, setRolePermissions] = useState(() => {
    const o = {};
    ROLES.forEach((r) => { o[r.value] = defaultRolePermissions[r.value] || []; });
    return o;
  });
  const [permissionsRole, setPermissionsRole] = useState('admin');

  const togglePermission = (roleId, permissionId, checked) => {
    setRolePermissions((prev) => {
      const list = prev[roleId] || [];
      const next = checked ? [...list, permissionId] : list.filter((p) => p !== permissionId);
      return { ...prev, [roleId]: next };
    });
  };

  const hasPermission = (roleId, permissionId) => (rolePermissions[roleId] || []).includes(permissionId);

  const resetPermissionsToDefault = () => {
    const o = {};
    ROLES.forEach((r) => { o[r.value] = defaultRolePermissions[r.value] || []; });
    setRolePermissions(o);
  };

  const [pammFlagsScope, setPammFlagsScope] = useState('global');
  const [pammFlags, setPammFlags] = useState(() => getDefaultPammFlags());
  const togglePammFlag = (id, value) => setPammFlags((prev) => ({ ...prev, [id]: value }));
  const resetPammFlags = () => setPammFlags(getDefaultPammFlags());

  return (
    <div className="page admin-page admin-settings">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="page-subtitle">Application and CRM configuration</p>
      </header>

      <section className="admin-section-block">
        <h2 className="section-title">General</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div className="filter-group">
              <label>Default timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="filter-select">
                <option value="UTC">UTC</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Berlin">Europe/Berlin</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Default currency</label>
              <select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} className="filter-select">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />
            <span>Maintenance mode</span>
          </label>
          <p className="muted">When maintenance mode is on, client login may be restricted.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Branding</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div className="filter-group">
              <label>Company name</label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="filter-input" />
            </div>
            <div className="filter-group">
              <label>Support email</label>
              <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className="filter-input" />
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Trading</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div className="filter-group">
              <label>Default leverage</label>
              <select value={defaultLeverage} onChange={(e) => setDefaultLeverage(Number(e.target.value))} className="filter-select">
                <option value={30}>1:30</option>
                <option value={50}>1:50</option>
                <option value={100}>1:100</option>
                <option value={200}>1:200</option>
                <option value={500}>1:500</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Max leverage (default)</label>
              <input type="number" min={1} max={1000} value={maxLeverageDefault} onChange={(e) => setMaxLeverageDefault(Number(e.target.value) || 100)} className="filter-input" />
            </div>
          </div>
          <div className="settings-row">
            <div className="filter-group">
              <label>Min lot size</label>
              <input type="number" min={0.01} step={0.01} value={minLotSize} onChange={(e) => setMinLotSize(Number(e.target.value) || 0.01)} className="filter-input" />
            </div>
            <div className="filter-group">
              <label>Max lot size</label>
              <input type="number" min={0.1} value={maxLotSize} onChange={(e) => setMaxLotSize(Number(e.target.value) || 1)} className="filter-input" />
            </div>
          </div>
          <div className="filter-group">
            <label>Margin call level (%)</label>
            <input type="number" min={50} max={100} value={marginCallLevel} onChange={(e) => setMarginCallLevel(Number(e.target.value) || 80)} className="filter-input" />
          </div>
          <p className="muted">When margin level falls below this %, margin call is triggered.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Withdrawals</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div className="filter-group">
              <label>Min withdrawal amount (USD)</label>
              <input type="number" min={0} value={minWithdrawal} onChange={(e) => setMinWithdrawal(Number(e.target.value) || 0)} className="filter-input" />
            </div>
            <div className="filter-group">
              <label>Max withdrawal per day (USD)</label>
              <input type="number" min={0} value={maxWithdrawalPerDay} onChange={(e) => setMaxWithdrawalPerDay(Number(e.target.value) || 0)} className="filter-input" />
            </div>
          </div>
          <div className="filter-group">
            <label>Manual approval above amount (USD)</label>
            <input type="number" min={0} value={approvalAboveAmount} onChange={(e) => setApprovalAboveAmount(Number(e.target.value) || 0)} className="filter-input" />
          </div>
          <p className="muted">Withdrawals above this amount require admin approval.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Payments & gateways</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div className="filter-group">
              <label>Default deposit gateway</label>
              <select value={defaultPaymentGateway} onChange={(e) => setDefaultPaymentGateway(e.target.value)} className="filter-select">
                {paymentGateways.filter((g) => g.enabled && g.configured).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
                {paymentGateways.filter((g) => g.enabled && g.configured).length === 0 && (
                  <option value="">— Select after enabling a gateway —</option>
                )}
              </select>
            </div>
            <div className="filter-group">
              <label>Settlement time (days)</label>
              <input type="number" min={0} max={14} value={settlementDays} onChange={(e) => setSettlementDays(Number(e.target.value) || 0)} className="filter-input" placeholder="0 = instant" />
            </div>
          </div>
          <div className="settings-row">
            <div className="filter-group">
              <label>Min deposit (USD)</label>
              <input type="number" min={0} value={minDeposit} onChange={(e) => setMinDeposit(Number(e.target.value) || 0)} className="filter-input" />
            </div>
            <div className="filter-group">
              <label>Max deposit (USD)</label>
              <input type="number" min={0} value={maxDeposit} onChange={(e) => setMaxDeposit(Number(e.target.value) || 0)} className="filter-input" />
            </div>
          </div>
          <div className="settings-row">
            <div className="filter-group">
              <label>Deposit fee</label>
              <div className="fee-row">
                <select value={depositFeeType} onChange={(e) => setDepositFeeType(e.target.value)} className="filter-select">
                  <option value="none">None</option>
                  <option value="fixed">Fixed (USD)</option>
                  <option value="percent">Percent (%)</option>
                </select>
                {(depositFeeType === 'fixed' || depositFeeType === 'percent') && (
                  <input type="number" min={0} step={depositFeeType === 'percent' ? 0.1 : 1} value={depositFeeValue} onChange={(e) => setDepositFeeValue(Number(e.target.value) || 0)} className="filter-input fee-value-input" />
                )}
              </div>
            </div>
            <div className="filter-group">
              <label>Withdrawal fee</label>
              <div className="fee-row">
                <select value={withdrawalFeeType} onChange={(e) => setWithdrawalFeeType(e.target.value)} className="filter-select">
                  <option value="none">None</option>
                  <option value="fixed">Fixed (USD)</option>
                  <option value="percent">Percent (%)</option>
                </select>
                {(withdrawalFeeType === 'fixed' || withdrawalFeeType === 'percent') && (
                  <input type="number" min={0} step={withdrawalFeeType === 'percent' ? 0.1 : 1} value={withdrawalFeeValue} onChange={(e) => setWithdrawalFeeValue(Number(e.target.value) || 0)} className="filter-input fee-value-input" />
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="settings-card" style={{ marginTop: '1rem' }}>
          <h3 className="subsection-title">Payment gateways</h3>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>Enable and configure gateways. API keys are set via server environment or secure vault.</p>
          <div className="table-wrap">
            <table className="table kpi-table payment-gateways-table">
              <thead>
                <tr>
                  <th>Gateway</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Test mode</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {paymentGateways.map((gw) => (
                  <tr key={gw.id}>
                    <td><strong>{gw.name}</strong></td>
                    <td>{gw.type}</td>
                    <td>
                      <span className={gw.configured ? 'status-badge status-approved' : 'status-badge status-pending'}>
                        {gw.configured ? 'Configured' : 'Not configured'}
                      </span>
                    </td>
                    <td>
                      <label className="settings-toggle settings-toggle-inline">
                        <input type="checkbox" checked={gw.testMode} onChange={(e) => updateGateway(gw.id, 'testMode', e.target.checked)} disabled={!gw.configured} />
                        <span>{gw.testMode ? 'Yes' : 'No'}</span>
                      </label>
                    </td>
                    <td>
                      <label className="settings-toggle settings-toggle-inline">
                        <input type="checkbox" checked={gw.enabled} onChange={(e) => updateGateway(gw.id, 'enabled', e.target.checked)} />
                        <span>{gw.enabled ? 'On' : 'Off'}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: '0.75rem' }}>To add or edit gateway credentials, use the server environment (e.g. STRIPE_SECRET_KEY) or your secure config vault.</p>
          <div className="psp-reconciliation-row" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary">Reconciliation dashboard</button>
            <span className="muted">Payment matching and discrepancy resolution.</span>
          </div>
        </div>
        <div className="settings-card" style={{ marginTop: '1rem' }}>
          <h3 className="subsection-title">Add PSP</h3>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>Add payment service provider with API key (stored securely) and webhook support.</p>
          <div className="settings-row">
            <div className="filter-group">
              <label>PSP name</label>
              <input type="text" placeholder="e.g. New Gateway" className="filter-input" />
            </div>
            <div className="filter-group">
              <label>Webhook URL (for callbacks)</label>
              <input type="url" placeholder="https://..." className="filter-input" />
            </div>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" defaultChecked={false} />
            <span>Auto credit on successful webhook</span>
          </label>
          <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }}>Add PSP</button>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">KYC & compliance</h2>
        <div className="settings-card">
          <label className="settings-toggle">
            <input type="checkbox" checked={requireKycBeforeTrading} onChange={(e) => setRequireKycBeforeTrading(e.target.checked)} />
            <span>Require KYC approval before trading</span>
          </label>
          <p className="muted">Clients must be verified before opening positions.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Security</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div className="filter-group">
              <label>Session timeout (minutes)</label>
              <input type="number" min={5} max={1440} value={sessionTimeoutMinutes} onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value) || 30)} className="filter-input" />
            </div>
            <div className="filter-group">
              <label>Password min length</label>
              <input type="number" min={6} max={32} value={passwordMinLength} onChange={(e) => setPasswordMinLength(Number(e.target.value) || 8)} className="filter-input" />
            </div>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" checked={require2FAAdmin} onChange={(e) => setRequire2FAAdmin(e.target.checked)} />
            <span>Require 2FA for admin users</span>
          </label>
          <p className="muted" style={{ marginTop: '0.75rem' }}>RBAC, JWT, 2FA, IP restriction for admin panel, encrypted financial data, full audit trail.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Automation control center</h2>
        <div className="settings-card">
          <p className="muted" style={{ marginBottom: '1rem' }}>Toggle AUTO / MANUAL mode for automation features. Manual override can be set per user by admins.</p>
          <div className="filter-group">
            <label>Global mode</label>
            <select value={automationMode} onChange={(e) => setAutomationMode(e.target.value)} className="filter-select">
              <option value="AUTO">AUTO</option>
              <option value="MANUAL">MANUAL</option>
            </select>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" checked={autoDepositApproval} onChange={(e) => setAutoDepositApproval(e.target.checked)} />
            <span>Auto deposit approval (when AUTO)</span>
          </label>
          <label className="settings-toggle">
            <input type="checkbox" checked={autoIbCommission} onChange={(e) => setAutoIbCommission(e.target.checked)} />
            <span>Auto IB commission calculation</span>
          </label>
          <label className="settings-toggle">
            <input type="checkbox" checked={autoRouting} onChange={(e) => setAutoRouting(e.target.checked)} />
            <span>Auto routing (A-Book / B-Book) by rules</span>
          </label>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Users & roles (reference)</h2>
        <div className="settings-card">
          <p className="muted" style={{ marginBottom: '1rem' }}>FXMARK CRM role-based access. Assign roles in Users; permissions are enforced by the backend.</p>
          <div className="roles-reference-list">
            {ROLES.map((r) => (
              <div key={r.value} className="roles-reference-item">
                <span className={`role-badge role-badge--${r.category}`}>{r.label}</span>
                <p className="roles-reference-desc">{r.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Permissions management</h2>
        <div className="settings-card">
          <p className="muted" style={{ marginBottom: '1rem' }}>Configure which permissions each role has. Changes are enforced by the backend (RBAC).</p>
          <div className="permissions-toolbar">
            <div className="filter-group">
              <label>Role</label>
              <select value={permissionsRole} onChange={(e) => setPermissionsRole(e.target.value)} className="filter-select permissions-role-select">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-secondary" onClick={resetPermissionsToDefault}>Reset to default</button>
          </div>
          <div className="permissions-matrix">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.id} className="permission-group-block">
                <h4 className="permission-group-title">{group.label}</h4>
                <ul className="permission-list">
                  {group.permissions.map((p) => (
                    <li key={p.id}>
                      <label className="settings-toggle permission-item">
                        <input
                          type="checkbox"
                          checked={hasPermission(permissionsRole, p.id)}
                          onChange={(e) => togglePermission(permissionsRole, p.id, e.target.checked)}
                        />
                        <span>{p.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="settings-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary">Save permissions</button>
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Commission (IB)</h2>
        <div className="settings-card">
          <div className="filter-group">
            <label>Default IB commission rate (%)</label>
            <input type="number" min={0} step={0.1} value={defaultIbCommission} onChange={(e) => setDefaultIbCommission(Number(e.target.value) || 0)} className="filter-input" />
          </div>
          <p className="muted">Default commission for new IB accounts; can be overridden per IB.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">PAMM feature flags</h2>
        <div className="settings-card">
          <p className="muted" style={{ marginBottom: '0.5rem' }}>Enable/disable PAMM features. Stored in <code>pamm_feature_flags</code>. Priority: Manager override &gt; Group override &gt; Global default. <strong>All toggles are enforced at API level</strong>; backend blocks access when disabled.</p>
          <div className="pamm-flags-toolbar">
            <div className="filter-group">
              <label>Apply to</label>
              <select value={pammFlagsScope} onChange={(e) => setPammFlagsScope(e.target.value)} className="filter-select">
                {PAMM_FLAG_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-secondary" onClick={resetPammFlags}>Reset to defaults</button>
          </div>
        </div>
        <div className="pamm-flags-grid">
          <div className="settings-card pamm-flags-block">
            <h4 className="permission-group-title">Investor view</h4>
            <ul className="permission-list">
              {PAMM_FLAGS_INVESTOR_VIEW.map((f) => (
                <li key={f.id}>
                  <label className="settings-toggle permission-item">
                    <input type="checkbox" checked={!!pammFlags[f.id]} onChange={(e) => togglePammFlag(f.id, e.target.checked)} />
                    <span>{f.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="settings-card pamm-flags-block">
            <h4 className="permission-group-title">Investor actions</h4>
            <ul className="permission-list">
              {PAMM_FLAGS_INVESTOR_ACTIONS.map((f) => (
                <li key={f.id}>
                  <label className="settings-toggle permission-item">
                    <input type="checkbox" checked={!!pammFlags[f.id]} onChange={(e) => togglePammFlag(f.id, e.target.checked)} />
                    <span>{f.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="settings-card pamm-flags-block">
            <h4 className="permission-group-title">Manager & risk</h4>
            <ul className="permission-list">
              {PAMM_FLAGS_MANAGER_RISK.map((f) => (
                <li key={f.id}>
                  <label className="settings-toggle permission-item">
                    <input type="checkbox" checked={!!pammFlags[f.id]} onChange={(e) => togglePammFlag(f.id, e.target.checked)} />
                    <span>{f.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="settings-card pamm-flags-block">
            <h4 className="permission-group-title">Admin control</h4>
            <ul className="permission-list">
              {PAMM_FLAGS_ADMIN.filter((f) => f.id !== 'pamm_global_kill_switch').map((f) => (
                <li key={f.id}>
                  <label className="settings-toggle permission-item">
                    <input type="checkbox" checked={!!pammFlags[f.id]} onChange={(e) => togglePammFlag(f.id, e.target.checked)} />
                    <span>{f.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="settings-card pamm-kill-switch" style={{ marginTop: '1rem' }}>
          <h4 className="permission-group-title">Global kill switch</h4>
          <p className="muted" style={{ marginBottom: '0.5rem' }}>When ON, PAMM features can be disabled system-wide. Backend must enforce.</p>
          <label className="settings-toggle">
            <input type="checkbox" checked={!!pammFlags.pamm_global_kill_switch} onChange={(e) => togglePammFlag('pamm_global_kill_switch', e.target.checked)} />
            <span>Global kill switch (ON = active)</span>
          </label>
        </div>
        <div className="settings-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary">Save PAMM flags</button>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Cron jobs</h2>
        <div className="settings-card">
          <p className="muted" style={{ marginBottom: '1rem' }}>Configure scheduled tasks. Times are in server timezone ({timezone}).</p>
          <div className="table-wrap">
            <table className="table kpi-table cron-jobs-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Schedule</th>
                  <th>Enabled</th>
                  <th>Last run</th>
                  <th>Run now</th>
                </tr>
              </thead>
              <tbody>
                {cronJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <div className="cron-job-name">{job.name}</div>
                      <div className="cron-job-desc">{job.description}</div>
                    </td>
                    <td>
                      <select
                        value={job.schedule}
                        onChange={(e) => updateCronJob(job.id, 'schedule', e.target.value)}
                        className="filter-select cron-schedule-select"
                      >
                        {CRON_SCHEDULES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="settings-toggle settings-toggle-inline">
                        <input
                          type="checkbox"
                          checked={job.enabled}
                          onChange={(e) => updateCronJob(job.id, 'enabled', e.target.checked)}
                        />
                        <span>{job.enabled ? 'On' : 'Off'}</span>
                      </label>
                    </td>
                    <td className="cron-last-run">{job.lastRun}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => alert(`Run ${job.name} (not implemented)`)}>
                        Run
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Notifications</h2>
        <div className="settings-card">
          <label className="settings-toggle">
            <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} />
            <span>Email notifications (KYC, withdrawals, alerts)</span>
          </label>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">API & integrations</h2>
        <div className="settings-card">
          <p className="muted">API keys and third-party integrations are configured via environment variables on the server.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <div className="settings-actions">
          <button type="button" className="btn btn-primary">Save settings</button>
        </div>
      </section>
    </div>
  );
}
