/**
 * HTTP server bootstrap
 * Listens on port from env; attaches app and graceful shutdown
 */
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

try {
  const app = (await import('./app.js')).default;
  const config = (await import('../config/env.config.js')).default;

  const server = app.listen(PORT, HOST, () => {
    console.log(`FXMARK server running on ${HOST}:${PORT} (${config.nodeEnv})`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (err) {
  console.error('Startup error:', err);
  process.exit(1);
}
