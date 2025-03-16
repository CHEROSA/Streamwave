/**
 * LiveKit Webhook Controller
 * 
 * This controller handles webhook requests from LiveKit
 */

const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const repositoryFactory = require('../repositories/repository.factory');
const streamRepository = repositoryFactory.getStreamRepository();
const crypto = require('crypto');
const { EventType } = require('livekit-server-sdk');
const { sendApiError } = require('../middleware/errors');
const userService = require('../services/user.service');
const roomService = require('../services/room.service');

// Get LiveKit API credentials
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// Enable this for testing when needed - DISABLE IN PRODUCTION
const DEBUG_MODE = false;

// Initialize logging
logger.info(`WebhookController initialized with API key: ${LIVEKIT_API_KEY ? LIVEKIT_API_KEY.substring(0, 4) + '****' : 'undefined'}`);
logger.info(`Debug mode is ${DEBUG_MODE ? 'enabled' : 'disabled'}`);

/**
 * Verify webhook signature from LiveKit
 * @param {string} body - Request body as a string
 * @param {string} authHeader - Authorization header
 * @returns {boolean} - Whether the signature is valid
 */
function verifyWebhookSignature(body, authHeader) {
  try {
    // In DEBUG_MODE, we skip verification
    if (DEBUG_MODE) {
      logger.info('DEBUG MODE: Skipping signature verification');
      return true;
    }

    // Make sure we have the required inputs
    if (!body || !authHeader || !LIVEKIT_API_SECRET) {
      logger.error('Missing required inputs for verification', {
        hasBody: !!body,
        hasAuthHeader: !!authHeader,
        hasApiSecret: !!LIVEKIT_API_SECRET
      });
      return false;
    }

    logger.debug('Verifying webhook signature', { authHeader: authHeader.substring(0, 20) + '...' });

    // Authorization: LIVEKIT_API_KEY:signature
    const [apiKey, signature] = authHeader.split(':');

    if (apiKey !== LIVEKIT_API_KEY) {
      logger.error('API key mismatch', { 
        receivedKey: apiKey,
        expectedKey: LIVEKIT_API_KEY ? LIVEKIT_API_KEY.substring(0, 4) + '****' : 'undefined'
      });
      return false;
    }

    // Compute HMAC signature of the request body
    const hmac = crypto.createHmac('sha256', LIVEKIT_API_SECRET);
    hmac.update(body);
    const computedSignature = hmac.digest('hex');

    logger.debug('Signature comparison', { 
      received: signature ? signature.substring(0, 10) + '...' : 'none',
      computed: computedSignature.substring(0, 10) + '...'
    });

    return computedSignature === signature;
  } catch (error) {
    logger.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Handle incoming webhooks from LiveKit
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const handleWebhook = async (req, res) => {
  try {
    // Log incoming webhook request
    logger.info('Received webhook request');
    logger.debug('Webhook headers:', req.headers);
    logger.debug('Webhook body:', req.body);
    
    // Get the authorization header
    const authHeader = req.header('Authorization');
    
    // Skip auth check in debug mode
    if (!DEBUG_MODE) {
      if (!authHeader) {
        logger.error('Missing authorization header');
        return sendApiError(res, 'Authorization token is required', 'AUTH_TOKEN_MISSING');
      }
      
      // Verify the webhook signature
      const body = JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(body, authHeader);
      
      if (!isValid) {
        logger.error('Webhook authentication failed');
        return sendApiError(res, 'Authentication failed', 'AUTH_INTERNAL_ERROR', 500);
      }
    } else {
      logger.info('DEBUG MODE: Skipping authentication check');
    }
    
    // Extract event data
    const event = req.body;
    
    if (!event || !event.event) {
      logger.error('Invalid event format', { event });
      return sendApiError(res, 'Invalid event format', 'INVALID_FORMAT', 400);
    }
    
    logger.info(`Processing webhook event: ${event.event}`);
    
    // Process different event types
    switch (event.event) {
      case EventType.RoomStarted:
        await handleRoomStarted(event);
        break;
      case EventType.RoomFinished:
        await handleRoomFinished(event);
        break;
      case EventType.ParticipantJoined:
        await handleParticipantJoined(event);
        break;
      case EventType.ParticipantLeft:
        await handleParticipantLeft(event);
        break;
      default:
        logger.info(`Unhandled event type: ${event.event}`);
    }
    
    return res.status(200).json({
      success: true,
      message: `Event processed: ${event.event}`
    });
  } catch (error) {
    logger.error('Error processing webhook:', error);
    return sendApiError(res, 'Error processing webhook', 'INTERNAL_ERROR', 500);
  }
};

// Event handlers
async function handleRoomStarted(event) {
  try {
    logger.info(`Room started: ${event.room.name}`);
    // Update room status in database
    await roomService.updateRoomStatus(event.room.name, 'active');
  } catch (error) {
    logger.error(`Error handling room started event:`, error);
  }
}

async function handleRoomFinished(event) {
  try {
    logger.info(`Room finished: ${event.room.name}`);
    // Update room status in database
    await roomService.updateRoomStatus(event.room.name, 'ended');
  } catch (error) {
    logger.error(`Error handling room finished event:`, error);
  }
}

async function handleParticipantJoined(event) {
  try {
    logger.info(`Participant joined: ${event.participant.identity} in room ${event.room.name}`);
    // Update user status or record join event
    await userService.updateUserStatus(event.participant.identity, 'online');
  } catch (error) {
    logger.error(`Error handling participant joined event:`, error);
  }
}

async function handleParticipantLeft(event) {
  try {
    logger.info(`Participant left: ${event.participant.identity} from room ${event.room.name}`);
    // Update user status or record leave event
    await userService.updateUserStatus(event.participant.identity, 'offline');
  } catch (error) {
    logger.error(`Error handling participant left event:`, error);
  }
}

module.exports = {
  handleWebhook
}; 