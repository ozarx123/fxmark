import React, { useState, useMemo, useEffect } from 'react';
import * as adminApi from '../../api/adminApi';
import { ROLES } from './mockUsersData';
import { PERMISSION_GROUPS, getDefaultRolePermissions } from './mockPermissionsData';

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminSettings() {
  const [timezone, setTimezone] = useState('UTC');
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceScheduleEnabled, setMaintenanceScheduleEnabled] = useState(false);
  const [maintenanceScheduleStart, setMaintenanceScheduleStart] = useState('');
  const [maintenanceScheduleEnd, setMaintenanceScheduleEnd] = useState('');
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceLoadError, setMaintenanceLoadError] = useState(null);
  const [maintenanceWarn, setMaintenanceWarn] = useState(null);
  const [maintenanceSaveOk, setMaintenanceSaveOk] = useState(null);
  const [maintenanceEffective, setMaintenanceEffective] = useState({ active: false, source: 'off' });
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

  const [executionMode, setExecutionMode] = useState('A_BOOK');
  const [hybridRules, setHybridRules] = useState({
    maxInternalExposurePerSymbol: 100,
    volumeThresholdToABook: 5,
    profitableTraderToABook: true,
    newsTimeForceABook: false,
  });
  const [executionModeLoading, setExecutionModeLoading] = useState(true);
  const [executionModeSaving, setExecutionModeSaving] = useState(false);
  const [executionModeError, setExecutionModeError] = useState(null);

  const [marginRisk, setMarginRisk] = useState({
    stopOutBelowPct: 0,
    warnBelowPct: 0,
    warnIntervalMs: 120000,
  });
  const [marginRiskLoading, setMarginRiskLoading] = useState(true);
  const [marginRiskSaving, setMarginRiskSaving] = useState(false);
  const [marginRiskError, setMarginRiskError] = useState(null);
  const [marginRiskUpdatedAt, setMarginRiskUpdatedAt] = useState(null);
  const [marginRiskFromDb, setMarginRiskFromDb] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [modeRes, rulesRes, marginRes] = await Promise.all([
          adminApi.getExecutionMode(),
          adminApi.getHybridRules(),
          adminApi.getMarginRiskSettings().catch(() => null),
        ]);
        if (!cancelled) {
          setExecutionMode(modeRes.executionMode || 'A_BOOK');
          setHybridRules((prev) => ({ ...prev, ...rulesRes }));
          if (marginRes) {
            setMarginRisk({
              stopOutBelowPct: Number(marginRes.stopOutBelowPct) || 0,
              warnBelowPct: Number(marginRes.warnBelowPct) || 0,
              warnIntervalMs: Number(marginRes.warnIntervalMs) || 120000,
            });
            setMarginRiskUpdatedAt(marginRes.updatedAt || null);
            setMarginRiskFromDb(!!marginRes.fromDatabase);
          }
        }
      } catch (e) {
        if (!cancelled) setExecutionModeError(e.message);
      } finally {
        if (!cancelled) {
          setExecutionModeLoading(false);
          setMarginRiskLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await adminApi.getMaintenance();
        if (cancelled) return;
        setMaintenanceEnabled(!!m.enabled);
        setMaintenanceMessage(typeof m.message === 'string' ? m.message : '');
        setMaintenanceScheduleEnabled(!!m.scheduleEnabled);
        setMaintenanceScheduleStart(isoToDatetimeLocal(m.scheduleStart));
        setMaintenanceScheduleEnd(isoToDatetimeLocal(m.scheduleEnd));
        setMaintenanceEffective({ active: !!m.effectiveActive, source: m.effectiveSource || 'off' });
        setMaintenanceLoadError(null);
        if (m.effectiveActive && m.effectiveSource === 'schedule') {
          setMaintenanceWarn(
            'Maintenance is ON because of the scheduled window. Uncheck “Scheduled window” or shorten the window to turn the site back on.'
          );
        } else {
          setMaintenanceWarn(null);
        }
      } catch (e) {
        if (!cancelled) setMaintenanceLoadError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveMaintenance = async () => {
    setMaintenanceSaving(true);
    setMaintenanceLoadError(null);
    setMaintenanceWarn(null);
    try {
      const body = {
        enabled: maintenanceEnabled,
        message: maintenanceMessage,
        scheduleEnabled: maintenanceScheduleEnabled,
        scheduleStart: maintenanceScheduleStart ? new Date(maintenanceScheduleStart).toISOString() : null,
        scheduleEnd: maintenanceScheduleEnd ? new Date(maintenanceScheduleEnd).toISOString() : null,
      };
      const m = await adminApi.putMaintenance(body);
      setMaintenanceEnabled(!!m.enabled);
      setMaintenanceMessage(typeof m.message === 'string' ? m.message : '');
      setMaintenanceScheduleEnabled(!!m.scheduleEnabled);
      setMaintenanceScheduleStart(isoToDatetimeLocal(m.scheduleStart));
      setMaintenanceScheduleEnd(isoToDatetimeLocal(m.scheduleEnd));
      setMaintenanceEffective({ active: !!m.effectiveActive, source: m.effectiveSource || 'off' });
      if (m.effectiveActive && m.effectiveSource === 'schedule') {
        setMaintenanceWarn(
          'Maintenance is still ON from the scheduled window. Uncheck “Scheduled window” or move the end time into the past, then save again.'
        );
      } else {
        setMaintenanceWarn(null);
      }
      const on = !!m.effectiveActive;
      const src = m.effectiveSource || 'off';
      const srcLabel = src === 'off' ? '' : ` (${src})`;
      setMaintenanceSaveOk(
        on
          ? `Maintenance settings saved. The platform is in maintenance mode${srcLabel}.`
          : `Maintenance settings saved. The platform is not in maintenance mode.`
      );
    } catch (e) {
      setMaintenanceLoadError(e.message);
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const saveExecutionMode = async () => {
    setExecutionModeSaving(true);
    setExecutionModeError(null);
    try {
      await adminApi.putExecutionMode(executionMode);
    } catch (e) {
      setExecutionModeError(e.message);
    } finally {
      setExecutionModeSaving(false);
    }
  };

  const saveHybridRules = async () => {
    setExecutionModeSaving(true);
    setExecutionModeError(null);
    try {
      await adminApi.putHybridRules(hybridRules);
    } catch (e) {
      setExecutionModeError(e.message);
    } finally {
      setExecutionModeSaving(false);
    }
  };

  const saveMarginRisk = async () => {
    setMarginRiskSaving(true);
    setMarginRiskError(null);
    try {
      const saved = await adminApi.putMarginRiskSettings({
        stopOutBelowPct: marginRisk.stopOutBelowPct,
        warnBelowPct: marginRisk.warnBelowPct,
        warnIntervalMs: marginRisk.warnIntervalMs,
      });
      setMarginRisk({
        stopOutBelowPct: Number(saved.stopOutBelowPct) || 0,
        warnBelowPct: Number(saved.warnBelowPct) || 0,
        warnIntervalMs: Number(saved.warnIntervalMs) || 120000,
      });
      setMarginRiskUpdatedAt(saved.updatedAt || null);
      setMarginRiskFromDb(!!saved.fromDatabase);
    } catch (e) {
      setMarginRiskError(e.message || 'Failed to save margin risk settings');
    } finally {
      setMarginRiskSaving(false);
    }
  };

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
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Platform maintenance</h2>
        <div className="settings-card">
          {maintenanceLoadError && <p className="muted" style={{ color: 'var(--danger, #f85149)' }}>{maintenanceLoadError}</p>}
          {maintenanceSaveOk && (
            <p
              className="muted"
              style={{ color: 'var(--success-text, #059669)', marginBottom: '0.75rem' }}
              role="status"
              aria-live="polite"
            >
              {maintenanceSaveOk}
            </p>
          )}
          {maintenanceWarn && (
            <p className="muted" style={{ color: 'var(--fxmark-warning, #d4a72c)', marginBottom: '0.75rem' }}>
              {maintenanceWarn}
            </p>
          )}
          <p className="muted">
            Effective now:
            {' '}
            <strong>{maintenanceEffective.active ? 'ON' : 'OFF'}</strong>
            {maintenanceEffective.source && maintenanceEffective.source !== 'off' ? ` (${maintenanceEffective.source})` : ''}
            . Staff roles bypass the client maintenance screen and most API limits.
          </p>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={maintenanceEnabled}
              onChange={(e) => setMaintenanceEnabled(e.target.checked)}
            />
            <span>Maintenance on (immediate)</span>
          </label>
          <div className="filter-group" style={{ marginTop: '1rem' }}>
            <label>Message for clients</label>
            <textarea
              className="filter-input"
              rows={3}
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              placeholder="Shown on the public site during maintenance"
            />
          </div>
          <label className="settings-toggle" style={{ marginTop: '1rem' }}>
            <input
              type="checkbox"
              checked={maintenanceScheduleEnabled}
              onChange={(e) => setMaintenanceScheduleEnabled(e.target.checked)}
            />
            <span>Scheduled window (local browser time)</span>
          </label>
          {maintenanceScheduleEnabled && (
            <div className="settings-row" style={{ marginTop: '0.75rem' }}>
              <div className="filter-group">
                <label>Start</label>
                <input
                  type="datetime-local"
                  className="filter-input"
                  value={maintenanceScheduleStart}
                  onChange={(e) => setMaintenanceScheduleStart(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>End</label>
                <input
                  type="datetime-local"
                  className="filter-input"
                  value={maintenanceScheduleEnd}
                  onChange={(e) => setMaintenanceScheduleEnd(e.target.value)}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            disabled={maintenanceSaving}
            onClick={saveMaintenance}
          >
            {maintenanceSaving ? 'Saving…' : 'Save maintenance settings'}
          </button>
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
          <p className="muted">CRM display only — not wired to the live engine. Real margin warnings and stop-out are configured under <strong>Margin risk (tick engine)</strong> below.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Execution mode</h2>
        <div className="settings-card">
          {executionModeLoading ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="filter-group">
                <label>Broker execution mode</label>
                <select
                  value={executionMode}
                  onChange={(e) => setExecutionMode(e.target.value)}
                  className="filter-select"
                >
                  <option value="A_BOOK">A-Book (route to liquidity provider)</option>
                  <option value="B_BOOK">B-Book (internal execution)</option>
                  <option value="HYBRID">Hybrid (rules-based routing)</option>
                </select>
              </div>
              <p className="muted">All new market orders are routed through this setting. Change takes effect immediately.</p>
              <button type="button" className="btn btn-primary" onClick={saveExecutionMode} disabled={executionModeSaving}>
                {executionModeSaving ? 'Saving…' : 'Save execution mode'}
              </button>
              {executionModeError && <p className="form-error" style={{ marginTop: '0.5rem' }}>{executionModeError}</p>}
            </>
          )}
        </div>
        {!executionModeLoading && executionMode === 'HYBRID' && (
          <div className="settings-card" style={{ marginTop: '1rem' }}>
            <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Hybrid rules</h3>
            <p className="muted">When mode is Hybrid, these rules decide A-Book vs B-Book per order.</p>
            <div className="settings-row">
              <div className="filter-group">
                <label>Volume threshold to A-Book (lots)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={hybridRules.volumeThresholdToABook ?? 5}
                  onChange={(e) => setHybridRules((r) => ({ ...r, volumeThresholdToABook: Number(e.target.value) || 0 }))}
                  className="filter-input"
                />
              </div>
              <div className="filter-group">
                <label>Max internal exposure per symbol (lots)</label>
                <input
                  type="number"
                  min={0}
                  value={hybridRules.maxInternalExposurePerSymbol ?? 100}
                  onChange={(e) => setHybridRules((r) => ({ ...r, maxInternalExposurePerSymbol: Number(e.target.value) || 0 }))}
                  className="filter-input"
                />
              </div>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={hybridRules.profitableTraderToABook === true}
                onChange={(e) => setHybridRules((r) => ({ ...r, profitableTraderToABook: e.target.checked }))}
              />
              <span>Route profitable traders to A-Book</span>
            </label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={hybridRules.newsTimeForceABook === true}
                onChange={(e) => setHybridRules((r) => ({ ...r, newsTimeForceABook: e.target.checked }))}
              />
              <span>Force A-Book during news (placeholder)</span>
            </label>
            <button type="button" className="btn btn-primary" onClick={saveHybridRules} disabled={executionModeSaving} style={{ marginTop: '0.5rem' }}>
              {executionModeSaving ? 'Saving…' : 'Save hybrid rules'}
            </button>
          </div>
        )}
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Margin risk (tick engine)</h2>
        <div className="settings-card">
          <p className="muted">
            Controls server-side checks on each price tick (after TP/SL). Uses the same equity and margin as the trading terminal summary.
            Zero-equity auto-close is always on; here you optionally set <strong>margin stop-out</strong> (hard close) and <strong>margin warning</strong> (Socket.IO <code>risk_event</code>).
            Set warning threshold <strong>above</strong> stop-out (e.g. warn 150%, stop 50%). Values are stored in MongoDB and apply immediately after save.
            Until you save once, the API may fall back to <code>.env</code> (<code>MARGIN_LEVEL_*</code>).
          </p>
          {marginRiskLoading ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="settings-row">
                <div className="filter-group">
                  <label>Stop-out below margin level (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    value={marginRisk.stopOutBelowPct}
                    onChange={(e) => setMarginRisk((r) => ({ ...r, stopOutBelowPct: Number(e.target.value) || 0 }))}
                    className="filter-input"
                  />
                  <p className="muted" style={{ marginTop: '0.25rem' }}>0 = disabled. Example: 50 closes all positions when margin level &lt; 50%.</p>
                </div>
                <div className="filter-group">
                  <label>Warn below margin level (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    value={marginRisk.warnBelowPct}
                    onChange={(e) => setMarginRisk((r) => ({ ...r, warnBelowPct: Number(e.target.value) || 0 }))}
                    className="filter-input"
                  />
                  <p className="muted" style={{ marginTop: '0.25rem' }}>0 = disabled. Example: 150 emits <code>margin_warning</code> when level &lt; 150%.</p>
                </div>
              </div>
              <div className="filter-group">
                <label>Warning repeat interval (ms)</label>
                <input
                  type="number"
                  min={30000}
                  max={600000}
                  step={1000}
                  value={marginRisk.warnIntervalMs}
                  onChange={(e) => setMarginRisk((r) => ({ ...r, warnIntervalMs: Number(e.target.value) || 120000 }))}
                  className="filter-input"
                />
                <p className="muted" style={{ marginTop: '0.25rem' }}>Minimum time between <code>margin_warning</code> events per account (default 120000).</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={saveMarginRisk} disabled={marginRiskSaving}>
                {marginRiskSaving ? 'Saving…' : 'Save margin risk settings'}
              </button>
              {marginRiskError && <p className="form-error" style={{ marginTop: '0.5rem' }}>{marginRiskError}</p>}
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                {marginRiskFromDb
                  ? `Last saved: ${marginRiskUpdatedAt ? new Date(marginRiskUpdatedAt).toLocaleString() : '—'}`
                  : 'No document in database yet — showing env defaults or zeros. Saving creates the record.'}
              </p>
            </>
          )}
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
