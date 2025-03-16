/**
 * Minimal server to identify issue
 */
// Load .env file
require('dotenv').config();

// Set test Stripe key if not in .env
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = 'sk_test_51MjFgkJMgvmDDRFTijIOI2QqUjVXcxJfBvRTzlxQF3aBTcLZGCRtUYTGHLNbnT0TgTSz8zKm6BPdQSLYvvkfWXVu00V5gR7JAv';
}

const express = require('express');
const logger = require('./utils/logger');

// Create minimal Express app
const app = express();

// Basic middleware
app.use(express.json());

// Stripe webhook processing needs raw body
app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));

// Simple test route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Mock authentication endpoint for testing
app.post('/api/auth/login', (req, res) => {
  res.status(200).json({
    token: 'test_token_for_development',
    user: {
      id: 1,
      name: 'Test User',
      email: 'test@example.com'
    }
  });
});

// Temporarily modify payment routes to bypass authentication
app.use((req, res, next) => {
  // Add a fake authenticated user for testing
  req.user = {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    isVerified: true  // Set to true to pass verification check
  };
  next();
});

// Import and use payment routes
const paymentRoutes = require('./routes/payment.routes');
app.use('/api/payments', paymentRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({
    error: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`Minimal server started on port ${PORT}`);
}); 