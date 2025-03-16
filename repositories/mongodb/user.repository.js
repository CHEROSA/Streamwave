/**
 * MongoDB implementation of User Repository
 * 
 * Implements all user-related repository methods using MongoDB as the data store.
 */
const BaseRepository = require('../base.repository');
const User = require('../../models/user.model');
const { Stream } = require('../../models/stream.model');
const bcrypt = require('bcrypt');
const logger = require('../../utils/logger');
const cacheService = require('../../services/cache.service');

/**
 * User Repository MongoDB Implementation
 * @extends BaseRepository
 */
class UserRepositoryMongo extends BaseRepository {
  constructor() {
    super(User);
  }

  /**
   * Find a user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} - User or null if not found
   */
  async findByEmail(email) {
    try {
      if (!email) return null;
      
      // Normalize email to lowercase
      const normalizedEmail = email.toLowerCase();
      
      // Check cache first
      const cacheKey = `user:email:${normalizedEmail}`;
      const cachedUser = await cacheService.get(cacheKey);
      
      if (cachedUser) {
        return JSON.parse(cachedUser);
      }
      
      // Get from database
      const user = await User.findOne({ email: normalizedEmail }).lean();
      
      if (user) {
        // Cache for 10 minutes
        await cacheService.set(cacheKey, JSON.stringify(user), { ttl: 600 });
      }
      
      return user;
    } catch (error) {
      logger.error(`Error finding user by email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find a user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} - User or null if not found
   */
  async findByUsername(username) {
    try {
      if (!username) return null;
      
      // Check cache first
      const cacheKey = `user:username:${username}`;
      const cachedUser = await cacheService.get(cacheKey);
      
      if (cachedUser) {
        return JSON.parse(cachedUser);
      }
      
      // Get from database
      const user = await User.findOne({ username }).lean();
      
      if (user) {
        // Cache for 10 minutes
        await cacheService.set(cacheKey, JSON.stringify(user), { ttl: 600 });
      }
      
      return user;
    } catch (error) {
      logger.error(`Error finding user by username: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify user credentials
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object|null>} - User if credentials are valid, null otherwise
   */
  async verifyCredentials(email, password) {
    try {
      if (!email || !password) {
        logger.warn('Missing email or password for credential verification');
        return null;
      }
      
      // Normalize email to lowercase
      const normalizedEmail = email.toLowerCase();
      logger.debug(`Verifying credentials for email: ${normalizedEmail}`);
      
      // Find user by email - do not use lean() here as we need the full model
      const user = await User.findOne({ email: normalizedEmail });
      
      if (!user) {
        logger.warn(`User not found for email: ${normalizedEmail}`);
        return null;
      }
      
      logger.debug(`User found during credentials check: ${user.username} (${user._id})`);
      
      // Use bcrypt to verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        logger.warn(`Invalid password for user: ${user.username} (${user._id})`);
        return null;
      }
      
      logger.info(`User authenticated successfully: ${user.username} (${user._id})`);
      
      // Return user without password
      const userObject = user.toObject();
      delete userObject.password;
      
      // Ensure the ID is available in both MongoDB formats (_id and id)
      userObject.id = userObject._id.toString();
      
      return userObject;
    } catch (error) {
      logger.error(`Error verifying credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} profileData - Profile data to update
   * @returns {Promise<Object|null>} - Updated user or null if not found
   */
  async updateProfile(userId, profileData) {
    try {
      // Fields that can be updated
      const allowedFields = [
        'displayName',
        'bio',
        'profileImage',
        'socialLinks',
        'preferences',
        'status'
      ];
      
      // Filter out disallowed fields
      const filteredData = {};
      for (const field of allowedFields) {
        if (profileData[field] !== undefined) {
          filteredData[field] = profileData[field];
        }
      }
      
      // Update the user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: filteredData },
        { new: true }
      ).lean();
      
      if (updatedUser) {
        // Invalidate cache
        await cacheService.del(`user:id:${userId}`);
        if (updatedUser.email) {
          await cacheService.del(`user:email:${updatedUser.email.toLowerCase()}`);
        }
        if (updatedUser.username) {
          await cacheService.del(`user:username:${updatedUser.username}`);
        }
      }
      
      return updatedUser;
    } catch (error) {
      logger.error(`Error updating user profile: ${error.message}`);
      throw error;
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} newPassword - New password (not hashed)
   * @returns {Promise<boolean>} - True if password was changed, false otherwise
   */
  async changePassword(userId, newPassword) {
    try {
      if (!userId || !newPassword) {
        return false;
      }
      
      // Find the user
      const user = await User.findById(userId);
      
      if (!user) {
        return false;
      }
      
      // Hash the new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      
      // Update the password
      user.password = hashedPassword;
      
      // Save the user
      await user.save();
      
      // Invalidate cache
      await cacheService.del(`user:id:${userId}`);
      
      return true;
    } catch (error) {
      logger.error(`Error changing user password: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user's streams
   * @param {string} userId - User ID
   * @param {Object} options - Filter options (status, pagination, etc.)
   * @returns {Promise<Array>} - Array of streams
   */
  async getUserStreams(userId, options = {}) {
    try {
      // Build query
      const query = { userId };
      
      // Add status filter if provided
      if (options.status) {
        query.status = options.status;
      }
      
      // Set pagination options
      const limit = options.limit || 20;
      const skip = options.skip || 0;
      const sort = options.sort || { createdAt: -1 };
      
      // Get streams from database
      const streams = await Stream.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();
      
      return streams;
    } catch (error) {
      logger.error(`Error getting user streams: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find users by IDs
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Array>} - Array of users
   */
  async findByIds(userIds) {
    try {
      if (!userIds || !userIds.length) {
        return [];
      }
      
      // Get users from database
      const users = await User.find({ _id: { $in: userIds } })
        .select('_id username displayName profileImage')
        .lean();
      
      return users;
    } catch (error) {
      logger.error(`Error finding users by IDs: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Search users by username or display name
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Array of matching users
   */
  async searchUsers(query, options = {}) {
    try {
      if (!query) {
        return [];
      }
      
      // Set pagination options
      const limit = options.limit || 20;
      const skip = options.skip || 0;
      
      // Create search regex (case insensitive)
      const searchRegex = new RegExp(query, 'i');
      
      // Search for users
      const users = await User.find({
        $or: [
          { username: searchRegex },
          { displayName: searchRegex }
        ],
        status: 'active' // Only return active users
      })
        .select('_id username displayName profileImage bio')
        .skip(skip)
        .limit(limit)
        .lean();
      
      return users;
    } catch (error) {
      logger.error(`Error searching users: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new UserRepositoryMongo();