const MANAGERS_COLLECTION = 'pamm_managers';
const ALLOCATIONS_COLLECTION = 'pamm_allocations';
const TRADES_COLLECTION = 'manager_trades';

const managerSchema = {
  _id: { type: 'ObjectId', required: true },
  userId: { type: 'string', required: true },
  name: { type: 'string', default: 'My Strategy' },
  allocationPercent: { type: 'number', default: 100 },
  performanceFeePercent: { type: 'number', default: 0 },
  cutoffWithdrawEnabled: { type: 'boolean', default: false },
  isPublic: { type: 'boolean', default: true },
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

const allocationSchema = {
  _id: { type: 'ObjectId', required: true },
  followerId: { type: 'string', required: true },
  managerId: { type: 'string', required: true },
  allocatedBalance: { type: 'number', default: 0 },
  status: { type: 'string', required: true },
  withdrawRequested: { type: 'number' },
  withdrawRequestedAt: { type: 'Date' },
  createdAt: { type: 'Date', required: true },
  closedAt: { type: 'Date' },
  updatedAt: { type: 'Date', required: true },
};

const tradeSchema = {
  _id: { type: 'ObjectId', required: true },
  managerId: { type: 'string', required: true },
  symbol: { type: 'string' },
  side: { type: 'string' },
  volume: { type: 'number' },
  price: { type: 'number' },
  pnl: { type: 'number' },
  createdAt: { type: 'Date', required: true },
};

const managerIndexes = [
  { keys: { userId: 1 }, options: {} },
  { keys: { userId: 1, createdAt: -1 }, options: {} },
  { keys: { isPublic: 1 }, options: {} },
];
const allocationIndexes = [
  { keys: { followerId: 1, managerId: 1, status: 1 }, options: {} },
  { keys: { followerId: 1, createdAt: -1 }, options: {} },
  { keys: { managerId: 1, createdAt: -1 }, options: {} },
];
const tradeIndexes = [
  { keys: { managerId: 1, createdAt: -1 }, options: {} },
  { keys: { managerId: 1, symbol: 1 }, options: {} },
];

export {
  MANAGERS_COLLECTION,
  ALLOCATIONS_COLLECTION,
  TRADES_COLLECTION,
  managerSchema,
  allocationSchema,
  tradeSchema,
  managerIndexes,
  allocationIndexes,
  tradeIndexes,
};
