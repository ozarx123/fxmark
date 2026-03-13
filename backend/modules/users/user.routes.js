import express from 'express';
import controller from './user.controller.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();
router.use(authenticate);
router.get('/profile', controller.getProfile);
router.patch('/profile', controller.updateProfile);
router.get('/kyc', controller.getKyc);
router.post('/kyc/submit', controller.submitKyc);

export default router;
