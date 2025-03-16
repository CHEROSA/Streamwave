/**
 * API Routes Index
 * 
 * This file centralizes all route registration with appropriate middleware.
 */
const express = require('express');
const router = express.Router();

// API documentation route
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to StreamWave API',
    version: '1.0.0',
    documentation: '/api/docs'
  });
});

module.exports = router;
