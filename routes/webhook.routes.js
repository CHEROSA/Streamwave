/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from various services like Stripe, BTCPay, etc.
 */
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const stripe = require('../config/stripe-client');
const paymentController = require('../controllers/payment.controller');

/**
 * @route   POST /api/webhooks/:provider
 * @desc    Handle webhooks from various providers
 * @access  Public
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    logger.info('Processing Stripe webhook');
    
    if (!sig) {
      logger.warn('No Stripe signature found in request headers');
      return res.status(400).json({ success: false, message: 'No Stripe signature found' });
    }

    try {
      // Verify and process the webhook
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      
      // Forward to the payment controller's handleWebhook function
      return paymentController.handleWebhook(req, res);
    } catch (error) {
      logger.error(`Stripe webhook verification error: ${error.message}`);
      return res.status(400).json({ success: false, message: `Webhook Error: ${error.message}` });
    }
  } catch (error) {
    logger.error(`Webhook processing error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Error processing webhook' });
  }
});

// Handle other webhook providers
router.post('/:provider', express.json(), async (req, res) => {
  try {
    const { provider } = req.params;
    
    if (provider === 'stripe') {
      return res.status(400).json({ 
        success: false, 
        message: 'Stripe webhooks should be sent to /api/webhooks/stripe endpoint' 
      });
    }
    
    logger.info(`Received webhook from ${provider}`);
    
    // Handle different providers
    switch (provider) {
      case 'btcpay':
        // Handle BTCPay webhook
        logger.info('Processing BTCPay webhook');
        break;
      
      default:
        logger.warn(`Unknown webhook provider: ${provider}`);
        return res.status(400).json({ success: false, message: `Unknown provider: ${provider}` });
    }
    
    // Respond with success to acknowledge receipt
    return res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    logger.error(`Webhook processing error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Error processing webhook' });
  }
});

module.exports = router; 