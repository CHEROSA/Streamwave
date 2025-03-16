/**
 * Authentication Middleware
 * 
 * This middleware handles JWT token verification and user authentication.
 * It provides two main functions:
 * 1. protect - Verifies JWT tokens and sets the user in the request object
 * 2. restrictTo - Restricts access to specific roles
 */

const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { ApiError } = require('./errorHandler');
const logger = require('../utils/logger');
const config = require('../config/auth.config');
const userService = require('../services/user.service');

/**
 * Middleware to protect routes that require authentication
 * Verifies the JWT token and attaches the user to the request
 */
const protect = async (req, res, next) => {
  try {
    // 1) Get token from Authorization header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return next(new ApiError('You are not logged in. Please log in to get access.', 401));
    }

    // 2) Verify token
    const decoded = await promisify(jwt.verify)(token, config.jwtSecret);

    // 3) Check if user still exists
    const user = await userService.getUserById(decoded.id);
    if (!user) {
      return next(new ApiError('The user belonging to this token no longer exists.', 401));
    }

    // 4) Check if user changed password after the token was issued
    if (user.passwordChangedAt && user.passwordChangedAt.getTime() > decoded.iat * 1000) {
      return next(new ApiError('User recently changed password. Please log in again.', 401));
    }

    // Grant access to protected route
    req.user = user;
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`, { error });
    return next(new ApiError('Invalid token. Please log in again.', 401));
  }
};

/**
 * Middleware to restrict access to specific roles
 * @param {...String} roles - Roles that are allowed to access the route
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check if user exists (should be set by protect middleware)
    if (!req.user) {
      return next(new ApiError('You are not logged in. Please log in to get access.', 401));
    }

    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return next(new ApiError('You do not have permission to perform this action.', 403));
    }

    next();
  };
};

module.exports = {
  protect,
  restrictTo
}; 