/**
 * Database configuration (PostgreSQL)
 * Used by ORM / query layer for RDS Multi-AZ
 */
module.exports = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'fxmark',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  pool: {
    min: 1,
    max: 20,
    idleTimeoutMillis: 30000,
  },
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
};
