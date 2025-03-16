/**
 * Controller Index
 * 
 * This file centralizes all controller exports to make them easier to import
 * and to reduce duplication in route files.
 */

// Import controllers
const authController = require('./auth.controller');
const userController = require('./user.controller');
const streamController = require('./stream.controller');
const chatController = require('./chat.controller');
const paymentController = require('./payment.controller');
const livekitController = require('./livekit.controller');
const rtmpController = require('./rtmp.controller');
const adminController = require('./admin.controller');
const viewerController = require('./viewer.controller');

// Export controllers
module.exports = {
  authController,
  userController,
  streamController,
  chatController,
  paymentController,
  livekitController,
  rtmpController,
  adminController,
  viewerController
}; 