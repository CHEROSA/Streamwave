/**
 * Utilities for handling API errors
 */

/**
 * Send a standardized API error response
 * @param {Object} res - Express response object
 * @param {String} message - Error message
 * @param {String} code - Error code
 * @param {Number} status - HTTP status code (default: 400)
 */
const sendApiError = (res, message, code, status = 400) => {
  return res.status(status).json({
    success: false,
    message,
    code
  });
};

module.exports = {
  sendApiError
}; 