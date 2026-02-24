/**
 * Normal trade APIs — accounts, orders, positions
 */
import express from 'express';
import controller from './trading.controller.js';
import accountController from './trading-account.controller.js';
import { resolveTradingAccount } from './trading-account.middleware.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();
router.use(authenticate);
router.use(resolveTradingAccount);

// Trading accounts
router.get('/accounts', accountController.listAccounts);
router.post('/accounts', accountController.createAccount);
router.get('/accounts/:accountId', accountController.getAccount);

// Orders
router.post('/orders', controller.placeOrder);
router.get('/orders', controller.listOrders);
router.get('/orders/:orderId', controller.getOrder);
router.post('/orders/:orderId/cancel', controller.cancelOrder);

// Positions (specific before :id)
router.get('/positions', controller.getOpenPositions);
router.get('/positions/closed', controller.getClosedPositions);
router.get('/positions/:positionId', controller.getPosition);
router.post('/positions/:positionId/close', controller.closePosition);

export default router;
