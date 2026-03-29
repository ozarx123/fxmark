const COLLECTION = 'users';

const schema = {
  _id: { type: 'ObjectId', required: true },
  email: { type: 'string', required: true, unique: true },
  passwordHash: { type: 'string', required: true },
  role: { type: 'string', default: 'user' },
  kycStatus: { type: 'string', default: 'pending' },
  kycSubmittedAt: { type: 'Date' },
  kycRejectedReason: { type: 'string' },
  createdAt: { type: 'Date', required: true },
  updatedAt: { type: 'Date', required: true },
};

const indexes = [
  { keys: { email: 1 }, options: { unique: true } },
  // One pending verification token per user; sparse so most users have no field
  { keys: { emailVerificationToken: 1 }, options: { unique: true, sparse: true } },
  // CRM / portal login number (numeric 10001+ or legacy FX…); sparse if some docs lack it
  { keys: { accountNo: 1 }, options: { unique: true, sparse: true } },
];

export { COLLECTION, schema, indexes };
