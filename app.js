/**
 * StreamWave API Server
 * 
 * Main application entry point that initializes all components
 * and starts the HTTP server.
 */
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// Import configuration
const config = require('./config');
const logger = require('./utils/logger');
const { connectDB, closeConnection } = require('./config/database');
const { initializeWebSocket, closeWebSocket } = require('./config/websocket');
const cacheService = require('./services/cache.service');
const { initializeScheduledTasks } = require('./services/scheduler.service');

// Import centralized middleware
const {
  registerGlobalMiddleware,
  registerErrorHandlingMiddleware
} = require('./middleware');

// Import routes
const routes = require('./routes');
const userRoutes = require('./routes/user.routes');
const streamRoutes = require('./routes/stream.routes');
const authRoutes = require('./routes/auth.routes');
const healthRoutes = require('./routes/health.routes');
const monitorRoutes = require('./routes/monitor.routes');

// Import dependency injector
const container = require('./utils/dependencyInjector');

// Import application dependencies
require('./utils/dependencies');

// Initialize dependency injector with common dependencies
container.registerCommonDependencies();

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Register external services with service factory
const serviceFactory = container.get('serviceFactory');

// Function to safely register a service with error handling
const registerServiceSafely = (name, factory, options = {}) => {
  try {
    logger.info(`Registering service: ${name}`);
    serviceFactory.register(name, factory, options);
    logger.info(`Service registered successfully: ${name}`);
  } catch (error) {
    logger.error(`Failed to register service ${name}: ${error.message}`);
    // In production, we might want to terminate the app if critical services fail
    if (config.server.env === 'production' && options.critical) {
      logger.error(`Critical service ${name} failed to initialize. Exiting application.`);
      process.exit(1);
    }
  }
};

// Log that services are temporarily disabled
logger.info('All services temporarily disabled for debugging');

// Middleware - Apply global middleware first (includes security, CORS, body parsing, etc.)
registerGlobalMiddleware(app);

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Register routes
app.use('/api', routes);
app.use('/api/users', userRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/health', require('./routes/health.routes')); // Keep health routes at root level

// Special middleware for Stripe webhooks - needs raw body
app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));

// Regular routes
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/webhooks', require('./routes/webhook.routes'));
app.use('/api/uploads', require('./routes/uploads.routes'));

// Register error handling middleware
registerErrorHandlingMiddleware(app);

// Initialize database models
const initializeModels = async () => {
  try {
    logger.info('Initializing database models...');
    
    // Import schema initialization module
    const { initializeAllSchemas } = require('./config/schema-init');
    
    // Initialize all schemas
    await initializeAllSchemas();
    
    logger.info('Database models initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database models: ${error.message}`);
    throw error;
  }
};

// Connect to MySQL using the centralized database configuration
const db = require('./config/database');
db.sequelize.authenticate()
  .then(async () => {
    logger.info('Connected to MySQL database');
    
    // Initialize database models
    await initializeModels();
    
    // Initialize cache service after database connection
    try {
      logger.info('Initializing cache service...');
      cacheService.initialize();
    } catch (error) {
      logger.error(`Failed to initialize cache service: ${error.message}`);
    }
    
    // Schedule stream monitoring tasks
    try {
      const streamMonitoringService = require('./services/streamMonitoring.service');
      streamMonitoringService.scheduleStreamMonitoringTasks();
      logger.info('Stream monitoring tasks scheduled');
    } catch (error) {
      logger.error(`Failed to schedule stream monitoring tasks: ${error.message}`);
    }
    
    // Initialize scheduled tasks
    initializeScheduledTasks();
    
    // Media cleanup - scheduled task for deleting old files
    const initializeStorageCleanup = () => {
      if (!config.media.cleanup.enabled) {
        logger.info('Media cleanup disabled');
        return;
      }
      
      logger.info('Initializing scheduled media cleanup');
      
      // Clean up old media files periodically
      setInterval(async () => {
        try {
          logger.info('Starting scheduled media cleanup');
          
          // Get the storage service with error handling
          let storageService;
          try {
            storageService = container.get('storageService');
          } catch (error) {
            logger.error(`Failed to get storage service for cleanup: ${error.message}`, {
              stack: error.stack,
              service: "streamwave-api"
            });
            return; // Skip this cleanup cycle
          }
          
          // Verify the storage service has the needed method
          if (typeof storageService.cleanupOldFiles !== 'function') {
            logger.error('Storage service does not have cleanupOldFiles method', {
              service: "streamwave-api"
            });
            return; // Skip this cleanup cycle
          }
          
          // Cleanup thumbnails
          try {
            const thumbnailsDeleted = await storageService.cleanupOldFiles(
              'thumbnails', 
              config.media.cleanup.thumbnailMaxAgeDays || 90
            );
            
            // Cleanup uploads
            const uploadsDeleted = await storageService.cleanupOldFiles(
              'uploads', 
              config.media.cleanup.uploadsMaxAgeDays || 90
            );
            
            logger.info(`Media cleanup complete: ${thumbnailsDeleted + uploadsDeleted} files deleted`);
          } catch (cleanupError) {
            logger.error(`Error during file cleanup: ${cleanupError.message}`, {
              stack: cleanupError.stack,
              service: "streamwave-api"
            });
          }
        } catch (error) {
          logger.error(`Error in scheduled media cleanup: ${error.message}`, {
            stack: error.stack,
            service: "streamwave-api"
          });
        }
      }, config.media.cleanup.interval || 86400000); // Default: once a day
    };
    
    // Initialize storage cleanup if storage service is available
    try {
      if (container.has('storageService')) {
        initializeStorageCleanup();
      } else {
        logger.info('Storage service not available, skipping media cleanup setup');
      }
    } catch (error) {
      logger.error(`Error setting up media cleanup: ${error.message}`);
    }
    
    // Export the server and app, but don't start listening
    module.exports = app;
  })
  .catch(error => {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  });

// All shutdown handlers and signal processing should be moved to server.js
// Removed to prevent circular dependencies 