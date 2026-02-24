const COLLECTION = 'positions';

const schema = {
  _id: { type: 'ObjectId', required: true },
  userId: { type: 'string', required: true },
  symbol: { type: 'string', required: true },
  side: { type: 'string', required: true },
  volume: { type: 'number', required: true },
  openPrice: { type: 'number', required: true },
  currentPrice: { type: 'number' },
  pnl: { type: 'number', default: 0 },
  openedAt: { type: 'Date', required: true },
  closedAt: { type: 'Date' },
  closedVolume: { type: 'number' },
  updatedAt: { type: 'Date', required: true },
};

const indexes = [
  { keys: { userId: 1, closedAt: 1 }, options: {} },
  { keys: { userId: 1, symbol: 1, closedAt: 1 }, options: {} },
  { keys: { userId: 1, openedAt: -1 }, options: {} },
];

export { COLLECTION, schema, indexes };
