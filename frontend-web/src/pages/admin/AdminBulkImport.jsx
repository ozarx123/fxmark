import React, { useMemo, useRef, useState, useEffect } from 'react';
import { getBulkImportConfig, runBulkImport } from '../../api/adminApi';

const REQUIRED_COLUMNS = [
  'account_no',
  'full_name',
  'email',
  'mobile',
  'wallet_balance',
  'is_active',
];

/** Optional CRM / historical columns */
const OPTIONAL_COLUMNS = ['ref_id', 'refer_by', 'days'];

/** All columns sent to API (required + optional) */
const IMPORT_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

/** Expected fields for UI (FXMARK CRM source structure) */
const EXPECTED_FIELDS_LABEL = 'account_no, full_name, email, mobile, wallet_balance, is_active, Ref ID, Refer By, Days';

/** Human-readable field descriptions for detected mapping */
const FIELD_DESCRIPTIONS = {
  account_no: 'Account number (preserved exactly)',
  full_name: 'Full / display name',
  email: 'Email',
  mobile: 'Mobile / contact',
  wallet_balance: 'Opening wallet balance',
  is_active: 'Active status',
  ref_id: 'Own referral code (Ref ID)',
  refer_by: 'Parent referral code (Refer By)',
  days: 'Original account creation date',
};

/** Alternate header names that map to import columns — real FXMARK CRM source aliases */
const HEADER_ALIASES = {
  account_no: ['account_no', 'account_n', 'accountno', 'account_id', 'accountid', 'account id'],
  full_name: ['full_name', 'fullname', 'name', 'full name'],
  email: ['email', 'email_id', 'emailid', 'email id'],
  mobile: ['mobile', 'phone', 'contact', 'phone number', 'phone_number'],
  wallet_balance: ['wallet_balance', 'wallet_bali', 'wallet_bal', 'balance', 'wallet balance'],
  is_active: ['is_active', 'isactive', 'active', 'status', 'is active'],
  ref_id: ['ref_id', 'refid', 'ref id', 'referral code', 'referral_code', 'my referral code'],
  refer_by: ['refer_by', 'referby', 'refer by', 'referred by', 'referred_by', 'parent referral code'],
  days: ['days', 'date', 'created_at', 'join_date', 'registered_at'],
};

function normalizeHeader(h) {
  return String(h)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function normalizedHeaderMatchesRequired(normalized, requiredCol) {
  if (normalized === requiredCol) return true;
  const aliases = HEADER_ALIASES[requiredCol];
  return aliases && aliases.includes(normalized);
}

function findHeaderIndexForColumn(normalizedHeaders, requiredCol) {
  return normalizedHeaders.findIndex((n) => normalizedHeaderMatchesRequired(n, requiredCol));
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map((v) => v.replace(/^"|"$/g, '').trim());
  };

  const rawHeaders = splitLine(lines[0]);
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const values = splitLine(line);
    const obj = {};
    rawHeaders.forEach((header, index) => {
      obj[header] = values[index] ?? '';
    });
    return obj;
  });

  return { headers: rawHeaders, normalizedHeaders, rows };
}

/** Map parsed rows (any header names, including aliases) to backend expected keys */
function rowsToPayload(headers, normalizedHeaders, rows) {
  const colMap = {};
  IMPORT_COLUMNS.forEach((col) => {
    const idx = findHeaderIndexForColumn(normalizedHeaders, col);
    if (idx !== -1) colMap[col] = headers[idx];
  });
  return rows.map((row) => {
    const out = {};
    IMPORT_COLUMNS.forEach((col) => {
      const sourceKey = colMap[col];
      out[col] = sourceKey != null && row[sourceKey] != null ? String(row[sourceKey]).trim() : '';
    });
    return out;
  });
}

