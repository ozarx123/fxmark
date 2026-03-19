/**
 * Ledger model — double-entry accounting
 * Entries: accountCode, entityId, debit, credit, currency, reference
 */
import { ACCOUNTS } from './chart-of-accounts.js';

export const LEDGER_COLLECTION = 'ledger_entries';

export const ledgerSchema = {
  _id: { type: 'ObjectId', required: true },
  accountCode: { type: 'string', required: true },
  entityId: { type: 'string', required: true }, // userId or 'system'
  debit: { type: 'number', default: 0 },
  credit: { type: 'number', default: 0 },
  currency: { type: 'string', default: 'USD' },
  reference: { type: 'string' },
  referenceType: { type: 'string' }, // deposit, withdrawal, trade, commission, pamm_alloc, pamm_fee, etc.
  referenceId: { type: 'string' },
  pammFundId: { type: 'string' },   // PAMM fund id for reporting by fund
  description: { type: 'string' },
  createdAt: { type: 'Date', required: true },
};

export const ledgerIndexes = [
  { keys: { entityId: 1, accountCode: 1, createdAt: -1 }, options: {} },
  { keys: { referenceType: 1, referenceId: 1 }, options: {} },
  { keys: { pammFundId: 1, createdAt: -1 }, options: {} },
  { keys: { createdAt: -1 }, options: {} },
  { keys: { entityId: 1, createdAt: -1 }, options: {} },
];

/**
 * Unique index for WALLET ledger idempotency (DB-level duplicate prevention).
 * One WALLET event per (accountCode, entityId, referenceType, referenceId).
 * Scoped with partialFilterExpression so PAMM/other accounts are not affected.
 * Do NOT add to ledgerIndexes in ensure-indexes.js — create only after duplicates
 * are resolved via scripts/ensure-wallet-ledger-unique-index.js.
 */
export const WALLET_LEDGER_UNIQUE_INDEX = {
  keys: { accountCode: 1, entityId: 1, referenceType: 1, referenceId: 1 },
  options: {
    unique: true,
    name: 'wallet_event_unique',
    partialFilterExpression: { accountCode: ACCOUNTS.WALLET },
  },
};
