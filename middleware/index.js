/**
 * Middleware Index
 * 
 * This is the central place for registering all application middleware.
 * It follows a consistent pattern for applying middleware across the application.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import custom middleware
const { errorHandler, notFound } = require('./errorHandler');
const { authenticate, isAdmin } = require('./auth');
const validationMiddleware = require('./validation');
const moderationMiddleware = require('./moderation');

// Import configuration
const config = require('../config');
const logger = require('../utils/logger');

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    // For development purposes, allow all origins to make debugging easier
    logger.debug(`CORS request from origin: ${origin || 'no origin'}`);
    
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.debug('Allowing all origins in development/test mode');
      callback(null, true);
      return;
    }
    
    // In production, check against whitelist
    const whitelist = [
      process.env.CORS_ORIGIN || "http://localhost:3000",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:3004"
    ];
    
    if (!origin || whitelist.indexOf(origin) !== -1) {
      logger.debug(`Origin ${origin || 'no origin'} is allowed`);
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  exposedHeaders: ["Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Global API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req, _) => {
    // Skip rate limiting for health endpoints and in development mode
    return req.path.startsWith('/api/health') || process.env.NODE_ENV === 'development';
  }
});

/**
 * Apply global middleware to Express app
 * @param {express.Application} app - Express application
 */
function registerGlobalMiddleware(app) {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false
  }));
  
  // Enable compression
  app.use(compression());
  
  // Apply CORS with centralized configuration
  app.use(cors(corsOptions));
  
  // Request logging
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', { 
      stream: { write: message => logger.info(message.trim()) }
    }));
  }
  
  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Apply global rate limiting to all routes
  app.use('/api', apiLimiter);
}

/**
 * Apply route-specific middleware
 * @param {express.Router} router - Express router
 * @param {Object} options - Middleware options
 * @param {boolean} options.auth - Whether to apply authentication middleware
 * @param {boolean} options.admin - Whether to apply admin role check middleware
 * @param {Object} options.validation - Validation schema for routes
 * @param {Object} options.moderation - Moderation options
 * @returns {Array} Array of middleware functions
 */
function applyRouteMiddleware(options = {}) {
  const middleware = [];
  
  // Authentication middleware
  if (options.auth) {
    middleware.push(authenticate);
  }
  
  // Admin role check middleware
  if (options.admin) {
    middleware.push(isAdmin);
  }
  
  // Validation middleware
  if (options.validation) {
    const { schema, location = 'body' } = options.validation;
    middleware.push(validationMiddleware(schema, location));
  }
  
  // Moderation middleware
  if (options.moderation) {
    middleware.push(moderationMiddleware(options.moderation));
  }
  
  return middleware;
}

/**
 * Register error handling middleware
 * This should be called after all routes are registered
 * @param {express.Application} app - Express application
 */
function registerErrorHandlingMiddleware(app) {
  // Handle 404 errors for routes that don't exist
  app.use(notFound);
  
  // Global error handler
  app.use(errorHandler);
}

module.exports = {
  registerGlobalMiddleware,
  applyRouteMiddleware,
  registerErrorHandlingMiddleware,
  // Export individual middleware for direct use if needed
  authenticate,
  isAdmin
}; 