const IconUpload = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconFile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
  </svg>
);
const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconAlert = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconPlay = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export default function AdminBulkImport() {
  const inputRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [normalizedHeaders, setNormalizedHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dryRunReport, setDryRunReport] = useState(null);
  const [liveReport, setLiveReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getBulkImportConfig()
      .then((c) => { if (!cancelled) setConfig(c); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const missingColumns = useMemo(
    () => REQUIRED_COLUMNS.filter((col) => findHeaderIndexForColumn(normalizedHeaders, col) === -1),
    [normalizedHeaders]
  );

  const payloadRows = useMemo(
    () => (headers.length && normalizedHeaders.length ? rowsToPayload(headers, normalizedHeaders, rows) : []),
    [headers, normalizedHeaders, rows]
  );

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  /** Detected mapping: file column → field (for display) */
  const detectedMapping = useMemo(() => {
    if (!headers.length || !normalizedHeaders.length) return [];
    return IMPORT_COLUMNS.map((col) => {
      const idx = findHeaderIndexForColumn(normalizedHeaders, col);
      const fileColumn = idx >= 0 ? headers[idx] : null;
      return { field: col, fileColumn, description: FIELD_DESCRIPTIONS[col] };
    }).filter((m) => m.fileColumn != null);
  }, [headers, normalizedHeaders]);

  const handleFile = async (file) => {
    setError('');
    setDryRunReport(null);
    setLiveReport(null);
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.txt')) {
      setError('Use CSV format. Convert Excel to CSV first.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setNormalizedHeaders(parsed.normalizedHeaders || parsed.headers.map(normalizeHeader));
      setRows(parsed.rows);
      if (parsed.rows.length === 0) setError('No data rows found. CSV must have a header row and at least one data row.');
    } catch (err) {
      setError(err.message || 'Failed to parse CSV');
      setHeaders([]);
      setNormalizedHeaders([]);
      setRows([]);
    }
  };

  const runApi = async (mode) => {
    if (!payloadRows.length) {
      setError('Upload a CSV file first.');
      return;
    }
    if (missingColumns.length) {
      setError(`Missing required columns: ${missingColumns.join(', ')}`);
      return;
    }
    if (mode === 'live' && !window.confirm(`Import ${payloadRows.length} row(s) for real? This will create users and wallets.`)) return;

    setIsUploading(true);
    setError('');
    if (mode === 'dry') setDryRunReport(null);
    else setLiveReport(null);

    try {
      const data = await runBulkImport(payloadRows, mode === 'dry');
      if (mode === 'dry') setDryRunReport(data.report);
      else setLiveReport(data.report);
    } catch (e) {
      setError(e.message || 'Bulk import request failed. Check API connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const reportCreated = (r) => (r && Array.isArray(r.created) ? r.created.length : 0);
  const reportSkippedAccount = (r) => (r && Array.isArray(r.skippedDuplicateAccountNo) ? r.skippedDuplicateAccountNo.length : 0);
  const reportSkippedEmail = (r) => (r && Array.isArray(r.skippedDuplicateEmail) ? r.skippedDuplicateEmail.length : 0);
  const reportDuplicateRefCode = (r) => (r && Array.isArray(r.duplicateReferralCode) ? r.duplicateReferralCode.length : 0);
  const reportInvalidReferBy = (r) => (r && Array.isArray(r.invalidReferBy) ? r.invalidReferBy.length : 0);
  const reportSelfReferral = (r) => (r && Array.isArray(r.selfReferral) ? r.selfReferral.length : 0);
  const reportFailed = (r) => (r && Array.isArray(r.failed) ? r.failed.length : 0);
  const reportProcessed = (r) => (r && typeof r.totalRows === 'number' ? r.totalRows : (r && r.created ? r.created.length : 0));

  return (
    <div className="page admin-page admin-bulk-import">
      <header className="page-header">
        <h1>Bulk User Import</h1>
        <p className="page-subtitle">
          Upload a CSV, preview required fields, run a dry run, then execute the live import.
        </p>
      </header>

      {config && (
        <div className="card admin-bulk-import-config" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          <strong>Import config:</strong> Main password {config.defaultMainPasswordSet ? 'set' : 'not set'}, investor password {config.defaultInvestorPasswordSet ? 'set' : 'not set'}.
        </div>
      )}

      <div className="admin-bulk-import-grid" style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(200px, 1fr)' }}>
        <div className="card" style={{ gridColumn: '1 / 3', padding: '1.25rem' }}>
          <h3 className="card-title" style={{ marginTop: 0, marginBottom: '0.25rem' }}>Upload File (FXMARK CRM source)</h3>
          <p className="muted" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            Expected fields: <strong>{EXPECTED_FIELDS_LABEL}</strong>
          </p>
          <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
            ref_id = own referral code · refer_by = parent referral code · Days = original account creation date (e.g. 27-12-2025 07:55)
          </p>
          <div
            className="admin-bulk-import-dropzone"
            style={{
              borderRadius: '12px',
              border: '2px dashed var(--border, #cbd5e1)',
              background: 'var(--bg-card, #fff)',
              padding: '2rem',
              textAlign: 'center',
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-muted, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <IconUpload />
              </span>
            </div>
            <p style={{ fontWeight: 600, margin: 0 }}>Drag and drop CSV here</p>
            <p className="muted" style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>or use the button below</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '1rem', borderRadius: '10px' }}
              onClick={() => inputRef.current?.click()}
            >
              <IconFile /> Choose CSV File
            </button>
            {fileName && (
              <p className="muted" style={{ marginTop: '1rem', marginBottom: 0, fontSize: '0.9rem' }}>
                Loaded: <strong>{fileName}</strong>
              </p>
            )}
          </div>

          {error && (
            <div className="auth-error" style={{ marginTop: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <span style={{ flexShrink: 0 }}><IconAlert /></span>
              <span>{error}</span>
              <button type="button" className="btn-link" onClick={() => setError('')} style={{ marginLeft: 'auto' }}>Dismiss</button>
            </div>
          )}

          {headers.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {headers.map((header) => (
                  <span
                    key={header}
                    className="badge"
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '9999px',
                      background: 'var(--bg-muted, #f1f5f9)',
                      fontSize: '0.8rem',
                    }}
                  >
                    {header}
                  </span>
                ))}
              </div>
              {detectedMapping.length > 0 && (
                <details style={{ marginBottom: '0.75rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>Detected mapping</summary>
                  <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, listStyle: 'none', fontSize: '0.85rem' }}>
                    {detectedMapping.map((m) => (
                      <li key={m.field} style={{ marginBottom: '0.25rem' }}>
                        <strong>{m.fileColumn}</strong> → {m.field} <span className="muted">({m.description})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {missingColumns.length > 0 ? (
                <div className="auth-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem' }}>
                  <IconAlert />
                  <span>Missing required columns: {missingColumns.join(', ')}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--success-bg, #ecfdf5)', color: 'var(--success-text, #065f46)', borderRadius: '8px' }}>
                  <IconCheck />
                  <span>All required columns are present.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 className="card-title" style={{ marginTop: 0, marginBottom: '0.25rem' }}>Actions</h3>
          <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Run validation before live import.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', borderRadius: '10px' }}
              disabled={isUploading || !rows.length}
              onClick={() => runApi('dry')}
            >
              <IconShield /> {isUploading ? 'Running...' : 'Dry Run'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', borderRadius: '10px' }}
              disabled={isUploading || !rows.length}
              onClick={() => runApi('live')}
            >
              <IconPlay /> {isUploading ? 'Importing...' : 'Live Import'}
            </button>
          </div>
          <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            <p style={{ margin: '0.25rem 0' }}><strong>Rows loaded:</strong> {rows.length}</p>
            <p style={{ margin: '0.25rem 0' }}><strong>Expected fields:</strong> {EXPECTED_FIELDS_LABEL}</p>
            <p style={{ margin: '0.25rem 0' }}>CSV only in this UI</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
        <h3 className="card-title" style={{ marginTop: 0, marginBottom: '0.25rem' }}>Preview</h3>
        <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>First 5 rows from the uploaded file.</p>
        {!previewRows.length ? (
          <p className="muted" style={{ margin: 0 }}>No rows loaded yet.</p>
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <table className="table kpi-table" style={{ minWidth: '100%' }}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index}>
                    {headers.map((header) => (
                      <td key={header} style={{ padding: '0.75rem 1rem' }}>{String(row[header] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginTop: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 className="card-title" style={{ marginTop: 0, marginBottom: '0.25rem' }}>Dry Run Report</h3>
          <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Validation only, no database writes. Failed can include missing data, invalid date format (Days), or validation errors.</p>
          {!dryRunReport ? (
            <p className="muted" style={{ margin: 0 }}>No dry run executed yet.</p>
          ) : (
            <div style={{ fontSize: '0.9rem' }}>
              <p style={{ margin: '0.25rem 0' }}>Processed: <strong>{reportProcessed(dryRunReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Duplicate account no: <strong>{reportSkippedAccount(dryRunReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Duplicate email: <strong>{reportSkippedEmail(dryRunReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Duplicate referral code: <strong>{reportDuplicateRefCode(dryRunReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Invalid Refer By: <strong>{reportInvalidReferBy(dryRunReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Self-referral: <strong>{reportSelfReferral(dryRunReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Failed: <strong>{reportFailed(dryRunReport)}</strong></p>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 className="card-title" style={{ marginTop: 0, marginBottom: '0.25rem' }}>Live Import Report</h3>
          <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Actual inserted rows and balances. Failed can include invalid date format (Days) or create errors.</p>
          {!liveReport ? (
            <p className="muted" style={{ margin: 0 }}>No live import executed yet.</p>
          ) : (
            <div style={{ fontSize: '0.9rem' }}>
              <p style={{ margin: '0.25rem 0' }}>Processed: <strong>{reportProcessed(liveReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Created: <strong>{reportCreated(liveReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Duplicate account no: <strong>{reportSkippedAccount(liveReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Duplicate referral code: <strong>{reportDuplicateRefCode(liveReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Invalid Refer By: <strong>{reportInvalidReferBy(liveReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Self-referral: <strong>{reportSelfReferral(liveReport)}</strong></p>
              <p style={{ margin: '0.25rem 0' }}>Failed: <strong>{reportFailed(liveReport)}</strong></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
