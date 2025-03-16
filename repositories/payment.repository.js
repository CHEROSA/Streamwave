/**
 * Payment Repository
 * 
 * Repository for payment-related operations. Extends the base repository
 * with payment-specific functionality.
 */
const BaseRepository = require('./base.repository');
const paymentModel = require('../models/payment.model');
const userModel = require('../models/user.model');
const logger = require('../utils/logger');
const db = require('../config/database');

/**
 * Payment Repository
 * @extends BaseRepository
 */
class PaymentRepository extends BaseRepository {
  /**
   * Create a new Payment repository
   */
  constructor() {
    super('Payment', {
      entityName: 'payment',
      enableCache: true,
      cacheTTL: 900, // 15 minutes
      primaryKey: 'id'
    });
  }

  /**
   * Find virtual gifts with optional filtering
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Virtual gifts
   */
  async findVirtualGifts(options = {}) {
    try {
      const { category, isActive = true, limit = 20, offset = 0, sort = 'price', order = 'asc' } = options;

      const filter = {};
      if (category) filter.category = category;
      if (isActive !== undefined) filter.isActive = isActive;

      return await paymentModel.findGifts(filter, {
        limit,
        offset,
        sort,
        order
      });
    } catch (error) {
      logger.error(`Error finding virtual gifts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a virtual gift by ID
   * @param {number} giftId - Gift ID
   * @returns {Promise<Object|null>} Virtual gift or null if not found
   */
  async getVirtualGift(giftId) {
    try {
      return await paymentModel.getGiftById(giftId);
    } catch (error) {
      logger.error(`Error getting virtual gift ${giftId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new transaction
   * @param {Object} transactionData - Transaction data
   * @returns {Promise<Object>} Created transaction
   */
  async createTransaction(transactionData) {
    try {
      logger.debug(`Creating transaction of type ${transactionData.type} for user ${transactionData.userId}`);
      
      const transaction = await paymentModel.createTransaction(transactionData);
      
      if (transaction && 
         (transaction.type === 'gift' || transaction.type === 'donation') && 
          transaction.streamerId) {
        // Update the recipient's earnings if it's a gift or donation
        await this.updateRecipientEarnings(transaction);
      }
      
      return transaction;
    } catch (error) {
      logger.error(`Error creating transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update recipient's earnings based on transaction
   * @param {Object} transaction - Transaction data
   * @returns {Promise<Object>} Updated user
   */
  async updateRecipientEarnings(transaction) {
    try {
      if (!transaction.streamerId || !transaction.amount) {
        return null;
      }
      
      logger.debug(`Updating earnings for user ${transaction.streamerId} from transaction ${transaction.id}`);
      
      // Get the platform fee percentage (default 20%)
      const platformFeePercent = 20;
      
      // Calculate the streamer's share
      const streamerShare = transaction.amount * (1 - platformFeePercent / 100);
      
      // Start a transaction
      await db.query('START TRANSACTION');
      
      try {
        // Update the earnings
        const updateEarningsSql = `
          UPDATE users
          SET 
            earningsBalance = earningsBalance + ?,
            totalEarnings = totalEarnings + ?
          WHERE id = ?
        `;
        
        await db.query(updateEarningsSql, [
          streamerShare,
          streamerShare,
          transaction.streamerId
        ]);
        
        // Add an earnings transaction record
        const earningsTransaction = await paymentModel.createTransaction({
          userId: transaction.streamerId,
          type: 'payout',
          status: 'pending',
          amount: streamerShare,
          paymentMethod: 'wallet',
          streamId: transaction.streamId,
          metadata: {
            sourceTransactionId: transaction.id,
            platformFee: platformFeePercent,
            originalAmount: transaction.amount
          }
        });
        
        // Commit the transaction
        await db.query('COMMIT');
        
        return earningsTransaction;
      } catch (error) {
        // Rollback on error
        await db.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Error updating recipient earnings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transactions for a user
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} User transactions
   */
  async getUserTransactions(userId, options = {}) {
    try {
      const { type, status, limit = 20, offset = 0 } = options;
      
      const filter = { userId };
      if (type) filter.type = type;
      if (status) filter.status = status;
      
      const transactions = await paymentModel.findTransactions(filter, {
        limit,
        offset,
        sort: 'createdAt',
        order: 'desc'
      });
      
      // Fetch additional data for each transaction
      const enhancedTransactions = await Promise.all(transactions.map(async (transaction) => {
        const enhanced = { ...transaction };
        
        // Get gift data if it's a gift transaction
        if (transaction.giftId) {
          enhanced.gift = await paymentModel.getGiftById(transaction.giftId);
        }
        
        // Get basic user info for sender/recipient if available
        if (transaction.streamerId && transaction.streamerId !== userId) {
          const recipient = await userModel.getUserById(transaction.streamerId);
          if (recipient) {
            enhanced.recipient = {
              id: recipient.id,
              username: recipient.username,
              displayName: recipient.displayName,
              avatar: recipient.avatar
            };
          }
        }
        
        return enhanced;
      }));
      
      return enhancedTransactions;
    } catch (error) {
      logger.error(`Error getting transactions for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transactions for a stream
   * @param {number} streamId - Stream ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Stream transactions
   */
  async getStreamTransactions(streamId, options = {}) {
    try {
      const { type, status, limit = 20, offset = 0 } = options;
      
      const filter = { streamId };
      if (type) filter.type = type;
      if (status) filter.status = status;
      
      return await paymentModel.findTransactions(filter, {
        limit,
        offset,
        sort: 'createdAt',
        order: 'desc'
      });
    } catch (error) {
      logger.error(`Error getting transactions for stream ${streamId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a payout for a user
   * @param {number} userId - User ID
   * @param {Object} payoutData - Payout data
   * @returns {Promise<Object>} Payout transaction
   */
  async processPayout(userId, payoutData) {
    try {
      // Start a database transaction
      await db.query('START TRANSACTION');
      
      try {
        // Get current earnings balance
        const userSql = 'SELECT earningsBalance FROM users WHERE id = ?';
        const userResult = await db.query(userSql, [userId]);
        
        if (userResult.length === 0) {
          throw new Error(`User ${userId} not found`);
        }
        
        const user = userResult[0];
        const { amount } = payoutData;
        
        // Validate payout amount
        if (amount <= 0) {
          throw new Error('Payout amount must be greater than zero');
        }
        
        if (amount > user.earningsBalance) {
          throw new Error(`Insufficient balance: ${user.earningsBalance}`);
        }
        
        // Update user's earnings balance
        const updateUserSql = 'UPDATE users SET earningsBalance = earningsBalance - ? WHERE id = ?';
        await db.query(updateUserSql, [amount, userId]);
        
        // Create payout transaction
        const payoutTransaction = await paymentModel.createTransaction({
          userId,
          type: 'payout',
          status: 'completed',
          amount,
          paymentMethod: payoutData.paymentMethod || 'stripe',
          paymentId: payoutData.paymentId,
          metadata: {
            ...payoutData.metadata,
            destination: payoutData.destination,
            balanceAfterPayout: user.earningsBalance - amount
          }
        });
        
        // Commit the transaction
        await db.query('COMMIT');
        
        return payoutTransaction;
      } catch (error) {
        // Rollback on error
        await db.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Error processing payout for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a transaction's status
   * @param {number} transactionId - Transaction ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<Object>} Updated transaction
   */
  async updateTransactionStatus(transactionId, status, additionalData = {}) {
    try {
      if (!['pending', 'completed', 'failed', 'refunded'].includes(status)) {
        throw new Error(`Invalid transaction status: ${status}`);
      }
      
      const updateData = {
        status,
        ...additionalData
      };
      
      // If adding metadata, merge with existing metadata
      if (additionalData.metadata) {
        const transaction = await paymentModel.getTransactionById(transactionId);
        if (transaction) {
          updateData.metadata = {
            ...(transaction.metadata || {}),
            ...additionalData.metadata
          };
        }
      }
      
      return await paymentModel.updateTransaction(transactionId, updateData);
    } catch (error) {
      logger.error(`Error updating transaction ${transactionId} status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get earnings statistics for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Earnings statistics
   */
  async getUserEarningsStats(userId) {
    try {
      // Get the user's current earnings balance
      const userSql = 'SELECT earningsBalance, totalEarnings FROM users WHERE id = ?';
      const userResult = await db.query(userSql, [userId]);
      
      if (userResult.length === 0) {
        throw new Error(`User ${userId} not found`);
      }
      
      const user = userResult[0];
      
      // Get payout transactions
      const payoutsSql = `
        SELECT 
          SUM(amount) as totalPayouts, 
          COUNT(*) as payoutCount
        FROM transactions 
        WHERE userId = ? AND type = 'payout' AND status = 'completed'
      `;
      const payoutsResult = await db.query(payoutsSql, [userId]);
      const payouts = payoutsResult[0];
      
      // Get recent earnings (last 30 days)
      const recentEarningsSql = `
        SELECT 
          SUM(amount) as recentEarnings
        FROM transactions 
        WHERE streamerId = ? AND (type = 'gift' OR type = 'donation') 
        AND status = 'completed' AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `;
      const recentEarningsResult = await db.query(recentEarningsSql, [userId]);
      const recentEarnings = recentEarningsResult[0];
      
      // Compile and return the stats
      return {
        currentBalance: user.earningsBalance || 0,
        totalEarnings: user.totalEarnings || 0,
        totalPayouts: payouts.totalPayouts || 0,
        payoutCount: payouts.payoutCount || 0,
        recentEarnings: recentEarnings.recentEarnings || 0,
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error(`Error getting earnings stats for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment methods for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Payment methods
   */
  async getUserPaymentMethods(userId) {
    try {
      // We'll store payment methods in the user's settings JSON
      const user = await userModel.getUserById(userId);
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Return the payment methods array or empty array if not set
      return user.settings?.paymentMethods || [];
    } catch (error) {
      logger.error(`Error getting payment methods for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add a payment method for a user
   * @param {number} userId - User ID
   * @param {Object} paymentMethod - Payment method data
   * @returns {Promise<Object>} Added payment method
   */
  async addUserPaymentMethod(userId, paymentMethod) {
    try {
      // Get the user
      const user = await userModel.getUserById(userId);
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Get current settings or initialize empty object
      const settings = user.settings || {};
      
      // Get current payment methods or initialize empty array
      const paymentMethods = settings.paymentMethods || [];
      
      // Add a unique ID to the payment method
      const newPaymentMethod = {
        ...paymentMethod,
        id: Date.now().toString(),
        createdAt: new Date()
      };
      
      // Add the new payment method
      paymentMethods.push(newPaymentMethod);
      
      // Update settings
      settings.paymentMethods = paymentMethods;
      
      // Update user
      await userModel.updateUser(userId, { settings });
      
      return newPaymentMethod;
    } catch (error) {
      logger.error(`Error adding payment method for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove a payment method for a user
   * @param {number} userId - User ID
   * @param {string} paymentMethodId - Payment method ID
   * @returns {Promise<boolean>} True if successful
   */
  async removeUserPaymentMethod(userId, paymentMethodId) {
    try {
      // Get the user
      const user = await userModel.getUserById(userId);
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Get current settings
      const settings = user.settings || {};
      
      // Get current payment methods
      const paymentMethods = settings.paymentMethods || [];
      
      // Filter out the payment method to remove
      const updatedPaymentMethods = paymentMethods.filter(pm => pm.id !== paymentMethodId);
      
      // If no payment method was removed, return false
      if (updatedPaymentMethods.length === paymentMethods.length) {
        return false;
      }
      
      // Update settings
      settings.paymentMethods = updatedPaymentMethods;
      
      // Update user
      await userModel.updateUser(userId, { settings });
      
      return true;
    } catch (error) {
      logger.error(`Error removing payment method for user ${userId}: ${error.message}`);
      throw error;
    }
  }
}

// Create and export singleton instance
const paymentRepository = new PaymentRepository();
module.exports = paymentRepository; 