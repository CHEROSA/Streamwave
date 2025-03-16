const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const logger = require('../utils/logger');

/**
 * Create a Stripe checkout session for purchasing coins
 * @param {number} amount - Amount in USD
 * @param {string} userId - User ID
 * @returns {string} Checkout session URL
 */
async function createCheckoutSession(amount, userId) {
  try {
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.displayName || user.username,
        metadata: { userId }
      });
      customerId = customer.id;
      
      // Save customer ID to user
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Calculate coins based on amount
    const coins = calculateCoins(amount);

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${coins} StreamWave Coins`,
              description: 'Virtual currency for StreamWave',
              images: [`${process.env.FRONTEND_URL}/images/coins.png`]
            },
            unit_amount: amount * 100 // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      customer: customerId,
      metadata: {
        userId,
        coins,
        type: 'coin_purchase'
      }
    });

    // Create transaction record
    await Transaction.create({
      type: 'purchase',
      amount: amount * 100, // Store in cents
      coins,
      paymentMethod: 'stripe',
      paymentId: session.id,
      userId,
      status: 'pending',
      platformFee: 0,
      platformFeePercentage: 0,
      currency: 'USD',
      metadata: { checkoutSessionId: session.id }
    });

    logger.info(`Created Stripe checkout session for user ${userId}: ${session.id}`);
    return session.url;
  } catch (error) {
    logger.error(`Error creating checkout session: ${error.message}`);
    throw error;
  }
}

/**
 * Handle Stripe webhook events
 * @param {Object} event - Stripe event object
 */
async function handleStripeWebhook(event) {
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Find transaction by checkout session ID
        const transaction = await Transaction.findOne({
          'metadata.checkoutSessionId': session.id
        });
        
        if (!transaction) {
          logger.warn(`Transaction not found for checkout session: ${session.id}`);
          return;
        }
        
        // Update transaction status
        transaction.status = 'completed';
        transaction.updatedAt = Date.now();
        await transaction.save();
        
        // Add coins to user's wallet
        const user = await User.findById(transaction.userId);
        if (user) {
          await user.addCoins(transaction.coins);
          logger.info(`Added ${transaction.coins} coins to user ${user.id}`);
        }
        
        break;
      }
      
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        
        // Find transaction by payment intent ID
        const transaction = await Transaction.findOne({
          paymentId: paymentIntent.id
        });
        
        if (!transaction) {
          logger.warn(`Transaction not found for payment intent: ${paymentIntent.id}`);
          return;
        }
        
        // Update transaction status
        transaction.status = 'completed';
        transaction.updatedAt = Date.now();
        await transaction.save();
        
        // Process gift if this was a gift transaction
        if (transaction.type === 'gift' && transaction.recipientId) {
          await processGiftTransaction(transaction);
        }
        
        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        
        // Find transaction by payment intent ID
        const transaction = await Transaction.findOne({
          paymentId: paymentIntent.id
        });
        
        if (transaction) {
          // Update transaction status
          transaction.status = 'failed';
          transaction.updatedAt = Date.now();
          transaction.metadata.failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';
          await transaction.save();
          
          logger.warn(`Payment failed for transaction ${transaction.id}: ${transaction.metadata.failureReason}`);
        }
        
        break;
      }
      
      case 'account.updated': {
        const account = event.data.object;
        
        // Find user by Stripe Connect account ID
        const user = await User.findOne({ stripeConnectId: account.id });
        
        if (user) {
          // Update user's Connect account verification status
          user.stripeConnectVerified = account.charges_enabled;
          await user.save();
          
          logger.info(`Updated Connect account verification status for user ${user.id}: ${account.charges_enabled}`);
        }
        
        break;
      }
    }
  } catch (error) {
    logger.error(`Error handling Stripe webhook: ${error.message}`);
    throw error;
  }
}

/**
 * Process a gift transaction
 * @param {Object} transaction - Transaction object
 */
async function processGiftTransaction(transaction) {
  try {
    // Get sender and recipient
    const sender = await User.findById(transaction.userId);
    const recipient = await User.findById(transaction.recipientId);
    
    if (!sender || !recipient) {
      logger.warn(`Sender or recipient not found for gift transaction: ${transaction.id}`);
      return;
    }
    
    // Calculate platform fee
    const platformFeePercentage = 20; // 20%
    const platformFee = Math.floor(transaction.amount * (platformFeePercentage / 100));
    const streamerAmount = transaction.amount - platformFee;
    
    // Update transaction with fee information
    transaction.platformFee = platformFee;
    transaction.platformFeePercentage = platformFeePercentage;
    await transaction.save();
    
    // Add earnings to recipient (streamer)
    await recipient.addEarnings(streamerAmount, true);
    
    logger.info(`Processed gift transaction ${transaction.id}: ${streamerAmount} to streamer ${recipient.id}`);
    
    // If recipient has a Stripe Connect account, create a transfer
    if (recipient.stripeConnectId && recipient.stripeConnectVerified) {
      // In a real app, you might want to batch transfers instead of doing them immediately
      await createStreamerTransfer(recipient, streamerAmount, transaction.id);
    }
  } catch (error) {
    logger.error(`Error processing gift transaction: ${error.message}`);
    throw error;
  }
}

/**
 * Create a transfer to a streamer's Connect account
 * @param {Object} streamer - Streamer user object
 * @param {number} amount - Amount in cents
 * @param {string} transactionId - Original transaction ID
 */
async function createStreamerTransfer(streamer, amount, transactionId) {
  try {
    const transfer = await stripe.transfers.create({
      amount,
      currency: 'usd',
      destination: streamer.stripeConnectId,
      metadata: {
        streamerId: streamer.id,
        transactionId
      }
    });
    
    logger.info(`Created Stripe transfer to streamer ${streamer.id}: ${transfer.id}`);
    return transfer;
  } catch (error) {
    logger.error(`Error creating streamer transfer: ${error.message}`);
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
    coins += amount * 20; // 20% bonus
  } else if (amount >= 50) {
    coins += amount * 15; // 15% bonus
  } else if (amount >= 20) {
    coins += amount * 10; // 10% bonus
  } else if (amount >= 10) {
    coins += amount * 5; // 5% bonus
  }
  
  return Math.floor(coins);
}

module.exports = {
  createCheckoutSession,
  handleStripeWebhook,
  processGiftTransaction,
  createStreamerTransfer,
  calculateCoins
};
