/**
 * Trade Manager / PAMM routes
 * Managers list, profile, follow, unfollow, withdraw, allocations, trades
 */
import express from 'express';
import controller from './pamm.controller.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();

// Specific routes first so "me" is not captured as :managerId
router.get('/managers/me', authenticate, controller.getMyManager);
router.get('/managers/me/funds', authenticate, controller.getMyFunds);
router.get('/managers/me/allocations', authenticate, controller.getMyAllocations);
router.get('/managers/me/follower-trades', authenticate, controller.getMyFollowerTrades);
router.get('/managers/me/investors', authenticate, controller.getMyInvestors);
router.get('/managers/me/trades', authenticate, controller.getMyTrades);
router.get('/managers', controller.listManagers);
router.get('/managers/:managerId', controller.getManager);
router.get('/managers/:managerId/trades', controller.getTrades);

router.use(authenticate);
router.post('/managers', controller.registerAsManager);
router.post('/managers/me/trading-account', controller.createPammTradingAccount);
router.get('/managers/me/trading-account', controller.getPammTradingAccount);
router.patch('/managers/me', controller.updateManagerProfile);
router.post('/follow', controller.follow);
router.post('/unfollow', controller.unfollow);
router.post('/add-funds', controller.addFunds);
router.post('/withdraw', controller.withdraw);

export default router;
