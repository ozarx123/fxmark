/**
 * Chart of accounts — account codes for double-entry ledger
 * Assets (1xxx): debit normal
 * Liabilities (2xxx): credit normal
 * Equity (3xxx): credit normal
 * Revenue (4xxx): credit normal
 * Expenses (5xxx): debit normal
 */
export const ACCOUNTS = {
  // Assets
  CASH_BANK: '1200',       // External cash/bank (deposits in, withdrawals out)
  RECEIVABLES: '1300',     // Amounts owed to us

  // Liabilities (credit normal: credit increases balance)
  WALLET: '2110',            // User wallet balance (we owe the user)
  CLIENT_FUNDS: '2100',      // Client funds held
  PAYABLES: '2200',           // Amounts we owe
  WITHDRAWALS_PAYABLE: '2300', // Withdrawals approved but not yet paid
  ACCRUED_COMMISSIONS: '2400', // IB commissions earned but not yet paid
  REFUNDS_PAYABLE: '2500',    // Refunds owed to clients
  REGULATORY_RESERVES: '2600', // Reserves required by regulators
  MARGIN_LIABILITIES: '2700',  // Margin owed to LPs/clearing

  // Equity
  RETAINED_EARNINGS: '3100',

  // Revenue
  TRADING_PNL: '4100',     // Realized P&L from trading
  COMMISSION_INCOME: '4200', // IB commission earned
  PAMM_FEES: '4300',       // PAMM performance fees

  // Expenses
  COMMISSION_PAID: '5100',     // IB commission paid out
  TRADING_LOSS: '5200',       // Trading losses
  PLATFORM_FEES: '5300',      // Fees paid to LPs, exchanges
  BANK_PROCESSING_FEES: '5400', // Card, wire, payment processing
  SOFTWARE_INFRASTRUCTURE: '5500', // Hosting, APIs, tools
  MARKETING_ACQUISITION: '5600', // Marketing, client acquisition
  COMPLIANCE_LEGAL: '5700',   // Regulatory, legal, audit
  SALARIES_BENEFITS: '5800',  // Staff costs
  MISC_EXPENSES: '5900',      // Miscellaneous operating
};

export const ACCOUNT_NAMES = {
  [ACCOUNTS.WALLET]: 'Wallet',
  [ACCOUNTS.CASH_BANK]: 'Cash/Bank',
  [ACCOUNTS.RECEIVABLES]: 'Receivables',
  [ACCOUNTS.CLIENT_FUNDS]: 'Client Funds',
  [ACCOUNTS.PAYABLES]: 'Payables',
  [ACCOUNTS.WITHDRAWALS_PAYABLE]: 'Withdrawals Payable',
  [ACCOUNTS.ACCRUED_COMMISSIONS]: 'Accrued Commissions',
  [ACCOUNTS.REFUNDS_PAYABLE]: 'Refunds Payable',
  [ACCOUNTS.REGULATORY_RESERVES]: 'Regulatory Reserves',
  [ACCOUNTS.MARGIN_LIABILITIES]: 'Margin Liabilities',
  [ACCOUNTS.RETAINED_EARNINGS]: 'Retained Earnings',
  [ACCOUNTS.TRADING_PNL]: 'Trading P&L',
  [ACCOUNTS.COMMISSION_INCOME]: 'Commission Income',
  [ACCOUNTS.PAMM_FEES]: 'PAMM Fees',
  [ACCOUNTS.COMMISSION_PAID]: 'Commission Paid',
  [ACCOUNTS.TRADING_LOSS]: 'Trading Loss',
  [ACCOUNTS.PLATFORM_FEES]: 'Platform Fees',
  [ACCOUNTS.BANK_PROCESSING_FEES]: 'Bank/Processing Fees',
  [ACCOUNTS.SOFTWARE_INFRASTRUCTURE]: 'Software & Infrastructure',
  [ACCOUNTS.MARKETING_ACQUISITION]: 'Marketing & Acquisition',
  [ACCOUNTS.COMPLIANCE_LEGAL]: 'Compliance & Legal',
  [ACCOUNTS.SALARIES_BENEFITS]: 'Salaries & Benefits',
  [ACCOUNTS.MISC_EXPENSES]: 'Miscellaneous',
};

export function getAccountType(code) {
  const first = code[0];
  if (first === '1') return 'asset';
  if (first === '2') return 'liability';
  if (first === '3') return 'equity';
  if (first === '4') return 'revenue';
  if (first === '5') return 'expense';
  return 'unknown';
}
