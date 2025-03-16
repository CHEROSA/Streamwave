/**
 * Chat Repository
 * 
 * Repository for chat-related operations. Extends the base repository
 * with chat-specific functionality.
 */
const BaseRepository = require('./base.repository');
const db = require('../config/database');
const { redisClient, safeRedisOperation, isRedisEnabled } = require('../config/redis.config');
const { REDIS_KEYS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Chat Repository
 * @extends BaseRepository
 */
class ChatRepository extends BaseRepository {
  /**
   * Create a new Chat repository
   */
  constructor() {
    super('ChatMessage');
    
    this.roomModel = db.models.Chat;
  }

  /**
   * Find all messages for a stream
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of messages
   */
  async findAll(options) {
    return super.findAll(options);
  }

  /**
   * Create a new message
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Created message
   */
  async create(data) {
    return super.create(data);
  }

  /**
   * Delete a message
   * @param {string|number} id - Message ID
   * @returns {Promise<number>} Number of deleted rows
   */
  async delete(id) {
    return super.delete(id);
  }

  /**
   * Create a chat room
   * @param {Object} roomData - Room data
   * @returns {Promise<Object|null>} - Created room or null
   */
  async createRoom(roomData) {
    try {
      // Ensure roomId is set
      if (!roomData.roomId) {
        roomData.roomId = `room_${Date.now()}`;
      }
      
      const room = new this.roomModel(roomData);
      await room.save();
      
      // Cache room data if Redis is enabled
      if (isRedisEnabled()) {
        await this._cacheRoomData(room);
      }
      
      return room;
    } catch (error) {
      logger.error(`Error creating chat room: ${error.message}`);
      return null;
    }
  }

  /**
   * Get chat room by ID
   * @param {string} roomId - Room ID
   * @returns {Promise<Object|null>} - Chat room or null
   */
  async getRoom(roomId) {
    try {
      if (!roomId) return null;
      
      // Try to get from Redis if enabled
      if (isRedisEnabled()) {
        try {
          const roomData = await safeRedisOperation(async (client) => {
            return client.hgetall(`${REDIS_KEYS.CHAT_ROOM}:${roomId}`);
          });
          
          if (roomData && Object.keys(roomData).length > 0) {
            // Convert stringified objects back to objects
            if (roomData.settings) {
              roomData.settings = JSON.parse(roomData.settings);
            }
            
            if (roomData.metadata) {
              roomData.metadata = JSON.parse(roomData.metadata);
            }
            
            return roomData;
          }
        } catch (error) {
          logger.error(`Error getting room from Redis: ${error.message}`);
        }
      }
      
      // Fallback to database
      const room = await this.roomModel.findOne({ roomId }).lean();
      
      // Cache for future requests if Redis is enabled
      if (room && isRedisEnabled()) {
        await this._cacheRoomData(room);
      }
      
      return room;
    } catch (error) {
      logger.error(`Error getting chat room: ${error.message}`);
      return null;
    }
  }

  /**
   * Update chat room
   * @param {string} roomId - Room ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} - Updated room or null
   */
  async updateRoom(roomId, updateData) {
    try {
      const room = await this.roomModel.findOneAndUpdate(
        { roomId },
        updateData,
        { new: true }
      );
      
      // Update cache if Redis is enabled
      if (room && isRedisEnabled()) {
        await this._cacheRoomData(room);
      }
      
      return room;
    } catch (error) {
      logger.error(`Error updating chat room: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete chat room
   * @param {string} roomId - Room ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteRoom(roomId) {
    try {
      const result = await this.roomModel.deleteOne({ roomId });
      
      // Remove from Redis if enabled
      if (isRedisEnabled()) {
        await safeRedisOperation(async (client) => {
          await client.del(`${REDIS_KEYS.CHAT_ROOM}:${roomId}`);
        });
      }
      
      return result.deletedCount > 0;
    } catch (error) {
      logger.error(`Error deleting chat room: ${error.message}`);
      return false;
    }
  }

  /**
   * Add message to chat room
   * @param {Object} messageData - Message data
   * @returns {Promise<Object|null>} - Created message or null
   */
  async addMessage(messageData) {
    try {
      // Make sure required fields are present
      if (!messageData.roomId || !messageData.userId || !messageData.content) {
        throw new Error('Missing required fields for chat message');
      }
      
      // Create the message
      const message = await this.create({
        ...messageData,
        createdAt: new Date()
      });
      
      // Add to recent messages cache if Redis is enabled
      if (message && isRedisEnabled()) {
        await this._cacheRecentMessage(message);
      }
      
      return message;
    } catch (error) {
      logger.error(`Error adding chat message: ${error.message}`);
      return null;
    }
  }

  /**
   * Get recent messages for a room
   * @param {string} roomId - Room ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of messages
   */
  async getRecentMessages(roomId, options = {}) {
    try {
      const limit = options.limit || 50;
      
      // Try to get from Redis if enabled
      if (isRedisEnabled()) {
        try {
          const messages = await safeRedisOperation(async (client) => {
            // Get the most recent messages (latest first)
            const messageIds = await client.zrevrange(
              `${REDIS_KEYS.CHAT_RECENT}:${roomId}`,
              0,
              limit - 1
            );
            
            if (!messageIds || messageIds.length === 0) {
              return [];
            }
            
            // Get each message in parallel
            const messagePromises = messageIds.map(id => 
              client.hgetall(`${REDIS_KEYS.CHAT_MESSAGE}:${id}`)
            );
            
            return Promise.all(messagePromises);
          });
          
          if (messages && messages.length > 0) {
            // Parse JSON fields and convert timestamps
            return messages.map(msg => {
              if (msg.metadata) {
                msg.metadata = JSON.parse(msg.metadata);
              }
              
              if (msg.createdAt) {
                msg.createdAt = new Date(Number(msg.createdAt));
              }
              
              return msg;
            });
          }
        } catch (error) {
          logger.error(`Error getting recent messages from Redis: ${error.message}`);
        }
      }
      
      // Fallback to database
      const query = { roomId };
      
      return this.find(query, {
        sort: { createdAt: -1 },
        limit,
        populate: options.populate || 'userId'
      });
    } catch (error) {
      logger.error(`Error getting recent messages: ${error.message}`);
      return [];
    }
  }

  /**
   * Get messages by timestamp range
   * @param {string} roomId - Room ID
   * @param {Date} startTime - Start timestamp
   * @param {Date} endTime - End timestamp
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of messages
   */
  async getMessagesByTimeRange(roomId, startTime, endTime, options = {}) {
    try {
      const query = {
        roomId,
        createdAt: {
          $gte: startTime,
          $lte: endTime
        }
      };
      
      return this.find(query, {
        sort: { createdAt: 1 },
        limit: options.limit,
        skip: options.skip,
        populate: options.populate || 'userId'
      });
    } catch (error) {
      logger.error(`Error getting messages by time range: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete message
   * @param {string} messageId - Message ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteMessage(messageId) {
    try {
      const message = await this.findById(messageId);
      
      if (!message) {
        return false;
      }
      
      const result = await this.deleteById(messageId);
      
      // Remove from Redis if enabled
      if (isRedisEnabled()) {
        await safeRedisOperation(async (client) => {
          await client.del(`${REDIS_KEYS.CHAT_MESSAGE}:${messageId}`);
          
          // Also remove from recent messages sorted set
          await client.zrem(
            `${REDIS_KEYS.CHAT_RECENT}:${message.roomId}`,
            messageId
          );
        });
      }
      
      return result;
    } catch (error) {
      logger.error(`Error deleting chat message: ${error.message}`);
      return false;
    }
  }

  /**
   * Count messages in a room
   * @param {string} roomId - Room ID
   * @param {Object} options - Query options
   * @returns {Promise<number>} - Message count
   */
  async countMessages(roomId, options = {}) {
    try {
      const query = { roomId };
      
      // Add time range if specified
      if (options.startTime || options.endTime) {
        query.createdAt = {};
        
        if (options.startTime) {
          query.createdAt.$gte = options.startTime;
        }
        
        if (options.endTime) {
          query.createdAt.$lte = options.endTime;
        }
      }
      
      // Add user filter if specified
      if (options.userId) {
        query.userId = options.userId;
      }
      
      return this.model.countDocuments(query);
    } catch (error) {
      logger.error(`Error counting chat messages: ${error.message}`);
      return 0;
    }
  }

  /**
   * Search messages in a room
   * @param {string} roomId - Room ID
   * @param {string} searchText - Text to search for
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of matching messages
   */
  async searchMessages(roomId, searchText, options = {}) {
    try {
      const query = {
        roomId,
        content: { $regex: searchText, $options: 'i' }
      };
      
      return this.find(query, {
        sort: { createdAt: -1 },
        limit: options.limit || 50,
        skip: options.skip || 0,
        populate: options.populate || 'userId'
      });
    } catch (error) {
      logger.error(`Error searching chat messages: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user messages
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of user messages
   */
  async getUserMessages(userId, options = {}) {
    try {
      const query = { userId };
      
      // Add room filter if specified
      if (options.roomId) {
        query.roomId = options.roomId;
      }
      
      return this.find(query, {
        sort: { createdAt: -1 },
        limit: options.limit || 50,
        skip: options.skip || 0
      });
    } catch (error) {
      logger.error(`Error getting user messages: ${error.message}`);
      return [];
    }
  }

  /**
   * Cache room data in Redis
   * @param {Object} room - Room data
   * @returns {Promise<void>}
   * @private
   */
  async _cacheRoomData(room) {
    if (!isRedisEnabled() || !room) return;
    
    try {
      await safeRedisOperation(async (client) => {
        const roomData = {
          roomId: room.roomId,
          name: room.name || '',
          type: room.type || 'public',
          ownerId: room.ownerId ? room.ownerId.toString() : '',
          createdAt: room.createdAt ? room.createdAt.getTime().toString() : Date.now().toString()
        };
        
        // Stringify objects for Redis storage
        if (room.settings) {
          roomData.settings = JSON.stringify(room.settings);
        }
        
        if (room.metadata) {
          roomData.metadata = JSON.stringify(room.metadata);
        }
        
        // Store in Redis hash
        await client.hset(`${REDIS_KEYS.CHAT_ROOM}:${room.roomId}`, roomData);
        
        // Set expiration (24 hours)
        await client.expire(`${REDIS_KEYS.CHAT_ROOM}:${room.roomId}`, 86400);
      });
    } catch (error) {
      logger.error(`Error caching room data in Redis: ${error.message}`);
    }
  }

  /**
   * Cache a recent message in Redis
   * @param {Object} message - Message data
   * @returns {Promise<void>}
   * @private
   */
  async _cacheRecentMessage(message) {
    if (!isRedisEnabled() || !message) return;
    
    try {
      await safeRedisOperation(async (client) => {
        const messageData = {
          _id: message._id.toString(),
          roomId: message.roomId,
          userId: message.userId.toString(),
          content: message.content,
          type: message.type || 'text',
          createdAt: message.createdAt.getTime().toString()
        };
        
        // Add metadata if present
        if (message.metadata) {
          messageData.metadata = JSON.stringify(message.metadata);
        }
        
        // Store message in Redis hash
        await client.hset(`${REDIS_KEYS.CHAT_MESSAGE}:${message._id}`, messageData);
        
        // Add to recent messages sorted set with timestamp score
        await client.zadd(
          `${REDIS_KEYS.CHAT_RECENT}:${message.roomId}`,
          message.createdAt.getTime(),
          message._id.toString()
        );
        
        // Set expiration for message (24 hours)
        await client.expire(`${REDIS_KEYS.CHAT_MESSAGE}:${message._id}`, 86400);
        
        // Set expiration for recent messages list (24 hours)
        await client.expire(`${REDIS_KEYS.CHAT_RECENT}:${message.roomId}`, 86400);
      });
    } catch (error) {
      logger.error(`Error caching message in Redis: ${error.message}`);
    }
  }
}

module.exports = new ChatRepository(); 