const COLLECTION = 'refresh_tokens';

const schema = {
  _id: { type: 'ObjectId', required: true },
  userId: { type: 'string', required: true },
  jti: { type: 'string', required: true },
  expiresAt: { type: 'Date', required: true },
  createdAt: { type: 'Date', required: true },
};

const indexes = [
  { keys: { jti: 1 }, options: {} },
  { keys: { userId: 1 }, options: {} },
];

export { COLLECTION, schema, indexes };
