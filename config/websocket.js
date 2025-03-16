const WebSocketService = require('../services/websocket.service');

let webSocketService = null;

function initializeWebSocket(server) {
  if (!webSocketService) {
    webSocketService = WebSocketService(server);
  }
  return webSocketService;
}

function getWebSocketService() {
  if (!webSocketService) {
    // Create a dummy websocket service with all required methods
    // to prevent errors when no HTTP server is available    
    webSocketService = {
      sendToUser: () => {},
      sendToStream: () => {},
      isAuthenticated: () => true,
      getUserId: () => null,
      hasRole: () => false,
      // Add any other methods that might be needed
    };
    console.log('Warning: Using mock WebSocket service. Real-time functionality will be limited.');
  }
  return webSocketService;
}

module.exports = {
  initializeWebSocket,
  getWebSocketService
};
