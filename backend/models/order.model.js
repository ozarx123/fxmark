const COLLECTION = 'orders';

const schema = {
  _id: { type: 'ObjectId', required: true },
  userId: { type: 'string', required: true },
  symbol: { type: 'string', required: true },
  side: { type: 'string', required: true },
  type: { type: 'string', required: true },
  volume: { type: 'number', required: true },
  price: { type: 'number' },
  status: { type: 'string', required: true },
  filledVolume: { type: 'number', default: 0 },
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

const indexes = [
  { keys: { userId: 1, createdAt: -1 }, options: {} },
  { keys: { userId: 1, status: 1 }, options: {} },
  { keys: { userId: 1, symbol: 1 }, options: {} },
];

export { COLLECTION, schema, indexes };
