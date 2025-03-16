/**
 * Redis Configuration
 * 
 * This module provides shared Redis clients for the entire application.
 * It includes connection pooling, retry logic, and handles both production and development environments.
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');
const config = require('../config');

// Redis configuration from centralized config
const REDIS_URL = config.redis.url;
const REDIS_ENABLED = config.redis.enabled;
const MAX_RETRIES = parseInt(process.env.REDIS_MAX_RETRIES || '10', 10);
const RETRY_DELAY = parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10);
// Reduce connection pool size from 5 to 2 to stay within free tier limits
const POOL_SIZE = parseInt(process.env.REDIS_POOL_SIZE || '2', 10);
// Check if TLS should be used (default to false if not specified)
const USE_TLS = process.env.REDIS_USE_TLS === 'true';

// Log Redis configuration for debugging
logger.info(`Redis configuration: URL=${REDIS_URL ? 'Set (hidden for security)' : 'Not set'}, Enabled=${REDIS_ENABLED}, TLS=${USE_TLS}`);
if (!REDIS_URL && REDIS_ENABLED) {
  logger.error('Redis is enabled but URL is not set or invalid');
}

// Check if we're using a secure Redis connection based on environment variable only
// Explicitly respect the REDIS_USE_TLS setting regardless of URL format
const isSecureRedis = USE_TLS;

// Log TLS status
if (isSecureRedis) {
  logger.info('Using secure Redis connection with TLS');
} else {
  logger.info('Using standard Redis connection without TLS');
}

// Connection options with advanced retry logic
const redisOptions = {
  retryStrategy: (times) => {
    // Implement exponential backoff with jitter
    if (times > MAX_RETRIES) {
      logger.error(`Redis connection failed after ${times} attempts, giving up`);
      return null; // Stop retrying
    }
    
    // Exponential backoff with jitter to prevent thundering herd problem
    const delay = Math.min(RETRY_DELAY * Math.pow(1.5, times), 30000);
    const jitter = Math.floor(Math.random() * 500);
    
    logger.warn(`Redis connection attempt ${times} failed, retrying in ${delay + jitter}ms`);
    return delay + jitter;
  },
  // Reduce max retries per request to avoid overwhelming the connection
  maxRetriesPerRequest: 2,
  connectTimeout: 10000,
  enableOfflineQueue: true,
  enableReadyCheck: true,
  autoResubscribe: true,
  connectionName: 'StreamWave_App',
  keepAlive: 60000 // Send a PING every 60 seconds to prevent idle timeout disconnections
};

// Add TLS options only if using secure Redis
if (isSecureRedis) {
  redisOptions.tls = {
    // Don't check the server's certificate - necessary for some Redis Cloud environments
    rejectUnauthorized: false,
    // Use modern ciphers that are compatible with Redis Cloud
    ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM-SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
    // Set TLS versions explicitly
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3'
  };
  
  // Additional debug info for TLS connections
  
  logger.debug('TLS options set for Redis: ' + JSON.stringify(redisOptions.tls));
} else {
  logger.info('Using standard Redis connection without TLS');
}

// Create clients or use mock implementation based on environment
let redisClient = null;
let redisPublisher = null;
let redisSubscriber = null;

// Function to create Redis client with consistent configuration
const createRedisClient = (clientName = 'main') => {
  // Try to create a full connection with all features
  try {
    logger.info(`Creating Redis client with name: ${clientName}`);
    
    // Validate Redis URL before attempting to connect
    if (!REDIS_URL) {
      logger.error(`Cannot create Redis client (${clientName}): Redis URL is not defined`);
      return null;
    }
    
    const client = new Redis(REDIS_URL, {
      ...redisOptions,
      connectionName: `StreamWave_${clientName}`
      // Using the TLS options already defined in redisOptions
    });
    
    // Add event listeners for connection management
    client.on('connect', () => {
      logger.info(`Redis client (${clientName}) connected successfully`);
    });
    
    client.on('ready', () => {
      logger.info(`Redis client (${clientName}) is ready to use`);
    });
    
    client.on('error', (err) => {
      logger.error(`Redis client (${clientName}) error: ${err.message}`);
      
      // Log detailed error info for debugging
      if (err.code) {
        logger.error(`Error code: ${err.code}, syscall: ${err.syscall || 'unknown'}`);
      }
      if (err.stack) {
        logger.debug(`Error stack: ${err.stack}`);
      }
    });
    
    client.on('close', () => {
      logger.warn(`Redis client (${clientName}) connection closed`);
    });
    
    client.on('reconnecting', (time) => {
      logger.warn(`Redis client (${clientName}) reconnecting in ${time}ms`);
    });
    
    client.on('end', () => {
      logger.warn(`Redis client (${clientName}) disconnected and won't reconnect`);
    });
    
    return client;
  } catch (err) {
    logger.error(`Failed to create Redis client (${clientName}): ${err.message}`);
    return null;
  }
};

// Initialize Redis clients if enabled
if (REDIS_ENABLED) {
  try {
    logger.info('Initializing Redis clients...');
    
    // Create a connection pool for high-traffic operations
    const redisPool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      redisPool.push(createRedisClient(`pool-${i}`));
    }
    
    // Main client used for most operations
    redisClient = createRedisClient('main');
    
    // Add pool access to the main client
    redisClient.getFromPool = () => {
      // Simple round-robin selection from pool
      const poolIndex = Math.floor(Math.random() * POOL_SIZE);
      return redisPool[poolIndex];
    };
    
    // Publisher client dedicated to publishing messages
    redisPublisher = createRedisClient('publisher');
    
    // Subscriber client dedicated to subscribing to channels
    redisSubscriber = createRedisClient('subscriber');
    
    logger.info('Redis clients initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis clients:', error);
    // Continue with Redis disabled
    redisClient = null;
    redisPublisher = null;
    redisSubscriber = null;
  }
} else {
  logger.info('Redis is disabled by configuration');
}

/**
 * Safely execute a Redis command with error handling and retry logic
 * @param {Function} operation - Redis operation to execute
 * @param {string} operationName - Name of the operation for logging
 * @param {*} defaultValue - Default value to return if operation fails
 * @returns {Promise<*>} Result of the operation or default value
 */
