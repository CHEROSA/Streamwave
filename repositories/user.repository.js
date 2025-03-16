/**
 * User Repository
 * 
 * Handles all database operations related to users.
 * Extends the base repository for common CRUD operations.
 */
const BaseRepository = require('./base.repository');
const userModel = require('../models/user.model');
const db = require('../config/database');
const logger = require('../utils/logger');

class UserRepository extends BaseRepository {
  /**
   * Create a new UserRepository instance
   */
  constructor() {
    super('User', {
      entityName: 'user',
      enableCache: true,
      cacheTTL: 3600, // 1 hour
      primaryKey: 'id'
    });
  }

  /**
   * Find a user by username
   * @param {string} username - Username to search for
   * @param {Object} options - Query options
   * @returns {Promise<Object>} User data or null
   */
  async findByUsername(username, options = {}) {
    return this.findOne({ username: username.toLowerCase() }, options);
  }

  /**
   * Find a user by email
   * @param {string} email - Email to search for
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} User or null if not found
   */
  async findByEmail(email, options = {}) {
    return this.findOne({ email }, options);
  }

  /**
   * Find a user by reset password token
   * @param {string} token - Reset password token
   * @param {Object} options - Query options
   * @returns {Promise<Object>} User data or null
   */
  async findByResetToken(token, options = {}) {
    return this.findOne({ 
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    }, options);
  }

  /**
   * Find a user by verification token
   * @param {string} token - Verification token
   * @param {Object} options - Query options
   * @returns {Promise<Object>} User data or null
   */
  async findByVerificationToken(token, options = {}) {
    return this.findOne({ 
      verificationToken: token,
      verificationExpires: { $gt: new Date() }
    }, options);
  }

  /**
   * Update user's last login time
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Update result
   */
  async updateLastLogin(userId) {
    return this.update(userId, { lastLogin: new Date() });
  }

  /**
   * Update user's last active time
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Update result
   */
  async updateLastActive(userId) {
    return this.update(userId, { lastActive: new Date() });
  }

  /**
   * Find all user social links
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Social links
   */
  async findSocialLinks(userId) {
    const sql = `SELECT * FROM ${userModel.SOCIAL_LINKS_TABLE} WHERE userId = ?`;
    return db.query(sql, [userId]);
  }

  /**
   * Add or update social link
   * @param {number} userId - User ID
   * @param {string} platform - Social platform
   * @param {string} url - Social profile URL
   * @returns {Promise<Object>} Result
   */
  async upsertSocialLink(userId, platform, url) {
    const sql = `
      INSERT INTO ${userModel.SOCIAL_LINKS_TABLE} (userId, platform, url)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE url = ?
    `;
    return db.query(sql, [userId, platform, url, url]);
  }

  /**
   * Remove social link
   * @param {number} userId - User ID
   * @param {string} platform - Social platform
   * @returns {Promise<boolean>} True if removed
   */
  async removeSocialLink(userId, platform) {
    const sql = `DELETE FROM ${userModel.SOCIAL_LINKS_TABLE} WHERE userId = ? AND platform = ?`;
    const result = await db.query(sql, [userId, platform]);
    return result.affectedRows > 0;
  }

  /**
   * Get user settings
   * @param {number} userId - User ID
   * @returns {Promise<Object>} User settings
   */
  async getSettings(userId) {
    const sql = `SELECT * FROM ${userModel.SETTINGS_TABLE} WHERE userId = ?`;
    const results = await db.query(sql, [userId]);
    return results[0] || null;
  }

  /**
   * Update user settings
   * @param {number} userId - User ID
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Result
   */
  async updateSettings(userId, settings) {
    // Check if settings exist
    const existingSettings = await this.getSettings(userId);
    
    if (existingSettings) {
      // Update existing settings
      const columns = Object.keys(settings);
      const setClause = columns.map(col => `${col} = ?`).join(', ');
      const values = [...Object.values(settings), userId];
      
      const sql = `UPDATE ${userModel.SETTINGS_TABLE} SET ${setClause} WHERE userId = ?`;
      return db.query(sql, values);
    } else {
      // Create new settings
      const columns = ['userId', ...Object.keys(settings)];
      const placeholders = columns.map(() => '?').join(', ');
      const values = [userId, ...Object.values(settings)];
      
      const sql = `INSERT INTO ${userModel.SETTINGS_TABLE} (${columns.join(', ')}) VALUES (${placeholders})`;
      return db.query(sql, values);
    }
  }

