/**
 * Authentication Middleware
 * 
 * This middleware handles JWT token verification and user authentication.
 * It provides functions for authenticating users and checking roles.
 */

const jwt = require('jsonwebtoken');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const config = require('../config/auth.config');
const userService = require('../services/user.service');

/**
 * Extract JWT token from request
 * @param {Object} req - Express request object
 * @returns {string|null} - JWT token or null
 */
const getTokenFromRequest = (req) => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  
  // Check cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  // No token found
  return null;
};

/**
 * Middleware to authenticate users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token
    const token = getTokenFromRequest(req);

    // Check if token exists
    if (!token) {
      logger.warn('Auth middleware: No token provided');
      return next(new ApiError('Not authorized, no token', 401));
    }
    
    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Set user info in request object
    req.user = {
      id: decoded.id || decoded.userId,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role || 'user' // Default to 'user' role if not specified
    };
    
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    return next(new ApiError('Invalid token', 401));
  }
};

/**
 * Middleware to check if user has required role
 * @param {string} role - Required role
 * @returns {Function} - Express middleware
 */
const hasRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Not authenticated', 401));
    }
    
    if (req.user.role !== role) {
      return next(new ApiError('Not authorized for this action', 403));
    }
    
    next();
  };
};

/**
 * Middleware to check if user is an admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError('Not authenticated', 401));
  }
  
  if (req.user.role !== 'admin') {
    return next(new ApiError('Admin access required', 403));
  }
  
  next();
};

module.exports = {
  authenticate,
  hasRole,
  isAdmin
}; 