/**
 * StreamWave API Server
 * 
 * This file serves as the entry point for the application when started with npm start.
 * It exports a startServer function that can be used by other scripts.
 */

const logger = require('./utils/logger');
const app = require('./app');
const http = require('http');
const { initializeWebSocket } = require('./config/websocket');

// Global flag to track if server is already running
global.serverStarted = global.serverStarted || false;

// Add global handlers for uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (error) => {
  logger.error(`UNCAUGHT EXCEPTION: ${error.message}`, { 
    stack: error.stack,
    service: "streamwave-api" 
  });
  // Give logger time to flush before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`UNHANDLED PROMISE REJECTION: ${reason}`, { 
    stack: reason.stack,
    service: "streamwave-api" 
  });
  // Log the promise details to help debug
  console.error('Promise details:', promise);
});

/**
 * Start the server
 * @returns {Promise<http.Server>} The HTTP server instance
 */
async function startServer() {
  try {
    // If server is already running, return a resolved promise
    if (global.serverStarted) {
      logger.info('Server instance already running, skipping duplicate start');
      return Promise.resolve(null);
    }
    
    const PORT = process.env.PORT || 3001;
    
    // Create HTTP server from Express app
    const server = http.createServer(app);
    
    // Initialize WebSocket with server instance
    try {
      const websocketService = initializeWebSocket(server);
      logger.info('WebSocket service initialized successfully');
    } catch (wsError) {
      logger.error(`Failed to initialize WebSocket service: ${wsError.message}`, {
        stack: wsError.stack,
        service: "streamwave-api"
      });
      // Continue without WebSocket if it fails
    }
    
    return new Promise((resolve, reject) => {
      try {
        server.listen(PORT, async () => {
          try {
            // Set the global flag to true
            global.serverStarted = true;
            logger.info(`🚀 StreamWave API Server started on port ${PORT}`);
            logger.info('================================================');
            
            // Important: Return here to stop execution and avoid whatever might be causing the crash
            resolve(server);
            return;
            
          } catch (listenerError) {
            logger.error(`Error in server listen callback: ${listenerError.message}`, {
              stack: listenerError.stack,
              service: "streamwave-api"
            });
            reject(listenerError);
          }
        });
        
        server.on('error', (serverError) => {
          logger.error(`Server error: ${serverError.message}`, {
            stack: serverError.stack,
            service: "streamwave-api"
          });
          reject(serverError);
        });
      } catch (listenError) {
        logger.error(`Error starting server: ${listenError.message}`, {
          stack: listenError.stack,
          service: "streamwave-api"
        });
        reject(listenError);
      }
    });
  } catch (outerError) {
    logger.error(`Critical server startup error: ${outerError.message}`, {
      stack: outerError.stack,
      service: "streamwave-api"
    });
    throw outerError;
  }
}

// Start the server if this script is run directly
if (require.main === module) {
  // Add a debug log to track execution flow
  console.log('Starting server from main module');
  
  startServer()
    .then(server => {
      // Log successful server start
      logger.info('Server started successfully and is now running.');
      
      // Register shutdown handler
      ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(signal => {
        process.on(signal, () => {
          logger.info(`${signal} received, starting graceful shutdown...`);
          if (server) {
            server.close(() => {
              logger.info('HTTP server closed');
              process.exit(0);
            });
          } else {
            process.exit(0);
          }
        });
      });
    })
    .catch(error => {
      // Enhanced error logging to capture more details about the error
      logger.error(`Failed to start server: ${error ? error.message || JSON.stringify(error) : 'Unknown error'}`, {
        stack: error ? error.stack : 'No stack trace',
        service: "streamwave-api",
        error: error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : 'No error object'
      });
      
      // Log additional details to help diagnose the issue
      console.error('Server startup error details:', error);
      
      process.exit(1);
    });
}

module.exports = { startServer };