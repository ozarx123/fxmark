/**
 * Support routes
 * POST /tickets, GET /tickets, POST /tickets/:id/reply (protected)
 */
import express from 'express';
import controller from './tickets.controller.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();
router.use(authenticate);
router.post('/tickets', controller.create);
router.get('/tickets', controller.list);
router.post('/tickets/:id/reply', controller.reply);

export default router;
