/**
 * Central logger
 * Structured logs with level and request context
 */
const log = (level, message, meta = {}) => {
  const entry = { level, message, ...meta, timestamp: new Date().toISOString() };
  console.log(JSON.stringify(entry));
};

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
