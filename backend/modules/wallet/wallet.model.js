/**
 * Wallet / balance model
 * User balances, currency, ledger link
 */
const walletSchema = {
  id: 'uuid',
  userId: 'uuid',
  currency: 'string',
  balance: 'decimal',
  locked: 'decimal',
  updatedAt: 'timestamp',
};

module.exports = { walletSchema };
