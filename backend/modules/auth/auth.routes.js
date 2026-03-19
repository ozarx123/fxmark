import express from 'express';
import controller from './auth.controller.js';
import { authenticate } from '../../core/middleware.js';

const router = express.Router();
router.post('/register', controller.register);
router.post('/signup', controller.register); // alias for frontend
router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.me);
router.post('/change-password', authenticate, controller.changePassword);
router.post('/change-investor-password', authenticate, controller.changeInvestorPassword);
// Email verification (GET for link in email, POST for API call with token)
router.get('/verify-email', controller.verifyEmail);
router.post('/verify-email', controller.verifyEmail);
router.post('/resend-verification', controller.resendVerification);
// Browsers/bookmarks hit GET — explain instead of raw "Cannot GET"
router.get('/resend-verification', (req, res) => {
  res.status(405).set('Allow', 'POST').json({
    error: 'Method not allowed',
    hint: 'Use POST /api/auth/resend-verification with JSON body: { "email": "user@example.com" }',
  });
});

export default router;
