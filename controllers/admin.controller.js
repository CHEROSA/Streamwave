/**
 * Admin Controller
 * 
 * Handles administrative operations including monitoring and analytics.
 */
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { USER_ROLES, HTTP_STATUS } = require('../utils/constants');
const streamService = require('../services/stream.service');
const logger = require('../utils/logger');

// Create Express router
const router = express.Router();

/**
 * Middleware to check if user is an admin
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

/**
 * Get stream metrics
 * @route GET /api/admin/metrics/streams
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStreamMetrics = asyncHandler(async (req, res) => {
  // Get metrics from stream service
  const metrics = streamService.getMetrics();
  
  // Log that metrics were accessed
  logger.info('Stream metrics accessed', {
    action: 'metrics_accessed',
    userId: req.user.id,
    timestamp: new Date()
  });
  
  res.json({
    success: true,
    timestamp: new Date(),
    metrics
  });
});

/**
 * Get stream alerts
 * @route GET /api/admin/alerts/streams
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStreamAlerts = asyncHandler(async (req, res) => {
  const { limit, type, acknowledged } = req.query;
  
  // Options for filtering alerts
  const options = {
    limit: limit ? parseInt(limit) : 50
  };
  
  // Add filters if provided
  if (type) options.type = type;
  if (acknowledged === 'true') options.acknowledgedOnly = true;
  if (acknowledged === 'false') options.unacknowledgedOnly = true;
  
  // Get alerts from stream service
  const alerts = streamService.getAlerts(options);
  
  // Log that alerts were accessed
  logger.info('Stream alerts accessed', {
    action: 'alerts_accessed',
    userId: req.user.id,
    timestamp: new Date(),
    alertCount: alerts.length
  });
  
  res.json({
    success: true,
    timestamp: new Date(),
    alerts,
    totalCount: alerts.length
  });
});

/**
 * Acknowledge a stream alert
 * @route POST /api/admin/alerts/streams/:alertId/acknowledge
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const acknowledgeAlert = asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  
  if (!alertId) {
    throw new ApiError('Alert ID is required', 400);
  }
  
  // Acknowledge the alert
  const result = streamService.acknowledgeAlert(alertId, req.user.id);
  
  if (!result) {
    throw new ApiError('Alert not found', 404);
  }
  
  // Log the acknowledgement
  logger.info(`Alert ${alertId} acknowledged by admin`, {
    action: 'alert_acknowledged',
    userId: req.user.id,
    alertId
  });
  
  res.json({
    success: true,
    message: 'Alert acknowledged successfully',
    alertId
  });
});

/**
 * Get streams in each state
 * @route GET /api/admin/streams/states
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStreamsByState = asyncHandler(async (req, res) => {
  // Use the Stream model to count streams in each state
  const Stream = require('../models/stream.model').Stream;
  
  // Run all queries in parallel
  const [liveCount, scheduledCount, endedCount, cancelledCount] = await Promise.all([
    Stream.countDocuments({ status: 'live' }),
    Stream.countDocuments({ status: 'scheduled' }),
    Stream.countDocuments({ status: 'ended' }),
    Stream.countDocuments({ status: 'cancelled' })
  ]);
  
  res.json({
    success: true,
    counts: {
      live: liveCount,
      scheduled: scheduledCount,
      ended: endedCount,
      cancelled: cancelledCount,
      total: liveCount + scheduledCount + endedCount + cancelledCount
    }
  });
});

/**
 * Get stream analytics data
 * @route GET /api/admin/streams/analytics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStreamAnalytics = asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));
  
  // Use StreamMetadata to get analytics data
  const StreamMetadata = require('../models/stream.model').StreamMetadata;
  
  // Get streams started within the time range
  const recentStreams = await StreamMetadata.find({
    liveAt: { $gte: startDate, $lte: endDate }
  });
  
  // Calculate analytics
  const analytics = {
    totalStreams: recentStreams.length,
    averageDuration: recentStreams.length > 0 
      ? recentStreams.reduce((sum, s) => sum + (s.duration || 0), 0) / recentStreams.length 
      : 0,
    totalViewers: recentStreams.reduce((sum, s) => sum + (s.finalViewerCount || 0), 0),
    byDay: {},
    byCategory: {}
  };
  
  // Group by day
  recentStreams.forEach(stream => {
    const day = stream.liveAt.toISOString().split('T')[0];
    if (!analytics.byDay[day]) {
      analytics.byDay[day] = { count: 0, viewers: 0 };
    }
    analytics.byDay[day].count++;
    analytics.byDay[day].viewers += stream.finalViewerCount || 0;
    
    // Group by category
    const category = stream.category || 'Uncategorized';
    if (!analytics.byCategory[category]) {
      analytics.byCategory[category] = { count: 0, viewers: 0 };
    }
    analytics.byCategory[category].count++;
    analytics.byCategory[category].viewers += stream.finalViewerCount || 0;
  });
  
  res.json({
    success: true,
    timeRange: {
      start: startDate,
      end: endDate,
      days: parseInt(days)
    },
    analytics
  });
});

// Define routes
router.get('/metrics/streams', authenticate, requireAdmin, getStreamMetrics);
router.get('/alerts/streams', authenticate, requireAdmin, getStreamAlerts);
router.post('/alerts/streams/:alertId/acknowledge', authenticate, requireAdmin, acknowledgeAlert);
router.get('/streams/states', authenticate, requireAdmin, getStreamsByState);
router.get('/streams/analytics', authenticate, requireAdmin, getStreamAnalytics);

module.exports = {
  router,
  getStreamMetrics,
  getStreamAlerts,
  acknowledgeAlert,
  getStreamsByState,
  getStreamAnalytics
}; 