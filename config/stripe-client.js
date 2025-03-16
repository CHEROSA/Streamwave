/**
 * Centralized Stripe client configuration
 * All Stripe API calls should use this client to ensure consistent configuration
 */
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16', // Always specify API version
  appInfo: {
    name: 'StreamWave',
    version: '1.0.0'
  },
  // Optional: Set timeout and max network retries for better resilience
  timeout: 30000, // 30 seconds
  maxNetworkRetries: 2
});

module.exports = stripe; 