/**
 * Encryption / hashing utilities
 * Passwords, sensitive fields
 */
const crypto = require('crypto');

const hash = (value, salt = crypto.randomBytes(16).toString('hex')) => {
  const derived = crypto.pbkdf2Sync(value, salt, 100000, 64, 'sha512').toString('hex');
  return { hash: derived, salt };
};

const verify = (value, storedHash, salt) => {
  const { hash: derived } = hash(value, salt);
  return derived === storedHash;
};

module.exports = { hash, verify };
