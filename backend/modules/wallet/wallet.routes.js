/**
 * Wallet routes
 * GET /balance, /deposits, /withdrawals; POST deposit/withdraw actions (protected)
 */
import express from 'express';
import controller from './transaction.controller.js';
import { authenticate } from '../../core/middleware.js';
import { rateLimit } from '../../core/rateLimit.middleware.js';

const router = express.Router();
router.use(authenticate);

const withdrawalRequestLimit = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => (req.user?.id ? `wallet:withdraw:req:${req.user.id}` : null),
  message: 'Too many withdrawal requests. Maximum 5 per minute.',
});
const withdrawalProcessLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => (req.user?.id ? `wallet:withdraw:proc:${req.user.id}` : null),
  message: 'Too many withdrawal process attempts. Try again shortly.',
});
router.get('/balance', controller.getBalance);
router.get('/payment-methods', controller.getPaymentMethods);
router.get('/deposits', controller.listDeposits);
router.get('/withdrawals', controller.listWithdrawals);
router.get('/trades', controller.listTrades);
router.get('/transfers', controller.listTransfers);
router.post('/deposits/nowpayments', controller.createNowpaymentsDeposit);
router.post('/deposits', controller.createDeposit);
router.post('/deposits/:id/confirm', controller.confirmDeposit);
router.post('/withdrawals', withdrawalRequestLimit, controller.requestWithdrawal);
router.post('/withdrawals/:id/process', withdrawalProcessLimit, controller.processWithdrawal);
router.get('/transfer/lookup', controller.lookupTransferRecipient);
router.post('/transfer', controller.executeTransfer);

export default router;
