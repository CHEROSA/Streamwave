const BaseRepository = require('../base.repository');
const { models } = require('../../config/database');
const logger = require('../../utils/logger');

class UserRepository extends BaseRepository {
  constructor() {
    super('User');
  }

  async findByUsername(username) {
    try {
      return await this.findOne({ username });
    } catch (error) {
      logger.error(`Error finding user by username: ${error.message}`);
      throw error;
    }
  }

  async findByEmail(email) {
    try {
      return await this.findOne({ email });
    } catch (error) {
      logger.error(`Error finding user by email: ${error.message}`);
      throw error;
    }
  }

  async findByStreamKey(streamKey) {
    try {
      return await this.findOne({ streamKey });
    } catch (error) {
      logger.error(`Error finding user by stream key: ${error.message}`);
      throw error;
    }
  }

  async updatePassword(id, hashedPassword) {
    try {
      return await this.update(id, { password: hashedPassword });
    } catch (error) {
      logger.error(`Error updating user password: ${error.message}`);
      throw error;
    }
  }

  async updateVerificationStatus(id, isVerified) {
    try {
      return await this.update(id, { isVerified });
    } catch (error) {
      logger.error(`Error updating user verification status: ${error.message}`);
      throw error;
    }
  }

  async updateStreamKey(id, streamKey) {
    try {
      return await this.update(id, { streamKey });
    } catch (error) {
      logger.error(`Error updating user stream key: ${error.message}`);
      throw error;
    }
  }
}

module.exports = UserRepository; 