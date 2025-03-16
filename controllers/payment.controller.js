const stripe = require('../config/stripe-client');
const User = require('../models/user.model');
const Gift = require('../models/gift.model');
const Transaction = require('../models/transaction.model');
const StripeService = require('../services/stripe');
const BTCPayService = require('../services/btcpay');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../utils/constants');
const repositoryFactory = require('../repositories/repository.factory');
const { repositoryFactory: newRepositoryFactory } = require('../repositories');
const asyncHandler = require('../middleware/asyncHandler');

class PaymentController {
  constructor() {
    // Get repositories
    this.paymentRepository = repositoryFactory.getPaymentRepository();
    this.userRepository = repositoryFactory.getUserRepository();
    this.streamRepository = repositoryFactory.getStreamRepository();

    // Bind all methods to this instance
    this.createPaymentIntent = this.createPaymentIntent.bind(this);
    this.createSubscription = this.createSubscription.bind(this);
    this.cancelSubscription = this.cancelSubscription.bind(this);
    this.getPaymentHistory = this.getPaymentHistory.bind(this);
    this.handleWebhook = this.handleWebhook.bind(this);
    this.getVirtualGifts = this.getVirtualGifts.bind(this);
    this.purchaseVirtualGift = this.purchaseVirtualGift.bind(this);
    this.getCryptoPaymentAddress = this.getCryptoPaymentAddress.bind(this);
    this.btcpayWebhookHandler = this.btcpayWebhookHandler.bind(this);
    this.getGiftHistory = this.getGiftHistory.bind(this);
    this.getCoinBalance = this.getCoinBalance.bind(this);
    this.handleStripeCheckout = this.handleStripeCheckout.bind(this);
    this.handleCryptoPayment = this.handleCryptoPayment.bind(this);
  }

