/**
 * Schema Initialization
 * 
 * This file initializes all MySQL schemas for the application.
 * It should be called during application startup to ensure all
 * required tables exist before the application starts.
 */

const logger = require('../utils/logger');

// Import all model modules
const userModel = require('../models/user.model');
const transactionModel = require('../models/transaction.model');
const streamModel = require('../models/stream.model');
const chatModel = require('../models/chat.model');
const giftModel = require('../models/gift.model');

/**
 * Initialize all schemas
 * @returns {Promise<void>}
 */
const initializeAllSchemas = async () => {
  try {
    logger.info('Initializing database schemas...');
    
    // Initialize each model schema
    await userModel.initializeSchema();
    await transactionModel.initializeSchema();
    await streamModel.initializeSchema();
    await chatModel.initializeSchema();
    await giftModel.initializeSchema();
    
    logger.info('All database schemas initialized successfully');
  } catch (error) {
    logger.error(`Error initializing schemas: ${error.message}`);
    throw error;
  }
};

module.exports = { initializeAllSchemas }; 