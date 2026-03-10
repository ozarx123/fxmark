import React from 'react';
import { CreditCardIcon, BankIcon, PaypalLogoIcon, WalletIcon } from './Icons.jsx';

const ICON_MAP = {
  CreditCard: CreditCardIcon,
  Bank: BankIcon,
  PaypalLogo: PaypalLogoIcon,
  Wallet: WalletIcon,
};

/**
 * Renders a row of selectable payment method options with icon + label.
 * Each option in `options` should have { value, label, icon } where icon is a key of ICON_MAP.
 */
export default function PaymentMethodPicker({ options, value, onChange, label = 'Payment method', className = '' }) {
  return (
    <div className={`payment-method-picker ${className}`}>
      {label && <span className="form-label payment-method-picker-label">{label}</span>}
      <div className="payment-method-options" role="group" aria-label={label}>
        {options.map((opt) => {
          const Icon = ICON_MAP[opt.icon] || CreditCardIcon;
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`payment-method-option ${isSelected ? 'active' : ''}`}
              onClick={() => onChange(opt.value)}
              aria-pressed={isSelected}
              aria-label={opt.label}
            >
              <span className="payment-method-option-icon" aria-hidden>
                <Icon size={24} />
              </span>
              <span className="payment-method-option-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
