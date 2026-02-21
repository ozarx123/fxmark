/**
 * Express app setup
 * CORS, JSON body, routes, error handler
 */
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const middleware = require('./middleware');

const app = express();
app.use(cors());
app.use(express.json());
app.use(middleware.requestId);
app.use('/api', routes);
app.use(middleware.errorHandler);

module.exports = app;
