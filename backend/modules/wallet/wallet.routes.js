/**
 * Wallet routes
 * GET /balance, /deposits, /withdrawals; POST deposit/withdraw actions (protected)
 */
import express from 'express';
import controller from './transaction.controller.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();
router.use(authenticate);
router.get('/balance', controller.getBalance);
router.get('/deposits', controller.listDeposits);
router.get('/withdrawals', controller.listWithdrawals);
router.get('/trades', controller.listTrades);
router.get('/transfers', controller.listTransfers);
router.post('/deposits', controller.createDeposit);
router.post('/deposits/:id/confirm', controller.confirmDeposit);
router.post('/withdrawals', controller.requestWithdrawal);
router.post('/withdrawals/:id/process', controller.processWithdrawal);
router.get('/transfer/lookup', controller.lookupTransferRecipient);
router.post('/transfer', controller.executeTransfer);

export default router;
