/**
 * Input validation helpers
 * Sanitize and validate request payloads
 */
const validateEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');

const validateRequired = (obj, keys) => {
  const missing = keys.filter((k) => obj[k] == null || obj[k] === '');
  return missing.length === 0 ? null : missing;
};

module.exports = { validateEmail, validateRequired };
