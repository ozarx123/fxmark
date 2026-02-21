/**
 * Global middleware
 * Request ID, auth, error handler
 */
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || `req-${Date.now()}`;
  res.setHeader('x-request-id', req.id);
  next();
};

const authenticate = (req, res, next) => {
  const jwtStrategy = require('../modules/auth/jwt.strategy');
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = jwtStrategy.decode(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  req.user = payload;
  next();
};

const errorHandler = (err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    requestId: req.id,
  });
};

module.exports = { requestId, authenticate, errorHandler };
