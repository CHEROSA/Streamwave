/**
 * Stream Repository
 * 
 * Repository for managing stream data using Sequelize.
 * Extends the base repository with stream-specific methods.
 */
const { Op } = require('sequelize');
const BaseRepository = require('./base.repository');
const db = require('../config/database');
const { redisClient, safeRedisOperation, isRedisEnabled } = require('../config/redis.config');
const { REDIS_KEYS, STREAM_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');
const { storageService, MEDIA_TYPES } = require('../services/storage-factory');
const { StreamState } = require('../constants/stream.states');

/**
 * Stream Repository
 * @extends BaseRepository
 */
class StreamRepository extends BaseRepository {
  /**
   * Create a new stream repository
   */
  constructor() {
    super('Stream', {
      entityName: 'stream',
      enableCache: true,
      cacheTTL: 1800 // 30 minutes
    });
    
    logger.debug('StreamRepository initialized');
  }
  
  /**
   * Find active streams
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of active streams
   */
  async findActiveStreams(options = {}) {
    return this.findAll({
      where: { state: StreamState.LIVE },
      ...options
    });
  }
  
  /**
   * Find streams by category
   * @param {string} category - Stream category
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of streams
   */
  async findByCategory(category, options = {}) {
    return this.find({
      where: {
        category,
        isActive: true,
        isPrivate: false
      },
      order: [
        ['viewerCount', 'DESC'],
        ['startedAt', 'DESC']
      ],
      ...options
    });
  }
  
  /**
   * Find streams by user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of streams
   */
  async findByUser(userId, options = {}) {
    return this.find({
      where: { userId },
      order: [['startedAt', 'DESC']],
      ...options
    });
  }
  
  /**
   * Find private streams by user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of private streams
   */
  async findPrivateByUser(userId, options = {}) {
    return this.find({
      where: { 
        userId, 
        isPrivate: true 
      },
      order: [['startedAt', 'DESC']],
      ...options
    });
  }
  
  /**
   * Search streams by title or description
   * @param {string} query - Search query
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of streams
   */
  async searchStreams(query, options = {}) {
    return this.find({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { title: { [Op.like]: `%${query}%` } },
              { description: { [Op.like]: `%${query}%` } },
              { tags: { [Op.like]: `%${query}%` } }
            ]
          },
          { isActive: true },
          { isPrivate: false }
        ]
      },
      order: [
        ['viewerCount', 'DESC'],
        ['startedAt', 'DESC']
      ],
      ...options
    });
  }
  
  /**
   * Update stream viewer count
   * @param {string} streamId - Stream ID
   * @param {number} count - Viewer count
   * @returns {Promise<Object>} - Updated stream
   */
  async updateViewerCount(streamId, count) {
    return this.update(streamId, { viewerCount: count });
  }
  
  /**
   * End a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} - Updated stream
   */
  async endStream(streamId) {
    return this.update(
      streamId,
      {
        isActive: false,
        endedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );
  }
  
  /**
   * Get stream statistics
   * @returns {Promise<Object>} - Stream statistics
   */
  async getStatistics() {
    try {
      const [activeCount, totalCount, privateCount] = await Promise.all([
        this.model.count({ where: { isActive: true } }),
        this.model.count(),
        this.model.count({ where: { isPrivate: true } })
      ]);

      const categoryCounts = await this.model.findAll({
        where: { isActive: true },
        attributes: [
          'category',
          [db.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['category'],
        order: [[db.sequelize.fn('COUNT', '*'), 'DESC']]
      });
      
      return {
        activeStreams: activeCount,
        totalStreams: totalCount,
        privateStreams: privateCount,
        categoryCounts: categoryCounts.map(item => ({
          category: item.category,
          count: parseInt(item.get('count'), 10)
        }))
      };
    } catch (error) {
      logger.error(`Error getting stream statistics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find streams by user ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of streams
   */
  async findByUserId(userId, options = {}) {
    return this.findAll({
      where: { userId },
      ...options
    });
  }

  /**
   * Update stream status
   * @param {string} streamId - Stream ID
   * @param {string} status - New status
   * @returns {Promise<Object|null>} - Updated stream or null
   */
  async updateStatus(streamId, status) {
    if (!streamId || !status) return null;
    
    if (!Object.values(STREAM_STATUS).includes(status)) {
      throw new Error(`Invalid stream status: ${status}`);
    }
    
    const update = { 
      status,
      // Set timestamps based on status
      ...this.getStatusTimestamps(status)
    };
    
    const updatedStream = await this.updateById(streamId, update);
    
    // Additional actions based on status
    if (updatedStream) {
      if (status === STREAM_STATUS.LIVE) {
        // Cache active stream in Redis if enabled
        await this._cacheActiveStream(updatedStream);
      } else if (status === STREAM_STATUS.ENDED) {
        // Remove from active streams in Redis if enabled
        await this._removeActiveStream(streamId);
      }
    }
    
    return updatedStream;
  }

  /**
   * Get timestamp fields for a stream status update
   * @param {string} status - Stream status
   * @returns {Object} - Timestamp fields to update
   * @private
   */
  getStatusTimestamps(status) {
    const timestamps = {};
    
    switch (status) {
      case STREAM_STATUS.LIVE:
        timestamps.startedAt = new Date();
        break;
      case STREAM_STATUS.ENDED:
        timestamps.endedAt = new Date();
        // Calculate duration if the stream was started
        timestamps.duration = function() {
          if (this.startedAt) {
            return (new Date() - this.startedAt) / 1000; // Duration in seconds
          }
          return 0;
        };
        break;
    }
    
    return timestamps;
  }

  /**
   * Get viewer count for a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<number>} - Viewer count
   */
  async getViewerCount(streamId) {
    if (!streamId) return 0;
    
    // Try to get from Redis if enabled
    if (isRedisEnabled()) {
      try {
        const count = await safeRedisOperation(async (client) => {
          return client.hget(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count');
        });
        
        if (count !== null) {
          return parseInt(count, 10);
        }
      } catch (error) {
        logger.error(`Error getting viewer count from Redis: ${error.message}`);
      }
    }
    
    // Fallback to database
    try {
      const metadata = await db.models.StreamMetadata.findOne({
        where: { streamId }
      });
      return metadata ? metadata.viewerCount : 0;
    } catch (error) {
      logger.error(`Error getting viewer count from database: ${error.message}`);
      return 0;
    }
  }

  /**
   * Add a viewer to a stream
   * @param {string} streamId - Stream ID
   * @param {string} userId - User ID
   * @param {Object} metadata - Additional viewer metadata
   * @returns {Promise<Object>} - Updated stream with viewer count
   */
  async addViewer(streamId, userId, metadata = {}) {
    if (!streamId || !userId) {
      throw new Error('Stream ID and User ID are required');
    }
    
    try {
      // First, check if stream exists
      const stream = await this.findById(streamId);
      
      if (!stream) {
        throw new Error(`Stream not found: ${streamId}`);
      }
      
      // Check if stream is live
      if (stream.status !== STREAM_STATUS.LIVE) {
        throw new Error(`Stream is not live: ${streamId}`);
      }
      
      // Add or update viewer record
      const viewer = {
        streamId,
        userId,
        joinedAt: new Date(),
        lastActiveAt: new Date(),
        deviceInfo: metadata.device || {}
      };
      
      // Try to add viewer, if already exists, update last active time
      const streamViewer = await db.models.StreamViewer.findOrCreate({
        where: { streamId, userId },
        defaults: viewer,
        returning: true
      });
      
      // Increment viewer count
      const count = await this.incrementViewerCount(streamId);
      
      // Return stream with updated count
      return {
        ...stream,
        viewerCount: count,
        viewer: streamViewer[0]
      };
    } catch (error) {
      logger.error(`Error adding viewer to stream: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove a viewer from a stream
   * @param {string} streamId - Stream ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Updated stream with viewer count
   */
  async removeViewer(streamId, userId) {
    if (!streamId || !userId) {
      throw new Error('Stream ID and User ID are required');
    }
    
    try {
      // Try to find and remove viewer
      const result = await db.models.StreamViewer.destroy({
        where: { streamId, userId }
      });
      
      // If viewer was found and removed, decrement count
      if (result) {
        const count = await this.decrementViewerCount(streamId);
        
        // Get stream with updated count
        const stream = await this.findById(streamId);
        
        return {
          ...stream,
          viewerCount: count
        };
      }
      
      // If viewer wasn't found, just return the stream
      const stream = await this.findById(streamId);
      const count = await this.getViewerCount(streamId);
      
      return {
        ...stream,
        viewerCount: count
      };
    } catch (error) {
      logger.error(`Error removing viewer from stream: ${error.message}`);
      throw error;
    }
  }

  /**
   * Increment viewer count for a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<number>} - New viewer count
   * @private
   */
  async incrementViewerCount(streamId) {
    // Use Redis for atomic increment if enabled
    if (isRedisEnabled()) {
      try {
        const count = await safeRedisOperation(async (client) => {
          // Increment count in Redis hash
          await client.hincrby(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count', 1);
          // Get updated count
          return client.hget(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count');
        });
        
        const parsedCount = parseInt(count, 10);
        
        // Also update in database periodically (not every time for performance)
        if (parsedCount % 5 === 0) {
          await this.updateViewerCount(streamId, parsedCount);
        }
        
        return parsedCount;
      } catch (error) {
        logger.error(`Error incrementing viewer count in Redis: ${error.message}`);
      }
    }
    
    // Fallback to database
    try {
      const [metadata] = await db.models.StreamMetadata.findOrCreate({
        where: { streamId },
        defaults: {
          streamId,
          viewerCount: 0,
          peakViewerCount: 0
        }
      });

      // Use a transaction to ensure atomicity
      const result = await db.sequelize.transaction(async (t) => {
        await metadata.increment('viewerCount', { transaction: t });
        
        // Update peak viewer count if necessary
        const updatedMetadata = await metadata.reload({ transaction: t });
        if (updatedMetadata.viewerCount > updatedMetadata.peakViewerCount) {
          updatedMetadata.peakViewerCount = updatedMetadata.viewerCount;
          await updatedMetadata.save({ transaction: t });
        }
        
        return updatedMetadata;
      });
      
      return result.viewerCount;
    } catch (error) {
      logger.error(`Error incrementing viewer count in database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decrement viewer count for a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<number>} - New viewer count
   * @private
   */
  async decrementViewerCount(streamId) {
    // Use Redis for atomic decrement if enabled
    if (isRedisEnabled()) {
      try {
        const count = await safeRedisOperation(async (client) => {
          // Get current count first
          const current = await client.hget(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count');
          
          // Don't decrement below zero
          if (!current || parseInt(current, 10) <= 0) {
            await client.hset(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count', 0);
            return 0;
          }
          
          // Decrement count
          await client.hincrby(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count', -1);
          
          // Get updated count
          return client.hget(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count');
        });
        
        const parsedCount = parseInt(count, 10);
        
        // Also update in database periodically
        if (parsedCount % 5 === 0) {
          await this.updateViewerCount(streamId, parsedCount);
        }
        
        return parsedCount;
      } catch (error) {
        logger.error(`Error decrementing viewer count in Redis: ${error.message}`);
      }
    }
    
    // Fallback to database
    try {
      const [metadata] = await db.models.StreamMetadata.findOrCreate({
        where: { streamId },
        defaults: {
          streamId,
          viewerCount: 0,
          peakViewerCount: 0
        }
      });

      // Use a transaction to ensure atomicity
      const result = await db.sequelize.transaction(async (t) => {
        await metadata.decrement('viewerCount', { transaction: t });
        
        // Ensure count doesn't go below zero
        const updatedMetadata = await metadata.reload({ transaction: t });
        if (updatedMetadata.viewerCount < 0) {
          updatedMetadata.viewerCount = 0;
          await updatedMetadata.save({ transaction: t });
        }
        
        return updatedMetadata;
      });
      
      return result.viewerCount;
    } catch (error) {
      logger.error(`Error decrementing viewer count in database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find trending streams
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of trending streams
   */
  async findTrending(options = {}) {
    const limit = options.limit || 10;
    
    // Use Redis if enabled
    if (isRedisEnabled()) {
      try {
        // Get stream IDs sorted by viewer count
        const streamIds = await safeRedisOperation(async (client) => {
          return client.zrevrange(REDIS_KEYS.TRENDING_STREAMS, 0, limit - 1);
        });
        
        if (streamIds && streamIds.length) {
          // Get stream data for each ID
          const streams = await Promise.all(
            streamIds.map(async (id) => {
              const stream = await this.findById(id, {
                include: options.include || [{ model: db.models.User, as: 'user' }],
                useCache: true
              });
              
              if (stream) {
                // Get viewer count
                stream.viewerCount = await this.getViewerCount(id);
                return stream;
              }
              
              return null;
            })
          );
          
          // Filter out null values (streams that weren't found)
          return streams.filter(Boolean);
        }
      } catch (error) {
        logger.error(`Error getting trending streams from Redis: ${error.message}`);
      }
    }
    
    // Fallback to database
    try {
      // Find streams with metadata, sort by viewer count
      const streamMetadata = await db.models.StreamMetadata.findAll({
        where: {
          viewerCount: {
            [Op.gt]: 0
          }
        },
        order: [['viewerCount', 'DESC']],
        limit,
      });
      
      if (streamMetadata && streamMetadata.length) {
        // Get stream IDs
        const streamIds = streamMetadata.map(metadata => metadata.streamId);
        
        // Find streams by IDs
        const streams = await this.find({
          where: { 
            id: {
              [Op.in]: streamIds
            },
            status: STREAM_STATUS.LIVE
          },
          include: options.include || [{ model: db.models.User, as: 'user' }],
          useCache: true
        });
        
        // Add viewer counts to streams and sort
        return streams.map(stream => {
          const metadata = streamMetadata.find(
            m => m.streamId === stream.id
          );
          
          return {
            ...stream.toJSON(),
            viewerCount: metadata ? metadata.viewerCount : 0
          };
        }).sort((a, b) => b.viewerCount - a.viewerCount);
      }
      
      return [];
    } catch (error) {
      logger.error(`Error finding trending streams: ${error.message}`);
      return [];
    }
  }

  /**
   * Get active streams from Redis
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of active streams
   * @private
   */
  async getActiveStreamsFromRedis(options = {}) {
    try {
      // Get all stream IDs from the active streams set
      const streamIds = await safeRedisOperation(async (client) => {
        return client.smembers(REDIS_KEYS.ACTIVE_STREAMS);
      });
      
      if (!streamIds || !streamIds.length) {
        return [];
      }
      
      // Apply category and tag filters if needed
      let filteredIds = streamIds;
      
      if (options.category || (options.tags && options.tags.length)) {
        // We need to filter the streams, which requires fetching them
        const streams = await Promise.all(
          streamIds.map(id => this.findById(id, { useCache: true }))
        );
        
        // Apply filters
        filteredIds = streams
          .filter(stream => {
            if (!stream) return false;
            
            // Apply category filter
            if (options.category && stream.category !== options.category) {
              return false;
            }
            
            // Apply tags filter
            if (options.tags && options.tags.length) {
              if (!stream.tags || !stream.tags.length) return false;
              
              // Check if stream has any of the requested tags
              return stream.tags.some(tag => options.tags.includes(tag));
            }
            
            return true;
          })
          .map(stream => stream._id.toString());
      }
      
      // Apply pagination
      const page = options.page || 1;
      const limit = options.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit - 1;
      
      const paginatedIds = filteredIds.slice(start, end + 1);
      
      if (!paginatedIds.length) {
        return [];
      }
      
      // Get full stream data with viewer counts
      const streams = await Promise.all(
        paginatedIds.map(async (id) => {
          const stream = await this.findById(id, {
            populate: options.populate || 'userId',
            useCache: true
          });
          
          if (stream) {
            // Get viewer count
            stream.viewerCount = await this.getViewerCount(id);
            return stream;
          }
          
          return null;
        })
      );
      
      // Filter out null values and sort by start time
      return streams
        .filter(Boolean)
        .sort((a, b) => {
          // Sort by startTime descending (newest first)
          return new Date(b.startedAt) - new Date(a.startedAt);
        });
    } catch (error) {
      logger.error(`Error getting active streams from Redis: ${error.message}`);
      return [];
    }
  }

  /**
   * Cache an active stream in Redis
   * @param {Object} stream - Stream to cache
   * @returns {Promise<void>}
   * @private
   */
  async _cacheActiveStream(stream) {
    if (!isRedisEnabled() || !stream) return;
    
    try {
      await safeRedisOperation(async (client) => {
        // Add to active streams set
        await client.sadd(REDIS_KEYS.ACTIVE_STREAMS, stream._id.toString());
        
        // Initialize viewer count if not exists
        const exists = await client.exists(`${REDIS_KEYS.STREAM_VIEWERS}:${stream._id}`);
        
        if (!exists) {
          await client.hset(`${REDIS_KEYS.STREAM_VIEWERS}:${stream._id}`, 'count', 0);
        }
        
        // Add to trending streams sorted set with initial score of 0
        await client.zadd(REDIS_KEYS.TRENDING_STREAMS, 0, stream._id.toString());
        
        // Set expiration on the viewer count hash (24 hours)
        await client.expire(`${REDIS_KEYS.STREAM_VIEWERS}:${stream._id}`, 86400);
      });
    } catch (error) {
      logger.error(`Error caching active stream in Redis: ${error.message}`);
    }
  }

  /**
   * Remove an active stream from Redis
   * @param {string} streamId - Stream ID
   * @returns {Promise<void>}
   * @private
   */
  async _removeActiveStream(streamId) {
    if (!isRedisEnabled() || !streamId) return;
    
    try {
      await safeRedisOperation(async (client) => {
        // Remove from active streams set
        await client.srem(REDIS_KEYS.ACTIVE_STREAMS, streamId.toString());
        
        // Remove from trending streams sorted set
        await client.zrem(REDIS_KEYS.TRENDING_STREAMS, streamId.toString());
        
        // Remove viewer count hash
        await client.del(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`);
      });
    } catch (error) {
      logger.error(`Error removing active stream from Redis: ${error.message}`);
    }
  }

  /**
   * Update cached stream viewer count in Redis
   * @param {string} streamId - Stream ID
   * @param {number} viewerCount - Viewer count
   * @returns {Promise<void>}
   * @private
   */
  async _updateCachedStreamViewerCount(streamId, viewerCount) {
    if (!isRedisEnabled() || !streamId) return;
    
    try {
      await safeRedisOperation(async (client) => {
        // Update viewer count in hash
        await client.hset(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 'count', viewerCount);
        
        // Update score in trending streams sorted set
        await client.zadd(REDIS_KEYS.TRENDING_STREAMS, viewerCount, streamId.toString());
        
        // Refresh expiration
        await client.expire(`${REDIS_KEYS.STREAM_VIEWERS}:${streamId}`, 86400);
      });
    } catch (error) {
      logger.error(`Error updating cached stream viewer count in Redis: ${error.message}`);
    }
  }

  /**
   * Update stream thumbnail
   * @param {string} streamId - Stream ID
   * @param {Buffer} thumbnailBuffer - Image buffer
   * @param {string} filename - Original filename
   * @param {string} contentType - Content type (MIME)
   * @returns {Promise<Object>} Updated stream
   */
  async updateStreamThumbnail(streamId, thumbnailBuffer, filename, contentType) {
    try {
      const stream = await this.findById(streamId);
      
      if (!stream) {
        throw new Error(`Stream not found: ${streamId}`);
      }
      
      // Verify storage service is available
      if (!storageService || typeof storageService.uploadFile !== 'function') {
        logger.error('Storage service is not properly initialized for thumbnail upload', {
          service: "streamwave-api",
          streamId
        });
        throw new Error('Storage service unavailable');
      }
      
      // Upload thumbnail to storage with detailed error handling
      let result;
      try {
        // Upload thumbnail to storage
        result = await storageService.uploadFile(
          thumbnailBuffer, 
          filename, 
          MEDIA_TYPES.THUMBNAIL, 
          stream.userId.toString(), 
          contentType
        );
      } catch (uploadError) {
        logger.error(`Thumbnail upload failed: ${uploadError.message}`, {
          stack: uploadError.stack,
          streamId,
          userId: stream.userId,
          fileName: filename,
          service: "streamwave-api"
        });
        throw new Error(`Thumbnail upload failed: ${uploadError.message}`);
      }
      
      if (!result || !result.url) {
        logger.error('Storage service returned invalid result for thumbnail upload', {
          result,
          streamId,
          service: "streamwave-api"
        });
        throw new Error('Invalid storage result');
      }
      
      // Update stream with new thumbnail URL
      const updatedStream = await this.update(
        streamId,
        { 
          thumbnail: result.url,
          updatedAt: new Date() 
        },
        { new: true }
      );
      
      logger.info(`Updated thumbnail for stream ${streamId}: ${result.url}`);
      return updatedStream;
    } catch (error) {
      logger.error(`Error updating stream thumbnail: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save stream recording
   * @param {string} streamId - Stream ID
   * @param {Buffer} recordingBuffer - Recording file buffer
   * @param {string} filename - Original filename
   * @param {string} contentType - MIME type
   * @returns {Promise<Object>} - Updated stream with recording URL
   */
  async saveStreamRecording(streamId, recordingBuffer, filename, contentType) {
    // Remove this method entirely as we're disabling recording
    throw new Error('Recording functionality has been disabled');
  }

  /**
   * Update stream state
   * @param {number} streamId - Stream ID
   * @param {string} state - New state
   * @returns {Promise<Object>} Updated stream
   */
  async updateState(streamId, state) {
    return this.update(streamId, { state });
  }
}

module.exports = new StreamRepository();