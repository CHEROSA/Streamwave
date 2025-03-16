const express = require('express');
// MySQL connection is used instead of MongoDB
const db = require('../config/database');
const wsMonitor = require('../utils/websocket-monitor');
const logger = require('../utils/logger');
const { getWebSocketService, isInitialized, getIO } = require('../config/websocket');
const { isRedisEnabled, getRedisClient } = require('../config/redis.config');

const router = express.Router();

/**
 * GET /api/monitor/status
 * Get comprehensive service status including MongoDB, Redis, and WebSocket
 */
router.get('/status', async (req, res) => {
  try {
    // Check MongoDB connection
    const mongoStatus = {
      connected: false, // MongoDB replaced with MySQL
      details: 'Application now uses MySQL'
    };
    
    // Check MySQL connection
    const mySQLStatus = {
      connected: await db.healthCheck()
    };

    // Get Redis status (if enabled)
    let redisStatus = { enabled: isRedisEnabled() };
    if (isRedisEnabled()) {
      try {
        const redisClient = getRedisClient();
        const pingResult = await redisClient.ping();
        redisStatus.connected = pingResult === 'PONG';
      } catch (error) {
        redisStatus.connected = false;
        redisStatus.error = error.message;
      }
    }

    // WebSocket connection status
    const wsConnectionStatus = {
      initialized: isInitialized(),
      active: wsMonitor.metrics.activeConnections > 0
    };
    
    // Calculate uptime in a more human-readable format
    const uptimeMs = Date.now() - wsMonitor.metrics.startTime;
    const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    
    // Get totals for messages
    const totalReceivedMessages = Object.values(wsMonitor.metrics.messageTypeCounts)
      .reduce((sum, count) => sum + count, 0);
    const totalSentMessages = Object.values(wsMonitor.metrics.sentMessageTypeCounts)
      .reduce((sum, count) => sum + count, 0);
    
    // Create a more user-friendly summary of the data
    const stats = {
      health: {
        mongodb: mongoStatus, // Legacy - MongoDB replaced with MySQL
          mysql: mySQLStatus, // Legacy - MongoDB replaced with MySQL
        mysql: mySQLStatus,
        redis: redisStatus,
        websocket: wsConnectionStatus,
        overallStatus: mySQLStatus.connected ? 
          (redisStatus.enabled && !redisStatus.connected ? 'degraded' : 'healthy') : 
          'critical'
      },
      uptime: {
        days: uptimeDays,
        hours: uptimeHours,
        minutes: uptimeMinutes,
        formatted: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`,
        startTime: new Date(wsMonitor.metrics.startTime).toISOString()
      },
      connections: {
        total: wsMonitor.metrics.totalConnections,
        active: wsMonitor.metrics.activeConnections,
        authenticated: wsMonitor.metrics.authenticatedConnections,
        completed: wsMonitor.metrics.sessionsCompleted
      },
      messages: {
        received: {
          total: totalReceivedMessages,
          byType: wsMonitor.metrics.messageTypeCounts
        },
        sent: {
          total: totalSentMessages,
          byType: wsMonitor.metrics.sentMessageTypeCounts
        }
      },
      errors: wsMonitor.metrics.errors,
      timestamp: new Date().toISOString()
    };
    
    // If the request includes a 'details' query parameter, include active connection details
    if (req.query.details === 'true') {
      stats.activeConnections = Array.from(wsMonitor.connections.values()).map(conn => ({
        id: conn.id,
        connectTime: new Date(conn.connectTime).toISOString(),
        duration: Math.round((Date.now() - conn.connectTime) / 1000),
        authenticated: conn.authenticated,
        userId: conn.userId,
        rooms: conn.rooms,
        remoteAddress: conn.remoteAddress,
        userAgent: conn.userAgent
      }));
    }
    
    logger.debug('WebSocket monitor stats requested', { requestIP: req.ip });
    return res.json({ 
      success: true, 
      stats,
      // Include health status code in HTTP status
      statusCode: stats.health.overallStatus === 'healthy' ? 200 : 
                 stats.health.overallStatus === 'degraded' ? 209 : 500
    });
  } catch (error) {
    logger.error('Error getting WebSocket stats', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve WebSocket statistics' });
  }
});

/**
 * POST /api/monitor/websocket/reset
 * Reset WebSocket statistics
 */
router.post('/websocket/reset', (req, res) => {
  try {
    // Save the previous stats for the response
    const previousStats = { ...wsMonitor.metrics };
    
    // Reset the metrics but keep connections
    wsMonitor.metrics = {
      totalConnections: wsMonitor.metrics.activeConnections,
      activeConnections: wsMonitor.metrics.activeConnections,
      authenticatedConnections: wsMonitor.metrics.authenticatedConnections,
      sessionsCompleted: 0,
      messageTypeCounts: {},
      sentMessageTypeCounts: {},
      errors: 0,
      startTime: Date.now()
    };
    
    logger.info('WebSocket monitor statistics reset');
    return res.json({ 
      success: true, 
      message: 'WebSocket statistics reset',
      previousStats
    });
  } catch (error) {
    logger.error('Error resetting WebSocket stats', error);
    return res.status(500).json({ success: false, error: 'Failed to reset WebSocket statistics' });
  }
});

module.exports = router; 