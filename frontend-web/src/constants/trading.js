/** Shared trading symbols and lot options for forms and trading page */
export const SYMBOLS = [
  { value: 'XAU/USD', label: 'XAU/USD (Gold)' },
  { value: 'EUR/USD', label: 'EUR/USD' },
  { value: 'GBP/USD', label: 'GBP/USD' },
  { value: 'USD/JPY', label: 'USD/JPY' },
  { value: 'USD/CHF', label: 'USD/CHF' },
  { value: 'USD/CAD', label: 'USD/CAD' },
  { value: 'AUD/USD', label: 'AUD/USD' },
  { value: 'NZD/USD', label: 'NZD/USD' },
];

export const LOT_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10];

export const LOT_PRESETS = [0.01, 0.1, 0.5, 1];

export function formatPrice(value, symbol) {
  if (value == null || Number.isNaN(value)) return '—';
  const decimals = symbol?.includes('XAU') ? 2 : 4;
  return Number(value).toFixed(decimals);
}
