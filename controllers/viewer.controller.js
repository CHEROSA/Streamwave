/**
 * Viewer Controller
 * 
 * Handles operations related to stream viewers and viewer counts.
 * Uses dependency injection for the WebSocket service to avoid circular dependencies.
 */
const express = require('express');
const { Stream, StreamViewer } = require('../models/stream.model');
const { HTTP_STATUS } = require('../utils/constants');
const streamService = require('../services/stream.service');
const viewerService = require('../services/viewer.service');
const logger = require('../utils/logger');
const { authenticate, authenticateToken } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * Creates and returns a router with viewer-related endpoints
 * @param {Object} webSocketService - The WebSocket service instance
 * @returns {Object} Controller object with router
 */
module.exports = (webSocketService) => {
  // Validate the required dependency
  if (!webSocketService) {
    throw new Error('WebSocket service is required for the viewer controller');
  }
  
  // Create a router
  const router = express.Router();
  
  /**
   * Get the current viewer count for a stream
   * @route GET /api/viewers/:streamId/count
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const getViewerCount = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Get stream to check if it exists
    const stream = await Stream.findById(streamId);
    if (!stream) {
      throw new ApiError('Stream not found', 404);
    }
    
    // Get viewer count using the shared service
    const viewerCount = await streamService.getStreamViewerCount(streamId);
    
    res.json({
      success: true,
      streamId,
      viewerCount
    });
  });
  
  /**
   * Join a stream as a viewer
   * @route POST /api/viewers/:streamId/join
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const joinStream = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    const userId = req.user.id;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Get stream to check if it exists
    const stream = await Stream.findById(streamId);
    if (!stream) {
      throw new ApiError('Stream not found', 404);
    }
    
    // Check if stream is live
    if (stream.status !== 'live') {
      throw new ApiError('Stream is not live', 400);
    }
    
    // Collect viewer metadata for analytics
    const viewerMetadata = {
      deviceType: req.headers['user-agent'] || 'unknown',
      country: req.headers['cf-ipcountry'] || 'unknown'
    };
    
    // Add user to stream using the shared service
    await streamService.addUserToStream(streamId, userId, viewerMetadata);
    
    // Track viewer activity in the database for analytics
    await viewerService.trackViewerActivity(streamId, userId, 'join', viewerMetadata);
    
    // Notify through WebSocket
    webSocketService.notifyViewerCountChanged(streamId);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Joined stream successfully',
      streamId,
      userId
    });
  });
  
  /**
   * Leave a stream as a viewer
   * @route POST /api/viewers/:streamId/leave
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const leaveStream = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    const userId = req.user.id;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Check if stream exists
    const streamExists = await Stream.exists({ _id: streamId });
    if (!streamExists) {
      throw new ApiError('Stream not found', 404);
    }
    
    // Remove user from stream using the shared service
    await streamService.removeUserFromStream(streamId, userId);
    
    // Track viewer activity in the database for analytics
    await viewerService.trackViewerActivity(streamId, userId, 'leave');
    
    // Notify through WebSocket
    webSocketService.notifyViewerCountChanged(streamId);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Left stream successfully',
      streamId,
      userId
    });
  });
  
  /**
   * Track heartbeat from a viewer to maintain accurate viewer counts
   * @route POST /api/viewers/:streamId/heartbeat
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const heartbeat = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    const userId = req.user.id;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Use viewer service to send heartbeat
    await viewerService.sendHeartbeat(streamId, userId);
    
    res.json({
      success: true,
      message: 'Heartbeat received'
    });
  });
  
  /**
   * Check if a user is viewing a specific stream
   * @route GET /api/viewers/:streamId/check/:userId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object 
   */
  const checkViewerStatus = asyncHandler(async (req, res) => {
    const { streamId, userId } = req.params;
    
    // Validate parameters
    if (!streamId || !userId) {
      throw new ApiError('Stream ID and User ID are required', 400);
    }
    
    // Check if stream exists
    const streamExists = await Stream.exists({ _id: streamId });
    if (!streamExists) {
      throw new ApiError('Stream not found', 404);
    }
    
    // Check if user is viewing stream via service
    const isViewing = await viewerService.isUserViewingStream(streamId, userId);
    
    res.json({
      success: true,
      streamId,
      userId,
      isViewing
    });
  });
  
  /**
   * Get all viewers for a stream
   * @route GET /api/viewers/:streamId/list
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const getViewers = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Check if stream exists
    const streamExists = await Stream.exists({ _id: streamId });
    if (!streamExists) {
      throw new ApiError('Stream not found', 404);
    }
    
    // Get viewers via service
    const viewerIds = await viewerService.getStreamViewerIds(streamId);
    
    res.json({
      success: true,
      streamId,
      viewers: viewerIds,
      count: viewerIds.length
    });
  });
  
  // Define routes
  router.get('/:streamId/count', getViewerCount);
  router.post('/:streamId/join', authenticateToken, joinStream);
  router.post('/:streamId/leave', authenticateToken, leaveStream);
  router.post('/:streamId/heartbeat', authenticateToken, heartbeat);
  router.get('/:streamId/check/:userId', checkViewerStatus);
  router.get('/:streamId/list', getViewers);
  
  // Return the controller with the router
  return {
    router,
    getViewerCount,
    joinStream,
    leaveStream,
    heartbeat,
    checkViewerStatus,
    getViewers
  };
};
