const PROFILES_COLLECTION = 'ib_profiles';
const COMMISSIONS_COLLECTION = 'ib_commissions';
const PAYOUTS_COLLECTION = 'ib_payouts';

const profileSchema = {
  _id: { type: 'ObjectId', required: true },
  userId: { type: 'string', required: true },
  parentId: { type: 'string' },
  ratePerLot: { type: 'number', default: 7 },
  currency: { type: 'string', default: 'USD' },
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

const commissionSchema = {
  _id: { type: 'ObjectId', required: true },
  ibId: { type: 'string', required: true },
  tradeId: { type: 'string' },
  clientUserId: { type: 'string' },
  volume: { type: 'number', required: true },
  symbol: { type: 'string' },
  ratePerLot: { type: 'number', required: true },
  amount: { type: 'number', required: true },
  currency: { type: 'string', default: 'USD' },
  status: { type: 'string', required: true },
  payoutId: { type: 'string' },
  paidAt: { type: 'Date' },
  createdAt: { type: 'Date', required: true },
};

const payoutSchema = {
  _id: { type: 'ObjectId', required: true },
  ibId: { type: 'string', required: true },
  amount: { type: 'number', required: true },
  currency: { type: 'string', default: 'USD' },
  status: { type: 'string', required: true },
  requestedAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

const profileIndexes = [
  { keys: { userId: 1 }, options: { unique: true } },
  { keys: { parentId: 1 }, options: {} },
];
const commissionIndexes = [
  { keys: { ibId: 1, status: 1 }, options: {} },
  { keys: { ibId: 1, createdAt: -1 }, options: {} },
];
const payoutIndexes = [
  { keys: { ibId: 1, requestedAt: -1 }, options: {} },
  { keys: { ibId: 1, status: 1 }, options: {} },
];

export {
  PROFILES_COLLECTION,
  COMMISSIONS_COLLECTION,
  PAYOUTS_COLLECTION,
  profileSchema,
  commissionSchema,
  payoutSchema,
  profileIndexes,
  commissionIndexes,
  payoutIndexes,
};
