/**
 * Base Repository
 * 
 * This module provides a base repository with common operations.
 */

const { Model } = require('sequelize');
const db = require('../config/database');
const logger = require('../config/logger');

class BaseRepository {
  constructor(modelName) {
    this.modelName = modelName;
    this.model = db.models[modelName];
    
    if (!this.model) {
      throw new Error(`Model ${modelName} not found in database models`);
    }
  }

  /**
   * Find all records
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of records
   */
  async findAll(options = {}) {
    try {
      return await this.model.findAll(options);
    } catch (error) {
      logger.error(`Error finding all ${this.modelName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find a record by ID
   * @param {string|number} id - Record ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Found record
   */
  async findById(id, options = {}) {
    try {
      return await this.model.findByPk(id, options);
    } catch (error) {
      logger.error(`Error finding ${this.modelName} by ID: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find a record by criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Found record
   */
  async findOne(criteria, options = {}) {
    try {
      return await this.model.findOne({
        ...options,
        where: criteria
      });
    } catch (error) {
      logger.error(`Error finding ${this.modelName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @returns {Promise<Object>} Created record
   */
  async create(data) {
    try {
      return await this.model.create(data);
    } catch (error) {
      logger.error(`Error creating ${this.modelName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a record
   * @param {string|number} id - Record ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated record
   */
  async update(id, data) {
    try {
      const record = await this.findById(id);
      if (!record) {
        throw new Error(`${this.modelName} with ID ${id} not found`);
      }
      return await record.update(data);
    } catch (error) {
      logger.error(`Error updating ${this.modelName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a record
   * @param {string|number} id - Record ID
   * @returns {Promise<number>} Number of deleted rows
   */
  async delete(id) {
    try {
      return await this.model.destroy({
        where: { id }
      });
    } catch (error) {
      logger.error(`Error deleting ${this.modelName}: ${error.message}`);
      throw error;
    }
  }

  async count(filter = {}) {
    try {
      return await this.model.count({
        where: filter
      });
    } catch (error) {
      logger.error(`Error counting ${this.modelName} records: ${error.message}`);
      throw error;
    }
  }
}

module.exports = BaseRepository; 