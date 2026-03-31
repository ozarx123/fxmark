import { getDb } from '../../config/mongo.js';

export const PAMM_RESERVE_TRANSACTIONS_COLLECTION = 'pamm_reserve_transactions';

export const pammReserveTransactionsSchema = {
  _id: { type: 'ObjectId', required: true },
  fundId: { type: 'string', required: true },
  managerId: { type: 'string', required: true },
  investorId: { type: 'string', required: false },
  positionId: { type: 'string', required: false },
  amount: { type: 'number', required: true },
  transactionType: {
    type: 'string',
    required: true, // overflow_credit | distribution_debit | distribution_credit
  },
  reference: { type: 'string', required: true },
  createdAt: { type: 'Date', required: true },
};

export const pammReserveTransactionsIndexes = [
  {
    keys: { reference: 1 },
    options: { unique: true, name: 'pamm_reserve_transactions_reference_unique' },
  },
  { keys: { fundId: 1, createdAt: -1 }, options: { name: 'pamm_reserve_transactions_fund_created' } },
  { keys: { managerId: 1, createdAt: -1 }, options: { name: 'pamm_reserve_transactions_manager_created' } },
];

export async function ensurePammReserveTransactionsIndexes() {
  const db = await getDb();
  const col = db.collection(PAMM_RESERVE_TRANSACTIONS_COLLECTION);
  for (const idx of pammReserveTransactionsIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }
}
