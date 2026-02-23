import React, { useState } from 'react';
import { COPY_MODE_OPTIONS } from './copyMockData';

export default function FollowModal({ masterName, masterSlug, onConfirm, onClose }) {
  const [copyMode, setCopyMode] = useState('risk_pct');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [riskPct, setRiskPct] = useState(1);
  const [maxDailyLossPct, setMaxDailyLossPct] = useState(3);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(10);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm({
      copyMode,
      allocationAmount: copyMode === 'capital_balance' ? parseFloat(allocationAmount) || 0 : null,
      riskPctPerTrade: copyMode === 'risk_pct' ? riskPct : null,
      maxDailyLossPct,
      maxDrawdownPct,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog copy-follow-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Follow {masterName}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="copy-follow-form">
          <label>
            <span className="form-label">Copy mode</span>
            <select
              value={copyMode}
              onChange={(e) => setCopyMode(e.target.value)}
              className="form-input"
            >
              {COPY_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {copyMode === 'capital_balance' && (
            <label>
              <span className="form-label">Allocation amount (USD)</span>
              <input
                type="number"
                min={0}
                step={100}
                value={allocationAmount}
                onChange={(e) => setAllocationAmount(e.target.value)}
                className="form-input"
                placeholder="Amount to allocate for copying"
              />
            </label>
          )}
          {copyMode === 'risk_pct' && (
            <label>
              <span className="form-label">Risk % per trade</span>
              <input
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                value={riskPct}
                onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)}
                className="form-input"
              />
            </label>
          )}
          <label>
            <span className="form-label">Max daily loss %</span>
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.5}
              value={maxDailyLossPct}
              onChange={(e) => setMaxDailyLossPct(parseFloat(e.target.value) || 0)}
              className="form-input"
            />
          </label>
          <label>
            <span className="form-label">Max drawdown % (auto-stop)</span>
            <input
              type="number"
              min={1}
              max={30}
              step={1}
              value={maxDrawdownPct}
              onChange={(e) => setMaxDrawdownPct(parseFloat(e.target.value) || 0)}
              className="form-input"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Start following</button>
          </div>
        </form>
      </div>
    </div>
  );
}
