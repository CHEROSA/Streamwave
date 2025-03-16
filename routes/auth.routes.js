const express = require('express');
const { 
  registerUser, 
  authenticateUser, 
  refreshToken, 
  logoutUser, 
  getCurrentUser 
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Create a router
const router = express.Router();

// Configure rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per window
  message: { success: false, error: "Too many login attempts, please try again after 15 minutes." },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  message: { success: false, error: "Too many registration attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth routes with rate limiting
router.post('/register', registerLimiter, registerUser);
router.post('/login', loginLimiter, authenticateUser);
router.post('/refresh-token', refreshToken);
router.post('/logout', logoutUser);
router.get('/me', protect, getCurrentUser);

// OAuth routes (handled by Keycloak)
router.get('/oauth/callback', (req, res) => {
  // This will be handled by Keycloak middleware
  res.status(200).json({ message: 'OAuth callback handled by Keycloak' });
});

module.exports = router;
