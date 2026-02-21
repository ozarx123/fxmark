/**
 * Ledger model (double-entry)
 * Entries: account, debit, credit, currency, reference
 */
const ledgerSchema = {
  id: 'uuid',
  accountId: 'uuid',
  debit: 'decimal',
  credit: 'decimal',
  currency: 'string',
  reference: 'string',
  createdAt: 'timestamp',
};

module.exports = { ledgerSchema };
