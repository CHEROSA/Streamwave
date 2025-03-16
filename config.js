/**
 * StreamWave API Configuration
 * 
 * This file contains global configuration settings for the StreamWave API.
 * It serves as a central place for application-wide settings.
 * 
 * Environment variables are validated before use to ensure proper configuration.
 */

// Load and validate environment variables
const { validateEnv } = require('./utils/env.validator');

// Validate environment variables
// This will throw an error and prevent app startup if validation fails
const env = validateEnv();

// Configuration object
const config = {
  // Server configuration
  server: {
    port: env.PORT,
    env: env.NODE_ENV
  },
  
  // WebSocket configuration
  websocket: {
    pingInterval: 30000, // 30 seconds
    pongTimeout: 10000,  // 10 seconds
    path: '/ws'
  },
  
  // JWT configuration - from validated environment
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN
  },
  
  // Logging configuration
  logging: {
    level: env.LOG_LEVEL
  },
  
  // MongoDB configuration
  mongodb: {
    uri: env.MONGODB_URI
  },
  
  // Redis configuration
  redis: {
    url: env.REDIS_URL,
    enabled: env.REDIS_ENABLED
  },
  
  // Stripe configuration
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET
  },
  
  // BTCPay configuration
  btcpay: {
    url: env.BTCPAY_URL,
    apiKey: env.BTCPAY_API_KEY,
    storeId: env.BTCPAY_STORE_ID
  },
  
  // LiveKit configuration
  livekit: {
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    url: env.LIVEKIT_URL
  },
  
  // Content moderation configuration
  moderation: {
    perspective: {
      apiKey: env.PERSPECTIVE_API_KEY
    }
  },
  
  // Media storage configuration
  media: {
    url: env.MEDIA_URL,
    storagePath: env.MEDIA_STORAGE_PATH,
    storageType: env.MEDIA_STORAGE || 'local',
    cleanup: {
      enabled: env.MEDIA_CLEANUP_ENABLED === 'true',
      thumbnails: {
        maxAgeDays: parseInt(env.THUMBNAIL_MAX_AGE_DAYS || '90', 10)
      },
      uploads: {
        maxAgeDays: parseInt(env.UPLOADS_MAX_AGE_DAYS || '90', 10)
      }
    }
  }
};

module.exports = config;