/**
 * Token Repository
 * 
 * Repository for token-related operations. Extends the base repository
 * with token-specific functionality.
 */
const BaseRepository = require('./base.repository');
const Token = require('../models/token.model');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Token Repository
 * @extends BaseRepository
 */
class TokenRepository extends BaseRepository {
  /**
   * Create a new Token repository
   */
  constructor() {
    super(Token, { 
      entityName: 'token',
      cacheTTL: 600, // 10 minutes
      enableCache: false // Tokens shouldn't be cached
    });
  }

  /**
   * Store a blacklisted token
   * @param {string} token - JWT token to blacklist
   * @param {number} expirySeconds - Token expiry time in seconds
   * @returns {Promise<boolean>} Success flag
   */
  async blacklistToken(token, expirySeconds = 3600) {
    try {
      const tokenId = this.hashToken(token);
      const expiresAt = new Date(Date.now() + (expirySeconds * 1000));
      
      await this.create({
        tokenId,
        type: 'blacklisted',
        expiresAt
      });
      
      logger.debug(`Token blacklisted in MongoDB: ${tokenId.substring(0, 10)}...`);
      return true;
    } catch (error) {
      logger.error(`Error blacklisting token in MongoDB: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a token is blacklisted
   * @param {string} token - JWT token to check
   * @returns {Promise<boolean>} True if blacklisted
   */
  async isTokenBlacklisted(token) {
    try {
      const tokenId = this.hashToken(token);
      const blacklistedToken = await this.findOne({
        tokenId,
        type: 'blacklisted',
        expiresAt: { $gt: new Date() }
      });
      
      return !!blacklistedToken;
    } catch (error) {
      logger.error(`Error checking blacklisted token in MongoDB: ${error.message}`);
      return false;
    }
  }

  /**
   * Store a refresh token
   * @param {string} userId - User ID
   * @param {string} refreshToken - Refresh token
   * @param {number} expirySeconds - Token expiry time in seconds
   * @returns {Promise<boolean>} Success flag
   */
  async storeRefreshToken(userId, refreshToken, expirySeconds = 604800) { // 7 days default
    try {
      const tokenId = this.hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + (expirySeconds * 1000));
      
      // Delete any existing refresh tokens for this user
      await Token.deleteMany({
        userId,
        type: 'refresh'
      });
      
      // Store the new refresh token
      await this.create({
        tokenId,
        type: 'refresh',
        userId,
        value: refreshToken,
        expiresAt
      });
      
      logger.debug(`Refresh token stored in MongoDB for user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Error storing refresh token in MongoDB: ${error.message}`);
      return false;
    }
  }

  /**
   * Get a refresh token for a user
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} Refresh token or null if not found
   */
  async getRefreshToken(userId) {
    try {
      const token = await this.findOne({
        userId,
        type: 'refresh',
        expiresAt: { $gt: new Date() }
      });
      
      return token ? token.value : null;
    } catch (error) {
      logger.error(`Error getting refresh token from MongoDB: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete refresh token for a user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success flag
   */
  async deleteRefreshToken(userId) {
    try {
      await Token.deleteMany({
        userId,
        type: 'refresh'
      });
      
      logger.debug(`Refresh tokens deleted for user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting refresh tokens: ${error.message}`);
      return false;
    }
  }

  /**
   * Clean up expired tokens (should be handled by MongoDB TTL index, this is a backup)
   * @returns {Promise<number>} Number of tokens deleted
   */
  async cleanupExpiredTokens() {
    try {
      const result = await Token.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      logger.debug(`Cleaned up ${result.deletedCount} expired tokens`);
      return result.deletedCount;
    } catch (error) {
      logger.error(`Error cleaning up expired tokens: ${error.message}`);
      return 0;
    }
  }

  /**
   * Hash a token for storage
   * @param {string} token - Token to hash
   * @returns {string} Hashed token
   * @private
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

// Create and export singleton instance
const tokenRepository = new TokenRepository();
module.exports = tokenRepository; 