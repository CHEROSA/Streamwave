/**
 * WebSocket Controller
 * 
 * Provides API endpoints for WebSocket-related functionality.
 * Uses dependency injection for the WebSocket service to avoid circular dependencies.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

class WebSocketController {
  constructor(webSocketService) {
    if (!webSocketService) {
      throw new Error('WebSocket service is required for the WebSocket controller');
    }
    this.webSocketService = webSocketService;
    this.router = this._initializeRoutes();
  }

  _initializeRoutes() {
    const router = express.Router();

    router.get('/streams/:streamId/viewers', asyncHandler(this.getStreamViewerCount.bind(this)));
    router.get('/streams/active', asyncHandler(this.getActiveStreams.bind(this)));
    router.get('/streams/top', asyncHandler(this.getTopStreams.bind(this)));
    router.post('/streams/:streamId/join', authenticate, asyncHandler(this.joinStream.bind(this)));
    router.post('/streams/:streamId/leave', authenticate, asyncHandler(this.leaveStream.bind(this)));

    return router;
  }

  getRouter() {
    return this.router;
  }

  async getStreamViewerCount(req, res) {
    const { streamId } = req.params;
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }

    const count = await this.webSocketService.getViewerCount(streamId);
    return res.status(200).json({ success: true, count });
  }

  async getTopStreams(req, res) {
    const limit = parseInt(req.query.limit) || 10;
    
    const streams = await this.webSocketService.getTopStreams(limit);
    return res.status(200).json({ success: true, streams });
  }

  async getActiveStreams(req, res) {
    const { category, limit, skip } = req.query;
    const options = {
      category,
      limit: parseInt(limit) || 20,
      skip: parseInt(skip) || 0
    };

    const streams = await this.webSocketService.getActiveStreams(options);
    return res.status(200).json({ success: true, streams });
  }

  async joinStream(req, res) {
    const { streamId } = req.params;
    const userId = req.user.id;
    
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }

    if (!userId) {
      throw new ApiError('User ID is required', 400);
    }

    const result = await this.webSocketService.addUserToStream(streamId, userId, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.status(200).json({ success: true, result });
  }

  async leaveStream(req, res) {
    const { streamId } = req.params;
    const userId = req.user.id;
    
    if (!streamId) {
      throw new ApiError('Stream ID is required', 400);
    }

    if (!userId) {
      throw new ApiError('User ID is required', 400);
    }

    const result = await this.webSocketService.removeUserFromStream(streamId, userId);

    return res.status(200).json({ success: true, result });
  }
}

module.exports = WebSocketController;
