/**
 * API route aggregation (ESM)
 */
import express from 'express';
import { requireDb } from './middleware.js';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import walletRoutes from '../modules/wallet/wallet.routes.js';
import pammRoutes from '../modules/pamm/pamm.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import supportRoutes from '../modules/support/support.routes.js';
import financeRoutes from '../modules/finance/finance.routes.js';
import tradingRoutes from '../modules/trading/trading.routes.js';
import ibRoutes from '../modules/ib/ib.routes.js';

const router = express.Router();
router.use(requireDb);

router.use('/auth', authRoutes);
router.use('/trading', tradingRoutes);
router.use('/ib', ibRoutes);
router.use('/users', userRoutes);
router.use('/wallet', walletRoutes);
router.use('/pamm', pammRoutes);
router.use('/admin', adminRoutes);
router.use('/support', supportRoutes);
router.use('/finance', financeRoutes);

router.get('/health', (req, res) => res.json({ status: 'ok' }));

export default router;
