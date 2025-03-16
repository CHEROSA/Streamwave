/**
 * Error Handler Middleware
 * 
 * This file provides custom error handling functionality for the API.
 * It defines a custom ApiError class for standardized error responses.
 */
const logger = require('../utils/logger');

/**
 * Custom error class for API errors
 * Provides a standardized way to create and handle API errors
 */
class ApiError extends Error {
  /**
   * Create a new API Error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} code - Error code for client reference
   * @param {Object} details - Additional error details
   */
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || this._getCodeFromStatus(statusCode);
    this.details = details;
    this.isOperational = true; // Used to distinguish operational errors from programmer errors
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
  
  /**
   * Get a default error code based on status code
   * @private
   * @param {number} statusCode - HTTP status code
   * @returns {string} Default error code
   */
  _getCodeFromStatus(statusCode) {
    const statusCodes = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      500: 'INTERNAL_SERVER_ERROR'
    };
    
    return statusCodes[statusCode] || 'UNKNOWN_ERROR';
  }
}

/**
 * Error handler middleware for Express
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // If already sent headers, let Express handle it
  if (res.headersSent) {
    return next(err);
  }
  
  // Determine if error is an ApiError or convert it
  const error = err instanceof ApiError
    ? err
    : new ApiError(err.message || 'An unexpected error occurred', 500);
  
  // Log error details
  logger.error(`API Error: [${error.statusCode}] ${error.message}`, {
    error,
    stack: error.stack,
    path: req.path,
    method: req.method
  });
  
  // Send response
  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
      ...(error.details && { details: error.details })
    }
  });
};

/**
 * Not found middleware - catch undefined routes
 */
const notFound = (req, res, next) => {
  const error = new ApiError(`Not found - ${req.originalUrl}`, 404);
  next(error);
};

/**
 * Async handler to wrap async route handlers and catch errors
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  ApiError,
  errorHandler,
  notFound,
  asyncHandler
}; 