const safeRedisOperation = async (operation, operationName = 'unknown', defaultValue = null) => {
  if (!redisClient) {
    return defaultValue;
  }
  
  try {
    return await operation();
  } catch (error) {
    logger.error(`Redis operation '${operationName}' failed: ${error.message}`);
    return defaultValue;
  }
};

/**
 * Quit all Redis clients and clean up connections
 * @returns {Promise<void>}
 */
const quitRedisClients = async () => {
  if (!REDIS_ENABLED) {
    return;
  }
  
  logger.info('Closing Redis connections...');
  
  try {
    // Close subscriber first to prevent new messages
    if (redisSubscriber) {
      await redisSubscriber.quit();
      logger.info('Redis subscriber connection closed');
    }
    
    // Close publisher next
    if (redisPublisher) {
      await redisPublisher.quit();
      logger.info('Redis publisher connection closed');
    }
    
    // Close main client last
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis main connection closed');
    }
    
    logger.info('All Redis connections closed successfully');
  } catch (error) {
    logger.error(`Error closing Redis connections: ${error.message}`);
  }
};

/**
 * Get the Redis client instance
 * @returns {Redis|null} Redis client or null if Redis is disabled
 */
const getRedisClient = () => redisClient;

/**
 * Get the Redis publisher client instance
 * @returns {Redis|null} Redis publisher client or null if Redis is disabled
 */
const getRedisPublisher = () => redisPublisher;

/**
 * Get the Redis subscriber client instance
 * @returns {Redis|null} Redis subscriber client or null if Redis is disabled
 */
const getRedisSubscriber = () => redisSubscriber;

/**
 * Check if Redis is enabled
 * @returns {boolean} True if Redis is enabled and configured
 */
const isRedisEnabled = () => REDIS_ENABLED && redisClient !== null;

/**
 * Get the Redis URL
 * @returns {string|null} Redis URL or null if not set
 */
const getRedisUrl = () => REDIS_URL;

module.exports = {
  getRedisClient,
  getRedisPublisher,
  getRedisSubscriber,
  isRedisEnabled,
  getRedisUrl,
  quitRedisClients,
  safeRedisOperation
};
