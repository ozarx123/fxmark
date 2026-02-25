/**
 * Express app setup
 * CORS, JSON body, routes, error handler
 */
import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import { requestId, errorHandler } from './middleware.js';

const app = express();
app.get('/', (req, res) => res.json({ status: 'ok', service: 'fxmark-backend' }));
app.use(cors());
app.use(express.json());
app.use(requestId);
app.use('/api', routes);
app.use(errorHandler);

export default app;
