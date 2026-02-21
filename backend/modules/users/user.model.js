/**
 * User model / schema
 * Fields: id, email, passwordHash, salt, role, kycStatus, createdAt, etc.
 */
// Placeholder for ORM/DB schema
const userSchema = {
  id: 'uuid',
  email: 'string',
  passwordHash: 'string',
  salt: 'string',
  role: 'string',
  kycStatus: 'string',
  createdAt: 'timestamp',
  updatedAt: 'timestamp',
};

module.exports = { userSchema };
