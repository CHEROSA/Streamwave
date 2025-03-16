/**
 * Health Controller
 * 
 * Provides endpoints for health monitoring of various system components
 */

const { enhancedAsyncHandler } = require('../utils/error-handler');
const { isRedisEnabled, getRedisClient } = require('../config/redis.config');
const redisUtils = require('../utils/redis.utils');
// MySQL connection is used instead of MongoDB
const db = require('../config/database');
const os = require('os');
const pidusage = require('pidusage');

/**
 * Basic health check endpoint
 * Returns 200 OK if the API is running
 */
const healthCheck = enhancedAsyncHandler(async (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date()
  });
});

/**
 * Detailed health check with component status
 * Returns status of all major components (Redis, MongoDB, etc.)
 */
const detailedHealthCheck = enhancedAsyncHandler(async (req, res) => {
  // Get process stats
  const stats = await pidusage(process.pid);
  const uptime = process.uptime();

  // Check MongoDB connection
  const mongoStatus = {
    connected: false, // MongoDB replaced with MySQL
    details: 'Application now uses MySQL'
  };
  
  // Check MySQL connection
  const mySQLStatus = {
    connected: await db.healthCheck(),
    pool: db.pool ? {
      connectionLimit: db.pool.config.connectionLimit,
    } : null
  };

  // Get Redis status using new utilities
  const redisStatus = redisUtils.getRedisHealth();

  // Prepare response
  const healthData = {
    status: 'ok',
    timestamp: new Date(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime)
    },
    process: {
      memory: {
        used: `${Math.round(stats.memory / 1024 / 1024)} MB`,
        usedBytes: stats.memory,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        rssBytes: process.memoryUsage().rss
      },
      cpu: {
        percent: `${stats.cpu.toFixed(1)}%`,
        raw: stats.cpu
      }
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      memory: {
        total: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
        free: `${Math.round(os.freemem() / 1024 / 1024 / 1024)} GB`,
        usedPercent: `${(100 - (os.freemem() / os.totalmem() * 100)).toFixed(1)}%`
      }
    },
    redis: redisStatus,
    mongodb: mongoStatus, // Legacy - MongoDB replaced with MySQL
    mysql: mySQLStatus
  };

  // Update overall status if any component is down
  if (!mySQLStatus.connected || (redisStatus.enabled && !redisStatus.connected)) {
    healthData.status = 'degraded';
  }

  res.status(200).json(healthData);
});

/**
 * Redis health check endpoint
 * Returns detailed Redis status and metrics
 */
const redisHealthCheck = enhancedAsyncHandler(async (req, res) => {
  // Get Redis health status
  const health = redisUtils.getRedisHealth();

  // Build response with additional metrics if Redis is connected
  const redisHealth = {
    ...health,
    info: null
  };

  // If Redis is enabled and connected, get additional info
  if (health.enabled && health.connected) {
    const client = getRedisClient();
    
    try {
      // Try to get Redis INFO
      const info = await client.info();
      const infoObject = {};
      
      // Parse Redis INFO into an object
      info.split('\r\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const parts = line.split(':');
          if (parts.length === 2) {
            infoObject[parts[0]] = parts[1];
          }
        }
      });
      
      // Add relevant Redis metrics
      redisHealth.info = {
        version: infoObject.redis_version,
        memory: {
          used: `${Math.round(parseInt(infoObject.used_memory) / 1024 / 1024)} MB`,
          peak: `${Math.round(parseInt(infoObject.used_memory_peak) / 1024 / 1024)} MB`,
          fragmentation: infoObject.mem_fragmentation_ratio
        },
        clients: {
          connected: infoObject.connected_clients,
          blocked: infoObject.blocked_clients
        },
        keys: {
          db0: infoObject.db0 ? parseKeyCount(infoObject.db0) : 0
        },
        ops: {
          totalCommands: infoObject.total_commands_processed,
          opsPerSecond: infoObject.instantaneous_ops_per_sec
        }
      };
    } catch (error) {
      redisHealth.info = {
        error: 'Could not retrieve Redis INFO'
      };
    }
  }

  // Run a quick Redis test operation
  if (health.enabled) {
    const testKey = 'health:check:test';
    const testValue = { timestamp: Date.now() };
    
    // Time the operation
    const startTime = Date.now();
    await redisUtils.setCache(testKey, testValue, { ttl: 30 });
    const retrievedValue = await redisUtils.getCache(testKey);
    const duration = Date.now() - startTime;
    
    redisHealth.test = {
      success: retrievedValue && retrievedValue.timestamp === testValue.timestamp,
      duration: `${duration}ms`,
      durationMs: duration
    };
    
    // Clean up test key
    await redisUtils.deleteCache(testKey);
  }

  res.status(200).json({ redis: redisHealth });
});

/**
 * Format uptime in a human-readable format
 * @param {number} uptime - Uptime in seconds
 * @returns {string} Formatted uptime
 */
function formatUptime(uptime) {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

/**
 * Parse Redis DB key count from info string
 * @param {string} dbString - DB string from Redis INFO (e.g. "keys=1000,expires=500,avg_ttl=3600")
 * @returns {number} Number of keys
 */
function parseKeyCount(dbString) {
  const match = dbString.match(/keys=(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

module.exports = {
  healthCheck,
  detailedHealthCheck,
  redisHealthCheck
}; 