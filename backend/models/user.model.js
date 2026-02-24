const COLLECTION = 'users';

const schema = {
  _id: { type: 'ObjectId', required: true },
  email: { type: 'string', required: true, unique: true },
  passwordHash: { type: 'string', required: true },
  role: { type: 'string', default: 'user' },
  kycStatus: { type: 'string', default: 'pending' },
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

const indexes = [
  { keys: { email: 1 }, options: { unique: true } },
];

export { COLLECTION, schema, indexes };