  async createPaymentIntent(req, res) {
    const { amount, currency = 'usd', metadata = {} } = req.body;
    const userId = req.user.id;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: 'Invalid amount' 
      });
    }

    try {
      // Get user from request (provided by authenticate middleware)
      const user = req.user;
      
      // Add debug logging
      console.log('User in payment intent:', user);
      console.log('User verification status:', user.isVerified);
      
      // Check if user exists and is verified
      if (!user || !user.isVerified) {
        console.log('User verification failed:', user ? 'Not verified' : 'No user');
        return res.status(403).json({
          success: false,
          message: 'User verification required to process payments.'
        });
      }

      // Get or create Stripe customer
      const userRepository = repositoryFactory.getUserRepository();
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await StripeService.createCustomer(user);
        customerId = customer.id;
        await userRepository.update(userId, { stripeCustomerId: customerId });
      }

      // Create payment intent
      const paymentIntent = await StripeService.createPaymentIntent(
        customerId,
        amount,
        currency,
        { userId, ...metadata }
      );

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } catch (error) {
      logger.error(`Payment intent creation error: ${error.message}`);
      
      // Provide more detailed error responses based on the type of error
      if (error.type === 'StripeCardError') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Your card was declined.',
          code: error.code,
          decline_code: error.decline_code
        });
      } else if (error.type === 'StripeRateLimitError') {
        return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
          success: false,
          message: 'Too many requests made to the API too quickly.'
        });
      } else if (error.type === 'StripeInvalidRequestError') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid parameters were supplied to Stripe API.'
        });
      } else if (error.type === 'StripeAPIError') {
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'An error occurred with our connection to Stripe.'
        });
      } else if (error.type === 'StripeConnectionError') {
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Network communication with Stripe failed.'
        });
      } else if (error.type === 'StripeAuthenticationError') {
        logger.error('Stripe authentication error - check API keys');
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Payment processing unavailable at this time.'
        });
      } else {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'An unexpected error occurred when processing your payment.'
        });
      }
    }
  }

  async createSubscription(req, res) {
    const { priceId, metadata = {} } = req.body;
    const userId = req.user.id;

    // Validate price ID
    if (!priceId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: 'Price ID is required' 
      });
    }

    // Create subscription using repository
    const subscriptionData = {
      userId,
      priceId,
      metadata
    };
    
    const result = await this.paymentRepository.createSubscription(subscriptionData);
    
    res.json({
      success: true,
      subscriptionId: result.subscription.id,
      clientSecret: result.subscription.latest_invoice?.payment_intent?.client_secret,
      status: result.subscription.status
    });
  }

  async cancelSubscription(req, res) {
    const { subscriptionId } = req.params;
    const { immediate = false, reason } = req.body;
    const userId = req.user.id;

    // Validate subscription ID
    if (!subscriptionId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: 'Subscription ID is required' 
      });
    }

    // Cancel subscription using repository
    const result = await this.paymentRepository.cancelSubscription(subscriptionId, {
      userId,
      immediate,
      reason
    });
    
    res.json({
      success: true,
      status: result.subscription.status,
      message: immediate ? 'Subscription canceled' : 'Subscription will be canceled at the end of the billing period'
    });
  }

  async getPaymentHistory(req, res) {
    const { page = 1, limit = 10, type } = req.query;
    const userId = req.user.id;

    // Get transaction history using repository
    const transactions = await this.paymentRepository.getUserTransactions(userId, {
      type,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    const total = await this.paymentRepository.count({ 
      userId,
      ...(type ? { type } : {})
    });
    
    res.json({
      success: true,
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  }

  async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    
    try {
      // Verify webhook signature
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      
      // Handle different event types
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }
      
      res.status(HTTP_STATUS.OK).json({ received: true });
    } catch (err) {
      logger.error(`Webhook error: ${err.message}`);
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Webhook Error: ${err.message}`
      });
    }
  }

  async getVirtualGifts(req, res) {
    const { category } = req.query;

    // Get virtual gifts using repository
    const gifts = await this.paymentRepository.getVirtualGifts({
      category,
      isActive: true
    });
    
    res.json({
      success: true,
      gifts,
      count: gifts.length
    });
  }

  async purchaseVirtualGift(req, res) {
    const { giftId, receiverId, streamId, message } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!giftId || !receiverId || !streamId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: 'Gift ID, receiver ID, and stream ID are required' 
      });
    }

    // Check if stream exists
    const stream = await this.streamRepository.findById(streamId);
    if (!stream) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Stream not found'
      });
    }

    // Purchase gift using repository
    const result = await this.paymentRepository.purchaseVirtualGift({
      userId,
      giftId,
      receiverId,
      streamId,
      message
    });
    
    res.json({
      success: true,
      gift: result.gift,
      transaction: result.transaction,
      remainingCoins: result.deductedCoins
    });
  }

  async getCryptoPaymentAddress(req, res) {
    const { amount, currency = 'USD', metadata = {} } = req.body;
    const userId = req.user.id;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: 'Invalid amount' 
      });
    }

    // Get crypto payment address using repository
    const result = await this.paymentRepository.getCryptoPaymentAddress({
      userId,
      amount,
      currency,
      metadata
    });
    
    res.json({
      success: true,
      paymentUrl: result.invoice.checkoutLink,
      invoiceId: result.invoice.id,
      expiresAt: result.invoice.expiresAt
    });
  }

  async btcpayWebhookHandler(req, res) {
    // Process webhook using repository
    await this.paymentRepository.handlePaymentWebhook('btcpay', req.body);
    
    // Return 200 status to acknowledge receipt
    res.status(HTTP_STATUS.OK).json({ received: true });
  }

  async getGiftHistory(req, res) {
    const { type = 'received', page = 1, limit = 10 } = req.query;
    const userId = req.user.id;

    // Get gift history based on type using repository
    let gifts = [];
    if (type === 'sent') {
      gifts = await this.paymentRepository.getUserGiftsSent(userId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });
    } else {
      gifts = await this.paymentRepository.getUserGiftsReceived(userId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });
    }
    
    res.json({
      success: true,
      gifts,
      count: gifts.length
    });
  }

  async getCoinBalance(req, res) {
    const userId = req.user.id;

    // Get user to check coin balance
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      coins: user.coins || 0
    });
  }

  async handleStripeCheckout(req, res) {
    const { amount, currency = 'usd', successUrl, cancelUrl, metadata = {} } = req.body;
    const userId = req.user.id;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    try {
      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: 'StreamWave Credits',
                description: 'Purchase credits for StreamWave platform'
              },
              unit_amount: amount
            },
            quantity: 1
          }
        ],
        mode: 'payment',
        success_url: successUrl || `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment/cancel`,
        metadata: {
          userId,
          ...metadata
        }
      });
      
      res.status(HTTP_STATUS.OK).json({
        success: true,
        sessionId: session.id,
        url: session.url
      });
    } catch (error) {
      logger.error(`Stripe checkout error: ${error.message}`);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to create checkout session'
      });
    }
  }

  async handleCryptoPayment(req, res) {
    const { paymentId, transactionHash } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!paymentId || !transactionHash) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Payment ID and transaction hash are required'
      });
    }
    
    try {
      // Verify the transaction with BTCPay service
      const verified = await BTCPayService.verifyTransaction(paymentId, transactionHash);
      
      if (!verified) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Transaction verification failed'
        });
      }
      
      // Update payment status in database
      const payment = await this.paymentRepository.updatePaymentStatus(paymentId, 'completed', {
        transactionHash
      });
      
      res.status(HTTP_STATUS.OK).json({
        success: true,
        payment
      });
    } catch (error) {
      logger.error(`Crypto payment error: ${error.message}`);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to process cryptocurrency payment'
      });
    }
  }
}

// Create a single instance and export it
const paymentController = new PaymentController();

// Debug logging
console.log('Payment Controller Methods:', Object.getOwnPropertyNames(PaymentController.prototype));
console.log('Payment Controller Instance:', paymentController);
console.log('Available Methods:', Object.keys(paymentController));

module.exports = paymentController;
