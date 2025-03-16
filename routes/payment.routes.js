const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Initialize payment controller
const paymentController = require('../controllers/payment.controller');

// Debug logging
console.log('Payment Controller:', paymentController);
console.log('Available Methods:', Object.keys(paymentController));
console.log('CreatePaymentIntent Type:', typeof paymentController.createPaymentIntent);
console.log('Is createPaymentIntent a function?', typeof paymentController.createPaymentIntent === 'function');

// Create middleware functions
const createPaymentIntentMiddleware = (req, res, next) => {
  try {
    paymentController.createPaymentIntent(req, res);
  } catch (error) {
    next(error);
  }
};

const createSubscriptionMiddleware = (req, res, next) => {
  try {
    paymentController.createSubscription(req, res);
  } catch (error) {
    next(error);
  }
};

const cancelSubscriptionMiddleware = (req, res, next) => {
  try {
    paymentController.cancelSubscription(req, res);
  } catch (error) {
    next(error);
  }
};

const getPaymentHistoryMiddleware = (req, res, next) => {
  try {
    paymentController.getPaymentHistory(req, res);
  } catch (error) {
    next(error);
  }
};

const handleWebhookMiddleware = (req, res, next) => {
  try {
    console.log('Stripe webhook received');
    paymentController.handleWebhook(req, res);
  } catch (error) {
    next(error);
  }
};

const btcpayWebhookHandlerMiddleware = (req, res, next) => {
  try {
    paymentController.btcpayWebhookHandler(req, res);
  } catch (error) {
    next(error);
  }
};

const getVirtualGiftsMiddleware = (req, res, next) => {
  try {
    paymentController.getVirtualGifts(req, res);
  } catch (error) {
    next(error);
  }
};

const purchaseVirtualGiftMiddleware = (req, res, next) => {
  try {
    paymentController.purchaseVirtualGift(req, res);
  } catch (error) {
    next(error);
  }
};

const getGiftHistoryMiddleware = (req, res, next) => {
  try {
    paymentController.getGiftHistory(req, res);
  } catch (error) {
    next(error);
  }
};

const getCryptoPaymentAddressMiddleware = (req, res, next) => {
  try {
    paymentController.getCryptoPaymentAddress(req, res);
  } catch (error) {
    next(error);
  }
};

const handleCryptoPaymentMiddleware = (req, res, next) => {
  try {
    paymentController.handleCryptoPayment(req, res);
  } catch (error) {
    next(error);
  }
};

const handleStripeCheckoutMiddleware = (req, res, next) => {
  try {
    paymentController.handleStripeCheckout(req, res);
  } catch (error) {
    next(error);
  }
};

const getCoinBalanceMiddleware = (req, res, next) => {
  try {
    paymentController.getCoinBalance(req, res);
  } catch (error) {
    next(error);
  }
};

// Payment intents and general payments
// TEMPORARILY REMOVED PROTECT MIDDLEWARE FOR TESTING
router.post('/create', createPaymentIntentMiddleware);
router.post('/intent', createPaymentIntentMiddleware);

// Subscriptions
router.post('/subscription', createSubscriptionMiddleware);
router.delete('/subscription/:subscriptionId', cancelSubscriptionMiddleware);

// Payment history
router.get('/history', getPaymentHistoryMiddleware);

// Webhooks (no authentication required for external services)
router.post('/webhook/btcpay', btcpayWebhookHandlerMiddleware);
router.post('/webhook/stripe', handleWebhookMiddleware);

// Virtual gifts
router.get('/gifts', getVirtualGiftsMiddleware);
router.post('/gifts/:giftId/purchase', purchaseVirtualGiftMiddleware);
router.get('/gifts/history', getGiftHistoryMiddleware);

// Cryptocurrency
router.post('/crypto', getCryptoPaymentAddressMiddleware);
router.post('/crypto-payment', handleCryptoPaymentMiddleware);

// Stripe checkout
router.post('/checkout/stripe', handleStripeCheckoutMiddleware);

// User coins
router.get('/coins', getCoinBalanceMiddleware);

module.exports = router;
