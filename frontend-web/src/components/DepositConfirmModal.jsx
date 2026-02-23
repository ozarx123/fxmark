import React, { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import PaymentMethodPicker from './PaymentMethodPicker';
import {
  MIN_DEPOSIT,
  MAX_DEPOSIT,
  DEPOSIT_PRESETS,
  GATEWAYS,
  CURRENCIES,
  formatCurrency,
} from '../constants/finance';

export default function DepositConfirmModal({ isOpen, onConfirm, onClose }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [gateway, setGateway] = useState('stripe');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num < MIN_DEPOSIT) {
      setError(`Minimum deposit is ${formatCurrency(MIN_DEPOSIT)}.`);
      return;
    }
    if (num > MAX_DEPOSIT) {
      setError(`Maximum deposit is ${formatCurrency(MAX_DEPOSIT)}.`);
      return;
    }
    if (!agreeTerms) {
      setError('Please agree to the deposit terms.');
      return;
    }
    const gatewayLabel = GATEWAYS.find((g) => g.value === gateway)?.label ?? gateway;
    const currencyLabel = CURRENCIES.find((c) => c.value === currency)?.label ?? currency;
    setPendingConfirm({ amount: num, currency, gateway, gatewayLabel, currencyLabel });
  };

  const handleDepositConfirm = () => {
    if (!pendingConfirm) return;
    onConfirm({ amount: pendingConfirm.amount, currency: pendingConfirm.currency, gateway: pendingConfirm.gateway });
    setPendingConfirm(null);
    onClose();
  };

  if (!isOpen) return null;

  const amountNum = parseFloat(amount);
  const isValidAmount = !isNaN(amountNum) && amountNum >= MIN_DEPOSIT && amountNum <= MAX_DEPOSIT;
  const gatewayLabel = GATEWAYS.find((g) => g.value === gateway)?.label ?? gateway;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog deposit-withdraw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Deposit</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="deposit-withdraw-form finance-form-optimized">
          <div className="form-row">
            <label>
              <span className="form-label">Amount</span>
              <input
                type="number"
                min={MIN_DEPOSIT}
                max={MAX_DEPOSIT}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-input"
                placeholder="e.g. 500"
                required
              />
              <span className="form-hint">Min {formatCurrency(MIN_DEPOSIT)} – Max {formatCurrency(MAX_DEPOSIT)}</span>
            </label>
            <label>
              <span className="form-label">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="form-input">
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="amount-presets">
            {DEPOSIT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`amount-preset-btn ${Number(amount) === preset ? 'active' : ''}`}
                onClick={() => setAmount(String(preset))}
              >
                {formatCurrency(preset)}
              </button>
            ))}
          </div>

          <PaymentMethodPicker
            label="Payment method"
            options={GATEWAYS}
            value={gateway}
            onChange={setGateway}
          />

          <label className="form-checkbox-label checkbox-label finance-checkbox">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
            />
            <span>I agree to the deposit terms and will be redirected to complete payment.</span>
          </label>

          {error && <p className="form-error">{error}</p>}

          {isValidAmount && (
            <div className="finance-summary">
              <span className="finance-summary-text">
                Deposit <strong>{formatCurrency(amountNum, currency)}</strong> via <strong>{gatewayLabel}</strong>
              </span>
            </div>
          )}

          <div className="modal-actions modal-actions-compact">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm & go to payment</button>
          </div>
        </form>

        <ConfirmDialog
          isOpen={!!pendingConfirm}
          title="Confirm deposit"
          message="Please confirm the deposit details below. You will be redirected to the payment gateway."
          referenceDetails={pendingConfirm ? [
            { label: 'Amount', value: `${formatCurrency(pendingConfirm.amount)} ${pendingConfirm.currencyLabel}` },
            { label: 'Payment method', value: pendingConfirm.gatewayLabel },
          ] : []}
          confirmLabel="Confirm & go to payment"
          variant="primary"
          onConfirm={handleDepositConfirm}
          onClose={() => setPendingConfirm(null)}
        />
      </div>
    </div>
  );
}
