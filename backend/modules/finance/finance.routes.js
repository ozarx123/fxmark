/**
 * Finance routes — ledger, reports, P&L, reconciliation, chart of accounts, statements
 */
import express from 'express';
import reportsController from './reports.controller.js';
import ledgerController from './ledger.controller.js';
import chartOfAccountsController from './chart-of-accounts.controller.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();
router.use(authenticate);

// Ledger
router.get('/ledger/entries', ledgerController.getEntries);
router.get('/ledger/balances', ledgerController.getBalances);
router.get('/ledger/pnl', ledgerController.getPnl);
router.get('/ledger/reconciliation', ledgerController.getReconciliation);
router.get('/ledger/pamm/:fundId', ledgerController.getPammFundLedger);

// Chart of accounts
router.get('/chart-of-accounts', chartOfAccountsController.getChartOfAccounts);

// Reports & statements
router.get('/reports/daily', reportsController.dailyReport);
router.get('/reports/monthly', reportsController.monthlyReport);
router.get('/statements', reportsController.statement);

export default router;
