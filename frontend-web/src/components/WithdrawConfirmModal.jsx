import React, { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import PaymentMethodPicker from './PaymentMethodPicker';
import {
  MIN_WITHDRAW,
  MAX_WITHDRAW,
  WITHDRAW_PRESETS,
  WITHDRAW_METHODS,
  formatCurrency,
} from '../constants/finance';

export default function WithdrawConfirmModal({ isOpen, availableBalance = 0, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const maxAllowed = Math.min(MAX_WITHDRAW, availableBalance);
  const presetsWithMax = [...WITHDRAW_PRESETS].filter((p) => p <= maxAllowed);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num < MIN_WITHDRAW) {
      setError(`Minimum withdrawal is ${formatCurrency(MIN_WITHDRAW)}.`);
      return;
    }
    if (num > MAX_WITHDRAW) {
      setError(`Maximum withdrawal is ${formatCurrency(MAX_WITHDRAW)}.`);
      return;
    }
    if (num > availableBalance) {
      setError('Amount exceeds available balance.');
      return;
    }
    if (!agreeTerms) {
      setError('Please agree to the withdrawal terms.');
      return;
    }
    const methodLabel = WITHDRAW_METHODS.find((m) => m.value === method)?.label ?? method;
    setPendingConfirm({ amount: num, method, methodLabel });
  };

  const handleWithdrawConfirm = () => {
    if (!pendingConfirm) return;
    onConfirm({ amount: pendingConfirm.amount, method: pendingConfirm.method });
    setPendingConfirm(null);
    onClose();
  };

  const setMaxAmount = () => setAmount(String(maxAllowed));

  if (!isOpen) return null;

  const amountNum = parseFloat(amount);
  const isValidAmount = !isNaN(amountNum) && amountNum >= MIN_WITHDRAW && amountNum <= maxAllowed;
  const methodLabel = WITHDRAW_METHODS.find((m) => m.value === method)?.label ?? method;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog deposit-withdraw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Withdraw</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="deposit-withdraw-form finance-form-optimized">
          <p className="balance-display finance-balance">
            Available: <strong>{formatCurrency(availableBalance)}</strong>
          </p>

          <div className="form-row">
            <label>
              <span className="form-label">Amount (USD)</span>
              <input
                type="number"
                min={MIN_WITHDRAW}
                max={maxAllowed}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-input"
                placeholder="e.g. 500"
                required
              />
              <span className="form-hint">Min {formatCurrency(MIN_WITHDRAW)} – Max {formatCurrency(MAX_WITHDRAW)}</span>
            </label>
          </div>

          <PaymentMethodPicker
            label="Withdrawal method"
            options={WITHDRAW_METHODS}
            value={method}
            onChange={setMethod}
          />

          <div className="amount-presets">
            {presetsWithMax.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`amount-preset-btn ${Number(amount) === preset ? 'active' : ''}`}
                onClick={() => setAmount(String(preset))}
              >
                {formatCurrency(preset)}
              </button>
            ))}
            {maxAllowed >= MIN_WITHDRAW && (
              <button
                type="button"
                className={`amount-preset-btn amount-preset-max ${amount === String(maxAllowed) ? 'active' : ''}`}
                onClick={setMaxAmount}
              >
                Max
              </button>
            )}
          </div>

          <label className="form-checkbox-label checkbox-label finance-checkbox">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
            />
            <span>I agree to the withdrawal terms and may be redirected to verify the request.</span>
          </label>

          {error && <p className="form-error">{error}</p>}

          {isValidAmount && (
            <div className="finance-summary">
              <span className="finance-summary-text">
                Withdraw <strong>{formatCurrency(amountNum)}</strong> via <strong>{methodLabel}</strong>
              </span>
            </div>
          )}

          <div className="modal-actions modal-actions-compact">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm & proceed</button>
          </div>
        </form>

        <ConfirmDialog
          isOpen={!!pendingConfirm}
          title="Confirm withdrawal"
          message="Please confirm the withdrawal details below."
          referenceDetails={pendingConfirm ? [
            { label: 'Amount', value: formatCurrency(pendingConfirm.amount) },
            { label: 'Method', value: pendingConfirm.methodLabel },
          ] : []}
          confirmLabel="Confirm & proceed"
          variant="primary"
          onConfirm={handleWithdrawConfirm}
          onClose={() => setPendingConfirm(null)}
        />
      </div>
    </div>
  );
}
