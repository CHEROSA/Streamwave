/**
 * Health Routes
 * 
 * Provides routes for health monitoring and diagnostics
 */

const express = require('express');
// MySQL connection is used instead of MongoDB
const db = require('../config/database');
// Conditionally require Redis - will be loaded only if configured
let Redis;
try {
  Redis = require('ioredis');
} catch (error) {
  // Redis module not available - health checks will handle this
}
const os = require('os');
const config = require('../config');
// Fix the service factory import path
const container = require('../utils/dependencyInjector');
const serviceFactory = container.get('serviceFactory');
const { isInitialized, getIO } = require('../config/websocket');
const logger = require('../utils/logger');

const router = express.Router();

// Health controller functions
const healthController = {
  /**
   * Redis health check with detailed metrics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  redisHealthCheck: async (req, res) => {
    try {
      // Check if Redis is configured
      if (!config.redis || !config.redis.url) {
        return res.status(200).json({
          status: 'disabled',
          message: 'Redis is not configured'
        });
      }
      
      // Connect to Redis
      const redis = new Redis(config.redis.url, {
        connectTimeout: 2000,
        maxRetriesPerRequest: 1
      });
      
      // Get Redis info
      const info = await redis.info();
      const infoObj = {};
      
      // Parse Redis info
      info.split('\r\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const parts = line.split(':');
          if (parts.length === 2) {
            infoObj[parts[0]] = parts[1];
          }
        }
      });
      
      // Get memory usage
      const memory = {
        used_memory: infoObj.used_memory,
        used_memory_human: infoObj.used_memory_human,
        used_memory_peak: infoObj.used_memory_peak,
        used_memory_peak_human: infoObj.used_memory_peak_human
      };
      
      // Get client info
      const clients = {
        connected_clients: infoObj.connected_clients,
        blocked_clients: infoObj.blocked_clients
      };
      
      // Get stats
      const stats = {
        total_connections_received: infoObj.total_connections_received,
        total_commands_processed: infoObj.total_commands_processed,
        instantaneous_ops_per_sec: infoObj.instantaneous_ops_per_sec,
        rejected_connections: infoObj.rejected_connections
      };
      
      // Disconnect from Redis
      redis.disconnect();
      
      // Return Redis health info
      res.status(200).json({
        status: 'ok',
        version: infoObj.redis_version,
        uptime_seconds: infoObj.uptime_in_seconds,
        uptime_days: infoObj.uptime_in_days,
        memory,
        clients,
        stats
      });
    } catch (error) {
      logger.error(`Redis health check error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
};

/**
 * @route   GET /api/health
 * @desc    Simple health check
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    // Check MySQL connection
    const isMySQLConnected = await db.healthCheck();
    
    // Check Redis connection
    let isRedisConnected = false;
    try {
      if (config.redis && config.redis.url && Redis) {
        const redis = new Redis(config.redis.url, {
          connectTimeout: 1000,
          maxRetriesPerRequest: 1
        });
        
        const pingResult = await redis.ping();
        isRedisConnected = pingResult === 'PONG';
        
        redis.disconnect();
      } else {
        // Redis is not configured, so consider it "connected" for health status
        isRedisConnected = true;
      }
    } catch (error) {
      isRedisConnected = false;
    }
    
    // Check WebSocket status
    const isWebSocketRunning = isInitialized();
    
    // Determine overall health status
    let status = 'ok';
    
    if (isMySQLConnected.status === 'disconnected') {
      status = 'degraded';
    }
    
    if ((config.redis && config.redis.url && !isRedisConnected) || 
        !isWebSocketRunning) {
      status = 'degraded';
    }

    // Return health status
    res.status(status === 'ok' ? 200 : 209).json({
      status: status,
      timestamp: new Date().toISOString(),
      service: 'StreamWave API',
      version: process.env.npm_package_version || '1.0.0',
      dependencies: {
        mysql: isMySQLConnected.status === 'connected' ? 'connected' : 'disconnected',
        redis: config.redis && config.redis.url 
          ? (isRedisConnected ? 'connected' : 'disconnected') 
          : 'not_configured',
        websocket: isWebSocketRunning ? 'running' : 'stopped'
      }
    });
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/detailed
 * @desc    Detailed health check with component status
 * @access  Protected - for internal use
 */
router.get('/detailed', async (req, res) => {
  try {
    // Get service health status
    const servicesStatus = await serviceFactory.healthCheck();
    
    // Check MySQL connection
    const mysqlStatus = await db.healthCheck();
    
    // Check Redis connection (if configured)
    let redisStatus = { status: 'not_configured' };
    if (config.redis && config.redis.url && Redis) {
      try {
        const redis = new Redis(config.redis.url, {
          connectTimeout: 2000,
          maxRetriesPerRequest: 1
        });
        
        const pingResult = await redis.ping();
        const info = await redis.info();
        
        redisStatus = {
          status: pingResult === 'PONG' ? 'connected' : 'error',
          details: {
            ping: pingResult,
            version: info.split('\r\n').find(line => line.startsWith('redis_version'))?.split(':')[1]
          }
        };
        
        redis.disconnect();
      } catch (error) {
        redisStatus = {
          status: 'error',
          error: error.message
        };
      }
    }

    // Check WebSocket status
    const websocketStatus = {
      status: isInitialized() ? 'running' : 'stopped',
      initialized: isInitialized()
    };

    // Add detailed WebSocket information if initialized
    if (isInitialized()) {
      try {
        const io = getIO();
        const wsMonitor = require('../utils/websocket-monitor');
        
        // Get various WebSocket metrics
        websocketStatus.connections = {
          total: wsMonitor.metrics.totalConnections,
          active: wsMonitor.metrics.activeConnections,
          authenticated: wsMonitor.metrics.authenticatedConnections
        };
        
        websocketStatus.messages = {
          received: Object.values(wsMonitor.metrics.messageTypeCounts)
            .reduce((sum, count) => sum + count, 0),
          sent: Object.values(wsMonitor.metrics.sentMessageTypeCounts)
            .reduce((sum, count) => sum + count, 0)
        };
        
        websocketStatus.errors = wsMonitor.metrics.errors;
        
        websocketStatus.rooms = Array.from(io.sockets.adapter.rooms.keys())
          .filter(room => !room.startsWith('/') && !room.match(/^[A-Za-z0-9_-]{20,}$/))
          .length;
          
        websocketStatus.uptime = wsMonitor.metrics.startTime 
          ? Math.round((Date.now() - wsMonitor.metrics.startTime) / 1000)
          : 0;
          
        // Format uptime in a readable format
        const uptimeSec = websocketStatus.uptime;
        websocketStatus.uptimeFormatted = 
          `${Math.floor(uptimeSec / 86400)}d ${Math.floor((uptimeSec % 86400) / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;
      } catch (error) {
        logger.warn(`Error getting WebSocket details: ${error.message}`);
        websocketStatus.error = error.message;
      }
    }

    // System information
    const systemInfo = {
      uptime: process.uptime(),
      memory: {
        free: os.freemem(),
        total: os.totalmem(),
        usage: process.memoryUsage()
      },
      cpu: {
        load: os.loadavg(),
        cores: os.cpus().length
      },
      platform: {
        type: os.type(),
        release: os.release(),
        arch: os.arch()
      }
    };

    // Determine overall status
    const isHealthy = 
      mysqlStatus.status === 'connected' && 
      (redisStatus.status === 'connected' || redisStatus.status === 'not_configured') &&
      servicesStatus._summary.overallStatus !== 'degraded';

    const statusCode = isHealthy ? 200 : servicesStatus._summary.overallStatus === 'warning' ? 209 : 503;

    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : servicesStatus._summary.overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      summary: {
        mysql: mysqlStatus.status,
        redis: redisStatus.status,
        websocket: websocketStatus.status,
        services: servicesStatus._summary.overallStatus,
        serviceDetails: `${servicesStatus._summary.healthy}/${servicesStatus._summary.total} services healthy (${servicesStatus._summary.healthPercentage}%)`
      },
      databases: {
        mysql: mysqlStatus,
        redis: redisStatus
      },
      services: servicesStatus,
      websocket: websocketStatus,
      system: systemInfo
    });
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/redis
 * @desc    Redis health check with detailed metrics
 * @access  Protected - for internal use
 */
router.get('/redis', healthController.redisHealthCheck);

// Liveness probe (for Kubernetes)
router.get('/liveness', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// Readiness probe (for Kubernetes)
router.get('/readiness', async (req, res) => {
  try {
    // Check MySQL connection
    const isMySQLConnected = await db.healthCheck();
    
    // Check Redis connection
    let isRedisConnected = true; // Default to true if not configured
    if (config.redis && config.redis.url && Redis) {
      try {
        const redis = new Redis(config.redis.url, {
          connectTimeout: 1000,
          maxRetriesPerRequest: 1
        });
        
        const pingResult = await redis.ping();
        isRedisConnected = pingResult === 'PONG';
        
        redis.disconnect();
      } catch (error) {
        isRedisConnected = false;
      }
    }
    
    // Check WebSocket initialization
    const isWebSocketInitialized = isInitialized();
    
    // Determine if service is ready
    const isReady = isMySQLConnected.status === 'connected' && 
                   (config.redis && config.redis.url ? isRedisConnected : true) && 
                   (isWebSocketInitialized || !config.features?.realtime?.enabled);
    
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        components: {
          mysql: isMySQLConnected.status === 'connected',
          redis: isRedisConnected,
          websocket: isWebSocketInitialized
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error(`Readiness check error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    // Collect metrics
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: os.loadavg()
      },
      services: {
        websocket: isInitialized() ? { status: 'running' } : null,
      }
    };
    
    res.status(200).json(metrics);
  } catch (error) {
    logger.error(`Metrics collection error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 