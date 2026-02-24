/**
 * IB routes — profile, balance, commissions, payouts
 */
import express from 'express';
import controller from './ib.controller.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();
router.use(authenticate);

router.get('/profile', controller.getMyProfile);
router.post('/register', controller.registerAsIb);
router.patch('/profile', controller.updateProfile);
router.get('/balance', controller.getBalance);
router.get('/commissions', controller.listCommissions);
router.get('/payouts', controller.listPayouts);
router.get('/referrals', controller.listReferrals);
router.post('/payouts', controller.requestPayout);

export default router;
