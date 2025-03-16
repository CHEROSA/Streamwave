/**
 * MongoDB Stream Repository
 * 
 * Implementation of the StreamRepository interface for MongoDB
 */
const StreamRepository = require('../stream.repository');
const { Stream, StreamMetadata, StreamViewer } = require('../../models/stream.model');
const { redisClient, safeRedisOperation, isRedisEnabled } = require('../../config/redis.config');
const { REDIS_KEYS, STREAM_STATUS } = require('../../utils/constants');
const logger = require('../../utils/logger');
const { ApiError } = require('../../middlewares/error.middleware');

/**
 * MongoDB Stream Repository implementation
 * @extends StreamRepository
 */
class MongoStreamRepository extends StreamRepository {
  /**
   * Find a stream by ID
   * @param {string} id - Stream ID
   * @returns {Promise<Object|null>} - Stream or null if not found
   */
  async findById(id) {
    try {
      const stream = await Stream.findById(id);
      return stream;
    } catch (error) {
      logger.error(`Error finding stream by ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Find streams by a query
   * @param {Object} query - Query object
   * @param {Object} options - Query options (pagination, sorting, etc.)
   * @returns {Promise<Array>} - Array of streams
   */
  async find(query, options = {}) {
    try {
      const { page = 1, limit = 20, sort = { startTime: -1 } } = options;
      const skip = (page - 1) * limit;

      const streams = await Stream.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);

      return streams;
    } catch (error) {
      logger.error(`Error finding streams: ${error.message}`);
      return [];
    }
  }

  /**
   * Find a single stream by a query
   * @param {Object} query - Query object
   * @returns {Promise<Object|null>} - Stream or null if not found
   */
  async findOne(query) {
    try {
      const stream = await Stream.findOne(query);
      return stream;
    } catch (error) {
      logger.error(`Error finding stream: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a new stream
   * @param {Object} data - Stream data
   * @returns {Promise<Object>} - Created stream
   */
  async create(data) {
    try {
      // Create stream
      const stream = await Stream.create(data);

      // Create metadata if not already created
      if (!data.skipMetadata) {
        await StreamMetadata.create({
          streamId: stream.id,
          userId: data.userId,
          status: data.status || STREAM_STATUS.LIVE,
          startedAt: data.startTime || new Date()
        });
      }

      // Cache in Redis if enabled and stream is live
      if (isRedisEnabled() && data.status === STREAM_STATUS.LIVE) {
        await this._cacheActiveStream(stream);
      }

      return stream;
    } catch (error) {
      logger.error(`Error creating stream: ${error.message}`);
      throw new ApiError(`Failed to create stream: ${error.message}`, 500);
    }
  }

  /**
   * Update a stream by ID
   * @param {string} id - Stream ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object|null>} - Updated stream or null if not found
   */
  async updateById(id, data) {
    try {
      const stream = await Stream.findByIdAndUpdate(
        id,
        { $set: data },
        { new: true }
      );

      // Update Redis cache if enabled and stream is active
      if (isRedisEnabled() && stream && stream.status === STREAM_STATUS.LIVE) {
        await this._updateCachedStream(stream);
      }

      return stream;
    } catch (error) {
      logger.error(`Error updating stream: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a stream by ID
   * @param {string} id - Stream ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  async deleteById(id) {
    try {
      const result = await Stream.findByIdAndDelete(id);
      
      // Remove from Redis cache if enabled
      if (isRedisEnabled() && result) {
        await safeRedisOperation(
          () => redisClient.hDel(REDIS_KEYS.ACTIVE_STREAMS, id),
          'deleteStream-hDel'
        );
      }
      
      return !!result;
    } catch (error) {
      logger.error(`Error deleting stream: ${error.message}`);
      return false;
    }
  }

  /**
   * Count streams by a query
   * @param {Object} query - Query object
   * @returns {Promise<number>} - Count of streams
   */
  async count(query) {
    try {
      return await Stream.countDocuments(query);
    } catch (error) {
      logger.error(`Error counting streams: ${error.message}`);
      return 0;
    }
  }

  /**
   * Find active (live) streams
   * @param {Object} options - Filter options (category, pagination, etc.)
   * @returns {Promise<Array>} - Array of active streams
   */
  async findActiveStreams(options = {}) {
    try {
      // Check if Redis is enabled
      if (isRedisEnabled()) {
        // Get active streams from Redis
        const cachedStreams = await safeRedisOperation(
          () => redisClient.hGetAll(REDIS_KEYS.ACTIVE_STREAMS),
          'findActiveStreams-hGetAll',
          {}
        );
        
        // Parse JSON values
        const activeStreams = Object.values(cachedStreams).map(stream => JSON.parse(stream));
        
        // Apply filters if needed
        const { category, tags, page = 1, limit = 20 } = options;
        let filtered = activeStreams;
        
        if (category) {
          filtered = filtered.filter(stream => stream.category === category);
        }
        
        if (tags && tags.length > 0) {
          filtered = filtered.filter(stream => {
            return tags.some(tag => stream.tags && stream.tags.includes(tag));
          });
        }
        
        // Apply pagination
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedStreams = filtered.slice(start, end);
        
        logger.info(`Found ${paginatedStreams.length} active streams from Redis cache`);
        return paginatedStreams;
      }
      
      // Fallback to MongoDB if Redis is not enabled
      const query = { status: STREAM_STATUS.LIVE };
      
      if (options.category) {
        query.category = options.category;
      }
      
      if (options.tags && options.tags.length > 0) {
        query.tags = { $in: options.tags };
      }
      
      return await this.find(query, options);
    } catch (error) {
      logger.error(`Error finding active streams: ${error.message}`);
      return [];
    }
  }

  /**
   * Find streams by user ID
   * @param {string} userId - User ID
   * @param {Object} options - Filter options (status, pagination, etc.)
   * @returns {Promise<Array>} - Array of streams
   */
  async findByUserId(userId, options = {}) {
    try {
      const query = { userId };
      
      if (options.status) {
        query.status = options.status;
      }
      
      return await this.find(query, options);
    } catch (error) {
      logger.error(`Error finding streams by user ID: ${error.message}`);
      return [];
    }
  }

  /**
   * Update stream status
   * @param {string} streamId - Stream ID
   * @param {string} status - New status
   * @returns {Promise<Object|null>} - Updated stream or null if not found
   */
  async updateStatus(streamId, status) {
    try {
      const stream = await this.updateById(streamId, { 
        status, 
        endTime: status === STREAM_STATUS.ENDED ? new Date() : undefined
      });
      
      // Update metadata
      if (stream) {
        await StreamMetadata.findOneAndUpdate(
          { streamId },
          { 
            $set: { 
              status,
              endedAt: status === STREAM_STATUS.ENDED ? new Date() : undefined
            }
          }
        );
        
        // Remove from active streams in Redis if ended
        if (isRedisEnabled() && status === STREAM_STATUS.ENDED) {
          await safeRedisOperation(
            () => redisClient.hDel(REDIS_KEYS.ACTIVE_STREAMS, streamId),
            'updateStatus-hDel'
          );
        }
      }
      
      return stream;
    } catch (error) {
      logger.error(`Error updating stream status: ${error.message}`);
      return null;
    }
  }

  /**
   * Update stream metadata
   * @param {string} streamId - Stream ID
   * @param {Object} metadata - Metadata to update
   * @returns {Promise<Object|null>} - Updated stream metadata or null if not found
   */
  async updateMetadata(streamId, metadata) {
    try {
      const result = await StreamMetadata.findOneAndUpdate(
        { streamId },
        { $set: metadata },
        { upsert: true, new: true }
      );
      
      return result;
    } catch (error) {
      logger.error(`Error updating stream metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Get stream viewer count
   * @param {string} streamId - Stream ID
   * @returns {Promise<number>} - Viewer count
   */
  async getViewerCount(streamId) {
    try {
      // Get from Redis if enabled
      if (isRedisEnabled()) {
        const count = await safeRedisOperation(
          () => redisClient.get(REDIS_KEYS.VIEWER_COUNT(streamId)),
          'getStreamViewerCount',
          '0'
        );
        
        return parseInt(count) || 0;
      }
      
      // Fallback to MongoDB
      const metadata = await StreamMetadata.findOne({ streamId });
      return metadata?.viewerCount || 0;
    } catch (error) {
      logger.error(`Error getting stream viewer count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Update stream viewer count
   * @param {string} streamId - Stream ID
   * @param {number} count - New viewer count
   * @returns {Promise<number>} - Updated viewer count
   */
  async updateViewerCount(streamId, count) {
    try {
      // Ensure count is not negative
      const safeCount = Math.max(0, count);
      
      // Update in Redis if enabled
      if (isRedisEnabled()) {
        await safeRedisOperation(
          () => redisClient.set(REDIS_KEYS.VIEWER_COUNT(streamId), safeCount.toString()),
          'updateViewerCount-set'
        );
        
        // Update active streams hash
        await this._updateCachedStreamViewerCount(streamId, safeCount);
      }
      
      // Update in MongoDB
      await StreamMetadata.findOneAndUpdate(
        { streamId },
        { $set: { viewerCount: safeCount } },
        { upsert: true }
      );
      
      return safeCount;
    } catch (error) {
      logger.error(`Error updating stream viewer count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Add viewer to stream
   * @param {string} streamId - Stream ID
   * @param {string} userId - User ID
   * @param {Object} metadata - Optional viewer metadata
   * @returns {Promise<number>} - Updated viewer count
   */
  async addViewer(streamId, userId, metadata = {}) {
    try {
      // Validate that the stream exists and is live
      const stream = await this.findById(streamId);
      if (!stream) {
        throw new ApiError('Stream not found', 404);
      }
      
      if (stream.status !== STREAM_STATUS.LIVE) {
        throw new ApiError('Stream is not live', 400);
      }
      
      // Track in Redis if enabled
      let updatedCount = 0;
      if (isRedisEnabled()) {
        // Add user to stream viewers set
        await safeRedisOperation(
          () => redisClient.sAdd(REDIS_KEYS.STREAM_USERS(streamId), userId),
          'addViewer-sadd'
        );
        
        // Increment viewer count
        await safeRedisOperation(
          () => redisClient.incr(REDIS_KEYS.VIEWER_COUNT(streamId)),
          'addViewer-incr'
        );
        
        // Get updated count
        const count = await safeRedisOperation(
          () => redisClient.get(REDIS_KEYS.VIEWER_COUNT(streamId)),
          'addViewer-getCount',
          '0'
        );
        
        updatedCount = parseInt(count) || 0;
        
        // Update active streams hash
        await this._updateCachedStreamViewerCount(streamId, updatedCount);
      } else {
        // Update metadata in MongoDB
        const updatedMetadata = await StreamMetadata.findOneAndUpdate(
          { streamId },
          { 
            $inc: { viewerCount: 1 },
            $addToSet: { activeViewers: userId }
          },
          { upsert: true, new: true }
        );
        
        updatedCount = updatedMetadata?.viewerCount || 0;
      }
      
      // Create viewer record for analytics
      await StreamViewer.create({
        streamId,
        userId,
        joinedAt: new Date(),
        ...metadata
      });
      
      logger.info(`User ${userId} joined stream ${streamId}`);
      
      return updatedCount;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error(`Error adding viewer to stream: ${error.message}`);
      throw new ApiError(`Failed to add viewer: ${error.message}`, 500);
    }
  }

  /**
   * Remove viewer from stream
   * @param {string} streamId - Stream ID
   * @param {string} userId - User ID
   * @returns {Promise<number>} - Updated viewer count
   */
  async removeViewer(streamId, userId) {
    try {
      let updatedCount = 0;
      
      // Update Redis if enabled
      if (isRedisEnabled()) {
        // Check if user is in viewers set
        const isMember = await safeRedisOperation(
          () => redisClient.sIsMember(REDIS_KEYS.STREAM_USERS(streamId), userId),
          'removeViewer-sismember',
          0
        );
        
        // Only decrement if user was a member
        if (isMember) {
          // Remove user from set
          await safeRedisOperation(
            () => redisClient.sRem(REDIS_KEYS.STREAM_USERS(streamId), userId),
            'removeViewer-srem'
          );
          
          // Decrement count (with floor of 0)
          await safeRedisOperation(
            async () => {
              const current = await redisClient.get(REDIS_KEYS.VIEWER_COUNT(streamId)) || '0';
              const newCount = Math.max(0, parseInt(current) - 1);
              await redisClient.set(REDIS_KEYS.VIEWER_COUNT(streamId), newCount.toString());
              return newCount;
            },
            'removeViewer-decr'
          );
          
          // Get updated count
          const count = await safeRedisOperation(
            () => redisClient.get(REDIS_KEYS.VIEWER_COUNT(streamId)),
            'removeViewer-getCount',
            '0'
          );
          
          updatedCount = parseInt(count) || 0;
          
          // Update active streams hash
          await this._updateCachedStreamViewerCount(streamId, updatedCount);
        }
      } else {
        // Update in MongoDB
        const updatedMetadata = await StreamMetadata.findOneAndUpdate(
          { streamId },
          { 
            $inc: { viewerCount: -1 },
            $pull: { activeViewers: userId }
          },
          { new: true }
        );
        
        // Ensure count never goes below 0
        if (updatedMetadata && updatedMetadata.viewerCount < 0) {
          updatedMetadata.viewerCount = 0;
          await updatedMetadata.save();
        }
        
        updatedCount = updatedMetadata?.viewerCount || 0;
      }
      
      // Update viewer record for analytics
      await StreamViewer.updateOne(
        { streamId, userId, leftAt: null },
        { leftAt: new Date() }
      );
      
      logger.info(`User ${userId} left stream ${streamId}`);
      
      return updatedCount;
    } catch (error) {
      logger.error(`Error removing viewer from stream: ${error.message}`);
      return 0;
    }
  }

  /**
   * Find trending streams
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of trending streams
   */
  async findTrending(options = {}) {
    try {
      // If Redis is enabled, use the cached active streams sorted by viewer count
      if (isRedisEnabled()) {
        const { limit = 10, category } = options;
        
        // Get active streams from Redis
        const cachedStreams = await safeRedisOperation(
          () => redisClient.hGetAll(REDIS_KEYS.ACTIVE_STREAMS),
          'findTrending-hGetAll',
          {}
        );
        
        // Parse and filter streams by category if needed
        let streams = Object.values(cachedStreams)
          .map(stream => JSON.parse(stream))
          .filter(stream => !category || stream.category === category);
        
        // Sort by viewer count
        streams.sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0));
        
        // Limit results
        return streams.slice(0, limit);
      }
      
      // Fallback to MongoDB
      const query = { status: STREAM_STATUS.LIVE };
      
      if (options.category) {
        query.category = options.category;
      }
      
      // We need to join with metadata to get viewer counts
      const streams = await Stream.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'streammetadata',
            localField: 'id',
            foreignField: 'streamId',
            as: 'metadata'
          }
        },
        { $unwind: { path: '$metadata', preserveNullAndEmptyArrays: true } },
        { $sort: { 'metadata.viewerCount': -1 } },
        { $limit: options.limit || 10 }
      ]);
      
      return streams;
    } catch (error) {
      logger.error(`Error finding trending streams: ${error.message}`);
      return [];
    }
  }

  /**
   * Helper method to cache a stream in Redis
   * @param {Object} stream - Stream object
   * @private
   */
  async _cacheActiveStream(stream) {
    if (!isRedisEnabled()) return;
    
    try {
      const streamData = {
        id: stream.id,
        userId: stream.userId,
        title: stream.title,
        thumbnail: stream.thumbnail,
        category: stream.category,
        tags: stream.tags,
        startTime: stream.startTime,
        viewerCount: 0
      };
      
      await safeRedisOperation(
        () => redisClient.hSet(REDIS_KEYS.ACTIVE_STREAMS, stream.id, JSON.stringify(streamData)),
        'cacheActiveStream-hSet'
      );
      
      logger.debug(`Stream ${stream.id} cached in Redis`);
    } catch (error) {
      logger.error(`Error caching stream in Redis: ${error.message}`);
    }
  }

  /**
   * Helper method to update a cached stream in Redis
   * @param {Object} stream - Stream object
   * @private
   */
  async _updateCachedStream(stream) {
    if (!isRedisEnabled()) return;
    
    try {
      // Get existing cached data
      const cachedData = await safeRedisOperation(
        () => redisClient.hGet(REDIS_KEYS.ACTIVE_STREAMS, stream.id),
        'updateCachedStream-hGet'
      );
      
      if (cachedData) {
        const existing = JSON.parse(cachedData);
        const updatedData = {
          ...existing,
          title: stream.title,
          thumbnail: stream.thumbnail,
          category: stream.category,
          tags: stream.tags
        };
        
        await safeRedisOperation(
          () => redisClient.hSet(REDIS_KEYS.ACTIVE_STREAMS, stream.id, JSON.stringify(updatedData)),
          'updateCachedStream-hSet'
        );
        
        logger.debug(`Stream ${stream.id} updated in Redis cache`);
      }
    } catch (error) {
      logger.error(`Error updating cached stream in Redis: ${error.message}`);
    }
  }

  /**
   * Helper method to update viewer count in cached stream
   * @param {string} streamId - Stream ID
   * @param {number} viewerCount - New viewer count
   * @private
   */
  async _updateCachedStreamViewerCount(streamId, viewerCount) {
    if (!isRedisEnabled()) return;
    
    try {
      const cachedData = await safeRedisOperation(
        () => redisClient.hGet(REDIS_KEYS.ACTIVE_STREAMS, streamId),
        'updateCachedStreamViewerCount-hGet'
      );
      
      if (cachedData) {
        const existing = JSON.parse(cachedData);
        existing.viewerCount = viewerCount;
        
        await safeRedisOperation(
          () => redisClient.hSet(REDIS_KEYS.ACTIVE_STREAMS, streamId, JSON.stringify(existing)),
          'updateCachedStreamViewerCount-hSet'
        );
      }
    } catch (error) {
      logger.error(`Error updating cached stream viewer count: ${error.message}`);
    }
  }
}

module.exports = MongoStreamRepository; 