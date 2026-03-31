import { getDb } from '../../config/mongo.js';

export const PAMM_RESERVE_WALLETS_COLLECTION = 'pamm_reserve_wallets';
export const PAMM_RESERVE_WALLET_TYPE = 'pamm_ai_reserve';

export const pammReserveWalletsSchema = {
  _id: { type: 'ObjectId', required: true },
  fundId: { type: 'string', required: true },
  managerId: { type: 'string', required: true },
  currency: { type: 'string', required: true },
  walletType: { type: 'string', required: true, default: PAMM_RESERVE_WALLET_TYPE },
  balance: { type: 'number', required: true },
  status: { type: 'string', required: true }, // e.g. active, suspended
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

export const pammReserveWalletsIndexes = [
  {
    keys: { fundId: 1, walletType: 1 },
    options: { unique: true, name: 'pamm_reserve_wallets_unique' },
  },
  { keys: { managerId: 1, updatedAt: -1 }, options: { name: 'pamm_reserve_wallets_manager_updated' } },
];

export async function ensurePammReserveWalletsIndexes() {
  const db = await getDb();
  const col = db.collection(PAMM_RESERVE_WALLETS_COLLECTION);
  for (const idx of pammReserveWalletsIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }
}
