/**
 * Trade Manager / PAMM routes
 * Managers list, profile, follow, unfollow, withdraw, allocations, trades
 */
import express from 'express';
import controller from './pamm.controller.js';
import { authenticate, optionalAuthenticate } from '../../core/middleware.js';

const router = express.Router();

// Lightweight config endpoint for frontend (no auth required)
router.get('/config', controller.getConfig);

// Specific routes first so "me" is not captured as :managerId
router.get('/managers/me', authenticate, controller.getMyManager);
router.get('/managers/me/funds', authenticate, controller.getMyFunds);
router.get('/managers/me/allocations', authenticate, controller.getMyAllocations);
router.get('/managers/me/follower-trades', authenticate, controller.getMyFollowerTrades);
router.get('/managers/me/investors', authenticate, controller.getMyInvestors);
router.get('/managers/me/investor-detail', authenticate, controller.getInvestorDetail);
router.get('/managers/me/trades', authenticate, controller.getMyTrades);
router.get('/managers', controller.listManagers);
router.get('/managers/:managerId', controller.getManager);
router.get('/managers/:managerId/trades', controller.getTrades);

// Investor-facing fund detail
router.get('/funds/:fundId', optionalAuthenticate, controller.getFundDetail);

// All routes below require auth
router.use(authenticate);

// Manager/admin endpoints (keep enabled so admins/managers can manage PAMM)
router.post('/managers', controller.registerAsManager);
router.post('/managers/me/trading-account', controller.createPammTradingAccount);
router.get('/managers/me/trading-account', controller.getPammTradingAccount);
router.patch('/managers/me', controller.updateManagerProfile);

// Investor actions — blocking handled per-fund in service (classic PAMM only; PAMM AI stays enabled)
router.post('/accept-terms', controller.acceptTerms);
router.post('/follow', controller.follow);
router.post('/unfollow', controller.unfollow);
router.post('/add-funds', controller.addFunds);
router.post('/withdraw', controller.withdraw);

export default router;
