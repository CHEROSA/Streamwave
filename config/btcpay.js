const { OpenAPI } = require('btcpay-greenfield-node-client');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const logger = require('../utils/logger');

// Initialize BTCPay client
OpenAPI.BASE = process.env.BTCPAY_URL;
OpenAPI.TOKEN = process.env.BTCPAY_API_KEY;

/**
 * Process a cryptocurrency payment
 * @param {number} amount - Amount in USD
 * @param {string} userId - User ID
 * @returns {string} BTCPay invoice URL
 */
async function processCryptoPayment(amount, userId) {
  try {
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate coins based on amount (same as Stripe)
    const coins = calculateCoins(amount);

    // Create BTCPay invoice
    const invoice = await OpenAPI.createInvoice({
      currency: 'USD',
      amount: amount.toString(),
      metadata: {
        userId,
        coins,
        type: 'coin_purchase'
      },
      checkout: {
        redirectURL: `${process.env.FRONTEND_URL}/payment/success?invoice_id={InvoiceId}`,
        defaultPaymentMethod: 'BTC'
      }
    });

    // Create transaction record
    await Transaction.create({
      type: 'purchase',
      amount: amount * 100, // Store in cents
      coins,
      paymentMethod: 'btcpay',
      paymentId: invoice.id,
      userId,
      status: 'pending',
      platformFee: 0,
      platformFeePercentage: 0,
      currency: 'USD',
      cryptoAmount: 0, // Will be updated when payment is received
      metadata: { invoiceId: invoice.id }
    });

    logger.info(`Created BTCPay invoice for user ${userId}: ${invoice.id}`);
    return invoice.checkoutLink;
  } catch (error) {
    logger.error(`Error processing crypto payment: ${error.message}`);
    throw error;
  }
}

/**
 * Process a cryptocurrency donation to a streamer
 * @param {number} amount - Amount in USD
 * @param {string} userId - Donor user ID
 * @param {string} streamerId - Streamer user ID
 * @param {string} streamId - Stream ID
 * @returns {string} BTCPay invoice URL
 */
async function processCryptoDonation(amount, userId, streamerId, streamId) {
  try {
    // Get user and streamer
    const user = await User.findById(userId);
    const streamer = await User.findById(streamerId);
    
    if (!user || !streamer) {
      throw new Error('User or streamer not found');
    }

    // Get streamer's BTCPay store ID or use platform store
    const storeId = streamer.btcpayStoreId || process.env.BTCPAY_STORE_ID;

    // Create BTCPay invoice
    const invoice = await OpenAPI.createInvoice({
      storeId,
      currency: 'USD',
      amount: amount.toString(),
      metadata: {
        userId,
        streamerId,
        streamId,
        type: 'donation'
      },
      checkout: {
        redirectURL: `${process.env.FRONTEND_URL}/payment/success?invoice_id={InvoiceId}`,
        defaultPaymentMethod: 'BTC'
      }
    });

    // Calculate platform fee
    const platformFeePercentage = 10; // 10% for crypto donations
    const platformFee = Math.floor(amount * 100 * (platformFeePercentage / 100));
    const streamerAmount = (amount * 100) - platformFee;

    // Create transaction record
    await Transaction.create({
      type: 'donation',
      amount: amount * 100, // Store in cents
      paymentMethod: 'btcpay',
      paymentId: invoice.id,
      userId,
      recipientId: streamerId,
      streamId,
      status: 'pending',
      platformFee,
      platformFeePercentage,
      currency: 'USD',
      cryptoAmount: 0, // Will be updated when payment is received
      metadata: { 
        invoiceId: invoice.id,
        streamerAmount
      }
    });

    logger.info(`Created BTCPay donation invoice for user ${userId} to streamer ${streamerId}: ${invoice.id}`);
    return invoice.checkoutLink;
  } catch (error) {
    logger.error(`Error processing crypto donation: ${error.message}`);
    throw error;
  }
}

/**
 * Handle BTCPay webhook events
 * @param {Object} event - BTCPay event object
 */
async function handleBTCPayWebhook(event) {
  try {
    const { invoiceId, storeId } = event;
    
    // Get invoice details
    const invoice = await OpenAPI.getInvoice({
      storeId,
      invoiceId
    });
    
    // Find transaction by invoice ID
    const transaction = await Transaction.findOne({
      'metadata.invoiceId': invoiceId
    });
    
    if (!transaction) {
      logger.warn(`Transaction not found for BTCPay invoice: ${invoiceId}`);
      return;
    }
    
    // Update transaction based on invoice status
    switch (invoice.status) {
      case 'Settled': {
        // Payment confirmed
        transaction.status = 'completed';
        
        // Update crypto amount and exchange rate
        if (invoice.payments && invoice.payments.length > 0) {
          const payment = invoice.payments[0];
          transaction.cryptoAmount = payment.value;
          transaction.exchangeRate = payment.rate;
        }
        
        await transaction.save();
        
        // Process based on transaction type
        if (transaction.type === 'purchase') {
          // Add coins to user's wallet
          const user = await User.findById(transaction.userId);
          if (user) {
            await user.addCoins(transaction.metadata.coins);
            logger.info(`Added ${transaction.metadata.coins} coins to user ${user.id} from BTCPay`);
          }
        } else if (transaction.type === 'donation' && transaction.recipientId) {
          // Add earnings to streamer
          const streamer = await User.findById(transaction.recipientId);
          if (streamer) {
            await streamer.addEarnings(transaction.metadata.streamerAmount, false);
            logger.info(`Added ${transaction.metadata.streamerAmount} earnings to streamer ${streamer.id} from BTCPay`);
          }
        }
        
        break;
      }
      
      case 'Invalid':
      case 'Expired': {
        // Payment failed or expired
        transaction.status = 'failed';
        transaction.metadata.failureReason = `Invoice ${invoice.status}`;
        await transaction.save();
        
        logger.warn(`BTCPay invoice ${invoiceId} status: ${invoice.status}`);
        break;
      }
      
      case 'Processing': {
        // Payment received but not confirmed yet
        transaction.status = 'pending';
        transaction.metadata.processingTime = Date.now();
        await transaction.save();
        
        logger.info(`BTCPay invoice ${invoiceId} is processing`);
        break;
      }
    }
  } catch (error) {
    logger.error(`Error handling BTCPay webhook: ${error.message}`);
    throw error;
  }
}

/**
 * Calculate coins based on USD amount
 * @param {number} amount - Amount in USD
 * @returns {number} Number of coins
 */
function calculateCoins(amount) {
  // Simple conversion: $1 = 100 coins
  // Add bonus coins for larger purchases
  let coins = amount * 100;
  
  if (amount >= 100) {
    coins += amount * 25; // 25% bonus for crypto (higher than Stripe)
  } else if (amount >= 50) {
    coins += amount * 20; // 20% bonus
  } else if (amount >= 20) {
    coins += amount * 15; // 15% bonus
  } else if (amount >= 10) {
    coins += amount * 10; // 10% bonus
  }
  
  return Math.floor(coins);
}

module.exports = {
  processCryptoPayment,
  processCryptoDonation,
  handleBTCPayWebhook,
  calculateCoins
};
