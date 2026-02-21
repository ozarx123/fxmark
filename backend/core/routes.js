/**
 * API route aggregation
 * Mounts module routes under /api
 */
const express = require('express');
const router = express.Router();

// Mount module routes when implemented
// const authRoutes = require('../modules/auth/auth.routes');
// router.use('/auth', authRoutes);

router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
