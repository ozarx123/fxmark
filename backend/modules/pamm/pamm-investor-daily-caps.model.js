import { getDb } from '../../config/mongo.js';

export const PAMM_INVESTOR_DAILY_CAPS_COLLECTION = 'pamm_investor_daily_caps';

export const pammInvestorDailyCapsSchema = {
  _id: { type: 'ObjectId', required: true },
  fundId: { type: 'string', required: true },
  investorId: { type: 'string', required: true },
  dateKeyUtc: { type: 'string', required: true }, // YYYY-MM-DD
  startOfDayActiveCapital: { type: 'number', required: true },
  investorDailyCapAmount: { type: 'number', required: true },
  investorCreditedToday: { type: 'number', required: true },
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

export const pammInvestorDailyCapsIndexes = [
  {
    keys: { fundId: 1, investorId: 1, dateKeyUtc: 1 },
    options: { unique: true, name: 'pamm_investor_daily_caps_unique' },
  },
  { keys: { fundId: 1, dateKeyUtc: -1 }, options: { name: 'pamm_investor_daily_caps_fund_date' } },
  { keys: { investorId: 1, dateKeyUtc: -1 }, options: { name: 'pamm_investor_daily_caps_investor_date' } },
];

export async function ensurePammInvestorDailyCapsIndexes() {
  const db = await getDb();
  const col = db.collection(PAMM_INVESTOR_DAILY_CAPS_COLLECTION);
  for (const idx of pammInvestorDailyCapsIndexes) {
    await col.createIndex(idx.keys, idx.options);
  }
}
