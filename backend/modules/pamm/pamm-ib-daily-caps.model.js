import { getDb } from '../../config/mongo.js';

export const PAMM_IB_DAILY_CAPS_COLLECTION = 'pamm_ib_daily_caps';

export const pammIbDailyCapsSchema = {
  _id: { type: 'ObjectId', required: true },
  fundId: { type: 'string', required: true },
  investorId: { type: 'string', required: true },
  ibUserId: { type: 'string', required: true },
  level: { type: 'number', required: true },
  dateKeyUtc: { type: 'string', required: true }, // YYYY-MM-DD
  startOfDayActiveCapital: { type: 'number', required: true },
  ibDailyCapAmount: { type: 'number', required: true },
  ibCreditedToday: { type: 'number', required: true },
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

export const pammIbDailyCapsIndexes = [
  {
    keys: { fundId: 1, investorId: 1, ibUserId: 1, level: 1, dateKeyUtc: 1 },
    options: { unique: true, name: 'pamm_ib_daily_caps_unique' },
  },
  { keys: { fundId: 1, dateKeyUtc: -1 }, options: { name: 'pamm_ib_daily_caps_fund_date' } },
  { keys: { ibUserId: 1, dateKeyUtc: -1 }, options: { name: 'pamm_ib_daily_caps_ib_date' } },
];

export async function ensurePammIbDailyCapsIndexes() {
  const db = await getDb();
  const col = db.collection(PAMM_IB_DAILY_CAPS_COLLECTION);
  for (const idx of pammIbDailyCapsIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }
}
