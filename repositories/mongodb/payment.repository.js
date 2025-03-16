/**
 * MongoDB implementation of Payment Repository
 * 
 * Implements all payment-related repository methods using MongoDB as the data store.
 */
const BaseRepository = require('../base.repository');
const { Transaction } = require('../../models/transaction.model');
const { Gift } = require('../../models/gift.model');
const { Payment } = require('../../models/payment.model');
const logger = require('../../utils/logger');
const cacheService = require('../../services/cache.service');

/**
 * Payment Repository MongoDB Implementation
 * @extends BaseRepository
 */
class PaymentRepositoryMongo extends BaseRepository {
  constructor() {
    super(Payment);
  }

  /**
   * Create a transaction
   * @param {Object} transactionData - Transaction data
   * @returns {Promise<Object>} - Created transaction
   */
  async createTransaction(transactionData) {
    try {
      // Create transaction record
      const transaction = new Transaction({
        userId: transactionData.userId,
        type: transactionData.type,
        amount: transactionData.amount,
        currency: transactionData.currency || 'USD',
        status: transactionData.status || 'pending',
        provider: transactionData.provider,
        providerTransactionId: transactionData.providerTransactionId,
        metadata: transactionData.metadata || {}
      });

      // Save to database
      await transaction.save();

      // Return the transaction
      return transaction.toObject();
    } catch (error) {
      logger.error(`Error creating transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update transaction status
   * @param {string} transactionId - Transaction ID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object|null>} - Updated transaction or null if not found
   */
  async updateTransactionStatus(transactionId, status, metadata = {}) {
    try {
      // Find and update the transaction
      const transaction = await Transaction.findByIdAndUpdate(
        transactionId,
        {
          $set: {
            status,
            updatedAt: new Date(),
            ...(Object.keys(metadata).length > 0 && {
              'metadata.statusUpdate': {
                status,
                timestamp: new Date(),
                ...metadata
              }
            })
          }
        },
        { new: true }
      );

      if (!transaction) {
        logger.warn(`Transaction not found: ${transactionId}`);
        return null;
      }

      return transaction.toObject();
    } catch (error) {
      logger.error(`Error updating transaction status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user transactions
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of transactions
   */
  async getUserTransactions(userId, options = {}) {
    try {
      // Build query
      const query = { userId };

      // Add status filter if provided
      if (options.status) {
        query.status = options.status;
      }

      // Add type filter if provided
      if (options.type) {
        query.type = options.type;
      }

      // Set pagination options
      const limit = options.limit || 20;
      const skip = options.skip || 0;
      const sort = options.sort || { createdAt: -1 };

      // Get transactions from database
      const transactions = await Transaction.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      return transactions;
    } catch (error) {
      logger.error(`Error getting user transactions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transaction by external ID
   * @param {string} externalId - External transaction ID
   * @returns {Promise<Object|null>} - Transaction or null if not found
   */
  async getTransactionByExternalId(externalId) {
    try {
      // Find the transaction
      const transaction = await Transaction.findOne({
        providerTransactionId: externalId
      }).lean();

      return transaction;
    } catch (error) {
      logger.error(`Error getting transaction by external ID: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record a gift
   * @param {Object} giftData - Gift data
   * @returns {Promise<Object>} - Created gift
   */
  async recordGift(giftData) {
    try {
      // Create gift record
      const gift = new Gift({
        senderId: giftData.senderId,
        receiverId: giftData.receiverId,
        streamId: giftData.streamId,
        giftType: giftData.giftType,
        amount: giftData.amount,
        currency: giftData.currency || 'USD',
        transactionId: giftData.transactionId,
        message: giftData.message
      });

      // Save to database
      await gift.save();

      // Return the gift
      return gift.toObject();
    } catch (error) {
      logger.error(`Error recording gift: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user gifts received
   * @param {string} receiverId - Receiver user ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of gifts
   */
  async getUserGiftsReceived(receiverId, options = {}) {
    try {
      // Build query
      const query = { receiverId };

      // Add stream filter if provided
      if (options.streamId) {
        query.streamId = options.streamId;
      }

      // Set pagination options
      const limit = options.limit || 20;
      const skip = options.skip || 0;
      const sort = options.sort || { createdAt: -1 };

      // Get gifts from database
      const gifts = await Gift.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      return gifts;
    } catch (error) {
      logger.error(`Error getting user gifts received: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user gifts sent
   * @param {string} senderId - Sender user ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of gifts
   */
  async getUserGiftsSent(senderId, options = {}) {
    try {
      // Build query
      const query = { senderId };

      // Add stream filter if provided
      if (options.streamId) {
        query.streamId = options.streamId;
      }

      // Set pagination options
      const limit = options.limit || 20;
      const skip = options.skip || 0;
      const sort = options.sort || { createdAt: -1 };

      // Get gifts from database
      const gifts = await Gift.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      return gifts;
    } catch (error) {
      logger.error(`Error getting user gifts sent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a payment intent
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} - Created payment intent
   */
  async createPaymentIntent(paymentData) {
    try {
      // Create payment record
      const payment = new Payment({
        userId: paymentData.userId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        provider: paymentData.provider,
        type: paymentData.type,
        status: 'created',
        metadata: paymentData.metadata || {}
      });

      // Save to database
      await payment.save();

      // If there's provider-specific data, save it
      if (paymentData.providerData) {
        payment.providerData = paymentData.providerData;
        await payment.save();
      }

      return payment.toObject();
    } catch (error) {
      logger.error(`Error creating payment intent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a subscription
   * @param {Object} subscriptionData - Subscription data
   * @returns {Promise<Object>} - Created subscription
   */
  async createSubscription(subscriptionData) {
    try {
      // Create subscription record
      const subscription = new Payment({
        userId: subscriptionData.userId,
        subscribedToId: subscriptionData.subscribedToId,
        amount: subscriptionData.amount,
        currency: subscriptionData.currency || 'USD',
        provider: subscriptionData.provider,
        type: 'subscription',
        interval: subscriptionData.interval || 'month',
        status: 'active',
        startDate: new Date(),
        endDate: subscriptionData.endDate,
        providerSubscriptionId: subscriptionData.providerSubscriptionId,
        metadata: subscriptionData.metadata || {}
      });

      // Save to database
      await subscription.save();

      return subscription.toObject();
    } catch (error) {
      logger.error(`Error creating subscription: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} options - Cancellation options
   * @returns {Promise<Object|null>} - Updated subscription or null if not found
   */
  async cancelSubscription(subscriptionId, options = {}) {
    try {
      // Find subscription by ID or provider ID
      let query = {};
      if (options.isProviderSubscriptionId) {
        query.providerSubscriptionId = subscriptionId;
      } else {
        query._id = subscriptionId;
      }

      // Update subscription
      const subscription = await Payment.findOneAndUpdate(
        { ...query, type: 'subscription' },
        {
          $set: {
            status: options.immediateCancel ? 'cancelled' : 'cancelling',
            cancelledAt: new Date(),
            cancellationReason: options.reason || 'user_request',
            'metadata.cancellation': {
              reason: options.reason || 'user_request',
              timestamp: new Date(),
              immediateCancel: options.immediateCancel || false
            }
          }
        },
        { new: true }
      );

      if (!subscription) {
        logger.warn(`Subscription not found: ${subscriptionId}`);
        return null;
      }

      return subscription.toObject();
    } catch (error) {
      logger.error(`Error cancelling subscription: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available virtual gifts
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of available virtual gifts
   */
  async getVirtualGifts(options = {}) {
    try {
      // Check cache first
      const cacheKey = 'virtual_gifts';
      const cachedGifts = await cacheService.get(cacheKey);

      if (cachedGifts) {
        return JSON.parse(cachedGifts);
      }

      // This would ideally come from a separate collection
      // For now, we'll return a hardcoded list of virtual gifts
      const virtualGifts = [
        {
          id: 'heart',
          name: 'Heart',
          description: 'Show some love',
          price: 50,
          currency: 'coins',
          image: '/assets/gifts/heart.png',
          category: 'basic'
        },
        {
          id: 'rocket',
          name: 'Rocket',
          description: 'Blast off!',
          price: 100,
          currency: 'coins',
          image: '/assets/gifts/rocket.png',
          category: 'basic'
        },
        {
          id: 'crown',
          name: 'Crown',
          description: 'Fit for royalty',
          price: 500,
          currency: 'coins',
          image: '/assets/gifts/crown.png',
          category: 'premium'
        },
        {
          id: 'diamond',
          name: 'Diamond',
          description: 'Shine bright',
          price: 1000,
          currency: 'coins',
          image: '/assets/gifts/diamond.png',
          category: 'premium'
        }
      ];

      // Filter by category if provided
      let filteredGifts = virtualGifts;
      if (options.category) {
        filteredGifts = virtualGifts.filter(gift => gift.category === options.category);
      }

      // Cache the results
      await cacheService.set(cacheKey, JSON.stringify(filteredGifts), { ttl: 86400 }); // 24 hours

      return filteredGifts;
    } catch (error) {
      logger.error(`Error getting virtual gifts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Purchase a virtual gift
   * @param {Object} purchaseData - Purchase data
   * @returns {Promise<Object>} - Gift purchase record
   */
  async purchaseVirtualGift(purchaseData) {
    try {
      // Ensure required fields are present
      if (!purchaseData.userId || !purchaseData.giftId || !purchaseData.recipientId) {
        throw new Error('Missing required purchase data fields');
      }

      // Create a transaction for the purchase
      const transaction = await this.createTransaction({
        userId: purchaseData.userId,
        type: 'gift_purchase',
        amount: purchaseData.amount,
        currency: purchaseData.currency || 'coins',
        status: 'completed',
        provider: 'internal',
        metadata: {
          giftId: purchaseData.giftId,
          recipientId: purchaseData.recipientId,
          streamId: purchaseData.streamId
        }
      });

      // Record the gift
      const gift = await this.recordGift({
        senderId: purchaseData.userId,
        receiverId: purchaseData.recipientId,
        streamId: purchaseData.streamId,
        giftType: purchaseData.giftId,
        amount: purchaseData.amount,
        currency: purchaseData.currency || 'coins',
        transactionId: transaction._id,
        message: purchaseData.message
      });

      return {
        transaction,
        gift
      };
    } catch (error) {
      logger.error(`Error purchasing virtual gift: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get crypto payment address
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} - Crypto payment info
   */
  async getCryptoPaymentAddress(paymentData) {
    try {
      // This would typically call an external crypto payment service
      // For now, we'll create a placeholder payment record
      const payment = await this.createPaymentIntent({
        ...paymentData,
        provider: 'crypto',
        type: 'crypto_payment',
        status: 'awaiting_payment',
        metadata: {
          ...paymentData.metadata,
          crypto: {
            currency: paymentData.cryptoCurrency || 'BTC',
            network: paymentData.network || 'mainnet'
          }
        }
      });

      // For a real implementation, we would return a crypto address
      // and other payment details from a payment processor
      return {
        paymentId: payment._id,
        address: 'Not implemented - would be a real crypto address',
        cryptoCurrency: paymentData.cryptoCurrency || 'BTC',
        amount: paymentData.cryptoAmount,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
      };
    } catch (error) {
      logger.error(`Error getting crypto payment address: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle payment webhook
   * @param {string} provider - Payment provider
   * @param {Object} eventData - Webhook event data
   * @returns {Promise<Object>} - Processing result
   */
  async handlePaymentWebhook(provider, eventData) {
    try {
      logger.info(`Processing ${provider} webhook: ${eventData.type}`);

      let result = {
        success: false,
        message: 'Unhandled event',
        eventType: eventData.type
      };

      switch (provider) {
        case 'stripe':
          result = await this._handleStripeWebhook(eventData);
          break;
        case 'btcpay':
          result = await this._handleBtcPayWebhook(eventData);
          break;
        default:
          logger.warn(`Unhandled payment provider: ${provider}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error handling payment webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook (private method)
   * @param {Object} eventData - Stripe event data
   * @returns {Promise<Object>} - Processing result
   * @private
   */
  async _handleStripeWebhook(eventData) {
    try {
      // This would be implemented based on Stripe's webhook format
      // For now, return a placeholder
      return {
        success: true,
        message: 'Stripe webhook processed',
        eventType: eventData.type
      };
    } catch (error) {
      logger.error(`Error handling Stripe webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle BTCPay webhook (private method)
   * @param {Object} eventData - BTCPay event data
   * @returns {Promise<Object>} - Processing result
   * @private
   */
  async _handleBtcPayWebhook(eventData) {
    try {
      // This would be implemented based on BTCPay's webhook format
      // For now, return a placeholder
      return {
        success: true,
        message: 'BTCPay webhook processed',
        eventType: eventData.type
      };
    } catch (error) {
      logger.error(`Error handling BTCPay webhook: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new PaymentRepositoryMongo(); 