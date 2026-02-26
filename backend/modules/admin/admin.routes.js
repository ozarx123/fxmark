/**
 * Admin routes
 * GET /leads, POST /kyc-override, POST /pamm-privacy, POST /broadcast (protected, admin role)
 */
import express from 'express';
import controller from './admin.controller.js';
import { authenticate } from '../../core/middleware.js';

const requireAdmin = (req, res, next) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Super Admin role required' });
  }
  next();
};

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);
router.get('/leads', controller.getLeads);
router.get('/users', controller.listUsers);
router.patch('/users/:id', controller.updateUser);
router.get('/pamm/managers', controller.listPammManagers);
router.patch('/pamm/managers/:id', controller.approvePammManager);
router.post('/kyc-override', controller.kycOverride);
router.post('/pamm-privacy', controller.pammPrivacy);
router.post('/broadcast', controller.broadcast);
router.post('/wallets/:userId/add-funds', requireSuperAdmin, controller.addFundsToWallet);

// IB commission (admin)
router.get('/ib/profiles', controller.getIbProfiles);
router.get('/ib/commissions', controller.getIbCommissions);
router.get('/ib/wallets', controller.getIbWallets);
router.get('/ib/settings', controller.getIbSettings);
router.put('/ib/settings', controller.updateIbSettings);
router.post('/ib/:userId/payout', controller.processIbPayout);

export default router;
