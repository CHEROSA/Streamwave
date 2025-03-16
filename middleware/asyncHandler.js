/**
 * Async Handler Middleware
 * 
 * Wraps async route handlers to properly handle errors and pass them to the error middleware.
 * This eliminates the need for try/catch blocks in every route handler.
 */

const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler; 