/** Shared finance (deposit/withdraw) constants and helpers */

export const MIN_DEPOSIT = 20;
export const MAX_DEPOSIT = 100_000;
export const MIN_WITHDRAW = 50;
export const MAX_WITHDRAW = 50_000;

export const DEPOSIT_PRESETS = [100, 250, 500, 1000, 2500, 5000];
export const WITHDRAW_PRESETS = [100, 250, 500, 1000, 2500, 5000];

/** Phosphor icon name per payment method (see PaymentMethodPicker) */
export const GATEWAYS = [
  { value: 'stripe', label: 'Card (Stripe)', icon: 'CreditCard' },
  { value: 'paypal', label: 'PayPal', icon: 'PaypalLogo' },
  { value: 'bank', label: 'Bank transfer', icon: 'Bank' },
];

export const WITHDRAW_METHODS = [
  { value: 'bank', label: 'Bank transfer', icon: 'Bank' },
  { value: 'paypal', label: 'PayPal', icon: 'PaypalLogo' },
  { value: 'skrill', label: 'Skrill', icon: 'Wallet' },
];

export const CURRENCIES = [{ value: 'USD', label: 'USD' }];

export function formatCurrency(value, currency = 'USD') {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}
