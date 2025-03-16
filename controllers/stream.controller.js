/**
 * Stream Controller
 * 
 * Handles operations related to streams including creating, updating,
 * retrieving, and ending streams.
 */
const express = require('express');
const { HTTP_STATUS, STREAM_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const repositoryFactory = require('../repositories/repository.factory');
const streamService = require('../services/stream.service');
const cacheService = require('../services/cache.service');
const chatService = require('../services/chat.service');
const { getWebSocketService } = require('../config/websocket');

// Get dependencies from the dependency injector
const container = require('../utils/dependencyInjector');
const transactionManager = container.get('transactionManager');
const serviceFactory = container.get('serviceFactory');

/**
 * Factory function that creates and returns the stream controller
 * @returns {Object} Controller with functions
 */
module.exports = () => {
  // Get repositories
  const streamRepository = repositoryFactory.getStreamRepository();
  const userRepository = repositoryFactory.getUserRepository();

  /**
   * Create a new stream
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const createStream = asyncHandler(async (req, res) => {
    const { title, description, thumbnail, isPrivate, category, tags, scheduledTime } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!title) {
      throw new ApiError('Title is required', 400);
    }
    
    // Prepare stream data
    const streamData = {
      userId,
      title,
      description,
      thumbnail,
      isPrivate: isPrivate || false,
      category,
      tags
    };
    
    let stream;
    
    // Use appropriate lifecycle method based on whether it's scheduled or live
    if (scheduledTime) {
      // Use the scheduleStream lifecycle method
      stream = await streamService.scheduleStream(streamData, scheduledTime);
      logger.info(`Stream scheduled: ${stream.id} by user ${userId} for ${scheduledTime}`);
    } else {
      // Use the setStreamLive lifecycle method
      stream = await streamService.setStreamLive(null, streamData);
      logger.info(`Stream created and set to live: ${stream.id} by user ${userId}`);
    }
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      stream
    });
  });
  
  /**
   * Get all active streams
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const getActiveStreams = asyncHandler(async (req, res) => {
    // Get active streams from service
    const streams = await streamService.getActiveStreams();
    
    res.json({
      success: true,
      streams
    });
  });
  
  /**
   * Get all scheduled streams
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const getScheduledStreams = asyncHandler(async (req, res) => {
    const { userId, limit } = req.query;
    
    // Get scheduled streams from service
    const streams = await streamService.getScheduledStreams({
      userId,
      limit: limit ? parseInt(limit) : undefined
    });
    
    res.json({
      success: true,
      streams
    });
  });
  
  /**
   * Get a stream by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const getStreamById = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Get stream from repository
    const stream = await streamRepository.findById(streamId);
    
    if (!stream) {
      throw new ApiError('Stream not found', 404);
    }
    
    // Get viewer count if stream is live
    let viewerCount = 0;
    if (stream.status === STREAM_STATUS.LIVE) {
      viewerCount = await streamService.getStreamViewerCount(streamId);
    }
    
    res.json({
      success: true,
      stream: {
        ...stream,
        viewerCount
      }
    });
  });
  
  /**
   * Update a stream
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const updateStream = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    const userId = req.user.id;
    const { title, description, thumbnail, isPrivate, category, tags, status } = req.body;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Get stream to check ownership
    const existingStream = await streamRepository.findById(streamId);
    
    if (!existingStream) {
      throw new ApiError('Stream not found', 404);
    }
    
    // Check ownership
    if (existingStream.userId.toString() !== userId) {
      throw new ApiError('Not authorized to update this stream', 403);
    }
    
    let updatedStream;
    
    // Handle status changes using lifecycle methods
    if (status) {
      if (status === STREAM_STATUS.LIVE && existingStream.status !== STREAM_STATUS.LIVE) {
        // Stream is going live - use setStreamLive lifecycle method
        updatedStream = await streamService.setStreamLive(streamId, {
          userId,
          title: title || existingStream.title,
          description: description || existingStream.description,
          thumbnail: thumbnail || existingStream.thumbnail,
          category: category || existingStream.category,
          isPrivate: isPrivate !== undefined ? isPrivate : existingStream.isPrivate,
          tags: tags || existingStream.tags
        });
      } else if (status === STREAM_STATUS.ENDED && existingStream.status === STREAM_STATUS.LIVE) {
        // Stream is ending - use endStream lifecycle method
        updatedStream = await streamService.endStream(streamId, { userId });
      } else if (status === STREAM_STATUS.CANCELLED && existingStream.status === STREAM_STATUS.SCHEDULED) {
        // Stream is being cancelled - use cancelScheduledStream lifecycle method
        updatedStream = await streamService.cancelScheduledStream(streamId, { userId });
      } else {
        // For other status changes or field updates without lifecycle implications
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
        if (isPrivate !== undefined) updateData.isPrivate = isPrivate;
        if (category !== undefined) updateData.category = category;
        if (tags !== undefined) updateData.tags = tags;
        
        // Only update status if it's not a special lifecycle transition
        if (![STREAM_STATUS.LIVE, STREAM_STATUS.ENDED, STREAM_STATUS.CANCELLED].includes(status) || 
            (status === STREAM_STATUS.LIVE && existingStream.status === STREAM_STATUS.LIVE)) {
          updateData.status = status;
        }
        
        updatedStream = await streamRepository.update(streamId, updateData);
        
        // If still live, update cache with metadata changes
        if (updatedStream.status === STREAM_STATUS.LIVE) {
          await streamService.updateActiveStream(streamId, {
            id: updatedStream.id,
            title: updatedStream.title,
            userId: updatedStream.userId,
            thumbnail: updatedStream.thumbnail,
            category: updatedStream.category
          });
        }
      }
    } else {
      // No status change, just metadata updates
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
      if (isPrivate !== undefined) updateData.isPrivate = isPrivate;
      if (category !== undefined) updateData.category = category;
      if (tags !== undefined) updateData.tags = tags;
      
      updatedStream = await streamRepository.update(streamId, updateData);
      
      // Update cache if stream is live
      if (updatedStream.status === STREAM_STATUS.LIVE) {
        await streamService.updateActiveStream(streamId, {
          id: updatedStream.id,
          title: updatedStream.title,
          userId: updatedStream.userId,
          thumbnail: updatedStream.thumbnail,
          category: updatedStream.category
        });
      }
    }
    
    res.json({
      success: true,
      stream: updatedStream
    });
  });
  
  /**
   * End a stream
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const endStream = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    const userId = req.user.id;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Use the endStream lifecycle method
    const updatedStream = await streamService.endStream(streamId, { userId });
    
    res.json({
      success: true,
      message: 'Stream ended successfully',
      stream: updatedStream
    });
  });
  
  /**
   * Cancel a scheduled stream
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const cancelScheduledStream = asyncHandler(async (req, res) => {
    const { streamId } = req.params;
    const userId = req.user.id;
    
    // Validate streamId
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }
    
    // Use the cancelScheduledStream lifecycle method
    const updatedStream = await streamService.cancelScheduledStream(streamId, { userId });
    
    res.json({
      success: true,
      message: 'Scheduled stream cancelled successfully',
      stream: updatedStream
    });
  });
  
  /**
   * Get streams by user ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  const getStreamsByUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    // Validate userId
    if (!userId) {
      throw new ApiError('User ID is required', 400);
    }
    
    // Get streams from repository
    const streams = await streamRepository.findByUserId(userId);
    
    res.json({
      success: true,
      streams
    });
  });

  // Return the controller with just the functions, no router
  return {
    createStream,
    getActiveStreams,
    getScheduledStreams,
    getStreamById,
    updateStream,
    endStream,
    cancelScheduledStream,
    getStreamsByUser
  };
};
