/**
 * Server script with ngrok integration for LiveKit webhooks
 * 
 * This script:
 * 1. Starts the Express server
 * 2. Starts ngrok to expose the server
 * 3. Registers the webhook URL with LiveKit
 */

require('dotenv').config();
const { startServer } = require('./server');
const { startNgrok } = require('./scripts/start-ngrok');
const { registerWebhook } = require('./services/livekit.webhook.service');
const logger = require('./utils/logger');

// Port for the backend server
const PORT = process.env.PORT || 3001;

async function startServerWithNgrok() {
  try {
    // Start the Express server
    const server = await startServer();
    
    // Start ngrok to expose the server
    const ngrokUrl = await startNgrok();
    
    if (!ngrokUrl) {
      throw new Error('Failed to get ngrok URL');
    }
    
    // Register the webhook URL with LiveKit
    const webhookPath = '/api/livekit/webhook';
    const webhookUrl = `${ngrokUrl}${webhookPath}`;
    
    try {
      await registerWebhook(webhookUrl);
      logger.info(`LiveKit webhook registered successfully: ${webhookUrl}`);
    } catch (webhookError) {
      logger.error(`Failed to register LiveKit webhook: ${webhookError.message}`);
      logger.info(`However, the server is still exposed at: ${ngrokUrl}`);
      logger.info(`You can manually set the webhook URL in the LiveKit dashboard.`);
    }
    
    return { server, ngrokUrl };
  } catch (error) {
    logger.error(`Failed to start server with ngrok: ${error.message}`);
    process.exit(1);
  }
}

// Start the server if this script is run directly
if (require.main === module) {
  startServerWithNgrok();
}

module.exports = { startServerWithNgrok }; 