/**
 * Redis configuration (ElastiCache)
 * Primary + Replica replication group
 */
module.exports = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_PREFIX || 'fxmark:',
  maxRetriesPerRequest: 3,
};
