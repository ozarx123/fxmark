/**
 * Ledger model — double-entry accounting
 * Entries: accountCode, entityId, debit, credit, currency, reference
 */
export const LEDGER_COLLECTION = 'ledger_entries';

export const ledgerSchema = {
  _id: { type: 'ObjectId', required: true },
  accountCode: { type: 'string', required: true },
  entityId: { type: 'string', required: true }, // userId or 'system'
  debit: { type: 'number', default: 0 },
  credit: { type: 'number', default: 0 },
  currency: { type: 'string', default: 'USD' },
  reference: { type: 'string' },
  referenceType: { type: 'string' }, // deposit, withdrawal, trade, commission, pamm, etc.
  referenceId: { type: 'string' },
  description: { type: 'string' },
  createdAt: { type: 'Date', required: true },
};

export const ledgerIndexes = [
  { keys: { entityId: 1, accountCode: 1, createdAt: -1 }, options: {} },
  { keys: { referenceType: 1, referenceId: 1 }, options: {} },
  { keys: { createdAt: -1 }, options: {} },
  { keys: { entityId: 1, createdAt: -1 }, options: {} },
];
