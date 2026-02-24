const WALLETS_COLLECTION = 'wallets';
const TRANSACTIONS_COLLECTION = 'wallet_transactions';

const walletSchema = {
  _id: { type: 'ObjectId', required: true },
  userId: { type: 'string', required: true },
  currency: { type: 'string', required: true, default: 'USD' },
  balance: { type: 'number', required: true, default: 0 },
  locked: { type: 'number', default: 0 },
  updatedAt: { type: 'Date', required: true },
};

const transactionSchema = {
  _id: { type: 'ObjectId', required: true },
  userId: { type: 'string', required: true },
  type: { type: 'string', required: true },
  amount: { type: 'number', required: true },
  currency: { type: 'string', default: 'USD' },
  status: { type: 'string', required: true },
  reference: { type: 'string' },
  destination: { type: 'string' },
  createdAt: { type: 'Date', required: true },
  completedAt: { type: 'Date' },
};

const walletIndexes = [
  { keys: { userId: 1, currency: 1 }, options: { unique: true } },
];
const transactionIndexes = [
  { keys: { userId: 1, createdAt: -1 }, options: {} },
  { keys: { userId: 1, type: 1 }, options: {} },
];

export {
  WALLETS_COLLECTION,
  TRANSACTIONS_COLLECTION,
  walletSchema,
  transactionSchema,
  walletIndexes,
  transactionIndexes,
};
