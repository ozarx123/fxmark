/**
 * HTTP server bootstrap
 * Listens on port from env; attaches app and graceful shutdown
 */
const app = require('./app');
const config = require('../config/env.config');

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`FXMARK server running on port ${PORT} (${config.nodeEnv})`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = server;
