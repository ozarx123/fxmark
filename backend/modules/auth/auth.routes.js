/**
 * Auth routes
 * POST /register, /login, /refresh; POST /logout, GET /me (protected)
 */
const express = require('express');
const controller = require('./auth.controller');
const { authenticate } = require('../../core/middleware');

const router = express.Router();
router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
