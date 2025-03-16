/**
 * MongoDB implementation of Chat Repository
 * 
 * Implements all chat-related repository methods using MongoDB as the data store.
 */
const BaseRepository = require('../base.repository');
const { Chat } = require('../../models/chat.model');
const logger = require('../../utils/logger');
const cacheService = require('../../services/cache.service');
const perspectiveService = require('../../services/perspective');

/**
 * Chat Repository MongoDB Implementation
 * @extends BaseRepository
 */
class ChatRepositoryMongo extends BaseRepository {
  constructor() {
    super(Chat);
  }

  /**
   * Save a chat message
   * @param {Object} message - Message data
   * @returns {Promise<Object>} - Saved message
   */
  async saveMessage(message) {
    try {
      // Create the chat message
      const chatMessage = new Chat({
        streamId: message.streamId,
        userId: message.userId,
        username: message.username,
        message: message.message,
        type: message.type || 'text',
        metadata: message.metadata || {}
      });

      // Save to database
      await chatMessage.save();

      // If we have caching enabled, add to recent messages cache
      const cacheKey = `stream:${message.streamId}:messages`;
      await cacheService.lPush(cacheKey, JSON.stringify(chatMessage), { ttl: 3600 });
      await cacheService.lTrim(cacheKey, 0, 99); // Keep last 100 messages

      return chatMessage.toObject();
    } catch (error) {
      logger.error(`Error saving chat message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get messages for a stream
   * @param {string} streamId - Stream ID
   * @param {Object} options - Options (pagination, limit, etc.)
   * @returns {Promise<Array>} - Array of messages
   */
  async getStreamMessages(streamId, options = {}) {
    try {
      const limit = options.limit || 50;
      const skip = options.skip || 0;
      const sort = options.sort || { createdAt: -1 };

      // Build query
      const query = { streamId };

      // Add filter for message type if specified
      if (options.type) {
        query.type = options.type;
      }

      // Add filter for user ID if specified
      if (options.userId) {
        query.userId = options.userId;
      }

      // Add filter to exclude deleted messages unless specified
      if (options.includeDeleted !== true) {
        query.isDeleted = { $ne: true };
      }

      // Get messages from database
      const messages = await Chat.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      return messages;
    } catch (error) {
      logger.error(`Error getting stream messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a message
   * @param {string} messageId - Message ID
   * @param {Object} options - Options (soft delete, reason, etc.)
   * @returns {Promise<boolean>} - True if message was deleted
   */
  async deleteMessage(messageId, options = {}) {
    try {
      const softDelete = options.softDelete !== false;
      const reason = options.reason || 'mod_action';
      const deletedBy = options.deletedBy || 'system';

      if (softDelete) {
        // Soft delete - mark as deleted but keep in database
        const result = await Chat.findByIdAndUpdate(messageId, {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy,
          deletionReason: reason
        });

        return !!result;
      } else {
        // Hard delete - remove from database
        const result = await Chat.findByIdAndDelete(messageId);
        return !!result;
      }
    } catch (error) {
      logger.error(`Error deleting message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get latest messages for a stream
   * @param {string} streamId - Stream ID
   * @param {number} limit - Maximum number of messages to return
   * @returns {Promise<Array>} - Array of messages
   */
  async getLatestMessages(streamId, limit = 50) {
    try {
      // Check cache first
      const cacheKey = `stream:${streamId}:messages`;
      const cachedMessages = await cacheService.lRange(cacheKey, 0, limit - 1);

      if (cachedMessages && cachedMessages.length > 0) {
        return cachedMessages.map(msg => JSON.parse(msg));
      }

      // If not in cache, get from database
      const messages = await Chat.find({
        streamId,
        isDeleted: { $ne: true }
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      // Update cache with these messages
      if (messages.length > 0) {
        await cacheService.del(cacheKey);
        for (const msg of messages.reverse()) {
          await cacheService.lPush(cacheKey, JSON.stringify(msg));
        }
        await cacheService.expire(cacheKey, 3600); // 1 hour TTL
      }

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      logger.error(`Error getting latest messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save moderation action
   * @param {string} messageId - Message ID
   * @param {string} action - Action type (delete, flag, etc.)
   * @param {string} moderatorId - Moderator user ID
   * @param {string} reason - Reason for moderation
   * @returns {Promise<Object>} - Moderation record
   */
  async saveModerationAction(messageId, action, moderatorId, reason) {
    try {
      // Find the message
      const message = await Chat.findById(messageId);
      
      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      // Create moderation action
      const moderationAction = {
        action,
        moderatorId,
        reason,
        timestamp: new Date()
      };

      // Update the message with moderation info
      message.moderation = message.moderation || [];
      message.moderation.push(moderationAction);

      // If action is delete, also mark as deleted
      if (action === 'delete') {
        message.isDeleted = true;
        message.deletedAt = new Date();
        message.deletedBy = moderatorId;
        message.deletionReason = reason;
      }

      // Save the updated message
      await message.save();

      return moderationAction;
    } catch (error) {
      logger.error(`Error saving moderation action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a message contains toxic content
   * @param {string} content - Message content to check
   * @param {Object} options - Toxicity check options
   * @returns {Promise<Object>} - Toxicity analysis result
   */
  async checkMessageToxicity(content, options = {}) {
    try {
      // If Perspective API is not available, return safe default
      if (!perspectiveService.isAvailable()) {
        return {
          isToxic: false,
          scores: {},
          performedCheck: false
        };
      }

      // Otherwise, use Perspective API service
      const result = await perspectiveService.analyzeText(content, {
        languages: options.languages || ['en'],
        threshold: options.threshold || 0.85,
        attributes: options.attributes || ['TOXICITY', 'SEVERE_TOXICITY', 'IDENTITY_ATTACK', 'PROFANITY']
      });

      return {
        isToxic: result.isToxic,
        scores: result.scores,
        performedCheck: true
      };
    } catch (error) {
      logger.error(`Error checking message toxicity: ${error.message}`);
      return {
        isToxic: false,
        scores: {},
        performedCheck: false,
        error: error.message
      };
    }
  }

  /**
   * Get moderation history for a stream
   * @param {string} streamId - Stream ID
   * @param {Object} options - Options (pagination, etc.)
   * @returns {Promise<Array>} - Array of moderation actions
   */
  async getModerationHistory(streamId, options = {}) {
    try {
      const limit = options.limit || 50;
      const skip = options.skip || 0;

      // Get all messages that have moderation actions
      const messages = await Chat.find({
        streamId,
        moderation: { $exists: true, $ne: [] }
      })
        .select('_id userId username message createdAt moderation')
        .sort({ 'moderation.timestamp': -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Flatten the results to get all moderation actions
      const moderationActions = [];
      
      for (const message of messages) {
        for (const action of message.moderation || []) {
          moderationActions.push({
            messageId: message._id,
            userId: message.userId,
            username: message.username,
            message: message.message,
            createdAt: message.createdAt,
            action: action.action,
            moderatorId: action.moderatorId,
            reason: action.reason,
            timestamp: action.timestamp
          });
        }
      }

      // Sort all actions by timestamp (newest first)
      moderationActions.sort((a, b) => b.timestamp - a.timestamp);

      return moderationActions;
    } catch (error) {
      logger.error(`Error getting moderation history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get active user count in a chat room
   * @param {string} streamId - Stream ID
   * @returns {Promise<number>} - Count of active users
   */
  async getActiveChatUserCount(streamId) {
    try {
      // Get from cache first, as this is real-time data
      const cacheKey = `stream:${streamId}:active_chat_users`;
      const cachedCount = await cacheService.get(cacheKey);
      
      if (cachedCount !== null) {
        return parseInt(cachedCount);
      }

      // If not in cache, estimate from recent messages (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const uniqueUsers = await Chat.distinct('userId', {
        streamId,
        createdAt: { $gte: fiveMinutesAgo }
      });

      const count = uniqueUsers.length;
      
      // Cache the result
      await cacheService.set(cacheKey, count.toString(), { ttl: 60 }); // Cache for 1 minute
      
      return count;
    } catch (error) {
      logger.error(`Error getting active chat user count: ${error.message}`);
      return 0;
    }
  }
}

module.exports = new ChatRepositoryMongo();