  /**
   * Add follower to a user
   * @param {number} userId - User being followed
   * @param {number} followerId - User who is following
   * @returns {Promise<Object>} Result
   */
  async addFollower(userId, followerId) {
    try {
      const sql = `
        INSERT INTO ${userModel.FOLLOWERS_TABLE} (userId, followerId)
        VALUES (?, ?)
      `;
      return await db.query(sql, [userId, followerId]);
    } catch (error) {
      // Ignore duplicate key errors
      if (error.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
      return { affectedRows: 0 };
    }
  }

  /**
   * Remove follower from a user
   * @param {number} userId - User being unfollowed
   * @param {number} followerId - User who is unfollowing
   * @returns {Promise<boolean>} True if removed
   */
  async removeFollower(userId, followerId) {
    const sql = `DELETE FROM ${userModel.FOLLOWERS_TABLE} WHERE userId = ? AND followerId = ?`;
    const result = await db.query(sql, [userId, followerId]);
    return result.affectedRows > 0;
  }

  /**
   * Get followers of a user
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Followers
   */
  async getFollowers(userId, options = {}) {
    const limit = options.limit ? `LIMIT ${options.limit}` : '';
    const offset = options.offset ? `OFFSET ${options.offset}` : '';
    
    const sql = `
      SELECT u.* 
      FROM ${userModel.FOLLOWERS_TABLE} f
      JOIN ${userModel.TABLE_NAME} u ON f.followerId = u.id
      WHERE f.userId = ?
      ORDER BY f.createdAt DESC
      ${limit}
      ${offset}
    `;
    
    return db.query(sql, [userId]);
  }

  /**
   * Get users followed by a user
   * @param {number} followerId - Follower's user ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Followed users
   */
  async getFollowing(followerId, options = {}) {
    const limit = options.limit ? `LIMIT ${options.limit}` : '';
    const offset = options.offset ? `OFFSET ${options.offset}` : '';
    
    const sql = `
      SELECT u.* 
      FROM ${userModel.FOLLOWERS_TABLE} f
      JOIN ${userModel.TABLE_NAME} u ON f.userId = u.id
      WHERE f.followerId = ?
      ORDER BY f.createdAt DESC
      ${limit}
      ${offset}
    `;
    
    return db.query(sql, [followerId]);
  }

  /**
   * Check if user is following another user
   * @param {number} userId - User ID
   * @param {number} followerId - Follower's user ID
   * @returns {Promise<boolean>} True if following
   */
  async isFollowing(userId, followerId) {
    const sql = `SELECT 1 FROM ${userModel.FOLLOWERS_TABLE} WHERE userId = ? AND followerId = ?`;
    const results = await db.query(sql, [userId, followerId]);
    return results.length > 0;
  }

  /**
   * Count followers of a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Follower count
   */
  async countFollowers(userId) {
    const sql = `SELECT COUNT(*) as count FROM ${userModel.FOLLOWERS_TABLE} WHERE userId = ?`;
    const results = await db.query(sql, [userId]);
    return results[0]?.count || 0;
  }

  /**
   * Count users followed by a user
   * @param {number} followerId - Follower's user ID
   * @returns {Promise<number>} Following count
   */
  async countFollowing(followerId) {
    const sql = `SELECT COUNT(*) as count FROM ${userModel.FOLLOWERS_TABLE} WHERE followerId = ?`;
    const results = await db.query(sql, [followerId]);
    return results[0]?.count || 0;
  }

  /**
   * Verify user credentials for authentication
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object|null>} User if credentials are valid, null otherwise
   */
  async verifyCredentials(email, password) {
    try {
      // Get user with password included
      const sql = `
        SELECT * FROM ${this.tableName} 
        WHERE email = ? AND isActive = true
      `;
      
      const results = await db.query(sql, [email.toLowerCase()]);
      
      if (!results || results.length === 0) {
        logger.debug(`Authentication failed: No user found with email ${email}`);
        return null;
      }
      
      const user = results[0];
      
      // Log for debugging
      logger.debug(`User found with email ${email}, attempting password verification`);
      
      // Use bcrypt for password verification
      let isValid = false;
      try {
        const bcrypt = require('bcrypt');
        isValid = await bcrypt.compare(password, user.password);
        logger.debug(`bcrypt password comparison result: ${isValid}`);
      } catch (bcryptError) {
        logger.error(`Error comparing password: ${bcryptError.message}`);
        throw new Error(`Password verification failed: ${bcryptError.message}`);
      }
      
      if (!isValid) {
        logger.debug(`Authentication failed: Invalid password for user ${email}`);
        return null;
      }
      
      // Update last login time
      await this.updateLastLogin(user.id);
      
      // Return user without password
      delete user.password;
      
      logger.debug(`Authentication successful for user: ${user.username} (${user.id})`);
      return user;
    } catch (error) {
      logger.error(`Error verifying credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find a user by stream key
   * @param {string} streamKey - Stream key
   * @returns {Promise<Object>} User object
   */
  async findByStreamKey(streamKey) {
    return this.findOne({ streamKey });
  }
}

// Create and export a singleton instance
const userRepository = new UserRepository();
module.exports = userRepository; 