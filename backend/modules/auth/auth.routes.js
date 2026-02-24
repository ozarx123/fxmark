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

export default router;
