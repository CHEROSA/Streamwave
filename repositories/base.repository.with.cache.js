/**
 * Base Repository With Cache
 * 
 * This extends the base repository to include caching capabilities.
 * It serves as a base class for repositories that want to implement caching.
 */
const BaseRepository = require('./base.repository');
const cacheManager = require('./cache/cache.manager');
const logger = require('../utils/logger');

/**
 * Base Repository With Cache
 * @extends BaseRepository
 */
class BaseRepositoryWithCache extends BaseRepository {
  /**
   * Create a new repository with caching
   * @param {string} entityName - Name of the entity
   * @param {Object} options - Repository options
   * @param {boolean} options.enableCache - Whether to enable caching
   * @param {number} options.defaultTTL - Default TTL for cached items in seconds
   */
  constructor(entityName, options = {}) {
    super();
    this.entityName = entityName;
    this.enableCache = options.enableCache !== false; // Default to true
    this.defaultTTL = options.defaultTTL || 3600; // Default 1 hour
  }

  /**
   * Find an entity by ID with caching
   * @param {string|number} id - Entity ID
   * @returns {Promise<Object|null>} - Entity or null if not found
   */
  async findById(id) {
    if (!this.enableCache) {
      return super.findById(id);
    }

    const cacheKey = this._getCacheKey(id);
    let entity = await cacheManager.get(cacheKey);

    if (entity) {
      logger.debug(`Cache hit for ${this.entityName}:${id}`);
      return entity;
    }

    logger.debug(`Cache miss for ${this.entityName}:${id}, fetching from database`);
    entity = await super.findById(id);

    if (entity) {
      await cacheManager.set(cacheKey, entity, { ttl: this.defaultTTL });
    }

    return entity;
  }

  /**
   * Find entities by a query
   * We don't cache queries by default as they can be too varied
   * Subclasses can implement specific query caching as needed
   * @param {Object} query - Query object
   * @param {Object} options - Query options (pagination, sorting, etc.)
   * @returns {Promise<Array>} - Array of entities
   */
  async find(query, options = {}) {
    return super.find(query, options);
  }

  /**
   * Find a single entity by a query
   * @param {Object} query - Query object
   * @returns {Promise<Object|null>} - Entity or null if not found
   */
  async findOne(query) {
    // We typically don't cache queries, but specific implementations can override this
    return super.findOne(query);
  }

  /**
   * Create a new entity
   * @param {Object} data - Entity data
   * @returns {Promise<Object>} - Created entity
   */
  async create(data) {
    const entity = await super.create(data);

    if (this.enableCache && entity) {
      const cacheKey = this._getCacheKey(entity.id);
      await cacheManager.set(cacheKey, entity, { ttl: this.defaultTTL });
      logger.debug(`Cached new ${this.entityName}:${entity.id}`);

      // Invalidate any collection caches
      await this._invalidateCollectionCaches();
    }

    return entity;
  }

  /**
   * Update an entity by ID
   * @param {string|number} id - Entity ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object|null>} - Updated entity or null if not found
   */
  async updateById(id, data) {
    const entity = await super.updateById(id, data);

    if (this.enableCache) {
      if (entity) {
        const cacheKey = this._getCacheKey(id);
        await cacheManager.set(cacheKey, entity, { ttl: this.defaultTTL });
        logger.debug(`Updated cache for ${this.entityName}:${id}`);
      }

      // Invalidate any collection caches
      await this._invalidateCollectionCaches();
    }

    return entity;
  }

  /**
   * Delete an entity by ID
   * @param {string|number} id - Entity ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  async deleteById(id) {
    const result = await super.deleteById(id);

    if (this.enableCache && result) {
      const cacheKey = this._getCacheKey(id);
      await cacheManager.delete(cacheKey);
      logger.debug(`Removed ${this.entityName}:${id} from cache`);

      // Invalidate any collection caches
      await this._invalidateCollectionCaches();
    }

    return result;
  }

  /**
   * Count entities by a query
   * @param {Object} query - Query object
   * @returns {Promise<number>} - Count of entities
   */
  async count(query) {
    return super.count(query);
  }

  /**
   * Clear all caches for this entity
   * @returns {Promise<void>}
   */
  async clearCaches() {
    if (this.enableCache) {
      await cacheManager.clearByPrefix(this.entityName);
      logger.info(`Cleared all caches for ${this.entityName}`);
    }
  }

  /**
   * Get cache key for an entity
   * @param {string|number} id - Entity ID
   * @returns {string} - Cache key
   * @private
   */
  _getCacheKey(id) {
    return cacheManager.generateKey(this.entityName, id);
  }

  /**
   * Get cache key for a collection
   * @param {string} collection - Collection name or query hash
   * @returns {string} - Cache key
   * @private
   */
  _getCollectionCacheKey(collection) {
    return cacheManager.generateKey(this.entityName, 'collection', collection);
  }

  /**
   * Invalidate collection caches
   * Override in subclasses to invalidate specific collection caches
   * @returns {Promise<void>}
   * @private
   */
  async _invalidateCollectionCaches() {
    // This is a placeholder that subclasses can override
    // By default, it will clear all collection caches
    await cacheManager.clearByPrefix(`${this.entityName}:collection`);
  }

  /**
   * Hash a query for caching
   * @param {Object} query - Query object
   * @param {Object} options - Query options
   * @returns {string} - Query hash
   * @protected
   */
  _hashQuery(query, options = {}) {
    const queryString = JSON.stringify({ query, options });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < queryString.length; i++) {
      const char = queryString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}

module.exports = BaseRepositoryWithCache; 