const express = require('express');
const apiRouter = express.Router();
const webhookRouter = express.Router();
const livekitController = require('../controllers/livekit.controller');
const { protect } = require('../middleware/auth');
const webhook = require('../controllers/livekit.webhook.controller');

/**
 * LiveKit WebRTC streaming routes
 */

// Generate token for LiveKit room
apiRouter.post('/token', protect, livekitController.generateToken);

// Create a new room for streaming
apiRouter.post('/rooms', protect, livekitController.createRoom);

// End a streaming room
apiRouter.delete('/rooms/:roomName', protect, livekitController.endRoom);

// Get room participants
apiRouter.get('/rooms/:roomName/participants', protect, livekitController.getRoomParticipants);

// Kick participant from room
apiRouter.delete('/rooms/:roomName/participants/:participantId', protect, livekitController.kickParticipant);

/**
 * LiveKit Webhook endpoint
 * This endpoint receives webhook events from LiveKit
 * No authentication required as this is verified using the webhook signature
 */
webhookRouter.post('/', webhook.handleWebhook);

/**
 * Test webhook endpoint - FOR DEVELOPMENT ONLY
 * This endpoint accepts test webhooks without authentication
 * This is useful for testing with the LiveKit dashboard
 */
webhookRouter.post('/test', (req, res) => {
  console.log('Received test webhook:', req.body);
  
  // Process the webhook event
  const event = req.body;
  
  if (!event || !event.event) {
    return res.status(200).json({
      success: false,
      message: 'Invalid event format'
    });
  }
  
  console.log(`Processing test webhook event: ${event.event}`);
  
  // Return success
  return res.status(200).json({
    success: true,
    message: `Test webhook event processed: ${event.event}`,
    debug: true
  });
});

module.exports = {
  apiRouter,
  webhookRouter
};
